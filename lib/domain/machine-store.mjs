import postgres from 'postgres';
import {ReadDenied} from './read-denied.mjs';

// A deployment-owned, dedicated SQL login. Never an Auth session or a Brain credential.
// Production passes a Hyperdrive binding: Workers sockets cannot trust the Supabase CA, so the
// Hyperdrive config enforces verify-full against it. Hyperdrive pools in transaction mode and
// requires prepared statements with Postgres.js; the machine context below stays transaction-local.
export function machineStore(source, {localTest=false,observe}={}) {
  const hyperdrive=typeof source?.connectionString==='string'&&source.connectionString!=='';
  if(!hyperdrive&&(typeof source!=='string'||!source)) throw new ReadDenied('SOURCE_UNAVAILABLE');
  const debug=observe?(_id,query)=>observe(query):false;
  const sql=hyperdrive
    ?postgres(source.connectionString,{max:1,prepare:true,connect_timeout:5,idle_timeout:5,debug})
    :postgres(source,{ssl:localTest?false:'verify-full',max:1,prepare:false,connect_timeout:5,idle_timeout:5,debug});
  return {
    sql,  // strategy B (single-transaction-v1) runs its own one-transaction read on this same login
    close:()=>sql.end({timeout:1}),
    async context(service,input,callback) {
      return sql.begin(async tx=>{
        // One round trip: role attestation and both transaction-local settings (same checks as before).
        const [role]=await tx`select current_user as name,r.rolsuper,r.rolbypassrls,
          set_config('foco.machine_context',${JSON.stringify({...input,issuer:service.issuer,client_id:service.client_id})},true) as context,
          set_config('statement_timeout','5000',true) as timeout
          from pg_roles r where r.rolname=current_user`;
        if(role?.name!=='foco_domain_runtime'||role.rolsuper||role.rolbypassrls) throw new ReadDenied();
        return callback(tx);
      });
    }
  };
}

export async function authorizeMachine(store,service,input) {
  return store.context(service,input,sql=>delegationCheck(sql,input));
}

// Delegation and subject in ONE transaction of the same machine context: identical checks, half the round trips.
export async function authorizeMachineAndSubject(store,service,input) {
  return store.context(service,input,async sql=>{
    const authorized=await delegationCheck(sql,input);
    const [result]=await sql`select public.domain_machine_subject() as subject`;
    if(!result?.subject)throw new ReadDenied();
    return {...authorized,subject:result.subject};
  });
}

async function delegationCheck(sql,input) {
    const [row]=await sql`select d.*,b.id as binding_id,b.kind as machine_kind,b.active as binding_active
      from public.domain_delegations d join public.domain_machine_bindings b on b.id=d.machine_binding_id
      where d.id=${input.delegation_id}`;
    if(!row||row.machine_kind!=='SERVICE'||!row.binding_active||row.tenant!==input.tenant||row.principal!==input.principal||
       row.delegated_subject!==input.delegated_subject||row.provider!==input.provider||row.purpose!==input.purpose||
       row.status!=='active'||new Date(row.expires_at)<=new Date()||!row.capability_scopes.includes(input.operation)||
       input.resources.some(r=>!row.resource_scopes.includes(r)))throw new ReadDenied();
    // Adapter compatibility: generic composition compares an authenticated technical ID, never an email.
    return {identity:{id:row.binding_id,kind:'SERVICE'},delegation:{...row,technical_subject:row.binding_id,expires_at:new Date(row.expires_at).toISOString()}};
}

export async function machineSubject(store,service,input) {
  return store.context(service,input,async sql=>{
    const [result]=await sql`select public.domain_machine_subject() as subject`;
    if(!result?.subject)throw new ReadDenied();return result.subject;
  });
}
