'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readPlan, claimedSymbols, runChecks, parseArgs } = require('./audit-checks.js');

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
};

function git(repo, ...args) {
  return execFileSync('git', args, { cwd: repo, env: ENV, encoding: 'utf8' }).trim();
}

const OVERVIEW = [
  '# Plan',
  '',
  '## File Map',
  '',
  '- `src/retry.py`: new retry budget',
  '- `tests/test_retry.py`: its tests',
  '',
  '## Review Focus',
  '',
  'None found.',
].join('\n');

function phase(box) {
  return [
    '### Task 1.1: Retry budget',
    '',
    '**Reads:** []',
    '**Touches:** [`src/retry.py`, `tests/test_retry.py`]',
    '**Depends:** []',
    '**Interfaces:**',
    '- Consumes: none',
    '- Produces: `retry_budget(cfg: dict) -> int`',
    '',
    `- [${box}] **Step 1: Write failing test** in \`tests/test_retry.py\``,
    '  ```python',
    '  def test_default():',
    '      assert retry_budget({}) == 3',
    '  ```',
    `- [${box}] **Step 2: Implement \`retry_budget(cfg: dict) -> int\` in \`src/retry.py\`**`,
    `- [${box}] **Step 3: Commit**`,
  ].join('\n');
}

// A repo whose base commit is empty, with a plan folder outside the repo and
// the task's work committed with a Cadence-Task trailer.
function setup({ box = 'x', code = 'def retry_budget(cfg):\n    return cfg.get("n", 3)\n' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-audit-'));
  const repo = path.join(root, 'repo');
  const planDir = path.join(root, 'plan');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'tests'));
  fs.mkdirSync(planDir);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(repo, 'src', 'retry.py'), code);
  fs.writeFileSync(path.join(repo, 'tests', 'test_retry.py'), 'def test_default():\n    assert retry_budget({}) == 3\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'feat: retry budget', '-m', 'Cadence-Task: 1.1');
  fs.writeFileSync(path.join(planDir, '00-overview.md'), OVERVIEW);
  fs.writeFileSync(path.join(planDir, '01-retry.md'), phase(box));
  fs.writeFileSync(path.join(planDir, '99-out-of-scope.md'), '# Out of scope\n\n(No entries yet.)\n');
  return { repo, planDir, base };
}

function run(ctx, checks) {
  return runChecks({ planDir: ctx.planDir, base: ctx.base, repo: ctx.repo, checks: checks || undefined }).checks;
}

test('readPlan: finds tasks, Touches, Produces, and steps by content', () => {
  const ctx = setup();
  const plan = readPlan(ctx.planDir);
  assert.strictEqual(plan.tasks.length, 1);
  assert.deepStrictEqual(plan.tasks[0].touches, ['src/retry.py', 'tests/test_retry.py']);
  assert.deepStrictEqual(plan.tasks[0].produces, ['retry_budget']);
  assert.strictEqual(plan.tasks[0].steps.length, 3);
  assert.strictEqual(plan.overview.name, '00-overview.md');
});

test('claimedSymbols: code definitions and Implement titles', () => {
  const step = { text: '**Step 3: Implement `parse_x(a: int)`**', code: ['def helper():', 'class Thing:'] };
  assert.deepStrictEqual(claimedSymbols(step).sort(), ['Thing', 'helper', 'parse_x']);
});

test('a clean, fully ticked plan passes every check', () => {
  const ctx = setup();
  const checks = run(ctx, ['checkbox-completeness', 'code-behind-checkbox', 'deferred-comment-scan', 'file-map-honesty', 'merge-integrity']);
  for (const [name, r] of Object.entries(checks)) {
    assert.strictEqual(r.status, 'pass', `${name}: ${JSON.stringify(r.findings)}`);
  }
});

test('checkbox-completeness fails on an unticked step and cites it', () => {
  const ctx = setup({ box: ' ' });
  const r = run(ctx, ['checkbox-completeness'])['checkbox-completeness'];
  assert.strictEqual(r.status, 'fail');
  assert.strictEqual(r.findings.length, 3);
  assert.match(r.findings[0].where, /^01-retry\.md:\d+$/);
});

test('code-behind-checkbox fails when a ticked step claims a symbol the diff lacks', () => {
  const ctx = setup({ code: 'def other(cfg):\n    return 3\n' });
  fs.writeFileSync(path.join(ctx.repo, 'tests', 'test_retry.py'), 'def test_default():\n    assert True\n');
  git(ctx.repo, 'commit', '-qam', 'fix(review): drop call');
  const r = run(ctx, ['code-behind-checkbox'])['code-behind-checkbox'];
  assert.strictEqual(r.status, 'fail');
  assert.ok(r.findings.some((f) => /retry_budget/.test(f.message)));
});

test('deferred-comment-scan fails on a new TODO and passes when it points at the OOS doc', () => {
  const ctx = setup({ code: 'def retry_budget(cfg):\n    # TODO handle jitter\n    return 3\n' });
  let r = run(ctx, ['deferred-comment-scan'])['deferred-comment-scan'];
  assert.strictEqual(r.status, 'fail');
  assert.match(r.findings[0].where, /^src\/retry\.py:2$/);
  fs.writeFileSync(path.join(ctx.repo, 'src', 'retry.py'), 'def retry_budget(cfg):\n    # deferred, see plan/99-out-of-scope#1 (TODO jitter)\n    return 3\n');
  git(ctx.repo, 'commit', '-qam', 'fix(review): point at OOS');
  r = run(ctx, ['deferred-comment-scan'])['deferred-comment-scan'];
  assert.strictEqual(r.status, 'pass');
});

test('file-map-honesty warns both ways', () => {
  const ctx = setup();
  fs.writeFileSync(path.join(ctx.repo, 'README.md'), 'hi\n');
  git(ctx.repo, 'add', '.');
  git(ctx.repo, 'commit', '-q', '-m', 'docs', '-m', 'Cadence-Task: 1.1');
  fs.writeFileSync(path.join(ctx.planDir, '00-overview.md'), OVERVIEW.replace('- `tests/test_retry.py`: its tests', '- `tests/test_retry.py`: its tests\n- `src/ghost.py`: never written'));
  const r = run(ctx, ['file-map-honesty'])['file-map-honesty'];
  assert.strictEqual(r.status, 'warn');
  const messages = r.findings.map((f) => f.message).join('\n');
  assert.match(messages, /README\.md in diff but not in File Map/);
  assert.match(messages, /src\/ghost\.py in File Map but not in diff/);
});

test('merge-integrity fails on a leftover lane branch, a stray commit, and dirty files', () => {
  const ctx = setup();
  git(ctx.repo, 'branch', 'cadence/lane-1');
  fs.writeFileSync(path.join(ctx.repo, 'stray.txt'), 'x\n');
  git(ctx.repo, 'add', '.');
  git(ctx.repo, 'commit', '-q', '-m', 'wip');
  fs.writeFileSync(path.join(ctx.repo, 'src', 'retry.py'), 'changed\n');
  const r = run(ctx, ['merge-integrity'])['merge-integrity'];
  assert.strictEqual(r.status, 'fail');
  const messages = r.findings.map((f) => f.message).join('\n');
  assert.match(messages, /leftover lane branch cadence\/lane-1/);
  assert.match(messages, /stray commit "wip" touches stray\.txt/);
  assert.match(messages, /uncommitted change/);
});

test('merge-integrity flags conflict markers but not a lone setext underline', () => {
  const ctx = setup();
  fs.writeFileSync(path.join(ctx.repo, 'src', 'retry.py'), 'def retry_budget(cfg):\n<<<<<<< HEAD\n    return 3\n=======\n    return 4\n>>>>>>> lane\n');
  fs.writeFileSync(path.join(ctx.repo, 'tests', 'test_retry.py'), 'Title\n=======\n');
  git(ctx.repo, 'commit', '-qam', 'fix(review): merge');
  const r = run(ctx, ['merge-integrity'])['merge-integrity'];
  const where = r.findings.map((f) => f.where);
  assert.deepStrictEqual(where.sort(), ['src/retry.py:2', 'src/retry.py:4', 'src/retry.py:6']);
});

test('parseArgs: requires --plan and --base, rejects unknown checks', () => {
  assert.strictEqual(parseArgs(['--plan', 'p']), null);
  assert.strictEqual(parseArgs(['--plan', 'p', '--base', 'abc', '--checks', 'nope']), null);
  assert.deepStrictEqual(parseArgs(['--plan', 'p', '--base', 'abc', '--checks', 'merge-integrity']).checks, ['merge-integrity']);
});
