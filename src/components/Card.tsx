import type { Podcast } from "@/lib/db";
import { safeImage } from "@/lib/format";
import TimeAgo from "@/components/TimeAgo";
import Art from "@/components/Art";
import Link from "next/link";

export default function Card({ p }: { p: Podcast }) {
  return (
    <Link className="card" href={`/podcast/${p.slug}`}>
      {/* Upgraded here, not only inside <Art>. Art is a client component, so a
          raw http:// URL passed to it is serialised into the RSC payload and
          ships in the HTML — nothing fetches it, but it reads as mixed content
          to anything grepping the page, which is most auditors. */}
      <Art src={safeImage(p.image_url)} title={p.title} size={68} />
      <div className="meta">
        <h3>{p.title}</h3>
        <div className="host">{p.host}</div>
        <div className="sub">
          {Number(p.episode_count).toLocaleString()} episodes · <TimeAgo unix={p.newest_pubdate} />
        </div>
      </div>
    </Link>
  );
}
