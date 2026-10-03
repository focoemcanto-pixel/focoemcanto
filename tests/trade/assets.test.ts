import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('a missing deployment chunk refreshes once and never loops', () => {
  let handler: (event: any) => void = () => {};
  const storage = new Map();
  const redirects: string[] = [];
  runInNewContext(readFileSync('public/trade-boot.js', 'utf8'), {
    URL, Date,
    sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) },
    window: {
      addEventListener: (_: string, callback: typeof handler) => { handler = callback; },
      location: { href: 'https://focoemcanto.com/trade/', replace: (url: string) => redirects.push(url) },
    },
  });
  handler({ target: { src: 'https://example.com/pixel.js' } });
  assert.equal(redirects.length, 0);
  handler({ target: { src: 'https://focoemcanto.com/_next/static/chunks/old.js' } });
  handler({ target: { href: 'https://focoemcanto.com/_next/static/css/old.css' } });
  assert.equal(redirects.length, 1);
  assert.ok(redirects[0].startsWith('https://focoemcanto.com/trade/?_refresh='));
});
