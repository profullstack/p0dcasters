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

export type Principal = { sub: string; scopes: string[] };

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
    return { sub, scopes: scope.split(/\s+/).filter(Boolean) };
  } catch {
    return null;
  }
}
