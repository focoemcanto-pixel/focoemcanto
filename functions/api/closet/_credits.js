const SUPABASE_URL_KEYS=['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_SERVICE_KEYS=['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SERVICE_KEY']

function envFirst(env,keys){for(const k of keys){if(env?.[k])return String(env[k]).replace(/\/$/,'')}return ''}
function bearer(request){const h=request.headers.get('Authorization')||'';return h.match(/^Bearer\s+(.+)$/i)?.[1]||''}
async function read(r){const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw new Error(data?.message||data?.error_description||data?.error||`Supabase ${r.status}`);return data}

export const AI_COSTS={scan:1,catalogize:1,'try-on':3}

export async function authenticatedUser(request,env){
 const token=bearer(request);if(!token)throw Object.assign(new Error('Entre na sua conta para usar o Closet AI.'),{status:401,code:'auth_required'})
 const url=envFirst(env,SUPABASE_URL_KEYS),anon=String(env.SUPABASE_ANON_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'');if(!url||!anon)throw new Error('Supabase do Closet AI não configurado.')
 const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${token}`}});if(!r.ok)throw Object.assign(new Error('Sua sessão expirou. Entre novamente.'),{status:401,code:'invalid_session'});return await r.json()
}

async function rpc(env,name,args){
 const url=envFirst(env,SUPABASE_URL_KEYS),key=envFirst(env,SUPABASE_SERVICE_KEYS);if(!url||!key)throw new Error('Backend financeiro do Closet AI não configurado.')
 return read(await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args)}))
}

export async function chargeAi(request,env,route){
 const user=await authenticatedUser(request,env),cost=AI_COSTS[route];if(!cost)throw new Error('Operação de IA desconhecida.')
 const ref=`ai:${route}:${crypto.randomUUID()}`
 try{const balance=await rpc(env,'closet_spend_ai_credits',{p_user_id:user.id,p_amount:cost,p_operation:route,p_external_reference:ref,p_metadata:{route}});return {user,cost,ref,balance:Number(balance)}}catch(error){const msg=String(error?.message||'');if(/insufficient_ai_credits/i.test(msg))throw Object.assign(new Error('Você não tem créditos suficientes para este recurso.'),{status:402,code:'insufficient_ai_credits',cost});throw error}
}

export async function refundAi(env,charge,reason='provider_failure'){
 if(!charge?.user?.id||!charge?.cost)return
 try{await rpc(env,'closet_grant_ai_credits',{p_user_id:charge.user.id,p_amount:charge.cost,p_kind:'refund',p_operation:`refund:${charge.ref}`,p_partner_id:null,p_campaign_id:null,p_external_reference:`refund:${charge.ref}`,p_metadata:{reason,original_reference:charge.ref}})}catch(error){console.error('[closet-ai] refund_failed',charge.ref,error)}
}

export function creditHeaders(charge){return {'X-Closet-AI-Cost':String(charge.cost),'X-Closet-AI-Balance':String(charge.balance)}}
