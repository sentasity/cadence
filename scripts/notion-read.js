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

class UsageError extends Error {}

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
function fileNameFromTitle(title) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

module.exports = { parseArgs, fileNameFromTitle, plainText, buildFrontmatter };
