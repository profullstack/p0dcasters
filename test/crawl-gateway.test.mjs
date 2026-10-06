import { test } from 'node:test';
import assert from 'node:assert/strict';
import { x402Proxy } from '@profullstack/x402-gateway/next';
import { gateway } from '../src/lib/crawl-gateway.ts';

const gate = x402Proxy(gateway);

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';

function req(path, headers) {
  return new Request(`https://p0dcasters.com${path}`, {
    headers: { 'x-forwarded-for': '37.231.157.22', ...headers },
  });
}

test('Lightpanda is charged like a training crawler', async () => {
  const res = await gate(req('/podcast/broken-heart', { 'user-agent': 'Lightpanda/1.0' }));
  assert.equal(res?.status, 402);
});

test('Lightpanda is charged on the prefetch requests too', async () => {
  const res = await gate(req('/browse?_rsc=wnvFOH2u9NsTKups', { 'user-agent': 'Lightpanda/1.0', rsc: '1' }));
  assert.equal(res?.status, 402);
});

test('a real browser is untouched', async () => {
  const res = await gate(req('/podcast/broken-heart', { 'user-agent': CHROME, 'sec-fetch-mode': 'navigate' }));
  assert.equal(res ?? undefined, undefined);
});

test('Lightpanda may still read robots.txt', async () => {
  const res = await gate(req('/robots.txt', { 'user-agent': 'Lightpanda/1.0' }));
  assert.notEqual(res?.status, 402);
});
