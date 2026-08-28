"use client";

import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { suggestEmail } from "@/lib/auth/typo";

/**
 * One implementation behind both /login and /signup. There is no separate
 * account-creation flow — an unknown address makes the account when the link is
 * opened — but a site with no page called sign-up reads as a site with no
 * accounts, so the wording is all that differs.
 */
export default function AuthForm({
  mode,
  next,
  expired,
}: {
  mode: "login" | "signup";
  next: string;
  expired: boolean;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(
    expired ? "That link had already been used, or it expired. Here is another." : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  /**
   * A near-miss like `.con` is checked here because it cannot be checked
   * anywhere else: the endpoint deliberately answers the same way for every
   * address, so a bounced link is indistinguishable from a delivered one. The
   * guard is a prompt, never a wall — submitting again with the suggestion on
   * screen sends to the address as typed, so an unfamiliar domain still works.
   */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!suggestion) {
      const near = suggestEmail(email);
      if (near) {
        setSuggestion(near);
        return;
      }
    }
    void send(email);
  }

  async function send(address: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/magic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, next }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || "That did not work. Try again.");
      } else {
        setSent(true);
        setSentTo(address);
        setNote(body.message);
      }
    } catch {
      setError("We could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function passkey() {
    setBusy(true);
    setError(null);
    try {
      const optionsRes = await fetch("/api/auth/passkey/login");
      if (!optionsRes.ok) throw new Error("options");
      const options = await optionsRes.json();
      const response = await startAuthentication({ optionsJSON: options });
      const verifyRes = await fetch("/api/auth/passkey/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}));
        throw new Error(body.error || "verify");
      }
      window.location.href = next || "/following";
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // A cancelled system dialog is not an error worth shouting about.
      if (!/abort|NotAllowed|cancel/i.test(message)) {
        setError(
          message === "options" || message === "verify"
            ? "That passkey did not work. Use the emailed link instead."
            : message,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-done">
        <h2>Check your email</h2>
        <p>{note}</p>
        <p className="muted">
          The link works once and expires in 15 minutes. Opening it on this device
          signs you in here.
        </p>
        {/* Naming the address is the only way a reader can catch a slip they
            have already made. The endpoint cannot tell them it bounced, so the
            address they typed is shown back to them instead. */}
        <p className="muted">
          Sent to <strong>{sentTo}</strong>.{" "}
          <button
            type="button"
            className="linklike"
            onClick={() => {
              setSent(false);
              setNote(null);
              setSuggestion(null);
            }}
          >
            Not your address?
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="auth">
      <h1>{mode === "signup" ? "Create your account" : "Sign in"}</h1>
      <p className="muted">
        {mode === "signup"
          ? "Follow the shows you like and they will be waiting for you here. Give us an address and we will email you a link — that is the whole account."
          : "We will email you a link. No password to remember, because there isn't one."}
      </p>

      {note && !sent && <p className="auth-note">{note}</p>}

      <form onSubmit={submit}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email webauthn"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Editing the address retracts the question we asked about it.
            setSuggestion(null);
          }}
          aria-describedby={suggestion ? "email-suggestion" : undefined}
        />

        {suggestion && (
          <p className="auth-note" id="email-suggestion">
            Did you mean <strong>{suggestion}</strong>?{" "}
            <button
              type="button"
              className="linklike"
              onClick={() => {
                setEmail(suggestion);
                setSuggestion(null);
                void send(suggestion);
              }}
            >
              Use that instead
            </button>{" "}
            — or send it again to use the address as you typed it.
          </p>
        )}

        <button className="btn primary wide" type="submit" disabled={busy || !email}>
          {busy ? "Sending…" : "Email me a link"}
        </button>
      </form>

      <div className="auth-or">
        <span>or</span>
      </div>

      <button type="button" className="btn wide" onClick={passkey} disabled={busy}>
        Use a passkey
      </button>
      <p className="muted small">
        Passkeys are added from your account page once you are in. The emailed link
        stays as the way back if you lose the device.
      </p>

      {error && <p className="auth-error">{error}</p>}

      <p className="auth-swap">
        {mode === "signup" ? (
          <>
            Already have an account? <a href="/login">Sign in</a>
          </>
        ) : (
          <>
            New here? <a href="/signup">Create an account</a>
          </>
        )}
      </p>
    </div>
  );
}
