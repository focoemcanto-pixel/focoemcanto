import test from 'node:test';
import assert from 'node:assert/strict';
import { valueFrame } from '../../app/black/value-model';
import { sceneTravel } from '../../app/black/scroll-model';
const cents=[69700,8990,47880,23880,0];
test('each accumulation checkpoint matches the official value stack', () => {
  const expected=[0,69700,78690,126570,150450,150450];
  expected.forEach((value,index) => assert.equal(valueFrame(index/5*.65,cents).subtotalCents,value));
  assert.equal(valueFrame(.75,cents).subtotalCents,150450);
  assert.equal(valueFrame(.75,cents).reveal,0);
  assert.equal(valueFrame(1,cents).reveal,1);
  assert.equal(valueFrame(.64,cents).referenceComplete,false);
  assert.equal(valueFrame(.70,cents).referenceComplete,true);
  assert(valueFrame(.83,cents).bridge>.9);
  assert.equal(valueFrame(.83,cents).reveal,0);
  assert.equal(valueFrame(1,cents).bridge,0);
});
test('forward and reverse scroll are continuous and no transition leaves both acts blank', () => {
  let previous=0;
  for (let step=0;step<=1000;step++) {
    const p=step/1000,state=valueFrame(p,cents);
    assert(state.subtotalCents>=previous && state.subtotalCents<=150450);
    assert(Math.max(1-state.buildExit,state.bridge,state.reveal)>=.35, `transição sem ato legível em ${p}`);
    assert.equal(state.referenceComplete,p>=.65);
    assert(state.reveal>=0 && state.reveal<=1);
    previous=state.subtotalCents;

  }
  let reversePrevious=150450;
  for(let step=1000;step>=0;step--) { const state=valueFrame(step/1000,cents); assert(state.subtotalCents<=reversePrevious); reversePrevious=state.subtotalCents; }
  assert.equal(reversePrevious,0);
  for (const h of [620,664,752,900]) assert.equal(sceneTravel('value',h,6),h*1.35);
});
