import { isAdminAuthenticated } from '../../_lib/admin-auth.js'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})
const clean=(v,max=500)=>String(v||'').trim().slice(0,max)

function phoneInfo(value,{legacy=false}={}){
 const raw=clean(value,60).replace(/¹/g,'1')
 const digits=raw.replace(/\D/g,'')
 if(!digits)return {phone:'',valid:false,review:false,issue:'Número vazio'}
 let candidate=''
 if(raw.trim().startsWith('+'))candidate=`+${digits}`
 else if(digits.length===10||digits.length===11)candidate=`+55${digits}`
 else if((digits.length===12||digits.length===13)&&digits.startsWith('55'))candidate=`+${digits}`
 else candidate=`+${digits}`
 const parsed=parsePhoneNumberFromString(candidate)
 if(!parsed||!parsed.isValid())return {phone:candidate,valid:false,review:true,issue:'Número inválido ou incompleto'}
 const phone=parsed.number
 // Em importações antigas, +55 seguido de DDD 55 é estruturalmente válido,
 // mas pode ter sido gerado por DDI +55 digitado no campo que pedia apenas DDD+número.
 // Sem o valor bruto original não é seguro remover um dos blocos 55 automaticamente.
 const ambiguousLegacyBrazil=legacy&&phone.startsWith('+5555')
 if(ambiguousLegacyBrazil)return {phone,valid:true,review:true,issue:'Confirmar se o segundo 55 é DDD ou DDI duplicado'}
 return {phone,valid:true,review:false,issue:''}
}
const normalizePhone=(v,opts)=>phoneInfo(v,opts).phone
const leadKeyFromPhone=phone=>`aulas:lead:legacy-phone-${String(phone||'').replace(/\D/g,'').slice(0,20)}`
async function readPrefix(kv,prefix){const out=[];let cursor;let safety=0;do{const page=await kv.list({prefix,cursor,limit:500});const values=await Promise.all(page.keys.map(k=>kv.get(k.name,'json')));out.push(...values.filter(Boolean));if(page.list_complete)break;const next=page.cursor;if(!next||next===cursor)break;cursor=next;safety++}while(safety<20);return out}
function mergeLead(a,b){const aCreated=String(a?.createdAt||'9999'),bCreated=String(b?.createdAt||'9999');const older=aCreated<=bCreated?a:b;const newer=aCreated<=bCreated?b:a;const info=phoneInfo(older.whatsapp||newer.whatsapp,{legacy:Boolean(older.legacyImport||newer.legacyImport)});return {...newer,...older,id:older.id||newer.id,name:older.name||newer.name,whatsapp:info.phone,address:older.address||newer.address||'',source:older.source||newer.source||'',modality:older.modality||newer.modality||'Online',availability:[...new Set([...(Array.isArray(older.availability)?older.availability:[]),...(Array.isArray(newer.availability)?newer.availability:[])])],legacyAvailability:older.legacyAvailability||newer.legacyAvailability||'',createdAt:older.createdAt||newer.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),whatsappValid:info.valid&&!info.review,whatsappNeedsReview:info.review,whatsappIssue:info.issue}}
async function dedupeExisting(kv){const existing=await readPrefix(kv,'aulas:lead:');const groups=new Map();for(const lead of existing){const info=phoneInfo(lead.whatsapp,{legacy:Boolean(lead.legacyImport)});if(!info.phone)continue;const arr=groups.get(info.phone)||[];arr.push(lead);groups.set(info.phone,arr)}let removed=0,groupsFixed=0;for(const [p,items] of groups){if(items.length<2)continue;groupsFixed++;items.sort((a,b)=>String(a.createdAt||'9999').localeCompare(String(b.createdAt||'9999')));let keep=items[0];for(const item of items.slice(1))keep=mergeLead(keep,item);const canonicalKey=leadKeyFromPhone(p);const canonicalId=canonicalKey.replace('aulas:lead:','');keep={...keep,id:canonicalId,whatsapp:p,updatedAt:new Date().toISOString()};await kv.put(canonicalKey,JSON.stringify(keep));for(const item of items){const key=`aulas:lead:${item.id}`;if(key!==canonicalKey){await kv.delete(key);removed++}}}return {removed,groupsFixed}}
async function auditPhones(kv){const leads=await readPrefix(kv,'aulas:lead:');let valid=0,review=0,invalid=0,updated=0;for(const lead of leads){const info=phoneInfo(lead.whatsapp,{legacy:Boolean(lead.legacyImport)});if(info.valid&&!info.review)valid++;else if(info.review)review++;else invalid++;const changed=lead.whatsapp!==info.phone||Boolean(lead.whatsappValid)!==(info.valid&&!info.review)||Boolean(lead.whatsappNeedsReview)!==info.review||String(lead.whatsappIssue||'')!==info.issue;if(changed&&lead.id){await kv.put(`aulas:lead:${lead.id}`,JSON.stringify({...lead,whatsapp:info.phone,whatsappValid:info.valid&&!info.review,whatsappNeedsReview:info.review,whatsappIssue:info.issue,updatedAt:new Date().toISOString()}));updated++}}return {valid,review,invalid,updated,total:leads.length}}

export async function onRequestPost({request,env}){
 if(!(await isAdminAuthenticated(request,env)))return json({error:'Não autorizado.'},401)
 if(!env?.FOCO_LINKS)return json({error:'Base indisponível.'},500)
 let body;try{body=await request.json()}catch{return json({error:'Dados inválidos.'},400)}
 const action=clean(body.action,40)
 const ids=Array.isArray(body.ids)?[...new Set(body.ids.map(x=>clean(x,80)).filter(Boolean))].slice(0,500):[]
 if(action==='bulkDelete'){if(!ids.length)return json({error:'Nenhum interessado selecionado.'},422);await Promise.all(ids.map(id=>env.FOCO_LINKS.delete(`aulas:lead:${id}`)));return json({ok:true,count:ids.length})}
 if(action==='bulkStatus'){const allowed=['waiting','contacted','offered','inactive'];const status=allowed.includes(body.status)?body.status:'';if(!ids.length||!status)return json({error:'Seleção ou status inválido.'},422);let count=0;await Promise.all(ids.map(async id=>{const key=`aulas:lead:${id}`;const lead=await env.FOCO_LINKS.get(key,'json');if(!lead)return;await env.FOCO_LINKS.put(key,JSON.stringify({...lead,status,updatedAt:new Date().toISOString()}));count++}));return json({ok:true,count})}
 if(action==='dedupeLeads'){const result=await dedupeExisting(env.FOCO_LINKS);return json({ok:true,...result})}
 if(action==='auditPhones'){const result=await auditPhones(env.FOCO_LINKS);return json({ok:true,...result})}
 if(action==='importLeads'){
  const incoming=Array.isArray(body.leads)?body.leads.slice(0,500):[]
  if(!incoming.length)return json({error:'Nenhum cadastro válido para importar.'},422)
  await dedupeExisting(env.FOCO_LINKS)
  const existing=await readPrefix(env.FOCO_LINKS,'aulas:lead:')
  const byPhone=new Map(existing.map(l=>{const i=phoneInfo(l.whatsapp,{legacy:Boolean(l.legacyImport)});return [i.phone,l]}).filter(([p])=>p))
  let imported=0,merged=0,skipped=0,review=0
  for(const raw of incoming){
   const info=phoneInfo(raw.whatsapp,{legacy:true});const name=clean(raw.name,120)
   if(!info.phone||!info.valid||!name){skipped++;continue}
   const whatsapp=info.phone
   if(info.review)review++
   const canonicalKey=leadKeyFromPhone(whatsapp),canonicalId=canonicalKey.replace('aulas:lead:','')
   const direct=await env.FOCO_LINKS.get(canonicalKey,'json'),previous=direct||byPhone.get(whatsapp)
   const availability=Array.isArray(raw.availability)?raw.availability.map(x=>clean(x,120)).filter(Boolean).slice(0,30):[]
   const incomingLead={id:canonicalId,status:'waiting',name,whatsapp,modality:clean(raw.modality,60)||'Online',availability,address:clean(raw.address,500),source:clean(raw.source,80),legacyAvailability:clean(raw.legacyAvailability,120),createdAt:clean(raw.createdAt,40)||new Date().toISOString(),updatedAt:new Date().toISOString(),legacyImport:true,whatsappValid:info.valid&&!info.review,whatsappNeedsReview:info.review,whatsappIssue:info.issue}
   if(previous){const updated={...mergeLead(previous,incomingLead),id:canonicalId,whatsapp};await env.FOCO_LINKS.put(canonicalKey,JSON.stringify(updated));if(previous.id&&previous.id!==canonicalId)await env.FOCO_LINKS.delete(`aulas:lead:${previous.id}`);byPhone.set(whatsapp,updated);merged++}else{await env.FOCO_LINKS.put(canonicalKey,JSON.stringify(incomingLead));byPhone.set(whatsapp,incomingLead);imported++}
  }
  return json({ok:true,imported,merged,skipped,review,total:imported+merged})
 }
 return json({error:'Ação desconhecida.'},400)
}
