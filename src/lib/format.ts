export function timeAgo(unix: number): string {
  const d = Math.floor(Date.now() / 1000) - unix;
  if (d < 3600) return "just now";
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  const days = Math.floor(d / 86400);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function cadence(perWeek: number | null): string | null {
  if (!perWeek || perWeek <= 0) return null;
  if (perWeek >= 6) return "daily";
  if (perWeek >= 2.5) return `${Math.round(perWeek)}x a week`;
  if (perWeek >= 0.8) return "weekly";
  if (perWeek >= 0.35) return "fortnightly";
  return "monthly";
}

const NAMES: Record<string, string> = {
  en: "English", es: "Spanish", pt: "Portuguese", de: "German", fr: "French",
  it: "Italian", ja: "Japanese", nl: "Dutch", ru: "Russian", zh: "Chinese",
  sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish", pl: "Polish",
  cs: "Czech", tr: "Turkish", ar: "Arabic", ko: "Korean", he: "Hebrew",
  id: "Indonesian", hu: "Hungarian", el: "Greek", ro: "Romanian", uk: "Ukrainian",
  ca: "Catalan", sk: "Slovak", is: "Icelandic", fa: "Persian", hi: "Hindi",
  th: "Thai", vi: "Vietnamese", sr: "Serbian", hr: "Croatian", sl: "Slovenian",
  bg: "Bulgarian", et: "Estonian", lv: "Latvian", lt: "Lithuanian", af: "Afrikaans",
  nb: "Norwegian Bokmal", nn: "Norwegian Nynorsk", eu: "Basque", gl: "Galician",
  fo: "Faroese", lb: "Luxembourgish", sq: "Albanian", mk: "Macedonian",
  bs: "Bosnian", be: "Belarusian", ka: "Georgian", hy: "Armenian", az: "Azerbaijani",
  kk: "Kazakh", uz: "Uzbek", mn: "Mongolian", ne: "Nepali", si: "Sinhala",
  ta: "Tamil", te: "Telugu", ml: "Malayalam", kn: "Kannada", mr: "Marathi",
  gu: "Gujarati", pa: "Punjabi", bn: "Bengali", ur: "Urdu", ps: "Pashto",
  sw: "Swahili", am: "Amharic", yo: "Yoruba", ha: "Hausa", zu: "Zulu",
  tl: "Tagalog", ms: "Malay", km: "Khmer", lo: "Lao", my: "Burmese",
  ga: "Irish", cy: "Welsh", gd: "Scottish Gaelic", br: "Breton", mt: "Maltese",
  la: "Latin", eo: "Esperanto", yi: "Yiddish", se: "Northern Sami",
};

// Feeds declare their language in whatever shape the publisher felt like:
// "en_US", " en ", "English", "français", "ger_deu", or the ISO 639-2 "eng".
// Everything here folds onto the ISO 639-1 code the /language/* URLs are keyed
// on. The truncated spellings ("franç", "engli", "germa", "tagal") are the
// five-character values already sitting in the directory — see the matching fix
// in scripts/export_indie.py, which is what stopped producing them.
const LANG_ALIAS: Record<string, string> = {
  english: "en", engli: "en", eng: "en",
  french: "fr", "français": "fr", "franç": "fr", fre: "fr", fra: "fr",
  german: "de", germa: "de", deutsch: "de", ger: "de", deu: "de",
  spanish: "es", "español": "es", spa: "es", esp: "es",
  portuguese: "pt", "português": "pt", por: "pt",
  italian: "it", italiano: "it", ita: "it",
  dutch: "nl", nederlands: "nl", nld: "nl", dut: "nl",
  russian: "ru", rus: "ru",
  japanese: "ja", jpn: "ja", jp: "ja",
  chinese: "zh", zho: "zh", chi: "zh",
  korean: "ko", kor: "ko",
  swedish: "sv", svenska: "sv", swe: "sv",
  danish: "da", dansk: "da", dan: "da",
  norwegian: "no", norsk: "no", nor: "no",
  finnish: "fi", suomi: "fi", fin: "fi",
  polish: "pl", polski: "pl", pol: "pl",
  czech: "cs", ces: "cs", cze: "cs",
  turkish: "tr", tur: "tr",
  arabic: "ar", ara: "ar",
  hebrew: "he", heb: "he",
  hindi: "hi", hin: "hi",
  greek: "el", ell: "el", gre: "el",
  romanian: "ro", ron: "ro", rum: "ro",
  ukrainian: "uk", ukr: "uk",
  hungarian: "hu", magyar: "hu", hun: "hu",
  croatian: "hr", hrv: "hr",
  serbian: "sr", srp: "sr",
  slovak: "sk", slk: "sk", slo: "sk",
  slovenian: "sl", slv: "sl",
  bulgarian: "bg", bul: "bg",
  catalan: "ca", "català": "ca", cat: "ca",
  basque: "eu", euskara: "eu", eus: "eu", baq: "eu",
  galician: "gl", glg: "gl",
  icelandic: "is", isl: "is", ice: "is",
  estonian: "et", est: "et",
  latvian: "lv", lav: "lv",
  lithuanian: "lt", lit: "lt",
  persian: "fa", farsi: "fa", fas: "fa", per: "fa",
  thai: "th", tha: "th",
  vietnamese: "vi", vie: "vi",
  indonesian: "id", bahasa: "id", ind: "id",
  tagalog: "tl", tagal: "tl", filipino: "tl", tgl: "tl", fil: "tl",
  malay: "ms", msa: "ms", may: "ms",
  swahili: "sw", swa: "sw",
  afrikaans: "af", afr: "af",
  albanian: "sq", sqi: "sq", alb: "sq",
  welsh: "cy", cym: "cy", wel: "cy",
  irish: "ga", gle: "ga",
  tamil: "ta", tam: "ta",
  bengali: "bn", ben: "bn",
  urdu: "ur", urd: "ur",
  pashto: "ps", pus: "ps",
  faroese: "fo", fao: "fo",
  luxembourgish: "lb", ltz: "lb",
  yiddish: "yi", yid: "yi",
  armenian: "hy", hye: "hy", arm: "hy",
  georgian: "ka", kat: "ka", geo: "ka",
};

// The canonical ISO 639-1 code for a declared language, or null when there is
// no honest way to resolve one ("und", or a language with no two-letter code
// such as Scots). Null means the show is not offered under /language/* at all,
// which is the point: every code this returns has a page behind it, so the
// language chips and the sitemap stop emitting URLs that 404.
/**
 * Route params arrive percent-encoded. decodeURIComponent throws on a malformed
 * sequence (a lone "%"), which a crawler will eventually send, so fall back to
 * the raw string rather than turning a bad URL into a 500.
 */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function normalizeLang(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/_/g, "-");
  if (!s) return null;
  if (LANG_ALIAS[s]) return LANG_ALIAS[s];
  const head = s.split("-")[0];
  if (LANG_ALIAS[head]) return LANG_ALIAS[head];
  if (/^[a-z]{2}$/.test(head)) return head;
  return null;
}

export function languageName(code: string | null): string {
  if (!code) return "Unknown";
  const c = normalizeLang(code) ?? code;
  return NAMES[c] ?? c.toUpperCase();
}

/**
 * Artwork comes from 13k publisher domains and a fair slice of it is still
 * declared over http. On an https page that is mixed content: the browser
 * blocks it outright, and no CSP change can allow it back in — the scheme has
 * to be upgraded. A host that has no TLS then fails the fetch instead, which
 * <Art> already draws a lettered placeholder for. Returns "" for the genuinely
 * malformed entries in the index (a filename where the host should be).
 */
export function safeImage(url: string | null | undefined): string {
  if (!url) return "";
  const s = url.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    // A bare filename parsed as a host — "http://Something 300x300.jpg" — has
    // no dot-separated TLD and resolves nowhere.
    if (!/\.[a-z]{2,}$/i.test(u.hostname)) return "";
    u.protocol = "https:";
    return u.toString();
  } catch {
    return "";
  }
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function clamp(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}
