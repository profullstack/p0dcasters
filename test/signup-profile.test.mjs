import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { createProfileStore } from '@profullstack/profile';
import { signupProfileFrom, parsePending, saveVerifiedProfile } from '../src/lib/auth/signupProfile.ts';

test('a /signup link carries the fields and they are stored on verify', async () => {
  const sent = signupProfileFrom(
    {
      signup: true,
      first_name: 'Ada',
      last_name: 'Lovelace',
      company_domain: 'https://www.Acme.com/about',
      job_title: 'VP Engineering',
      linkedin_url: 'in/ada-lovelace',
    },
    'ada@acme.com',
  );
  assert.equal(sent.ok, true);
  assert.ok(sent.pending, 'a signup link carries a profile');

  const store = createProfileStore(new Database(':memory:'));
  await store.migrate();
  await saveVerifiedProfile(store, { id: 7, email: 'ada@acme.com' }, sent.pending);

  const saved = await store.get('7');
  assert.equal(saved.email, 'ada@acme.com');
  assert.equal(saved.first_name, 'Ada');
  assert.equal(saved.last_name, 'Lovelace');
  assert.equal(saved.company_domain, 'acme.com');
  assert.equal(saved.job_title, 'VP Engineering');
  assert.equal(saved.linkedin_url, 'https://www.linkedin.com/in/ada-lovelace');
});

test('a signup without a name is refused before any link is minted', () => {
  const sent = signupProfileFrom({ signup: true, first_name: 'Ada' }, 'ada@acme.com');
  assert.equal(sent.ok, false);
  assert.ok(sent.errors.last_name);
});

test('plain sign-in is never asked for the fields', async () => {
  const sent = signupProfileFrom({ email: 'ada@acme.com' }, 'ada@acme.com');
  assert.deepEqual(sent, { ok: true, pending: null });
  assert.equal(parsePending(null), null);
  assert.equal(parsePending('not json'), null);
  // A sign-in link saves nothing, and a broken store never throws at the caller.
  await saveVerifiedProfile({ save() { throw new Error('boom'); } }, { id: 1, email: 'a@b.co' }, null);
});
