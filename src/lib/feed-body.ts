/**
 * Reading a feed body without trusting its size.
 *
 * Some podcast feeds are tens of megabytes: every episode since 2006 with the
 * full show notes inlined. `res.text()` would hold all of it, and the XML
 * parser would then build a tree several times that size, only for the first
 * few hundred items to be kept. A few of those at once took the server past
 * its heap limit. So the body is read as a stream and cut off at a fixed
 * byte budget.
 */

/** The most of any one feed we will ever hold in memory. */
export const MAX_FEED_BYTES = 5 * 1024 * 1024;

export type CappedBody = {
  text: string;
  /** True when the body was longer than the cap and we stopped reading. */
  truncated: boolean;
};

/**
 * Read at most `maxBytes` of a response body, cancelling the rest of the
 * download. A `content-length` over the cap is known to be truncated before
 * a byte arrives; the stream count is what actually enforces the limit, since
 * the header can be missing or wrong.
 */
export async function readCappedText(
  res: Response,
  maxBytes: number = MAX_FEED_BYTES,
): Promise<CappedBody> {
  const declared = Number(res.headers.get("content-length"));
  let truncated = Number.isFinite(declared) && declared > maxBytes;

  const body = res.body;
  if (!body) return { text: "", truncated: false };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const room = maxBytes - size;
      if (value.byteLength > room) {
        chunks.push(value.subarray(0, room));
        size += room;
        truncated = true;
        break;
      }
      chunks.push(value);
      size += value.byteLength;
      if (size === maxBytes) {
        // Exactly at the cap: whole only if nothing follows.
        const next = await reader.read();
        if (!next.done && next.value && next.value.byteLength > 0) truncated = true;
        break;
      }
    }
  } finally {
    // Stops the download; a no-op if the stream already ended.
    reader.cancel().catch(() => {});
  }

  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  // Non-fatal decode: a multi-byte character split by the cut turns into
  // U+FFFD, and that tail is dropped by closeTruncatedFeed anyway.
  return { text: new TextDecoder("utf-8").decode(bytes), truncated };
}

/**
 * Turn the front of a cut-off feed into a document the parser can read: keep
 * everything up to the last complete `</item>` (or Atom `</entry>`) and close
 * the elements that were still open. Feeds list newest first, so this keeps
 * the newest episodes. Returns null when not even one item made it in.
 */
export function closeTruncatedFeed(xml: string): string | null {
  const item = xml.lastIndexOf("</item>");
  const entry = xml.lastIndexOf("</entry>");
  let cut: number;
  if (item >= 0 && item >= entry) cut = item + "</item>".length;
  else if (entry >= 0) cut = entry + "</entry>".length;
  else return null;

  const head = xml.slice(0, cut);
  let tail = "";
  if (/<rdf:RDF[\s>]/.test(head)) tail = "</rdf:RDF>";
  else if (/<rss[\s>]/.test(head)) tail = "</channel></rss>";
  else if (/<feed[\s>]/.test(head)) tail = "</feed>";
  else if (/<channel[\s>]/.test(head)) tail = "</channel>";
  return head + tail;
}
