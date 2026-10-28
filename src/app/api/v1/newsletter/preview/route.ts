import { previewIssue } from "@/lib/newsletter-store";
import { UNSUBSCRIBE_PLACEHOLDER, NEWSLETTER_URL } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

/**
 * This week's issue as it would be built now, from the live directory: the
 * subject, the HTML and the plain text. Public; no recipients, nothing is
 * written. The unsubscribe link, which differs per reader, is left as a
 * placeholder. Built at most once a quarter hour.
 */
export async function GET() {
  try {
    const issue = await previewIssue();
    return Response.json(
      { ...issue, unsubscribePlaceholder: UNSUBSCRIBE_PLACEHOLDER, page: NEWSLETTER_URL },
      { headers: { "cache-control": "public, max-age=900", "access-control-allow-origin": "*" } },
    );
  } catch (err) {
    console.error("newsletter preview failed:", err);
    return Response.json({ error: "the preview could not be built" }, { status: 503 });
  }
}
