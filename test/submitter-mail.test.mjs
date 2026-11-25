import { test } from "bun:test";
import assert from "node:assert/strict";
import { batchNotice, cleanEmail, emailField } from "../src/lib/submitter-mail.ts";

const row = (o = {}) => ({
  id: "a",
  input: "https://example.org",
  feed_url: "https://example.org/feed",
  slug: "example",
  title: "Example Show",
  status: "listed",
  message: null,
  reason: null,
  reviewed_at: 100,
  contact_email: "host@example.org",
  submitted_by: null,
  notified_at: null,
  ...o,
});

test("cleanEmail accepts real addresses and refuses junk", () => {
  assert.equal(cleanEmail("  Host@Example.ORG "), "host@example.org");
  assert.equal(cleanEmail("nope"), null);
  assert.equal(cleanEmail("a@b"), null);
  assert.equal(cleanEmail("a b@c.de"), null);
  assert.equal(cleanEmail(undefined), null);
});

test("emailField reads JSON and FormData bodies", () => {
  assert.equal(emailField({ email: "x@y.zz" }), "x@y.zz");
  const f = new FormData();
  f.set("email", "f@g.hh");
  assert.equal(emailField(f), "f@g.hh");
  assert.equal(emailField(null), null);
});

test("one listed row mails the submitter", () => {
  const n = batchNotice([row()]);
  assert.equal(n.to, "host@example.org");
  assert.match(n.subject, /live on p0dcasters: Example Show/);
  assert.match(n.text, /https:\/\/p0dcasters.com\/podcast\/example/);
});

test("a declined row says why", () => {
  const n = batchNotice([row({ status: "rejected", slug: null, reason: "Not a podcast." })]);
  assert.match(n.subject, /Not listed/);
  assert.match(n.text, /Not a podcast\./);
});

test("no mail while any row is still open, already sent, unreviewed, crawler or addressless", () => {
  assert.equal(batchNotice([row(), row({ id: "b", status: "review" })]), null);
  assert.equal(batchNotice([row({ notified_at: 5 })]), null);
  assert.equal(batchNotice([row({ reviewed_at: null, status: "existing" })]), null);
  assert.equal(batchNotice([row({ submitted_by: "crawler:podcorn" })]), null);
  assert.equal(batchNotice([row({ contact_email: null })]), null);
  assert.equal(batchNotice([]), null);
});

test("a batch gets one summary", () => {
  const n = batchNotice([row(), row({ id: "b", status: "rejected", reviewed_at: null, message: "No episode in 90 days." })]);
  assert.equal(n.subject, "1 of 2 shows listed on p0dcasters");
  assert.equal(n.lines.length, 2);
});
