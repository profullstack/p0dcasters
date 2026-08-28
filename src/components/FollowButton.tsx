"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/Session";

/**
 * Resolves its own state from the browser. The show page is statically
 * rendered and shared by everybody, so it cannot know who is asking — this
 * button is the only part of it that varies per visitor.
 */
export default function FollowButton({ slug }: { slug: string }) {
  const { signedIn, known } = useSession();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!known) return;
    if (!signedIn) {
      setFollowing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/follow?slug=${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (!cancelled) setFollowing(Boolean(body.following));
      } catch {
        if (!cancelled) setFollowing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, signedIn, known]);

  if (!known) return <span className="btn follow ghosted" aria-hidden="true" />;

  if (!signedIn) {
    return (
      <a
        className="btn follow"
        href={`/login?next=${encodeURIComponent(`/podcast/${slug}`)}`}
      >
        ☆ Follow
      </a>
    );
  }

  async function submit() {
    const wanted = !following;
    setBusy(true);
    setFollowing(wanted); // optimistic; reverted if the write does not land
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, following: wanted }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setFollowing(!wanted);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={following ? "btn follow on" : "btn follow"}
      onClick={submit}
      disabled={busy || following === null}
      aria-pressed={Boolean(following)}
    >
      {following ? "★ Following" : "☆ Follow"}
    </button>
  );
}
