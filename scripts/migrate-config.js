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

module.exports = {
  parseConfigVersion,
};

function main() {
  // Implemented in Task 1.4.
}

if (require.main === module) {
  main();
}
