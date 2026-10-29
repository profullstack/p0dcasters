"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Read the show's feed now instead of waiting for the crawler: POSTs to
 * /api/episodes/<slug>/refresh, then re-renders the page with what came back.
 */
export default function RefreshButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "same" | "failed">("idle");

  const refresh = async () => {
    setState("busy");
    try {
      const res = await fetch(`/api/episodes/${encodeURIComponent(slug)}/refresh`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; state?: string; newEpisodes?: number | null };
      if (!body.ok) return setState("failed");
      setState(body.newEpisodes ? "done" : "same");
      router.refresh();
    } catch {
      setState("failed");
    } finally {
      window.setTimeout(() => setState("idle"), 2500);
    }
  };

  const label = { idle: "↻ Refresh", busy: "Reading…", done: "New episodes", same: "Up to date", failed: "Feed did not answer" }[state];
  return (
    <button type="button" className="btn" onClick={refresh} disabled={state === "busy"} aria-live="polite" title="Read this show's feed now">
      {label}
    </button>
  );
}
