import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { run, parseArgs, apiBase, COMMANDS, VERSION } from '../public/cli/p0d.mjs';

function io(routes = {}) {
  const out = [];
  const err = [];
  const calls = [];
  return {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    env: {},
    readFile: async () => '<opml version="2.0"><body><outline xmlUrl="https://x.org/feed"/></body></opml>',
    fetch: async (url, init) => {
      calls.push({ url, init });
      const path = new URL(url).pathname + new URL(url).search;
      const r = routes[path] ?? routes[new URL(url).pathname];
      if (!r) return new Response('{"error":"not found"}', { status: 404, headers: { 'content-type': 'application/json' } });
      return new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200 });
    },
    out_: out,
    err_: err,
    calls,
  };
}

test('VERSION matches the one the installer would report', () => {
  const src = readFileSync(new URL('../public/cli/p0d.mjs', import.meta.url), 'utf8');
  assert.equal(/VERSION = '([^']+)'/.exec(src)[1], VERSION);
  assert.ok(src.startsWith('#!/usr/bin/env node'));
});

test('parseArgs and apiBase', () => {
  assert.deepEqual(parseArgs(['search', 'a', 'b', '--limit', '5', '--json', '--x=y']), {
    args: ['search', 'a', 'b'],
    flags: { limit: '5', json: true, x: 'y' },
  });
  assert.equal(apiBase({}, {}), 'https://p0dcasters.com');
  assert.equal(apiBase({ api: 'http://localhost:3000/' }, {}), 'http://localhost:3000');
  assert.equal(apiBase({}, { P0D_API: 'https://x.org' }), 'https://x.org');
});

test('every documented command is dispatched', async () => {
  for (const c of COMMANDS) {
    const o = io();
    const code = await run([c.name], { ...o, argv1: '/nowhere/p0d' });
    assert.ok(!o.err_.some((l) => l.includes('unknown command')), c.name);
    assert.ok([0, 1].includes(code), c.name);
  }
  const o = io();
  assert.equal(await run(['bogus'], o), 1);
  assert.match(o.err_[0], /unknown command/);
});

test('help lists every command and version prints it', async () => {
  const o = io();
  assert.equal(await run([], o), 0);
  for (const c of COMMANDS) assert.ok(o.out_.join('\n').includes(c.usage), c.usage);
  const v = io();
  await run(['version'], v);
  assert.deepEqual(v.out_, [VERSION]);
});

test('search prints slugs and --json prints the body', async () => {
  const body = { query: 'x', shows: [{ slug: 'a-show', title: 'A Show', host: 'a.org', author: null, episodes: 3, cadence: 'weekly', page: 'https://p0dcasters.com/podcast/a-show' }] };
  const o = io({ '/api/search?q=x&limit=20': body });
  assert.equal(await run(['search', 'x'], o), 0);
  assert.match(o.out_[0], /^a-show\n/);
  const j = io({ '/api/search?q=x&limit=20': body });
  await run(['search', 'x', '--json'], j);
  assert.deepEqual(JSON.parse(j.out_[0]), body);
});

test('submit posts urls, or an OPML file, and exits 1 when nothing was added', async () => {
  const o = io({ '/api/submit': { ok: true, accepted: [{ page: 'https://p0dcasters.com/podcast/x', existing: false }], rejected: [], queued: 0, total: 1 } });
  assert.equal(await run(['submit', 'example.org'], o), 0);
  assert.deepEqual(JSON.parse(o.calls[0].init.body), { urls: ['example.org'] });
  assert.match(o.out_[0], /^added/);

  const f = io({ '/api/submit': { ok: true, accepted: [], rejected: [], queued: 1, total: 1, statusUrl: 'https://p0dcasters.com/submissions/abc' } });
  assert.equal(await run(['submit', 'subs.opml'], f), 0);
  assert.ok(JSON.parse(f.calls[0].init.body).opml.includes('<opml'));
  assert.match(f.out_[0], /queued/);

  const r = io({ '/api/submit': { ok: false, accepted: [], rejected: [{ url: 'x', error: 'no-feed-found', message: 'No feed.' }], queued: 0, total: 1 } });
  assert.equal(await run(['submit', 'x'], r), 1);
  assert.match(r.out_[0], /not listed/);
  assert.equal(await run(['submit'], io()), 1);
});

test('update and remove refuse outside an installed copy', async () => {
  const u = io();
  assert.equal(await run(['update'], { ...u, argv1: '/nowhere/p0d' }), 1);
  assert.match(u.err_[0], /not an installed copy/);
  const r = io();
  assert.equal(await run(['remove', '--yes'], { ...r, argv1: '/nowhere/p0d' }), 1);
});
