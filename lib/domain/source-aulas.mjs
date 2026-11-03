import {authorizeMachineSource} from './machine-source.mjs';
import {ReadDenied} from './read-denied.mjs';
import {sourceTiming} from './source-timing.mjs';
import {composeSchedule,dayAt} from './assistente-schedule.mjs';
export const EFFECTIVE_VIEW='effective-v1';
const LIMIT=2000;
const bounded=rows=>{if(rows.length>LIMIT)throw new ReadDenied('SOURCE_UNAVAILABLE');return rows;};
// The Owner's own adjustments to Aulas, kept by the Assistente under the same delegation: per-date overrides
// (cancel / done / reschedule) and recurring changes; plus the Assistente's own events of the period when the
// request also names the 'assistente' resource. Same queries as the Assistente's composition, Aulas only.
export async function readAdjustments(read,input){
 return read(async sql=>{
  const user=input.delegated_subject;
  const overrides=sql`select event_key,status,new_date::text as new_date,new_start::text as new_start,new_end::text as new_end from public.assistant_event_overrides where user_id=${user}::uuid and split_part(event_key,':',1)='aulas' limit ${LIMIT+1}`.execute();
  const routines=sql`select source,external_id,weekday,start_time::text as start_time,end_time::text as end_time,active from public.assistant_recurring_overrides where user_id=${user}::uuid and active=true and source='aulas' limit ${LIMIT+1}`.execute();
  const stored=input.resources.includes('assistente')
   ?sql`select id,title,starts_at,ends_at,source,external_id from public.assistant_calendar_events where user_id=${user}::uuid and source='assistente' and starts_at<${input.end} and ends_at>${input.start} order by starts_at limit ${LIMIT+1}`.execute()
   :Promise.resolve([]);
  for(const q of [overrides,routines,stored])q.catch?.(()=>{});
  return {overrides:bounded(await overrides),routines:bounded(await routines),stored:bounded(await stored)};
 });
}
// Effective schedule of the requested period: the Assistente's own composer (verbatim copy, see the drift test)
// applied to the Aulas base. Precedence is the composer's: per-date override > recurring change > base.
export function effectiveView(classes,adjustments,input,now=new Date()){
 const startDay=dayAt(new Date(input.start),'America/Bahia'),endDay=dayAt(new Date(input.end),'America/Bahia');
 const inPeriod=e=>e.date>=startDay&&e.date<endDay;
 const options={now,clockTimezone:'America/Bahia'};
 const effective=composeSchedule({classes,stored:adjustments.stored,overrides:adjustments.overrides,routines:adjustments.routines},options);
 const base=composeSchedule({classes,routines:adjustments.routines},options);
 const keys=new Map(effective.map(e=>[e.eventKey,e]));
 const status=new Map(adjustments.overrides.map(o=>[o.event_key,o.status]));
 const pick=e=>({date:e.date,start:e.start,end:e.end,source:e.source,title:String(e.title).slice(0,160),rescheduled:Boolean(e.rescheduled),
  ...(e.rescheduled?{original_date:e.originalDate,original_start:e.originalStart}:{})});
 return {period:{start_date:startDay,end_exclusive:endDay},
  events:effective.filter(inPeriod).map(pick),
  cancelled:base.filter(e=>inPeriod(e)&&!keys.has(e.eventKey)&&['cancelled','done'].includes(status.get(e.eventKey))).map(e=>({...pick(e),status:status.get(e.eventKey)})),
  moved_out:base.filter(e=>inPeriod(e)&&keys.has(e.eventKey)&&!inPeriod(keys.get(e.eventKey))).map(e=>({...pick(e),new_date:keys.get(e.eventKey).date,new_start:keys.get(e.eventKey).start})),
  counts:{overrides:adjustments.overrides.length,recurring_changes:adjustments.routines.length,own_events:adjustments.stored.length},
  coverage:{aulas:'ok',overrides:'ok',own_events:input.resources.includes('assistente')?'ok':'not_requested'}};
}
const clean=(v,n=120)=>String(v??'').trim().slice(0,n);
const normalize=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const KV_PARALLEL=50; // bounded concurrent KV reads per batch (same keys, same order)
const days=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
const time=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const end=(start,duration)=>{const [h,m]=start.split(':').map(Number),n=h*60+m+duration;return `${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
// Same KV authority and recurrence shape, with an explicit schedule-only projection.
export function aulasRows(students){
 const out=[];
 for(const s of students){
  if(['inactive','cancelled','canceled'].includes(s.status))continue;
  if(!clean(s.id,80))throw new ReadDenied('SOURCE_UNAVAILABLE');
  const minutes=Number(s.durationMinutes??60);
  if(!Number.isInteger(minutes)||minutes<=0||minutes>1440)throw new ReadDenied('SOURCE_UNAVAILABLE');
  const slots=[[1,s.day,s.time,s.endTime]];
  if(Number(s.weeklyFrequency)===2)slots.push([2,s.secondDay,s.secondTime,null]);
  for(const [occurrence,day,start,finish] of slots){
   if(!days.includes(normalize(day))||!start||!time(start)||(finish&&!time(finish)))throw new ReadDenied('SOURCE_UNAVAILABLE');
   out.push({id:clean(s.id,80),name:clean(s.name)||'Aula',occurrence,day:clean(day,20),time:start,
    endTime:finish||end(start,minutes),durationMinutes:minutes,timezone:'America/Bahia',status:'active'});
  }
 }
 if(out.length>2000)throw new ReadDenied('SOURCE_UNAVAILABLE');return out;
}
export function createAulasService({authorize=authorizeMachineSource}={}){
 return async(request,env)=>{
  let auth;const timing=sourceTiming();
  try{
   auth=await timing.measure('authorization',()=>authorize(request,env,'aulas',{timing}));
   if(!env.FOCO_LINKS)throw new ReadDenied('SOURCE_UNAVAILABLE');
   const effective=request.headers.get('x-foco-aulas-view')===EFFECTIVE_VIEW;
   // Adjustments are read from the Hub while KV is listed; both are awaited before anything is returned.
   const adjustments=effective?timing.measure('hub_adjustments',()=>readAdjustments(auth.read,auth.input)):null;adjustments?.catch(()=>{});
   const records=[];let cursor;const visited=new Set();
   do{
    // The first page follows the authorization just made; later pages recheck the live delegation first.
    if(cursor)await timing.measure('recheck',()=>auth.recheck());
    const page=await timing.measure('kv_list',()=>env.FOCO_LINKS.list({prefix:'aulas:student:',cursor,limit:500}));
    if(!Array.isArray(page.keys)||![true,false].includes(page.list_complete)||(!page.list_complete&&!page.cursor)||records.length+page.keys.length>2000)throw new ReadDenied('SOURCE_UNAVAILABLE');
    if(page.keys.some(key=>!key.name.startsWith('aulas:student:')))throw new ReadDenied();
    for(let i=0;i<page.keys.length;i+=KV_PARALLEL){
     const rows=await timing.measure('kv_get_batch',()=>Promise.all(page.keys.slice(i,i+KV_PARALLEL).map(key=>env.FOCO_LINKS.get(key.name,'json'))));
     for(const row of rows)if(row)records.push(row);
    }
    cursor=page.list_complete?undefined:page.cursor;
    if(cursor&&visited.has(cursor))throw new ReadDenied('SOURCE_UNAVAILABLE');if(cursor)visited.add(cursor);
   }while(cursor);
   const classes=await timing.measure('rows',()=>aulasRows(records));
   const view=effective?await timing.measure('compose',async()=>effectiveView(classes,await adjustments,auth.input)):undefined;
   await timing.measure('recheck',()=>auth.recheck());
   return Response.json({classes,...(view?{effective:view}:{}),operation:'schedule.read',resource:'aulas',authority:'focoemcanto',coverage:{aulas:'ok'},fetched_at:new Date().toISOString(),timing:timing.snapshot()},{headers:{'cache-control':'no-store'}});
  }catch(e){return Response.json({error:e instanceof ReadDenied?e.code:'SOURCE_UNAVAILABLE',resource:'aulas',coverage:{aulas:e.code==='NOT_AUTHORIZED'?'denied':'unavailable'},complete:false},{status:e.code==='NOT_AUTHORIZED'?403:503,headers:{'cache-control':'no-store'}});}
  finally{if(auth)await auth.close();}
 };
}
export const aulasService=createAulasService();
