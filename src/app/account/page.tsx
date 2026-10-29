import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { count } from "@/lib/db";
import { currentUser } from "@/lib/auth/session";
import { credentialsFor } from "@/lib/auth/passkey";
import PasskeyManager from "@/components/PasskeyManager";
import ProfileForm from "@/components/ProfileForm";
import NewsletterToggle from "@/components/NewsletterToggle";
import { isSubscribed } from "@/lib/newsletter-store";
import { describeSlot, slotFrom } from "@/lib/newsletter";
import { COLUMNS } from "@profullstack/profile";
import { profileStore } from "@/lib/profile";
import Ad from "@/components/Ad";
import { AD_TEXT } from "@/lib/ads";
import { canDisconnect, coinpayConfig, coinpayMessage, isPlaceholderEmail } from "@/lib/auth/coinpay";
import { dbCoinpayStore } from "@/lib/auth/coinpay-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false },
};

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");

  const [passkeys, follows, mine, digest, coinpay] = await Promise.all([
    credentialsFor(user.id),
    count("SELECT COUNT(*) n FROM follows WHERE user_id = ?", [user.id]),
    // A missing table must not take the account page down with it.
    profileStore().get(user.id).catch(() => null),
    isSubscribed(user.id).catch(() => true),
    dbCoinpayStore().identityByUser(user.id).catch(() => null),
  ]);
  const placeholder = isPlaceholderEmail(user.email);
  const coinpayNote = coinpayMessage(params.coinpay);
  // Only the six fields cross to the client form, as plain strings.
  const profileValues: Record<string, string | null> = Object.fromEntries(
    COLUMNS.map((c) => [c, mine?.[c] == null ? null : String(mine[c])]),
  );
  // A CoinPay-made account has an undeliverable placeholder address; never
  // prefill it (nor the unverified CoinPay email) as the reader's.
  if (!profileValues.email && !placeholder) profileValues.email = user.email;

  return (
    <div className="wrap narrow">
      <h1>Your account</h1>
      <p className="muted">
        Signed in {placeholder ? <>with <b>CoinPay</b></> : <>as <b>{user.email}</b></>}. Joined{" "}
        {new Date(user.created_at * 1000).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        .
      </p>

      {/* Settings pages get the quietest unit and nothing else, under the
          heading and clear of the panels — every control on this page is one
          the reader came here to press. */}
      <Ad format={AD_TEXT} />

      <section className="panel">
        <h2>Your details</h2>
        <p className="muted">
          Your name and, if you like, where you work. Only the email and your name are
          required.
        </p>
        <ProfileForm initial={profileValues} />
      </section>

      <section className="panel">
        <h2>Weekly digest</h2>
        <p className="muted">
          One email a week, {describeSlot(slotFrom(process.env))}: the shows new to the directory,
          the most followed, and what the big catalogues published.{" "}
          <Link href="/newsletter">The latest issue</Link>.
        </p>
        <NewsletterToggle initial={digest} />
      </section>

      <section className="panel">
        <h2>Following</h2>
        <p>
          {follows === 0 ? (
            <>
              You are not following anything yet. <Link href="/browse">Browse</Link> the
              directory and hit follow on a show.
            </>
          ) : (
            <>
              <b>{follows.toLocaleString()}</b> {follows === 1 ? "show" : "shows"} ·{" "}
              <Link href="/following">See them</Link>
            </>
          )}
        </p>
      </section>

      <section className="panel" id="coinpay">
        <h2>CoinPay</h2>
        {params.coinpay === "connected" && <p className="auth-note">CoinPay is connected.</p>}
        {params.coinpay === "disconnected" && <p className="auth-note">CoinPay is disconnected.</p>}
        {coinpayNote && <p className="auth-error">{coinpayNote}</p>}
        {coinpay ? (
          <>
            <p className="muted">
              Connected: you can sign in here with your CoinPay account
              {coinpay.coinpay_email ? <> ({coinpay.coinpay_email})</> : null}.
            </p>
            {canDisconnect(user, passkeys.length) ? (
              <form action="/api/v1/coinpay/disconnect" method="post">
                <button className="btn" type="submit">
                  Disconnect CoinPay
                </button>
              </form>
            ) : (
              <p className="muted small">
                CoinPay is the only way into this account. Add a passkey below before
                disconnecting it.
              </p>
            )}
          </>
        ) : coinpayConfig() ? (
          <>
            <p className="muted">
              Connect your CoinPay account to sign in here with it, the same account you
              use across the Profullstack sites.
            </p>
            <a className="btn" href="/api/v1/coinpay/oauth/start?mode=connect">
              Connect CoinPay
            </a>
          </>
        ) : (
          <p className="muted">Connecting CoinPay is not available right now.</p>
        )}
      </section>

      <section className="panel">
        <h2>Passkeys</h2>
        <p className="muted">
          A passkey is your face, fingerprint or device PIN instead of an email round
          trip. Add one per device you use.
        </p>
        <PasskeyManager
          passkeys={passkeys.map((k) => ({
            id: k.id,
            label: k.label,
            created_at: Number(k.created_at),
            last_used_at: k.last_used_at ? Number(k.last_used_at) : null,
          }))}
        />
      </section>

      <section className="panel">
        <h2>Sign out</h2>
        <form action="/api/auth/logout" method="post">
          <button className="btn" type="submit">
            Sign out on this device
          </button>
        </form>
      </section>
    </div>
  );
}
