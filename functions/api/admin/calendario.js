import { isAdminAuthenticated } from '../../_lib/admin-auth.js'

const clean=(value,max=500)=>String(value||'').trim().slice(0,max)
const duration=value=>{const n=Number(value||60);return Number.isFinite(n)&&n>0?n:60}

async function readStudents(kv){
  const out=[]
  let cursor
  let safety=0
  do{
    const page=await kv.list({prefix:'aulas:student:',cursor,limit:500})
    const values=await Promise.all(page.keys.map(k=>kv.get(k.name,'json')))
    out.push(...values.filter(Boolean))
    if(page.list_complete)break
    const next=page.cursor
    if(!next||next===cursor)break
    cursor=next
    safety+=1
  }while(safety<10)
  return out
}

const dayMap={Segunda:'MO','Terça':'TU','Quarta':'WE','Quinta':'TH','Sexta':'FR','Sábado':'SA','Domingo':'SU'}
const esc=v=>clean(v,1000).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n')
const pad=n=>String(n).padStart(2,'0')

function nextDateForDay(day,time){
  const index={Domingo:0,Segunda:1,Terça:2,Quarta:3,Quinta:4,Sexta:5,Sábado:6}[day]
  if(index===undefined)return null
  const now=new Date()
  const diff=(index-now.getDay()+7)%7
  const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+diff)
  const [h,m]=String(time||'09:00').split(':').map(Number)
  date.setHours(h||0,m||0,0,0)
  if(date<=now)date.setDate(date.getDate()+7)
  return date
}

function localStamp(date){return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`}
function pushEvent(lines,s,day,time,index){
  const start=nextDateForDay(day,time);if(!start)return
  const end=new Date(start.getTime()+duration(s.durationMinutes)*60*1000)
  const location=s.modality==='Presencial'?[s.address,s.neighborhood,s.city].filter(Boolean).join(', '):'Online'
  lines.push('BEGIN:VEVENT',`UID:aula-${esc(s.id)}-${index}@focoemcanto.com`,`DTSTAMP:${localStamp(new Date())}`,`DTSTART:${localStamp(start)}`,`DTEND:${localStamp(end)}`,`RRULE:FREQ=WEEKLY;BYDAY=${dayMap[day]||'MO'}`,`SUMMARY:${esc(`Aula de canto - ${s.name||'Aluno'}`)}`,`DESCRIPTION:${esc(`${s.modality||'Aula'} • ${duration(s.durationMinutes)} min${s.whatsapp?` • WhatsApp: ${s.whatsapp}`:''}`)}`,`LOCATION:${esc(location)}`,'END:VEVENT')
}

export async function onRequestGet({request,env}){
  if(!(await isAdminAuthenticated(request,env)))return new Response('Não autorizado.',{status:401})
  if(!env?.FOCO_LINKS)return new Response('Base indisponível.',{status:500})
  const students=(await readStudents(env.FOCO_LINKS)).filter(s=>s&&s.status==='active'&&s.day&&s.time)
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Foco em Canto//Gestao de Aulas//PT-BR','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Foco em Canto - Aulas']
  for(const s of students){
    pushEvent(lines,s,s.day,s.time,1)
    if(Number(s.weeklyFrequency)===2&&s.secondDay&&s.secondTime)pushEvent(lines,s,s.secondDay,s.secondTime,2)
  }
  lines.push('END:VCALENDAR')
  return new Response(lines.join('\r\n'),{status:200,headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="agenda-foco-em-canto.ics"','Cache-Control':'no-store'}})
}
