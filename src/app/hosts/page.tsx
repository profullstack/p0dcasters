import type { Metadata } from "next";
import { all } from "@/lib/db";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Domains",
  description:
    "The domains publishing independent podcasts — each one self-hosted rather than sitting on a platform.",
  alternates: { canonical: "/hosts" },
};

export default async function Hosts() {
  const rows = await all<{ host: string; n: number; eps: number }>(
    `SELECT host, COUNT(*) AS n, SUM(episode_count) AS eps
     FROM podcasts GROUP BY host ORDER BY n DESC, eps DESC LIMIT 300`,
  );
  return (
    <div className="wrap">
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Domains</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 22px", maxWidth: "62ch" }}>
          Most independent publishers run exactly one show from their own domain. These are
          the 300 domains carrying the most, and none of them is a hosting platform — those
          are excluded by construction.
        </p>
        <div className="rows">
          {rows.map((h) => (
            <a className="row" key={h.host} href={`/search?q=${encodeURIComponent(h.host)}`}>
              <div style={{ minWidth: 0 }}>
                <p className="t" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 14.5 }}>
                  {h.host}
                </p>
                <p className="s">
                  {Number(h.n).toLocaleString()} show{Number(h.n) === 1 ? "" : "s"} ·{" "}
                  {Number(h.eps).toLocaleString()} episodes
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
