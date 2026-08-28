"use client";

import { useState } from "react";

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
  const initial = (title || "?").trim().charAt(0).toUpperCase();

  if (broken || !src) {
    return (
      <div className={`${className ?? ""} art-fallback`} aria-hidden="true">
        {initial}
      </div>
    );
  }
  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
