'use strict';

// Structural checks over the shipped skill and agent text. These guard the
// failure modes that prose review keeps missing: references to files that
// don't ship, skill descriptions that summarize a workflow instead of naming
// when to use the skill, and keywords that silently change model behavior.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DESCRIPTION_MAX = 250;

// Paths that appear in shipped text as examples of a user's repo, not as
// references to plugin files.
const EXAMPLE_PATHS = new Set([
  'skills/c-foo/SKILL.md', // c-explain's citation example
  'scripts/load-env.sh', // browser-validation's browser_env_preamble example
]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

const shippedDocs = ['skills', 'agents', 'templates'].flatMap((dir) =>
  walk(path.join(ROOT, dir))
);

const skillDirs = fs
  .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
  .map((e) => e.name);

function frontmatter(file) {
  const match = fs.readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-z_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2];
  }
  return fields;
}

function rel(file) {
  return path.relative(ROOT, file);
}

test('every skill has frontmatter whose name matches its directory', () => {
  for (const dir of skillDirs) {
    const fm = frontmatter(path.join(ROOT, 'skills', dir, 'SKILL.md'));
    assert.ok(fm, `skills/${dir}/SKILL.md has no frontmatter`);
    assert.strictEqual(fm.name, dir, `skills/${dir}/SKILL.md name`);
  }
});

test('skill descriptions say when to use the skill, briefly', () => {
  for (const dir of skillDirs) {
    const { description = '' } = frontmatter(
      path.join(ROOT, 'skills', dir, 'SKILL.md')
    );
    assert.match(
      description,
      /^Use when /,
      `skills/${dir}: description must start with "Use when "`
    );
    assert.ok(
      description.length <= DESCRIPTION_MAX,
      `skills/${dir}: description is ${description.length} chars (max ${DESCRIPTION_MAX})`
    );
  }
});

test('plugin file references resolve to shipped files', () => {
  const ref =
    /(?:\$\{CLAUDE_PLUGIN_ROOT\}\/)?\b((?:skills|agents|scripts|templates|defaults|hooks)\/[A-Za-z0-9_.\/-]+)/g;
  const missing = [];
  for (const file of shippedDocs) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [, raw] of text.matchAll(ref)) {
      const p = raw.replace(/[.\/]+$/, '');
      if (EXAMPLE_PATHS.has(p)) continue;
      if (!fs.existsSync(path.join(ROOT, p))) missing.push(`${rel(file)} -> ${p}`);
    }
  }
  assert.deepStrictEqual(missing, []);
});

test('no wikilinks into docs/, which is gitignored and never ships', () => {
  const offenders = [];
  for (const file of shippedDocs) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [link] of text.matchAll(/\[\[[^\]]*\bdocs\/[^\]]*\]\]/g)) {
      offenders.push(`${rel(file)}: ${link}`);
    }
  }
  assert.deepStrictEqual(offenders, []);
});

test('same-file anchors ([[#Heading]]) match a heading in that file', () => {
  const broken = [];
  for (const file of shippedDocs) {
    const text = fs.readFileSync(file, 'utf8');
    const headings = new Set(
      [...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1])
    );
    for (const [, anchor] of text.matchAll(/\[\[#([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      if (!headings.has(anchor)) broken.push(`${rel(file)}: [[#${anchor}]]`);
    }
  }
  assert.deepStrictEqual(broken, []);
});

test('no thinking-budget trigger keywords in shipped text', () => {
  // Claude Code scans prompts for these; one stray phrase in a skill forces
  // extended thinking on every session that loads it.
  const trigger = /\b(ultrathink|megathink|think harder|think hard)\b/i;
  const offenders = shippedDocs
    .filter((file) => trigger.test(fs.readFileSync(file, 'utf8')))
    .map(rel);
  assert.deepStrictEqual(offenders, []);
});
