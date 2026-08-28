"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Episode } from "@/lib/feed";
import { clock, usePlayer, type Track } from "@/components/Player";
import { timeAgo } from "@/lib/format";

export type FollowedShow = {
  slug: string;
  title: string;
  image: string;
  host: string;
};

type Loaded = { show: FollowedShow; episodes: Episode[] };

/**
 * The shows render server-side and instantly; the episodes are pulled in from
 * the browser afterwards. Fetching a hundred feeds inside the page render would
 * make the page as slow as the slowest publisher, and this way a dead feed
 * costs one missing row instead of the whole page.
 */
async function pool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export default function FollowingFeed({ shows }: { shows: FollowedShow[] }) {
  const player = usePlayer();
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const got = await pool(shows, 4, async (show) => {
        try {
          const res = await fetch(`/api/episodes/${encodeURIComponent(show.slug)}`);
          if (!res.ok) return { show, episodes: [] as Episode[] };
          const body = (await res.json()) as { episodes: Episode[] };
          const episodes = (body.episodes || []).slice(0, 5);
          if (!cancelled) setLoaded((prev) => [...prev, { show, episodes }]);
          return { show, episodes };
        } catch {
          return { show, episodes: [] as Episode[] };
        }
      });
      if (!cancelled) {
        setLoaded(got);
        setDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shows]);

  const tracks = useMemo<Track[]>(() => {
    const flat: { t: Track; when: number }[] = [];
    for (const { show, episodes } of loaded) {
      for (const e of episodes) {
        flat.push({
          when: e.pubdate,
          t: {
            id: `${show.slug}:${e.id}`,
            title: e.title,
            audio: e.audio,
            duration: e.duration,
            showSlug: show.slug,
            showTitle: show.title,
            image: e.image || show.image || null,
          },
        });
      }
    }
    flat.sort((a, b) => b.when - a.when);
    return flat.slice(0, 60).map((x) => x.t);
  }, [loaded]);

  const dates = useMemo(() => {
    const map = new Map<string, number>();
    for (const { show, episodes } of loaded) {
      for (const e of episodes) map.set(`${show.slug}:${e.id}`, e.pubdate);
    }
    return map;
  }, [loaded]);

  return (
    <>
      <section>
        <h2 className="sec">Newest from your shows</h2>
        {tracks.length === 0 ? (
          <p className="muted">
            {done
              ? "None of these feeds would give us an episode list just now."
              : "Reading feeds…"}
          </p>
        ) : (
          <ol className="episodes">
            {tracks.map((t) => {
              const current = player.isCurrent(t.id);
              const when = dates.get(t.id) || 0;
              return (
                <li key={t.id} className={current ? "episode on" : "episode"}>
                  <button
                    type="button"
                    className="episode-play"
                    onClick={() => player.toggle(t, tracks)}
                    aria-label={
                      current && player.playing ? `Pause ${t.title}` : `Play ${t.title}`
                    }
                  >
                    {current && player.playing ? "❚❚" : "▶"}
                  </button>
                  <div className="episode-body">
                    <h3>{t.title}</h3>
                    <p className="episode-meta">
                      <Link href={`/podcast/${t.showSlug}`}>{t.showTitle}</Link>
                      {when ? ` · ${timeAgo(when)}` : ""}
                      {t.duration ? ` · ${clock(t.duration)}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
