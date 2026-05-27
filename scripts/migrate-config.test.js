'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseConfigVersion,
  detectMissingKeys,
  mergeMissing,
} = require('./migrate-config.js');

test('parseConfigVersion: reads a column-0 config_version line', () => {
  const text = '# comment\nconfig_version: 2\npaths:\n  designs: docs/designs\n';
  assert.strictEqual(parseConfigVersion(text), 2);
});

test('parseConfigVersion: tolerates extra whitespace after the colon', () => {
  assert.strictEqual(parseConfigVersion('config_version:    7\n'), 7);
});

test('parseConfigVersion: absent config_version returns 1', () => {
  const text = 'paths:\n  designs: docs/designs\nplan:\n  tdd: true\n';
  assert.strictEqual(parseConfigVersion(text), 1);
});

test('parseConfigVersion: an indented config_version is NOT a top-level match -> 1', () => {
  const text = 'meta:\n  config_version: 9\n';
  assert.strictEqual(parseConfigVersion(text), 1);
});

test('detectMissingKeys: finds whole top-level blocks present in defaults but absent in project', () => {
  const def = [
    'paths:',
    '  designs: docs/designs',
    'naming:',
    '  date_format: "YYYY-MM-DD"',
    'status:',
    '  design: [draft]',
  ].join('\n') + '\n';
  const proj = [
    'paths:',
    '  designs: docs/designs',
  ].join('\n') + '\n';
  const r = detectMissingKeys(proj, def);
  assert.deepStrictEqual(r.missingBlocks, ['naming', 'status']);
  assert.deepStrictEqual(r.missingNested, []);
});

test('detectMissingKeys: finds child keys missing under a block that exists in project', () => {
  const def = [
    'execute:',
    '  branch_check: true',
    '  max_parallel: 4',
    '  worktree_dir: .cadence/worktrees',
    '  integrate: rebase-ff',
  ].join('\n') + '\n';
  const proj = [
    'execute:',
    '  branch_check: true',
    '  max_parallel: 5',
  ].join('\n') + '\n';
  const r = detectMissingKeys(proj, def);
  assert.deepStrictEqual(r.missingBlocks, []);
  assert.deepStrictEqual(r.missingNested, [
    { block: 'execute', key: 'worktree_dir' },
    { block: 'execute', key: 'integrate' },
  ]);
});

test('detectMissingKeys: a user-tuned value counts as present (by key, not value)', () => {
  const def = [
    'plan:',
    '  tdd: true',
    '  parallel_grain: per-file',
  ].join('\n') + '\n';
  const proj = [
    'plan:',
    '  tdd: true',
    '  parallel_grain: in-file',
  ].join('\n') + '\n';
  const r = detectMissingKeys(proj, def);
  assert.deepStrictEqual(r.missingBlocks, []);
  assert.deepStrictEqual(r.missingNested, []);
});

test('detectMissingKeys: ignores comment and blank lines inside blocks', () => {
  const def = [
    'plan:',
    '  tdd: true',
    '  # No split_thresholds — judgment-based.',
    '',
    '  commit_cadence: per-task',
  ].join('\n') + '\n';
  const proj = [
    'plan:',
    '  tdd: true',
  ].join('\n') + '\n';
  const r = detectMissingKeys(proj, def);
  assert.deepStrictEqual(r.missingNested, [
    { block: 'plan', key: 'commit_cadence' },
  ]);
});

test('detectMissingKeys: deeper-indented grandchild keys are not treated as direct children', () => {
  const def = [
    'audits:',
    '  default:',
    '    - checkbox-completeness',
    '  build_validator:',
    '    command: null',
  ].join('\n') + '\n';
  const proj = [
    'audits:',
    '  default:',
    '    - checkbox-completeness',
  ].join('\n') + '\n';
  const r = detectMissingKeys(proj, def);
  // Only the direct child `build_validator` is reported; `command` is a grandchild.
  assert.deepStrictEqual(r.missingNested, [
    { block: 'audits', key: 'build_validator' },
  ]);
});

test('mergeMissing: appends a whole missing top-level block verbatim, with comments', () => {
  const def = [
    'paths:',
    '  designs: docs/designs',
    'validate:',
    '  # toggle checkbox reset',
    '  reset_checkboxes_on_rerun: true',
  ].join('\n') + '\n';
  const proj = [
    'paths:',
    '  designs: docs/designs',
  ].join('\n') + '\n';
  const missing = detectMissingKeys(proj, def);
  const out = mergeMissing(proj, def, missing);
  assert.match(out, /validate:\n {2}# toggle checkbox reset\n {2}reset_checkboxes_on_rerun: true/);
  // Existing lines preserved unchanged at the top.
  assert.ok(out.startsWith('paths:\n  designs: docs/designs\n'));
  // Exactly one blank line separates the appended block from prior content.
  assert.match(out, /  designs: docs\/designs\n\nvalidate:/);
});

test('mergeMissing: inserts a missing nested key inside its existing block at child indent', () => {
  const def = [
    'execute:',
    '  branch_check: true',
    '  worktree_dir: .cadence/worktrees',
    '  integrate: rebase-ff',
  ].join('\n') + '\n';
  const proj = [
    'execute:',
    '  branch_check: true',
    '  max_parallel: 5',
    '',
    'advisors:',
    '  enabled: false',
  ].join('\n') + '\n';
  const missing = detectMissingKeys(proj, def);
  const out = mergeMissing(proj, def, missing);
  const lines = out.split('\n');
  // The inserted keys land at the end of the execute block, before the blank
  // line that precedes `advisors:`. User value max_parallel: 5 is untouched.
  const execIdx = lines.indexOf('execute:');
  const advIdx = lines.indexOf('advisors:');
  const slice = lines.slice(execIdx, advIdx);
  assert.ok(slice.includes('  max_parallel: 5'), 'user value preserved');
  assert.ok(slice.includes('  worktree_dir: .cadence/worktrees'), 'worktree_dir inserted');
  assert.ok(slice.includes('  integrate: rebase-ff'), 'integrate inserted');
  // worktree_dir/integrate appear after the original execute keys.
  assert.ok(slice.indexOf('  worktree_dir: .cadence/worktrees') > slice.indexOf('  max_parallel: 5'));
});

test('mergeMissing: nested insert occurs before the next top-level block, not at EOF', () => {
  const def = [
    'execute:',
    '  branch_check: true',
    '  integrate: rebase-ff',
  ].join('\n') + '\n';
  const proj = [
    'execute:',
    '  branch_check: true',
    'advisors:',
    '  enabled: false',
  ].join('\n') + '\n';
  const missing = detectMissingKeys(proj, def);
  const out = mergeMissing(proj, def, missing);
  const lines = out.split('\n');
  assert.ok(lines.indexOf('  integrate: rebase-ff') < lines.indexOf('advisors:'));
});

test('mergeMissing: nested insert at EOF block (no trailing top-level block)', () => {
  const def = [
    'execute:',
    '  branch_check: true',
    '  integrate: rebase-ff',
  ].join('\n') + '\n';
  const proj = [
    'execute:',
    '  branch_check: true',
  ].join('\n') + '\n';
  const missing = detectMissingKeys(proj, def);
  const out = mergeMissing(proj, def, missing);
  assert.match(out, /execute:\n {2}branch_check: true\n {2}integrate: rebase-ff/);
});

test('mergeMissing: handles both a missing block AND a missing nested key together', () => {
  const def = [
    'execute:',
    '  branch_check: true',
    '  integrate: rebase-ff',
    'validate:',
    '  reset_checkboxes_on_rerun: true',
  ].join('\n') + '\n';
  const proj = [
    'execute:',
    '  branch_check: true',
  ].join('\n') + '\n';
  const missing = detectMissingKeys(proj, def);
  const out = mergeMissing(proj, def, missing);
  // nested key landed inside execute
  assert.match(out, /execute:\n {2}branch_check: true\n {2}integrate: rebase-ff/);
  // whole block appended
  assert.match(out, /\nvalidate:\n {2}reset_checkboxes_on_rerun: true/);
});

test('mergeMissing: no missing keys returns text unchanged', () => {
  const def = 'paths:\n  designs: docs/designs\n';
  const proj = 'paths:\n  designs: docs/designs\n';
  const missing = detectMissingKeys(proj, def);
  assert.strictEqual(mergeMissing(proj, def, missing), proj);
});
