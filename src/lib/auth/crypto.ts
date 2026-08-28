import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Next inlines `process.env.FOO` at build time, so a literal lookup freezes
// (and usually drops) the value into the build output. Read through a variable
// key to keep it a real runtime lookup — same reason as src/lib/db.ts.
export function env(key: string): string | undefined {
  return process.env[key];
}

export function secret(): string {
  const s = env("AUTH_SECRET");
  if (s && s.length >= 16) return s;
  if (env("NODE_ENV") === "production") {
    throw new Error("AUTH_SECRET is not set");
  }
  // Development only: stable across a `next dev` process, so sessions survive
  // hot reloads without anyone having to configure anything to click around.
  return "dev-insecure-secret-p0dcasters";
}

export function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

/** `value.signature`, so the value can be handed to a browser and read back. */
export function seal(value: string): string {
  return `${Buffer.from(value).toString("base64url")}.${sign(value)}`;
}

export function unseal(sealed: string | undefined): string | null {
  if (!sealed) return null;
  const dot = sealed.lastIndexOf(".");
  if (dot < 1) return null;
  let value: string;
  try {
    value = Buffer.from(sealed.slice(0, dot), "base64url").toString();
  } catch {
    return null;
  }
  return equals(sealed.slice(dot + 1), sign(value)) ? value : null;
}

export function equals(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}
