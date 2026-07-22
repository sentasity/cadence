'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  deepMerge,
  flattenLeaves,
  getPath,
  isTeamPolicyKey,
} = require('./resolve-config.js');

test('deepMerge: later scalar replaces earlier scalar', () => {
  assert.deepStrictEqual(
    deepMerge({ a: 1, b: 2 }, { b: 3 }),
    { a: 1, b: 3 }
  );
});

test('deepMerge: mapping contributes child keys, siblings intact', () => {
  const base = { execute: { max_parallel: 4, worktree_confirm: true } };
  const over = { execute: { max_parallel: 2 } };
  assert.deepStrictEqual(deepMerge(base, over), {
    execute: { max_parallel: 2, worktree_confirm: true },
  });
});

test('deepMerge: a list replaces the whole list, no element merging', () => {
  const base = { audits: { default: ['a', 'b', 'c'] } };
  const over = { audits: { default: ['x'] } };
  assert.deepStrictEqual(deepMerge(base, over).audits.default, ['x']);
});

test('deepMerge: explicit null counts as defined and wins', () => {
  const base = { worktree: { hooks: { provision: 'setup.sh' } } };
  const over = { worktree: { hooks: { provision: null } } };
  assert.strictEqual(deepMerge(base, over).worktree.hooks.provision, null);
});

test('deepMerge: does not mutate its inputs', () => {
  const base = { a: { b: 1 } };
  deepMerge(base, { a: { b: 2 } });
  assert.strictEqual(base.a.b, 1);
});

test('flattenLeaves: yields dot paths for scalars, lists, and nulls', () => {
  const leaves = flattenLeaves({
    storage: { backend: 'notion' },
    audits: { default: ['x'] },
    hook: null,
  }, '');
  assert.deepStrictEqual(leaves.sort(), [
    ['audits.default', ['x']],
    ['hook', null],
    ['storage.backend', 'notion'],
  ].sort());
});

test('getPath: walks nested mappings and reports missing paths', () => {
  const obj = { storage: { backend: 'filesystem' } };
  assert.deepStrictEqual(getPath(obj, 'storage.backend'), { found: true, value: 'filesystem' });
  assert.strictEqual(getPath(obj, 'storage.nope').found, false);
  assert.strictEqual(getPath(obj, 'storage.backend.deeper').found, false);
});

test('isTeamPolicyKey: prefix entries, exact entries, and personal keys', () => {
  assert.strictEqual(isTeamPolicyKey('paths.designs'), true);
  assert.strictEqual(isTeamPolicyKey('storage.backend'), true);
  assert.strictEqual(isTeamPolicyKey('worktree.hooks.provision'), true);
  assert.strictEqual(isTeamPolicyKey('execute.branch_check'), true);
  assert.strictEqual(isTeamPolicyKey('execute.max_parallel'), false);
  assert.strictEqual(isTeamPolicyKey('authoring.design_mode'), false);
  assert.strictEqual(isTeamPolicyKey('advisors.enabled'), false);
});
