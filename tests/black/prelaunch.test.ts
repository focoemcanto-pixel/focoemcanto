import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blackConfig, checkoutHref } from '../../app/black/black-config';
import { PRELAUNCH_FAQ_EXTRA, PRELAUNCH_FAQ_KEEP, extractUtm, formatReais, groupHref, mergeFirstTouch, newToken, parseReais, resolvePhase, sanitizeStored } from '../../app/black/prelaunch-model';

test('PRE-LAUNCH é o padrão; OPEN só quando o HUB diz explicitamente', () => {
  assert.equal(blackConfig.launch.defaultPhase, 'pre_launch');
  assert.equal(resolvePhase(null, 'pre_launch'), 'pre_launch');
  assert.equal(resolvePhase({ phase: 'open' }, 'pre_launch'), 'open');
  assert.equal(resolvePhase({ phase: 'pre_launch' }, 'open'), 'pre_launch');
  assert.equal(resolvePhase({ phase: 'ended' }, 'open'), 'pre_launch'); // encerrada: sem checkout
  assert.equal(resolvePhase(undefined, 'open'), 'open'); // HUB fora do ar: vale o padrão do build
});
test('fluxo comercial OPEN preservado: checkout, preço e CTAs originais', () => {
  assert.equal(checkoutHref(), 'https://pay.kiwify.com.br/ZVKGmNk');
  assert.equal(blackConfig.blackPrice, 997);
  assert.equal(blackConfig.cta, 'QUERO GARANTIR MEU ACESSO');
  const source = readFileSync('app/black/BlackExperience.tsx', 'utf8');
  assert.match(source, /prelaunch \? <PrelaunchSection[^:]+: <ValueExperience cta=\{cta\(\)\}\/>/);
  assert.match(source, /: checkout && <a data-purchase-cta className=\{s\.headerCta\} href=\{checkout\}>GARANTIR ACESSO/);
});
test('PRE-LAUNCH não mostra preço, pagamento nem checkout', () => {
  const faqs = [...PRELAUNCH_FAQ_EXTRA, ...blackConfig.faqs.filter(f => PRELAUNCH_FAQ_KEEP.has(f.question))];
  const text = JSON.stringify(faqs);
  assert.doesNotMatch(text, /R\$|997|103,11|checkout|pagamento|garantia/i);
  assert.equal(PRELAUNCH_FAQ_KEEP.size, blackConfig.faqs.filter(f => PRELAUNCH_FAQ_KEEP.has(f.question)).length);
  const section = readFileSync('app/black/PrelaunchSection.tsx', 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(section, /currency|checkout|payment|997/);
  assert.match(section, /opensAtLong/);
});
test('valor livre em reais vira centavos, sem faixas', () => {
  assert.equal(parseReais('1.500'), 150000);
  assert.equal(parseReais('R$ 1500,50'), 150050);
  assert.equal(parseReais('997'), 99700);
  assert.equal(parseReais(''), null);
  assert.equal(parseReais('0'), null);
  assert.equal(parseReais('2.000.000'), null);
  assert.equal(formatReais('1500abc'), '1.500');
});
test('UTM de primeiro toque e persistência validada', () => {
  assert.deepEqual(extractUtm('?utm_source=instagram&utm_campaign=black&x=1'), { utm_source: 'instagram', utm_campaign: 'black' });
  assert.deepEqual(mergeFirstTouch({ utm_source: 'instagram' }, { utm_source: 'google' }), { utm_source: 'instagram' });
  assert.deepEqual(mergeFirstTouch(null, {}), {});
  const token = newToken(n => new Uint8Array(n).fill(7));
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const restored = sanitizeStored({ v: 1, token, step: 3, answers: { 1: 'cantor', 2: 'agudos', 9: 'x', 3: { bad: 1 } }, completed: false, entryId: 'e', groupAvailable: true });
  assert.deepEqual(restored?.answers, { 1: 'cantor', 2: 'agudos' });
  assert.equal(restored?.step, 3);
  assert.equal(sanitizeStored({ v: 1, token: 'curto', step: 1 }), null);
  assert.equal(sanitizeStored({ v: 2, token, step: 1 }), null);
});
test('grupo: sempre o link rastreado do HUB, nunca URL fixa no front', () => {
  assert.equal(groupHref('https://escola.focoemcanto.com', 'abc'), 'https://escola.focoemcanto.com/api/public/campanhas/grupo/abc?s=landing');
  assert.equal(groupHref('https://escola.focoemcanto.com', null), null);
  for (const file of ['PriorityList.tsx', 'PrelaunchSection.tsx', 'black-config.ts', 'campaign-client.ts']) assert.doesNotMatch(readFileSync(`app/black/${file}`, 'utf8'), /chat\.whatsapp\.com/);
});

test('evento aprovado usa 12/11 às 20h de Brasília sem fechar a oferta automaticamente', () => {
  const starts = new Date(blackConfig.launch.eventStartsAt);
  assert.equal(starts.toISOString(), '2026-11-12T23:00:00.000Z');
  assert.equal(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(starts), 'quinta-feira');
  assert.equal(blackConfig.launch.opensAtLabel, '12/11');
  assert.equal(blackConfig.launch.timeLabel, '20h');
  assert.equal(blackConfig.deadline, null);
  assert.equal(resolvePhase({phase:'pre_launch'}, 'open'), 'pre_launch');
  assert.equal(resolvePhase({phase:'open'}, 'pre_launch'), 'open');
  assert.doesNotMatch(JSON.stringify(PRELAUNCH_FAQ_EXTRA), /08 de novembro|08\/11|27\/11|última chance/);
});
