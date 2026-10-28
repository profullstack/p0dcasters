import { newsletterInfo } from "@/lib/newsletter-store";

export const dynamic = "force-dynamic";

/** The weekly digest: when it goes out, when next, and the latest issue. Public. */
export async function GET() {
  return Response.json(await newsletterInfo(), {
    headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
  });
}
