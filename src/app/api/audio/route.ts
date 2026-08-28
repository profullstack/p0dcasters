import { verifyUrl } from "@/lib/audio";

export const dynamic = "force-dynamic";

const UA = "p0dcasters/1.0 (+https://p0dcasters.com)";

/**
 * Streams an http:// enclosure over https so the browser will play it. Only
 * URLs this app signed are accepted, so it cannot be pointed at anything else.
 * Range headers pass through in both directions — without them the browser
 * cannot seek, and Safari refuses to start at all.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const target = params.get("u") || "";
  const sig = params.get("s") || "";
  if (!target || !sig || !verifyUrl(target, sig)) {
    return new Response("bad signature", { status: 403 });
  }

  let upstream: URL;
  try {
    upstream = new URL(target);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    return new Response("bad scheme", { status: 400 });
  }

  const range = req.headers.get("range");
  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: {
        "user-agent": UA,
        ...(range ? { range } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    return new Response("upstream unreachable", { status: 502 });
  }

  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ]) {
    const v = res.headers.get(name);
    if (v) headers.set(name, v);
  }
  if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=3600");

  return new Response(res.body, { status: res.status, headers });
}

export async function HEAD(req: Request) {
  const res = await GET(req);
  return new Response(null, { status: res.status, headers: res.headers });
}
