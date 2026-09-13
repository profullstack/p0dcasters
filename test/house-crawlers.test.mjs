import { test } from 'node:test';
import assert from 'node:assert/strict';
import { houseCrawler, isProfileRoute, houseCrawlerCredential } from '../src/lib/house-crawlers.ts';

const UA = 'niche-db/0.1 (+https://nichedb.dev)';

function req(path, ua = UA) {
  return new Request(`https://p0dcasters.com${path}`, { headers: ua ? { 'user-agent': ua } : {} });
}

test('nichedb names itself and is recognised by its prefix only', () => {
  assert.equal(houseCrawler(UA), 'niche-db');
  assert.equal(houseCrawler('Mozilla/5.0 niche-db/0.1'), null);
  assert.equal(houseCrawler(''), null);
  assert.equal(houseCrawler(null), null);
});

test('only the listing and the profile files are profile routes', () => {
  assert.equal(isProfileRoute('/api/openprofiles'), true);
  assert.equal(isProfileRoute('/podcast/inspiring-founders-podcast/openprofile.md'), true);
  assert.equal(isProfileRoute('/podcast/inspiring-founders-podcast'), false);
  assert.equal(isProfileRoute('/podcast/x/profile'), false);
  assert.equal(isProfileRoute('/api/openprofiles/extra'), false);
  assert.equal(isProfileRoute('/api/search'), false);
});

test('the credential exists only for a house crawler on a profile route', () => {
  assert.equal(houseCrawlerCredential(req('/api/openprofiles')), 'crawler:niche-db');
  assert.equal(houseCrawlerCredential(req('/podcast/a-show/openprofile.md?x=1')), 'crawler:niche-db');
  // Same crawler, any other route: anonymous, as before.
  assert.equal(houseCrawlerCredential(req('/podcast/a-show')), null);
  assert.equal(houseCrawlerCredential(req('/api/search?q=x')), null);
  // Same route, any other caller: anonymous, as before.
  assert.equal(houseCrawlerCredential(req('/api/openprofiles', 'curl/8.0')), null);
  assert.equal(houseCrawlerCredential(req('/api/openprofiles', '')), null);
});
