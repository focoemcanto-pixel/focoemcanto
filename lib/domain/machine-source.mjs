import {ReadDenied} from './read-denied.mjs';
import {verifyService,sourceContext} from './machine-auth.mjs';
import {machineStore,authorizeMachine,machineSubject} from './machine-store.mjs';

// Origins call this BEFORE touching KV/PostgreSQL and recheck before returning.
export async function authorizeMachineSource(request,env,resource,{keySet,store:providedStore,timing}={}) {
  const measure=timing?timing.measure:(_s,fn)=>fn();
  if(request.method!=='GET'||request.headers.has('authorization')||request.headers.has('cookie'))throw new ReadDenied();
  const input=sourceContext(request,resource);
  if(input.purpose!=='executive_context'||input.tenant!=='focoemcanto'||input.principal!=='foco-brain'||input.delegated_subject!==env.FOCO_ASSISTANT_USER_ID)throw new ReadDenied();
  const start=Date.parse(input.start),end=Date.parse(input.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>367*86400000)throw new ReadDenied();
  try{new Intl.DateTimeFormat('en',{timeZone:input.timezone});}catch{throw new ReadDenied();}
  const service=await measure('access_assertion_verify',()=>verifyService(request,env,keySet));
  const store=providedStore||machineStore(env.DOMAIN_MACHINE_DB??env.DOMAIN_MACHINE_DATABASE_URL);
  try {
    const initial=await measure('hub_delegation_check',()=>authorizeMachine(store,service,input)),subject=await measure('hub_subject_check',()=>machineSubject(store,service,input));
    if(subject.id!==input.delegated_subject||subject.app_metadata?.foco_assistant_admin!==true)throw new ReadDenied();
    return {input,service,subject,close:()=>store.close(),recheck:async()=>{
      const current=await measure('hub_delegation_check',()=>authorizeMachine(store,service,input)),who=await measure('hub_subject_check',()=>machineSubject(store,service,input));
      if(current.delegation.revision!==initial.delegation.revision||who.id!==input.delegated_subject||who.app_metadata?.foco_assistant_admin!==true)throw new ReadDenied();
    }};
  } catch(e){await store.close();throw e;}
}
