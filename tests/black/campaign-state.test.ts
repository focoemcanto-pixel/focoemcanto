import test from 'node:test';
import assert from 'node:assert/strict';
import { isCampaignState } from '../../app/black/prelaunch-model';
const state = { ok: true, phase: 'pre_launch', capture_open: true, consent_text: 'Consentimento', consent_version: 'v1', questions: [1,2,3,4].map(n => ({n,type:'choice',prompt:'Pergunta',options:[{key:'sim',label:'Sim'}]})).concat([{n:5,type:'money',prompt:'Valor'}] as any) };
test('campaign readiness requires current consent and all five usable questions', () => {
  assert.equal(isCampaignState(state), true);
  for (const invalid of [null, {}, {ok:true}, {...state,consent_version:''}, {...state,questions:[]}, {...state,questions:[...state.questions.slice(0,4),state.questions[0]]}, {...state,questions:state.questions.map(q=>({...q,options:[]}))}]) assert.equal(isCampaignState(invalid),false);
  assert.equal(isCampaignState({...state,capture_open:false}),true);
});
