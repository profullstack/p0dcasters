import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { broadcasts, guest, kindOf, sections } from "@profullstack/openprofile";
import { showBySlug } from "@/lib/queries";
import { renderShowProfile } from "@/lib/openprofile/store";
import { profileUrl } from "@/lib/openprofile/generate";
import ProfileEditor from "@/components/ProfileEditor";
import AdBanner from "@/components/AdBanner";
import { clamp } from "@/lib/format";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await showBySlug(slug);
  if (!p) return { title: "Not found" };
  return {
    title: `${p.author || p.title}: profile`,
    description: clamp(`The podcaster behind ${p.title}, as an OpenProfile.md: who they are, where they are, and the show.`, 160),
    alternates: { canonical: `/podcast/${p.slug}/profile` },
  };
}

/**
 * The podcaster's profile, readable, with the file itself a link away, and
 * the claim-and-edit form for the person it is about. The page is shared by
 * everyone; the editor asks the browser who is signed in.
 */
export default async function Profile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await showBySlug(slug);
  if (!p) notFound();
  const r = await renderShowProfile(p);
  if (!r.public) notFound();
  const doc = r.doc;
  const url = profileUrl(p.slug);
  const kind = kindOf(doc);
  const shows = broadcasts(doc);
  const g = guest(doc);
  const known = new Set(["accounts", "topics", "broadcast", "guest"]);
  const other = doc.sections.filter((s) => !known.has(s.name));

  return (
    <div className="wrap">
      <link rel="openprofile" href={url} />
      <section className="prose">
        <p className="muted" style={{ margin: "26px 0 6px", fontSize: 13.5 }}>
          <Link href={`/podcast/${encodeURIComponent(p.slug)}`}>{p.title}</Link> · profile
        </p>
        <h1 style={{ fontSize: 31, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{doc.name ?? p.title}</h1>
        {doc.headline && <p style={{ fontSize: 17, margin: "0 0 16px" }}>{doc.headline}</p>}
        <p className="muted" style={{ fontSize: 14 }}>
          {kind ? `${kind[0].toUpperCase()}${kind.slice(1)}` : "Unstated kind"}
          {r.claimed ? " · claimed and verified" : " · generated from the feed, not yet claimed"}
        </p>

        {doc.identity.length > 0 && (
          <dl className="profile-identity">
            {doc.identity.map((e) => (
              <div key={e.key}>
                <dt>{e.key}</dt>
                <dd>{/^https?:\/\//.test(e.value) ? <a href={e.value} rel="noopener nofollow">{e.value}</a> : e.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {sections(doc, "accounts").map((s) => (
          <div key={s.title}>
            <h2>{s.title}</h2>
            <pre><code>{s.body}</code></pre>
          </div>
        ))}
        {sections(doc, "topics").length > 0 && (
          <>
            <h2>Topics</h2>
            <pre><code>{sections(doc, "topics").map((s) => s.body).join("\n")}</code></pre>
          </>
        )}
        {shows.length > 0 && (
          <>
            <h2>Broadcast</h2>
            {shows.map((b, i) => (
              <dl className="profile-identity" key={i}>
                {Object.entries(b).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{/^https?:\/\//.test(v) ? <a href={v} rel="noopener nofollow">{v}</a> : v}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </>
        )}
        {g && (
          <>
            <h2>Guest</h2>
            <dl className="profile-identity">
              {Object.entries(g).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {other.map((s) => (
          <div key={s.title}>
            <h2>{s.title}</h2>
            <pre><code>{s.body}</code></pre>
          </div>
        ))}

        <h2>The file</h2>
        <p>
          This page is a view of one Markdown file, an{" "}
          <a href="https://logicsrc.com/openprofile" rel="noopener">OpenProfile.md</a> with the{" "}
          <a href="https://logicsrc.com/openbroadcast" rel="noopener">Broadcast</a> section. Any directory, booking
          platform or agent reads the file, not the page.
        </p>
        <pre>
          <code>{url}</code>
        </pre>
        <p className="muted" style={{ fontSize: 14 }}>
          Also over JSON at <code>/api/podcast/{p.slug}/openprofile</code>, from the <Link href="/cli">CLI</Link> with{" "}
          <code>p0d profile {p.slug}</code>, and from the <Link href="/mcp">MCP server</Link> as <code>get_openprofile</code>.
        </p>
      </section>

      <ProfileEditor slug={p.slug} claimed={r.claimed} markdown={r.markdown} isPublic={r.public} />
      <AdBanner />
    </div>
  );
}
