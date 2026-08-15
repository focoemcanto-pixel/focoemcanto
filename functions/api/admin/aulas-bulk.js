import { isAdminAuthenticated } from '../../_lib/admin-auth.js'

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})
const clean=(v,max=500)=>String(v||'').trim().slice(0,max)
const normalizePhone=v=>{const raw=clean(v,40);const d=raw.replace(/\D/g,'');if(!d||d.length<10||d.length>15)return '';if(raw.startsWith('+'))return `+${d}`;if(d.length===13&&d.startsWith('55'))return `+${d}`;if(d.length===11&&d[2]==='9')return `+55${d}`;if(d.length===10&&d.startsWith('804'))return `+1${d}`;return ''}
async function readPrefix(kv,prefix){const out=[];let cursor;let safety=0;do{const page=await kv.list({prefix,cursor,limit:500});const values=await Promise.all(page.keys.map(k=>kv.get(k.name,'json')));out.push(...values.filter(Boolean));if(page.list_complete)break;const next=page.cursor;if(!next||next===cursor)break;cursor=next;safety++}while(safety<20);return out}

export async function onRequestPost({request,env}){
 if(!(await isAdminAuthenticated(request,env)))return json({error:'Não autorizado.'},401)
 if(!env?.FOCO_LINKS)return json({error:'Base indisponível.'},500)
 let body;try{body=await request.json()}catch{return json({error:'Dados inválidos.'},400)}
 const action=clean(body.action,40)
 const ids=Array.isArray(body.ids)?[...new Set(body.ids.map(x=>clean(x,80)).filter(Boolean))].slice(0,500):[]
 if(action==='bulkDelete'){
  if(!ids.length)return json({error:'Nenhum interessado selecionado.'},422)
  await Promise.all(ids.map(id=>env.FOCO_LINKS.delete(`aulas:lead:${id}`)))
  return json({ok:true,count:ids.length})
 }
 if(action==='bulkStatus'){
  const allowed=['waiting','contacted','offered','inactive'];const status=allowed.includes(body.status)?body.status:''
  if(!ids.length||!status)return json({error:'Seleção ou status inválido.'},422)
  let count=0
  await Promise.all(ids.map(async id=>{const key=`aulas:lead:${id}`;const lead=await env.FOCO_LINKS.get(key,'json');if(!lead)return;await env.FOCO_LINKS.put(key,JSON.stringify({...lead,status,updatedAt:new Date().toISOString()}));count++}))
  return json({ok:true,count})
 }
 if(action==='importLeads'){
  const incoming=Array.isArray(body.leads)?body.leads.slice(0,500):[]
  if(!incoming.length)return json({error:'Nenhum cadastro válido para importar.'},422)
  const existing=await readPrefix(env.FOCO_LINKS,'aulas:lead:')
  const byPhone=new Map(existing.map(l=>[normalizePhone(l.whatsapp),l]).filter(([p])=>p))
  let imported=0,merged=0,skipped=0
  for(const raw of incoming){
   const whatsapp=normalizePhone(raw.whatsapp);const name=clean(raw.name,120)
   if(!whatsapp||!name){skipped++;continue}
   const previous=byPhone.get(whatsapp)
   const availability=Array.isArray(raw.availability)?raw.availability.map(x=>clean(x,120)).filter(Boolean).slice(0,30):[]
   if(previous){
    const mergedAvailability=[...new Set([...(Array.isArray(previous.availability)?previous.availability:[]),...availability])]
    const updated={...previous,name:previous.name||name,whatsapp,address:previous.address||clean(raw.address,500),source:previous.source||clean(raw.source,80),modality:previous.modality||clean(raw.modality,60)||'Online',availability:mergedAvailability,legacyAvailability:previous.legacyAvailability||clean(raw.legacyAvailability,120),createdAt:String(previous.createdAt||raw.createdAt||new Date().toISOString())<String(raw.createdAt||'9999')?previous.createdAt:raw.createdAt,updatedAt:new Date().toISOString()}
    await env.FOCO_LINKS.put(`aulas:lead:${previous.id}`,JSON.stringify(updated));byPhone.set(whatsapp,updated);merged++
   }else{
    const id=`legacy-${crypto.randomUUID().slice(0,12)}`;const lead={id,status:'waiting',name,whatsapp,modality:clean(raw.modality,60)||'Online',availability,address:clean(raw.address,500),source:clean(raw.source,80),legacyAvailability:clean(raw.legacyAvailability,120),createdAt:clean(raw.createdAt,40)||new Date().toISOString(),updatedAt:new Date().toISOString(),legacyImport:true}
    await env.FOCO_LINKS.put(`aulas:lead:${id}`,JSON.stringify(lead));byPhone.set(whatsapp,lead);imported++
   }
  }
  return json({ok:true,imported,merged,skipped,total:imported+merged})
 }
 return json({error:'Ação desconhecida.'},400)
}
