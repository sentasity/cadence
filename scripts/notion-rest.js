'use strict';

// Shared Notion REST plumbing for notion-write.js and notion-read.js: the API
// version header, token resolution, and a request helper that retries rate
// limits. Credentials come from the environment only.

const { execSync } = require('node:child_process');

const NOTION_VERSION = '2026-03-11';
const MAX_RATE_LIMIT_RETRIES = 5;

function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiBase() {
  return process.env.NOTION_API_BASE || 'https://api.notion.com';
}

// NOTION_TOKEN wins when set; otherwise NOTION_TOKEN_CMD is executed and its
// stdout (trimmed) is the token, so the secret can live in a keychain or
// password manager instead of plaintext config.
function resolveToken() {
  const direct = process.env.NOTION_TOKEN;
  if (direct) return direct;
  const cmd = process.env.NOTION_TOKEN_CMD;
  if (cmd) {
    let out;
    try {
      out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      fail(2, `NOTION_TOKEN_CMD failed (${e.status ?? e.message}): ${cmd}`);
    }
    const token = out.trim();
    if (!token) fail(2, `NOTION_TOKEN_CMD produced no output: ${cmd}`);
    return token;
  }
  fail(2, 'Neither NOTION_TOKEN nor NOTION_TOKEN_CMD is set. Export the token of a Notion '
    + 'integration (internal or personal access token) that can reach the Cadence root page '
    + 'as NOTION_TOKEN, or set NOTION_TOKEN_CMD to a command that prints it (e.g. a keychain '
    + 'or password-manager lookup).');
}

async function apiRequest(base, token, method, url, body) {
  const absolute = url.startsWith('http') ? url : `${base}${url}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(absolute, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'notion-version': NOTION_VERSION,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const after = Number(res.headers.get('retry-after')) || 1;
      await sleep(after * 1000);
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (res.status >= 400) {
      const detail = [json.code, json.message].filter(Boolean).join(': ');
      let hint = '';
      if (res.status === 401) {
        hint = ' Check NOTION_TOKEN (unauthorized).';
      } else if (res.status === 403 || res.status === 404) {
        hint = ' Check that the page is shared with the integration NOTION_TOKEN belongs to.';
      } else if (res.status === 429) {
        hint = ' Rate-limit retries exhausted.';
      }
      const err = new Error(`Notion API ${res.status} on ${method} ${url}: ${detail || 'no detail'}.${hint}`);
      err.apiError = true;
      err.status = res.status;
      throw err;
    }
    return { status: res.status, json };
  }
}

module.exports = { NOTION_VERSION, fail, sleep, apiBase, resolveToken, apiRequest };
