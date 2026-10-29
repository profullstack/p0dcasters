import { cookies } from "next/headers";
import { finishSignIn, sameState } from "@profullstack/coinpay-onboard/oauth";
import { currentUser, startSession } from "@/lib/auth/session";
import {
  PENDING_COOKIE,
  PENDING_COOKIE_PATH,
  claimsFrom,
  coinpayConfig,
  decodePending,
  redirectUri,
  resolveCoinpayUser,
} from "@/lib/auth/coinpay";
import { dbCoinpayStore } from "@/lib/auth/coinpay-store";

export const dynamic = "force-dynamic";

const back = (path: string) =>
  new Response(null, { status: 302, headers: { location: path, "cache-control": "no-store" } });

/** CoinPay redirects here with ?code&state (or ?error). */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const pending = decodePending(jar.get(PENDING_COOKIE)?.value);
  // Single use: the pending sign-in is spent whatever happens next.
  jar.set(PENDING_COOKIE, "", { path: PENDING_COOKIE_PATH, maxAge: 0 });

  const fail = (code: string) =>
    back(pending?.mode === "connect" ? `/account?coinpay=${code}` : `/login?coinpay=${code}`);

  const cfg = coinpayConfig();
  if (!cfg) return fail("unavailable");
  if (!pending) return fail("expired");
  if (!sameState(pending.state, params.get("state"))) return fail("state");
  if (params.get("error")) return fail("denied");
  const code = params.get("code");
  if (!code) return fail("denied");

  let claims;
  try {
    const r = await finishSignIn({
      code,
      verifier: pending.verifier,
      nonce: pending.nonce,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri: redirectUri(cfg),
      base: cfg.base,
    });
    claims = claimsFrom(r);
  } catch (err) {
    console.error("coinpay sign-in failed:", err instanceof Error ? err.message : err);
    return fail("failed");
  }

  const me = await currentUser();
  const result = await resolveCoinpayUser(
    { mode: pending.mode, currentUserId: me?.id ?? null, claims },
    dbCoinpayStore(),
  );
  if (!result.ok) return fail(result.code);

  if (pending.mode === "connect") return back("/account?coinpay=connected");
  await startSession(result.userId);
  return back(pending.next || (result.action === "created" ? "/account" : "/following"));
}
