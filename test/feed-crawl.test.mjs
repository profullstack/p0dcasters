import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { SQL } from "bun";
import { createDaemon } from "@profullstack/scraper-daemon";
import * as lib from "../src/lib/feed-crawl.ts";
import { addShowCrawler } from "../scripts/daemon-lib.mjs";

const url = process.env.TEST_DATABASE_URL;
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86_400;

describe.skipIf(!url)("feed_state against Postgres", () => {
  let sql;
  let q;
  const db = `p0d_crawl_${process.pid}`;
  beforeAll(async () => {
    const admin = new SQL(url);
    await admin.unsafe(`CREATE DATABASE ${db}`);
    await admin.close();
    sql = new SQL(url.replace(/\/[^/]*$/, `/${db}`));
    q = (t, p = []) => sql.unsafe(t, p);
    await q(`CREATE TABLE podcasts(feed_url text, slug text, newest_pubdate bigint NOT NULL, per_week double precision,
      episode_count bigint NOT NULL DEFAULT 0, latest_audio text, latest_duration bigint)`);
    await q(`INSERT INTO podcasts VALUES
      ('https://feeds.example/weekly.xml', 'weekly', ${NOW - 9 * DAY}, 1, 20, 'old.mp3', 100),
      ('https://feeds.example/daily.xml', 'daily', ${NOW - DAY}, 7, 300, 'd.mp3', 100),
      ('https://feeds.example/gone.xml', 'gone', ${NOW - 200 * DAY}, 1, 5, 'g.mp3', 100)`);
    await lib.ensureFeedState(q);
  });
  afterAll(async () => {
    await sql?.close();
    const admin = new SQL(url);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
    await admin.close();
  });

  test("seeding guesses a cadence from the dump and archives long-silent shows", async () => {
    expect(await lib.seedFeedState(q)).toEqual({ added: 3, dropped: 0 });
    const rows = Object.fromEntries((await q(`SELECT feed_url, minutes FROM feed_state`)).map((r) => [r.feed_url, r.minutes]));
    expect(rows["https://feeds.example/weekly.xml"]).toBe(2520);
    expect(rows["https://feeds.example/daily.xml"]).toBe(360);
    expect(rows["https://feeds.example/gone.xml"]).toBe(129600);
    expect(await lib.seedFeedState(q)).toEqual({ added: 0, dropped: 0 });
  });

  test("due shows come back per tier, and a crawl moves the directory row forward", async () => {
    await q(`UPDATE feed_state SET next_at = now() - interval '1 minute'`);
    const slow = await lib.dueFeeds(q, 2, 10);
    expect(slow.map((f) => f.url)).toEqual(["https://feeds.example/weekly.xml"]);
    expect(await lib.dueFeeds(q, 4, 10)).toHaveLength(1);

    const feed = slow[0];
    const episodes = [
      { id: "a", title: "new", audio: "new.mp3", source: "new.mp3", pubdate: NOW - 3600, duration: 3000, description: "", image: null, link: null },
      { id: "b", title: "old", audio: "old.mp3", source: "old.mp3", pubdate: NOW - 9 * DAY, duration: 100, description: "", image: null, link: null },
    ];
    await lib.saveCrawl(q, feed, { minutes: 2520, nextAt: Date.now() + 2520 * 60_000 }, { notModified: false, episodes, dates: episodes.map((e) => e.pubdate * 1000), etag: '"v1"', lastModified: null });
    const [p] = await q(`SELECT newest_pubdate, latest_audio, episode_count FROM podcasts WHERE slug = 'weekly'`);
    expect(Number(p.newest_pubdate)).toBe(NOW - 3600);
    expect(p.latest_audio).toBe("new.mp3");
    const [s] = await q(`SELECT etag, dates, fails FROM feed_state WHERE feed_url = $1`, [feed.url]);
    expect(s.etag).toBe('"v1"');
    expect(await lib.dueFeeds(q, 2, 10)).toHaveLength(0);
  });

  test("a reload that swaps in older rows gets the crawler's dates back", async () => {
    await q(`UPDATE podcasts SET newest_pubdate = ${NOW - 9 * DAY} WHERE slug = 'weekly'`);
    expect(await lib.applyToPodcasts(q)).toBe(1);
    const [p] = await q(`SELECT newest_pubdate FROM podcasts WHERE slug = 'weekly'`);
    expect(Number(p.newest_pubdate)).toBe(NOW - 3600);
  });

  test("failures count, a 429 does not, and retiring parks the show for a quarter", async () => {
    await lib.saveFailure(q, { url: "https://feeds.example/daily.xml" }, { error: "HTTP 500", held: false, fails: 1, nextAt: Date.now(), retire: false });
    await lib.saveFailure(q, { url: "https://feeds.example/daily.xml" }, { error: "HTTP 429", held: true, fails: null, nextAt: Date.now(), retire: false });
    let [s] = await q(`SELECT fails, minutes FROM feed_state WHERE feed_url = 'https://feeds.example/daily.xml'`);
    expect(s.fails).toBe(1);
    await lib.saveFailure(q, { url: "https://feeds.example/daily.xml" }, { error: "HTTP 500", held: false, fails: 10, nextAt: Date.now(), retire: true });
    [s] = await q(`SELECT fails, minutes FROM feed_state WHERE feed_url = 'https://feeds.example/daily.xml'`);
    expect(s.minutes).toBe(129600);
  });

  test("shows dropped from the directory lose their state", async () => {
    await q(`DELETE FROM podcasts WHERE slug = 'gone'`);
    expect(await lib.seedFeedState(q)).toEqual({ added: 0, dropped: 1 });
  });
});

describe("addShowCrawler", () => {
  test("reads due shows hot first and writes the plan back", async () => {
    const saved = [];
    const fake = {
      seedFeedState: async () => ({ added: 0, dropped: 0 }),
      applyToPodcasts: async () => 0,
      dueFeeds: async (_q, tier, limit) =>
        tier === 0 && !saved.length ? [{ key: "a", url: "https://a.example/rss", minutes: 60, fails: 0, dates: [] }].slice(0, limit) : [],
      readFeed: async () => ({ notModified: false, episodes: [], dates: [Date.now() - 1_800_000, Date.now() - 3_600_000], etag: null, lastModified: null }),
      saveCrawl: async (_q, feed, plan) => void saved.push({ feed, plan }),
      saveFailure: async () => {},
    };
    const d = createDaemon({ log: () => {}, tickMs: 60_000 });
    addShowCrawler(d, { lib: fake, q: async () => [], concurrency: 4 }, { log: () => {} });
    d.start();
    await new Promise((r) => setTimeout(r, 50));
    await d.stop();
    expect(saved).toHaveLength(1);
    expect(saved[0].plan.minutes).toBe(15);
    expect(saved[0].plan.tier).toBe("hot");
  });
});
