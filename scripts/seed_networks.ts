// List the network shows the Podcast Index dump does not carry.
//
// Each network in src/lib/networks.json can name `seeds` (an OPML file, a JSON
// API or an HTML page that lists its feeds) and `feeds` (feed URLs by hand).
// Every feed found there goes through the same path a publisher's submission
// does -- src/lib/submit.ts reads it and applies the directory's rules -- and
// is then approved here instead of by a person, without the reviewer email:
// the list came from the network itself. A listed feed is a `submissions` row
// with status `listed`, so scripts/load_directory.mjs carries it across every
// rebuild and drops it again once the dump has the same feed.
//
// A feed already in the directory is skipped, as is one this script tried in
// the last week (a show past the 90-day rule is refused, and asking again
// every run would only grow the ledger).
//
//   DATABASE_URL=postgres://... bun scripts/seed_networks.ts [slug ...]
//   DRY_RUN=1 prints what each seed yields and lists nothing.
import { NETWORKS, type Network, type Seed } from "@/lib/networks";
import { createBatch, resolveSubmission, decideSubmission } from "@/lib/submit";
import { one } from "@/lib/db";

const UA = "p0dcasters/1.0 (+https://p0dcasters.com; network library seed)";
const WEEK = 7 * 86400;
const dry = process.env.DRY_RUN === "1";
const only = process.argv.slice(2);

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function extract(body: string, seed: Seed, base: string): string[] {
  const re =
    seed.kind === "opml" && !seed.pattern ? /xmlUrl\s*=\s*"([^"]+)"/gi : new RegExp(seed.pattern ?? "$^", "gi");
  const out: string[] = [];
  for (const m of body.matchAll(re)) {
    const hit = decode(m[1] ?? m[0]).trim();
    const u = seed.template ? seed.template.replace("{1}", hit) : hit;
    try {
      out.push(new URL(u, base).toString());
    } catch {
      /* not a URL */
    }
  }
  return out;
}

async function seedUrls(seed: Seed): Promise<string[]> {
  let body = await fetchText(seed.url);
  if (seed.where) {
    const { list, field, equals } = seed.where;
    const items = (JSON.parse(body)[list] ?? []) as Record<string, unknown>[];
    body = items.filter((i) => i[field] === equals).map((i) => JSON.stringify(i)).join("\n");
  }
  if (!seed.follow) return extract(body, seed, seed.url);
  const pages = new Set<string>();
  for (const m of body.matchAll(new RegExp(seed.follow, "gi"))) {
    try {
      pages.add(new URL(decode(m[1] ?? m[0]), seed.followBase ?? seed.url).toString());
    } catch {
      /* not a URL */
    }
  }
  const out: string[] = [];
  for (const page of pages) {
    try {
      out.push(...extract(await fetchText(page), seed, page));
    } catch {
      /* one show page down is not the seed down */
    }
  }
  return out;
}

async function networkFeeds(n: Network): Promise<string[]> {
  const urls = new Set<string>(n.feeds ?? []);
  for (const s of n.seeds ?? []) {
    try {
      const got = await seedUrls(s);
      console.log(`  ${s.kind} ${s.url}: ${got.length} feeds`);
      got.forEach((u) => urls.add(u));
    } catch (e) {
      console.log(`  seed failed ${s.url}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return [...urls];
}

async function triedRecently(url: string): Promise<boolean> {
  const r = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM submissions WHERE (input = ? OR feed_url = ?) AND created_at > ?",
    [url, url, Math.floor(Date.now() / 1000) - WEEK],
  );
  return Number(r?.n ?? 0) > 0;
}

async function inDirectory(url: string): Promise<boolean> {
  const bare = url.replace(/^https?:\/\//, "");
  const r = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM podcasts WHERE feed_url = ? OR feed_url = ?",
    [`https://${bare}`, `http://${bare}`],
  );
  return Number(r?.n ?? 0) > 0;
}

const totals = { found: 0, present: 0, recent: 0, listed: 0, existing: 0, refused: 0 };
for (const n of NETWORKS) {
  if (only.length && !only.includes(n.slug)) continue;
  if (!(n.seeds?.length || n.feeds?.length)) continue;
  console.log(`${n.slug}:`);
  const urls = await networkFeeds(n);
  totals.found += urls.length;
  if (dry) {
    urls.slice(0, 5).forEach((u) => console.log(`    ${u}`));
    continue;
  }
  for (const url of urls) {
    if (await inDirectory(url)) {
      totals.present += 1;
      continue;
    }
    if (await triedRecently(url)) {
      totals.recent += 1;
      continue;
    }
    const { ids } = await createBatch([url], { userId: null, ipHash: null, submittedBy: `network:${n.slug}` });
    const outcome = await resolveSubmission(ids[0], { notify: false });
    if (outcome?.status === "review") {
      const d = await decideSubmission(ids[0], "approve", `network:${n.slug}`, `listed from the ${n.name} feed list`);
      if (d.ok && d.status === "listed") {
        totals.listed += 1;
        console.log(`    listed ${d.slug}  ${url}`);
      } else if (d.ok) totals.existing += 1;
    } else if (outcome?.status === "existing" || outcome?.status === "listed") {
      totals.existing += 1;
    } else {
      totals.refused += 1;
      if (outcome?.status === "rejected") console.log(`    refused ${url}: ${outcome.message}`);
    }
  }
}
console.log("seed_networks:", JSON.stringify(totals));
process.exit(0);
