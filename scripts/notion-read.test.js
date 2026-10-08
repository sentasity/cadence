'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseArgs, fileNameFromTitle, plainText, buildFrontmatter } = require('./notion-read.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test('parseArgs: export requires slug and out', () => {
  assert.deepStrictEqual(parseArgs(['export', '--slug', 's', '--out', '/tmp/x']), { mode: 'export', slug: 's', out: '/tmp/x' });
  assert.throws(() => parseArgs(['export', '--slug', 's']), /missing required --out/);
  assert.throws(() => parseArgs(['export', '--out', '/tmp/x']), /missing required --slug/);
});

test('parseArgs: unknown mode and malformed flags throw usage errors', () => {
  assert.throws(() => parseArgs(['import', '--slug', 's', '--out', 'o']), /unknown mode/);
  assert.throws(() => parseArgs(['export', '--slug']), /malformed arguments/);
});

test('fileNameFromTitle: normalizes page titles to NN-kebab file names', () => {
  assert.strictEqual(fileNameFromTitle('01 Plan Authoring'), '01-plan-authoring.md');
  assert.strictEqual(fileNameFromTitle('01-capture-and-parsing'), '01-capture-and-parsing.md');
  assert.strictEqual(fileNameFromTitle('00a Plain English'), '00a-plain-english.md');
  assert.strictEqual(fileNameFromTitle('02 Declined-to-judge List'), '02-declined-to-judge-list.md');
  assert.strictEqual(fileNameFromTitle('  '), 'untitled.md');
});

test('plainText: joins rich text runs', () => {
  assert.strictEqual(plainText([{ plain_text: 'a' }, { plain_text: 'b' }]), 'ab');
  assert.strictEqual(plainText(undefined), '');
});

const PLAN_PROPS = {
  Title: { title: [{ plain_text: 'Plan: Review loop' }] },
  Slug: { rich_text: [{ plain_text: '2026-10-08-review-loop' }] },
  Status: { select: { name: 'in-progress' } },
  Created: { date: { start: '2026-10-08' } },
  Updated: { date: { start: '2026-10-09' } },
  Tags: { multi_select: [{ name: 'plan' }, { name: 'cadence-repo' }] },
  'Base SHA': { rich_text: [{ plain_text: '954a763' }] },
};

test('buildFrontmatter: plan overview carries linked_design and base_sha', () => {
  assert.strictEqual(buildFrontmatter('plan', PLAN_PROPS, '2026-10-08-review-loop'), [
    '---',
    'title: "Plan: Review loop"',
    'created: 2026-10-08',
    'updated: 2026-10-09',
    'status: in-progress',
    'tags: [plan, cadence-repo]',
    'linked_design: 2026-10-08-review-loop',
    'base_sha: 954a763',
    '---',
    '',
  ].join('\n'));
});

test('buildFrontmatter: design overview carries linked_plan; quotes and empty values stay valid', () => {
  const props = { Title: { title: [{ plain_text: 'Design "quoted"' }] }, Status: { select: { name: 'approved' } } };
  assert.strictEqual(buildFrontmatter('design', props, null), [
    '---',
    'title: "Design \\"quoted\\""',
    'created: null',
    'updated: null',
    'status: approved',
    'tags: []',
    'linked_plan: null',
    '---',
    '',
  ].join('\n'));
});

// ---------------------------------------------------------------------------
// CLI against a mock Notion API
// ---------------------------------------------------------------------------

const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT = path.join(__dirname, 'notion-read.js');

// A throwaway repo whose resolved config points storage at the mock databases.
function projectDir(backend = 'notion') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notion-read-proj-'));
  fs.mkdirSync(path.join(dir, '.cadence'));
  fs.writeFileSync(path.join(dir, '.cadence', 'config.yaml'), [
    'storage:',
    `  backend: ${backend}`,
    '  notion:',
    '    plans_db: "plansdb"',
    '    designs_db: "designsdb"',
    '',
  ].join('\n'));
  return dir;
}

function outDir() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notion-read-out-')), 'export');
}

// Async on purpose: the mock server runs in this process, so the child must
// not be awaited synchronously.
function runCli(argv, { base, cwd, token = 'secret-token' } = {}) {
  const env = { ...process.env, NOTION_TOKEN: token };
  if (token === null) delete env.NOTION_TOKEN;
  delete env.NOTION_TOKEN_CMD;
  if (base) env.NOTION_API_BASE = base;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...argv], { env, cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

// routes is [{method, path, status, body}]; a matching route is consumed
// while more than one remains; every request is recorded.
function mockServer(routes) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      seen.push({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : null });
      const i = routes.findIndex((r) => r.method === req.method && r.path === req.url);
      if (i === -1) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'error', message: `unexpected ${req.method} ${req.url}` }));
        return;
      }
      const route = routes.length > 1 ? routes.splice(i, 1)[0] : routes[i];
      res.writeHead(route.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(route.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ base: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() });
    });
  });
}

function row(id, title, slug, extra = {}) {
  return {
    object: 'page', id, url: `https://www.notion.so/${id}`,
    properties: {
      Title: { title: [{ plain_text: title }] },
      Slug: { rich_text: [{ plain_text: slug }] },
      Status: { select: { name: 'approved' } },
      Created: { date: { start: '2026-10-08' } },
      Updated: { date: { start: '2026-10-08' } },
      Tags: { multi_select: [{ name: 'cadence-repo' }] },
      ...extra,
    },
  };
}

const PLAN = row('plan1', 'Plan: Demo', 'demo-plan', {
  'Base SHA': { rich_text: [{ plain_text: 'abc123' }] },
  'Linked Design': { relation: [{ id: 'design1' }] },
});
const DESIGN = row('design1', 'Demo design', 'demo-design');

const md = (id, markdown, truncated = false) => ({
  method: 'GET', path: `/v1/pages/${id}/markdown`, status: 200,
  body: { object: 'page_markdown', id, markdown, truncated },
});
const kids = (id, children, extra = {}) => ({
  method: 'GET', path: `/v1/blocks/${id}/children?page_size=100`, status: 200,
  body: { results: children.map(([cid, title]) => ({ type: 'child_page', id: cid, child_page: { title } })), has_more: false, ...extra },
});
const lookup = (results) => [
  { method: 'GET', path: '/v1/databases/plansdb', status: 200, body: { data_sources: [{ id: 'ds1' }] } },
  { method: 'POST', path: '/v1/data_sources/ds1/query', status: 200, body: { results } },
];

test('cli: export writes the plan, its linked design, and a manifest', async () => {
  const srv = await mockServer([
    ...lookup([PLAN]),
    { method: 'GET', path: '/v1/pages/design1', status: 200, body: DESIGN },
    md('plan1', '## Goal\n\nShip it.\n'),
    kids('plan1', [['p01', '01 Phase One'], ['p96', '96 Validation']]),
    md('p01', '### Task 1.1: First\n\n- [ ] **Step 1: Do it**\n'),
    md('p96', '## A. Automated\n'),
    md('design1', '## What we are building\n'),
    kids('design1', [['d01', '01 Topic']]),
    md('d01', 'Topic body.\n'),
  ]);
  const out = outDir();
  try {
    const r = await runCli(['export', '--slug', 'demo-plan', '--out', out], { base: srv.base, cwd: projectDir() });
    assert.strictEqual(r.status, 0, r.stderr);
    const res = JSON.parse(r.stdout);
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.plan, { slug: 'demo-plan', url: 'https://www.notion.so/plan1' });
    assert.deepStrictEqual(res.design, { slug: 'demo-design', url: 'https://www.notion.so/design1' });
    assert.strictEqual(res.files, 5);
    const overview = fs.readFileSync(path.join(out, 'plan', '00-overview.md'), 'utf8');
    assert.match(overview, /^---\ntitle: "Plan: Demo"\n/);
    assert.match(overview, /\nlinked_design: demo-design\nbase_sha: abc123\n---\n\n## Goal/);
    assert.strictEqual(fs.readFileSync(path.join(out, 'plan', '01-phase-one.md'), 'utf8'),
      '---\ntitle: "01 Phase One"\n---\n\n### Task 1.1: First\n\n- [ ] **Step 1: Do it**\n');
    assert.ok(fs.existsSync(path.join(out, 'plan', '96-validation.md')));
    assert.match(fs.readFileSync(path.join(out, 'design', '00-overview.md'), 'utf8'), /\nlinked_plan: demo-plan\n/);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    assert.deepStrictEqual(manifest.plan.files.map((f) => f.file), ['00-overview.md', '01-phase-one.md', '96-validation.md']);
    assert.strictEqual(manifest.plan.status, 'approved');
    assert.strictEqual(manifest.design.files[1].url, 'https://www.notion.so/d01');
    const query = srv.seen.find((s) => s.method === 'POST');
    assert.deepStrictEqual(query.body, { filter: { property: 'Slug', rich_text: { equals: 'demo-plan' } } });
  } finally {
    srv.close();
  }
});

test('cli: a plan with no linked design exports with design null and a warning', async () => {
  const srv = await mockServer([
    ...lookup([row('plan1', 'Plan: Lone', 'lone-plan')]),
    md('plan1', '## Goal\n'),
    kids('plan1', []),
  ]);
  const out = outDir();
  try {
    const r = await runCli(['export', '--slug', 'lone-plan', '--out', out], { base: srv.base, cwd: projectDir() });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(JSON.parse(r.stdout).design, null);
    assert.match(r.stderr, /no Linked Design/);
    assert.ok(!fs.existsSync(path.join(out, 'design')));
    assert.match(fs.readFileSync(path.join(out, 'plan', '00-overview.md'), 'utf8'), /\nlinked_design: null\nbase_sha: null\n/);
  } finally {
    srv.close();
  }
});

test('cli: child pages across paginated block listings are all exported in order', async () => {
  const srv = await mockServer([
    ...lookup([row('plan1', 'Plan: Paged', 'paged-plan')]),
    md('plan1', 'Body.\n'),
    kids('plan1', [['p01', '01 First']], { has_more: true, next_cursor: 'c2' }),
    {
      method: 'GET', path: '/v1/blocks/plan1/children?page_size=100&start_cursor=c2', status: 200,
      body: { results: [{ type: 'child_page', id: 'p02', child_page: { title: '02 Second' } }], has_more: false },
    },
    md('p01', 'one\n'),
    md('p02', 'two\n'),
  ]);
  const out = outDir();
  try {
    const r = await runCli(['export', '--slug', 'paged-plan', '--out', out], { base: srv.base, cwd: projectDir() });
    assert.strictEqual(r.status, 0, r.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    assert.deepStrictEqual(manifest.plan.files.map((f) => f.file), ['00-overview.md', '01-first.md', '02-second.md']);
  } finally {
    srv.close();
  }
});

test('cli: two titles that normalize alike are both written, the second suffixed', async () => {
  const srv = await mockServer([
    ...lookup([row('plan1', 'Plan: Dupes', 'dupe-plan')]),
    md('plan1', 'Body.\n'),
    kids('plan1', [['p01', '01 Topic'], ['p02', '01-topic']]),
    md('p01', 'first\n'),
    md('p02', 'second\n'),
  ]);
  const out = outDir();
  try {
    const r = await runCli(['export', '--slug', 'dupe-plan', '--out', out], { base: srv.base, cwd: projectDir() });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(path.join(out, 'plan', '01-topic.md'), 'utf8'), /first/);
    assert.match(fs.readFileSync(path.join(out, 'plan', '01-topic-2.md'), 'utf8'), /second/);
  } finally {
    srv.close();
  }
});

test('cli: a slug that matches no plan row exits 6', async () => {
  const srv = await mockServer(lookup([]));
  try {
    const r = await runCli(['export', '--slug', 'missing', '--out', outDir()], { base: srv.base, cwd: projectDir() });
    assert.strictEqual(r.status, 6);
    assert.match(r.stderr, /No plan row has Slug "missing"/);
  } finally {
    srv.close();
  }
});

test('cli: a slug that matches two plan rows exits 6 listing both', async () => {
  const srv = await mockServer(lookup([PLAN, row('plan2', 'Plan: Dup', 'demo-plan')]));
  try {
    const r = await runCli(['export', '--slug', 'demo-plan', '--out', outDir()], { base: srv.base, cwd: projectDir() });
    assert.strictEqual(r.status, 6);
    assert.match(r.stderr, /matches 2 plan rows/);
    assert.match(r.stderr, /plan1/);
    assert.match(r.stderr, /plan2/);
  } finally {
    srv.close();
  }
});

test('cli: a truncated page read exits 5', async () => {
  const srv = await mockServer([
    ...lookup([PLAN]),
    { method: 'GET', path: '/v1/pages/design1', status: 200, body: DESIGN },
    md('plan1', 'partial', true),
  ]);
  try {
    const r = await runCli(['export', '--slug', 'demo-plan', '--out', outDir()], { base: srv.base, cwd: projectDir() });
    assert.strictEqual(r.status, 5);
    assert.match(r.stderr, /truncated/);
  } finally {
    srv.close();
  }
});

test('cli: a non-empty --out is refused with exit 2 before any API call', async () => {
  const srv = await mockServer(lookup([PLAN]));
  const out = outDir();
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'keep.txt'), 'mine');
  try {
    const r = await runCli(['export', '--slug', 'demo-plan', '--out', out], { base: srv.base, cwd: projectDir() });
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /not empty/);
    assert.strictEqual(srv.seen.length, 0);
    assert.strictEqual(fs.readFileSync(path.join(out, 'keep.txt'), 'utf8'), 'mine');
  } finally {
    srv.close();
  }
});

test('cli: no credential exits 2', async () => {
  const r = await runCli(['export', '--slug', 'demo-plan', '--out', outDir()], { cwd: projectDir(), token: null });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /NOTION_TOKEN/);
});

test('cli: a filesystem backend exits 2', async () => {
  const r = await runCli(['export', '--slug', 'demo-plan', '--out', outDir()], { cwd: projectDir('filesystem') });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /not notion/);
});
