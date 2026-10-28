"use client";

import { useState } from "react";

/**
 * The weekly digest on /account: one checkbox, saved the moment it changes
 * with PUT /api/v1/me/newsletter. The box goes back to what the server holds
 * when the save fails, so it never shows a choice that was not stored.
 */
export default function NewsletterToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function change(next: boolean) {
    setOn(next);
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/v1/me/newsletter", {
        method: "PUT",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ subscribed: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setOn(Boolean(data.subscribed));
      setStatus(data.subscribed ? "Subscribed." : "Unsubscribed.");
    } catch {
      setOn(!next);
      setStatus("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="auth-check" htmlFor="account-newsletter">
        <input id="account-newsletter" type="checkbox" checked={on} disabled={busy} onChange={(e) => void change(e.target.checked)} />
        <span>Send me the weekly p0dcasters digest</span>
      </label>
      {status && <p className="muted small">{status}</p>}
    </div>
  );
}
