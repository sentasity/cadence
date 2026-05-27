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

/**
 * Return the array of raw lines (no trailing newline) for `text`.
 * @param {string} text
 * @returns {string[]}
 */
function splitLines(text) {
  return String(text).split('\n');
}

/**
 * Find the [startIdx, endIdx) span of a top-level block header `block:` in
 * `lines`. startIdx is the index of the header line; endIdx is the index of
 * the next column-0 key line (or lines.length). Returns null if not found.
 *
 * Trailing blank lines immediately before the next top-level key are excluded
 * from the block body by returning `bodyEnd` = index after the last non-blank
 * line of the block.
 *
 * @param {string[]} lines
 * @param {string} block
 * @returns {{ start: number, bodyEnd: number, end: number } | null}
 */
function findBlockSpan(lines, block) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z0-9_-]+):/);
    if (m && m[1] === block) {
      start = i;
      break;
    }
  }
  if (start === -1) {
    return null;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[A-Za-z0-9_-]+:/.test(lines[i])) {
      end = i;
      break;
    }
  }
  let bodyEnd = end;
  while (bodyEnd > start + 1 && lines[bodyEnd - 1].trim() === '') {
    bodyEnd -= 1;
  }
  return { start, bodyEnd, end };
}

/**
 * Extract the verbatim block text (header + all lines until the next column-0
 * key or EOF), trimming trailing blank lines. Returns a string with no
 * trailing newline.
 *
 * @param {string} defaultsText
 * @param {string} block
 * @returns {string}
 */
function extractBlock(defaultsText, block) {
  const lines = splitLines(defaultsText);
  const span = findBlockSpan(lines, block);
  if (!span) {
    throw new Error(`block not found in defaults: ${block}`);
  }
  return lines.slice(span.start, span.bodyEnd).join('\n');
}

/**
 * Determine the child indentation string used inside a block in defaults
 * (the leading whitespace of the first direct child key line). Falls back to
 * two spaces if no child key is found.
 *
 * @param {string} defaultsText
 * @param {string} block
 * @returns {string}
 */
function childIndentOf(defaultsText, block) {
  const lines = splitLines(defaultsText);
  const span = findBlockSpan(lines, block);
  if (!span) {
    return '  ';
  }
  for (let i = span.start + 1; i < span.bodyEnd; i++) {
    const m = lines[i].match(/^(\s+)[A-Za-z0-9_-]+:/);
    if (m) {
      return m[1];
    }
  }
  return '  ';
}

/**
 * Read the default VALUE text for a child key under a block in defaults.
 * Returns the substring after `key:` (everything after the first colon),
 * including any inline value but NOT the key itself. Trailing inline comments
 * are preserved as written. Returns empty string if the key has no inline
 * value (e.g. a nested mapping header).
 *
 * @param {string} defaultsText
 * @param {string} block
 * @param {string} key
 * @returns {string}
 */
function defaultValueOf(defaultsText, block, key) {
  const lines = splitLines(defaultsText);
  const span = findBlockSpan(lines, block);
  if (!span) {
    throw new Error(`block not found in defaults: ${block}`);
  }
  for (let i = span.start + 1; i < span.bodyEnd; i++) {
    const m = lines[i].match(/^\s+([A-Za-z0-9_-]+):(.*)$/);
    if (m && m[1] === key) {
      return m[2];
    }
  }
  throw new Error(`key not found in defaults: ${block}.${key}`);
}

/**
 * Additive text merge. Inserts missing nested keys inside their existing
 * blocks (at the block's child indentation, with the default value) and
 * appends whole missing top-level blocks verbatim at EOF (single blank-line
 * separated). Never reorders or rewrites existing lines.
 *
 * @param {string} projectText
 * @param {string} defaultsText
 * @param {{ missingBlocks: string[], missingNested: Array<{block: string, key: string}> }} missing
 * @returns {string}
 */
function mergeMissing(projectText, defaultsText, missing) {
  let lines = splitLines(projectText);

  // 1. Nested keys: group by block, insert before each block's bodyEnd.
  //    Process so that earlier insertions don't invalidate later spans by
  //    re-resolving the span for each block right before inserting.
  const byBlock = {};
  for (const { block, key } of missing.missingNested) {
    if (!byBlock[block]) {
      byBlock[block] = [];
    }
    byBlock[block].push(key);
  }
  for (const block of Object.keys(byBlock)) {
    const indent = childIndentOf(defaultsText, block);
    const span = findBlockSpan(lines, block);
    if (!span) {
      // Block not present in project (shouldn't happen for missingNested),
      // skip defensively.
      continue;
    }
    const newLines = byBlock[block].map(
      (key) => `${indent}${key}:${defaultValueOf(defaultsText, block, key)}`
    );
    lines = lines
      .slice(0, span.bodyEnd)
      .concat(newLines)
      .concat(lines.slice(span.bodyEnd));
  }

  // 2. Whole blocks: append at EOF, single blank-line separated.
  let text = lines.join('\n');
  for (const block of missing.missingBlocks) {
    const blockText = extractBlock(defaultsText, block);
    // Ensure the existing text ends with exactly one newline, then one blank
    // line, then the block.
    text = text.replace(/\n*$/, '\n');
    text = `${text}\n${blockText}\n`;
  }

  return text;
}

/**
 * Replace an existing top-level `config_version:` line's number with `target`
 * (preserving any inline comment), or insert `config_version: <target>` as a
 * top-level line after any leading comment block.
 *
 * @param {string} text
 * @param {number} target
 * @returns {string}
 */
function bumpOrInsertVersion(text, target) {
  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^config_version:\s*\d+(\s*(?:#.*)?)$/);
    if (m) {
      lines[i] = `config_version: ${target}${m[1]}`;
      return lines.join('\n');
    }
  }
  // Not present: find insertion point after a leading comment/blank block.
  let insertAt = 0;
  while (insertAt < lines.length && (/^\s*#/.test(lines[insertAt]) || lines[insertAt].trim() === '')) {
    insertAt += 1;
  }
  lines.splice(insertAt, 0, `config_version: ${target}`);
  return lines.join('\n');
}

/**
 * Throw if the text cannot be safely reasoned about as space-indented
 * YAML-ish config. Rejects tab characters in leading whitespace. This is a
 * conservative guard: when in doubt, the caller treats a throw as
 * "unparseable" and skips the migration without writing.
 *
 * @param {string} text
 * @returns {void}
 */
function assertParseable(text) {
  const lines = splitLines(text);
  for (const line of lines) {
    const lead = line.match(/^([ \t]*)/)[1];
    if (lead.includes('\t')) {
      throw new Error('tab indentation is not supported');
    }
  }
}

module.exports = {
  parseConfigVersion,
  parseTopLevelStructure,
  detectMissingKeys,
  findBlockSpan,
  extractBlock,
  mergeMissing,
  bumpOrInsertVersion,
  assertParseable,
  main,
};

function main() {
  const projectRoot = process.env.CLAUDE_PROJECT_DIR;
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!projectRoot || !pluginRoot) {
    return;
  }
  const projectPath = path.join(projectRoot, '.cadence', 'config.yaml');
  const defaultsPath = path.join(pluginRoot, 'defaults', 'config.default.yaml');

  if (!fs.existsSync(projectPath)) {
    return; // Cadence not in use here; do nothing.
  }

  const proj = fs.readFileSync(projectPath, 'utf8');
  const def = fs.readFileSync(defaultsPath, 'utf8');

  const projVer = parseConfigVersion(proj);
  const defVer = parseConfigVersion(def);
  if (projVer >= defVer) {
    return; // Already current.
  }

  let merged;
  let missing;
  try {
    assertParseable(proj);
    merged = bumpOrInsertVersion(proj, defVer);
    missing = detectMissingKeys(merged, def);
    merged = mergeMissing(merged, def, missing);
  } catch (err) {
    console.warn(
      'Cadence: skipped config migration (could not safely parse .cadence/config.yaml)'
    );
    return;
  }

  fs.writeFileSync(projectPath, merged);

  const added = [];
  for (const block of missing.missingBlocks) {
    added.push(block);
  }
  for (const { block, key } of missing.missingNested) {
    added.push(`${block}.${key}`);
  }
  console.log(
    `Cadence config migrated to v${defVer}: added ${added.join(', ')} (defaults). Edit .cadence/config.yaml to tune.`
  );
}

if (require.main === module) {
  main();
}
