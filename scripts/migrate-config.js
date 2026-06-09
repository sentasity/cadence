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
 * Key relocations applied during migration. Maps a NEW '<block>.<key>' path
 * to the legacy [block, key] it relocates from. When the new key is being
 * inserted (whole-block append or nested insert) and the legacy key exists
 * in the project config, the legacy VALUE is copied into the new key
 * (value-move); the default value is used only when no legacy key exists.
 * The migrator never deletes the legacy keys.
 *
 * Matching is by key name within the named block's lines; the current map
 * has no grandchild key (e.g. under worktree.hooks) that collides with a
 * relocated key name.
 */
const RELOCATIONS = {
  'worktree.dir': ['execute', 'worktree_dir'],
  'worktree.integrate': ['execute', 'integrate'],
};

/**
 * Read the project's VALUE for a child key under a block, with any trailing
 * inline comment stripped and surrounding whitespace trimmed. Returns null
 * if the block or key is absent, or the key has no scalar value text.
 *
 * @param {string} projectText
 * @param {string} block
 * @param {string} key
 * @returns {string | null}
 */
function projectValueOf(projectText, block, key) {
  const lines = splitLines(projectText);
  const span = findBlockSpan(lines, block);
  if (!span) {
    return null;
  }
  for (let i = span.start + 1; i < span.bodyEnd; i++) {
    const m = lines[i].match(/^\s+([A-Za-z0-9_-]+):(.*)$/);
    if (m && m[1] === key) {
      const value = m[2].replace(/\s+#.*$/, '').trim();
      return value === '' ? null : value;
    }
  }
  return null;
}

/**
 * The legacy project value for a new `block.key` path, or null when the
 * path has no relocation or the legacy key is absent.
 *
 * @param {string} projectText
 * @param {string} block
 * @param {string} key
 * @returns {string | null}
 */
function relocatedValueOf(projectText, block, key) {
  const legacy = RELOCATIONS[`${block}.${key}`];
  if (!legacy) {
    return null;
  }
  return projectValueOf(projectText, legacy[0], legacy[1]);
}

/**
 * Rewrite one to-be-inserted `  key: value   # comment` line so the VALUE
 * is the project's legacy value when a relocation applies. The defaults'
 * inline comment is preserved; non-relocated lines pass through untouched.
 *
 * @param {string} line
 * @param {string} block
 * @param {string} projectText
 * @returns {string}
 */
function relocateLine(line, block, projectText) {
  const m = line.match(/^(\s+)([A-Za-z0-9_-]+):(.*)$/);
  if (!m) {
    return line;
  }
  const legacyValue = relocatedValueOf(projectText, block, m[2]);
  if (legacyValue === null) {
    return line;
  }
  const cm = m[3].match(/^\s*([^#]*?)\s*(#.*)?$/);
  const comment = cm && cm[2] ? `   ${cm[2]}` : '';
  return `${m[1]}${m[2]}: ${legacyValue}${comment}`;
}

/**
 * Apply relocations to every child line of a verbatim defaults block before
 * it is appended to the project config.
 *
 * @param {string} blockText
 * @param {string} block
 * @param {string} projectText
 * @returns {string}
 */
function applyRelocationsToBlock(blockText, block, projectText) {
  return blockText
    .split('\n')
    .map((line) => relocateLine(line, block, projectText))
    .join('\n');
}

/**
 * Which relocations will carry a legacy project value during this
 * migration. Returns entries like 'execute.integrate -> worktree.integrate'
 * for every RELOCATIONS path that (a) is about to be inserted per `missing`
 * and (b) has its legacy key present in the project. Used for the
 * migration notice.
 *
 * @param {string} projectText
 * @param {{ missingBlocks: string[], missingNested: Array<{block: string, key: string}> }} missing
 * @returns {string[]}
 */
function relocationsFor(projectText, missing) {
  const missingPaths = new Set();
  for (const block of missing.missingBlocks) {
    for (const newPath of Object.keys(RELOCATIONS)) {
      if (newPath.startsWith(`${block}.`)) {
        missingPaths.add(newPath);
      }
    }
  }
  for (const { block, key } of missing.missingNested) {
    missingPaths.add(`${block}.${key}`);
  }
  const applied = [];
  for (const newPath of Object.keys(RELOCATIONS)) {
    if (!missingPaths.has(newPath)) {
      continue;
    }
    const [legacyBlock, legacyKey] = RELOCATIONS[newPath];
    if (projectValueOf(projectText, legacyBlock, legacyKey) !== null) {
      applied.push(`${legacyBlock}.${legacyKey} -> ${newPath}`);
    }
  }
  return applied;
}

/**
 * Additive text merge. Inserts missing nested keys inside their existing
 * blocks (at the block's child indentation, with the default value) and
 * appends whole missing top-level blocks verbatim at EOF (single blank-line
 * separated). Never reorders or rewrites existing lines.
 *
 * Relocated keys (RELOCATIONS) are the one exception to "default value":
 * when the project still carries the legacy key, its value is copied into
 * the inserted new key (value-move), on both insert paths.
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
    const newLines = byBlock[block].map((key) =>
      relocateLine(
        `${indent}${key}:${defaultValueOf(defaultsText, block, key)}`,
        block,
        projectText
      )
    );
    lines = lines
      .slice(0, span.bodyEnd)
      .concat(newLines)
      .concat(lines.slice(span.bodyEnd));
  }

  // 2. Whole blocks: append at EOF, single blank-line separated, with
  //    relocated child values copied from the project's legacy keys.
  let text = lines.join('\n');
  for (const block of missing.missingBlocks) {
    const blockText = applyRelocationsToBlock(
      extractBlock(defaultsText, block),
      block,
      projectText
    );
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
  projectValueOf,
  relocationsFor,
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

  if (!fs.existsSync(defaultsPath)) {
    console.warn('Cadence: skipped config migration (plugin defaults not found)');
    return;
  }

  let proj, def;
  try {
    proj = fs.readFileSync(projectPath, 'utf8');
    def = fs.readFileSync(defaultsPath, 'utf8');
  } catch (err) {
    console.warn('Cadence: skipped config migration (could not read config files)');
    return;
  }

  const projVer = parseConfigVersion(proj);
  const defVer = parseConfigVersion(def);
  if (projVer >= defVer) {
    return; // Already current.
  }

  let merged;
  let missing;
  let relocated = [];
  try {
    assertParseable(proj);
    merged = bumpOrInsertVersion(proj, defVer);
    missing = detectMissingKeys(merged, def);
    relocated = relocationsFor(merged, missing);
    merged = mergeMissing(merged, def, missing);
  } catch (err) {
    console.warn(
      'Cadence: skipped config migration (could not safely parse .cadence/config.yaml)'
    );
    return;
  }

  try {
    fs.writeFileSync(projectPath, merged);
  } catch (err) {
    console.warn('Cadence: skipped config migration (could not write .cadence/config.yaml)');
    return;
  }

  const added = [];
  for (const block of missing.missingBlocks) {
    added.push(block);
  }
  for (const { block, key } of missing.missingNested) {
    added.push(`${block}.${key}`);
  }
  let notice = `Cadence config migrated to v${defVer}: added ${added.join(', ')} (defaults). Edit .cadence/config.yaml to tune.`;
  if (relocated.length > 0) {
    notice += ` Carried over ${relocated.join(', ')}. The legacy keys are no longer read now that worktree: carries their values; you can remove them manually.`;
  }
  console.log(notice);
}

if (require.main === module) {
  main();
}
