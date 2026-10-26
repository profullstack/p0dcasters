"use client";

import { useState } from "react";
import { ProfileFields } from "@profullstack/profile/react";

type Values = Record<string, string | null>;

/**
 * The signup profile, editable on /account: prefilled from the server, saved
 * with PATCH /api/v1/me/profile. Uncontrolled, re-keyed on save so the inputs
 * show what the server normalized them to.
 */
export default function ProfileForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const body = Object.fromEntries(new FormData(e.currentTarget).entries());
      const res = await fetch("/api/v1/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setErrors({});
        setValues(data.profile ?? data);
        setStatus("Saved.");
      } else {
        setErrors(data.errors ?? {});
        setStatus(data.errors ? "A few of those fields need another look." : "Could not save. Try again.");
      }
    } catch {
      setStatus("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <ProfileFields key={JSON.stringify(values)} defaultValues={values} errors={errors} idPrefix="account-" />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save details"}
      </button>
      {status && <span className="muted small"> {status}</span>}
    </form>
  );
}
