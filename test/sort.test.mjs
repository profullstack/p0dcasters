import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FUTURE_SLACK_SECONDS, listHref, listSort, recentCeiling, sortSql } from '../src/lib/sort.ts';

test('only ?sort=recent switches; anything else is popular', () => {
  assert.equal(listSort('recent'), 'recent');
  assert.equal(listSort(undefined), 'popular');
  assert.equal(listSort('newest'), 'popular');
  assert.equal(listSort(['recent', 'x']), 'popular');
});

test('recent orders by the newest episode and stops a day ahead', () => {
  const now = Date.UTC(2026, 9, 29);
  const by = sortSql('recent');
  assert.equal(by.order, 'newest_pubdate DESC');
  assert.equal(by.where, ' AND newest_pubdate <= ?');
  assert.equal(recentCeiling(now), now / 1000 + FUTURE_SLACK_SECONDS);
  // A show whose next episode is dated next month is not "recent" yet.
  assert.ok(Date.UTC(2026, 10, 25) / 1000 > recentCeiling(now));
});

test('popular keeps the page\'s own order and adds no filter', () => {
  assert.deepEqual(sortSql('popular'), { where: '', order: 'score DESC', params: [] });
  assert.equal(sortSql('popular', 'score DESC, newest_pubdate DESC').order, 'score DESC, newest_pubdate DESC');
});

test('links keep the sort across pages; popular page 1 is the bare URL', () => {
  assert.equal(listHref('/category/comedy', 'popular'), '/category/comedy');
  assert.equal(listHref('/category/comedy', 'popular', 2), '/category/comedy?page=2');
  assert.equal(listHref('/category/comedy', 'recent'), '/category/comedy?sort=recent');
  assert.equal(listHref('/category/comedy', 'recent', 3), '/category/comedy?sort=recent&page=3');
});
