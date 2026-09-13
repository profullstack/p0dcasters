"use client";

import { useState } from "react";
import Link from "next/link";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "listed"; slug: string }
  | { kind: "existing"; slug: string }
  | { kind: "rejected" }
  | { kind: "error"; message: string };

/** Approve or reject one submission, in place, without leaving the queue. */
export default function ReviewButtons({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [reason, setReason] = useState("");

  async function decide(decision: "approve" | "reject") {
    setState({ kind: "busy" });
    try {
      const res = await fetch(`/api/review/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setState({ kind: "error", message: body.error || `HTTP ${res.status}` });
      } else if (body.status === "listed") {
        setState({ kind: "listed", slug: body.slug });
      } else if (body.status === "existing") {
        setState({ kind: "existing", slug: body.slug });
      } else {
        setState({ kind: "rejected" });
      }
    } catch {
      setState({ kind: "error", message: "We could not reach the server." });
    }
  }

  if (state.kind === "listed" || state.kind === "existing") {
    return (
      <p className="review-done">
        {state.kind === "listed" ? "Listed: " : "Was already listed: "}
        <Link href={`/podcast/${state.slug}`}>/podcast/{state.slug}</Link>
      </p>
    );
  }
  if (state.kind === "rejected") return <p className="review-done muted">Rejected.</p>;

  return (
    <div className="review-actions">
      <input
        type="text"
        placeholder="Reason (optional, kept with the decision)"
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
        disabled={state.kind === "busy"}
      />
      <div className="actions">
        <button type="button" className="btn primary small" disabled={state.kind === "busy"} onClick={() => decide("approve")}>
          {state.kind === "busy" ? "Working…" : "Approve and list"}
        </button>
        <button type="button" className="btn small" disabled={state.kind === "busy"} onClick={() => decide("reject")}>
          Reject
        </button>
      </div>
      {state.kind === "error" && <p className="auth-error">{state.message}</p>}
    </div>
  );
}
