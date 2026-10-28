import { getDomain } from "tldts";

/**
 * The registrable domain (eTLD+1) of a host, public-suffix aware:
 * rss.libsyn.com and feeds.libsyn.com -> libsyn.com, foo.co.uk -> foo.co.uk.
 * Private suffixes count as suffixes (alice.github.io stays alice.github.io),
 * so two people's subdomains on a shared host are never one owner.
 * A host with no registrable part (an IP, localhost, a bare suffix) comes back
 * as itself, lowercased.
 */
export function registrableDomain(host: string | null | undefined): string {
  const h = (host ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!h) return "";
  return getDomain(h, { allowPrivateDomains: true }) ?? h;
}
