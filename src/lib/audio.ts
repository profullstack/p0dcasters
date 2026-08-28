import { createHmac } from "node:crypto";

// Kept out of src/lib/auth/crypto.ts on purpose: that module reaches for
// next/headers through its neighbours, and this one is imported by the feed
// parser, which runs in plain route handlers as well.
function key(): string {
  const s = process.env["AUTH_SECRET"];
  if (s && s.length >= 16) return s;
  if (process.env["NODE_ENV"] === "production") throw new Error("AUTH_SECRET is not set");
  return "dev-insecure-secret-p0dcasters";
}

export function signUrl(url: string): string {
  return createHmac("sha256", key()).update(`audio:${url}`).digest("base64url");
}

/**
 * About 8% of the directory still serves its mp3s over plain http. A browser on
 * an https page blocks those outright, and no CSP can allow them back in — the
 * only fix is to change the scheme, so those go through our own proxy. Signing
 * the URL is what stops /api/audio from being an open proxy for the internet.
 */
export function playableUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol === "https:") return u.toString();
  if (u.protocol !== "http:") return null;
  const target = u.toString();
  return `/api/audio?u=${encodeURIComponent(target)}&s=${signUrl(target)}`;
}

export function verifyUrl(url: string, sig: string): boolean {
  const expected = signUrl(url);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
