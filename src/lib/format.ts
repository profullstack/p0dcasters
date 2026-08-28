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
};
export function languageName(code: string | null): string {
  if (!code) return "Unknown";
  return NAMES[code] ?? code.toUpperCase();
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function clamp(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}
