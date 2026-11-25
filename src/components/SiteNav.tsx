"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/Session";

/**
 * The site navigation, in two tiers.
 *
 * It used to be one flat row of ten links plus the account links. That row was
 * wider than the header from about 640px to 1000px, and below 640px it wrapped
 * into three rows of a sticky header. A row cannot absorb a twelfth link; a
 * menu can. So: the five places people go most stay in the bar, the rest sit
 * behind "More", and under 860px the whole list sits behind one "Menu" button.
 *
 * Every link is in the DOM exactly once (the two account links are the one
 * exception, see below) and CSS decides which tier it shows in, so the markup
 * a crawler reads does not depend on the viewport. New pages go in MORE: that
 * list grows downwards and never needs the bar re-measured.
 */
const PRIMARY = [
  { href: "/podcasts", label: "Podcasts" },
  { href: "/radio", label: "Radio" },
  { href: "/tv", label: "TV" },
  { href: "/browse", label: "Browse" },
  { href: "/search", label: "Search" },
];

const MORE = [
  { href: "/networks", label: "Networks" },
  { href: "/self-hosted", label: "Self-hosted" },
  { href: "/hosts", label: "Hosts" },
  { href: "/submit", label: "Add a show" },
  { href: "/about", label: "About" },
];

const ACCOUNT = [
  { href: "/following", label: "Following" },
  { href: "/account", label: "Account" },
];

export function SiteNav() {
  const pathname = usePathname();
  const { signedIn, known } = useSession();
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Navigation here is client side, so the header never remounts: without this
  // the menu would stay open over the page that was just chosen from it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const link = (item: { href: string; label: string }, className?: string) => {
    const current = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        className={className}
        aria-current={current ? "page" : undefined}
        // Choosing the page you are already on changes no pathname, so the
        // effect above would not close the menu.
        onClick={() => setOpen(false)}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      ref={navRef}
      className="sitenav"
      aria-label="Site"
      data-open={open ? "" : undefined}
      onBlur={(e) => {
        // Tabbing out of the menu closes it, so it is never left open behind
        // the focus.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="sitenav-panel" id={panelId}>
        <div className="sitenav-primary">{PRIMARY.map((item) => link(item))}</div>
        <div className="sitenav-more">
          {MORE.map((item) => link(item))}
          {/* The account links again, for the narrow layout only: there the bar
              has room for the brand, "Sign in" and the button, and no more. */}
          {signedIn && ACCOUNT.map((item) => link(item, "sitenav-narrow"))}
        </div>
      </div>
      {/* Nothing is rendered until the answer is in: flashing "Sign in" at
          somebody who is signed in reads as having been logged out. */}
      {!known ? (
        <span className="nav-placeholder" aria-hidden="true" />
      ) : signedIn ? (
        ACCOUNT.map((item) => link(item, "sitenav-wide"))
      ) : (
        <Link className="nav-cta" href="/login" onClick={() => setOpen(false)}>
          Sign in
        </Link>
      )}
      <button
        ref={toggleRef}
        type="button"
        className="sitenav-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sitenav-wide">More</span>
        <span className="sitenav-narrow">Menu</span>
        <svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </nav>
  );
}
