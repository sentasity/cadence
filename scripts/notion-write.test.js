'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseArgs,
  calloutGuardViolations,
  verifyLengths,
} = require('./notion-write.js');

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

test('parseArgs: create mode requires parent, title, and file', () => {
  const args = parseArgs([
    'create', '--parent', 'abc123', '--title', '01-storage', '--file', '/tmp/doc.md',
  ]);
  assert.deepStrictEqual(args, {
    mode: 'create', parent: 'abc123', title: '01-storage', file: '/tmp/doc.md', icon: null,
  });
});

test('parseArgs: create accepts an optional icon', () => {
  const args = parseArgs([
    'create', '--parent', 'abc123', '--title', 't', '--file', 'f.md', '--icon', '📝',
  ]);
  assert.strictEqual(args.icon, '📝');
});

test('parseArgs: replace mode requires page and file', () => {
  const args = parseArgs(['replace', '--page', 'def456', '--file', 'doc.md']);
  assert.deepStrictEqual(args, { mode: 'replace', page: 'def456', file: 'doc.md' });
});

test('parseArgs: unknown mode throws a usage error', () => {
  assert.throws(() => parseArgs(['append', '--page', 'x', '--file', 'f']), /usage/i);
});

test('parseArgs: missing required flag throws a usage error naming the flag', () => {
  assert.throws(() => parseArgs(['replace', '--file', 'doc.md']), /--page/);
  assert.throws(() => parseArgs(['create', '--parent', 'x', '--file', 'f']), /--title/);
});

// ---------------------------------------------------------------------------
// calloutGuardViolations
// ---------------------------------------------------------------------------

test('calloutGuard: flags an obsidian callout outside code fences', () => {
  const md = '# Doc\n\n> [!summary] Plain English\n> body line\n';
  const hits = calloutGuardViolations(md);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0], 3); // 1-based line number
});

test('calloutGuard: ignores callout syntax inside a fenced code block', () => {
  const md = '# Doc\n\n```\n> [!note] example of the syntax\n```\n';
  assert.deepStrictEqual(calloutGuardViolations(md), []);
});

test('calloutGuard: clean notion-flavored content passes', () => {
  const md = '# Doc\n\n<callout icon="💡" color="gray_bg">\n\t**Plain English**\n</callout>\n\n> plain quote is fine\n';
  assert.deepStrictEqual(calloutGuardViolations(md), []);
});

// ---------------------------------------------------------------------------
// verifyLengths
// ---------------------------------------------------------------------------

test('verifyLengths: passes when read-back is close to sent length', () => {
  const sent = 'x'.repeat(10000);
  const got = 'x'.repeat(9600);
  assert.strictEqual(verifyLengths(sent, got).ok, true);
});

test('verifyLengths: fails on a large shortfall', () => {
  const sent = 'x'.repeat(10000);
  const got = 'x'.repeat(4000);
  const v = verifyLengths(sent, got);
  assert.strictEqual(v.ok, false);
  assert.ok(v.ratio < 0.85);
});

test('verifyLengths: read-back longer than sent is fine', () => {
  assert.strictEqual(verifyLengths('abc', 'abcdef').ok, true);
});

// ---------------------------------------------------------------------------
// CLI integration against a mock Notion API
// ---------------------------------------------------------------------------

const { spawn } = require('node:child_process');
const http = require('node:http');
const fsm = require('node:fs');
const pathm = require('node:path');
const os = require('node:os');

const SCRIPT = pathm.join(__dirname, 'notion-write.js');

function writeTmp(content) {
  const dir = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'notion-write-test-'));
  const file = pathm.join(dir, 'doc.md');
  fsm.writeFileSync(file, content);
  return file;
}

// Async on purpose: the mock Notion server runs in THIS process, so the CLI
// child must not be awaited synchronously (spawnSync would block the event
// loop and deadlock the child's HTTP requests).
function runCli(argv, { base, token = 'secret-token' } = {}) {
  const env = { ...process.env, NOTION_TOKEN: token, NOTION_WRITE_POLL_BUDGET_MS: '5000' };
  if (token === null) delete env.NOTION_TOKEN;
  if (base) env.NOTION_API_BASE = base;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...argv], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

// Mock server: routes is [{method, path, status, body}] consumed in order for
// matching requests; every request is recorded with its parsed JSON body.
function mockServer(routes) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const record = { method: req.method, path: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null };
      seen.push(record);
      const i = routes.findIndex((r) => r.method === req.method && r.path === req.url);
      if (i === -1) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'error', message: `unexpected ${req.method} ${req.url}` }));
        return;
      }
      const route = routes.length > 1 ? routes.splice(i, 1)[0] : routes[i];
      res.writeHead(route.status, { 'content-type': 'application/json', ...(route.headers || {}) });
      res.end(JSON.stringify(route.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ base: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() });
    });
  });
}

test('cli: replace happy path verifies via the sync response markdown', async () => {
  const body = '# Doc\n\nHello world, this is the whole doc body.\n';
  const srv = await mockServer([
    {
      method: 'PATCH', path: '/v1/pages/def456/markdown', status: 200,
      body: { object: 'page_markdown', id: 'def456', markdown: body, truncated: false },
    },
  ]);
  try {
    const r = await runCli(['replace', '--page', 'def456', '--file', writeTmp(body)], { base: srv.base });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.mode, 'replace');
    assert.strictEqual(out.page_id, 'def456');
    assert.strictEqual(out.sent_chars, body.length);
    const patch = srv.seen.find((s) => s.method === 'PATCH');
    assert.strictEqual(patch.body.type, 'replace_content');
    assert.strictEqual(patch.body.replace_content.new_str, body);
    assert.strictEqual(patch.headers['notion-version'], '2026-03-11');
    assert.strictEqual(patch.headers.authorization, 'Bearer secret-token');
  } finally {
    srv.close();
  }
});

test('cli: create posts the page then replaces content into it', async () => {
  const body = '# Child doc\n\nContent here.\n';
  const srv = await mockServer([
    {
      method: 'POST', path: '/v1/pages', status: 200,
      body: { object: 'page', id: 'new-page-id', url: 'https://notion.so/new-page-id' },
    },
    {
      method: 'PATCH', path: '/v1/pages/new-page-id/markdown', status: 200,
      body: { object: 'page_markdown', id: 'new-page-id', markdown: body, truncated: false },
    },
  ]);
  try {
    const r = await runCli(
      ['create', '--parent', 'parent-1', '--title', '01-doc', '--file', writeTmp(body), '--icon', '📝'],
      { base: srv.base }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.page_id, 'new-page-id');
    assert.strictEqual(out.url, 'https://notion.so/new-page-id');
    const post = srv.seen.find((s) => s.method === 'POST');
    assert.deepStrictEqual(post.body.parent, { type: 'page_id', page_id: 'parent-1' });
    assert.deepStrictEqual(post.body.icon, { type: 'emoji', emoji: '📝' });
    assert.strictEqual(post.body.markdown, undefined); // content goes via PATCH, not create
  } finally {
    srv.close();
  }
});

test('cli: async PATCH is polled to success then verified by GET', async () => {
  const body = '# Big doc\n\n' + 'line of content\n'.repeat(50);
  // The 202 body needs the mock server's own port in status_url, so register
  // the routes first and patch the body in once the server is listening.
  const routes = [
    { method: 'PATCH', path: '/v1/pages/def456/markdown', status: 202, body: {} },
    { method: 'GET', path: '/v1/async-tasks/t1', status: 200, body: { object: 'async_task', id: 't1', status: 'in_progress', poll_after_seconds: 0 } },
    { method: 'GET', path: '/v1/async-tasks/t1', status: 200, body: { object: 'async_task', id: 't1', status: 'success' } },
    { method: 'GET', path: '/v1/pages/def456/markdown', status: 200, body: { object: 'page_markdown', id: 'def456', markdown: body, truncated: false } },
  ];
  const srv = await mockServer(routes);
  routes[0].body = {
    object: 'async_task', id: 't1', status: 'queued',
    status_url: `${srv.base}/v1/async-tasks/t1`, poll_after_seconds: 0,
  };
  try {
    const r = await runCli(['replace', '--page', 'def456', '--file', writeTmp(body)], { base: srv.base });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.readback_chars, body.length);
  } finally {
    srv.close();
  }
});

test('cli: exits 3 on an untranslated obsidian callout without calling the API', async () => {
  const srv = await mockServer([]);
  try {
    const file = writeTmp('# Doc\n\n> [!warning]\n> untranslated\n');
    const r = await runCli(['replace', '--page', 'def456', '--file', file], { base: srv.base });
    assert.strictEqual(r.status, 3);
    assert.match(r.stderr, /callout/i);
    assert.strictEqual(srv.seen.length, 0);
  } finally {
    srv.close();
  }
});

test('cli: exits 2 when NOTION_TOKEN is missing', async () => {
  const r = await runCli(['replace', '--page', 'def456', '--file', writeTmp('# x\n')], { token: null });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /NOTION_TOKEN/);
});

test('cli: exits 2 on a missing or empty content file', async () => {
  const r = await runCli(['replace', '--page', 'p', '--file', '/nonexistent/doc.md']);
  assert.strictEqual(r.status, 2);
  const empty = writeTmp('');
  const r2 = await runCli(['replace', '--page', 'p', '--file', empty]);
  assert.strictEqual(r2.status, 2);
});

test('cli: retries a 429 then succeeds', async () => {
  const body = '# Doc\n\nRetry me.\n';
  const routes = [
    { method: 'PATCH', path: '/v1/pages/p1/markdown', status: 429, headers: { 'retry-after': '0' }, body: { object: 'error', code: 'rate_limited' } },
    { method: 'PATCH', path: '/v1/pages/p1/markdown', status: 200, body: { object: 'page_markdown', id: 'p1', markdown: body, truncated: false } },
  ];
  const srv = await mockServer(routes);
  try {
    const r = await runCli(['replace', '--page', 'p1', '--file', writeTmp(body)], { base: srv.base });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(srv.seen.filter((s) => s.method === 'PATCH').length, 2);
  } finally {
    srv.close();
  }
});

test('cli: exits 4 on 401 with an actionable message', async () => {
  const srv = await mockServer([
    { method: 'PATCH', path: '/v1/pages/p1/markdown', status: 401, body: { object: 'error', code: 'unauthorized', message: 'API token is invalid.' } },
  ]);
  try {
    const r = await runCli(['replace', '--page', 'p1', '--file', writeTmp('# x\n')], { base: srv.base });
    assert.strictEqual(r.status, 4);
    assert.match(r.stderr, /unauthorized|token/i);
  } finally {
    srv.close();
  }
});

test('cli: exits 5 when read-back is sheared short', async () => {
  const body = '# Doc\n\n' + 'content line\n'.repeat(100);
  const srv = await mockServer([
    {
      method: 'PATCH', path: '/v1/pages/p1/markdown', status: 200,
      body: { object: 'page_markdown', id: 'p1', markdown: body.slice(0, 200), truncated: false },
    },
  ]);
  try {
    const r = await runCli(['replace', '--page', 'p1', '--file', writeTmp(body)], { base: srv.base });
    assert.strictEqual(r.status, 5);
    assert.match(r.stderr, /verif/i);
  } finally {
    srv.close();
  }
});

// ---------------------------------------------------------------------------
// NOTION_TOKEN_CMD fallback
// ---------------------------------------------------------------------------

function runCliEnv(argv, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...argv], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function baseEnv(extra) {
  const env = { ...process.env, NOTION_WRITE_POLL_BUDGET_MS: '5000', ...extra };
  delete env.NOTION_TOKEN;
  delete env.NOTION_TOKEN_CMD;
  return { ...env, ...extra };
}

test('cli: NOTION_TOKEN_CMD supplies the token when NOTION_TOKEN is unset', async () => {
  const body = '# Doc\n\nVia token command.\n';
  const srv = await mockServer([
    { method: 'PATCH', path: '/v1/pages/p1/markdown', status: 200, body: { object: 'page_markdown', id: 'p1', markdown: body, truncated: false } },
  ]);
  try {
    const r = await runCliEnv(['replace', '--page', 'p1', '--file', writeTmp(body)],
      baseEnv({ NOTION_API_BASE: srv.base, NOTION_TOKEN_CMD: 'echo cmd-sourced-token' }));
    assert.strictEqual(r.status, 0, r.stderr);
    const patch = srv.seen.find((s) => s.method === 'PATCH');
    assert.strictEqual(patch.headers.authorization, 'Bearer cmd-sourced-token');
  } finally {
    srv.close();
  }
});

test('cli: NOTION_TOKEN wins over NOTION_TOKEN_CMD when both are set', async () => {
  const body = '# Doc\n\nDirect token wins.\n';
  const srv = await mockServer([
    { method: 'PATCH', path: '/v1/pages/p1/markdown', status: 200, body: { object: 'page_markdown', id: 'p1', markdown: body, truncated: false } },
  ]);
  try {
    const r = await runCliEnv(['replace', '--page', 'p1', '--file', writeTmp(body)],
      baseEnv({ NOTION_API_BASE: srv.base, NOTION_TOKEN: 'direct-token', NOTION_TOKEN_CMD: 'echo cmd-token' }));
    assert.strictEqual(r.status, 0, r.stderr);
    const patch = srv.seen.find((s) => s.method === 'PATCH');
    assert.strictEqual(patch.headers.authorization, 'Bearer direct-token');
  } finally {
    srv.close();
  }
});

test('cli: a failing or empty NOTION_TOKEN_CMD exits 2 with the command named', async () => {
  const fail = await runCliEnv(['replace', '--page', 'p1', '--file', writeTmp('# x\n')],
    baseEnv({ NOTION_TOKEN_CMD: 'exit 7' }));
  assert.strictEqual(fail.status, 2);
  assert.match(fail.stderr, /NOTION_TOKEN_CMD/);
  const empty = await runCliEnv(['replace', '--page', 'p1', '--file', writeTmp('# x\n')],
    baseEnv({ NOTION_TOKEN_CMD: 'true' }));
  assert.strictEqual(empty.status, 2);
  assert.match(empty.stderr, /NOTION_TOKEN_CMD/);
});

test('cli: missing-token message mentions both NOTION_TOKEN and NOTION_TOKEN_CMD', async () => {
  const r = await runCliEnv(['replace', '--page', 'p1', '--file', writeTmp('# x\n')], baseEnv({}));
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /NOTION_TOKEN/);
  assert.match(r.stderr, /NOTION_TOKEN_CMD/);
});
