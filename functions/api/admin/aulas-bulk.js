import { isAdminAuthenticated } from '../../_lib/admin-auth.js'

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})
const clean=(v,max=500)=>String(v||'').trim().slice(0,max)
const normalizePhone=v=>{const raw=clean(v,40);const d=raw.replace(/\D/g,'');if(!d||d.length<10||d.length>15)return '';if(raw.startsWith('+'))return `+${d}`;if(d.length===13&&d.startsWith('55'))return `+${d}`;if(d.length===11&&d[2]==='9')return `+55${d}`;if(d.length===10&&d.startsWith('804'))return `+1${d}`;return ''}
const leadKeyFromPhone=phone=>`aulas:lead:legacy-phone-${phone.replace(/\D/g,'').slice(0,20)}`
async function readPrefix(kv,prefix){const out=[];let cursor;let safety=0;do{const page=await kv.list({prefix,cursor,limit:500});const values=await Promise.all(page.keys.map(k=>kv.get(k.name,'json')));out.push(...values.filter(Boolean));if(page.list_complete)break;const next=page.cursor;if(!next||next===cursor)break;cursor=next;safety++}while(safety<20);return out}
function mergeLead(a,b){const aCreated=String(a?.createdAt||'9999'),bCreated=String(b?.createdAt||'9999');const older=aCreated<=bCreated?a:b;const newer=aCreated<=bCreated?b:a;return {...newer,...older,id:older.id||newer.id,name:older.name||newer.name,whatsapp:normalizePhone(older.whatsapp||newer.whatsapp),address:older.address||newer.address||'',source:older.source||newer.source||'',modality:older.modality||newer.modality||'Online',availability:[...new Set([...(Array.isArray(older.availability)?older.availability:[]),...(Array.isArray(newer.availability)?newer.availability:[])])],legacyAvailability:older.legacyAvailability||newer.legacyAvailability||'',createdAt:older.createdAt||newer.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}}
async function dedupeExisting(kv){const existing=await readPrefix(kv,'aulas:lead:');const groups=new Map();for(const lead of existing){const p=normalizePhone(lead.whatsapp);if(!p)continue;const arr=groups.get(p)||[];arr.push(lead);groups.set(p,arr)}let removed=0,groupsFixed=0;for(const [p,items] of groups){if(items.length<2)continue;groupsFixed++;items.sort((a,b)=>String(a.createdAt||'9999').localeCompare(String(b.createdAt||'9999')));let keep=items[0];for(const item of items.slice(1))keep=mergeLead(keep,item);const canonicalKey=leadKeyFromPhone(p);const canonicalId=canonicalKey.replace('aulas:lead:','');keep={...keep,id:canonicalId,whatsapp:p,updatedAt:new Date().toISOString()};await kv.put(canonicalKey,JSON.stringify(keep));for(const item of items){const key=`aulas:lead:${item.id}`;if(key!==canonicalKey){await kv.delete(key);removed++}}}return {removed,groupsFixed}}

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
 if(action==='dedupeLeads'){
  const result=await dedupeExisting(env.FOCO_LINKS)
  return json({ok:true,...result})
 }
 if(action==='importLeads'){
  const incoming=Array.isArray(body.leads)?body.leads.slice(0,500):[]
  if(!incoming.length)return json({error:'Nenhum cadastro válido para importar.'},422)
  await dedupeExisting(env.FOCO_LINKS)
  const existing=await readPrefix(env.FOCO_LINKS,'aulas:lead:')
  const byPhone=new Map(existing.map(l=>[normalizePhone(l.whatsapp),l]).filter(([p])=>p))
  let imported=0,merged=0,skipped=0
  for(const raw of incoming){
   const whatsapp=normalizePhone(raw.whatsapp);const name=clean(raw.name,120)
   if(!whatsapp||!name){skipped++;continue}
   const canonicalKey=leadKeyFromPhone(whatsapp)
   const canonicalId=canonicalKey.replace('aulas:lead:','')
   const direct=await env.FOCO_LINKS.get(canonicalKey,'json')
   const previous=direct||byPhone.get(whatsapp)
   const availability=Array.isArray(raw.availability)?raw.availability.map(x=>clean(x,120)).filter(Boolean).slice(0,30):[]
   const incomingLead={id:canonicalId,status:'waiting',name,whatsapp,modality:clean(raw.modality,60)||'Online',availability,address:clean(raw.address,500),source:clean(raw.source,80),legacyAvailability:clean(raw.legacyAvailability,120),createdAt:clean(raw.createdAt,40)||new Date().toISOString(),updatedAt:new Date().toISOString(),legacyImport:true}
   if(previous){
    const updated={...mergeLead(previous,incomingLead),id:canonicalId,whatsapp}
    await env.FOCO_LINKS.put(canonicalKey,JSON.stringify(updated))
    if(previous.id&&previous.id!==canonicalId)await env.FOCO_LINKS.delete(`aulas:lead:${previous.id}`)
    byPhone.set(whatsapp,updated);merged++
   }else{
    await env.FOCO_LINKS.put(canonicalKey,JSON.stringify(incomingLead));byPhone.set(whatsapp,incomingLead);imported++
   }
  }
  return json({ok:true,imported,merged,skipped,total:imported+merged})
 }
 return json({error:'Ação desconhecida.'},400)
}
