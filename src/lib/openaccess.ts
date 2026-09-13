import { OpenAccessApp } from "@logicsrc/openaccess/client";

/**
 * OpenAccess (openaccess.logicsrc.com): OAuth 2.1 with a grant you can carry.
 * The descriptor at /.well-known/openaccess.json names the scopes this site
 * honours; an access token minted by the hub for `p0dcasters.com` is verified
 * here offline, against the hub's published keys, and its `scope` decides what
 * the caller may do. That is how an agent submits a show, or reviews the
 * queue, without holding a session cookie.
 */
export const HUB = "https://openaccess.logicsrc.com";
export const CLIENT_ID = "p0dcasters.com";

export const SCOPE_SUBMIT = "podcasts:submit";
export const SCOPE_REVIEW = "submissions:review";
/** Edit an OpenProfile on its owner's behalf (logicsrc.com/openprofile). */
export const EDIT_SCOPE = "openprofile:edit";

export type Principal = { sub: string; scopes: string[]; email: string | null };

let app: OpenAccessApp | null = null;
function hub(): OpenAccessApp {
  if (!app) {
    app = new OpenAccessApp({
      hub: HUB,
      clientId: CLIENT_ID,
      redirectUri: `https://${CLIENT_ID}/api/v1/openaccess/callback`,
    });
  }
  return app;
}

/** The OpenAccess principal behind a bearer token, or null for none or a bad one. */
export async function bearerPrincipal(req: Request): Promise<Principal | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  try {
    const claims = await hub().verify(m[1]);
    const sub = typeof claims.sub === "string" ? claims.sub : "";
    if (!sub) return null;
    const scope = typeof claims.scope === "string" ? claims.scope : "";
    // The hub puts the person's address on the token when the grant carries
    // the `email` scope; a profile claim by bearer needs it, an edit does not.
    const email = typeof claims.email === "string" && claims.email.includes("@") ? claims.email.trim().toLowerCase() : null;
    return { sub, scopes: scope.split(/\s+/).filter(Boolean), email };
  } catch {
    return null;
  }
}
