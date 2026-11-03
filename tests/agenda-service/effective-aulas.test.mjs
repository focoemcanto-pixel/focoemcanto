import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {effectiveView,createAulasService,EFFECTIVE_VIEW} from '../../lib/domain/source-aulas.mjs';
// Effective Aulas = Aulas base + the Owner's adjustments kept by the Assistente, through the Assistente's own composer.
const NOW=new Date('2026-11-02T12:00:00-03:00');  // Monday
const input={start:'2026-11-03T00:00:00-03:00',end:'2026-11-06T00:00:00-03:00',resources:['aulas','assistente'],delegated_subject:'u'};
const classes=[{id:'A',name:'Ana',occurrence:1,day:'Terça',time:'14:00',endTime:'15:00',durationMinutes:60,status:'active'},
               {id:'B',name:'Bia',occurrence:1,day:'Quarta',time:'10:00',endTime:'11:00',durationMinutes:60,status:'active'}];
const none={overrides:[],routines:[],stored:[]};
const view=(adj)=>effectiveView(classes,{...none,...adj},input,NOW);
const brief=v=>v.events.map(e=>`${e.date} ${e.start} ${e.title}${e.rescheduled?` (de ${e.original_date} ${e.original_start})`:''}`);

test('1 normal recurrence', ()=>{
 assert.deepEqual(brief(view({})),['2026-11-03 14:00 Aula · Ana','2026-11-04 10:00 Aula · Bia']);
});
test('2 a one-off cancellation removes that date and is reported', ()=>{
 const v=view({overrides:[{event_key:'aulas:A-1:2026-11-03',status:'cancelled'}]});
 assert.deepEqual(brief(v),['2026-11-04 10:00 Aula · Bia']);
 assert.deepEqual(v.cancelled.map(c=>[c.date,c.title,c.status]),[['2026-11-03','Aula · Ana','cancelled']]);
});
test('3 a reschedule shows the new date and time, with the original', ()=>{
 const v=view({overrides:[{event_key:'aulas:A-1:2026-11-03',status:'active',new_date:'2026-11-05',new_start:'16:00:00',new_end:'17:00:00'}]});
 assert.deepEqual(brief(v),['2026-11-04 10:00 Aula · Bia','2026-11-05 16:00 Aula · Ana (de 2026-11-03 14:00)']);
 const out=view({overrides:[{event_key:'aulas:A-1:2026-11-03',status:'active',new_date:'2026-11-10',new_start:null,new_end:null}]});
 assert.deepEqual(out.moved_out.map(m=>[m.date,m.new_date]),[['2026-11-03','2026-11-10']]);
 assert.ok(!brief(out).some(e=>e.includes('Ana')));
});
test('4 a make-up class: moved into the period, or an own Assistente event of the period', ()=>{
 const v=view({overrides:[{event_key:'aulas:A-1:2026-11-10',status:'active',new_date:'2026-11-05',new_start:'09:00:00',new_end:'10:00:00'}],
               stored:[{id:'s1',title:'Reposição · Ana',starts_at:'2026-11-05T18:00:00-03:00',ends_at:'2026-11-05T19:00:00-03:00',source:'assistente'}]});
 assert.deepEqual(brief(v),['2026-11-03 14:00 Aula · Ana','2026-11-04 10:00 Aula · Bia','2026-11-05 09:00 Aula · Ana (de 2026-11-10 14:00)','2026-11-05 18:00 Reposição · Ana']);
 assert.equal(v.events.at(-1).source,'assistente');  // the Manager decides whether an own event is a class
});
test('3b a lesson from a past date rescheduled into the period is shown (the composer alone would miss it)', ()=>{
 const v=view({overrides:[{event_key:'aulas:A-1:2026-10-13',status:'active',new_date:'2026-11-05',new_start:'11:00:00',new_end:'12:00:00'}]});
 assert.ok(brief(v).includes('2026-11-05 11:00 Aula · Ana (de 2026-10-13 14:00)'));
 assert.deepEqual(v.cancelled,[]);assert.deepEqual(v.moved_out,[]);  // generating from 13/10 adds no past noise
});
test('lessons already over by the real clock are not shown', ()=>{
 const late=effectiveView(classes,{...none,overrides:[{event_key:'aulas:A-1:2026-10-13',status:'active',new_date:'2026-11-05',new_start:'11:00:00',new_end:'12:00:00'}]},
   {...input,start:'2026-11-03T00:00:00-03:00'},new Date('2026-11-03T15:30:00-03:00'));
 assert.ok(!brief(late).some(e=>e.startsWith('2026-11-03 14:00')));  // Ana's Tuesday lesson ended at 15:00
});
test('5b a recurring change that moves a lesson forward in the week is shown even with no past reschedule', ()=>{
 const helena=[{id:'H',name:'Helena',occurrence:1,day:'Segunda',time:'10:00',endTime:'11:00',durationMinutes:60,status:'active'}];
 const v=effectiveView(helena,{...none,routines:[{source:'aulas',external_id:'H-1',weekday:3,start_time:'14:00:00',end_time:'16:00:00',active:true}]},
   {...input,start:'2026-11-04T00:00:00-03:00',end:'2026-11-05T00:00:00-03:00'},new Date('2026-11-03T07:00:00-03:00'));  // asked on Tuesday
 assert.deepEqual(v.events.map(e=>`${e.date} ${e.start}`),['2026-11-04 14:00']);
});
test('5 a recurring change moves the lesson for good; a date override still wins over it', ()=>{
 const routines=[{source:'aulas',external_id:'A-1',weekday:4,start_time:'18:00:00',end_time:'19:00:00',active:true}];
 assert.deepEqual(brief(view({routines})),['2026-11-04 10:00 Aula · Bia','2026-11-05 18:00 Aula · Ana']);
 const both=view({routines,overrides:[{event_key:'aulas:A-1:2026-11-05',status:'cancelled'}]});
 assert.deepEqual(brief(both),['2026-11-04 10:00 Aula · Bia']);
});
test('the effective view is read only when asked; otherwise the response is unchanged', async()=>{
 const reads=[];
 const authorize=async()=>({input,read:async cb=>{reads.push('hub');return cb(fakeSql({overrides:[{event_key:'aulas:A-1:2026-11-03',status:'cancelled'}],routines:[],stored:[]}));},recheck:async()=>{},close:async()=>{}});
 const kv={list:async()=>({keys:[{name:'aulas:student:A'}],list_complete:true}),get:async()=>({id:'A',name:'Ana',status:'active',day:'Terça',time:'14:00',durationMinutes:60})};
 const plain=await (await createAulasService({authorize})(new Request('https://x.invalid',{headers:{'cf-access-jwt-assertion':'x'}}),{FOCO_LINKS:kv})).json();
 assert.equal(plain.effective,undefined);assert.deepEqual(reads,[]);
 const eff=await (await createAulasService({authorize})(new Request('https://x.invalid',{headers:{'cf-access-jwt-assertion':'x','x-foco-aulas-view':EFFECTIVE_VIEW}}),{FOCO_LINKS:kv})).json();
 assert.deepEqual(reads,['hub']);assert.equal(eff.effective.coverage.overrides,'ok');assert.ok(Array.isArray(eff.effective.events));
});
test('an adjustment read failure is UNAVAILABLE, never the base schedule alone', async()=>{
 const authorize=async()=>({input,read:async()=>{throw new Error('hub down');},recheck:async()=>{},close:async()=>{}});
 const kv={list:async()=>({keys:[],list_complete:true}),get:async()=>null};
 const r=await createAulasService({authorize})(new Request('https://x.invalid',{headers:{'cf-access-jwt-assertion':'x','x-foco-aulas-view':EFFECTIVE_VIEW}}),{FOCO_LINKS:kv});
 assert.equal(r.status,503);assert.deepEqual((await r.json()).coverage,{aulas:'unavailable'});
});
test('drift: the composer is a verbatim copy of the Assistente lib/domain/schedule.mjs', ()=>{
 const digest=createHash('sha256').update(readFileSync(new URL('../../lib/domain/assistente-schedule.mjs',import.meta.url))).digest('hex');
 assert.equal(digest.slice(0,16),'ec3c06a64f438eef');  // update together with the Assistente source, never alone
});
function fakeSql(data){
 const q=v=>Object.assign(Promise.resolve(v),{execute(){return this;}});
 return (strings)=>{const t=strings.join('?');return q(t.includes('assistant_event_overrides')?data.overrides:t.includes('assistant_recurring_overrides')?data.routines:data.stored);};
}
