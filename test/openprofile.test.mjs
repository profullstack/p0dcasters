import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenProfile, broadcasts, accounts, topics, kindOf, identityValue, applyOverrides, overridesFromDocument, renderOpenProfile } from '@profullstack/openprofile';
import {
  generateProfile,
  cadenceBand,
  isOrganization,
  firstSentence,
  claimMethod,
  linksBack,
  encodeCursor,
  decodeCursor,
  profileUrl,
} from '../src/lib/openprofile/generate.ts';
import { parseChannel } from '../src/lib/openprofile/channel.ts';

const SHOW = {
  slug: 'inspiring-founders-podcast',
  title: 'Inspiring Founders Podcast',
  description: 'Most startups don’t fail because the idea is bad. They fail because the journey is harder than expected. Inspiring Founders explores what it really takes.',
  image_url: 'https://cdn.example/art.jpg',
  link: 'https://www.inspiringfounders.com',
  host: 'anchor.fm',
  author: 'Mash (Michael) Ashley',
  owner: 'Mash (Michael) Ashley',
  language: 'en-us',
  lang_base: 'en',
  categories: 'business,entrepreneurship',
  category: 'business',
  feed_url: 'https://anchor.fm/s/10a3cb530/podcast/rss',
  oldest_pubdate: Date.UTC(2025, 10, 3) / 1000,
  per_week: 0.2,
  episode_count: 11,
};

const FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Inspiring Founders Podcast</title>
  <link>https://www.inspiringfounders.com</link>
  <description><![CDATA[Honest conversations with founders. Profile: https://p0dcasters.com/podcast/inspiring-founders-podcast/openprofile.md]]></description>
  <itunes:author>Mash (Michael) Ashley</itunes:author>
  <itunes:owner><itunes:name>Mash (Michael) Ashley</itunes:name><itunes:email>Mash@Example.com</itunes:email></itunes:owner>
  <language>en-us</language>
  <podcast:person href="https://www.linkedin.com/in/mashashley" role="host">Mash Ashley</podcast:person>
  <podcast:person href="https://bsky.app/profile/mash.example" role="host">Mash Ashley</podcast:person>
  <podcast:funding url="https://www.patreon.com/inspiringfounders">Support the show</podcast:funding>
  <atom:link rel="me" href="https://github.com/mash"/>
  <atom:link rel="self" href="https://anchor.fm/s/10a3cb530/podcast/rss"/>
  <item><title>Ep 1</title><enclosure url="https://cdn.example/1.mp3" type="audio/mpeg"/></item>
</channel></rss>`;

test('the generated profile: a person, the site, the avatar, the show as a Broadcast section', () => {
  const doc = generateProfile(SHOW);
  assert.equal(doc.name, 'Mash (Michael) Ashley');
  assert.equal(kindOf(doc), 'person');
  assert.equal(identityValue(doc, 'Web'), 'https://www.inspiringfounders.com');
  assert.equal(identityValue(doc, 'Avatar'), 'https://cdn.example/art.jpg');
  assert.equal(doc.headline, 'Host of Inspiring Founders Podcast.');
  assert.deepEqual(topics(doc), ['business', 'entrepreneurship']);
  const [b] = broadcasts(doc);
  assert.equal(b.Show, 'Inspiring Founders Podcast');
  assert.equal(b.Kind, 'podcast');
  assert.equal(b.Cadence, 'monthly');
  assert.equal(b.Language, 'en');
  assert.equal(b.Since, '2025-11');
  assert.equal(b.Feed, SHOW.feed_url);
  assert.equal(b.Listen, 'https://p0dcasters.com/podcast/inspiring-founders-podcast');
  assert.equal(b.Topics, 'business, entrepreneurship');
  assert.match(b.Description, /^Most startups/);
  // Nothing the host did not write.
  for (const k of ['Seeking', 'Not', 'Pays', 'Charges', 'Slots', 'Book']) assert.equal(b[k], undefined, k);
  assert.equal(doc.sections.find((s) => s.name === 'guest'), undefined);
  assert.equal(doc.sections.find((s) => s.name === 'accounts'), undefined, 'no accounts without the feed');
  const md = renderOpenProfile(doc);
  assert.ok(md.startsWith('# Mash (Michael) Ashley\n\n- **Kind**: person\n'));
  assert.ok(!md.includes('\u2014'), 'no em dashes');
});

test('the channel adds accounts and funding, never the site itself', () => {
  const ch = parseChannel(FEED);
  assert.equal(ch.ownerEmail, 'Mash@Example.com');
  assert.equal(ch.ownerName, 'Mash (Michael) Ashley');
  assert.equal(ch.link, 'https://www.inspiringfounders.com');
  assert.deepEqual(ch.accounts, ['https://www.linkedin.com/in/mashashley', 'https://bsky.app/profile/mash.example', 'https://github.com/mash']);
  assert.deepEqual(ch.funding, [{ label: 'Support the show', url: 'https://www.patreon.com/inspiringfounders' }]);
  const doc = generateProfile(SHOW, { accounts: [...ch.accounts, 'https://inspiringfounders.com/'], funding: ch.funding });
  assert.deepEqual(accounts(doc).map((a) => a.url), ch.accounts, 'the site is Web, not an account');
  const links = doc.sections.find((s) => s.name === 'links');
  assert.equal(links.body, '- Support the show: https://www.patreon.com/inspiringfounders');
});

test('organisation or person: the title as author, a company word, all caps', () => {
  assert.equal(isOrganization('Inspiring Founders Podcast', 'Inspiring Founders Podcast'), true);
  assert.equal(isOrganization('Acme Media', 'The Acme Show'), true);
  assert.equal(isOrganization('BBC', 'In Our Time'), true);
  assert.equal(isOrganization('First Baptist Church', 'Sunday Sermons'), true);
  assert.equal(isOrganization('Pigweed and Crowhill', 'Beer and Conversation with Pigweed and Crowhill'), false);
  assert.equal(isOrganization('Mash (Michael) Ashley', 'Inspiring Founders Podcast'), false);
  assert.equal(isOrganization(null, 'A Show'), false);
  const org = generateProfile({ ...SHOW, author: 'Inspiring Founders Podcast' });
  assert.equal(kindOf(org), 'organization');
  assert.equal(org.headline, 'Publishes Inspiring Founders Podcast.');
  const none = generateProfile({ ...SHOW, author: null, owner: null });
  assert.equal(none.name, 'Inspiring Founders Podcast');
  assert.equal(kindOf(none), 'organization');
});

test('cadence bands are the spec words, and silence for no rhythm', () => {
  assert.equal(cadenceBand(7), 'daily');
  assert.equal(cadenceBand(3), '3 times a week');
  assert.equal(cadenceBand(1), 'weekly');
  assert.equal(cadenceBand(0.5), 'fortnightly');
  assert.equal(cadenceBand(0.2), 'monthly');
  assert.equal(cadenceBand(0.05), null);
  assert.equal(cadenceBand(null), null);
  assert.equal(firstSentence('<p>One. Two.</p>'), 'One. Two.');
  assert.equal(firstSentence('A very long first sentence that goes on. Then more.'), 'A very long first sentence that goes on.');
});

test('an owner edit is an overlay: their sections win, the rest keeps following the feed', () => {
  const generated = generateProfile(SHOW);
  const edited = renderOpenProfile(generated)
    .replace('Host of Inspiring Founders Podcast.', 'Founder, host, recovering engineer.')
    .replace('## Topics\n\n- business\n- entrepreneurship', '## Topics\n\n- startups')
    + '\n## Guest\n\n- **Available**: selectively\n- **Expertise**: customer discovery, fundraising\n- **Rate**: free\n\n## Broadcast\n\n- **Seeking**: founders with a failure story\n- **Pays**: no\n';
  const overrides = overridesFromDocument(edited, generated);
  const shown = applyOverrides(generated, overrides);
  assert.equal(shown.headline, 'Founder, host, recovering engineer.');
  assert.deepEqual(topics(shown), ['startups']);
  const g = shown.sections.find((s) => s.name === 'guest');
  assert.match(g.body, /Expertise/);
  // The owner wrote a Broadcast section: it replaces the generated one wholesale,
  // and a later regeneration from the feed still yields their version.
  const [b] = broadcasts(shown);
  assert.equal(b.Seeking, 'founders with a failure story');
  const again = applyOverrides(generateProfile({ ...SHOW, per_week: 1 }), overrides);
  assert.equal(broadcasts(again)[0].Seeking, 'founders with a failure story');
  // Removal: `none`.
  const gone = applyOverrides(generated, { sections: { topics: 'none' } });
  assert.equal(gone.sections.find((s) => s.name === 'topics'), undefined);
  // Round trip through the parser is stable.
  const md = renderOpenProfile(shown);
  assert.equal(renderOpenProfile(parseOpenProfile(md)), md);
});

test('claim verification: owner address, site link, feed link, or nothing', () => {
  const ch = parseChannel(FEED);
  assert.equal(claimMethod({ userEmail: 'mash@example.com', ownerEmail: ch.ownerEmail, slug: SHOW.slug }), 'owner-email');
  assert.equal(claimMethod({ userEmail: 'other@example.com', ownerEmail: ch.ownerEmail, feedText: ch.text, slug: SHOW.slug }), 'feed-link');
  assert.equal(claimMethod({ userEmail: 'other@example.com', ownerEmail: null, siteHtml: `<link rel="openprofile" href="${profileUrl(SHOW.slug)}">`, slug: SHOW.slug }), 'site-link');
  assert.equal(claimMethod({ userEmail: 'other@example.com', ownerEmail: 'x@y.z', siteHtml: '<a href="https://p0dcasters.com/podcast/inspiring-founders-podcast">listing</a>', slug: SHOW.slug }), null, 'the show page itself does not count');
  assert.equal(linksBack(null, SHOW.slug), false);
});

test('the listing cursor round-trips and rejects junk', () => {
  const c = { updatedAt: 1757721600, id: 42 };
  assert.deepEqual(decodeCursor(encodeCursor(c)), c);
  assert.equal(decodeCursor('not-a-cursor'), null);
  assert.equal(decodeCursor(''), null);
});
