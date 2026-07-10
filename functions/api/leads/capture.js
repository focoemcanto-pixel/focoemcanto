const LEADS_KEY='crm:leads'
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'}})

export async function onRequestOptions(){return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}})}

export async function onRequestPost(context){
  const {request,env}=context
  if(!env.FOCO_LINKS)return json({ok:false,message:'FOCO_LINKS não configurado.'},500)
  let body
  try{body=await request.json()}catch{return json({ok:false,message:'Payload inválido.'},400)}
  if(body.website)return json({ok:true})

  const name=String(body.name||'').trim()
  const email=String(body.email||'').trim().toLowerCase()
  const phone=normalizePhone(body.phone)
  if(!name&&!email&&!phone)return json({ok:false,message:'Informe nome, e-mail ou telefone.'},400)

  const attribution=readAttribution(request,body)
  const leads=await env.FOCO_LINKS.get(LEADS_KEY,{type:'json'})||[]
  const existingIndex=leads.findIndex(item=>(email&&String(item.email||'').toLowerCase()===email)||(phone&&normalizePhone(item.phone)===phone))
  const now=new Date().toISOString()
  const previous=existingIndex>=0?leads[existingIndex]:null
  const lead={
    id:previous?.id||crypto.randomUUID(),
    name:name||previous?.name||'',
    email:email||previous?.email||'',
    phone:phone||previous?.phone||'',
    source:attribution.source||body.source||previous?.source||'',
    medium:attribution.medium||body.medium||previous?.medium||'',
    campaign:attribution.campaign||body.campaign||previous?.campaign||'',
    content:attribution.content||body.content||previous?.content||'',
    product:attribution.product||body.product||previous?.product||'',
    linkId:attribution.linkId||body.linkId||previous?.linkId||'',
    linkSlug:attribution.slug||body.linkSlug||previous?.linkSlug||'',
    status:previous?.status==='cliente'?'cliente':String(body.status||previous?.status||'lead'),
    value:Number(previous?.value||0),
    notes:String(body.notes||previous?.notes||'').trim(),
    landingPage:String(body.landingPage||request.headers.get('Referer')||previous?.landingPage||''),
    firstCapturedAt:previous?.firstCapturedAt||now,
    createdAt:previous?.createdAt||now,
    updatedAt:now,
  }
  if(existingIndex>=0)leads.splice(existingIndex,1,lead);else leads.unshift(lead)
  await env.FOCO_LINKS.put(LEADS_KEY,JSON.stringify(leads))
  return json({ok:true,lead,created:existingIndex<0})
}

function readAttribution(request,body){
  if(body.attribution&&typeof body.attribution==='object')return body.attribution
  const cookie=request.headers.get('Cookie')||''
  const match=cookie.match(/(?:^|;\s*)foco_attribution=([^;]+)/)
  if(!match)return{}
  try{return JSON.parse(decodeURIComponent(match[1]))}catch{return{}}
}
function normalizePhone(value){return String(value||'').replace(/\D/g,'')}
