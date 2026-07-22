'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('./vendor/js-yaml.js');

// Source of truth for team-policy keys; skills/_shared/config-resolution.md
// quotes this list. Entries ending in '.' match the whole subtree.
const TEAM_POLICY_KEYS = [
  'paths.', 'naming.', 'status.', 'frontmatter.', 'plan.', 'audits.', 'oos.',
  'storage.backend',
  'storage.notion.root_page', 'storage.notion.designs_db', 'storage.notion.plans_db',
  'worktree.dir', 'worktree.integrate', 'worktree.merge_lock',
  'worktree.lock_stale_threshold', 'worktree.hooks.',
  'execute.branch_check', 'execute.auto_resolve_drift',
];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
  const out = {};
  for (const k of Object.keys(base)) {
    out[k] = base[k];
  }
  for (const k of Object.keys(over)) {
    if (isPlainObject(out[k]) && isPlainObject(over[k])) {
      out[k] = deepMerge(out[k], over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}

function flattenLeaves(obj, prefix) {
  const out = [];
  for (const k of Object.keys(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(obj[k]) && Object.keys(obj[k]).length > 0) {
      out.push(...flattenLeaves(obj[k], p));
    } else {
      out.push([p, obj[k]]);
    }
  }
  return out;
}

function getPath(obj, dotPath) {
  let cur = obj;
  for (const part of dotPath.split('.')) {
    if (!isPlainObject(cur) || !Object.prototype.hasOwnProperty.call(cur, part)) {
      return { found: false, value: undefined };
    }
    cur = cur[part];
  }
  return { found: true, value: cur };
}

function isTeamPolicyKey(dotPath) {
  return TEAM_POLICY_KEYS.some((entry) =>
    entry.endsWith('.') ? dotPath.startsWith(entry) : dotPath === entry
  );
}

function findConfigDir(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const cadenceDir = path.join(dir, '.cadence');
    if (
      fs.existsSync(path.join(cadenceDir, 'config.yaml')) ||
      fs.existsSync(path.join(cadenceDir, 'config.local.yaml'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function loadYamlFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  let doc;
  try {
    doc = yaml.load(text);
  } catch (err) {
    const e = new Error(
      `failed to parse ${filePath}: ${err.message}. Fix the file; Cadence will not guess at config.`
    );
    e.exitCode = 3;
    throw e;
  }
  if (doc === undefined || doc === null) {
    return {};
  }
  if (!isPlainObject(doc)) {
    const e = new Error(
      `failed to parse ${filePath}: top level must be a mapping. Fix the file; Cadence will not guess at config.`
    );
    e.exitCode = 3;
    throw e;
  }
  return doc;
}

function resolveConfig(cwd) {
  const defaultsPath = path.join(__dirname, '..', 'defaults', 'config.default.yaml');
  if (!fs.existsSync(defaultsPath)) {
    const e = new Error(
      `plugin defaults not found at ${defaultsPath}. The Cadence plugin install is broken or the plugin cache is stale; reinstall or update the Cadence plugin.`
    );
    e.exitCode = 2;
    throw e;
  }
  let merged = loadYamlFile(defaultsPath);
  const root = findConfigDir(cwd);
  const sources = { defaults: defaultsPath, repo: null, local: null };
  let localDoc = null;
  if (root !== null) {
    const repoPath = path.join(root, '.cadence', 'config.yaml');
    const localPath = path.join(root, '.cadence', 'config.local.yaml');
    if (fs.existsSync(repoPath)) {
      sources.repo = repoPath;
      merged = deepMerge(merged, loadYamlFile(repoPath));
    }
    if (fs.existsSync(localPath)) {
      sources.local = localPath;
      localDoc = loadYamlFile(localPath);
      merged = deepMerge(merged, localDoc);
    }
  }
  const teamPolicyOverrides = [];
  if (localDoc !== null) {
    for (const [key, value] of flattenLeaves(localDoc, '')) {
      if (isTeamPolicyKey(key)) {
        teamPolicyOverrides.push({ key, layer: 'local', value });
      }
    }
  }
  let gitignoreMissing = false;
  if (sources.local !== null) {
    const giPath = path.join(root, '.gitignore');
    const lines = fs.existsSync(giPath)
      ? fs.readFileSync(giPath, 'utf8').split('\n').map((l) => l.trim())
      : [];
    gitignoreMissing = !lines.includes('.cadence/config.local.yaml');
  }
  return {
    config: merged,
    root,
    sources,
    team_policy_overrides: teamPolicyOverrides,
    gitignore_missing: gitignoreMissing,
  };
}

const USAGE = 'usage: node resolve-config.js [--key <dot.path>] [--help]';

function formatKeyValue(value) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function main(argv) {
  const args = argv.slice(2);
  let key = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      process.stdout.write(USAGE + '\n');
      return 0;
    }
    if (args[i] === '--key') {
      if (key !== null || i + 1 >= args.length) {
        process.stderr.write(`resolve-config: ${USAGE}\n`);
        return 5;
      }
      key = args[i + 1];
      i += 1;
      continue;
    }
    process.stderr.write(`resolve-config: unknown argument "${args[i]}"\n${USAGE}\n`);
    return 5;
  }
  let resolved;
  try {
    resolved = resolveConfig(process.cwd());
  } catch (err) {
    process.stderr.write(`resolve-config: ${err.message}\n`);
    return err.exitCode === 2 || err.exitCode === 3 ? err.exitCode : 1;
  }
  if (key !== null) {
    const r = getPath(resolved.config, key);
    if (!r.found) {
      process.stderr.write(`resolve-config: no config key at path "${key}"\n`);
      return 4;
    }
    process.stdout.write(formatKeyValue(r.value) + '\n');
    return 0;
  }
  process.stdout.write(JSON.stringify(resolved, null, 2) + '\n');
  return 0;
}

module.exports = {
  TEAM_POLICY_KEYS,
  isPlainObject,
  deepMerge,
  flattenLeaves,
  getPath,
  isTeamPolicyKey,
  findConfigDir,
  loadYamlFile,
  resolveConfig,
  formatKeyValue,
  main,
};

if (require.main === module) {
  process.exit(main(process.argv));
}
