#!/usr/bin/env node
'use strict';

// Push a local markdown file's content to a Notion page via the markdown REST
// endpoints (Notion-Version 2026-03-11). This is the notion backend's content
// write path: the body travels from disk to Notion in a plain HTTP request, so
// it never rides in a streamed tool argument (the client-side corruption in
// anthropics/claude-code#67765 cannot occur here).
//
// Usage:
//   node notion-write.js create --parent <page_id> --title <title> --file <path> [--icon <emoji>]
//   node notion-write.js replace --page <page_id> --file <path>
//
// Env:
//   NOTION_TOKEN      token with access to the page (internal integration or PAT)
//   NOTION_TOKEN_CMD  fallback when NOTION_TOKEN is unset: a command whose stdout
//                     is the token (keychain/password-manager lookup)
//   NOTION_API_BASE   override for tests (default https://api.notion.com)
//
// Exit codes:
//   0  success (single-line JSON result on stdout)
//   2  usage error: bad arguments, missing NOTION_TOKEN, missing/empty file
//   3  pre-send guard: untranslated obsidian callout ("> [!") outside a code fence
//   4  API error: auth/permission/validation failure, rate-limit retries
//      exhausted, or async task failure/timeout
//   5  post-write verification failure (read-back sheared short)

const fs = require('node:fs');
const { fail, sleep, apiBase, resolveToken, apiRequest } = require('./notion-rest.js');

const VERIFY_MIN_RATIO = 0.85;

class UsageError extends Error {}

function parseArgs(argv) {
  const mode = argv[0];
  const flags = {};
  for (let i = 1; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) {
      throw new UsageError(`usage: malformed arguments near ${argv[i]}`);
    }
    flags[argv[i].slice(2)] = argv[i + 1];
  }
  const need = (name) => {
    if (!flags[name]) throw new UsageError(`usage: missing required --${name}`);
    return flags[name];
  };
  if (mode === 'create') {
    return {
      mode,
      parent: need('parent'),
      title: need('title'),
      file: need('file'),
      icon: flags.icon || null,
    };
  }
  if (mode === 'replace') {
    return { mode, page: need('page'), file: need('file') };
  }
  throw new UsageError(`usage: unknown mode ${JSON.stringify(mode)}; expected create or replace`);
}

// Lines (1-based) carrying an obsidian callout marker outside fenced code.
// Content handed to Notion must never contain "> [!" (notion-translation.md's
// pre-send guard); enforcing it here makes the guard deterministic.
function calloutGuardViolations(markdown) {
  const hits = [];
  let inFence = false;
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.includes('> [!')) hits.push(i + 1);
  }
  return hits;
}

// Notion stores a mention as a bare reference and reads it back self-closing:
// <mention-page url="X">Title</mention-page> returns as <mention-page url="X"/>.
// Rewrite sent markdown the same way so a dropped display text is not mistaken
// for lost content. The attribute list cannot contain "/", so an already
// self-closing tag never pairs with a later closing tag.
function normalizeMentions(markdown) {
  return markdown.replace(
    /<(mention-[a-z-]+)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*>[\s\S]*?<\/\1>/g,
    '<$1$2/>'
  );
}

// Read-back is not byte-exact (Notion reconstructs the markdown), so compare
// lengths with tolerance. Shortfall past it means the write did not land whole.
function verifyLengths(sent, got) {
  const expectedChars = normalizeMentions(sent).length;
  const ratio = expectedChars === 0 ? 1 : got.length / expectedChars;
  return { ok: ratio >= VERIFY_MIN_RATIO, ratio, expectedChars };
}

async function pollAsyncTask(base, token, task) {
  const budget = Number(process.env.NOTION_WRITE_POLL_BUDGET_MS) || 180000;
  const deadline = Date.now() + budget;
  let current = task;
  while (true) {
    const status = current.status;
    if (['success', 'succeeded', 'completed'].includes(status)) return;
    if (['failure', 'failed', 'error'].includes(status)) {
      const err = new Error(`Notion async task ${current.id} ended in status ${status}.`);
      err.apiError = true;
      throw err;
    }
    if (Date.now() >= deadline) {
      const err = new Error(`Notion async task ${current.id} still ${status} after ${budget}ms; giving up.`);
      err.apiError = true;
      throw err;
    }
    await sleep((current.poll_after_seconds ?? 1) * 1000);
    const statusUrl = current.status_url || `${base}/v1/async-tasks/${current.id}`;
    current = (await apiRequest(base, token, 'GET', statusUrl)).json;
  }
}

// Replace pageId's content with markdown. Returns the read-back markdown used
// for verification: the sync 200 response carries it directly; the async path
// polls to completion then fetches it.
async function replaceContent(base, token, pageId, markdown) {
  const { status, json } = await apiRequest(
    base, token, 'PATCH', `/v1/pages/${pageId}/markdown`,
    {
      allow_async: true,
      type: 'replace_content',
      replace_content: { new_str: markdown, allow_deleting_content: false },
    }
  );
  if (status === 202) {
    await pollAsyncTask(base, token, json);
    const read = await apiRequest(base, token, 'GET', `/v1/pages/${pageId}/markdown`);
    return read.json;
  }
  return json;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) fail(2, e.message);
    throw e;
  }

  const token = resolveToken();
  const base = apiBase();

  let markdown;
  try {
    markdown = fs.readFileSync(args.file, 'utf8');
  } catch (e) {
    fail(2, `Cannot read content file ${args.file}: ${e.message}`);
  }
  if (markdown.trim() === '') fail(2, `Content file ${args.file} is empty.`);

  const guardHits = calloutGuardViolations(markdown);
  if (guardHits.length > 0) {
    fail(3, `Untranslated obsidian callout ("> [!") at line${guardHits.length > 1 ? 's' : ''} `
      + `${guardHits.join(', ')} of ${args.file}. Translate to <callout> blocks per `
      + 'skills/_shared/notion-translation.md before writing.');
  }

  try {
    let pageId;
    let url;
    if (args.mode === 'create') {
      const createBody = {
        parent: { type: 'page_id', page_id: args.parent },
        properties: { title: [{ type: 'text', text: { content: args.title } }] },
      };
      if (args.icon) createBody.icon = { type: 'emoji', emoji: args.icon };
      const created = (await apiRequest(base, token, 'POST', '/v1/pages', createBody)).json;
      pageId = created.id;
      url = created.url;
    } else {
      pageId = args.page;
    }
    // Always report a link: the caller relays it to the user, so a write is
    // never URL-less. notion.so/<id-without-dashes> is canonical and redirects.
    if (!url) url = `https://www.notion.so/${pageId.replace(/-/g, '')}`;

    const readback = await replaceContent(base, token, pageId, markdown);
    const got = readback.markdown || '';
    const { ok, ratio, expectedChars } = verifyLengths(markdown, got);
    if (!ok && !readback.truncated) {
      fail(5, `Post-write verification failed for page ${pageId}: read-back is `
        + `${got.length} chars vs ${expectedChars} expected (${markdown.length} sent, mentions `
        + `self-closed; ratio ${ratio.toFixed(2)}, `
        + `minimum ${VERIFY_MIN_RATIO}). The page content did not land whole; re-author and rewrite.`);
    }

    process.stdout.write(JSON.stringify({
      ok: true,
      mode: args.mode,
      page_id: pageId,
      url,
      sent_chars: markdown.length,
      readback_chars: got.length,
      readback_truncated: Boolean(readback.truncated),
    }) + '\n');
  } catch (e) {
    if (e.apiError) fail(4, e.message);
    throw e;
  }
}

module.exports = { parseArgs, calloutGuardViolations, verifyLengths, normalizeMentions };

if (require.main === module) {
  main().catch((e) => fail(4, e.message));
}
