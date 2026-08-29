"use client";

import { useEffect, useRef, useState } from "react";
import { safeImage } from "@/lib/format";

// Third-party artwork dies constantly across 22k feeds, and Chromium paints its
// own broken-image icon when it does. Only JS can suppress that, so swap in a
// typographic placeholder on error instead.
export default function Art({
  src,
  title,
  className,
  size = 400,
}: {
  src: string;
  title: string;
  className?: string;
  /** Square intrinsic size, for the aspect ratio. CSS pins the drawn size. */
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const initial = (title || "?").trim().charAt(0).toUpperCase();
  // http:// artwork is mixed content on an https page and never paints; the
  // scheme is upgraded rather than the policy loosened. See safeImage.
  const url = safeImage(src);

  // onError alone is not enough. React only attaches the handler at hydration,
  // so artwork that 404s or refuses the connection before then has already
  // fired its error event and the swap never happens — the browser's own broken
  // icon just sits there. Re-check the tag once on mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, []);

  if (broken || !url) {
    return (
      <div className={`${className ?? ""} art-fallback`} aria-hidden="true">
        {initial}
      </div>
    );
  }
  return (
    <img
      ref={ref}
      className={className}
      src={url}
      // Named, not decorative. The artwork is the show's primary visual
      // identity and the only image on the page an answer engine can attribute
      // to it — an empty alt left 22k covers with no accessible name at all.
      alt={`${title} podcast artwork`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
