/**
 * Channels: the parts of the internet Vexium could not previously reach.
 *
 * `vexium-tools.ts` can search the web and read one page, which covers an
 * article. It cannot read a repository, a discussion or a paper, because in
 * those the answer is not in the page text: it is in a README, across a hundred
 * replies, and in an abstract.
 *
 * [Agent-Reach](https://github.com/Panniantong/Agent-Reach) solves the same
 * problem from outside the app: a Python CLI, a tool tree in `~/.agent-reach`,
 * and a dedicated browser that copies a site's cookies so logged-in platforms
 * answer. None of that belongs inside Vexium Core, which is a bundled llama.cpp
 * runtime and GGUF weights in an Electron main process: it ships no Python, and
 * copying a user's session is exactly what this app refuses to do. What does
 * transfer is the honest subset — the channels that answer a plain read with no
 * account, no key and no login. Those are implemented here, natively.
 *
 * What is deliberately absent, and why:
 *
 * - **Reddit, X, Instagram, LinkedIn, Xiaohongshu, Bilibili's logged-in views.**
 *   They refuse an unauthenticated read (Reddit answers 403 to a plain request
 *   even with a browser user agent). A tool that guessed around that would hand
 *   the model a confident wrong answer instead of a missing one.
 * - **YouTube transcripts.** The watch page still lists caption tracks, but every
 *   `api/timedtext` URL answers 200 with an empty body unless it carries a token
 *   minted by the player, and the player API reports UNPLAYABLE without one.
 *   Reading a video's speech needs a real browser session, which is the one thing
 *   this file will not impersonate. Measured on 2026-10-30 against a video with
 *   both manual and auto-generated tracks.
 *
 * Rules, enforced below:
 *
 * - Read-only and keyless: every request goes to a fixed public host.
 * - No cookies, no copied logins, no credentials of any kind.
 * - Bounded: one target per turn, one timeout, and a hard character budget for
 *   the model's context.
 * - Honest failure: a channel that cannot be read says so.
 */
import { USER_AGENT, decodeEntities, htmlToText } from './vexium-tools';

export type ChannelId = 'github' | 'discussion' | 'paper';

export const CHANNEL_IDS: readonly ChannelId[] = ['github', 'discussion', 'paper'];

export const CHANNEL_TIMEOUT_MS = 15_000;
export const CHANNEL_TEXT_LIMIT = 3_600;
export const MAX_CHANNEL_TARGET = 300;
export const MAX_README_CHARS = 2_000;
export const MAX_ABSTRACT_CHARS = 1_400;
export const MAX_COMMENT_CHARS = 320;
export const MAX_COMMENTS = 6;

const LABELS: Record<ChannelId, string> = {
  github: 'GitHub',
  discussion: 'Hacker News',
  paper: 'arXiv',
};

export interface ChannelRead {
  channel: ChannelId;
  /** The brand name, for the panel's own status line. */
  label: string;
  /** What the answer turn receives: a heading, the facts, then the source. */
  text: string;
  sources: Array<{ title: string; url: string }>;
}

export function channelLabel(channel: ChannelId): string {
  return LABELS[channel];
}

/** The planner's channel field, forgiving of the names a model reaches for. */
export function sanitizeChannel(raw: unknown): ChannelId | null {
  if (typeof raw !== 'string') return null;
  switch (raw.trim().toLowerCase()) {
    case 'github':
    case 'repo':
    case 'repository':
    case 'code':
      return 'github';
    case 'discussion':
    case 'hackernews':
    case 'hacker-news':
    case 'hn':
    case 'thread':
      return 'discussion';
    case 'paper':
    case 'arxiv':
    case 'research':
    case 'preprint':
      return 'paper';
    default:
      return null;
  }
}

/** A channel target: one printable line, bounded. */
export function sanitizeTarget(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 2 || text.length > MAX_CHANNEL_TARGET) return null;
  return text;
}

/* --------------------------------------------------------------- github --- */

export type GithubTarget =
  | { kind: 'repo'; owner: string; repo: string; issue?: number }
  | { kind: 'search'; query: string };

const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * `owner/name`, `owner/name#12`, a github.com URL — or a phrase to search.
 *
 * The shapes are unambiguous on purpose: a bare word is a search rather than a
 * guess at somebody's repository, and a github.com link that does not name one
 * is refused instead of being searched for literally.
 */
export function githubTarget(raw: string): GithubTarget | null {
  const text = raw.trim().replace(/\.git$/i, '');
  const url =
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s?#]+)\/([^/\s?#]+)(?:[/#](?:issues|pull)\/(\d{1,9}))?/i.exec(
      text,
    );
  if (url) {
    const owner = url[1] ?? '';
    const repo = (url[2] ?? '').replace(/\.git$/i, '');
    if (!OWNER.test(owner) || !REPO.test(repo)) return null;
    const issue = url[3] ? Number.parseInt(url[3], 10) : undefined;
    return { kind: 'repo', owner, repo, ...(issue ? { issue } : {}) };
  }
  if (/^https?:\/\/(?:www\.)?github\.com(?:[/?#]|$)/i.test(text)) return null;
  const slug = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})(?:#(\d{1,9}))?$/.exec(text);
  if (slug) {
    const issue = slug[3] ? Number.parseInt(slug[3], 10) : undefined;
    return { kind: 'repo', owner: slug[1]!, repo: slug[2]!, ...(issue ? { issue } : {}) };
  }
  if (text.length >= 3) return { kind: 'search', query: text };
  return null;
}

interface GithubRepo {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  language?: string | null;
  license?: { spdx_id?: string | null; name?: string | null } | null;
  pushed_at?: string;
  updated_at?: string;
  archived?: boolean;
  topics?: string[];
}

interface GithubIssue {
  number?: number;
  title?: string;
  state?: string;
  html_url?: string;
  user?: { login?: string };
  created_at?: string;
  closed_at?: string | null;
  comments?: number;
  body?: string | null;
  pull_request?: unknown;
}

interface GithubComment {
  user?: { login?: string };
  body?: string | null;
}

function repoLine(item: GithubRepo, index?: number): string {
  const description = (item.description ?? '').replace(/\s+/g, ' ').trim();
  const bits = [
    `★ ${item.stargazers_count ?? 0}`,
    `${item.forks_count ?? 0} forks`,
    item.language ?? 'language unknown',
    item.license?.spdx_id ?? 'no licence',
    `last push ${(item.pushed_at ?? item.updated_at ?? '').slice(0, 10)}`,
  ];
  const prefix = index === undefined ? '' : `${index + 1}. `;
  return `${prefix}${item.full_name ?? 'unknown'} — ${description || 'no description'}\n${item.html_url ?? ''}\n${bits.join(' · ')}`;
}

export async function readGithub(
  raw: string,
  options: { signal?: AbortSignal } = {},
): Promise<ChannelRead> {
  const target = githubTarget(raw);
  if (!target) throw new Error('bad-target');
  return timed(async signal => {
    if (target.kind === 'search') {
      const response = await get(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(target.query)}&per_page=4&sort=stars&order=desc`,
        signal,
      );
      const body = (await response.json()) as { items?: GithubRepo[] };
      const items = Array.isArray(body.items) ? body.items.slice(0, 4) : [];
      if (items.length === 0) {
        return {
          channel: 'github',
          label: LABELS.github,
          text: clamp(`GITHUB SEARCH\nNo repository matched "${target.query}".`),
          sources: [],
        };
      }
      return {
        channel: 'github',
        label: LABELS.github,
        text: clamp(`GITHUB REPOSITORIES\n${items.map(repoLine).join('\n\n')}`),
        sources: items.map(item => ({
          title: item.full_name ?? 'GitHub repository',
          url: item.html_url ?? '',
        })),
      };
    }

    const { owner, repo } = target;
    if (target.issue) {
      const number = target.issue;
      const response = await get(
        `https://api.github.com/repos/${owner}/${repo}/issues/${number}`,
        signal,
      );
      const issue = (await response.json()) as GithubIssue;
      let comments: GithubComment[] = [];
      try {
        const list = await get(
          `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments?per_page=4`,
          signal,
        );
        const body = (await list.json()) as unknown;
        if (Array.isArray(body)) comments = (body as GithubComment[]).slice(0, 4);
      } catch {
        comments = [];
      }
      const kind = issue.pull_request ? 'pull request' : 'issue';
      const state = `${(issue.state ?? 'open').toUpperCase()}${issue.closed_at ? ' (closed)' : ''}`;
      const body = (issue.body ?? '').replace(/\r/g, '').trim().slice(0, 1_200);
      const href = issue.html_url ?? `https://github.com/${owner}/${repo}/issues/${number}`;
      const lines = [
        `GITHUB ${kind.toUpperCase()}`,
        `${owner}/${repo} #${number} — ${issue.title ?? 'untitled'}`,
        `${state} · opened by ${issue.user?.login ?? 'unknown'} on ${(issue.created_at ?? '').slice(0, 10)} · ${issue.comments ?? 0} comments`,
        href,
        '',
        body || '(no description)',
      ];
      if (comments.length > 0) {
        lines.push('', 'COMMENTS');
        for (const comment of comments) {
          const text = (comment.body ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT_CHARS);
          if (text) lines.push(`${comment.user?.login ?? 'someone'}: ${text}`);
        }
      }
      return {
        channel: 'github',
        label: LABELS.github,
        text: clamp(lines.join('\n')),
        sources: [{ title: `${owner}/${repo} #${number} · ${issue.title ?? ''}`.trim(), url: href }],
      };
    }

    const response = await get(`https://api.github.com/repos/${owner}/${repo}`, signal);
    const meta = (await response.json()) as GithubRepo;
    if (!meta.full_name) throw new Error('not-found');
    let readme = '';
    try {
      const readmeResponse = await get(`https://api.github.com/repos/${owner}/${repo}/readme`, signal);
      const body = (await readmeResponse.json()) as { content?: string };
      if (body.content) {
        readme = Buffer.from(body.content, 'base64').toString('utf8').trim().slice(0, MAX_README_CHARS);
      }
    } catch {
      readme = '';
    }
    const topics = (meta.topics ?? []).slice(0, 8).join(', ');
    const lines = [
      'GITHUB REPOSITORY',
      repoLine(meta),
      meta.archived ? 'This repository is archived.' : '',
      topics ? `topics: ${topics}` : '',
      '',
      readme ? `README (excerpt)\n${readme}` : '(no README)',
    ].filter(line => line !== '');
    return {
      channel: 'github',
      label: LABELS.github,
      text: clamp(lines.join('\n')),
      sources: [
        { title: meta.full_name, url: meta.html_url ?? `https://github.com/${owner}/${repo}` },
      ],
    };
  }, options.signal);
}

/* ----------------------------------------------------------- discussion --- */

interface HackerNewsComment {
  author?: string | null;
  text?: string | null;
  children?: HackerNewsComment[];
}

interface HackerNewsItem {
  id?: number;
  /** Search hits use `objectID`; the items endpoint uses `id`. */
  objectID?: string;
  num_comments?: number;
  title?: string | null;
  url?: string | null;
  points?: number | null;
  author?: string | null;
  created_at?: string | null;
  text?: string | null;
  children?: HackerNewsComment[];
}

/** Top-level first, then replies, capped: the model needs the gist, not the tree. */
export function flattenComments(
  nodes: HackerNewsComment[] | undefined,
  limit = MAX_COMMENTS,
): Array<{ author: string; text: string }> {
  const out: Array<{ author: string; text: string }> = [];
  const walk = (list: HackerNewsComment[] | undefined): void => {
    for (const node of list ?? []) {
      if (out.length >= limit) return;
      const text = htmlToText(node?.text ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_COMMENT_CHARS);
      if (text) out.push({ author: node?.author ?? 'someone', text });
      if (out.length < limit && node?.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return out.slice(0, limit);
}

export async function readDiscussion(
  raw: string,
  options: { signal?: AbortSignal } = {},
): Promise<ChannelRead> {
  const target = raw.trim();
  const itemId = /^\d{1,10}$/.test(target) ? target : null;
  return timed(async signal => {
    if (itemId) {
      const response = await get(`https://hn.algolia.com/api/v1/items/${itemId}`, signal);
      const item = (await response.json()) as HackerNewsItem;
      if (!item || typeof item.id !== 'number') throw new Error('not-found');
      const href = `https://news.ycombinator.com/item?id=${item.id}`;
      const comments = flattenComments(item.children);
      const lines = [
        'HACKER NEWS DISCUSSION',
        item.title ?? '(untitled)',
        `${item.points ?? 0} points · by ${item.author ?? 'unknown'} · ${(item.created_at ?? '').slice(0, 10)}`,
        item.url ?? href,
      ];
      if (item.text) lines.push('', htmlToText(item.text).slice(0, 800));
      if (comments.length > 0) {
        lines.push('', 'COMMENTS');
        for (const comment of comments) lines.push(`${comment.author}: ${comment.text}`);
      }
      return {
        channel: 'discussion',
        label: LABELS.discussion,
        text: clamp(lines.join('\n')),
        sources: [{ title: item.title ?? 'Hacker News discussion', url: href }],
      };
    }

    const response = await get(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(target)}&tags=story&hitsPerPage=4`,
      signal,
    );
    const body = (await response.json()) as { hits?: HackerNewsItem[] };
    const hits = Array.isArray(body.hits) ? body.hits.slice(0, 4) : [];
    if (hits.length === 0) {
      return {
        channel: 'discussion',
        label: LABELS.discussion,
        text: clamp(`HACKER NEWS SEARCH\nNo story matched "${target}".`),
        sources: [],
      };
    }
    const lines = hits.map((hit, index) => {
      const href = `https://news.ycombinator.com/item?id=${hit.objectID ?? ''}`;
      const trailing = hit.url ? `\n${hit.url}` : '';
      return `${index + 1}. ${hit.title ?? '(untitled)'}\n${href}\n${hit.points ?? 0} points · ${hit.num_comments ?? 0} comments · ${(hit.created_at ?? '').slice(0, 10)}${trailing}`;
    });
    return {
      channel: 'discussion',
      label: LABELS.discussion,
      text: clamp(`HACKER NEWS STORIES\n${lines.join('\n\n')}`),
      sources: hits.map(hit => ({
        title: hit.title ?? 'Hacker News story',
        url: `https://news.ycombinator.com/item?id=${hit.objectID ?? ''}`,
      })),
    };
  }, options.signal);
}

/* ---------------------------------------------------------------- paper --- */

export type PaperTarget = { kind: 'id'; id: string } | { kind: 'search'; query: string };

/** `2401.12345`, `arXiv:2401.12345v2`, `/abs/…`, `hep-th/9901001` — or a phrase. */
export function paperTarget(raw: string): PaperTarget | null {
  const text = raw.trim();
  const fromUrl = /arxiv\.org\/(?:abs|pdf)\/([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?/i.exec(text);
  if (fromUrl) return { kind: 'id', id: fromUrl[1]! };
  const bare = /^(?:arxiv:)?((?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7})|(?:\d{4}\.\d{4,5}))(?:v\d+)?$/i.exec(text);
  if (bare) return { kind: 'id', id: bare[1]! };
  if (text.length >= 3) return { kind: 'search', query: text };
  return null;
}

export interface ArxivEntry {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  published: string;
}

/** The Atom feed arXiv returns, reduced to what the answer needs. */
export function parseArxivFeed(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = match[1] ?? '';
    const read = (tag: string): string => {
      const found = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
      // Strip the feed's own markup before decoding, or an escaped "&lt;x&gt;"
      // in an abstract is removed as if it were a tag once it becomes "<x>".
      return decodeEntities((found?.[1] ?? '').replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
    };
    const id = read('id');
    const title = read('title');
    if (!id || !title) continue;
    const authors: string[] = [];
    for (const author of block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)) {
      const name = decodeEntities(author[1] ?? '').trim();
      if (name) authors.push(name);
    }
    entries.push({
      id,
      title,
      abstract: read('summary'),
      authors,
      published: read('published').slice(0, 10),
    });
  }
  return entries;
}

export async function readPaper(
  raw: string,
  options: { signal?: AbortSignal } = {},
): Promise<ChannelRead> {
  const target = paperTarget(raw);
  if (!target) throw new Error('bad-target');
  return timed(async signal => {
    const url =
      target.kind === 'id'
        ? `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(target.id)}&max_results=1`
        : `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:${target.query}`)}&max_results=3&sortBy=relevance`;
    const response = await get(url, signal, 'application/atom+xml');
    const entries = parseArxivFeed(await response.text());
    if (entries.length === 0) {
      const what = target.kind === 'id' ? `arXiv ${target.id}` : `"${target.query}"`;
      return {
        channel: 'paper',
        label: LABELS.paper,
        text: clamp(`ARXIV SEARCH\nNo paper was found for ${what}.`),
        sources: [],
      };
    }
    const blocks = entries.map((entry, index) => {
      const authors = entry.authors.slice(0, 4).join(', ');
      const more = entry.authors.length > 4 ? ` and ${entry.authors.length - 4} more` : '';
      return `${index + 1}. ${entry.title}\n${entry.id}\n${entry.published} · ${authors}${more}\n${entry.abstract.slice(0, MAX_ABSTRACT_CHARS)}`;
    });
    return {
      channel: 'paper',
      label: LABELS.paper,
      text: clamp(`ARXIV PAPERS\n${blocks.join('\n\n')}`),
      sources: entries.map(entry => ({ title: entry.title, url: entry.id })),
    };
  }, options.signal);
}

/* ----------------------------------------------------------------- core --- */

export async function readChannel(
  request: { channel: ChannelId; target: string },
  options: { signal?: AbortSignal } = {},
): Promise<ChannelRead> {
  const target = sanitizeTarget(request.target);
  if (!target) throw new Error('bad-target');
  if (request.channel === 'github') return readGithub(target, options);
  if (request.channel === 'discussion') return readDiscussion(target, options);
  return readPaper(target, options);
}

function clamp(text: string): string {
  const clean = text.replace(/\r/g, '').trim();
  return clean.length > CHANNEL_TEXT_LIMIT ? `${clean.slice(0, CHANNEL_TEXT_LIMIT)}…` : clean;
}

async function get(
  url: string,
  signal: AbortSignal,
  accept = 'application/vnd.github+json, application/json;q=0.9',
): Promise<Response> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal,
    headers: {
      'user-agent': USER_AGENT,
      accept,
      'accept-language': 'en-US,en;q=0.8,tr;q=0.7',
    },
  });
  if (!response.ok) throw new Error(`http-${response.status}`);
  return response;
}

/** One bound for the whole read: the outer signal wins, the timer is a floor. */
async function timed<T>(work: (signal: AbortSignal) => Promise<T>, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHANNEL_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  outer?.addEventListener('abort', onAbort);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}
