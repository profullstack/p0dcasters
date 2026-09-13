import {
  keyedSection,
  listSection,
  makeOpenProfile,
  normaliseUrl,
  type OpenProfileDoc,
} from "@profullstack/openprofile";

/**
 * The podcaster's OpenProfile.md, generated from what the publisher wrote in
 * their own feed (logicsrc.com/openprofile, with the Broadcast section of
 * logicsrc.com/openbroadcast).
 *
 * Pure: a row in, a document out, so the tests run it without a database or
 * a network. Everything here is a claim the directory makes from the feed;
 * the person it is about corrects it through the overlay in store.ts. The
 * keys a host writes about who they are looking for (Seeking, Not, Pays,
 * Charges, Slots, Book) and the whole Guest section are never generated:
 * the spec says a platform fills nothing the person did not write.
 *
 * Imports only the package and nothing with an `@/` alias, so Node can run
 * this file as is under `node --test` (type stripping, no bundler).
 */

export const SITE = "https://p0dcasters.com";

/** The subset of a `podcasts` row the generator reads. */
export type ShowRow = {
  slug: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link: string | null;
  host: string;
  author: string | null;
  owner: string | null;
  language: string | null;
  lang_base: string | null;
  categories: string | null;
  category: string | null;
  feed_url: string;
  oldest_pubdate: number | null;
  per_week: number | null;
  episode_count: number;
};

/** What the live feed adds: links the publisher put in the channel. */
export type ChannelExtras = {
  /** Account pages from podcast:person, podcast:socialInteract and the like. */
  accounts?: string[];
  /** Support and funding links (podcast:funding), label then URL. */
  funding?: { label: string; url: string }[];
  ownerName?: string | null;
};

export function profileUrl(slug: string): string {
  return `${SITE}/podcast/${encodeURIComponent(slug)}/openprofile.md`;
}

export function profilePage(slug: string): string {
  return `${SITE}/podcast/${encodeURIComponent(slug)}/profile`;
}

export function showPage(slug: string): string {
  return `${SITE}/podcast/${encodeURIComponent(slug)}`;
}

/**
 * The spec's own words for how often a show publishes: daily, weekly,
 * fortnightly, monthly, or as written. Measured from the feed the publisher
 * serves, so it is theirs; a show with no measurable rhythm says nothing.
 */
export function cadenceBand(perWeek: number | null | undefined): string | null {
  const n = Number(perWeek);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 6) return "daily";
  if (n >= 2.5) return `${Math.round(n)} times a week`;
  if (n >= 0.8) return "weekly";
  if (n >= 0.35) return "fortnightly";
  if (n >= 0.12) return "monthly";
  return null;
}

const COMPANY_WORDS =
  /\b(inc|llc|ltd|limited|gmbh|s\.?a\.?|plc|co|corp|corporation|company|media|network|networks|studios?|productions?|radio|fm|podcasts?|church|ministries|university|college|school|foundation|institute|society|association|group|team|magazine|press|publishing|publications|news|labs?|agency|partners|collective|community|council|department|library|museum|festival)\b\.?$/i;

function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bthe\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Is the author string a company rather than a person?
 *
 * Two signals, either of which decides: the author is the show's own name
 * (an `itunes:author` that repeats the title is a brand, not a byline), or
 * it ends in a word people use for organisations (Media, Network, Radio,
 * Church, Inc, Podcasts). Everything else is a person, because absent a
 * reason to think otherwise a name is a name. Two capitalised words with a
 * conjunction ("Pigweed and Crowhill") stay a person, as a duo of hosts.
 */
export function isOrganization(author: string | null | undefined, title: string): boolean {
  const a = (author ?? "").trim();
  if (!a) return false;
  const fa = fold(a);
  const ft = fold(title);
  if (fa && (fa === ft || ft.startsWith(`${fa} `) && fa.split(" ").length >= 2)) return true;
  if (COMPANY_WORDS.test(a.replace(/[.,]+$/, ""))) return true;
  if (/^[A-Z0-9&.\s-]{2,}$/.test(a) && /[A-Z]{3,}/.test(a)) return true;
  return false;
}

/** The first sentence of a description, one line, clipped. */
export function firstSentence(text: string | null | undefined, max = 220): string | null {
  const t = String(text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  // A sentence ends at punctuation followed by space, the end, or a capital
  // with no space at all (a description whose newlines were squashed out).
  const m = /^(.{12,}?[.!?])(\s|$|(?=[A-Z]))/.exec(t);
  const s = (m ? m[1] : t).trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

function langTag(row: ShowRow): string | null {
  const raw = (row.lang_base ?? row.language ?? "").trim().toLowerCase();
  if (!raw || raw === "und") return null;
  const m = /^([a-z]{2,3})([_-]([a-z]{2}))?/.exec(raw);
  if (!m) return null;
  return m[3] ? `${m[1]}-${m[3].toUpperCase()}` : m[1];
}

function since(unix: number | null | undefined): string | null {
  const n = Number(unix);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  if (d.getUTCFullYear() < 1990) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function https(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

function categories(row: ShowRow): string[] {
  const list = (row.categories ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (!list.length && row.category) list.push(row.category.trim().toLowerCase());
  return [...new Set(list)];
}

/**
 * The document, from the row and (when the feed was read) the channel's
 * own links. Name: the author, else the owner, else the show. Kind: person
 * unless the author reads as a company. Web: the show's site. Accounts: only
 * pages the feed itself carries. Broadcast: the show, from the feed.
 */
export function generateProfile(row: ShowRow, extras: ChannelExtras = {}): OpenProfileDoc {
  const title = row.title.trim();
  const author = (row.author ?? "").trim() || (row.owner ?? "").trim() || (extras.ownerName ?? "").trim();
  const name = author || title;
  const organization = author ? isOrganization(author, title) : true;
  const web = https(row.link) ?? `https://${row.host}`;
  const cats = categories(row);

  const seen = new Set<string>([normaliseUrl(web)]);
  const accounts: string[] = [];
  for (const url of extras.accounts ?? []) {
    const u = https(url);
    if (!u) continue;
    const key = normaliseUrl(u);
    if (seen.has(key)) continue;
    seen.add(key);
    accounts.push(u);
  }

  const headline = organization
    ? `Publishes ${title}.`
    : `Host of ${title}.`;

  const broadcast = keyedSection("Broadcast", {
    Show: title,
    Kind: "podcast",
    Cadence: cadenceBand(row.per_week),
    Language: langTag(row),
    Since: since(row.oldest_pubdate),
    Feed: row.feed_url,
    Listen: showPage(row.slug),
    Topics: cats.length ? cats.join(", ") : null,
    Description: firstSentence(row.description, 300),
  });

  const links = listSection(
    "Links",
    (extras.funding ?? []).filter((f) => https(f.url)).map((f) => `${f.label || "Support"}: ${f.url}`),
  );

  return makeOpenProfile({
    name,
    identity: {
      Kind: organization ? "organization" : "person",
      Web: web,
      Avatar: https(row.image_url),
    },
    headline,
    sections: [listSection("Accounts", accounts), listSection("Topics", cats), broadcast, links],
  });
}

// --- the listing cursor, for nichedb's pull ---------------------------------

export type Cursor = { updatedAt: number; id: number };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.updatedAt}:${c.id}`).toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  let text: string;
  try {
    text = Buffer.from(raw, "base64url").toString();
  } catch {
    return null;
  }
  const m = /^(\d+):(\d+)$/.exec(text);
  if (!m) return null;
  return { updatedAt: Number(m[1]), id: Number(m[2]) };
}

// --- claim verification, the pure half ---------------------------------------

export type ClaimMethod = "owner-email" | "site-link" | "feed-link" | "admin";

function emailKey(e: string | null | undefined): string | null {
  const s = (e ?? "").trim().toLowerCase().replace(/^mailto:/, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/**
 * Does this text link back to the profile? A `rel="openprofile"` or
 * `rel="me"` pointing at the profile file or the profile page counts, and so
 * does the bare URL of either anywhere in the text (a feed description that
 * says "my profile: ..."). The show page itself does not count: every listed
 * show could link to its own listing without the host having done anything.
 */
export function linksBack(text: string | null | undefined, slug: string): boolean {
  const t = String(text ?? "");
  if (!t) return false;
  const targets = [profileUrl(slug), profilePage(slug)].map((u) => u.replace(/^https?:\/\//, ""));
  const lower = t.toLowerCase();
  return targets.some((u) => lower.includes(u.toLowerCase()));
}

/**
 * The method by which a person may claim a show's profile, or null.
 * The signed-in address equals the feed's itunes:owner email; the site's
 * home page links back; the feed's channel text links back.
 */
export function claimMethod(input: {
  userEmail: string | null | undefined;
  ownerEmail: string | null | undefined;
  siteHtml?: string | null;
  feedText?: string | null;
  slug: string;
}): ClaimMethod | null {
  const user = emailKey(input.userEmail);
  const owner = emailKey(input.ownerEmail);
  if (user && owner && user === owner) return "owner-email";
  if (linksBack(input.siteHtml, input.slug)) return "site-link";
  if (linksBack(input.feedText, input.slug)) return "feed-link";
  return null;
}
