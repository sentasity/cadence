'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseConfigVersion,
  detectMissingKeys,
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
