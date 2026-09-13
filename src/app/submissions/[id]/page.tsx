import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { batchRows, drainBatch, recoverBatch } from "@/lib/submit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your submission", robots: { index: false } };

const LABEL: Record<string, string> = {
  pending: "waiting",
  resolving: "reading the feed…",
  review: "waiting for a person",
  listed: "listed",
  existing: "already listed",
  rejected: "not listed",
};

/**
 * Where a list of URLs lands after /submit. Each row resolves in the
 * background and this page refreshes itself until they have all landed. A
 * plain meta refresh, so it works with JavaScript off and needs no polling
 * code; four seconds is about one feed.
 */
export default async function Submission({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await batchRows(id);
  if (rows.length === 0) notFound();

  const open = rows.filter((r) => r.status === "pending" || r.status === "resolving").length;
  if (open > 0 && (await recoverBatch(id))) after(async () => { await drainBatch(id); });
  const listed = rows.filter((r) => r.status === "listed" || r.status === "existing").length;
  const review = rows.filter((r) => r.status === "review").length;
  const summary = () => {
    if (open > 0) return `${rows.length - open} of ${rows.length} checked. This page refreshes on its own.`;
    const parts: string[] = [];
    if (review) parts.push(`${review} ${review === 1 ? "show is" : "shows are"} read, checked and waiting for a person to list ${review === 1 ? "it" : "them"} — usually the same day`);
    if (listed) parts.push(`${listed} ${listed === 1 ? "is" : "are"} listed`);
    if (rows.length > review + listed) parts.push(`${rows.length - review - listed} not listed`);
    return `${parts.join("; ")}.`;
  };

  return (
    <div className="wrap narrow">
      {open > 0 && <meta httpEquiv="refresh" content="4" />}
      <div className="auth">
        <h1>{open > 0 ? "Checking your shows" : review > 0 ? "In the queue" : "Done"}</h1>
        <p className="muted">{summary()}</p>
        <ul className="submission-rows">
          {rows.map((r) => (
            <li key={r.id} className={`status-${r.status}`}>
              <span className="submission-status">{LABEL[r.status] ?? r.status}</span>
              <span className="submission-what">
                {r.slug ? <Link href={`/podcast/${r.slug}`}>{r.title || r.slug}</Link> : <code>{r.input}</code>}
                {r.message && <small className="muted"> — {r.message}</small>}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          <Link href="/submit">Submit another</Link> · A show waiting for a person needs nothing more from
          you; once listed it lives at its own page like every other show here. One that was not listed can
          be resubmitted once the feed is fixed; the reason beside it is the rule it missed.
        </p>
      </div>
    </div>
  );
}
