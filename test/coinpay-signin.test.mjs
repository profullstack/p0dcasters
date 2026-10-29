import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginSignIn,
  canDisconnect,
  decodePending,
  encodePending,
  isPlaceholderEmail,
  resolveCoinpayUser,
} from '../src/lib/auth/coinpay.ts';
import { seal } from '../src/lib/auth/crypto.ts';

const cfg = { clientId: 'cp_test', clientSecret: 'x', base: 'https://coinpayportal.com', siteUrl: 'https://p0dcasters.com' };

/** In-memory CoinpayStore plus a users table with one email-registered victim. */
function memStore() {
  const users = new Map([[1, { id: 1, email: 'victim@example.com' }]]);
  const ids = new Map();
  let nextId = 2;
  return {
    users,
    ids,
    async identityBySub(sub) { return ids.get(sub) ?? null; },
    async identityByUser(userId) { return [...ids.values()].find((r) => r.user_id === userId) ?? null; },
    async link(row) {
      if (ids.has(row.coinpay_sub) || [...ids.values()].some((r) => r.user_id === row.user_id)) return 'conflict';
      ids.set(row.coinpay_sub, row);
      return 'ok';
    },
    async unlink(userId) { for (const [k, r] of ids) if (r.user_id === userId) ids.delete(k); },
    async touch() {},
    async createUser(email) { const id = nextId++; users.set(id, { id, email }); return id; },
    async deleteUser(id) { users.delete(id); },
  };
}

test('authorize URL carries PKCE S256, state, nonce and the exact redirect', () => {
  const { pending, url } = beginSignIn(cfg, 'login', '/following');
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://coinpayportal.com/api/oauth/authorize');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(u.searchParams.get('code_challenge'));
  assert.equal(u.searchParams.get('state'), pending.state);
  assert.equal(u.searchParams.get('nonce'), pending.nonce);
  assert.equal(u.searchParams.get('redirect_uri'), 'https://p0dcasters.com/api/v1/coinpay/oauth/callback');
  assert.equal(u.searchParams.get('scope'), 'openid profile email');
});

test('pending cookie round-trips, and a forged or edited one is refused', () => {
  const { pending } = beginSignIn(cfg, 'login', '/x');
  const sealed = encodePending(pending);
  assert.deepEqual(decodePending(sealed), pending);
  // Unsigned JSON, or a signed value with the state swapped, are both refused.
  assert.equal(decodePending(Buffer.from(JSON.stringify({ ...pending, state: 'evil' })).toString('base64url') + '.bad'), null);
  const [body, sig] = sealed.split('.');
  const edited = Buffer.from(JSON.stringify({ ...pending, state: 'evil' })).toString('base64url');
  assert.equal(decodePending(`${edited}.${sig}`), null);
  assert.ok(body);
  // Expired is refused even with a valid signature.
  assert.equal(decodePending(seal(JSON.stringify({ ...pending, exp: 1 }))), null);
  assert.equal(decodePending(undefined), null);
});

test('an open-redirect next is dropped', () => {
  const { pending } = beginSignIn(cfg, 'login', '//evil.com');
  assert.equal(pending.next, '');
});

test('a CoinPay login carrying an existing user email gets a NEW account, not theirs', async () => {
  const store = memStore();
  const r = await resolveCoinpayUser(
    { mode: 'login', currentUserId: null, claims: { sub: 'attacker-sub', email: 'victim@example.com', name: null } },
    store,
  );
  assert.equal(r.ok, true);
  assert.equal(r.action, 'created');
  assert.notEqual(r.userId, 1);
  assert.ok(isPlaceholderEmail(store.users.get(r.userId).email), 'new account email is a placeholder');
  assert.notEqual(store.users.get(r.userId).email, 'victim@example.com');
  // The second login with the same sub lands on the same new account.
  const again = await resolveCoinpayUser(
    { mode: 'login', currentUserId: null, claims: { sub: 'attacker-sub', email: 'victim@example.com', name: null } },
    store,
  );
  assert.deepEqual([again.ok, again.userId, again.action], [true, r.userId, 'login']);
});

test('connecting needs a signed-in session', async () => {
  const store = memStore();
  const r = await resolveCoinpayUser({ mode: 'connect', currentUserId: null, claims: { sub: 's1', email: null, name: null } }, store);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not_signed_in');
  assert.equal(store.ids.size, 0);
});

test('connect links the signed-in account; then CoinPay login reaches it', async () => {
  const store = memStore();
  const c = await resolveCoinpayUser({ mode: 'connect', currentUserId: 1, claims: { sub: 's1', email: 'other@x.com', name: null } }, store);
  assert.deepEqual([c.ok, c.userId], [true, 1]);
  const l = await resolveCoinpayUser({ mode: 'login', currentUserId: null, claims: { sub: 's1', email: 'other@x.com', name: null } }, store);
  assert.deepEqual([l.ok, l.userId, l.action], [true, 1, 'login']);
  // A sub already bound elsewhere cannot be connected to another account.
  await store.createUser('b@x.com');
  const steal = await resolveCoinpayUser({ mode: 'connect', currentUserId: 2, claims: { sub: 's1', email: null, name: null } }, store);
  assert.equal(steal.code, 'linked_elsewhere');
});

test('disconnect is refused when CoinPay is the only way in', () => {
  assert.equal(canDisconnect({ email: 'cp-ab@coinpay.p0dcasters.invalid' }, 0), false);
  assert.equal(canDisconnect({ email: 'cp-ab@coinpay.p0dcasters.invalid' }, 1), true);
  assert.equal(canDisconnect({ email: 'real@example.com' }, 0), true);
});

test('callback checks: wrong state and wrong nonce are rejected', async () => {
  const { sameState, checkIdToken } = await import('@profullstack/coinpay-onboard/oauth');
  assert.equal(sameState('abc', 'abd'), false);
  assert.equal(sameState('abc', null), false);
  assert.equal(sameState('abc', 'abc'), true);
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok = (claims) => `${part({ alg: 'RS256' })}.${part(claims)}.sig`;
  const good = { iss: 'https://coinpayportal.com', sub: 's', aud: 'cp_test', exp: Math.floor(Date.now() / 1000) + 300, nonce: 'n1' };
  assert.equal(checkIdToken({ idToken: tok(good), clientId: 'cp_test', nonce: 'n1' }).sub, 's');
  assert.throws(() => checkIdToken({ idToken: tok(good), clientId: 'cp_test', nonce: 'other' }));
  assert.throws(() => checkIdToken({ idToken: tok({ ...good, aud: 'cp_else' }), clientId: 'cp_test', nonce: 'n1' }));
});
