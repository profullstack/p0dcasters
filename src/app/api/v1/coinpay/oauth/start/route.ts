import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import {
  PENDING_COOKIE,
  PENDING_COOKIE_PATH,
  PENDING_TTL,
  beginSignIn,
  coinpayConfig,
  encodePending,
} from "@/lib/auth/coinpay";

export const dynamic = "force-dynamic";

// Relative Locations for our own pages: behind the proxy `req.url` is the
// internal bind address (see api/auth/logout).
const back = (path: string) => new Response(null, { status: 302, headers: { location: path } });

/** GET ?mode=login|connect&next=/path  ->  302 to CoinPay's authorize page. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const mode = params.get("mode") === "connect" ? "connect" : "login";
  const next = safeNext(params.get("next"));
  const cfg = coinpayConfig();
  if (!cfg) return back(mode === "connect" ? "/account?coinpay=unavailable" : "/login?coinpay=unavailable");
  // Connecting attaches CoinPay to the account you are in; there must be one.
  if (mode === "connect" && !(await currentUser())) return back("/login?next=/account");

  const { pending, url } = beginSignIn(cfg, mode, next);
  const jar = await cookies();
  jar.set(PENDING_COOKIE, encodePending(pending), {
    httpOnly: true,
    // lax: CoinPay's redirect back is a top-level GET navigation, which lax allows.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: PENDING_COOKIE_PATH,
    maxAge: PENDING_TTL,
  });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
