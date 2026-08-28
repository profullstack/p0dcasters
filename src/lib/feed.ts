import { XMLParser } from "fast-xml-parser";
import { playableUrl } from "./audio";

export type Episode = {
  id: string;
  title: string;
  audio: string;
  pubdate: number;
  duration: number | null;
  description: string;
  image: string | null;
  link: string | null;
};

const MAX_ITEMS = 300;
const UA = "p0dcasters/1.0 (+https://p0dcasters.com)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
  // Feeds put the same tag once or many times with no warning; forcing arrays
  // only for <item> keeps every other access a plain property read.
  isArray: (name) => name === "item" || name === "entry",
});

function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    if ("#text" in o) return text(o["#text"]);
  }
  return "";
}

function attr(node: unknown, name: string): string {
  if (!node || typeof node !== "object") return "";
  if (Array.isArray(node)) return attr(node[0], name);
  const v = (node as Record<string, unknown>)[`@${name}`];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

function seconds(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", eacute: "é", uuml: "ü", deg: "°",
};

function codePoint(n: number): string {
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

/**
 * The XML parser leaves numeric character references alone, and a fair number
 * of feeds escape their titles twice on the way out of a CMS — so `&#8211;`
 * and `&amp;#8211;` both have to come back as an en dash. Two passes covers
 * both without needing to know which one a given publisher did.
 */
function decodeEntities(input: string): string {
  const pass = (s: string) =>
    s
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => codePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
      .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED[String(name).toLowerCase()] ?? m);
  return pass(pass(input));
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** The enclosure is the episode. An item without one is a blog post. */
function audioOf(item: Record<string, unknown>): string {
  const enc = item.enclosure;
  const encUrl = attr(enc, "url");
  if (encUrl && !/^(image|text|video\/mp4)/.test(attr(enc, "type") || "")) return encUrl;

  // Atom, and the handful of feeds that use <link rel="enclosure">.
  const links = item.link;
  const list = Array.isArray(links) ? links : [links];
  for (const l of list) {
    if (attr(l, "rel") === "enclosure" && attr(l, "href")) return attr(l, "href");
  }
  const media = item["media:content"];
  if (attr(media, "url") && /audio/.test(attr(media, "type") || "audio")) {
    return attr(media, "url");
  }
  return "";
}

export function parseFeed(xml: string): Episode[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = (rss?.channel ?? doc.channel ?? doc.feed) as
    | Record<string, unknown>
    | undefined;
  if (!channel) return [];
  const raw = (channel.item ?? channel.entry ?? []) as Record<string, unknown>[];

  const out: Episode[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_ITEMS)) {
    const audio = audioOf(item);
    if (!audio) continue;
    const url = playableUrl(audio);
    if (!url) continue;

    const guid = text(item.guid) || text(item.id) || audio;
    if (seen.has(guid)) continue;
    seen.add(guid);

    const when = text(item.pubDate) || text(item.published) || text(item.updated);
    const parsedDate = when ? Date.parse(when) : NaN;
    const body =
      text(item["itunes:summary"]) ||
      text(item.description) ||
      text(item["content:encoded"]) ||
      text(item.summary);

    out.push({
      id: guid,
      title: stripTags(text(item.title)) || "Untitled episode",
      audio: url,
      pubdate: Number.isFinite(parsedDate) ? Math.floor(parsedDate / 1000) : 0,
      duration: seconds(text(item["itunes:duration"])),
      description: stripTags(body).slice(0, 600),
      image: attr(item["itunes:image"], "href") || null,
      link: text(item.link) || null,
    });
  }
  return out;
}

export async function fetchEpisodes(feedUrl: string): Promise<Episode[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, */*" },
      signal: AbortSignal.timeout(9000),
      // Feeds move at publishing speed, not request speed. Half an hour of
      // cache keeps one popular show from being re-fetched on every play.
      cache: "force-cache",
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    return parseFeed(await res.text());
  } catch {
    return [];
  }
}
