import { isAdminAuthenticated } from '../../_lib/admin-auth.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}
const clean = (value, max = 500) => String(value || '').trim().slice(0, max)
const phone = value => { const raw=clean(value,30); const digits=raw.replace(/\D/g,''); return raw.startsWith('+')&&digits?`+${digits}`:digits }
const toMin = value => { const [h,m] = clean(value,10).split(':').map(Number); return Number.isFinite(h)&&Number.isFinite(m) ? h*60+m : 0 }
const addMinutes = (time, n = 60) => { const total = toMin(time) + n; return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}` }
const durationFrom = (start, end, fallback = 60) => { const d = toMin(end)-toMin(start); return d > 0 ? d : fallback }
const overlaps = (aStart,aEnd,bStart,bEnd) => toMin(aStart) < toMin(bEnd) && toMin(aEnd) > toMin(bStart)

async function readPrefix(kv, prefix) {
  const out=[]; let cursor
  do { const page=await kv.list({prefix,cursor,limit:1000}); cursor=page.list_complete?undefined:page.cursor; const values=await Promise.all(page.keys.map(key=>kv.get(key.name,'json'))); out.push(...values.filter(Boolean)) } while(cursor)
  return out
}
function normalizeStudent(raw={}) {
  const time=clean(raw.time,10)
  const fallbackDuration=Number(raw.durationMinutes||60)>0?Number(raw.durationMinutes||60):60
  const endTime=clean(raw.endTime,10)||(time?addMinutes(time,fallbackDuration):'')
  const durationMinutes=durationFrom(time,endTime,fallbackDuration)
  return {...raw,id:clean(raw.id,80),name:clean(raw.name,120)||'Aluno sem nome',whatsapp:phone(raw.whatsapp),email:clean(raw.email,160),modality:clean(raw.modality||'Online',30),address:clean(raw.address,300),neighborhood:clean(raw.neighborhood,120),city:clean(raw.city||'Salvador',120),day:clean(raw.day,20),dayOrder:Number(raw.dayOrder||9),time,endTime,durationMinutes,monthlyValue:clean(raw.monthlyValue,30),paymentDay:clean(raw.paymentDay,10),notes:clean(raw.notes,1000),color:clean(raw.color,20)||'#7427b9',status:raw.status==='inactive'?'inactive':'active'}
}

export async function onRequestGet({request,env}) {
  if (!(await isAdminAuthenticated(request,env))) return json({error:'Não autorizado.'},401)
  if (!env?.FOCO_LINKS) return json({error:'Base indisponível.'},500)
  const students=(await readPrefix(env.FOCO_LINKS,'aulas:student:')).map(normalizeStudent)
  students.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
  return json({students})
}

export async function onRequestPost({request,env}) {
  if (!(await isAdminAuthenticated(request,env))) return json({error:'Não autorizado.'},401)
  if (!env?.FOCO_LINKS) return json({error:'Base indisponível.'},500)
  let body; try { body=await request.json() } catch { return json({error:'Dados inválidos.'},400) }
  const action=clean(body.action,40)

  if (action==='save') {
    const input=body.student||{}
    const id=clean(input.id||`${Date.now()}-${crypto.randomUUID().slice(0,8)}`,80)
    const previous=await env.FOCO_LINKS.get(`aulas:student:${id}`,'json')
    const student=normalizeStudent({...input,id,createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()})
    if (!clean(input.name,120)||!student.day||!student.time||!student.endTime) return json({error:'Nome, dia, início e término são obrigatórios.'},422)
    if (toMin(student.endTime)<=toMin(student.time)) return json({error:'O término precisa ser depois do início.'},422)

    const rawStudents=await readPrefix(env.FOCO_LINKS,'aulas:student:')
    const conflict=rawStudents.map(normalizeStudent).find(other=>other.id!==id&&other.status==='active'&&other.day===student.day&&overlaps(student.time,student.endTime,other.time,other.endTime))
    if (conflict) return json({error:`Conflito de horário com ${conflict.name}: ${conflict.time}–${conflict.endTime}.`},409)

    await env.FOCO_LINKS.put(`aulas:student:${id}`,JSON.stringify(student))
    const slots=await readPrefix(env.FOCO_LINKS,'aulas:slot:')
    for (const slot of slots.filter(slot=>slot.studentId===id||slot.blockedByStudentId===id)) {
      await env.FOCO_LINKS.put(`aulas:slot:${slot.id}`,JSON.stringify({...slot,status:'available',studentId:'',studentName:'',studentWhatsapp:'',blockedByStudentId:'',blockedByStudentName:'',updatedAt:new Date().toISOString()}))
    }

    if (student.status==='active') {
      for (const slot of slots) {
        const slotStart=clean(slot.time,10)
        if (!slot.id||slot.day!==student.day||slot.studentId||slotStart===student.time) continue
        if (toMin(slotStart)>=toMin(student.time)&&toMin(slotStart)<toMin(student.endTime)) {
          await env.FOCO_LINKS.put(`aulas:slot:${slot.id}`,JSON.stringify({...slot,status:'blocked',blockedByStudentId:id,blockedByStudentName:student.name,updatedAt:new Date().toISOString()}))
        }
      }
      const target=slots.find(slot=>slot.day===student.day&&slot.time===student.time&&slot.modality===student.modality&&(!slot.studentId||slot.studentId===id))
      const slotId=target?.id||`${Date.now()}-${crypto.randomUUID().slice(0,7)}`
      const slot={...(target||{}),id:slotId,day:student.day,dayOrder:student.dayOrder,time:student.time,endTime:student.endTime,durationMinutes:student.durationMinutes,modality:student.modality,status:'occupied',studentId:id,studentName:student.name,studentWhatsapp:student.whatsapp,blockedByStudentId:'',blockedByStudentName:'',updatedAt:new Date().toISOString()}
      await env.FOCO_LINKS.put(`aulas:slot:${slotId}`,JSON.stringify(slot))
    }
    return json({ok:true,student})
  }

  if (action==='release') {
    const id=clean(body.id,80); const key=`aulas:student:${id}`; const student=await env.FOCO_LINKS.get(key,'json')
    if (!student) return json({error:'Aluno não encontrado.'},404)
    const updated={...normalizeStudent(student),status:'inactive',updatedAt:new Date().toISOString()}
    await env.FOCO_LINKS.put(key,JSON.stringify(updated))
    const slots=await readPrefix(env.FOCO_LINKS,'aulas:slot:')
    for (const slot of slots.filter(item=>item.studentId===id||item.blockedByStudentId===id)) {
      await env.FOCO_LINKS.put(`aulas:slot:${slot.id}`,JSON.stringify({...slot,status:'available',studentId:'',studentName:'',studentWhatsapp:'',blockedByStudentId:'',blockedByStudentName:'',updatedAt:new Date().toISOString()}))
    }
    return json({ok:true,student:updated})
  }
  return json({error:'Ação desconhecida.'},400)
}
