import {authorizeMachineSource} from './machine-source.mjs';
import {ReadDenied} from './read-denied.mjs';
import {sourceTiming} from './source-timing.mjs';
const clean=(v,n=120)=>String(v??'').trim().slice(0,n);
const normalize=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
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
   const records=[];let cursor;const visited=new Set();
   do{
    await timing.measure('recheck',()=>auth.recheck());
    const page=await timing.measure('kv_list',()=>env.FOCO_LINKS.list({prefix:'aulas:student:',cursor,limit:500}));
    if(!Array.isArray(page.keys)||![true,false].includes(page.list_complete)||(!page.list_complete&&!page.cursor)||records.length+page.keys.length>2000)throw new ReadDenied('SOURCE_UNAVAILABLE');
    for(const key of page.keys){if(!key.name.startsWith('aulas:student:'))throw new ReadDenied();const row=await timing.measure('kv_get',()=>env.FOCO_LINKS.get(key.name,'json'));if(row)records.push(row);}
    cursor=page.list_complete?undefined:page.cursor;
    if(cursor&&visited.has(cursor))throw new ReadDenied('SOURCE_UNAVAILABLE');if(cursor)visited.add(cursor);
   }while(cursor);
   const classes=await timing.measure('rows',()=>aulasRows(records));await timing.measure('recheck',()=>auth.recheck());
   return Response.json({classes,operation:'schedule.read',resource:'aulas',authority:'focoemcanto',coverage:{aulas:'ok'},fetched_at:new Date().toISOString(),timing:timing.snapshot()},{headers:{'cache-control':'no-store'}});
  }catch(e){return Response.json({error:e instanceof ReadDenied?e.code:'SOURCE_UNAVAILABLE',resource:'aulas',coverage:{aulas:e.code==='NOT_AUTHORIZED'?'denied':'unavailable'},complete:false},{status:e.code==='NOT_AUTHORIZED'?403:503,headers:{'cache-control':'no-store'}});}
  finally{if(auth)await auth.close();}
 };
}
export const aulasService=createAulasService();
