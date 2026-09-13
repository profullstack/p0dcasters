import { XMLParser } from "fast-xml-parser";

/**
 * The channel half of a feed: who owns it and where else they are. The
 * episode parser in ../feed.ts reads items; this reads the head, once, for a
 * profile and for a claim. The owner's email is handed back to the caller
 * and stored nowhere: a claim compares it and forgets it.
 *
 * Imports only fast-xml-parser, so Node runs it under `node --test`.
 */

export type Channel = {
  title: string;
  link: string | null;
  description: string;
  author: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  language: string | null;
  /** Account pages the publisher put in the channel (podcast:person href, podcast:socialInteract uri, atom rel=me). */
  accounts: string[];
  /** Support links: podcast:funding, with the element's text as the label. */
  funding: { label: string; url: string }[];
  /** The channel text a claim is checked against: description, summary, copyright. */
  text: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
  isArray: (name) =>
    name === "item" || name === "entry" || name === "podcast:person" || name === "podcast:funding" || name === "podcast:socialInteract" || name === "atom:link" || name === "link",
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
  const v = (node as Record<string, unknown>)[`@${name}`];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

function list(node: unknown): Record<string, unknown>[] {
  if (node == null) return [];
  return (Array.isArray(node) ? node : [node]).filter((x) => x && typeof x === "object") as Record<string, unknown>[];
}

function strip(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function url(s: string): string | null {
  const t = s.trim();
  return /^https?:\/\//i.test(t) ? t : null;
}

/** The channel of an RSS or Atom document, or null when there is none. */
export function parseChannel(xml: string): Channel | null {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return null;
  }
  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = (rss?.channel ?? doc.channel ?? doc.feed) as Record<string, unknown> | undefined;
  if (!channel) return null;

  // <link> in RSS is text; in Atom it is elements with href. Both arrive as arrays.
  let link: string | null = null;
  const rels: { rel: string; href: string }[] = [];
  for (const l of list(channel.link).concat(list(channel["atom:link"]))) {
    const href = attr(l, "href");
    const rel = attr(l, "rel").toLowerCase();
    if (href && rel) rels.push({ rel, href });
    if (href && !rel && !link) link = url(href);
  }
  for (const raw of Array.isArray(channel.link) ? channel.link : [channel.link]) {
    if (typeof raw === "string" && !link) link = url(raw);
  }

  const owner = channel["itunes:owner"] as Record<string, unknown> | undefined;
  const accounts: string[] = [];
  const seen = new Set<string>();
  const push = (u: string | null) => {
    if (u && !seen.has(u)) {
      seen.add(u);
      accounts.push(u);
    }
  };
  for (const p of list(channel["podcast:person"])) push(url(attr(p, "href")));
  for (const s of list(channel["podcast:socialInteract"])) push(url(attr(s, "uri")));
  for (const r of rels) if (r.rel === "me" || r.rel === "author" || r.rel === "openprofile") push(url(r.href));

  const funding: { label: string; url: string }[] = [];
  for (const f of list(channel["podcast:funding"])) {
    const u = url(attr(f, "url"));
    if (u) funding.push({ label: strip(text(f)) || "Support", url: u });
  }

  const description = strip(text(channel["itunes:summary"]) || text(channel.description) || text(channel.subtitle));
  const parts = [description, strip(text(channel.copyright)), strip(text(channel["itunes:subtitle"]))].filter(Boolean);

  return {
    title: strip(text(channel.title)),
    link,
    description,
    author: strip(text(channel["itunes:author"]) || text(channel.author) || text(channel["dc:creator"])) || null,
    ownerName: strip(text(owner?.["itunes:name"])) || null,
    ownerEmail: strip(text(owner?.["itunes:email"]) || text(channel["managingEditor"]) || text(channel["webMaster"])).replace(/\s.*$/, "") || null,
    language: strip(text(channel.language)) || null,
    accounts,
    funding,
    text: parts.join("\n"),
  };
}
