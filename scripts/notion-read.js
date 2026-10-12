#!/usr/bin/env node
'use strict';

// Export a Cadence plan and its linked design from Notion to local markdown,
// so an agent with no Notion MCP (the completion auditor) can read them as
// files. The read twin of notion-write.js: same credential, same API version.
//
// Usage:
//   node notion-read.js export --slug <plan-slug> --out <dir>
//
// Env:
//   NOTION_TOKEN      token with access to the Cadence databases
//   NOTION_TOKEN_CMD  fallback when NOTION_TOKEN is unset: a command whose stdout
//                     is the token
//   NOTION_API_BASE   override for tests (default https://api.notion.com)
//
// Exit codes:
//   0  export written (single-line JSON result on stdout)
//   2  usage error: bad arguments, no credential, a non-empty --out, or a
//      storage backend other than notion
//   4  API error
//   5  a page read back truncated
//   6  the slug matched no plan row, or more than one

const fs = require('node:fs');
const path = require('node:path');
const { fail, apiBase, resolveToken, apiRequest } = require('./notion-rest.js');
const { resolveConfig } = require('./resolve-config.js');

class UsageError extends Error {}
class ExportError extends Error {
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
  }
}

function parseArgs(argv) {
  const mode = argv[0];
  if (mode !== 'export') {
    throw new UsageError(`usage: unknown mode ${JSON.stringify(mode)}; expected export`);
  }
  const flags = {};
  for (let i = 1; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) {
      throw new UsageError(`usage: malformed arguments near ${argv[i]}`);
    }
    flags[argv[i].slice(2)] = argv[i + 1];
  }
  for (const name of ['slug', 'out']) {
    if (!flags[name]) throw new UsageError(`usage: missing required --${name}`);
  }
  return { mode, slug: flags.slug, out: flags.out };
}

// "01 Plan Authoring" -> "01-plan-authoring.md"; an NN-kebab title is kept.
// Accents fold to their base letter ("Café" -> "cafe") and letters from other
// scripts are kept, so no title loses its letters.
function fileNameFromTitle(title) {
  const base = title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `${base || 'untitled'}.md`;
}

function plainText(richText) {
  return (richText || []).map((t) => t.plain_text ?? '').join('');
}

// Overview frontmatter rebuilt from a database row's properties, in the shape
// skills/_shared/frontmatter.md defines. kind is 'plan' or 'design'; linkSlug
// is the slug at the other end of the design-plan link, or null.
function buildFrontmatter(kind, properties, linkSlug) {
  const p = properties || {};
  const lines = [
    '---',
    `title: ${JSON.stringify(plainText(p.Title && p.Title.title))}`,
    `created: ${(p.Created && p.Created.date && p.Created.date.start) || 'null'}`,
    `updated: ${(p.Updated && p.Updated.date && p.Updated.date.start) || 'null'}`,
    `status: ${(p.Status && p.Status.select && p.Status.select.name) || 'null'}`,
    `tags: [${((p.Tags && p.Tags.multi_select) || []).map((t) => t.name).join(', ')}]`,
  ];
  if (kind === 'plan') {
    lines.push(`linked_design: ${linkSlug || 'null'}`);
    lines.push(`base_sha: ${plainText(p['Base SHA'] && p['Base SHA'].rich_text) || 'null'}`);
  } else {
    lines.push(`linked_plan: ${linkSlug || 'null'}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

async function dataSourceId(base, token, databaseId) {
  const db = (await apiRequest(base, token, 'GET', `/v1/databases/${databaseId}`)).json;
  const ds = db.data_sources && db.data_sources[0];
  if (!ds) throw new ExportError(4, `Database ${databaseId} has no data source.`);
  return ds.id;
}

async function findPlanRow(base, token, dsId, slug) {
  const res = (await apiRequest(base, token, 'POST', `/v1/data_sources/${dsId}/query`, {
    filter: { property: 'Slug', rich_text: { equals: slug } },
  })).json;
  const rows = res.results || [];
  if (rows.length === 0) throw new ExportError(6, `No plan row has Slug "${slug}".`);
  if (rows.length > 1) {
    throw new ExportError(6, `Slug "${slug}" matches ${rows.length} plan rows: ${rows.map((r) => r.url).join(', ')}.`);
  }
  return rows[0];
}

async function pageMarkdown(base, token, pageId) {
  const json = (await apiRequest(base, token, 'GET', `/v1/pages/${pageId}/markdown`)).json;
  if (json.truncated) {
    throw new ExportError(5, `Page ${pageId} read back truncated; refusing a partial export.`);
  }
  return json.markdown || '';
}

async function childPages(base, token, pageId) {
  const out = [];
  let cursor = null;
  do {
    const qs = `page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`;
    const json = (await apiRequest(base, token, 'GET', `/v1/blocks/${pageId}/children?${qs}`)).json;
    for (const b of json.results || []) {
      if (b.type === 'child_page') out.push({ id: b.id, title: b.child_page.title });
    }
    cursor = json.has_more ? json.next_cursor : null;
  } while (cursor);
  return out;
}

// Write one artifact (overview plus every sub-page) into dir; returns the
// manifest's file entries in page order.
async function exportArtifact(base, token, row, kind, linkSlug, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const overview = await pageMarkdown(base, token, row.id);
  fs.writeFileSync(path.join(dir, '00-overview.md'), `${buildFrontmatter(kind, row.properties, linkSlug)}\n${overview}`);
  const files = [{
    file: '00-overview.md', slot: '00-overview',
    title: plainText(row.properties.Title && row.properties.Title.title), url: row.url,
  }];
  const used = new Set(['00-overview.md']);
  for (const child of await childPages(base, token, row.id)) {
    let name = fileNameFromTitle(child.title);
    for (let n = 2; used.has(name); n++) name = fileNameFromTitle(`${child.title} ${n}`);
    used.add(name);
    const body = await pageMarkdown(base, token, child.id);
    fs.writeFileSync(path.join(dir, name), `---\ntitle: ${JSON.stringify(child.title)}\n---\n\n${body}`);
    files.push({
      file: name, slot: name.replace(/\.md$/, ''), title: child.title,
      url: `https://www.notion.so/${child.id.replace(/-/g, '')}`,
    });
  }
  return files;
}

function statusOf(row) {
  return (row.properties.Status && row.properties.Status.select && row.properties.Status.select.name) || null;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) fail(2, e.message);
    throw e;
  }
  if (fs.existsSync(args.out) && !fs.statSync(args.out).isDirectory()) {
    fail(2, `--out ${args.out} is a file; export into a new or empty directory.`);
  }
  if (fs.existsSync(args.out) && fs.readdirSync(args.out).length > 0) {
    fail(2, `--out ${args.out} is not empty; export into a new or empty directory.`);
  }

  let resolved;
  try {
    resolved = resolveConfig(process.cwd());
  } catch (e) {
    fail(e.exitCode || 2, e.message);
  }
  const storage = resolved.config.storage || {};
  if (storage.backend !== 'notion') {
    fail(2, `storage.backend is ${JSON.stringify(storage.backend)}, not notion; read the plan folder directly.`);
  }
  const plansDb = storage.notion && storage.notion.plans_db;
  if (!plansDb) fail(2, 'storage.notion.plans_db is not set in the resolved config.');

  const token = resolveToken();
  const base = apiBase();
  try {
    const planRow = await findPlanRow(base, token, await dataSourceId(base, token, plansDb), args.slug);
    const link = planRow.properties['Linked Design'];
    const designId = link && link.relation && link.relation[0] ? link.relation[0].id : null;
    let designRow = null;
    if (designId) {
      designRow = (await apiRequest(base, token, 'GET', `/v1/pages/${designId}`)).json;
    } else {
      process.stderr.write(`warning: plan ${args.slug} has no Linked Design; exporting the plan only.\n`);
    }
    const designSlug = designRow ? plainText(designRow.properties.Slug && designRow.properties.Slug.rich_text) || null : null;

    const planFiles = await exportArtifact(base, token, planRow, 'plan', designSlug, path.join(args.out, 'plan'));
    const designFiles = designRow
      ? await exportArtifact(base, token, designRow, 'design', args.slug, path.join(args.out, 'design'))
      : null;
    const manifest = {
      plan: { slug: args.slug, url: planRow.url, status: statusOf(planRow), files: planFiles },
      design: designRow
        ? { slug: designSlug, url: designRow.url, status: statusOf(designRow), files: designFiles }
        : null,
    };
    fs.writeFileSync(path.join(args.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(JSON.stringify({
      ok: true,
      out: args.out,
      plan: { slug: args.slug, url: planRow.url },
      design: designRow ? { slug: designSlug, url: designRow.url } : null,
      files: planFiles.length + (designFiles ? designFiles.length : 0),
    }) + '\n');
  } catch (e) {
    if (e instanceof ExportError) fail(e.exitCode, e.message);
    if (e.apiError) fail(4, e.message);
    throw e;
  }
}

module.exports = { parseArgs, fileNameFromTitle, plainText, buildFrontmatter };

if (require.main === module) {
  main().catch((e) => fail(4, e.message));
}
