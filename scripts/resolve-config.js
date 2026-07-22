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

module.exports = {
  TEAM_POLICY_KEYS,
  isPlainObject,
  deepMerge,
  flattenLeaves,
  getPath,
  isTeamPolicyKey,
};
