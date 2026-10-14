import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { blackConfig, blackProofs, checkoutHref } from '../../app/black/black-config';

test('campaign terms stay explicit without invented commercial numbers', () => {
  assert.equal(blackConfig.campaignName, 'BLACK FOCO');
  assert.equal(blackConfig.slogan.join(' '), 'Tudo o que construímos. Em uma única oportunidade.');
  assert.deepEqual(blackConfig.products.map(p => p.duration), ['12 meses','Vitalício','12 meses','12 meses',null,null]);
  assert.equal(blackConfig.blackPrice, null);
  assert.equal(checkoutHref(), null);
  assert.ok(blackConfig.products.every(p => p.regularPrice === null));
});
test('product proofs resolve to the same product and published source', () => {
  for (const p of blackConfig.products) for (const id of p.proofIds) {
    const proof = blackProofs.find(proof => proof.id === id);
    assert.ok(proof); assert.equal(proof.product, p.id); assert.match(proof.source, /^https:\/\//);
  }
  assert.ok(!blackProofs.some(p => ['harmomus','gvip','harmonics'].includes(p.product)));
  for (const proof of blackProofs) if (proof.type === 'image') assert.ok(existsSync(`public${proof.media}`));
});
test('all six products retain readable non-JS fallback and detail entry points', () => {
  const source = readFileSync('app/black/BlackExperience.tsx', 'utf8');
  assert.match(source, /data-universe-fallback/);
  assert.match(source, /p.deliverables.map/);
  assert.match(source, /productCta\(p.id\)/);
  assert.match(source, /preventScroll: true/);
});
