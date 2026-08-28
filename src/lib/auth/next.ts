/**
 * Where to land after signing in. Only a same-site path is ever honoured —
 * `//evil.com` and `https://evil.com` are both absolute destinations a browser
 * would follow, so an unvalidated `next` turns the login route into an open
 * redirect that arrives wearing our domain.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string") return "";
  const path = value.trim();
  if (!path.startsWith("/")) return "";
  if (path.startsWith("//")) return "";
  if (path.includes("\\")) return "";
  return path;
}
