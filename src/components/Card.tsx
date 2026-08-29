import type { Podcast } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import Art from "@/components/Art";
import Link from "next/link";

export default function Card({ p }: { p: Podcast }) {
  return (
    <Link className="card" href={`/podcast/${p.slug}`}>
      <Art src={p.image_url} title={p.title} size={68} />
      <div className="meta">
        <h3>{p.title}</h3>
        <div className="host">{p.host}</div>
        <div className="sub">
          {Number(p.episode_count).toLocaleString()} episodes · {timeAgo(p.newest_pubdate)}
        </div>
      </div>
    </Link>
  );
}
