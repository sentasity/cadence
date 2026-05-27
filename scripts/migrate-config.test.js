'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  parseConfigVersion,
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
