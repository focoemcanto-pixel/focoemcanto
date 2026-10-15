import test from 'node:test';
import assert from 'node:assert/strict';
import { valueFrame } from '../../app/black/value-model';
import { sceneTravel } from '../../app/black/scroll-model';
const cents=[69700,8990,47880,23880,20000];
test('each accumulation checkpoint matches the official value stack', () => {
  const expected=[0,69700,78690,126570,150450,170450];
  expected.forEach((value,index) => assert.equal(valueFrame(index/5*.65,cents).subtotalCents,value));
  assert.equal(valueFrame(.75,cents).subtotalCents,170450);
  assert.equal(valueFrame(.75,cents).reveal,0);
  assert.equal(valueFrame(1,cents).reveal,1);
});
test('forward and reverse scroll are continuous and no transition leaves both acts blank', () => {
  let previous=0;
  for (let step=0;step<=1000;step++) {
    const p=step/1000,state=valueFrame(p,cents);
    assert(state.subtotalCents>=previous && state.subtotalCents<=170450);
    assert.equal((1-state.reveal)+state.reveal,1);
    assert(state.reveal>=0 && state.reveal<=1);
    previous=state.subtotalCents;

  }
  let reversePrevious=170450;
  for(let step=1000;step>=0;step--) { const state=valueFrame(step/1000,cents); assert(state.subtotalCents<=reversePrevious); reversePrevious=state.subtotalCents; }
  assert.equal(reversePrevious,0);
  for (const h of [620,664,752,900]) assert.equal(sceneTravel('value',h,6),h*1.35);
});
