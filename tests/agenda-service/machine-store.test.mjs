import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeMachineAndSubject} from '../../lib/domain/machine-store.mjs';
const input={tenant:'focoemcanto',principal:'foco-brain',delegation_id:'mid:lease:a',delegated_subject:'owner',provider:'assistant',purpose:'executive_context',operation:'schedule.read',resources:['aulas']};
const delegation={binding_id:'b',machine_kind:'SERVICE',binding_active:true,tenant:'focoemcanto',principal:'foco-brain',delegated_subject:'owner',provider:'assistant',
 purpose:'executive_context',status:'active',expires_at:new Date(Date.now()+60000).toISOString(),capability_scopes:['schedule.read'],resource_scopes:['assistente','aulas','harmonics'],revision:1};
function store({role={name:'foco_domain_runtime',rolsuper:false,rolbypassrls:false},row=delegation,subject={id:'owner'}}={}){
 const seen={transactions:0,statements:[]};
 const tx=(strings)=>{const text=strings.join('?');seen.statements.push(text);
  if(text.includes('pg_roles'))return Promise.resolve(role?[role]:[]);
  if(text.includes('domain_delegations'))return Promise.resolve(row?[row]:[]);
  if(text.includes('domain_machine_subject'))return Promise.resolve([{subject}]);throw Error('unexpected');};
 return {seen,async context(service,inp,cb){seen.transactions++;const [r]=await tx(['select current_user ... pg_roles']);
  if(r?.name!=='foco_domain_runtime'||r.rolsuper||r.rolbypassrls)throw Error('denied');return cb(tx);}};
}
test('delegation and subject are checked in one transaction',async()=>{
 const s=store();const out=await authorizeMachineAndSubject(s,{issuer:'i',client_id:'c'},input);
 assert.equal(s.seen.transactions,1);assert.equal(out.subject.id,'owner');assert.equal(out.delegation.revision,1);
});
test('every delegation check still denies',async()=>{
 for(const change of [{status:'revoked'},{expires_at:new Date(Date.now()-1).toISOString()},{resource_scopes:['assistente']},{binding_active:false},{tenant:'other'}])
  await assert.rejects(authorizeMachineAndSubject(store({row:{...delegation,...change}}),{},input));
 await assert.rejects(authorizeMachineAndSubject(store({row:null}),{},input));  // lease hidden by mandate_lifetime RLS once the mandate is revoked
 await assert.rejects(authorizeMachineAndSubject(store({subject:null}),{},input));
});
