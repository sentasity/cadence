'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  parseConfigVersion,
  detectMissingKeys,
  mergeMissing,
  bumpOrInsertVersion,
  relocationsFor,
  main,
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

test('bumpOrInsertVersion: replaces an existing config_version number', () => {
  const text = '# header\nconfig_version: 1\npaths:\n  designs: docs/designs\n';
  const out = bumpOrInsertVersion(text, 2);
  assert.match(out, /^config_version: 2$/m);
  assert.doesNotMatch(out, /config_version: 1/);
});

test('bumpOrInsertVersion: preserves an inline comment on the version line', () => {
  const text = 'config_version: 1   # schema version\npaths:\n';
  const out = bumpOrInsertVersion(text, 3);
  assert.match(out, /^config_version: 3   # schema version$/m);
});

test('bumpOrInsertVersion: inserts after a leading comment block when absent', () => {
  const text = '# line one comment\n# line two comment\npaths:\n  designs: docs/designs\n';
  const out = bumpOrInsertVersion(text, 2);
  const lines = out.split('\n');
  assert.strictEqual(lines[0], '# line one comment');
  assert.strictEqual(lines[1], '# line two comment');
  assert.strictEqual(lines[2], 'config_version: 2');
  assert.strictEqual(lines[3], 'paths:');
});

test('bumpOrInsertVersion: inserts at top when there is no leading comment', () => {
  const text = 'paths:\n  designs: docs/designs\n';
  const out = bumpOrInsertVersion(text, 2);
  assert.ok(out.startsWith('config_version: 2\npaths:'));
});

// ---- main() integration tests via temp dirs ----

function setupTemp(projConfigText) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-proj-'));
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-plugin-'));
  fs.mkdirSync(path.join(pluginRoot, 'defaults'), { recursive: true });
  const defaultsText = [
    '# Cadence plugin defaults.',
    'config_version: 2          # schema version',
    'paths:',
    '  designs: docs/designs',
    'validate:',
    '  reset_checkboxes_on_rerun: true',
    'execute:',
    '  branch_check: true',
    '  max_parallel: 4',
    '  integrate: rebase-ff',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(pluginRoot, 'defaults', 'config.default.yaml'), defaultsText);
  if (projConfigText !== null) {
    fs.mkdirSync(path.join(projectDir, '.cadence'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.cadence', 'config.yaml'), projConfigText);
  }
  return { projectDir, pluginRoot };
}

function runMain(projectDir, pluginRoot) {
  const prevProj = process.env.CLAUDE_PROJECT_DIR;
  const prevPlugin = process.env.CLAUDE_PLUGIN_ROOT;
  const logs = [];
  const warns = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => warns.push(a.join(' '));
  process.env.CLAUDE_PROJECT_DIR = projectDir;
  process.env.CLAUDE_PLUGIN_ROOT = pluginRoot;
  try {
    main();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    if (prevProj === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prevProj;
    if (prevPlugin === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = prevPlugin;
  }
  return { logs, warns };
}

test('main: no config file -> silent no-op, nothing created', () => {
  const { projectDir, pluginRoot } = setupTemp(null);
  const { logs, warns } = runMain(projectDir, pluginRoot);
  assert.deepStrictEqual(logs, []);
  assert.deepStrictEqual(warns, []);
  assert.strictEqual(fs.existsSync(path.join(projectDir, '.cadence', 'config.yaml')), false);
});

test('main: already current -> no-op, no output, file unchanged', () => {
  const proj = 'config_version: 2\npaths:\n  designs: docs/designs\n';
  const { projectDir, pluginRoot } = setupTemp(proj);
  const { logs, warns } = runMain(projectDir, pluginRoot);
  assert.deepStrictEqual(logs, []);
  assert.deepStrictEqual(warns, []);
  const after = fs.readFileSync(path.join(projectDir, '.cadence', 'config.yaml'), 'utf8');
  assert.strictEqual(after, proj);
});

test('main: behind (no version) -> merges, bumps, prints one notice', () => {
  const proj = [
    'paths:',
    '  designs: docs/designs',
    'execute:',
    '  branch_check: true',
    '  max_parallel: 5',
  ].join('\n') + '\n';
  const { projectDir, pluginRoot } = setupTemp(proj);
  const { logs, warns } = runMain(projectDir, pluginRoot);
  assert.deepStrictEqual(warns, []);
  assert.strictEqual(logs.length, 1);
  assert.match(logs[0], /^Cadence config migrated to v2: added .+ \(defaults\)\. Edit \.cadence\/config\.yaml to tune\.$/);
  const after = fs.readFileSync(path.join(projectDir, '.cadence', 'config.yaml'), 'utf8');
  // version inserted
  assert.match(after, /^config_version: 2$/m);
  // user value preserved
  assert.match(after, /^ {2}max_parallel: 5$/m);
  // missing block appended
  assert.match(after, /\nvalidate:\n {2}reset_checkboxes_on_rerun: true/);
  // missing nested key inserted into execute
  assert.match(after, /^ {2}integrate: rebase-ff$/m);
});

test('main: notice names the added keys', () => {
  const proj = 'paths:\n  designs: docs/designs\n';
  const { projectDir, pluginRoot } = setupTemp(proj);
  const { logs } = runMain(projectDir, pluginRoot);
  assert.match(logs[0], /validate/);
  assert.match(logs[0], /execute/);
});

test('main: malformed YAML -> one warn, no write', () => {
  // Tab indentation makes the structural parse throw inside the try/catch.
  const proj = 'paths:\n  designs: docs/designs\nexecute:\n\tbad: true\n';
  const { projectDir, pluginRoot } = setupTemp(proj);
  const before = fs.readFileSync(path.join(projectDir, '.cadence', 'config.yaml'), 'utf8');
  const { logs, warns } = runMain(projectDir, pluginRoot);
  assert.deepStrictEqual(logs, []);
  assert.strictEqual(warns.length, 1);
  assert.strictEqual(
    warns[0],
    'Cadence: skipped config migration (could not safely parse .cadence/config.yaml)'
  );
  const after = fs.readFileSync(path.join(projectDir, '.cadence', 'config.yaml'), 'utf8');
  assert.strictEqual(after, before);
});

test('main: user-tuned non-default value is never overwritten', () => {
  const proj = [
    'execute:',
    '  branch_check: true',
    '  max_parallel: 5',
  ].join('\n') + '\n';
  const { projectDir, pluginRoot } = setupTemp(proj);
  runMain(projectDir, pluginRoot);
  const after = fs.readFileSync(path.join(projectDir, '.cadence', 'config.yaml'), 'utf8');
  assert.match(after, /^ {2}max_parallel: 5$/m);
  assert.doesNotMatch(after, /^ {2}max_parallel: 4$/m);
});

test('main: missing defaults file -> warn, no write, no throw', () => {
  const proj = 'paths:\n  designs: docs/designs\n';
  const { projectDir, pluginRoot } = setupTemp(proj);
  fs.rmSync(path.join(pluginRoot, 'defaults', 'config.default.yaml'));
  const before = fs.readFileSync(path.join(projectDir, '.cadence', 'config.yaml'), 'utf8');
  const { logs, warns } = runMain(projectDir, pluginRoot);
  assert.deepStrictEqual(logs, []);
  assert.strictEqual(warns.length, 1);
  assert.match(warns[0], /plugin defaults not found/);
  const after = fs.readFileSync(path.join(projectDir, '.cadence', 'config.yaml'), 'utf8');
  assert.strictEqual(after, before);
});

// ---- v3 -> v4 worktree relocation (value-move) ----

// Mirrors the worktree: block in defaults/config.default.yaml (v4) so these
// tests exercise the exact text the real migration appends.
const V4_DEFAULTS = [
  '# Cadence plugin defaults.',
  'config_version: 4          # schema version',
  'paths:',
  '  designs: docs/designs',
  'execute:',
  '  branch_check: true',
  '  max_parallel: 4          # concurrent implementer lanes (= worktrees); reviewers uncapped',
  '  worktree_confirm: true   # one-time pre-flight worktree confirmation',
  'worktree:',
  '  dir: .cadence/worktrees     # canonical home (relocated from execute.worktree_dir)',
  '  integrate: rebase-ff        # rebase-ff | merge-commit (relocated from execute.integrate)',
  '  merge_lock: true            # on by default; both /c-worktree and /c-execute acquire it',
  '  lock_stale_threshold: 600   # seconds; past this a held lock surfaces "steal it?" (never auto-steal)',
  '  hooks:                      # all null by default -> generic behavior; null hook = phase absent',
  '    provision:    null        # runs after `git worktree add`',
  '    port_assign:  null        # allocates a dev port for the worktree; MUST print the port to stdout',
  "    port_release: null        # frees the worktree's port at cleanup",
  "    dev_server:   null        # starts the worktree's dev server (Sentasity-only in practice)",
  '    deploy_guard: null        # exits non-zero if a deploy is not allowed from here (Sentasity-only)',
].join('\n') + '\n';

test('relocation: whole-block append copies customized legacy values into worktree (load-bearing)', () => {
  // A real v3 config has NO worktree: block, so migration takes the
  // whole-block append path. Customized execute.worktree_dir /
  // execute.integrate must land in the new block; defaults must not shadow.
  const proj = [
    'config_version: 4',
    'execute:',
    '  branch_check: true',
    '  worktree_dir: .claude/worktrees   # custom home',
    '  integrate: merge-commit     # repo forbids history rewriting',
  ].join('\n') + '\n';
  const missing = detectMissingKeys(proj, V4_DEFAULTS);
  assert.ok(missing.missingBlocks.includes('worktree'), 'v3 config is missing the whole worktree block');
  const out = mergeMissing(proj, V4_DEFAULTS, missing);
  // Legacy values carried into the new keys (defaults comment preserved).
  assert.match(out, /^ {2}dir: \.claude\/worktrees\b/m);
  assert.match(out, /^ {2}integrate: merge-commit {3}# rebase-ff \| merge-commit \(relocated from execute\.integrate\)$/m);
  // Defaults did NOT shadow the customized values.
  assert.doesNotMatch(out, /^ {2}dir: \.cadence\/worktrees\b/m);
  assert.doesNotMatch(out, /^ {2}integrate: rebase-ff\b/m);
  // Non-relocated keys keep their defaults; hooks come along verbatim.
  assert.match(out, /^ {2}merge_lock: true\b/m);
  assert.match(out, /^ {2}lock_stale_threshold: 600\b/m);
  assert.match(out, /^ {4}provision: {4}null\b/m);
  // The legacy keys are never deleted.
  assert.match(out, /^ {2}worktree_dir: \.claude\/worktrees {3}# custom home$/m);
});

test('relocation: a default-valued v3 config ends at the defaults', () => {
  // No legacy keys at all -> pure defaults.
  const bare = 'execute:\n  branch_check: true\n';
  const outBare = mergeMissing(bare, V4_DEFAULTS, detectMissingKeys(bare, V4_DEFAULTS));
  assert.match(outBare, /^ {2}dir: \.cadence\/worktrees\b/m);
  assert.match(outBare, /^ {2}integrate: rebase-ff\b/m);
  // Legacy keys present at default values -> the value-copy lands the same defaults.
  const dflt = [
    'execute:',
    '  worktree_dir: .cadence/worktrees',
    '  integrate: rebase-ff',
  ].join('\n') + '\n';
  const outDflt = mergeMissing(dflt, V4_DEFAULTS, detectMissingKeys(dflt, V4_DEFAULTS));
  assert.match(outDflt, /^ {2}dir: \.cadence\/worktrees\b/m);
  assert.match(outDflt, /^ {2}integrate: rebase-ff\b/m);
});

test('relocation: nested insert into an existing worktree block carries legacy values', () => {
  // Hand-built partial worktree block: dir/integrate arrive as missingNested
  // keys, not a whole-block append. The same value-copy applies on this path.
  const proj = [
    'execute:',
    '  branch_check: true',
    '  worktree_dir: .claude/worktrees',
    '  integrate: merge-commit',
    'worktree:',
    '  merge_lock: true',
  ].join('\n') + '\n';
  const missing = detectMissingKeys(proj, V4_DEFAULTS);
  assert.ok(
    missing.missingNested.some((e) => e.block === 'worktree' && e.key === 'dir'),
    'dir is a missing nested key under the existing worktree block'
  );
  const out = mergeMissing(proj, V4_DEFAULTS, missing);
  const lines = out.split('\n');
  const wt = lines.slice(lines.indexOf('worktree:'));
  assert.ok(wt.some((l) => /^ {2}dir: \.claude\/worktrees\b/.test(l)), 'dir carried into worktree block');
  assert.ok(wt.some((l) => /^ {2}integrate: merge-commit\b/.test(l)), 'integrate carried into worktree block');
  assert.ok(!wt.some((l) => /^ {2}integrate: rebase-ff\b/.test(l)), 'default did not shadow the legacy value');
});

test('relocationsFor: names only the relocations backed by a legacy project key', () => {
  const proj = [
    'execute:',
    '  integrate: merge-commit   # custom',
  ].join('\n') + '\n';
  const missing = detectMissingKeys(proj, V4_DEFAULTS);
  assert.deepStrictEqual(relocationsFor(proj, missing), [
    'execute.integrate -> worktree.integrate',
  ]);
});

function setupTempV4(projConfigText) {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-proj-'));
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-plugin-'));
  fs.mkdirSync(path.join(pluginRoot, 'defaults'), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, 'defaults', 'config.default.yaml'), V4_DEFAULTS);
  fs.mkdirSync(path.join(projectDir, '.cadence'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, '.cadence', 'config.yaml'), projConfigText);
  return { projectDir, pluginRoot };
}

test('main: 3->4 carries customized values and advises removing the legacy keys', () => {
  const proj = [
    'config_version: 3',
    'execute:',
    '  branch_check: true',
    '  worktree_dir: .claude/worktrees   # custom home',
    '  integrate: merge-commit',
  ].join('\n') + '\n';
  const { projectDir, pluginRoot } = setupTempV4(proj);
  const { logs, warns } = runMain(projectDir, pluginRoot);
  assert.deepStrictEqual(warns, []);
  assert.strictEqual(logs.length, 1);
  assert.match(logs[0], /execute\.worktree_dir -> worktree\.dir/);
  assert.match(logs[0], /execute\.integrate -> worktree\.integrate/);
  assert.match(logs[0], /remove them manually/);
  const after = fs.readFileSync(path.join(projectDir, '.cadence', 'config.yaml'), 'utf8');
  assert.match(after, /^config_version: 4/m);
  assert.match(after, /^ {2}dir: \.claude\/worktrees\b/m);
  assert.match(after, /^ {2}integrate: merge-commit {3}# rebase-ff \| merge-commit \(relocated from execute\.integrate\)$/m);
  // Legacy keys left in place (the migrator never deletes).
  assert.match(after, /^ {2}worktree_dir: \.claude\/worktrees/m);
});

// ---- v4 -> v5 storage block (additive whole-block append) ----

// scripts/migrate-config.js is intentionally NOT modified for the storage
// block: mergeMissing already appends a whole missing top-level block verbatim
// via extractBlock, and the nested notion.* grandchildren ride along because
// they are deeper-indented (not column-0), not because of any per-key logic.
// This test confirms that mechanism for the exact storage block shipped in
// defaults/config.default.yaml (v5).
const STORAGE_BLOCK = [
  'storage:',
  "  backend: filesystem          # filesystem | notion  (default: filesystem, today's behavior)",
  '  notion:',
  '    root_page:  ""             # Notion page URL or id to provision under; share it with the MCP integration',
  '    designs_db: ""             # auto-filled on first Notion-mode run, then commit',
  '    plans_db:   ""             # auto-filled on first Notion-mode run, then commit',
].join('\n');

test('storage: a v4 config migrates to v5 with the storage block appended verbatim (no migrate-config.js change)', () => {
  // Defaults: version + paths + the verbatim storage block, storage last so
  // extractBlock returns it exactly (trailing-blank trim lands on plans_db).
  const def = [
    'config_version: 5          # schema version; drives migration detection',
    'paths:',
    '  designs: docs/designs',
    '  plans:   docs/plans',
    STORAGE_BLOCK,
  ].join('\n') + '\n';
  // Synthetic v4 project config: paths only, no storage block.
  const proj = [
    'config_version: 4',
    'paths:',
    '  designs: docs/designs',
    '  plans:   docs/plans',
  ].join('\n') + '\n';
  // Mirror main(): bump first, detect on the bumped text, then merge.
  let out = bumpOrInsertVersion(proj, 5);
  const missing = detectMissingKeys(out, def);
  // storage is a WHOLE missing top-level block, not per-key nested inserts.
  assert.ok(missing.missingBlocks.includes('storage'), 'storage is a whole missing top-level block');
  assert.ok(
    !missing.missingNested.some((e) => e.block === 'storage'),
    'nested notion.* keys are NOT reported separately; they ride the whole-block append'
  );
  out = mergeMissing(out, def, missing);
  // config_version bumped to 5.
  assert.match(out, /^config_version: 5$/m);
  // The whole storage block (header + backend + nested notion + all three db
  // keys) landed as a contiguous verbatim chunk.
  assert.ok(out.includes(STORAGE_BLOCK), 'storage block appended verbatim, nested notion.* included');
  // Spot-check the nested grandchildren survived the append.
  assert.match(out, /^ {2}notion:$/m);
  assert.match(out, /^ {4}root_page: {2}""/m);
  assert.match(out, /^ {4}designs_db: ""/m);
  assert.match(out, /^ {4}plans_db: {3}""/m);
});
