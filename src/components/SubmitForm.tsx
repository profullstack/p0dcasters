"use client";

import { useState } from "react";
import Link from "next/link";
import { explainError } from "@profullstack/submit-feed/core";

type Accepted = { url: string; slug: string; page: string; existing: boolean; title?: string };
type Rejected = { url: string; error: string; message?: string };
type Reply = {
  ok: boolean;
  accepted: Accepted[];
  rejected: Rejected[];
  queued: number;
  statusUrl?: string;
  error?: string;
  retryAfterSeconds?: number;
};

/**
 * The submit box. A plain form underneath, so it works with JavaScript off
 * (the endpoint answers a browser with a 303); with it, the same request is
 * sent as JSON and the answer is shown in place, which is faster than a
 * round trip through the show page for the person who typed the URL.
 */
export default function SubmitForm({ initial, error, errorUrl }: { initial: string; error: string; errorUrl: string }) {
  const [input, setInput] = useState(initial || errorUrl);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [failure, setFailure] = useState<string | null>(error ? describe(error) : null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = (form.elements.namedItem("opml") as HTMLInputElement | null)?.files?.[0];
    setBusy(true);
    setFailure(null);
    setReply(null);
    try {
      const body = new FormData();
      if (file) body.set("opml", file);
      body.set("input", input);
      const res = await fetch("/api/submit", { method: "POST", body, headers: { accept: "application/json" } });
      const json = (await res.json()) as Reply;
      if (!res.ok) {
        setFailure(
          json.error === "rate-limited"
            ? "Twenty submissions an hour from one address is the limit. Try again later."
            : describe(json.error ?? "bad-request"),
        );
      } else if (json.queued > 0 && json.accepted.length === 0 && json.statusUrl) {
        window.location.href = json.statusUrl;
      } else {
        setReply(json);
      }
    } catch {
      setFailure("We could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <h1>Add a show</h1>
      <p className="muted">
        Paste the podcast&rsquo;s site or its feed. The feed is found from the page, checked
        against the <Link href="/about">rules</Link>, and listed on the spot if it passes. No
        account needed.
      </p>

      <form onSubmit={submit} method="post" action="/api/submit" encType="multipart/form-data">
        <label htmlFor="input">Site or feed URL, one per line</label>
        <textarea
          id="input"
          name="input"
          rows={3}
          required={!reply}
          placeholder={"https://example.com\nhttps://example.org/podcast.rss"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <label htmlFor="opml" className="small">
          Or upload an OPML file (up to 50 feeds)
        </label>
        <input id="opml" name="opml" type="file" accept=".opml,.xml,.txt,text/xml,text/plain" />
        <button className="btn primary wide" type="submit" disabled={busy}>
          {busy ? "Reading the feed…" : "Add it"}
        </button>
      </form>

      {failure && <p className="auth-error">{failure}</p>}

      {reply && (
        <div className="auth-note submission-result">
          {reply.accepted.map((a) => (
            <p key={a.slug}>
              {a.existing ? "Already listed: " : "Listed: "}
              <Link href={`/podcast/${a.slug}`}>
                <strong>{a.title || a.slug}</strong>
              </Link>
            </p>
          ))}
          {reply.rejected.map((r) => (
            <p key={r.url}>
              Not listed <code>{r.url}</code>: {r.message || describe(r.error)}
            </p>
          ))}
          {reply.statusUrl && reply.queued > 0 && (
            <p>
              <a href={reply.statusUrl}>Watch the rest land</a>.
            </p>
          )}
        </div>
      )}

      <p className="muted small">
        A show is listed when its feed has episodes with audio, publishes from its own domain
        rather than a hosting platform, and has an episode inside the last 90 days. Anything
        on a platform is welcome at{" "}
        <a href="https://rssamplifier.com/submit">rssamplifier.com</a> instead. Submissions
        are also passed along there. Agents and scripts: the same endpoint takes JSON, see{" "}
        <Link href="/skill.md">skill.md</Link>, the <Link href="/mcp">MCP server</Link> or the{" "}
        <Link href="/cli">CLI</Link>.
      </p>
    </div>
  );
}

function describe(code: string): string {
  if (code === "hosted-platform") return `${explainError(code)} rssamplifier.com takes every feed.`;
  return explainError(code);
}
