import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { createProfileStore } from '@profullstack/profile';
import { createDaemon, memoryStore } from '@profullstack/scraper-daemon';
import {
  NEWSLETTER_SLOT,
  SEND_GAP_MS,
  UNSUBSCRIBE_PLACEHOLDER,
  buildIssue,
  isoWeek,
  listUnsubscribeHeaders,
  nextSlot,
  parseSlot,
  personalise,
  runWeeklyNewsletter,
  slotFor,
  slotFrom,
  sqlStore,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribe,
} from '../src/lib/newsletter.ts';
import { signupProfileFrom, newsletterChoice, saveVerifiedProfile } from '../src/lib/auth/signupProfile.ts';
import { buildDaemon, NEWSLETTER_JOB } from '../scripts/daemon-lib.mjs';

const KEY = 'test-secret-at-least-16-chars';
const WED = new Date('2026-10-28T12:00:00Z');
const FRI_AFTER = new Date('2026-10-30T15:05:00Z');
const UNTIL = Date.parse('2026-10-30T15:00:00Z') / 1000;

const DATA = {
  week: '2026-W44',
  since: UNTIL - 7 * 86400,
  until: UNTIL,
  added: { count: 2, shows: [{ slug: 'new-show', title: 'A <New> Show', host: 'new.example', author: 'Ada', newest: UNTIL - 3600 }] },
  followed: [],
  fresh: [{ slug: 'old-show', title: 'Old Show', host: 'old.example', author: null, newest: UNTIL - 7200 }],
  networks: [],
};

test('isoWeek is the ISO 8601 week, with the week-year at the edges', () => {
  assert.equal(isoWeek(WED), '2026-W44');
  assert.equal(isoWeek(new Date('2021-01-03T23:00:00Z')), '2020-W53');
  assert.equal(isoWeek(new Date('2024-12-30T00:00:00Z')), '2025-W01');
  assert.equal(isoWeek(new Date('2026-11-01T23:59:00Z')), '2026-W44'); // Sunday closes the week
  assert.equal(isoWeek(new Date('2026-11-02T00:00:00Z')), '2026-W45');
});

test('the slot is Friday 15:00 UTC of the ISO week, and NEWSLETTER_SLOT overrides it', () => {
  assert.deepEqual(NEWSLETTER_SLOT, { day: 5, hour: 15, minute: 0 });
  assert.equal(slotFor(WED).toISOString(), '2026-10-30T15:00:00.000Z');
  assert.equal(slotFor(new Date('2026-11-01T10:00:00Z')).toISOString(), '2026-10-30T15:00:00.000Z');
  assert.equal(nextSlot(WED).toISOString(), '2026-10-30T15:00:00.000Z');
  assert.equal(nextSlot(FRI_AFTER).toISOString(), '2026-11-06T15:00:00.000Z');
  assert.deepEqual(parseSlot('FRI 15:00'), { day: 5, hour: 15, minute: 0 });
  assert.deepEqual(parseSlot('monday 9:30'), { day: 1, hour: 9, minute: 30 });
  assert.equal(parseSlot('FRI 25:00'), null);
  assert.equal(parseSlot('someday'), null);
  assert.deepEqual(slotFrom({ NEWSLETTER_SLOT: 'TUE 08:15' }), { day: 2, hour: 8, minute: 15 });
  assert.deepEqual(slotFrom({ NEWSLETTER_SLOT: 'garbage' }), NEWSLETTER_SLOT);
});

test('the unsubscribe token verifies its own user id and nothing else', () => {
  const t = unsubscribeToken(42, KEY);
  assert.equal(verifyUnsubscribe('42', t, KEY), true);
  assert.equal(verifyUnsubscribe(42, t, KEY), true);
  assert.equal(verifyUnsubscribe('43', t, KEY), false, 'another account');
  assert.equal(verifyUnsubscribe('42', `${t.slice(0, -1)}x`, KEY), false, 'a tampered token');
  assert.equal(verifyUnsubscribe('42', t, 'another-secret-entirely'), false, 'another key');
  assert.equal(verifyUnsubscribe('42', '', KEY), false);
  assert.equal(verifyUnsubscribe('42 OR 1=1', t, KEY), false);
  assert.equal(verifyUnsubscribe(null, null, KEY), false);
  assert.throws(() => unsubscribeToken(42, ''));
  assert.equal(unsubscribeUrl(42, KEY), `https://p0dcasters.com/newsletter/unsubscribe?u=42&t=${t}`);
});

test('List-Unsubscribe carries the one-click URL and the mailto, plus List-Unsubscribe-Post', () => {
  const h = listUnsubscribeHeaders(7, KEY);
  assert.equal(h['List-Unsubscribe'], `<${unsubscribeUrl(7, KEY)}>, <mailto:unsubscribe@p0dcasters.com?subject=unsubscribe>`);
  assert.equal(h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

test('buildIssue renders the sections that have something, escapes feed text, and has the footer links', () => {
  const issue = buildIssue(DATA);
  assert.equal(issue.week, '2026-W44');
  assert.equal(issue.sections, 2);
  assert.match(issue.subject, /2 new shows/);
  assert.ok(issue.html.includes('https://p0dcasters.com/podcast/new-show'));
  assert.ok(issue.html.includes('A &lt;New&gt; Show'), 'feed titles are escaped');
  assert.ok(!issue.html.includes('<New>'));
  assert.ok(issue.text.includes('A <New> Show'));
  // Empty sections are left out entirely.
  assert.ok(!issue.html.includes('Most followed'));
  assert.ok(!issue.html.includes('From the networks'));
  assert.ok(issue.html.includes('New episodes from the big catalogues'));
  // Footer: the unsubscribe link (per reader) and the account settings link.
  for (const body of [issue.html, issue.text]) {
    assert.ok(body.includes(UNSUBSCRIBE_PLACEHOLDER));
    assert.ok(body.includes('https://p0dcasters.com/account'));
  }
  const mine = personalise(issue, unsubscribeUrl(9, KEY));
  assert.ok(!mine.html.includes(UNSUBSCRIBE_PLACEHOLDER) && !mine.text.includes(UNSUBSCRIBE_PLACEHOLDER));
  assert.ok(mine.text.includes(unsubscribeUrl(9, KEY)));
  assert.ok(mine.html.includes(unsubscribeUrl(9, KEY).replace('&', '&amp;')));

  const empty = buildIssue({ ...DATA, added: { count: 0, shows: [] }, fresh: [] });
  assert.equal(empty.sections, 0);
  assert.doesNotMatch(empty.subject, /new show/);
});

/** An in-memory NewsletterStore that records every write. */
function memStore({ users = [{ id: 1, email: 'a@x.co', created_at: 0, newsletter: 1 }, { id: 2, email: 'b@x.co', created_at: 0, newsletter: 1 }], data = DATA } = {}) {
  const issues = new Map();
  const sends = new Map();
  const writes = [];
  const owed = (week, before) => users.filter((u) => u.newsletter === 1 && u.created_at <= before && !sends.has(`${week}:${u.id}`));
  return {
    issues,
    sends,
    writes,
    users,
    async ensure() { writes.push('ensure'); },
    async gather() { return data; },
    async issue(week) { return issues.get(week) ?? null; },
    async saveIssue(issue, at) {
      writes.push('saveIssue');
      if (!issues.has(issue.week)) issues.set(issue.week, { ...issue, created_at: at, sent_count: 0, finished_at: null });
    },
    async pending(week, before, limit) { return owed(week, before).slice(0, limit).map(({ id, email }) => ({ id, email })); },
    async pendingCount(week, before) { return owed(week, before).length; },
    async claim(week, id, at) {
      writes.push(`claim:${id}`);
      if (sends.has(`${week}:${id}`)) return false;
      sends.set(`${week}:${id}`, { status: 'sending', at });
      return true;
    },
    async mark(week, id, status, at, error) { writes.push(`mark:${id}:${status}`); sends.set(`${week}:${id}`, { status, at, error }); },
    async finish(week, at) {
      writes.push('finish');
      const i = issues.get(week);
      if (i && !i.finished_at) Object.assign(i, { finished_at: at, sent_count: [...sends.values()].filter((s) => s.status === 'sent').length });
    },
  };
}

function sender(store, { env = {}, fail = () => false } = {}) {
  const mails = [];
  const gaps = [];
  return {
    mails,
    gaps,
    deps: {
      store,
      key: KEY,
      env,
      sleep: async (ms) => void gaps.push(ms),
      send: async (m) => {
        // The row is claimed before the mail goes out, never after.
        assert.equal(store.sends.get(`2026-W44:${store.users.find((u) => u.email === m.to).id}`)?.status, 'sending');
        if (fail(m)) throw new Error('resend 500');
        mails.push(m);
      },
    },
  };
}

test('before the slot a pass does nothing at all', async () => {
  const store = memStore();
  const s = sender(store);
  const r = await runWeeklyNewsletter(s.deps, { now: WED });
  assert.equal(r.state, 'before-slot');
  assert.equal(r.nextAt, '2026-10-30T15:00:00.000Z');
  assert.deepEqual(store.writes, []);
  assert.equal(s.mails.length, 0);
});

test('NEWSLETTER_SEND=0 stops a real pass', async () => {
  const store = memStore();
  const r = await runWeeklyNewsletter(sender(store, { env: { NEWSLETTER_SEND: '0' } }).deps, { now: FRI_AFTER });
  assert.equal(r.state, 'disabled');
  assert.deepEqual(store.writes, []);
});

test('after the slot: one issue, one mail each with its own unsubscribe link and headers, throttled', async () => {
  const store = memStore({ users: [1, 2, 3].map((id) => ({ id, email: `u${id}@x.co`, created_at: 0, newsletter: 1 })).concat([{ id: 4, email: 'off@x.co', created_at: 0, newsletter: 0 }]) });
  const s = sender(store);
  const r = await runWeeklyNewsletter(s.deps, { now: FRI_AFTER });
  assert.equal(r.state, 'sent');
  assert.equal(r.sent, 3);
  assert.equal(s.mails.length, 3);
  assert.ok(!s.mails.some((m) => m.to === 'off@x.co'), 'an opted-out account gets nothing');
  assert.deepEqual(s.gaps, [SEND_GAP_MS, SEND_GAP_MS]);
  for (const m of s.mails) {
    const id = Number(m.to.slice(1, 2));
    assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.ok(m.headers['List-Unsubscribe'].includes(unsubscribeUrl(id, KEY)));
    assert.ok(m.text.includes(unsubscribeUrl(id, KEY)));
    assert.ok(!m.html.includes(UNSUBSCRIBE_PLACEHOLDER));
  }
  assert.equal(store.issues.get('2026-W44').finished_at > 0, true);
  assert.equal(store.issues.get('2026-W44').sent_count, 3);
});

test('the sender is idempotent: a second pass, and a row already claimed, send nothing more', async () => {
  const store = memStore();
  const s = sender(store);
  await runWeeklyNewsletter(s.deps, { now: FRI_AFTER });
  assert.equal(s.mails.length, 2);
  const again = await runWeeklyNewsletter(s.deps, { now: new Date('2026-10-30T15:20:00Z') });
  assert.equal(again.state, 'done');
  assert.equal(s.mails.length, 2);

  // Someone else (a crashed pass, another process) holds a row: that account is skipped.
  const other = memStore();
  other.sends.set('2026-W44:1', { status: 'sending', at: 1 });
  const t = sender(other);
  const r = await runWeeklyNewsletter(t.deps, { now: FRI_AFTER });
  assert.deepEqual(t.mails.map((m) => m.to), ['b@x.co']);
  assert.equal(r.remaining, 0);
});

test('a failed send is recorded as failed and never retried; the batch cap holds', async () => {
  const store = memStore();
  const s = sender(store, { fail: (m) => m.to === 'a@x.co' });
  const r = await runWeeklyNewsletter(s.deps, { now: FRI_AFTER });
  assert.equal(r.failed, 1);
  assert.equal(r.sent, 1);
  assert.equal(store.sends.get('2026-W44:1').status, 'failed');
  assert.match(store.sends.get('2026-W44:1').error, /resend 500/);
  await runWeeklyNewsletter(s.deps, { now: FRI_AFTER });
  assert.equal(s.mails.length, 1);

  const capped = memStore();
  const c = sender(capped);
  const first = await runWeeklyNewsletter(c.deps, { now: FRI_AFTER, limit: 1 });
  assert.equal(first.sent, 1);
  assert.equal(first.remaining, 1);
  assert.equal(capped.issues.get('2026-W44').finished_at, null);
  const second = await runWeeklyNewsletter(c.deps, { now: FRI_AFTER, limit: 1 });
  assert.equal(second.sent, 1);
  assert.equal(second.remaining, 0);
});

test('a run of failures stops the pass and leaves the rest owed', async () => {
  const store = memStore({ users: [1, 2, 3, 4, 5].map((id) => ({ id, email: `u${id}@x.co`, created_at: 0, newsletter: 1 })) });
  const s = sender(store, { fail: () => true });
  const r = await runWeeklyNewsletter(s.deps, { now: FRI_AFTER });
  assert.equal(r.failed, 3);
  assert.match(r.stopped, /3 sends in a row failed/);
  assert.equal(r.remaining, 2);
  assert.equal(store.sends.size, 3, 'only the three that were tried are claimed');
});

test('a dry run sends nothing and writes nothing, before or after the slot', async () => {
  for (const now of [WED, FRI_AFTER]) {
    const store = memStore();
    const s = sender(store);
    const r = await runWeeklyNewsletter(s.deps, { dryRun: true, now });
    assert.equal(r.state, 'dry-run');
    assert.equal(r.recipients, 2);
    assert.equal(r.issue.week, '2026-W44');
    assert.ok(r.issue.html.includes('new-show'));
    assert.deepEqual(store.writes, [], 'no DDL, no issue, no send rows');
    assert.equal(store.sends.size, 0);
    assert.equal(s.mails.length, 0);
  }
});

test('an issue with nothing in it is not sent', async () => {
  const store = memStore({ data: { ...DATA, added: { count: 0, shows: [] }, fresh: [] } });
  const s = sender(store);
  const r = await runWeeklyNewsletter(s.deps, { now: FRI_AFTER });
  assert.equal(r.state, 'empty');
  assert.equal(s.mails.length, 0);
  assert.equal(store.sends.size, 0);
});

/** The SQL store against SQLite, with the tables the Postgres DDL makes. */
function sqliteDb() {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT, created_at INTEGER, newsletter INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE podcasts(slug TEXT, title TEXT, host TEXT, author TEXT, owner TEXT, feed_url TEXT, newest_pubdate INTEGER, created_on INTEGER, episode_count INTEGER, score REAL);
    CREATE TABLE follows(user_id INTEGER, slug TEXT, created_at INTEGER);
    CREATE TABLE submissions(slug TEXT, status TEXT, created_at INTEGER, resolved_at INTEGER, reviewed_at INTEGER);
    CREATE TABLE newsletter_issues(week TEXT PRIMARY KEY, subject TEXT, html TEXT, text TEXT, created_at INTEGER, sent_count INTEGER DEFAULT 0, finished_at INTEGER);
    CREATE TABLE newsletter_sends(week TEXT, user_id INTEGER, status TEXT, at INTEGER, error TEXT, PRIMARY KEY(week, user_id));
  `);
  const ins = d.prepare('INSERT INTO podcasts VALUES(?,?,?,?,?,?,?,?,?,?)');
  ins.run('fresh-new', 'Fresh New', 'a.org', 'A', null, 'https://a.org/feed', UNTIL - 100, UNTIL - 200, 3, 1);
  ins.run('deep', 'Deep Catalogue', 'feeds.twit.tv', 'TWiT', null, 'https://feeds.twit.tv/x.xml', UNTIL - 300, 1, 500, 9);
  ins.run('ancient', 'Ancient', 'b.org', null, null, 'https://b.org/feed', UNTIL - 30 * 86400, 1, 500, 5);
  d.exec(`INSERT INTO follows VALUES(1, 'deep', ${UNTIL - 50}), (2, 'deep', ${UNTIL - 60}), (1, 'ancient', 5)`);
  d.exec(`INSERT INTO users VALUES(1, 'a@x.co', 0, 1), (2, 'b@x.co', 0, 0), (3, 'late@x.co', ${UNTIL + 10}, 1)`);
  return {
    d,
    all: async (sql, p = []) => d.prepare(sql).all(...p),
    run: async (sql, p = []) => d.prepare(sql).run(...p).changes,
  };
}

test('the SQL store reads real-shaped tables and the sender writes each row once', async () => {
  const db = sqliteDb();
  const store = sqlStore(db, { ddl: false });
  const data = await store.gather(UNTIL, '2026-W44');
  assert.equal(data.added.count, 1);
  assert.deepEqual(data.added.shows.map((s) => s.slug), ['fresh-new']);
  assert.deepEqual(data.followed.map((s) => [s.slug, s.follows]), [['deep', 2]]);
  assert.deepEqual(data.fresh.map((s) => s.slug), ['deep']);
  assert.deepEqual(data.networks, [{ slug: 'twit', name: data.networks[0].name, shows: 1 }]);

  const mails = [];
  const deps = { store, key: KEY, env: {}, sleep: async () => {}, send: async (m) => void mails.push(m) };
  const r = await runWeeklyNewsletter(deps, { now: FRI_AFTER });
  // Opted out (2) and made after the slot (3) are not owed this week's issue.
  assert.deepEqual(mails.map((m) => m.to), ['a@x.co']);
  assert.equal(r.remaining, 0);
  assert.deepEqual(db.d.prepare('SELECT user_id, status FROM newsletter_sends').all(), [{ user_id: 1, status: 'sent' }]);
  assert.equal(db.d.prepare('SELECT sent_count FROM newsletter_issues').get().sent_count, 1);
  await runWeeklyNewsletter(deps, { now: FRI_AFTER });
  assert.equal(mails.length, 1);
});

test('the signup checkbox rides the link: unticked is false, anything else opts in', async () => {
  const base = { signup: true, first_name: 'Ada', last_name: 'Lovelace' };
  const off = signupProfileFrom({ ...base, newsletter: false }, 'ada@acme.com');
  assert.equal(newsletterChoice(off.pending), false);
  const on = signupProfileFrom({ ...base, newsletter: true }, 'ada@acme.com');
  assert.equal(newsletterChoice(on.pending), true);
  assert.equal(newsletterChoice(signupProfileFrom(base, 'ada@acme.com').pending), true);
  assert.equal(newsletterChoice(null), null, 'a sign-in link carries no choice');
  // The flag is not a profile field: the profile still saves with it on the link.
  const profiles = createProfileStore(new Database(':memory:'));
  await profiles.migrate();
  await saveVerifiedProfile(profiles, { id: 1, email: 'ada@acme.com' }, off.pending);
  const saved = await profiles.get('1');
  assert.equal(saved.first_name, 'Ada');
  assert.equal('newsletter' in saved, false);
});

test('the daemon registers the newsletter job every 15 minutes, beside the pipeline', async () => {
  const jobs = [];
  let opts = null;
  buildDaemon({
    createDaemon: (o) => ((opts = o), { pipeline() {}, job: (s) => void jobs.push(s) }),
    store: memoryStore(),
    newsletter: async () => ({ state: 'before-slot', issue: { html: 'big' } }),
    console: { log() {}, error() {} },
  });
  assert.equal(opts.concurrency, 2, 'the hours-long pipeline must not hold the digest back');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].name, NEWSLETTER_JOB);
  assert.equal(jobs[0].every, '15m');
  assert.equal(jobs[0].staleAfter, undefined);
  assert.deepEqual(await jobs[0].run({}), { state: 'before-slot' }, 'the issue stays out of the run record');

  // And on the real package.
  let calls = 0;
  const daemon = buildDaemon({ createDaemon, store: memoryStore(), newsletter: async () => ({ state: 'done', sent: 0, n: ++calls }), console: { log() {}, error() {} } });
  const out = await daemon.runNow(NEWSLETTER_JOB);
  assert.equal(out.ok, true);
  assert.equal(calls, 1);
});
