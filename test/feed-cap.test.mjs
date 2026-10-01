import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { XMLParser } from 'fast-xml-parser';
import { readCappedText, closeTruncatedFeed, MAX_FEED_BYTES } from '../src/lib/feed-body.ts';
import { TtlLru } from '../src/lib/lru.ts';

// src/ uses extensionless relative imports (Next resolves them); plain node
// needs the .ts spelled out, so add it for this test's imports only. Bun resolves
// them natively and has no registerHooks, so the hook is node-only.
nodeModule.registerHooks?.({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.includes('/src/')) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});
const { fetchEpisodes, episodeCache } = await import('../src/lib/feed.ts');

const enc = new TextEncoder();

function item(i) {
  return `<item><title>Episode ${i}</title><guid>g${i}</guid>` +
    `<enclosure url="https://example.com/${i}.mp3" type="audio/mpeg"/>` +
    `<description>${'x'.repeat(200)}</description></item>`;
}
function rss(n) {
  let s = '<?xml version="1.0"?><rss version="2.0"><channel><title>Show</title>';
  for (let i = n; i > 0; i--) s += item(i); // newest first
  return s + '</channel></rss>';
}

/** A Response whose body arrives in chunks and records whether it was cancelled. */
function streamed(text, { chunk = 1024, headers = {} } = {}) {
  const bytes = enc.encode(text);
  const state = { pulled: 0, cancelled: false };
  let at = 0;
  const body = new ReadableStream({
    pull(c) {
      if (at >= bytes.length) return c.close();
      const part = bytes.subarray(at, at + chunk);
      at += part.length;
      state.pulled += part.length;
      c.enqueue(part);
    },
    cancel() { state.cancelled = true; },
  });
  return { res: new Response(body, { headers }), state };
}

test('a body under the cap is read whole', async () => {
  const xml = rss(3);
  const { res } = streamed(xml);
  const out = await readCappedText(res, 1 << 20);
  assert.equal(out.truncated, false);
  assert.equal(out.text, xml);
});

test('a body exactly at the cap is not truncated', async () => {
  const xml = rss(3);
  const { res } = streamed(xml, { chunk: 7 });
  const out = await readCappedText(res, enc.encode(xml).length);
  assert.equal(out.truncated, false);
  assert.equal(out.text, xml);
});

test('reading stops at the cap and cancels the rest of the download', async () => {
  const xml = rss(2000); // ~600 KB
  const cap = 50_000;
  const { res, state } = streamed(xml, { chunk: 4096 });
  const out = await readCappedText(res, cap);
  assert.equal(out.truncated, true);
  assert.equal(enc.encode(out.text).length, cap);
  assert.equal(state.cancelled, true);
  assert.ok(state.pulled < cap + 4096 * 3, `pulled ${state.pulled} bytes`);
});

test('a content-length over the cap marks the body truncated', async () => {
  const { res } = streamed('<rss></rss>', { headers: { 'content-length': String(MAX_FEED_BYTES + 1) } });
  const out = await readCappedText(res);
  assert.equal(out.truncated, true);
});

test('a cut feed is closed after its last complete item and parses', () => {
  const xml = rss(50);
  const cut = xml.slice(0, Math.floor(xml.length / 2));
  const closed = closeTruncatedFeed(cut);
  assert.ok(closed);
  assert.ok(closed.endsWith('</item></channel></rss>'));
  const doc = new XMLParser({ isArray: (n) => n === 'item' }).parse(closed);
  const items = doc.rss.channel.item;
  assert.ok(items.length > 10 && items.length < 50);
  assert.equal(items[0].title, 'Episode 50'); // the newest survive
});

test('Atom feeds close on </entry>', () => {
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>a</id></entry><entry><id>b</id></en';
  assert.equal(closeTruncatedFeed(atom), '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>a</id></entry></feed>');
});

test('a cut with no complete item gives null', () => {
  assert.equal(closeTruncatedFeed('<rss><channel><title>x</title><item><title>half'), null);
});

test('LRU evicts the least recently used past maxEntries', () => {
  const c = new TtlLru({ maxEntries: 2, ttlMs: 1000 });
  c.set('a', 1); c.set('b', 2);
  c.get('a'); // a is now younger than b
  c.set('c', 3);
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('c'), 3);
});

test('LRU entries expire after their TTL', () => {
  let t = 0;
  const c = new TtlLru({ maxEntries: 10, ttlMs: 100, now: () => t });
  c.set('a', 1);
  c.set('b', 2, 500);
  t = 99; assert.equal(c.get('a'), 1);
  t = 100; assert.equal(c.get('a'), undefined);
  assert.equal(c.get('b'), 2);
  assert.equal(c.size, 1);
});

test('LRU stays under its weight budget', () => {
  const c = new TtlLru({ maxEntries: 100, ttlMs: 1000, maxWeight: 10, weigh: (v) => v.length });
  c.set('a', 'xxxx'); c.set('b', 'xxxx'); c.set('c', 'xxxx');
  assert.equal(c.get('a'), undefined);
  assert.ok(c.weight <= 10);
  c.set('huge', 'x'.repeat(11)); // heavier than the budget: not held, nothing evicted
  assert.equal(c.get('huge'), undefined);
  assert.equal(c.size, 2);
});

test('fetchEpisodes parses once, then serves from the cache', async (t) => {
  episodeCache.clear();
  let calls = 0;
  let lastInit;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    lastInit = init;
    return streamed(rss(5)).res;
  });
  const url = 'https://example.com/feed.xml';
  const [a, b] = await Promise.all([fetchEpisodes(url), fetchEpisodes(url)]);
  const c = await fetchEpisodes(url);
  assert.equal(calls, 1);
  assert.equal(lastInit.cache, 'no-store');
  assert.equal(a.length, 5);
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(a[0].title, 'Episode 5');
});

test('fetchEpisodes keeps the newest episodes of an oversized feed', async (t) => {
  episodeCache.clear();
  const big = rss(Math.ceil((MAX_FEED_BYTES * 1.5) / item(1).length));
  let state;
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => {
    const s = streamed(big, { chunk: 64 * 1024 });
    state = s.state;
    return s.res;
  });
  const eps = await fetchEpisodes('https://example.com/huge.xml');
  assert.equal(state.cancelled, true);
  assert.ok(state.pulled < big.length);
  assert.equal(eps.length, 300); // MAX_ITEMS, all from the front of the feed
  assert.match(eps[0].title, /^Episode \d+$/);
  assert.equal(console.warn.mock.callCount(), 1);
});
