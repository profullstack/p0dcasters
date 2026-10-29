"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Approve every submission shown in the queue, after one confirm. */
export default function AcceptAllButton({ ids }: { ids: string[] }) {
  const count = ids.length;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function acceptAll() {
    if (!window.confirm(`List all ${count} waiting submissions now?`)) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve", ids }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || body.listed === undefined) {
        setNote(body.error || `HTTP ${res.status}`);
      } else {
        setNote(`Listed ${body.listed}, already listed ${body.existing}${body.failed ? `, failed ${body.failed}` : ""}.`);
        router.refresh();
      }
    } catch {
      setNote("We could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions" style={{ margin: "0 0 18px" }}>
      <button type="button" className="btn primary small" disabled={busy || count === 0} onClick={acceptAll}>
        {busy ? "Working…" : `Accept all (${count})`}
      </button>
      {note && <span className="small muted" style={{ marginLeft: 10 }}>{note}</span>}
    </div>
  );
}
