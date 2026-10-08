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
