import test from 'node:test';
import assert from 'node:assert/strict';
import {createAulasService} from '../../lib/domain/source-aulas.mjs';
import {ReadDenied} from '../../lib/domain/read-denied.mjs';
// The SERVICE read path stays fully governed while doing less: no recheck right after authorizing, parallel KV reads.
const student=i=>({id:'s'+i,name:'Aluno '+i,status:'active',day:'Terça',time:'14:00',durationMinutes:60});
function kv(n,{pageSize=500,delay=20}={}){
 const keys=Array.from({length:n},(_,i)=>({name:'aulas:student:s'+i}));let inflight=0,peak=0,gets=0;
 return {stats:()=>({peak,gets}),
  list:async({cursor})=>{const start=Number(cursor||0),page=keys.slice(start,start+pageSize),next=start+pageSize;return {keys:page,list_complete:next>=n,cursor:next>=n?undefined:String(next)};},
  get:async name=>{gets++;inflight++;peak=Math.max(peak,inflight);await new Promise(r=>setTimeout(r,delay));inflight--;return student(name.split(':s').pop().replace('tudent:',''));}};
}
function authorize(log,{revokeAt=Infinity}={}){
 return async()=>{log.push('authorize');let checks=0;return {recheck:async()=>{log.push('recheck');if(++checks>=revokeAt)throw new ReadDenied();},close:async()=>log.push('close')};};
}
const request=()=>new Request('https://fixture.invalid/api/assistant/aulas',{headers:{'cf-access-jwt-assertion':'x'}});
test('one page: authorize, read in parallel, recheck once before returning',async()=>{
 const log=[],store=kv(18);
 const r=await createAulasService({authorize:authorize(log)})(request(),{FOCO_LINKS:store});
 assert.equal(r.status,200);const body=await r.json();
 assert.equal(body.classes.length,18);assert.deepEqual(body.coverage,{aulas:'ok'});
 assert.deepEqual(log,['authorize','recheck','close']);
 assert.equal(store.stats().gets,18);assert.ok(store.stats().peak>1,'KV reads must not be serial');
 assert.equal(typeof body.timing.total_ms,'number');assert.ok(!JSON.stringify(body.timing).includes('Aluno'));
});
test('later pages still recheck the live delegation first',async()=>{
 const log=[];
 const r=await createAulasService({authorize:authorize(log)})(request(),{FOCO_LINKS:kv(5,{pageSize:2,delay:1})});
 assert.equal(r.status,200);assert.deepEqual(log,['authorize','recheck','recheck','recheck','close']);
});
test('a delegation revoked before returning still denies the whole read',async()=>{
 const log=[];
 const r=await createAulasService({authorize:authorize(log,{revokeAt:1})})(request(),{FOCO_LINKS:kv(3,{delay:1})});
 assert.equal(r.status,403);const body=await r.json();assert.equal(body.classes,undefined);assert.deepEqual(body.coverage,{aulas:'denied'});
});
test('a foreign key in the namespace is refused before any read',async()=>{
 const store=kv(2);const list=store.list;store.list=async a=>{const p=await list(a);p.keys.push({name:'aulas:lead:x'});return p;};
 const r=await createAulasService({authorize:authorize([])})(request(),{FOCO_LINKS:store});
 assert.equal(r.status,403);assert.equal(store.stats().gets,0);
});
