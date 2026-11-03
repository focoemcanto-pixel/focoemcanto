import {createRemoteJWKSet, jwtVerify, customFetch} from 'jose';
import {ReadDenied} from './read-denied.mjs';

// Closed diagnostic vocabulary: never return messages, JWTs or claim values.
export const AUTH_REASONS=Object.freeze(['ASSERTION_MISSING','ASSERTION_FORMAT','CONFIG_INVALID','TOKEN_TYPE','HUMAN_IDENTITY','CLIENT_ID_MISMATCH','TOKEN_LIFETIME','JWT_EXPIRED','JWT_SIGNATURE','JWT_ISSUER','JWT_AUDIENCE','JWT_REQUIRED_CLAIM','JWKS_TIMEOUT','JWKS_KEY','JWT_REJECTED','KEY_FETCH_OR_RUNTIME_ERROR']);
function denied(reason,code){const error=new ReadDenied(code);error.auth_reason=reason;return error;}
function safeReason(error){
 if(AUTH_REASONS.includes(error?.auth_reason))return error.auth_reason;
 const codes={ERR_JWT_EXPIRED:'JWT_EXPIRED',ERR_JWS_SIGNATURE_VERIFICATION_FAILED:'JWT_SIGNATURE',ERR_JWKS_TIMEOUT:'JWKS_TIMEOUT',ERR_JWKS_NO_MATCHING_KEY:'JWKS_KEY'};
 if(codes[error?.code])return codes[error.code];
 if(error?.code==='ERR_JWT_CLAIM_VALIDATION_FAILED')return error.claim==='iss'?'JWT_ISSUER':error.claim==='aud'?'JWT_AUDIENCE':'JWT_REQUIRED_CLAIM';
 return typeof error?.code==='string'&&error.code.startsWith('ERR_J')?'JWT_REJECTED':'KEY_FETCH_OR_RUNTIME_ERROR';
}

// One remote key set per issuer per isolate: jose caches the keys and refetches on an unknown kid,
// so a warm isolate verifies without fetching the certs again. Verification itself is unchanged.
const KEY_SETS=new Map();
function issuerKeys(issuer){
  if(!KEY_SETS.has(issuer))KEY_SETS.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'), {
    timeoutDuration:5000, // Workers supports manual, not error. jose rejects every non-200 JWKS response.
    [customFetch]:(url,options)=>fetch(url,{...options,redirect:'manual'})
  }));
  return KEY_SETS.get(issuer);
}

// Cloudflare Access issues and signs these tokens. FOCO never issues an auth token.
export async function verifyService(request, env, keySet) {
  const token=request.headers.get('cf-access-jwt-assertion');
  if (!token)throw denied('ASSERTION_MISSING');
  if (token.length>16384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw denied('ASSERTION_FORMAT');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.DOMAIN_ACCESS_ISSUER||'') ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(env.DOMAIN_ACCESS_AUDIENCE||'')) throw denied('CONFIG_INVALID','SOURCE_UNAVAILABLE');
  try {
    const keys=keySet||issuerKeys(env.DOMAIN_ACCESS_ISSUER);
    const {payload}=await jwtVerify(token,keys,{issuer:env.DOMAIN_ACCESS_ISSUER,audience:env.DOMAIN_ACCESS_AUDIENCE,
      algorithms:['RS256'],requiredClaims:['exp','iat','sub','common_name','type'],maxTokenAge:'5 minutes',clockTolerance:0});
    if(payload.type!=='app')throw denied('TOKEN_TYPE');
    if(payload.sub!==''||payload.email!==undefined)throw denied('HUMAN_IDENTITY');
    if(typeof payload.common_name!=='string'||!payload.common_name.endsWith('.access')||payload.common_name.length>200||
       !env.DOMAIN_ACCESS_CLIENT_ID||payload.common_name!==env.DOMAIN_ACCESS_CLIENT_ID)throw denied('CLIENT_ID_MISMATCH');
    // Access's configured 5m session emits a verified 301s NumericDate span.
    // Allow only this 1s issuance boundary difference; maxTokenAge remains 300s
    // and clockTolerance remains zero (no extension of exp or freshness).
    if(payload.exp-payload.iat>301){
      const error=denied('TOKEN_LIFETIME');
      error.safe_timing={lifetime_seconds:payload.exp-payload.iat,age_seconds:Math.floor(Date.now()/1000)-payload.iat};
      throw error;
    }
    return Object.freeze({issuer:payload.iss,client_id:payload.common_name,kind:'SERVICE',token});
  } catch(error) {
    const safe=denied(safeReason(error));
    if(error.auth_reason==='TOKEN_LIFETIME'&&error.safe_timing)safe.safe_timing=error.safe_timing;
    throw safe;
  }
}

export function validateMachineContext(input, resource) {
  const sources=['assistente','aulas','harmonics'];
  for(const key of ['tenant','principal','delegation_id','delegated_subject','purpose'])
    if(typeof input[key]!=='string'||!input[key]||input[key].length>200) throw new ReadDenied();
  if(input.provider!=='assistant'||input.operation!=='schedule.read'||!Array.isArray(input.resources)||
     input.resources.length<1||input.resources.length>3||new Set(input.resources).size!==input.resources.length||
     input.resources.some(x=>!sources.includes(x))||resource&&!input.resources.includes(resource)) throw new ReadDenied();
  return input;
}

export function sourceContext(request, resource) {
  const value=request.headers.get('x-foco-delegation-context');
  if(!value||value.length>8192) throw new ReadDenied();
  try{return validateMachineContext(JSON.parse(decodeURIComponent(value)),resource);}catch{throw new ReadDenied();}
}
