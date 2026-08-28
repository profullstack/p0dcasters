// FTS5 treats raw user input as a *query*, so punctuation ("c++", an unclosed
// quote, a bare "-") is a syntax error and 500s the route. Tokenise to bare
// words, then AND them; if that finds nothing the caller retries with OR.
export function tokenise(input: string): string[] {
  return (input || "")
    .normalize("NFKD")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && t.length < 32)
    .slice(0, 8);
}

export function ftsQuery(tokens: string[], join: "AND" | "OR"): string {
  return tokens.map((t) => `"${t.replace(/"/g, "")}"*`).join(` ${join} `);
}
