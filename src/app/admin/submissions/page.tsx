import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import type { Podcast } from "@/lib/db";
import { isAdmin } from "@/lib/review";
import { recentDecisions, submissionsByStatus } from "@/lib/submit";
import Art from "@/components/Art";
import TimeAgo from "@/components/TimeAgo";
import ReviewButtons from "@/components/ReviewButtons";
import { safeImage } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Submissions",
  robots: { index: false, follow: false },
};

type Row = Omit<Podcast, "id" | "slug">;

function parse(json: string | null | undefined): Row | null {
  try {
    return json ? (JSON.parse(json) as Row) : null;
  } catch {
    return null;
  }
}

/**
 * The review queue. Not linked from anywhere: an admin knows the address, and
 * the email that announces each submission carries it. Anyone else gets the
 * same 404 as a page that does not exist, because for them it does not.
 */
export default async function Submissions() {
  const user = await currentUser();
  if (!isAdmin(user)) notFound();

  const [waiting, decided] = await Promise.all([submissionsByStatus("review"), recentDecisions()]);

  return (
    <div className="wrap">
      <section className="prose review">
        <h1 style={{ fontSize: 31, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Submissions</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {waiting.length === 0
            ? "Nothing waiting."
            : `${waiting.length} waiting. Approving lists the show at once; rejecting keeps the feed out until someone submits it again.`}
        </p>

        {waiting.map((s) => {
          const show = parse(s.podcast);
          return (
            <article className="review-item" key={s.id} id={`s-${s.id}`}>
              {show ? (
                <>
                  <div className="card submit-preview">
                    <Art src={safeImage(show.image_url)} title={show.title} size={68} />
                    <div className="meta">
                      <h3>{show.title}</h3>
                      <div className="host">
                        {show.host}
                        {show.author ? ` · ${show.author}` : ""}
                      </div>
                      <div className="sub">
                        {Number(show.episode_count).toLocaleString()} episodes · latest{" "}
                        <TimeAgo unix={show.newest_pubdate} />
                        {show.categories ? ` · ${show.categories.split(",").slice(0, 3).join(", ")}` : ""}
                        {show.language ? ` · ${show.language}` : ""}
                      </div>
                    </div>
                  </div>
                  <p className="review-desc">{show.description.slice(0, 500)}</p>
                </>
              ) : (
                <p className="review-desc">
                  <strong>{s.title || s.input}</strong> — no show snapshot on this row.
                </p>
              )}
              <p className="small muted review-meta">
                {s.feed_url ? <a href={s.feed_url}>{s.feed_url}</a> : null}
                {show?.link ? (
                  <>
                    {" "}
                    · <a href={show.link}>site</a>
                  </>
                ) : null}
                {" · "}submitted <TimeAgo unix={s.created_at} /> by {s.submitted_by || "anonymous"}
                {s.input && s.input !== s.feed_url ? ` · pasted ${s.input}` : ""}
              </p>
              <ReviewButtons id={s.id} />
            </article>
          );
        })}

        {decided.length > 0 && (
          <>
            <h2>Recent decisions</h2>
            <ul className="review-log">
              {decided.map((s) => (
                <li key={s.id}>
                  <b>{s.status}</b>{" "}
                  {s.slug ? <Link href={`/podcast/${s.slug}`}>{s.title || s.slug}</Link> : s.title || s.input}{" "}
                  <span className="muted small">
                    · <TimeAgo unix={s.reviewed_at ?? s.created_at} /> by {s.reviewed_by}
                    {s.reason ? ` · ${s.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
