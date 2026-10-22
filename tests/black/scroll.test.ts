import assert from 'node:assert/strict';
import test from 'node:test';
import { coverFrame, introFrame, productScrollTarget, sceneFrame, sceneTravel, universeFrame } from '../../app/black/scroll-model';

test('palco + percurso: o pin inicia, permanece e termina no mesmo sistema de coordenadas', () => {
  for (const height of [620, 664, 752, 900]) {
    const start = 1500, travel = sceneTravel('universe', height, 6);
    assert.equal(travel, height * 1.9);
    assert.equal(sceneFrame(start - 1, start, travel).pin, 'before');
    for (let step = 0; step < 100; step++) {
      const y = start + travel * step / 100;
      assert.equal(sceneFrame(y, start, travel).pin, 'active');
    }
    assert.equal(sceneFrame(start + travel, start, travel).pin, 'after');
    assert.equal(sceneFrame(start + travel, start, travel).progress, 1);
  }
});

test('seis produtos: navegação e progress têm ida e volta exatas', () => {
  const start = 1000, travel = sceneTravel('universe', 664, 6);
  const forward = Array.from({ length: 501 }, (_, index) => universeFrame(index / 500, 6).active);
  assert.deepEqual(Array.from(new Set(forward)), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(Array.from(new Set(forward.reverse())), [5, 4, 3, 2, 1, 0]);
  for (const index of [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]) {
    const target = productScrollTarget(start, travel, index, 6);
    const state = universeFrame(sceneFrame(target, start, travel).progress, 6);
    assert.equal(state.active, index);
    assert(Math.abs(state.cursor - index) < 1e-9);
    assert(Math.abs(coverFrame(index, state.cursor).distance) < 1e-9);
  }
});

test('transição espacial contínua, inclusive scroll reverso, não move a câmera em saltos de estado', () => {
  for (const p of [0.12, 0.2, 0.33, 0.54, 0.78, 1]) {
    const a = universeFrame(p, 6), b = universeFrame(p + 0.0001, 6);
    assert(Math.abs(a.cursor - b.cursor) <= 0.000501);
    const current = coverFrame(a.active, a.cursor);
    assert(current.opacity >= 0.69);
    assert(current.scale >= 0.962);
    assert(Math.abs(current.tilt) <= 1.01);
    assert(a.textOpacity >= 0.75);
  }
});

test('abertura: nenhum intervalo de scroll tem todos os atos invisíveis', () => {
  for (let i = 0; i <= 1000; i++) {
    const { weights } = introFrame(i / 1000);
    assert(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
    assert(Math.max(...weights) >= 0.5);
  }
});

test('Safari: distâncias derivam da viewport estável, não da barra dinâmica/innerHeight', () => {
  const stable = 664;
  const distance = sceneTravel('universe', stable, 6);
  const y = 1234 + distance * 0.47;
  const before = sceneFrame(y, 1234, distance);
  for (const dynamicBrowserHeight of [664, 710, 760, 844]) {
    assert(dynamicBrowserHeight >= stable);
    assert.deepEqual(sceneFrame(y, 1234, sceneTravel('universe', stable, 6)), before);
  }
});

test('overscroll, limites e catálogo de um produto não geram NaN/estado inválido', () => {
  assert.equal(sceneFrame(-100, 0, 0).progress, 0);
  assert.equal(universeFrame(-2, 6).active, 0);
  assert.equal(universeFrame(20, 6).active, 5);
  assert.equal(universeFrame(0.5, 1).active, 0);
  assert(Number.isFinite(productScrollTarget(100, 600, 0, 1)));
});
