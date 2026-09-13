import type { Rendered } from "./store";
import { profilePage, profileUrl, showPage } from "./generate";

/** The profile as the JSON routes and the MCP tools return it. */
export function profileReply(slug: string, r: Rendered, editable: boolean) {
  return {
    ok: true,
    slug,
    name: r.doc.name,
    markdown: r.markdown,
    url: profileUrl(slug),
    page: profilePage(slug),
    show: showPage(slug),
    public: r.public,
    claimed: r.claimed,
    claimMethod: r.row?.claim_method ?? null,
    editable,
    updatedAt: new Date(r.updatedAt * 1000).toISOString(),
  };
}
