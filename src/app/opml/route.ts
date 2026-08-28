import { all } from "@/lib/db";

export const revalidate = 86400;

// Strip C0 control bytes: a raw one anywhere makes the OPML unparseable, and
// feed titles out of the wild do contain them. Built via RegExp so the source
// file itself stays free of control characters.
const CONTROL = new RegExp("[\\u0000-\\u001F]", "g");

function esc(s: string) {
  return (s || "")
    .replace(CONTROL, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Row = { title: string; feed_url: string; link: string | null };

export async function GET(req: Request) {
  const cat = new URL(req.url).searchParams.get("category");
  const rows = cat
    ? await all<Row>(
        "SELECT title, feed_url, link FROM podcasts WHERE category = ? ORDER BY score DESC",
        [cat],
      )
    : await all<Row>("SELECT title, feed_url, link FROM podcasts ORDER BY score DESC");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head>\n` +
    `  <title>p0dcasters - independent podcasts${cat ? ` (${esc(cat)})` : ""}</title>\n` +
    `  <dateCreated>${new Date().toUTCString()}</dateCreated>\n</head>\n<body>\n` +
    rows
      .map(
        (r) =>
          `  <outline type="rss" text="${esc(r.title)}" title="${esc(r.title)}" xmlUrl="${esc(
            r.feed_url,
          )}"${r.link ? ` htmlUrl="${esc(r.link)}"` : ""} />`,
      )
      .join("\n") +
    `\n</body>\n</opml>\n`;

  return new Response(body, {
    headers: {
      "content-type": "text/x-opml; charset=utf-8",
      "content-disposition": `attachment; filename="p0dcasters${cat ? `-${cat}` : ""}.opml"`,
    },
  });
}
