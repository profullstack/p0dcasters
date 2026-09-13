import {
  applyOverrides,
  mergeOverrides,
  mergeProfiles,
  overridesFromDocument,
  parseOpenProfile,
  renderOpenProfile,
  accounts as accountsOf,
  identityValue,
  type OpenProfileDoc,
  type Overrides,
} from "@profullstack/openprofile";
import { all, one, db, args } from "@/lib/db";
import type { Podcast } from "@/lib/db";
import { now } from "@/lib/auth/crypto";
import type { User } from "@/lib/auth/session";
import { isAdmin } from "@/lib/review";
import { EDIT_SCOPE, type Principal } from "@/lib/openaccess";
import { parseChannel, type Channel } from "./channel";
import {
  claimMethod,
  decodeCursor,
  encodeCursor,
  generateProfile,
  profilePage,
  profileUrl,
  showPage,
  type ClaimMethod,
} from "./generate";

/**
 * A podcaster's profile as the site keeps it: the generated document, what
 * rssamplifier knows about the same person, and what the owner corrected.
 *
 * Keyed by slug, not by podcasts.id: the weekly reload reassigns ids (that is
 * why `follows` keys by slug too), and a claim must survive the rebuild.
 * The loader never drops this table.
 *
 * Claim first, then edit. A claim is verified against the feed the person
 * publishes: the signed-in address is the feed's owner address, or the show's
 * site or feed links back at the profile. An admin can claim for someone. An
 * OpenAccess bearer with `openprofile:edit` edits on the owner's behalf when
 * its principal is the one recorded at claim time, or when the token carries
 * the owner's email.
 */

export const USER_AGENT = "p0dcasters/1.0 (+https://p0dcasters.com/openprofile; profiles)";
const RSSAMPLIFIER = "https://rssamplifier.com";
const SOURCE_TTL = 86400;
const MAX_OVERRIDES = 64 * 1024;

export type ProfileRow = {
  slug: string;
  overrides: string | null;
  public: number;
  owner_user_id: number | null;
  owner_email: string | null;
  owner_principal: string | null;
  claimed_at: number | null;
  claim_method: string | null;
  updated_at: number;
};

export const DDL = [
  `CREATE TABLE IF NOT EXISTS podcast_profiles(
     slug TEXT PRIMARY KEY,
     overrides TEXT,
     public INTEGER NOT NULL DEFAULT 1,
     owner_user_id INTEGER,
     owner_email TEXT,
     owner_principal TEXT,
     claimed_at INTEGER,
     claim_method TEXT,
     updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS i_profiles_updated ON podcast_profiles(updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS i_profiles_owner ON podcast_profiles(owner_user_id)`,
  // What another directory said about the same feed, kept a day.
  `CREATE TABLE IF NOT EXISTS profile_sources(
     feed_url TEXT NOT NULL,
     source TEXT NOT NULL,
     url TEXT,
     body TEXT,
     fetched_at INTEGER NOT NULL,
     PRIMARY KEY(feed_url, source))`,
];

let ready: Promise<void> | null = null;
/** The tables, created lazily so a deploy never waits on the migration script. */
export function ensureProfileTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      for (const sql of DDL) await db().execute(sql);
    })();
  }
  return ready;
}

export async function profileRow(slug: string): Promise<ProfileRow | null> {
  await ensureProfileTables();
  return one<ProfileRow>("SELECT * FROM podcast_profiles WHERE slug = ?", [slug]);
}

function parseOverrides(raw: string | null): Overrides | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Overrides;
  } catch {
    return null;
  }
}

// --- the feed, read live ------------------------------------------------------

export async function fetchChannel(feedUrl: string, timeoutMs = 9000): Promise<Channel | null> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/xml, */*" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseChannel(await res.text());
  } catch {
    return null;
  }
}

// --- rssamplifier, the other directory that knows this person -----------------

type SourceRow = { url: string | null; body: string | null; fetched_at: number };

/**
 * rssamplifier's OpenProfile for the author behind this feed, when it has
 * one: `GET /api/authors?feed=<url>` names the author and their profile URL,
 * and the profile is read from there. Cached a day per feed, including the
 * absence, so a show page never waits on another site twice.
 */
export async function rssamplifierProfile(feedUrl: string): Promise<OpenProfileDoc | null> {
  await ensureProfileTables();
  const cached = await one<SourceRow>("SELECT url, body, fetched_at FROM profile_sources WHERE feed_url = ? AND source = 'rssamplifier'", [feedUrl]);
  if (cached && cached.fetched_at > now() - SOURCE_TTL) {
    return cached.body ? parseOpenProfile(cached.body) : null;
  }
  let url: string | null = null;
  let body: string | null = null;
  try {
    const res = await fetch(`${RSSAMPLIFIER}/api/authors?feed=${encodeURIComponent(feedUrl)}`, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { authors?: { openprofile?: string; role?: string }[] };
      const authors = Array.isArray(json?.authors) ? json.authors : [];
      const first = authors.find((a) => a.role === "owner" && a.openprofile) ?? authors.find((a) => a.openprofile);
      if (first?.openprofile && /^https:\/\/rssamplifier\.com\//.test(first.openprofile)) {
        url = first.openprofile;
        const md = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/markdown" }, signal: AbortSignal.timeout(3000), cache: "no-store" });
        if (md.ok) body = (await md.text()).slice(0, 64 * 1024);
      }
    }
  } catch {
    /* absent, this time */
  }
  await db().execute({
    sql: `INSERT INTO profile_sources(feed_url, source, url, body, fetched_at) VALUES(?,'rssamplifier',?,?,?)
          ON CONFLICT(feed_url, source) DO UPDATE SET url = excluded.url, body = excluded.body, fetched_at = excluded.fetched_at`,
    args: args([feedUrl, url, body, now()]),
  });
  return body ? parseOpenProfile(body) : null;
}

// --- the document, assembled ---------------------------------------------------

export type Rendered = {
  doc: OpenProfileDoc;
  markdown: string;
  row: ProfileRow | null;
  public: boolean;
  claimed: boolean;
  updatedAt: number;
};

/**
 * The document before the owner's corrections: the row generated from the
 * feed, enriched with the channel's own links when the feed answers quickly,
 * merged with what rssamplifier knows. Ours is the primary: the name and the
 * show come from the feed as listed here; rssamplifier fills Accounts, Avatar
 * and a bio we do not have.
 */
export async function assembleProfile(p: Podcast, opts: { readFeed?: boolean } = {}): Promise<OpenProfileDoc> {
  const [channel, other] = await Promise.all([
    opts.readFeed === false ? Promise.resolve(null) : fetchChannel(p.feed_url, 4000),
    rssamplifierProfile(p.feed_url),
  ]);
  const local = generateProfile(p, channel ? { accounts: channel.accounts, funding: channel.funding, ownerName: channel.ownerName } : {});
  return other ? mergeProfiles([local, other]) : local;
}

/** The profile as served: the assembled document with the owner's corrections over it. */
export async function renderShowProfile(p: Podcast, opts: { readFeed?: boolean } = {}): Promise<Rendered> {
  const [row, assembled] = await Promise.all([profileRow(p.slug), assembleProfile(p, opts)]);
  const doc = applyOverrides(assembled, parseOverrides(row?.overrides ?? null));
  return {
    doc,
    markdown: renderOpenProfile(doc),
    row,
    public: row ? row.public !== 0 : true,
    claimed: Boolean(row?.claimed_at),
    updatedAt: row?.updated_at ?? Number(p.newest_pubdate) ?? now(),
  };
}

// --- who may edit -------------------------------------------------------------

export type Editor = { by: string; via: "session" | "admin" | "openaccess" };

/** The editor behind a request for this profile, or null when nobody may. */
export function editorOf(row: ProfileRow | null, user: User | null, principal: Principal | null): Editor | null {
  if (user && isAdmin(user)) return { by: user.email, via: "admin" };
  if (!row?.claimed_at) return null;
  if (user && row.owner_user_id === user.id) return { by: user.email, via: "session" };
  if (principal?.scopes.includes(EDIT_SCOPE)) {
    if (row.owner_principal && row.owner_principal === principal.sub) return { by: principal.sub, via: "openaccess" };
    if (principal.email && row.owner_email && principal.email.toLowerCase() === row.owner_email.toLowerCase()) {
      return { by: principal.email, via: "openaccess" };
    }
  }
  return null;
}

// --- writes -----------------------------------------------------------------------

/** Apply a whole file or a partial JSON overlay, and keep it. */
export async function saveOverrides(
  p: Podcast,
  input: { markdown?: string; overrides?: Overrides; public?: boolean },
  editor: Editor,
): Promise<Rendered> {
  const existing = await profileRow(p.slug);
  const base = parseOverrides(existing?.overrides ?? null);
  let next: Overrides | null = base;
  if (typeof input.markdown === "string") {
    if (input.markdown.length > MAX_OVERRIDES) throw new Error("the profile is over 64 KB");
    // The generated document, so the diff against it is what gets stored:
    // an identity key the person removed from the file stays removed.
    const generated = await assembleProfile(p, { readFeed: false });
    next = mergeOverrides(base, overridesFromDocument(input.markdown, generated));
  }
  if (input.overrides) {
    if (JSON.stringify(input.overrides).length > MAX_OVERRIDES) throw new Error("the overrides are over 64 KB");
    next = mergeOverrides(next, input.overrides);
  }
  const pub = input.public === undefined ? (existing?.public ?? 1) : input.public ? 1 : 0;
  const t = now();
  await db().execute({
    sql: `INSERT INTO podcast_profiles(slug, overrides, public, owner_user_id, owner_email, owner_principal, claimed_at, claim_method, updated_at)
          VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(slug) DO UPDATE SET overrides = excluded.overrides, public = excluded.public, updated_at = excluded.updated_at`,
    args: args([
      p.slug,
      next ? JSON.stringify(next) : null,
      pub,
      existing?.owner_user_id ?? null,
      existing?.owner_email ?? null,
      existing?.owner_principal ?? null,
      existing?.claimed_at ?? null,
      existing?.claim_method ?? null,
      t,
    ]),
  });
  void editor;
  return renderShowProfile(p);
}

/** Remember the OpenAccess principal that proved ownership, so the next token needs no email claim. */
export async function rememberPrincipal(slug: string, sub: string): Promise<void> {
  await db().execute({ sql: "UPDATE podcast_profiles SET owner_principal = ? WHERE slug = ? AND owner_principal IS NULL", args: args([sub, slug]) });
}

export type ClaimResult =
  | { ok: true; method: ClaimMethod; alreadyOwner: boolean }
  | { ok: false; status: number; error: string; checked: string[] };

/**
 * Claim the profile for a user. The feed is read now, not from cache: the
 * owner address and the channel text are compared and dropped. The site's
 * home page is read once for a link back. Nothing else is required.
 */
export async function claimProfile(
  p: Podcast,
  user: User,
  opts: { admin?: User | null; principal?: Principal | null } = {},
): Promise<ClaimResult> {
  const existing = await profileRow(p.slug);
  if (existing?.claimed_at && existing.owner_user_id === user.id) return { ok: true, method: (existing.claim_method as ClaimMethod) ?? "owner-email", alreadyOwner: true };
  if (existing?.claimed_at && existing.owner_user_id !== user.id && !(opts.admin && isAdmin(opts.admin))) {
    return { ok: false, status: 409, error: "this profile is already claimed by someone else", checked: [] };
  }

  let method: ClaimMethod | null = opts.admin && isAdmin(opts.admin) ? "admin" : null;
  const checked: string[] = [];
  if (!method) {
    const channel = await fetchChannel(p.feed_url);
    checked.push("feed owner address", "feed text");
    method = claimMethod({ userEmail: user.email, ownerEmail: channel?.ownerEmail, feedText: channel ? `${channel.text}\n${channel.link ?? ""}` : null, slug: p.slug });
    if (!method) {
      const site = p.link || `https://${p.host}`;
      checked.push(`site ${site}`);
      const html = await fetchText(site, 6000);
      method = claimMethod({ userEmail: user.email, ownerEmail: null, siteHtml: html, slug: p.slug });
    }
  }
  if (!method) {
    return {
      ok: false,
      status: 403,
      error: `not verified: sign in as the feed's owner address (itunes:owner), or link to ${profileUrl(p.slug)} from the show's site or feed description, then try again`,
      checked,
    };
  }
  const t = now();
  await db().execute({
    sql: `INSERT INTO podcast_profiles(slug, overrides, public, owner_user_id, owner_email, owner_principal, claimed_at, claim_method, updated_at)
          VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(slug) DO UPDATE SET owner_user_id = excluded.owner_user_id, owner_email = excluded.owner_email,
            owner_principal = excluded.owner_principal, claimed_at = excluded.claimed_at, claim_method = excluded.claim_method, updated_at = excluded.updated_at`,
    args: args([p.slug, existing?.overrides ?? null, existing?.public ?? 1, user.id, user.email, opts.principal?.sub ?? null, t, method, t]),
  });
  return { ok: true, method, alreadyOwner: false };
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html, */*" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 512 * 1024);
  } catch {
    return null;
  }
}

// --- the listing, for a directory that pulls -----------------------------------

export type Listed = {
  id: string;
  name: string;
  url: string;
  page: string;
  show: string;
  updatedAt: string;
  accounts: string[];
  web: string | null;
};

/**
 * Every public profile, most recently changed first: an owner's edit, else
 * the show's newest episode. The cursor is (updated, id) so a page boundary
 * never repeats or skips a row as shows are edited between calls.
 */
export async function listProfiles(opts: { since?: string | null; limit?: number; cursor?: string | null }): Promise<{ openprofiles: Listed[]; next: string | null }> {
  await ensureProfileTables();
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const sinceUnix = opts.since ? Math.floor(Date.parse(opts.since) / 1000) : NaN;
  const cursor = decodeCursor(opts.cursor);
  const where: string[] = ["COALESCE(pp.public, 1) = 1"];
  const params: unknown[] = [];
  if (Number.isFinite(sinceUnix)) {
    where.push("COALESCE(pp.updated_at, p.newest_pubdate) >= ?");
    params.push(sinceUnix);
  }
  if (cursor) {
    where.push("(COALESCE(pp.updated_at, p.newest_pubdate) < ? OR (COALESCE(pp.updated_at, p.newest_pubdate) = ? AND p.id < ?))");
    params.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  type Row = Podcast & { pp_updated: number | null; pp_overrides: string | null };
  const rows = await all<Row>(
    `SELECT p.*, pp.updated_at AS pp_updated, pp.overrides AS pp_overrides
       FROM podcasts p LEFT JOIN podcast_profiles pp ON pp.slug = p.slug
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(pp.updated_at, p.newest_pubdate) DESC, p.id DESC
      LIMIT ?`,
    [...params, limit + 1],
  );
  const page = rows.slice(0, limit);
  const openprofiles = page.map((r) => {
    const doc = applyOverrides(generateProfile(r), parseOverrides(r.pp_overrides));
    const updated = Number(r.pp_updated ?? r.newest_pubdate ?? 0);
    return {
      id: r.slug,
      name: doc.name ?? r.title,
      url: profileUrl(r.slug),
      page: profilePage(r.slug),
      show: showPage(r.slug),
      updatedAt: new Date(updated * 1000).toISOString(),
      accounts: accountsOf(doc).map((a) => a.url),
      web: identityValue(doc, "Web"),
    };
  });
  const last = page[page.length - 1];
  const next = rows.length > limit && last ? encodeCursor({ updatedAt: Number(last.pp_updated ?? last.newest_pubdate ?? 0), id: Number(last.id) }) : null;
  return { openprofiles, next };
}
