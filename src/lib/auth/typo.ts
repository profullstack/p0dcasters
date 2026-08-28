/**
 * A typo'd address is the one failure the sign-in flow cannot report. The
 * endpoint answers "if that address can receive mail, a link is on its way"
 * whether or not the address is real — that is deliberate, since any other
 * answer would say who has an account here — so `you@example.con` looks
 * exactly like success and the mail bounces somewhere nobody is watching.
 *
 * This is the only place a near-miss can be caught, and it runs in the browser
 * before the request is made. It never blocks: it offers a correction the
 * reader can take or ignore, so it cannot lock anyone out of a domain we
 * happen not to recognise.
 */

/**
 * Misspellings of the big providers. These are whole-domain matches, so they
 * can be confident in a way the generic TLD pass below cannot: `gmail.co` is
 * always a slip, while some other `.co` is a real Colombian domain.
 */
const DOMAINS: Record<string, string> = {
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmail.om": "gmail.com",
  "gmall.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gamil.com": "gmail.com",
  "googlemail.co": "googlemail.com",
  "yahoo.co": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.cm": "yahoo.com",
  "hotmail.co": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmall.com": "hotmail.com",
  "homail.com": "hotmail.com",
  "outlook.co": "outlook.com",
  "outlok.com": "outlook.com",
  "outloook.com": "outlook.com",
  "icloud.co": "icloud.com",
  "iclould.com": "icloud.com",
  "icloud.cm": "icloud.com",
  "protonmail.co": "protonmail.com",
  "aol.co": "aol.com",
};

/**
 * Misspellings of the endings themselves, which apply to any domain — this is
 * what catches a typo in a domain we have never heard of.
 *
 * `co` is deliberately absent: it is a real TLD in ordinary use, and guessing
 * against it would nag people with valid addresses every time they signed in.
 * The provider map above still covers `gmail.co` and friends, where the rest of
 * the domain settles the question.
 */
const TLDS: Record<string, string> = {
  con: "com",
  cmo: "com",
  ocm: "com",
  cim: "com",
  cpm: "com",
  clm: "com",
  xom: "com",
  vom: "com",
  dom: "com",
  clom: "com",
  comm: "com",
  coom: "com",
  ccom: "com",
  cok: "com",
  c0m: "com",
  om: "com",
  cm: "com",
  nte: "net",
  ner: "net",
  nrt: "net",
  nett: "net",
  ogr: "org",
  rog: "org",
  orgg: "org",
  ord: "org",
  eud: "edu",
  edy: "edu",
  gob: "gov",
  giv: "gov",
};

/**
 * The corrected address, or null when there is nothing to say. Input is taken
 * raw from the field, so it trims and lowercases the way the server's
 * `normaliseEmail` does before comparing — otherwise `You@Example.CON` would
 * slip past.
 */
export function suggestEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || domain.includes(" ")) return null;

  const fixed = DOMAINS[domain] ?? fixTld(domain);
  if (!fixed || fixed === domain) return null;
  return `${local}@${fixed}`;
}

/** Replaces a misspelled ending, keeping everything to the left of it. */
function fixTld(domain: string): string | null {
  const dot = domain.lastIndexOf(".");
  // A domain with no dot is a different kind of wrong, and we would only be
  // guessing at which ending was meant.
  if (dot < 1) return null;

  const tld = domain.slice(dot + 1);
  const better = TLDS[tld];
  if (!better) return null;
  return `${domain.slice(0, dot)}.${better}`;
}
