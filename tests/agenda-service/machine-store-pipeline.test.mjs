import test from 'node:test';
import assert from 'node:assert/strict';
import {machineStore} from '../../lib/domain/machine-store.mjs';
// Real PostgreSQL (set MACHINE_STORE_PG_URL_RUNTIME / _SUPERUSER to a disposable cluster). Pipelining must not change
// semantics: the settings precede the callback, and a failed role attestation commits nothing.
const runtime=process.env.MACHINE_STORE_PG_URL_RUNTIME,superuser=process.env.MACHINE_STORE_PG_URL_SUPERUSER;
const service={issuer:'https://x.cloudflareaccess.com',client_id:'c.access'},input={tenant:'focoemcanto',delegation_id:'d'};
test('settings apply before the callback statements on the same transaction',{skip:!runtime},async()=>{
 const store=machineStore(runtime,{localTest:true});
 try{
  const out=await store.context(service,input,async sql=>{const [r]=await sql`select current_setting('foco.machine_context') as ctx, current_setting('statement_timeout') as timeout`;return r;});
  assert.equal(JSON.parse(out.ctx).delegation_id,'d');assert.equal(out.timeout,'5s');
 }finally{await store.close();}
});
test('a failed role attestation rolls back what the pipelined callback wrote',{skip:!superuser},async()=>{
 const marker='pipelined-'+Date.now();const store=machineStore(superuser,{localTest:true});
 try{
  await assert.rejects(store.context(service,input,async sql=>{await sql`insert into t values(${marker})`;return 'written';}));
  const [{n}]=await store.sql`select count(*)::int as n from t where v=${marker}`;assert.equal(n,0);
 }finally{await store.close();}
});
test('the runtime role commits normally',{skip:!runtime},async()=>{
 const marker='ok-'+Date.now();const store=machineStore(runtime,{localTest:true});
 try{
  await store.context(service,input,async sql=>sql`insert into t values(${marker})`);
  const [{n}]=await store.sql`select count(*)::int as n from t where v=${marker}`;assert.equal(n,1);
 }finally{await store.close();}
});
test('delegation and subject read together still see the settings first',{skip:!runtime},async()=>{
 const store=machineStore(runtime,{localTest:true});
 try{
  const out=await store.context(service,input,async sql=>{const second=sql`select current_setting('foco.machine_context') as ctx`.execute();second.catch(()=>{});
   const [a]=await sql`select current_setting('statement_timeout') as timeout`;const [b]=await second;return {...a,...b};});
  assert.equal(out.timeout,'5s');assert.equal(JSON.parse(out.ctx).delegation_id,'d');
 }finally{await store.close();}
});
