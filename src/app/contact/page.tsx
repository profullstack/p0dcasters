import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to reach p0dcasters — to get a show listed or removed, correct its metadata, delete an account, or report a security issue.",
  alternates: { canonical: "/contact" },
};

export default function Contact() {
  return (
    <div className="wrap">
      <section className="prose">
        <h1 style={{ fontSize: 31, margin: "0 0 18px", letterSpacing: "-0.02em" }}>
          Contact
        </h1>
        <p>
          One address, read by a person:{" "}
          <a href="mailto:hello@p0dcasters.com">
            <strong>hello@p0dcasters.com</strong>
          </a>
          . p0dcasters is built and run by{" "}
          <a href="https://profullstack.com">Profullstack</a>.
        </p>

        <h2>Getting a show listed</h2>
        <p>
          There is no submission form, because listing is not a decision anyone makes by
          hand — a feed is in when it meets the rules on the{" "}
          <Link href="/about">about page</Link>, and the directory rebuilds from the{" "}
          <a href="https://podcastindex.org">Podcast Index</a>. So the two useful things to
          check first are that your feed is in the Podcast Index at all, and that it is not
          failing one of those rules. If both look right and it still isn&rsquo;t here, that is
          worth an email.
        </p>

        <h2>Getting a show removed, or its details fixed</h2>
        <p>
          Write in and it comes out — no argument, no form. Metadata errors are worth
          reporting too, though note that titles, descriptions and artwork are read from
          your feed: fixing the feed fixes the listing at the next rebuild, and fixes it
          everywhere else that reads the index rather than only here.
        </p>

        <h2>Accounts</h2>
        <p>
          To delete an account and everything attached to it, email from the address you
          signed up with. See <Link href="/privacy">privacy</Link> for what is stored.
        </p>

        <h2>Security</h2>
        <p>
          Report anything security-related to the same address; there is a{" "}
          <a href="/.well-known/security.txt">security.txt</a> as well. Please give us a
          reasonable window to fix an issue before publishing it.
        </p>
      </section>
    </div>
  );
}
