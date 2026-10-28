import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrableDomain } from '../src/lib/domain.ts';

test('platform subdomains fold to the registrable domain', () => {
  assert.equal(registrableDomain('rss.libsyn.com'), 'libsyn.com');
  assert.equal(registrableDomain('feeds.libsyn.com'), 'libsyn.com');
  assert.equal(registrableDomain('libsyn.com'), 'libsyn.com');
  assert.equal(registrableDomain('FEEDS.Buzzsprout.com.'), 'buzzsprout.com');
});

test('multi-label public suffixes are respected', () => {
  assert.equal(registrableDomain('podcast.example.co.uk'), 'example.co.uk');
  assert.equal(registrableDomain('www.abc.net.au'), 'abc.net.au');
});

test('private suffixes keep owners apart', () => {
  assert.equal(registrableDomain('alice.github.io'), 'alice.github.io');
  assert.notEqual(registrableDomain('alice.github.io'), registrableDomain('bob.github.io'));
});

test('hosts with no registrable part come back as themselves', () => {
  assert.equal(registrableDomain('127.0.0.1'), '127.0.0.1');
  assert.equal(registrableDomain(''), '');
  assert.equal(registrableDomain(null), '');
});
