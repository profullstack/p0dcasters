import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDaemon, memoryStore } from '@profullstack/scraper-daemon';
import { buildDaemon, headStamp, STEP_NAMES, pathsFor } from '../scripts/daemon-lib.mjs';

const LM = 'Sat, 17 Oct 2026 23:15:52 GMT';
const CL = '1834980432';
const TOKEN = `${LM}|${CL}`;

const headOk = async (_url, init) => {
  assert.equal(init.method, 'HEAD');
  return new Response(null, { status: 200, headers: { 'last-modified': LM, 'content-length': CL } });
};

function fakes({ stamp = null, fetchImpl = headOk } = {}) {
  const P = pathsFor('/data');
  const disk = new Map(stamp ? [[P.stamp, stamp]] : []);
  const records = [];
  const calls = [];
  let locked = false;
  const deps = {
    data: '/data',
    fetch: fetchImpl,
    sh: async (cmd, args) => {
      calls.push([cmd, ...args]);
      return { code: 0, stdout: '' };
    },
    files: {
      read: (p) => disk.get(p) ?? null,
      write: (p, s) => disk.set(p, s),
      size: () => null,
      rename: () => {},
      append: () => {},
      reset: () => {},
    },
    record: async (args) => void records.push(args),
    credential: async () => ({ url: 'postgres://x', source: 'test' }),
    lock: {
      acquire: async () => (locked ? false : (locked = true)),
      release: () => void (locked = false),
    },
    console: { log() {}, error() {} },
  };
  return { deps, disk, records, calls, P, isLocked: () => locked };
}

function ctxFor(store) {
  return {
    signal: new AbortController().signal,
    log() {},
    state: { get: (k) => store.get(`directory:${k}`), set: (k, v) => store.set(`directory:${k}`, v) },
  };
}

test('headStamp returns last-modified|content-length, the old .last-dump-stamp format', async () => {
  assert.equal(await headStamp(headOk), TOKEN);
  assert.equal(await headStamp(async () => new Response(null, { status: 503 })), null);
  assert.equal(await headStamp(async () => new Response(null, { status: 200, headers: { 'content-length': CL } })), null);
  assert.equal(await headStamp(async () => { throw new Error('offline'); }), null);
});

test('registers one pipeline "directory" with the refresh steps in order', () => {
  let spec = null;
  const fakeCreate = (opts) => {
    assert.equal(opts.name, 'p0dcasters.com');
    assert.equal(typeof opts.onStall, 'function');
    return { pipeline: (s) => void (spec = s) };
  };
  const { deps } = fakes();
  buildDaemon({ ...deps, createDaemon: fakeCreate, store: memoryStore() });
  assert.equal(spec.name, 'directory');
  assert.equal(spec.every, '6h');
  assert.equal(spec.timeout, '3h');
  assert.equal(spec.staleAfter, '13h');
  assert.deepEqual(spec.steps.map((s) => s.name), STEP_NAMES);
  assert.deepEqual(STEP_NAMES, ['download', 'build_live', 'export_indie', 'row_floor', 'load_directory', 'seed_networks']);
});

test('gate returns the stamp token for a new dump and keeps the run open', async () => {
  let spec = null;
  const store = memoryStore();
  const f = fakes({ stamp: 'Fri, 10 Oct 2026 00:00:00 GMT|1' });
  buildDaemon({ ...f.deps, createDaemon: () => ({ pipeline: (s) => void (spec = s) }), store });
  assert.deepEqual(await spec.gate(ctxFor(store)), { token: TOKEN });
  assert.ok(f.isLocked(), 'the run holds the refresh lock past the gate');
  assert.ok(f.records.some((r) => r.includes('running') && r.includes('check')));
});

test('gate on an unchanged dump records a skipped run, adopts the old stamp as done', async () => {
  let spec = null;
  const store = memoryStore();
  const f = fakes({ stamp: TOKEN });
  buildDaemon({ ...f.deps, createDaemon: () => ({ pipeline: (s) => void (spec = s) }), store });
  assert.deepEqual(await spec.gate(ctxFor(store)), { token: TOKEN });
  assert.equal(await store.get('directory:done'), TOKEN);
  const last = f.records.at(-1);
  assert.equal(last[last.indexOf('--status') + 1], 'skipped');
  assert.ok(!f.isLocked());
});

test('gate returns null when upstream is unreachable, and records the failure', async () => {
  let spec = null;
  const store = memoryStore();
  const f = fakes({ fetchImpl: async () => { throw new Error('down'); } });
  buildDaemon({ ...f.deps, createDaemon: () => ({ pipeline: (s) => void (spec = s) }), store });
  assert.equal(await spec.gate(ctxFor(store)), null);
  const last = f.records.at(-1);
  assert.equal(last[last.indexOf('--status') + 1], 'failed');
});

test('end to end on the real package: an unchanged dump is skipped without running a step', async () => {
  const store = memoryStore();
  const f = fakes({ stamp: TOKEN });
  const daemon = buildDaemon({ ...f.deps, createDaemon, store });
  const out = await daemon.runNow('directory');
  assert.equal(out.ok, true);
  assert.equal(out.result.skipped, true);
  assert.equal(f.calls.length, 0);
});

test('a new dump runs every step and advances the old stamp files', async () => {
  const store = memoryStore();
  const f = fakes({ stamp: 'old|1' });
  f.deps.files.size = (p) => (p.endsWith('.part') ? Number(CL) : null);
  f.deps.sh = async (cmd, args, o = {}) => {
    f.calls.push([cmd, ...args]);
    if (o.capture) return { code: 0, stdout: '20000\n' };
    return { code: 0, stdout: '' };
  };
  const daemon = buildDaemon({ ...f.deps, createDaemon, store });
  const out = await daemon.runNow('directory');
  assert.equal(out.ok, true, String(out.error));
  assert.equal(f.disk.get(f.P.stamp), TOKEN);
  assert.equal(f.disk.get(f.P.dlStamp), TOKEN);
  assert.equal(await store.get('directory:done'), TOKEN);
  const last = f.records.at(-1);
  assert.equal(last[last.indexOf('--status') + 1], 'ok');
  assert.ok(f.calls.some((c) => c.some((a) => String(a).endsWith('load_directory.mjs'))));
});
