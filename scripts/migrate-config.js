'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Scan for a top-level (column 0) `config_version: <int>` line.
 * Returns the integer, or 1 when absent.
 * @param {string} text
 * @returns {number}
 */
function parseConfigVersion(text) {
  const lines = String(text).split('\n');
  for (const line of lines) {
    const m = line.match(/^config_version:\s*(\d+)\s*(?:#.*)?$/);
    if (m) {
      return parseInt(m[1], 10);
    }
  }
  return 1;
}

/**
 * Parse YAML-ish text into an ordered list of top-level blocks, each with the
 * set of its DIRECT child key names (children at exactly one indent step
 * deeper than the block header). Comments, blanks, list items, and
 * grandchildren are ignored for the purpose of key-presence comparison.
 *
 * A top-level key is a line matching /^([A-Za-z0-9_-]+):/ at column 0.
 * A direct child key is an indented line (leading whitespace > 0) matching
 * /^(\s+)([A-Za-z0-9_-]+):/ whose indentation equals the block's first-seen
 * child indentation.
 *
 * @param {string} text
 * @returns {{ order: string[], children: Object<string, {childOrder: string[], childIndent: string}> }}
 */
function parseTopLevelStructure(text) {
  const lines = String(text).split('\n');
  const order = [];
  const children = {};
  let currentBlock = null;
  for (const line of lines) {
    if (line.trim() === '' || /^\s*#/.test(line)) {
      continue;
    }
    const top = line.match(/^([A-Za-z0-9_-]+):/);
    if (top) {
      currentBlock = top[1];
      if (!Object.prototype.hasOwnProperty.call(children, currentBlock)) {
        order.push(currentBlock);
        children[currentBlock] = { childOrder: [], childIndent: null };
      }
      continue;
    }
    if (currentBlock === null) {
      continue;
    }
    const child = line.match(/^(\s+)([A-Za-z0-9_-]+):/);
    if (!child) {
      continue;
    }
    const indent = child[1];
    const key = child[2];
    const entry = children[currentBlock];
    if (entry.childIndent === null) {
      entry.childIndent = indent;
    }
    // Only count DIRECT children (same indentation as the first child seen).
    if (indent === entry.childIndent && !entry.childOrder.includes(key)) {
      entry.childOrder.push(key);
    }
  }
  return { order, children };
}

/**
 * Structural diff by key path. Returns blocks present in defaults but absent
 * in project, and child keys present under a shared block in defaults but
 * absent under that block in project. Comparison is by key presence only.
 *
 * @param {string} projectText
 * @param {string} defaultsText
 * @returns {{ missingBlocks: string[], missingNested: Array<{block: string, key: string}> }}
 */
function detectMissingKeys(projectText, defaultsText) {
  const proj = parseTopLevelStructure(projectText);
  const def = parseTopLevelStructure(defaultsText);
  const missingBlocks = [];
  const missingNested = [];
  for (const block of def.order) {
    if (!Object.prototype.hasOwnProperty.call(proj.children, block)) {
      missingBlocks.push(block);
      continue;
    }
    const projChildren = proj.children[block].childOrder;
    for (const key of def.children[block].childOrder) {
      if (!projChildren.includes(key)) {
        missingNested.push({ block, key });
      }
    }
  }
  return { missingBlocks, missingNested };
}

module.exports = {
  parseConfigVersion,
  parseTopLevelStructure,
  detectMissingKeys,
};

function main() {
  // Implemented in Task 1.4.
}

if (require.main === module) {
  main();
}
