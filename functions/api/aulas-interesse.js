function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
function clean(value, max = 500) { return String(value || '').trim().slice(0, max) }
function normalizePhone(value) {
  const raw = clean(value, 30), digits = raw.replace(/\D/g, '')
  if (!digits || digits.length < 8 || digits.length > 15) return ''
  return `+${digits}`
}
const norm=v=>clean(v,120).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
function slotScore(lead,slot){
  if(!slot || slot.status!=='available' || slot.studentId) return 0
  const lm=norm(lead.modality), sm=norm(slot.modality)
  if(lm && sm && !lm.includes(sm) && !sm.includes(lm) && !lm.includes('amb') && !lm.includes('qualquer')) return 0
  const day=norm(slot.day),time=clean(slot.time,10),hour=Number(time.split(':')[0]||0)
  let best=0
  for(const raw of lead.availability||[]){
    const a=norm(raw)
    if(day && !a.includes(day)) continue
    if(time && a.includes(time)) best=Math.max(best,100)
    if(/qualquer|todo horario|todos os horarios/.test(a)) best=Math.max(best,94)
    const period=hour<12?'manha':hour<18?'tarde':'noite'
    if(a.includes(period)) best=Math.max(best,82)
    if(lead.flexible) best=Math.max(best,66)
  }
  if(!best && lead.flexible) best=55
  if(/imediat|agora|assim que/.test(norm(lead.startIntent))) best+=4
  return Math.min(best,100)
}
async function readPrefix(kv,prefix){
 const out=[];let cursor
 do{const page=await kv.list({prefix,cursor,limit:500});const values=await Promise.all(page.keys.map(k=>kv.get(k.name,'json')));out.push(...values.filter(Boolean));cursor=page.list_complete?undefined:page.cursor}while(cursor)
 return out
}
async function emitAssistantEvent(env,lead){
 const endpoint=clean(env.ASSISTANT_ECOSYSTEM_URL,300)||'https://assistente.focoemcanto.com/api/ecosystem/event'
 const secret=clean(env.ASSISTANT_ECOSYSTEM_SECRET,500),userId=clean(env.FOCO_ASSISTANT_USER_ID,100)
 if(!secret||!userId){console.warn('assistant_ecosystem_not_configured');return}
 try{
  const slots=await readPrefix(env.FOCO_LINKS,'aulas:slot:')
  const matches=slots.map(slot=>({slot,score:slotScore(lead,slot)})).filter(x=>x.score>=66).sort((a,b)=>b.score-a.score)
  const best=matches[0]
  const first=clean(lead.name,120).split(/\s+/)[0]||'Novo interessado'
  const body=best
   ? `${first} se cadastrou para aulas e combina com a vaga de ${best.slot.day} às ${best.slot.time} (${best.slot.modality||lead.modality}).`
   : `${first} entrou agora na lista de interesse para aulas ${lead.modality?lead.modality.toLowerCase():''}.`
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-assistant-secret':secret},body:JSON.stringify({
   source:'focoemcanto-school',externalId:lead.id,eventType:best?'school_lead_match':'school_lead_new',userId,
   title:best?'Novo interessado com encaixe':'Novo interessado nas aulas',body,url:'/',
   metadata:{leadId:lead.id,name:lead.name,whatsapp:lead.whatsapp,modality:lead.modality,availability:lead.availability,flexible:lead.flexible,startIntent:lead.startIntent,goal:lead.goal,bestMatch:best?{slotId:best.slot.id,day:best.slot.day,time:best.slot.time,endTime:best.slot.endTime,modality:best.slot.modality,score:best.score}:null}
  })})
  if(!response.ok)console.error('assistant_ecosystem_event_failed',response.status,await response.text())
 }catch(error){console.error('assistant_ecosystem_event_error',error?.message||String(error))}
}
export async function onRequestPost({ request, env, context }) {
  if (!env?.FOCO_LINKS) return json({ error: 'Base de dados indisponível.' }, 500)
  let body
  try { body = await request.json() } catch { return json({ error: 'Dados inválidos.' }, 400) }
  const name = clean(body.name, 120), whatsapp = normalizePhone(body.whatsapp), whatsappCountry = clean(body.whatsappCountry, 4).toUpperCase(), modality = clean(body.modality, 60)
  let availability = []
  try { availability = JSON.parse(body.availability || '[]') } catch {}
  availability = Array.isArray(availability) ? availability.map(item => clean(item, 60)).filter(Boolean).slice(0, 30) : []
  if (!name || !whatsapp || !modality || !availability.length || body.acceptedTerms !== 'sim') return json({ error: 'Confira os campos obrigatórios, especialmente o WhatsApp, e confirme as condições.' }, 422)
  const now = new Date().toISOString(), id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const lead = {id,createdAt:now,updatedAt:now,status:'waiting',name,whatsapp,whatsappCountry,instagram:clean(body.instagram,120),source:clean(body.source,80),modality,neighborhood:clean(body.neighborhood,120),city:clean(body.city,120),availability,flexible:body.flexible==='sim',level:clean(body.level,80),startIntent:clean(body.startIntent,100),goal:clean(body.goal,120),experience:clean(body.experience,1000)}
  await env.FOCO_LINKS.put(`aulas:lead:${id}`, JSON.stringify(lead))
  if(context?.waitUntil)context.waitUntil(emitAssistantEvent(env,lead));else void emitAssistantEvent(env,lead)
  return json({ ok: true, id }, 201)
}
