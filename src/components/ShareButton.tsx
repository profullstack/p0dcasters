"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Share the show: the page's public link, with its title and a line about
 * it wherever there is room for them.
 *
 * On a phone that is the device's own share sheet, which takes all three
 * and lets the network decide what fits. Everywhere else it is the link on
 * the clipboard, which is what gets pasted into a chat or an address bar;
 * the title and the line ride along as the page's own card when the link
 * unfurls. A sheet dismissed is not a failure and says nothing.
 */
export default function ShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const settle = (next: "done" | "failed") => {
    setState(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1800);
  };

  const share = async () => {
    const sheet = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof sheet.share === "function") {
      try {
        await sheet.share({ title, text, url });
        return;
      } catch (error) {
        // Dismissed: nothing to say. Refused (a desktop browser with the
        // function but no sheet): the clipboard is the next best thing.
        if ((error as Error).name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(url);
      settle("done");
    } catch {
      settle("failed");
    }
  };

  const label = state === "done" ? "Link copied" : state === "failed" ? "Copy failed" : "Share";
  return (
    <button
      type="button"
      className={state === "done" ? "btn share done" : "btn share"}
      onClick={share}
      aria-label={`Share ${title}`}
      title="Share this show: the device's share sheet where there is one, or the page's link copied"
    >
      {label}
    </button>
  );
}
