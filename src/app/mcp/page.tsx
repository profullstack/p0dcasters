import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "@/lib/mcp/tools";
import { SITE } from "@/lib/queries";
import AdBanner from "@/components/AdBanner";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: "MCP server",
  description:
    "p0dcasters as an MCP server: search, read shows and episodes, and add a show, from any agent. No key.",
  alternates: { canonical: "/mcp" },
};

const ENDPOINT = `${SITE}/api/mcp`;

/** The tool table is rendered from the same array the server dispatches on. */
export default function Mcp() {
  return (
    <div className="wrap">
      <section className="prose">
        <h1 style={{ fontSize: 31, margin: "0 0 18px", letterSpacing: "-0.02em" }}>MCP server</h1>
        <p>
          The directory as tools for an agent. Streamable HTTP, stateless, no key and no
          account: every read is one the site answers publicly, and the one write carries the
          same budget as the <Link href="/submit">form</Link>. Discovery file at{" "}
          <a href="/.well-known/openmcp.json">/.well-known/openmcp.json</a>; the same calls
          over plain HTTP are in <a href="/openapi.json">openapi.json</a>.
        </p>
        <pre>
          <code>{ENDPOINT}</code>
        </pre>
        <h2>Add it to a client</h2>
        <pre>
          <code>{`claude mcp add --transport http p0dcasters ${ENDPOINT}`}</code>
        </pre>
        <pre>
          <code>{JSON.stringify({ mcpServers: { p0dcasters: { type: "http", url: ENDPOINT } } }, null, 2)}</code>
        </pre>
        <h2>Tools</h2>
        <table className="tools">
          <tbody>
            {TOOLS.map((t) => (
              <tr key={t.name}>
                <td>
                  <code>{t.name}</code>
                </td>
                <td>
                  <strong>{t.title}</strong>
                  <br />
                  {t.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>By hand</h2>
        <pre>
          <code>{`curl -s ${ENDPOINT} -H 'content-type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "search", "arguments": { "query": "bookbinding" } }
}'`}</code>
        </pre>
        <p className="muted">
          Both protocol eras are answered: a legacy client opens with <code>initialize</code>,
          a 2026-07-28 client sends its version in <code>_meta</code> and the matching
          headers. Nothing is remembered between requests.
        </p>
      </section>
      <AdBanner />
    </div>
  );
}
