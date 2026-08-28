"use client";

import { useEffect, useRef, useState } from "react";

// Third-party artwork dies constantly across 22k feeds, and Chromium paints its
// own broken-image icon when it does. Only JS can suppress that, so swap in a
// typographic placeholder on error instead.
export default function Art({
  src,
  title,
  className,
}: {
  src: string;
  title: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const initial = (title || "?").trim().charAt(0).toUpperCase();

  // onError alone is not enough. React only attaches the handler at hydration,
  // so artwork that 404s or refuses the connection before then has already
  // fired its error event and the swap never happens — the browser's own broken
  // icon just sits there. Re-check the tag once on mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, []);

  if (broken || !src) {
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
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
