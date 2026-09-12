// The session cookie's name, on its own so the crawl gateway can read it from
// the edge runtime. session.ts imports the database and cannot be loaded
// there; this file imports nothing.
export const SESSION_COOKIE = "p0d_session";
