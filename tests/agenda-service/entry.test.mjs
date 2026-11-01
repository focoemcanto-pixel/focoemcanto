import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet,onRequestPost} from '../../functions/api/assistant/aulas.js';
// Source entrypoint: SERVICE requests are never downgraded to the human admin path.
test('SERVICE read or write without authority cannot reach KV or human fetch',async t=>{
 let queries=0,network=0;t.mock.method(globalThis,'fetch',async()=>{network++;throw Error('Human fallback forbidden');});
 const env={FOCO_LINKS:{list:()=>{queries++;},get:()=>{queries++;},put:()=>{queries++;}}};
 for(const [method,handler] of [['GET',onRequestGet],['POST',onRequestPost]]){
  const request=new Request('https://fixture.invalid/api/assistant/aulas',{method,headers:{'cf-access-jwt-assertion':'invalid','authorization':'Bearer forbidden'}});
  assert.equal((await handler({request,env})).status,403);
 }
 assert.equal(queries,0);assert.equal(network,0);
});
test('existing human admin path remains available',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({app_metadata:{foco_assistant_admin:true}}));
 const env={FOCO_LINKS:{list:async()=>({keys:[],list_complete:true}),get:async()=>null}};
 const r=await onRequestGet({request:new Request('https://fixture.invalid',{headers:{authorization:'Bearer synthetic-human'}}),env});
 assert.equal(r.status,200);assert.deepEqual((await r.json()).classes,[]);
});
