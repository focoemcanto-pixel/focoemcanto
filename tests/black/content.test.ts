import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { blackConfig, blackProofs, checkoutHref, offerTotals, valueItems, globalVideoProofIds } from '../../app/black/black-config';

test('campaign terms stay explicit without invented commercial numbers', () => {
  assert.equal(blackConfig.campaignName, 'BLACK FOCO');
  assert.equal(blackConfig.slogan.join(' '), 'Tudo o que construímos. Em uma única oportunidade.');
  assert.deepEqual(blackConfig.products.map(p => p.duration), ['12 meses','Vitalício','12 meses','12 meses',null,null]);
  assert.equal(blackConfig.blackPrice, 997);
  assert.equal(blackConfig.payment.installments, null);
  assert.equal(blackConfig.payment.installmentValue, null);
  assert.equal(blackConfig.payment.paymentLabel, null);
  assert.equal(checkoutHref(), null);
  assert.equal(blackConfig.products.find(p => p.id === 'bonus')?.regularPrice, null);
});
test('product proofs resolve to the same product and published source', () => {
  for (const p of blackConfig.products) for (const id of p.proofIds) {
    const proof = blackProofs.find(proof => proof.id === id);
    assert.ok(proof); assert.equal(proof.product, p.id); assert.match(proof.source, /^https:\/\//);
  }
  assert.ok(!blackProofs.some(p => ['harmomus','gvip','harmonics'].includes(p.product)));
  for (const proof of blackProofs) if (proof.type === 'image') assert.ok(existsSync(`public${proof.media}`));
});
test('all verified proofs are assigned once to the correct product experience', () => {
  assert.equal(blackProofs.filter(p => p.product === 'canto').length,12);
  assert.equal(blackProofs.filter(p => p.product === 'harmonia').length,8);
  assert.equal(new Set(blackProofs.map(p => p.id)).size,blackProofs.length);
  for (const proof of blackProofs) {
    assert.equal(blackConfig.products.filter(p => p.proofIds.includes(proof.id)).length,1);
    assert.ok(proof.context && proof.priority > 0);
  }
});
test('official offer math is exact in cents, without bonus price or invented installments', () => {
  assert.deepEqual(valueItems.map(p => p.cents),[69700,8990,47880,23880,20000]);
  assert.deepEqual(valueItems.map((_,i) => valueItems.slice(0,i+1).reduce((sum,p) => sum+p.cents,0)),[69700,78690,126570,150450,170450]);
  assert.equal(offerTotals.regularCents,170450);
  assert.equal(offerTotals.blackCents,99700);
  assert.equal(offerTotals.savingsCents,70750);
  assert.equal(Number(offerTotals.discountPercentage.toFixed(1)),41.5);
  for (const item of valueItems) if (item.calculation) assert.equal(item.calculation.monthlyCents*item.calculation.months,item.cents);
});

test('main proof stage uses all five verified videos and preserves complete contextual inventories', () => {
  const videos = globalVideoProofIds.map(id => blackProofs.find(proof => proof.id === id));
  assert.equal(new Set(globalVideoProofIds).size, 5);
  assert.equal(videos.filter(proof => proof?.product === 'canto').length, 4);
  assert.equal(videos.filter(proof => proof?.product === 'harmonia').length, 1);
  for (const proof of videos) {
    assert.ok(proof && proof.type === 'video' && proof.videoTitle && proof.poster);
    assert.match(proof.poster, new RegExp(`^https://i\\.ytimg\\.com/vi/${proof.media}/hqdefault\\.jpg$`));
    assert.ok(blackConfig.products.find(product => product.id === proof.product)?.proofIds.includes(proof.id));
  }
  assert.equal(blackProofs.filter(proof => proof.type === 'image').length, 15);
});
