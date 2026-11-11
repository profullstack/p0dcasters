import { authorizationServerMetadata, json, preflight } from "@/lib/mcp/open-oauth";

// RFC 8414. Open sign-in for the MCP endpoint: see lib/mcp/open-oauth.ts.
export const GET = () => json(authorizationServerMetadata());
export const OPTIONS = () => preflight();
