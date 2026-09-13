import { after } from "next/server";
import { origin } from "@/lib/auth/session";
import { batchRows, drainBatch, recoverBatch } from "@/lib/submit";

export const dynamic = "force-dynamic";

/** One submission batch, row by row: what was sent and what became of it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await batchRows(id);
  if (rows.length === 0) return Response.json({ error: "not found" }, { status: 404 });
  const site = await origin();

  // Somebody is polling, so a batch a restart abandoned gets picked back up.
  if (rows.some((r) => r.status === "pending" || r.status === "resolving") && (await recoverBatch(id))) {
    after(async () => { await drainBatch(id); });
  }

  const pending = rows.filter((r) => r.status === "pending" || r.status === "resolving").length;
  return Response.json(
    {
      id,
      statusUrl: `${site}/submissions/${id}`,
      done: pending === 0,
      pending,
      rows: rows.map((r) => ({
        input: r.input,
        status: r.status,
        slug: r.slug,
        title: r.title,
        feedUrl: r.feed_url,
        page: r.slug ? `${site}/podcast/${r.slug}` : null,
        error: r.error,
        message: r.message,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
