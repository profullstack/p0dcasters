import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What p0dcasters collects, why, and how to get rid of it. An account is an email address and a list of shows you follow.",
  alternates: { canonical: "/privacy" },
};

// Written against what the code actually does — see src/lib/auth/* and
// scripts/migrate_auth.mjs. If the schema there changes, this changes with it.
export default function Privacy() {
  return (
    <div className="wrap">
      <section className="prose">
        <h1 style={{ fontSize: 31, margin: "0 0 18px", letterSpacing: "-0.02em" }}>
          Privacy
        </h1>
        <p>
          The directory itself is public and needs nothing from you: you can browse,
          search, play a show and export the whole thing as OPML without an account, and
          none of that is tied to a person.
        </p>

        <h2>What an account stores</h2>
        <p>
          Signing up creates one row with an email address in it. Alongside it:
        </p>
        <ul>
          <li>
            <strong>Your email address</strong> — the account identity, and where sign-in
            links are sent. Nothing else is mailed to it: there is no newsletter and no
            marketing.
          </li>
          <li>
            <strong>The shows you follow</strong> — a list of directory slugs, used to
            build your following feed.
          </li>
          <li>
            <strong>A session record</strong> — only the SHA-256 hash of your session
            token, so a copy of the database cannot be replayed as a login.
          </li>
          <li>
            <strong>Passkeys, if you register one</strong> — the public key and a signature
            counter. A passkey&rsquo;s private half never leaves your device and is never
            sent here.
          </li>
          <li>
            <strong>Sign-in link records</strong> — the hash of each magic link, its expiry,
            and the IP address that asked for it. The IP is kept to rate-limit sign-in
            attempts and is discarded with the record when it expires.
          </li>
        </ul>
        <p>
          There is no password to store, because there is no password:{" "}
          <Link href="/signup">signing in</Link> is a link in your inbox or a passkey.
        </p>

        <h2>Cookies</h2>
        <p>
          One cookie, set only once you sign in, holding a random session token. It is
          <code> HttpOnly</code>, <code>SameSite=Lax</code> and <code>Secure</code>, so it
          is unreadable to scripts and is not sent along on cross-site requests. Signing
          out deletes it. Nothing is stored in a cookie for signed-out visitors, so there
          is no consent banner to click past.
        </p>

        <h2>Who else is involved</h2>
        <ul>
          <li>
            <strong>Resend</strong> delivers sign-in emails, so it processes your address
            to send them.
          </li>
          <li>
            <strong>Podcast Index</strong> is where the feed metadata comes from. It is a
            one-way read: nothing about you is sent there.
          </li>
          <li>
            <strong>Publishers</strong> serve their own artwork and audio from their own
            domains. Playing an episode or loading a cover is a request from your browser
            to that publisher, which will see it the way any visit to their site would.
            That is the direct consequence of a directory that hosts nothing itself.
          </li>
          <li>
            <strong>CrawlProof</strong> supplies page analytics and the ad slots. The
            analytics are aggregate page counts, not per-person profiles.
          </li>
        </ul>
        <p>Nothing is sold, and there is no third-party advertising profile built from you.</p>

        <h2>Deleting it</h2>
        <p>
          Ask, from the address you signed up with, and the account and everything attached
          to it is deleted — follows, sessions and passkeys included. There is no waiting
          period and no copy kept afterwards. Write to{" "}
          <a href="mailto:hello@p0dcasters.com">hello@p0dcasters.com</a>, or see{" "}
          <Link href="/contact">contact</Link>.
        </p>

        <h2>Changes</h2>
        <p>
          If this ever describes something different, the page changes with it rather than
          quietly staying wrong. Last updated 29 August 2026.
        </p>
      </section>
    </div>
  );
}
