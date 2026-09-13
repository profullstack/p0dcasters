import { revalidatePath } from "next/cache";
import type { Overrides } from "@profullstack/openprofile";
import { currentUser } from "@/lib/auth/session";
import { bearerPrincipal, EDIT_SCOPE } from "@/lib/openaccess";
import { showBySlug } from "@/lib/queries";
import { editorOf, rememberPrincipal, renderShowProfile, saveOverrides, type Rendered } from "@/lib/openprofile/store";
import { profileReply } from "@/lib/openprofile/reply";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const headers = { "cache-control": "private, no-store", "access-control-allow-origin": "*" };

/** GET /api/podcast/{slug}/openprofile: the profile as JSON, with whether the caller may edit it. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await showBySlug(slug);
  if (!p) return Response.json({ ok: false, error: "not found" }, { status: 404, headers });
  const [r, user, principal] = await Promise.all([renderShowProfile(p), currentUser(), bearerPrincipal(req)]);
  const editor = editorOf(r.row, user, principal);
  if (!r.public && !editor) return Response.json({ ok: false, error: "this profile is private" }, { status: 404, headers });
  return Response.json(profileReply(slug, r, Boolean(editor)), { headers });
}

/**
 * PUT /api/podcast/{slug}/openprofile: correct the profile.
 *
 * `text/markdown` is the whole file, and everything in it becomes an
 * override; `application/json` is `{ identity, headline, sections, public }`
 * and merges. The owner's session, an admin, or an OpenAccess bearer with
 * `openprofile:edit` on the owner's behalf. Claim first.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await showBySlug(slug);
  if (!p) return Response.json({ ok: false, error: "not found" }, { status: 404, headers });
  const [r, user, principal] = await Promise.all([renderShowProfile(p, { readFeed: false }), currentUser(), bearerPrincipal(req)]);
  const editor = editorOf(r.row, user, principal);
  if (!editor) {
    const why = r.claimed
      ? `only the owner may edit this profile: sign in as them, or present an OpenAccess token with scope ${EDIT_SCOPE}`
      : `this profile is unclaimed: POST https://p0dcasters.com/api/podcast/${encodeURIComponent(slug)}/openprofile/claim first, signed in as the feed's owner`;
    return Response.json({ ok: false, error: why, claimed: r.claimed }, { status: r.claimed ? 403 : 409, headers });
  }

  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  let input: { markdown?: string; overrides?: Overrides; public?: boolean };
  try {
    if (type.includes("json")) {
      const body = (await req.json()) as Record<string, unknown>;
      const overrides: Overrides = {};
      if (typeof body.name === "string" || body.name === null) overrides.name = body.name as string | null;
      if (typeof body.headline === "string" || body.headline === null) overrides.headline = body.headline as string | null;
      if (typeof body.prose === "string" || body.prose === null) overrides.prose = body.prose as string | null;
      if (body.identity && typeof body.identity === "object") overrides.identity = body.identity as Record<string, string | null>;
      if (body.sections && typeof body.sections === "object") overrides.sections = body.sections as Record<string, string>;
      input = { overrides, public: typeof body.public === "boolean" ? body.public : undefined };
      if (typeof body.markdown === "string") input.markdown = body.markdown;
    } else {
      input = { markdown: await req.text() };
    }
  } catch {
    return Response.json({ ok: false, error: "bad request" }, { status: 400, headers });
  }

  let saved: Rendered;
  try {
    saved = await saveOverrides(p, input, editor);
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 413, headers });
  }
  if (editor.via === "openaccess" && principal) await rememberPrincipal(slug, principal.sub);
  try {
    revalidatePath(`/podcast/${slug}/openprofile.md`);
    revalidatePath(`/podcast/${slug}/profile`);
  } catch {
    /* outside a request scope */
  }
  return Response.json({ ...profileReply(slug, saved, true), by: editor.by, via: editor.via }, { headers });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...headers, "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "authorization, content-type" },
  });
}
