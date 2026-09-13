import { revalidatePath } from "next/cache";
import { currentUser, findOrCreateUser } from "@/lib/auth/session";
import { bearerPrincipal, EDIT_SCOPE } from "@/lib/openaccess";
import { isAdmin } from "@/lib/review";
import { showBySlug } from "@/lib/queries";
import { claimProfile, renderShowProfile } from "@/lib/openprofile/store";
import { profileReply } from "@/lib/openprofile/reply";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const headers = { "cache-control": "private, no-store", "access-control-allow-origin": "*" };

/**
 * POST /api/podcast/{slug}/openprofile/claim
 *
 * The signed-in person claims the show's profile. Verified against the feed
 * they publish: their address is the feed's itunes:owner address, or the
 * show's site or feed links back at the profile. An OpenAccess bearer whose
 * grant carries the email scope claims the same way. An admin passes
 * `{ userEmail }` to claim on someone's behalf.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await showBySlug(slug);
  if (!p) return Response.json({ ok: false, error: "not found" }, { status: 404, headers });
  const [user, principal] = await Promise.all([currentUser(), bearerPrincipal(req)]);

  let body: { userEmail?: unknown } = {};
  try {
    if ((req.headers.get("content-type") ?? "").includes("json")) body = (await req.json()) as { userEmail?: unknown };
  } catch {
    body = {};
  }

  let claimant = user;
  let admin = null;
  if (user && isAdmin(user) && typeof body.userEmail === "string" && body.userEmail.includes("@")) {
    admin = user;
    claimant = await findOrCreateUser(body.userEmail);
  } else if (!user && principal?.scopes.includes(EDIT_SCOPE) && principal.email) {
    claimant = await findOrCreateUser(principal.email);
  }
  if (!claimant) {
    return Response.json(
      { ok: false, error: `sign in first, or present an OpenAccess token with scopes ${EDIT_SCOPE} and email` },
      { status: 401, headers },
    );
  }

  const out = await claimProfile(p, claimant, { admin, principal });
  if (!out.ok) return Response.json({ ok: false, error: out.error, checked: out.checked }, { status: out.status, headers });
  try {
    revalidatePath(`/podcast/${slug}/profile`);
  } catch {
    /* outside a request scope */
  }
  const r = await renderShowProfile(p, { readFeed: false });
  return Response.json({ ...profileReply(slug, r, true), method: out.method, alreadyOwner: out.alreadyOwner, owner: claimant.email }, { headers });
}
