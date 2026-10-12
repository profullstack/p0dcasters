import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORKS, networkOf, networkHost, networkWhere, networkBySlug } from '../src/lib/networks.ts';
import { platformName } from '../src/lib/platforms.ts';

const row = (o) => ({ host: '', feed_url: '', owner: null, author: null, ...o });

test('registry slugs are unique and every network has a rule', () => {
  const slugs = NETWORKS.map((n) => n.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const n of NETWORKS) {
    const m = n.match;
    assert.ok((m.hosts?.length || 0) + (m.urlPrefixes?.length || 0) + (m.owners?.length || 0) > 0, n.slug);
  }
});

test('a network is found by its own domain, subdomains included', () => {
  assert.equal(networkHost('twit.tv')?.slug, 'twit');
  assert.equal(networkHost('feeds.twit.tv')?.slug, 'twit');
  assert.equal(networkOf(row({ host: 'twit.tv', feed_url: 'https://feeds.twit.tv/ww.xml' }))?.slug, 'twit');
  assert.equal(networkHost('buzzsprout.com'), null);
});

test('a platform-hosted show is matched by declared owner, case-insensitively', () => {
  const nyt = networkBySlug('new-york-times');
  const owner = nyt.match.owners[0];
  assert.equal(networkOf(row({ host: 'simplecast.com', owner: owner.toUpperCase() }))?.slug, 'new-york-times');
  assert.equal(networkOf(row({ host: 'simplecast.com', owner: 'Somebody Else' })), null);
});

test('networkWhere binds one parameter per placeholder', () => {
  for (const n of NETWORKS) {
    const w = networkWhere(n);
    assert.equal((w.sql.match(/\?/g) || []).length, w.params.length, n.slug);
  }
});

test('platform names resolve on the registrable tail', () => {
  assert.equal(platformName('feeds.buzzsprout.com'), 'Buzzsprout');
  assert.equal(platformName('anchor.fm'), 'Spotify for Creators');
  assert.equal(platformName('example.com'), null);
});
