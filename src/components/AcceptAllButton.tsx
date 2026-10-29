"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** The ids ticked with the per-row "select" boxes on the page. */
function picked(): string[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>("input[data-accept-pick]:checked")).map((el) => el.value);
}

/** Approve every submission shown in the queue, or only the ticked ones, after one confirm. */
export default function AcceptAllButton({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e.target as HTMLElement | null)?.matches?.("input[data-accept-pick]")) setSelected(picked());
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);

  const chosen = selected.length ? selected : ids;
  const count = chosen.length;

  async function accept() {
    const what = selected.length ? `the ${count} selected submission${count === 1 ? "" : "s"}` : `all ${count} waiting submissions`;
    if (!window.confirm(`List ${what} now?`)) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve", ids: chosen }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || body.listed === undefined) {
        setNote(body.error || `HTTP ${res.status}`);
      } else {
        setNote(`Listed ${body.listed}, already listed ${body.existing}${body.failed ? `, failed ${body.failed}` : ""}.`);
        setSelected([]);
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
      <button type="button" className="btn primary small" disabled={busy || count === 0} onClick={accept}>
        {busy ? "Working…" : selected.length ? `Accept selected (${count})` : `Accept all (${count})`}
      </button>
      {note && <span className="small muted" style={{ marginLeft: 10 }}>{note}</span>}
    </div>
  );
}
