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

const fsm = require('node:fs');
const pathm = require('node:path');
const os = require('node:os');
const { findConfigDir, resolveConfig } = require('./resolve-config.js');

function makeRepo(files) {
  const root = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'rc-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = pathm.join(root, rel);
    fsm.mkdirSync(pathm.dirname(p), { recursive: true });
    fsm.writeFileSync(p, content);
  }
  return root;
}

test('findConfigDir: finds .cadence from a nested subdirectory', () => {
  const root = makeRepo({ '.cadence/config.yaml': 'config_version: 5\n', 'a/b/keep.txt': '' });
  assert.strictEqual(fsm.realpathSync(findConfigDir(pathm.join(root, 'a', 'b'))), fsm.realpathSync(root));
});

test('findConfigDir: a .cadence with only a local file anchors the walk', () => {
  const root = makeRepo({ '.cadence/config.local.yaml': 'execute:\n  max_parallel: 2\n' });
  assert.strictEqual(fsm.realpathSync(findConfigDir(root)), fsm.realpathSync(root));
});

test('findConfigDir: no config anywhere returns null', () => {
  const root = makeRepo({ 'a/keep.txt': '' });
  assert.strictEqual(findConfigDir(pathm.join(root, 'a')), null);
});

test('resolveConfig: no .cadence means pure defaults, root null', () => {
  const root = makeRepo({});
  const r = resolveConfig(root);
  assert.strictEqual(r.root, null);
  assert.strictEqual(r.sources.repo, null);
  assert.strictEqual(r.sources.local, null);
  assert.strictEqual(r.config.storage.backend, 'filesystem');
  assert.deepStrictEqual(r.team_policy_overrides, []);
  assert.strictEqual(r.gitignore_missing, false);
});

test('resolveConfig: repo layer overrides defaults per key path', () => {
  const root = makeRepo({
    '.cadence/config.yaml': 'config_version: 5\nexecute:\n  max_parallel: 9\n',
  });
  const r = resolveConfig(root);
  assert.strictEqual(r.config.execute.max_parallel, 9);
  assert.strictEqual(r.config.execute.branch_check, true);
});

test('resolveConfig: local layer wins over repo; policy override reported', () => {
  const root = makeRepo({
    '.cadence/config.yaml': 'config_version: 5\nstorage:\n  backend: filesystem\n',
    '.cadence/config.local.yaml': 'storage:\n  backend: notion\nexecute:\n  max_parallel: 2\n',
    '.gitignore': '.cadence/config.local.yaml\n',
  });
  const r = resolveConfig(root);
  assert.strictEqual(r.config.storage.backend, 'notion');
  assert.strictEqual(r.config.execute.max_parallel, 2);
  assert.deepStrictEqual(r.team_policy_overrides, [
    { key: 'storage.backend', layer: 'local', value: 'notion' },
  ]);
  assert.strictEqual(r.gitignore_missing, false);
});

test('resolveConfig: gitignore_missing true when local exists and line absent', () => {
  const root = makeRepo({
    '.cadence/config.yaml': 'config_version: 5\n',
    '.cadence/config.local.yaml': 'authoring:\n  design_mode: inline\n',
    '.gitignore': 'node_modules\n',
  });
  assert.strictEqual(resolveConfig(root).gitignore_missing, true);
});

test('resolveConfig: malformed YAML throws with exitCode 3 naming the file', () => {
  const root = makeRepo({
    '.cadence/config.yaml': 'paths:\n\tdesigns: docs\n',
  });
  assert.throws(() => resolveConfig(root), (err) => {
    assert.strictEqual(err.exitCode, 3);
    assert.match(err.message, /config\.yaml/);
    return true;
  });
});

const { spawnSync } = require('node:child_process');
const SCRIPT = pathm.join(__dirname, 'resolve-config.js');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

test('cli: no flags prints the full JSON object', () => {
  const root = makeRepo({ '.cadence/config.yaml': 'config_version: 5\n' });
  const r = runCli([], root);
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.config.storage.backend, 'filesystem');
  assert.ok(out.sources.defaults.endsWith('config.default.yaml'));
});

test('cli: --key prints a bare scalar for strings', () => {
  const root = makeRepo({ '.cadence/config.yaml': 'config_version: 5\nstorage:\n  backend: notion\n' });
  const r = runCli(['--key', 'storage.backend'], root);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, 'notion\n');
});

test('cli: --key prints numbers, booleans, null, and JSON for structures', () => {
  const root = makeRepo({ '.cadence/config.yaml': 'config_version: 5\n' });
  assert.strictEqual(runCli(['--key', 'execute.max_parallel'], root).stdout, '4\n');
  assert.strictEqual(runCli(['--key', 'plan.tdd'], root).stdout, 'true\n');
  assert.strictEqual(runCli(['--key', 'worktree.hooks.provision'], root).stdout, 'null\n');
  assert.strictEqual(
    runCli(['--key', 'status.design'], root).stdout,
    '["draft","in-review","approved","completed","superseded","on-hold"]\n'
  );
});

test('cli: --key on a missing path exits 4 with empty stdout', () => {
  const root = makeRepo({ '.cadence/config.yaml': 'config_version: 5\n' });
  const r = runCli(['--key', 'storage.nope'], root);
  assert.strictEqual(r.status, 4);
  assert.strictEqual(r.stdout, '');
  assert.match(r.stderr, /no config key at path "storage\.nope"/);
});

test('cli: unknown flag exits 5; --help exits 0', () => {
  const root = makeRepo({});
  assert.strictEqual(runCli(['--frobnicate'], root).status, 5);
  assert.strictEqual(runCli(['--help'], root).status, 0);
});

test('cli: malformed repo YAML exits 3 with empty stdout', () => {
  const root = makeRepo({ '.cadence/config.yaml': 'paths:\n\tdesigns: docs\n' });
  const r = runCli([], root);
  assert.strictEqual(r.status, 3);
  assert.strictEqual(r.stdout, '');
});

test('cli: missing defaults exits 2 (script copied beside no defaults dir)', () => {
  const fake = fsm.mkdtempSync(pathm.join(os.tmpdir(), 'rc-noplugin-'));
  fsm.mkdirSync(pathm.join(fake, 'scripts', 'vendor'), { recursive: true });
  fsm.copyFileSync(SCRIPT, pathm.join(fake, 'scripts', 'resolve-config.js'));
  fsm.copyFileSync(
    pathm.join(__dirname, 'vendor', 'js-yaml.js'),
    pathm.join(fake, 'scripts', 'vendor', 'js-yaml.js')
  );
  const r = spawnSync(
    process.execPath,
    [pathm.join(fake, 'scripts', 'resolve-config.js')],
    { cwd: fake, encoding: 'utf8' }
  );
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /plugin defaults not found/);
});
