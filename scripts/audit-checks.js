'use strict';

// The completion audit's mechanical checks, run as one script instead of one
// sub-agent each: checkbox-completeness, code-behind-checkbox,
// deferred-comment-scan, file-map-honesty, and merge-integrity.
//
// usage: node audit-checks.js --plan <plan-dir> --base <sha> [--repo <dir>] [--checks a,b]
//
// <plan-dir> is a plan folder on disk: the filesystem backend's plan folder,
// or the plan/ folder of a notion-read.js export. Docs are found by content,
// not file name: tasks are `### Task N.M` blocks in any .md file, the overview
// is the file with a `## File Map` section, and the plan-side out-of-scope doc
// is the file whose name contains `out-of-scope`.
//
// Prints one JSON object: { checks: { <name>: { status, findings: [{ where, message }] } } }.
// status is pass | fail | warn. Exit 0 when the checks ran (whatever they
// found), 2 on a usage error, 1 when git or the plan folder can't be read.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ALL_CHECKS = [
  'checkbox-completeness',
  'code-behind-checkbox',
  'deferred-comment-scan',
  'file-map-honesty',
  'merge-integrity',
];
const DEFERRAL = /TODO|FIXME|XXX|\/\/ will|\/\/ later|# stub/i;
const SYMBOL_DEF = /\b(?:def|class|function|func|fn|interface|type|struct|enum)\s+([A-Za-z_]\w*)/g;
const CHECKBOX = /^\s*- \[([ xX])\]\s*(.*)$/;
const TRAILER = 'Cadence-Task';

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function readPlan(planDir) {
  const files = fs
    .readdirSync(planDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((name) => ({ name, lines: fs.readFileSync(path.join(planDir, name), 'utf8').split('\n') }));
  const tasks = [];
  for (const file of files) {
    let task = null;
    file.lines.forEach((line, i) => {
      const head = line.match(/^###\s+Task\s+(\d+\.\d+)/);
      if (head) {
        task = { id: head[1], file: file.name, touches: [], produces: [], steps: [], inCode: false };
        tasks.push(task);
        return;
      }
      if (/^#{1,3}\s/.test(line)) {
        task = null;
        return;
      }
      if (!task) {
        return;
      }
      const field = line.match(/^\*\*(Touches|Files):\*\*\s*(.*)$/);
      if (field) {
        task.touches.push(...backticked(field[2]).filter(looksLikePath));
        return;
      }
      if (/^\s*-\s*Produces:/.test(line) && task.steps.length === 0) {
        task.produces.push(...signatureNames(line));
        return;
      }
      if (/^\s*```/.test(line)) {
        task.inCode = !task.inCode;
        return;
      }
      const box = line.match(CHECKBOX);
      if (box && !task.inCode) {
        task.steps.push({ checked: box[1] !== ' ', text: box[2], where: `${file.name}:${i + 1}`, code: [] });
        return;
      }
      const step = task.steps[task.steps.length - 1];
      if (step) {
        step.code.push(line);
      }
    });
  }
  const overview = files.find((f) => f.lines.some((l) => /^##\s+File Map/.test(l)));
  const oos = files.find((f) => /out-of-scope/.test(f.name));
  return { tasks, overview, oosText: oos ? oos.lines.join('\n') : '' };
}

function backticked(text) {
  return [...String(text).matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

function looksLikePath(token) {
  return /[\/.]/.test(token) && !/\s/.test(token) && !/\(/.test(token);
}

function signatureNames(line) {
  return backticked(line)
    .map((sig) => sig.match(/^([A-Za-z_]\w*)\s*\(/))
    .filter(Boolean)
    .map((m) => m[1]);
}

// Symbols a ticked step claims to create: definitions in its code and names
// in "Implement `name(...)`" titles. A task's `Produces:` signatures are
// claimed once all of its steps are ticked.
function claimedSymbols(step) {
  const names = new Set();
  const body = [step.text, ...step.code].join('\n');
  for (const m of body.matchAll(SYMBOL_DEF)) {
    names.add(m[1]);
  }
  const impl = step.text.match(/Implement\s+`([A-Za-z_]\w*)/);
  if (impl) {
    names.add(impl[1]);
  }
  return [...names];
}

// Added lines of the diff, with file and new-side line number.
function addedLines(repo, base) {
  const out = git(repo, ['diff', '--unified=0', '--no-color', `${base}..HEAD`]);
  const added = [];
  let file = null;
  let lineNo = 0;
  for (const line of out.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.replace(/^\+\+\+ b\//, '');
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNo = parseInt(hunk[1], 10);
      continue;
    }
    if (file && line.startsWith('+')) {
      added.push({ file, line: lineNo, text: line.slice(1) });
      lineNo += 1;
    }
  }
  return added;
}

function planPathInRepo(repo, planDir) {
  const rel = path.relative(fs.realpathSync(repo), fs.realpathSync(planDir));
  return rel.startsWith('..') || path.isAbsolute(rel) ? null : rel.split(path.sep).join('/');
}

function result(findings, failStatus) {
  return { status: findings.length ? failStatus : 'pass', findings };
}

function checkboxCompleteness(plan) {
  const findings = [];
  for (const task of plan.tasks) {
    for (const step of task.steps) {
      if (!step.checked) {
        findings.push({ where: step.where, message: `Task ${task.id}: step not checked off: ${step.text}` });
      }
    }
  }
  if (plan.tasks.length === 0) {
    findings.push({ where: '(plan)', message: 'no `### Task N.M` blocks found in the plan folder' });
  }
  return result(findings, 'fail');
}

function codeBehindCheckbox(plan, added) {
  const text = added.map((a) => a.text).join('\n');
  const findings = [];
  const missing = (name) => !new RegExp(`\\b${name}\\b`).test(text);
  for (const task of plan.tasks) {
    for (const step of task.steps.filter((s) => s.checked)) {
      for (const name of claimedSymbols(step).filter(missing)) {
        findings.push({ where: step.where, message: `Task ${task.id} claims \`${name}\`, not in the diff` });
      }
    }
    if (task.steps.length && task.steps.every((s) => s.checked)) {
      for (const name of task.produces.filter(missing)) {
        findings.push({ where: task.steps[0].where, message: `Task ${task.id} produces \`${name}\`, not in the diff` });
      }
    }
  }
  return result(findings, 'fail');
}

function deferredCommentScan(plan, added, planRel) {
  const findings = [];
  for (const a of added) {
    if (planRel && (a.file === planRel || a.file.startsWith(`${planRel}/`))) {
      continue;
    }
    if (!DEFERRAL.test(a.text)) {
      continue;
    }
    const justified = /99-out-of-scope/.test(a.text) || (plan.oosText && plan.oosText.includes(a.file));
    if (!justified) {
      findings.push({ where: `${a.file}:${a.line}`, message: `unjustified deferral comment: ${a.text.trim()}` });
    }
  }
  return result(findings, 'fail');
}

function fileMapHonesty(plan, repo, base, planRel) {
  if (!plan.overview) {
    return { status: 'warn', findings: [{ where: '(plan)', message: 'no `## File Map` section found' }] };
  }
  const lines = plan.overview.lines;
  const start = lines.findIndex((l) => /^##\s+File Map/.test(l));
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  end = end === -1 ? lines.length : end;
  const mapped = new Set();
  for (const line of lines.slice(start + 1, end)) {
    for (const token of backticked(line).filter(looksLikePath)) {
      mapped.add(token);
    }
    const bare = line.match(/^\s*[-*]\s+([^\s`|]+\.[A-Za-z0-9]+)\b/);
    if (bare) {
      mapped.add(bare[1]);
    }
  }
  const changed = git(repo, ['diff', '--name-only', `${base}..HEAD`])
    .split('\n')
    .filter(Boolean)
    .filter((f) => !(planRel && f.startsWith(`${planRel}/`)));
  const findings = [];
  for (const f of changed) {
    if (!mapped.has(f)) {
      findings.push({ where: f, message: `File ${f} in diff but not in File Map` });
    }
  }
  for (const f of mapped) {
    if (!changed.includes(f)) {
      findings.push({ where: plan.overview.name, message: `File ${f} in File Map but not in diff` });
    }
  }
  return result(findings, 'warn');
}

function mergeIntegrity(plan, repo, base, added, planRel) {
  const findings = [];
  const worktrees = git(repo, ['worktree', 'list', '--porcelain']);
  for (const m of worktrees.matchAll(/^branch refs\/heads\/(cadence\/lane-\S+)$/gm)) {
    findings.push({ where: m[1], message: `leftover lane worktree on ${m[1]}` });
  }
  for (const b of git(repo, ['branch', '--list', 'cadence/lane-*', '--format=%(refname:short)']).split('\n').filter(Boolean)) {
    findings.push({ where: b, message: `leftover lane branch ${b}` });
  }
  const markerFiles = new Set(added.filter((a) => /^(<{7}|>{7}) /.test(a.text)).map((a) => a.file));
  for (const a of added) {
    if (/^(<{7}|>{7}) /.test(a.text) || (a.text === '=======' && markerFiles.has(a.file))) {
      findings.push({ where: `${a.file}:${a.line}`, message: 'conflict marker in the diff' });
    }
  }
  const dirty = git(repo, ['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))
    .filter((f) => !(planRel && f.startsWith(`${planRel}/`)) && !f.startsWith('.cadence/'));
  for (const f of dirty) {
    findings.push({ where: f, message: 'uncommitted change in the working tree' });
  }
  const touches = new Set(plan.tasks.flatMap((t) => t.touches));
  const log = git(repo, ['log', '--format=%H%x00%s%x00%(trailers:key=' + TRAILER + ',valueonly)%x01', `${base}..HEAD`]);
  for (const entry of log.split('\x01').map((e) => e.trim()).filter(Boolean)) {
    const [sha, subject, trailer] = entry.split('\x00');
    if ((trailer && trailer.trim()) || /^fix\(review\)/.test(subject)) {
      continue;
    }
    const files = git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean);
    const outside = files.filter((f) => !touches.has(f) && !(planRel && f.startsWith(`${planRel}/`)));
    if (outside.length) {
      findings.push({ where: sha.slice(0, 7), message: `stray commit "${subject}" touches ${outside.join(', ')}, which no task lists` });
    }
  }
  return result(findings, 'fail');
}

function runChecks({ planDir, base, repo, checks = ALL_CHECKS }) {
  const plan = readPlan(planDir);
  const added = addedLines(repo, base);
  const planRel = planPathInRepo(repo, planDir);
  const run = {
    'checkbox-completeness': () => checkboxCompleteness(plan),
    'code-behind-checkbox': () => codeBehindCheckbox(plan, added),
    'deferred-comment-scan': () => deferredCommentScan(plan, added, planRel),
    'file-map-honesty': () => fileMapHonesty(plan, repo, base, planRel),
    'merge-integrity': () => mergeIntegrity(plan, repo, base, added, planRel),
  };
  const out = {};
  for (const name of checks) {
    out[name] = run[name]();
  }
  return { checks: out };
}

function parseArgs(argv) {
  const args = { repo: process.cwd(), checks: ALL_CHECKS };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) {
      return null;
    }
    if (flag === '--plan') args.planDir = value;
    else if (flag === '--base') args.base = value;
    else if (flag === '--repo') args.repo = value;
    else if (flag === '--checks') args.checks = value.split(',').map((c) => c.trim());
    else return null;
  }
  if (!args.planDir || !args.base || args.checks.some((c) => !ALL_CHECKS.includes(c))) {
    return null;
  }
  return args;
}

module.exports = { readPlan, claimedSymbols, addedLines, runChecks, parseArgs, ALL_CHECKS };

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error(`usage: node audit-checks.js --plan <plan-dir> --base <sha> [--repo <dir>] [--checks ${ALL_CHECKS.join(',')}]`);
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(runChecks(args), null, 2));
  } catch (err) {
    console.error(`audit-checks: ${err.message}`);
    process.exit(1);
  }
}
