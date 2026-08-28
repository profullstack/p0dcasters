import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { count } from "@/lib/db";

// The show/domain totals below are read from the db, and the directory is
// rebuilt on its own schedule — without this the card would be frozen with
// whatever the last deploy happened to see. Same cadence as sitemap.xml.
export const revalidate = 86400;

export const alt = "p0dcasters — the independent podcast directory";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
  The site-wide social card, rendered once at build time.

  There is deliberately no twitter-image.tsx beside this file. Image file
  conventions cascade into nested segments, and a root twitter-image would
  override the show artwork that /podcast/[slug] sets in its own metadata —
  every show would share one generic card on X. With only an og:image, X falls
  back to it for the pages that have nothing better and each show keeps its art.

  Fonts are read off disk rather than named: the build box has no fontconfig, so
  a font-family string alone resolves to nothing. src/fonts holds the two files.
*/
const font = (name: string) => readFileSync(join(process.cwd(), "src/fonts", name));

const CREAM = "#fbfaf7";
const INK = "#1b1a17";
const MUTED = "#6b675e";
const ACCENT = "#a8442a";
const BORDER = "#e2ded4";

export default async function Image() {
  // Baked in at build time, like the totals on the home page. The directory
  // decays when it is not rebuilt, so a hardcoded "21,000+" would drift; if the
  // db is unreachable the line is dropped rather than shown wrong.
  const shows = await count("SELECT COUNT(*) AS n FROM podcasts").catch(() => 0);
  const hosts = await count("SELECT COUNT(DISTINCT host) AS n FROM podcasts").catch(() => 0);

  const mark = readFileSync(join(process.cwd(), "public/icons/icon-512x512.png"));
  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CREAM,
          padding: "68px 78px",
          borderBottom: `14px solid ${ACCENT}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              padding: 14,
              borderRadius: 30,
              // the mark's own background, so the tile edge is the only seam
              background: "#fdfefe",
              border: `1px solid ${BORDER}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markSrc} width={108} height={108} alt="" />
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: 30,
              fontFamily: "Mono",
              fontSize: 74,
              letterSpacing: "-0.03em",
              color: INK,
            }}
          >
            p<span style={{ color: ACCENT }}>0</span>dcasters
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: "Serif", fontSize: 56, lineHeight: 1.2, color: INK }}>
            Podcasts that live on their own domains.
          </div>
          <div
            style={{
              fontFamily: "Serif",
              fontSize: 30,
              lineHeight: 1.45,
              color: MUTED,
              marginTop: 22,
            }}
          >
            Every show here is self-hosted — no Spotify, no Anchor, no Buzzsprout.
            Listen in the browser and follow your favourites.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", fontFamily: "Mono", fontSize: 26 }}>
          <div style={{ display: "flex", color: INK }}>p0dcasters.com</div>
          {shows > 0 && (
            <div style={{ display: "flex", marginLeft: 22, color: MUTED }}>
              · {shows.toLocaleString("en-US")} shows on{" "}
              {hosts.toLocaleString("en-US")} domains
            </div>
          )}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Mono", data: font("LiberationMono-Bold.ttf"), weight: 700, style: "normal" },
        { name: "Serif", data: font("DejaVuSerif.ttf"), weight: 400, style: "normal" },
      ],
    },
  );
}
