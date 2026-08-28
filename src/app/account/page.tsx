import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { count } from "@/lib/db";
import { currentUser } from "@/lib/auth/session";
import { credentialsFor } from "@/lib/auth/passkey";
import PasskeyManager from "@/components/PasskeyManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false },
};

export default async function Account() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");

  const [passkeys, follows] = await Promise.all([
    credentialsFor(user.id),
    count("SELECT COUNT(*) n FROM follows WHERE user_id = ?", [user.id]),
  ]);

  return (
    <div className="wrap narrow">
      <h1>Your account</h1>
      <p className="muted">
        Signed in as <b>{user.email}</b>. Joined{" "}
        {new Date(user.created_at * 1000).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        .
      </p>

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
