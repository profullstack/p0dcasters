import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AdBanner from "@/components/AdBanner";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: "CLI",
  description: "The p0dcasters directory from the terminal: search, show, episodes, submit, opml. One file, no dependencies.",
  alternates: { canonical: "/cli" },
};

type Command = { name: string; usage: string; summary: string; detail: string; options?: string[]; examples?: string[] };

/**
 * The command table is read from the CLI's own COMMANDS array, so what this
 * page documents is exactly what the served file dispatches.
 */
async function commands(): Promise<Command[]> {
  const file = path.join(process.cwd(), "public", "cli", "p0d.mjs");
  const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${file}?v=${(await readFile(file, "utf8")).length}`)) as { COMMANDS: Command[] };
  return mod.COMMANDS;
}

export default async function Cli() {
  const cmds = await commands();
  return (
    <div className="wrap">
      <section className="prose">
        <h1 style={{ fontSize: 31, margin: "0 0 18px", letterSpacing: "-0.02em" }}>CLI</h1>
        <p>
          <code>p0d</code> is the directory from a terminal: search it, read a show and its
          episodes, take it as OPML, and <Link href="/submit">add a show</Link>. One Node
          script with no dependencies, installed by copying it onto your PATH.
        </p>
        <pre>
          <code>curl -fsSL https://p0dcasters.com/install.sh | sh</code>
        </pre>
        <p className="muted">
          Needs Node 22 or newer. Installs to <code>~/.local/bin/p0d</code> (<code>P0D_BIN</code>{" "}
          overrides). <code>p0d update</code> fetches the current file; <code>p0d remove --yes</code>{" "}
          deletes it. Or read the <a href="/cli/p0d.mjs">source</a> first.
        </p>
        <h2>Commands</h2>
        <table className="tools">
          <tbody>
            {cmds.map((c) => (
              <tr key={c.name}>
                <td>
                  <code>p0d {c.usage}</code>
                </td>
                <td>
                  <strong>{c.summary}</strong>
                  <br />
                  {c.detail}
                  {c.options?.length ? (
                    <>
                      <br />
                      <span className="muted small">{c.options.join("  ")}</span>
                    </>
                  ) : null}
                  {c.examples?.length ? (
                    <pre>
                      <code>{c.examples.join("\n")}</code>
                    </pre>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          <code>--api &lt;url&gt;</code> or <code>P0D_API</code> points it at another deployment.
          Everything it calls is in <a href="/openapi.json">openapi.json</a>.
        </p>
      </section>
      <AdBanner />
    </div>
  );
}
