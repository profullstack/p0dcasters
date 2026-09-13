#!/usr/bin/env node
/**
 * p0dcasters CLI.
 *
 * Talks to the public HTTP API rather than the database, so it needs no
 * credentials and works against any deployment, including a local one via
 * `--api http://localhost:3000`.
 *
 * One file, zero dependencies, deliberately. The installer at /install.sh
 * downloads this exact source and drops it on PATH: no build step, no
 * tarball, no npm. That only works while everything the program needs is in
 * here, so this file imports nothing but node: builtins.
 *
 * It is both a module and a program: the tests import {@link run}, and the
 * shebang plus the guard at the bottom make the same file executable.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';

export const VERSION = '0.1.0';
const DEFAULT_API = 'https://p0dcasters.com';

/**
 * Every command, in the order they are worth learning. `--help` and the
 * table on /cli are both rendered from this array, so a command cannot be
 * documented and dead, or dispatched and undocumented.
 *
 * @typedef {{ name: string, usage: string, summary: string, detail: string,
 *   options?: string[], examples?: string[] }} Command
 * @type {Command[]}
 */
export const COMMANDS = [
  {
    name: 'search',
    usage: 'search <query>',
    summary: 'Search the directory',
    detail:
      'Full-text search over titles, descriptions, authors and domains. Every show here publishes from its own domain, so a show on Spotify or Anchor will not be found, and that says nothing about the show.',
    options: ['--limit <n>', '--json'],
    examples: ['p0d search bookbinding', 'p0d search "linux podcast" --limit 5 --json'],
  },
  {
    name: 'show',
    usage: 'show <slug>',
    summary: 'One show, in full',
    detail: 'The show behind a slug: publisher, description, cadence, language, feed URL, site and page. Slugs come from search and from the page URL /podcast/<slug>.',
    options: ['--json'],
    examples: ['p0d show steve-farrar'],
  },
  {
    name: 'episodes',
    usage: 'episodes <slug>',
    summary: 'Episodes of a show, newest first',
    detail: 'Read live from the publisher\'s feed, with the audio URL of each so the output pipes into a player. --m3u prints the playlist URL instead.',
    options: ['--limit <n>', '--m3u', '--json'],
    examples: ['p0d episodes steve-farrar --limit 3', 'p0d episodes steve-farrar --m3u'],
  },
  {
    name: 'submit',
    usage: 'submit <url|file.opml> …',
    summary: 'Add a show to the directory',
    detail:
      'Give it the show\'s site or its feed, several of either, or an OPML file. The feed is found from a site URL, checked against the rules (audio episodes, its own domain, an episode inside 90 days) and listed on the spot; a refusal names the rule. No account needed; twenty requests an hour per address.',
    options: ['--json'],
    examples: ['p0d submit example.org', 'p0d submit https://example.org/podcast.rss https://other.org', 'p0d submit subscriptions.opml'],
  },
  {
    name: 'opml',
    usage: 'opml [category]',
    summary: 'The directory as OPML, to stdout',
    detail: 'Every show, or one subject, as an OPML subscription list any podcast app imports. Prefer this to crawling the site.',
    examples: ['p0d opml > p0dcasters.opml', 'p0d opml history'],
  },
  {
    name: 'update',
    usage: 'update',
    summary: 'Replace this program with the version the site serves',
    detail: 'Only for a copy the installer put on PATH; refuses in a checkout. Prints the direction of the change and never guards against a downgrade, since matching the server is the point.',
  },
  {
    name: 'remove',
    usage: 'remove [--yes]',
    summary: 'Uninstall',
    detail: 'Deletes the installed copy of this program and nothing else. A dry run until --yes.',
    options: ['--yes'],
  },
  {
    name: 'help',
    usage: 'help [command]',
    summary: 'This list, or one command in detail',
    detail: 'Every command with its options and examples.',
  },
  {
    name: 'version',
    usage: 'version',
    summary: 'Print the version',
    detail: 'The version of this file. The site serves the current one at /cli/p0d.mjs.',
  },
];

/**
 * Parse argv into positionals and flags. `--x y` and `--x=y` both set x; a
 * bare `--x` is true. `--` ends flag parsing.
 *
 * @param {string[]} argv
 * @returns {{ args: string[], flags: Record<string, string|boolean> }}
 */
export function parseArgs(argv) {
  const args = [];
  /** @type {Record<string, string|boolean>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[a.slice(2)] = next;
          i += 1;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

/** @param {Record<string, string|boolean>} flags @param {NodeJS.ProcessEnv} env */
export function apiBase(flags, env) {
  const raw = typeof flags.api === 'string' ? flags.api : env.P0D_API || DEFAULT_API;
  return raw.replace(/\/+$/, '');
}

/** @param {unknown} text @param {number} max */
export function truncate(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * The I/O the commands need, injectable so the tests run without a network
 * or a filesystem.
 *
 * @typedef {{ out: (s: string) => void, err: (s: string) => void,
 *   fetch: typeof fetch, readFile: (p: string) => Promise<string>,
 *   env: NodeJS.ProcessEnv, argv1?: string }} IO
 */

/**
 * Run one invocation. Returns the exit code rather than calling process.exit,
 * so the tests can assert on it.
 *
 * @param {string[]} argv
 * @param {Partial<IO>} [io]
 * @returns {Promise<number>}
 */
export async function run(argv, io = {}) {
  /** @type {IO} */
  const o = {
    out: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
    fetch: globalThis.fetch,
    readFile: async (p) => (await import('node:fs/promises')).readFile(p, 'utf8'),
    env: process.env,
    ...io,
  };
  const { args, flags } = parseArgs(argv);
  const [name, ...rest] = args;
  const base = apiBase(flags, o.env);

  if (!name || name === 'help' || flags.help) return help(rest[0], o);
  if (name === 'version' || flags.version) {
    o.out(VERSION);
    return 0;
  }

  const request = async (path, init) => {
    const res = await o.fetch(`${base}${path}`, {
      ...init,
      headers: { accept: 'application/json', 'user-agent': `p0d/${VERSION}`, ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${res.status} ${res.statusText}: ${truncate(text, 200)}`);
    }
    if (!res.ok) throw new Error(body?.error ? String(body.error) : `${res.status} ${res.statusText}`);
    return body;
  };

  try {
    switch (name) {
      case 'search': {
        const q = rest.join(' ').trim();
        if (!q) return fail(o, 'search: give a query');
        const limit = flags.limit && flags.limit !== true ? Number(flags.limit) : 20;
        const body = await request(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
        if (flags.json) return json(o, body);
        if (!body.shows.length) o.out('No shows match.');
        for (const s of body.shows) {
          o.out(`${s.slug}\n  ${s.title} — ${s.host}${s.author ? ` — ${s.author}` : ''}\n  ${s.episodes} episodes${s.cadence ? `, ${s.cadence}` : ''} · ${s.page}`);
        }
        return 0;
      }
      case 'show': {
        if (!rest[0]) return fail(o, 'show: give a slug');
        const s = await request(`/api/podcast/${encodeURIComponent(rest[0])}`);
        if (flags.json) return json(o, s);
        o.out(`${s.title}\n${s.author ? `by ${s.author}\n` : ''}${s.host}\n\n${s.description}\n\n${s.episodes} episodes${s.cadence ? `, ${s.cadence}` : ''}${s.language ? ` · ${s.language}` : ''}${s.categories.length ? ` · ${s.categories.join(', ')}` : ''}\nfeed  ${s.feedUrl}\nsite  ${s.site ?? '-'}\npage  ${s.page}\nm3u   ${s.playlist}`);
        return 0;
      }
      case 'episodes': {
        if (!rest[0]) return fail(o, 'episodes: give a slug');
        const body = await request(`/api/episodes/${encodeURIComponent(rest[0])}`);
        if (flags.m3u) {
          o.out(body.playlist);
          return 0;
        }
        const limit = flags.limit && flags.limit !== true ? Number(flags.limit) : 20;
        const eps = body.episodes.slice(0, limit);
        if (flags.json) return json(o, { ...body, episodes: eps });
        for (const e of eps) {
          const when = e.pubdate ? new Date(e.pubdate * 1000).toISOString().slice(0, 10) : '----------';
          o.out(`${when}  ${truncate(e.title, 70)}\n  ${e.source}`);
        }
        return 0;
      }
      case 'submit': {
        if (!rest.length) return fail(o, 'submit: give at least one URL or an .opml file');
        const opml = rest.find((a) => /\.opml$/i.test(a));
        const payload = opml ? { opml: await o.readFile(opml) } : { urls: rest };
        const body = await request('/api/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (flags.json) return json(o, body);
        for (const a of body.accepted ?? []) o.out(`${a.existing ? 'already listed' : 'added        '}  ${a.page}`);
        for (const r of body.rejected ?? []) o.out(`not listed     ${r.url} — ${r.message ?? r.error}`);
        if (body.queued) o.out(`${body.queued} queued — watch them land at ${body.statusUrl}`);
        return body.accepted?.length || body.queued ? 0 : 1;
      }
      case 'opml': {
        const path = rest[0] ? `/opml?category=${encodeURIComponent(rest[0])}` : '/opml';
        const res = await o.fetch(`${base}${path}`, { headers: { 'user-agent': `p0d/${VERSION}` } });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        o.out((await res.text()).replace(/\n$/, ''));
        return 0;
      }
      case 'update':
        return update(base, o);
      case 'remove':
        return remove(flags, o);
      default:
        return fail(o, `unknown command: ${name}. Try p0d help.`);
    }
  } catch (err) {
    return fail(o, `${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** @param {IO} o @param {unknown} body */
function json(o, body) {
  o.out(JSON.stringify(body, null, 2));
  return 0;
}

/** @param {IO} o @param {string} message */
function fail(o, message) {
  o.err(`error: ${message}`);
  return 1;
}

/** @param {string|undefined} name @param {IO} o */
function help(name, o) {
  if (name) {
    const c = COMMANDS.find((x) => x.name === name);
    if (!c) return fail(o, `no such command: ${name}`);
    o.out(`p0d ${c.usage}\n\n${c.detail}`);
    if (c.options?.length) o.out(`\noptions: ${c.options.join('  ')}`);
    if (c.examples?.length) o.out(`\n${c.examples.map((e) => `  ${e}`).join('\n')}`);
    return 0;
  }
  const width = Math.max(...COMMANDS.map((c) => c.usage.length));
  o.out(`p0d ${VERSION} — the p0dcasters directory from the terminal\n`);
  for (const c of COMMANDS) o.out(`  ${c.usage.padEnd(width)}  ${c.summary}`);
  o.out(`\n--api <url> or P0D_API to point at another deployment. p0d help <command> for detail.`);
  return 0;
}

/**
 * The path of the installed copy, when this process is one. Both `update`
 * and `remove` refuse otherwise, so `node public/cli/p0d.mjs remove` in a
 * checkout declines instead of deleting the working tree.
 *
 * @param {IO} o
 */
async function installedCopy(o) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const argv1 = o.argv1 ?? process.argv[1];
  if (!argv1) return null;
  try {
    const running = await fs.realpath(argv1);
    const self = await fs.realpath(fileURLToPath(import.meta.url));
    if (running !== self) return null;
    const name = path.basename(running);
    if (name !== 'p0d' && name !== 'p0dcasters') return null;
    return running;
  } catch {
    return null;
  }
}

/** @param {string} base @param {IO} o */
async function update(base, o) {
  const target = await installedCopy(o);
  if (!target) return fail(o, 'update: this is not an installed copy. Re-run the installer instead.');
  const fs = await import('node:fs/promises');
  const res = await o.fetch(`${base}/cli/p0d.mjs`, { headers: { 'user-agent': `p0d/${VERSION}` } });
  if (!res.ok) return fail(o, `update: ${res.status} ${res.statusText}`);
  const source = await res.text();
  if (!source.startsWith('#!')) return fail(o, 'update: the download is not the program');
  const served = /VERSION = '([^']+)'/.exec(source)?.[1] ?? '?';
  const staged = `${target}.new`;
  await fs.writeFile(staged, source, { mode: 0o755 });
  await fs.rename(staged, target);
  o.out(served === VERSION ? `already ${VERSION}` : `${VERSION} -> ${served}`);
  return 0;
}

/** @param {Record<string, string|boolean>} flags @param {IO} o */
async function remove(flags, o) {
  const target = await installedCopy(o);
  if (!target) return fail(o, 'remove: this is not an installed copy; nothing to remove.');
  if (!flags.yes) {
    o.out(`would remove ${target}\nrun again with --yes to do it`);
    return 0;
  }
  const fs = await import('node:fs/promises');
  await fs.unlink(target);
  o.out(`removed ${target}`);
  return 0;
}

// Run when executed, stay quiet when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2));
}
