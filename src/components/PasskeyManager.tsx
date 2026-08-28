"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";

export type PasskeyRow = {
  id: string;
  label: string | null;
  created_at: number;
  last_used_at: number | null;
};

function when(unix: number | null): string {
  if (!unix) return "never";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PasskeyManager({ passkeys }: { passkeys: PasskeyRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/passkey/register");
      if (!optionsRes.ok) throw new Error("Sign in again and retry.");
      const options = await optionsRes.json();
      const response = await startRegistration({ optionsJSON: options });
      const label =
        typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
          ? "Apple device"
          : typeof navigator !== "undefined" && /Android/.test(navigator.userAgent)
            ? "Android device"
            : "This browser";
      const verifyRes = await fetch("/api/auth/passkey/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response, label }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}));
        throw new Error(body.error || "That passkey could not be saved.");
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!/abort|NotAllowed|cancel/i.test(message)) setError(message || "That failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/auth/passkey/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="passkeys">
      {passkeys.length === 0 ? (
        <p className="muted">
          No passkeys yet. Add one and you will not need the emailed link on this
          device again.
        </p>
      ) : (
        <ul className="passkey-list">
          {passkeys.map((k) => (
            <li key={k.id}>
              <div>
                <b>{k.label || "Passkey"}</b>
                <span className="muted small">
                  added {when(k.created_at)} · last used {when(k.last_used_at)}
                </span>
              </div>
              <button
                type="button"
                className="btn small"
                disabled={busy}
                onClick={() => remove(k.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn primary" onClick={add} disabled={busy}>
        {busy ? "Working…" : "Add a passkey"}
      </button>
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
