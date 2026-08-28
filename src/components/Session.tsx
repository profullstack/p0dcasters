"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";

type Me = { signedIn: boolean; email?: string };

type SessionState = Me & { known: boolean; refresh: () => Promise<void> };

const Ctx = createContext<SessionState>({
  signedIn: false,
  known: false,
  refresh: async () => {},
});

export function useSession() {
  return useContext(Ctx);
}

/**
 * The session is fetched once per page load and shared, rather than read in the
 * root layout — see src/app/api/me/route.ts for why the pages must stay static.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me>({ signedIn: false });
  const [known, setKnown] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      setMe(res.ok ? await res.json() : { signedIn: false });
    } catch {
      setMe({ signedIn: false });
    } finally {
      setKnown(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ ...me, known, refresh }}>{children}</Ctx.Provider>;
}

export function AccountNav() {
  const { signedIn, known } = useSession();
  // Nothing is rendered until the answer is in: flashing "Sign in" at somebody
  // who is signed in reads as having been logged out.
  if (!known) return <span className="nav-placeholder" aria-hidden="true" />;
  if (!signedIn) {
    return (
      <Link className="nav-cta" href="/login">
        Sign in
      </Link>
    );
  }
  return (
    <>
      <Link href="/following">Following</Link>
      <Link href="/account">Account</Link>
    </>
  );
}
