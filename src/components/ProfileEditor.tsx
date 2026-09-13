"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/Session";

type Reply = {
  ok: boolean;
  error?: string;
  markdown?: string;
  editable?: boolean;
  claimed?: boolean;
  public?: boolean;
  method?: string;
  checked?: string[];
};

/**
 * Claim, then edit. The whole file in one box, because the file is the
 * thing: what the person saves is what every reader gets. The server keeps
 * the difference from the generated document, so a section left alone keeps
 * following the feed, and a section written as `none` goes away.
 *
 * The page is shared by everybody; this asks the browser who is signed in
 * and the server whether they may edit.
 */
export default function ProfileEditor({ slug, claimed, markdown, isPublic }: { slug: string; claimed: boolean; markdown: string; isPublic: boolean }) {
  const { signedIn, known, email } = useSession();
  const [editable, setEditable] = useState<boolean | null>(null);
  const [isClaimed, setClaimed] = useState(claimed);
  const [text, setText] = useState(markdown);
  const [pub, setPub] = useState(isPublic);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const api = `/api/podcast/${encodeURIComponent(slug)}/openprofile`;

  useEffect(() => {
    if (!known) return;
    if (!signedIn) {
      setEditable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(api, { cache: "no-store", headers: { accept: "application/json" } });
        const body = (await res.json()) as Reply;
        if (cancelled) return;
        setEditable(Boolean(body.editable));
        setClaimed(Boolean(body.claimed));
        if (body.markdown) setText(body.markdown);
        if (typeof body.public === "boolean") setPub(body.public);
      } catch {
        if (!cancelled) setEditable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, signedIn, known]);

  async function claim() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`${api}/claim`, { method: "POST", headers: { accept: "application/json" } });
      const body = (await res.json()) as Reply;
      if (!res.ok || !body.ok) {
        setNote(body.error ?? "The claim did not go through.");
      } else {
        setClaimed(true);
        setEditable(true);
        setNote(`Claimed, verified by ${body.method === "owner-email" ? "the feed's owner address" : body.method === "admin" ? "an admin" : "a link back from your site or feed"}.`);
      }
    } catch {
      setNote("We could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(api, {
        method: "PUT",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ markdown: text, public: pub }),
      });
      const body = (await res.json()) as Reply;
      if (!res.ok || !body.ok) setNote(body.error ?? "Not saved.");
      else {
        if (body.markdown) setText(body.markdown);
        setNote("Saved. Readers get the new file within the hour.");
      }
    } catch {
      setNote("We could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!known || editable === null) return null;

  if (!signedIn) {
    return (
      <section className="panel">
        <h2>Is this you?</h2>
        <p>
          Sign in with the address in your feed&apos;s <code>itunes:owner</code>, or link to this profile from your
          show&apos;s site, then claim it and correct anything here. It stays yours across every rebuild of the
          directory.
        </p>
        <a className="btn" href={`/login?next=${encodeURIComponent(`/podcast/${slug}/profile`)}`}>
          Sign in to claim
        </a>
      </section>
    );
  }

  if (!editable) {
    return (
      <section className="panel">
        <h2>Is this you?</h2>
        <p>
          {isClaimed
            ? "This profile has been claimed by someone else. If that is wrong, write to hello@p0dcasters.com."
            : <>Signed in as <b>{email}</b>. The claim goes through when that is the address in the feed&apos;s <code>itunes:owner</code>, or when the show&apos;s site or feed description links to this profile.</>}
        </p>
        {!isClaimed && (
          <button className="btn primary" type="button" onClick={claim} disabled={busy}>
            {busy ? "Checking the feed…" : "Claim this profile"}
          </button>
        )}
        {note && <p className="muted" style={{ marginTop: 12 }}>{note}</p>}
      </section>
    );
  }

  return (
    <section className="panel auth">
      <h2>Edit the file</h2>
      <p className="muted">
        Yours to correct: the identity block, the headline, and every section, including{" "}
        <a href="https://logicsrc.com/openbroadcast" rel="noopener">Broadcast</a> (Seeking, Not, Slots, Book, Pays,
        Charges) and <a href="https://logicsrc.com/openguest" rel="noopener">Guest</a> (Available, Expertise, Pitch,
        Formats, Rate, Appeared on). A section you leave alone keeps following your feed; a section written as the one
        word <code>none</code> is removed.
      </p>
      <label htmlFor="openprofile-md">openprofile.md</label>
      <textarea id="openprofile-md" rows={22} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <input id="openprofile-public" type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} />
        Public: listed, served at the file URL, and offered to directories that read it
      </label>
      <button className="btn primary" type="button" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
      {note && <p className="muted" style={{ marginTop: 12 }}>{note}</p>}
    </section>
  );
}
