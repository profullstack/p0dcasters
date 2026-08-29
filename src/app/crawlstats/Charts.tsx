/**
 * The charts on /crawlstats.
 *
 * Server-rendered SVG with no script behind it. The rest of the site works with
 * JavaScript off and a status board is the last page that should need a bundle
 * to draw a bar.
 *
 * Two rules, the same ones the sister page on rssamplifier.com uses:
 *
 * 1. **No text inside the SVG.** A viewBox scales everything in it, type
 *    included, so an 11px label renders at 16px on a desktop and 5px on a
 *    phone. The marks scale; the labels are HTML beside them.
 * 2. **The numbers are readable without the picture.** Every mark carries a
 *    <title> — a tooltip in a browser, a label to a screen reader — and every
 *    chart ships its series as a table behind a <details>. A chart you cannot
 *    read the values off is decoration.
 */

const W = 720;
const H = 170;

/** A non-zero bar never rounds away to nothing. */
const MIN_BAR = 2;

/**
 * How big the directory was at each rebuild.
 *
 * Plotted against rebuilds rather than dates on purpose: rebuilds happen when
 * Podcast Index republishes, which is roughly weekly and deliberately not on a
 * schedule of ours. Evenly spaced points would imply a cadence that is not
 * there, so each point is labelled with its own date instead.
 */
export function GrowthChart({ series }: { series: { at: number; count: number }[] }) {
  if (series.length < 2) {
    return (
      <Unavailable
        title="Directory size"
        note={
          series.length === 0
            ? "No rebuild has been recorded yet."
            : "One rebuild recorded so far — a second gives this a shape."
        }
      />
    );
  }

  const counts = series.map((p) => p.count);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  // A directory that moves by 1% between rebuilds is a flat line against a
  // zero baseline and a cliff against a tight one. Pad the observed range by a
  // fifth of itself: the shape stays honest and the scale is in the caption.
  const pad = (max - min) * 0.2 || Math.max(max * 0.01, 1);
  const lo = Math.max(min - pad, 0);
  const hi = max + pad;

  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);

  const line = series
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.count).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  return (
    <figure className="chart">
      <figcaption className="chart-title">
        Shows in the directory, at each recorded rebuild
        <span className="chart-scale">
          {fmt(min)} – {fmt(max)}
        </span>
      </figcaption>

      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Directory size across ${series.length} rebuilds, from ${fmt(series[0].count)} to ${fmt(counts[counts.length - 1])} shows`}>
        <Grid />
        <path className="chart-area" d={area} />
        <path className="chart-line" d={line} />
        {series.map((p, i) => (
          <circle key={p.at} className="chart-dot" cx={x(i)} cy={y(p.count)} r="3">
            <title>{`${day(p.at)}: ${fmt(p.count)} shows`}</title>
          </circle>
        ))}
      </svg>

      <div className="chart-axis">
        <span>{day(series[0].at)}</span>
        <span>{day(series[series.length - 1].at)}</span>
      </div>

      <Table
        summary={`${series.length} rebuilds`}
        head={["Rebuild", "Shows", "Change"]}
        rows={series.map((p, i) => [
          day(p.at),
          fmt(p.count),
          i === 0 ? "—" : delta(p.count - series[i - 1].count),
        ])}
      />
    </figure>
  );
}

/**
 * The directory by how recently each show last published.
 *
 * This is the closest thing the site has to a crawl-health histogram. Nothing
 * here is fetched on a schedule — the shape of this chart is the shape of the
 * directory's freshness, and the right-hand bars are what the next rebuild
 * removes.
 */
export function FreshnessChart({
  buckets,
}: {
  buckets: { label: string; days: string; count: number }[];
}) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const total = buckets.reduce((n, b) => n + b.count, 0);
  const step = W / buckets.length;
  const width = Math.max(1, step - 8);

  return (
    <figure className="chart">
      <figcaption className="chart-title">
        Shows by age of newest episode
        <span className="chart-scale">peak {fmt(max)}</span>
      </figcaption>

      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label="Shows grouped by how long ago they last published">
        <Grid />
        {buckets.map((b, i) => {
          const h = b.count === 0 ? 0 : Math.max((b.count / max) * (H - 4), MIN_BAR);

          return (
            <rect
              key={b.days}
              className={i >= buckets.length - 2 ? "chart-bar chart-bar-warn" : "chart-bar"}
              x={i * step + 4}
              y={H - h}
              width={width}
              height={h}
            >
              <title>{`${b.label} (${b.days}): ${fmt(b.count)} shows, ${pct(b.count, total)}`}</title>
            </rect>
          );
        })}
      </svg>

      <div className="chart-axis chart-axis-spread">
        {buckets.map((b) => (
          <span key={b.days}>{b.days}</span>
        ))}
      </div>

      <Table
        summary={`${buckets.length} bands`}
        head={["Newest episode", "Shows", "Share"]}
        rows={buckets.map((b) => [
          `${b.label} (${b.days})`,
          fmt(b.count),
          pct(b.count, total),
        ])}
      />
    </figure>
  );
}

/**
 * One category's size across the rebuilds on record.
 *
 * Deliberately unscaled against the other rows: a category with nine thousand
 * shows and one with forty cannot share an axis, and the question a sparkline
 * answers is "which way is this going", not "how big is it".
 */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span className="spark-empty">—</span>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 92;
  const h = 22;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - 2 - ((v - min) / span) * (h - 4);

  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path className="chart-line" d={line} />
      <circle className="chart-dot" cx={w} cy={y(values[values.length - 1])} r="2.5" />
    </svg>
  );
}

/**
 * Four recessive rules at quarters of the scale. The scale is in the caption; a
 * gridline is here to let the eye compare two marks across the width, not to be
 * read off.
 */
function Grid() {
  return (
    <g className="chart-rules" aria-hidden="true">
      {[0, 0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={H * f + 0.5} y2={H * f + 0.5} />
      ))}
      <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="chart-baseline" />
    </g>
  );
}

/**
 * A chart with nothing behind it says so, in the space the chart would take.
 * An axis with no marks on it reads as "zero", and the answer is "not yet known".
 */
function Unavailable({ title, note }: { title: string; note: string }) {
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <div className="chart-empty">{note}</div>
    </figure>
  );
}

function Table({
  summary,
  head,
  rows,
}: {
  summary: string;
  head: string[];
  rows: string[][];
}) {
  return (
    <details className="chart-data">
      <summary>{summary}</summary>
      <table className="crawl-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={i === 0 ? undefined : "num"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((cell, i) => (
                <td key={head[i]} className={i === 0 ? undefined : "num"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function fmt(n: number): string {
  return Number(n ?? 0).toLocaleString("en-US");
}

function delta(n: number): string {
  if (n === 0) return "no change";
  return `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
}

function pct(n: number, total: number): string {
  if (!total) return "0%";
  const p = (n / total) * 100;
  return p === 0 ? "0%" : p < 0.1 ? "<0.1%" : `${p.toFixed(p < 10 ? 1 : 0)}%`;
}

function day(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}
