// Shared domain composition. Network, React, auth and writes deliberately live elsewhere.
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const dayMap={domingo:0,segunda:1,terca:2,quarta:3,quinta:4,sexta:5,sabado:6};
export const addMinutes=(time,minutes)=>{const [h,m]=time.split(':').map(Number),n=h*60+m+minutes;return`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
export const dayAt=(date,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const timeAt=(date,zone)=>new Intl.DateTimeFormat('pt-BR',{timeZone:zone,hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
const plusDay=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export const keyOf=e=>e.eventKey||`${e.source}:${e.externalId||e.id}:${e.date}`;
export function composeSchedule({stored=[],classes=[],harmonics=[],overrides=[],routines=[]},{now=new Date(),clockTimezone=Intl.DateTimeFormat().resolvedOptions().timeZone,days=400}={}){
 const today=dayAt(now,clockTimezone),current=timeAt(now,clockTimezone);
 const own=stored.map(r=>({id:r.id,title:r.title,date:dayAt(new Date(r.starts_at),'America/Bahia'),start:timeAt(new Date(r.starts_at),'America/Bahia'),end:timeAt(new Date(r.ends_at),'America/Bahia'),source:r.source,location:r.location||undefined,externalId:r.external_id||undefined}));
 const lessons=[];
 for(let offset=0;offset<days;offset++){const date=plusDay(today,offset),weekday=new Date(date+'T12:00:00Z').getUTCDay();for(const item of classes){if(dayMap[norm(item.day)]!==weekday)continue;lessons.push({id:`aulas-${item.id}-${item.occurrence}-${date}`,externalId:`${item.id}-${item.occurrence}`,title:`Aula · ${item.name}`,date,start:item.time,end:item.endTime,source:'aulas',location:[item.modality,item.neighborhood].filter(Boolean).join(' · '),contactPhone:item.whatsapp})}}
 
 const band=harmonics.filter(r=>!['cancelled','canceled','removed','rejected','declined','cancelado','cancelada'].includes(String(r.status??'').toLowerCase())).map(r=>{const id=`harmonics-${r.id}`;const start=(r.event_time||'09:00').slice(0,5);return{id,externalId:r.id,title:`${r.event_type||'Evento'} · ${r.label||r.client_name||r.id}`,date:r.event_date,start,end:addMinutes(start,r.duration_min||60),source:'harmonics',location:[r.location_name,r.assignment?.role].filter(Boolean).join(' · ')}});
 const exceptional=new Map(overrides.map(o=>[o.event_key,o])),recurring=new Map(routines.filter(r=>r.active).map(r=>[r.source+':'+r.external_id,r]));
 return [...own,...lessons,...band].flatMap(initial=>{let e=initial;const routine=e.externalId?recurring.get(e.source+':'+e.externalId):undefined;
  if(routine){const weekday=new Date(e.date+'T12:00:00Z').getUTCDay();e={...e,date:plusDay(e.date,(routine.weekday-weekday+7)%7),start:routine.start_time.slice(0,5),end:(routine.end_time||addMinutes(routine.start_time.slice(0,5),60)).slice(0,5)}}
  const eventKey=keyOf(e),o=exceptional.get(eventKey);if(o?.status==='done'||o?.status==='cancelled')return[];
  const result={...e,eventKey,rescheduled:Boolean(o?.new_date||o?.new_start||o?.new_end),originalDate:e.date,originalStart:e.start,date:o?.new_date||e.date,start:o?.new_start?.slice(0,5)||e.start,end:o?.new_end?.slice(0,5)||e.end};
  if(result.date<today||(result.date===today&&result.end<=current))return[];
  // Extra provider metadata is not added to the UI's event shape.
  return[result];
 }).sort((a,b)=>`${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
}
export function scheduleProjection(events,{start,end,timezone='America/Bahia',sources,category=null,fetchedAt,sourceStatus,harmonics=[],limit=500}){
 new Intl.DateTimeFormat('en',{timeZone:timezone});const lower=Date.parse(start),upper=Date.parse(end);
 if(!Number.isFinite(lower)||!Number.isFinite(upper)||upper<=lower||upper-lower>367*86400000)throw new Error('INVALID_PERIOD');
 const band=new Map(harmonics.map(x=>[x.id,x]));const out=[];
 for(const e of events){if(!sources.includes(e.source))continue;
  const sourceType=e.source==='aulas'?'lesson':e.source==='harmonics'?(band.get(e.externalId)?.event_type||null):null;
  if(category && norm(sourceType)!==norm(category))continue;
  // Source wall-clock is the existing domain's America/Bahia clock, never runner local time.
  const a=new Date(`${e.date}T${e.start}:00-03:00`);let b=new Date(`${e.date}T${e.end}:00-03:00`);if(b<=a)b=new Date(b.getTime()+86400000);
  if(a.getTime()>=upper||b.getTime()<=lower)continue;
  out.push({id:e.eventKey,category:sourceType,title:String(e.title).slice(0,240),start:a.toISOString(),end:b.toISOString(),timezone,status:'active',source_domain:'assistant',upstream_source:e.source,source_reference:{domain:e.source,id:e.externalId||e.id},fetched_at:fetchedAt,freshness:sourceStatus[e.source]});
 }
 if(out.length>500)throw new Error('RESULT_LIMIT');return out.slice(0,limit);
}
