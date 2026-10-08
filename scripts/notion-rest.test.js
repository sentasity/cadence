'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { NOTION_VERSION, apiBase, apiRequest } = require('./notion-rest.js');

function server(handler) {
  const srv = http.createServer(handler);
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({
      base: `http://127.0.0.1:${srv.address().port}`,
      close: () => srv.close(),
    }));
  });
}

test('NOTION_VERSION is the pinned API version', () => {
  assert.strictEqual(NOTION_VERSION, '2026-03-11');
});

test('apiBase honors NOTION_API_BASE and defaults to the public API', () => {
  const saved = process.env.NOTION_API_BASE;
  try {
    delete process.env.NOTION_API_BASE;
    assert.strictEqual(apiBase(), 'https://api.notion.com');
    process.env.NOTION_API_BASE = 'http://127.0.0.1:9';
    assert.strictEqual(apiBase(), 'http://127.0.0.1:9');
  } finally {
    if (saved === undefined) delete process.env.NOTION_API_BASE;
    else process.env.NOTION_API_BASE = saved;
  }
});

test('apiRequest sends auth and version headers and retries a 429', async () => {
  const seen = [];
  const srv = await server((req, res) => {
    seen.push(req.headers);
    if (seen.length === 1) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' });
      res.end('{}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: 1 }));
  });
  try {
    const r = await apiRequest(srv.base, 'tok', 'GET', '/v1/x');
    assert.deepStrictEqual(r, { status: 200, json: { ok: 1 } });
    assert.strictEqual(seen.length, 2);
    assert.strictEqual(seen[1].authorization, 'Bearer tok');
    assert.strictEqual(seen[1]['notion-version'], '2026-03-11');
  } finally {
    srv.close();
  }
});

test('apiRequest marks a 4xx as an API error carrying its status', async () => {
  const srv = await server((req, res) => {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'validation_error', message: 'bad body' }));
  });
  try {
    await assert.rejects(apiRequest(srv.base, 'tok', 'PATCH', '/v1/x', {}), (e) => {
      assert.strictEqual(e.apiError, true);
      assert.strictEqual(e.status, 400);
      assert.match(e.message, /validation_error: bad body/);
      return true;
    });
  } finally {
    srv.close();
  }
});
