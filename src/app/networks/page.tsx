import type { Metadata } from "next";
import Link from "next/link";
import { cachedDb } from "@/lib/cached-db";
import { NETWORKS, networkWhere } from "@/lib/networks";
import AdBanner from "@/components/AdBanner";

const { count } = cachedDb(3600);

// Rendered per request, not at build: the build must not need the database.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Networks",
  description:
    "The big podcast networks and broadcasters with their libraries on RSS — TWiT, NPR, the BBC, CBC, ABC and more — each show read from its own feed.",
  alternates: { canonical: "/networks" },
};

export default async function Networks() {
  const rows = await Promise.all(
    NETWORKS.map(async (n) => {
      const w = networkWhere(n);
      return { n, shows: await count(`SELECT COUNT(*) AS n FROM podcasts WHERE ${w.sql}`, w.params) };
    }),
  );
  const listed = rows.filter((r) => r.shows > 0).sort((a, b) => b.shows - a.shows || a.n.name.localeCompare(b.n.name));

  return (
    <div className="wrap">
      <section>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Networks</h1>
        <p style={{ color: "var(--muted)", margin: "0 0 22px", maxWidth: "62ch" }}>
          The publishers and broadcasters whose whole libraries are on RSS. A show counts
          toward a network when its feed is on the network&rsquo;s own domain or declares the
          network as its owner. Only shows with an episode in the last 90 days are listed.
        </p>
        <div className="rows">
          {listed.map(({ n, shows }) => (
            <Link className="row" key={n.slug} href={`/networks/${n.slug}`}>
              <div style={{ minWidth: 0 }}>
                <p className="t">{n.name}</p>
                <p className="s">
                  {shows.toLocaleString()} show{shows === 1 ? "" : "s"} · {n.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
        <AdBanner />
      </section>
    </div>
  );
}
