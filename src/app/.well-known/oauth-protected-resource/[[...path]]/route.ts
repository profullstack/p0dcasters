import { json, protectedResourceMetadata, preflight } from "@/lib/mcp/open-oauth";

// RFC 9728, at both the root and the /api/mcp path-suffixed location.
export const GET = () => json(protectedResourceMetadata());
export const OPTIONS = () => preflight();
