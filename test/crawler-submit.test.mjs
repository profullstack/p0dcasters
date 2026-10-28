import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCrawlerTokens, crawlerSource, isCrawlerSource } from '../src/lib/crawler-submit.ts';

const RAW = 'podcorn:0123456789abcdef0123, Discovery : fedcba9876543210fedc ,bad,short:abc,:nonamexxxxxxxxxxxxxx';

test('parses name:token pairs and drops malformed or short ones', () => {
  assert.deepEqual(parseCrawlerTokens(RAW), [
    ['podcorn', '0123456789abcdef0123'],
    ['discovery', 'fedcba9876543210fedc'],
  ]);
  assert.deepEqual(parseCrawlerTokens(undefined), []);
  assert.deepEqual(parseCrawlerTokens(''), []);
});

test('a matching token names the crawler as the source', () => {
  assert.equal(crawlerSource('0123456789abcdef0123', RAW), 'crawler:podcorn');
  assert.equal(crawlerSource(' fedcba9876543210fedc ', RAW), 'crawler:discovery');
});

test('no token, a wrong token, or no configured tokens is a manual submission', () => {
  assert.equal(crawlerSource(null, RAW), null);
  assert.equal(crawlerSource('', RAW), null);
  assert.equal(crawlerSource('0123456789abcdef0124', RAW), null);
  assert.equal(crawlerSource('0123456789abcdef012', RAW), null);
  assert.equal(crawlerSource('0123456789abcdef0123', undefined), null);
  assert.equal(crawlerSource('feed-submit/1.0', RAW), null);
});

test('only crawler:<name> sources auto-approve', () => {
  assert.equal(isCrawlerSource('crawler:podcorn'), true);
  assert.equal(isCrawlerSource('crawler:'), false);
  assert.equal(isCrawlerSource(null), false);
  assert.equal(isCrawlerSource(''), false);
  assert.equal(isCrawlerSource('anthony@profullstack.com'), false);
  assert.equal(isCrawlerSource('network:bbc'), false);
});
