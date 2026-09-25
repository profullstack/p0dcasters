// Postgres `to_tsquery` (like FTS5 before it) treats raw user input as a
// *query*, so punctuation ("c++", an unclosed quote, a bare "-") is a syntax
// error and 500s the route. Tokenise to bare words, then AND them; if that
// finds nothing the caller retries with OR.
export function tokenise(input: string): string[] {
  return (input || "")
    .normalize("NFKD")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && t.length < 32)
    .slice(0, 8);
}

/**
 * A tsquery over the tokens: every word a prefix match, joined with `&` or
 * `|`. Meant for `to_tsquery('simple', ?)`; the tokens carry only letters and
 * digits, so nothing here needs quoting.
 */
export function ftsQuery(tokens: string[], join: "AND" | "OR"): string {
  return tokens.map((t) => `${t}:*`).join(join === "AND" ? " & " : " | ");
}

/**
 * The search half of a podcasts query: `WHERE` and `ORDER BY` over the
 * expression index in db/schema.pg.sql. Ranked with the same relative
 * weights the FTS5 bm25() call used (title 8, host 4, author 3, description 1
 * -> A, B, C, D), so results order as they did.
 */
export const SEARCH_WHERE = "p0d_search_vector(p.title, p.host, p.author, p.description) @@ to_tsquery('simple', ?)";
export const SEARCH_ORDER =
  "ts_rank('{0.125, 0.375, 0.5, 1}', p0d_search_vector(p.title, p.host, p.author, p.description), to_tsquery('simple', ?)) DESC";
