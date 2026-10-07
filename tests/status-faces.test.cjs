const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const faces = require('../status-faces.js');

const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const presets = app.match(/const STATUS_PRESETS = \[([\s\S]*?)\];/)[1];
const keys = [...presets.matchAll(/emoji: '([^']+)'/g)].map(match => faces.key(match[1]));
const groups = [...presets.matchAll(/group: '([^']+)'/g)].map(match => match[1]);

test('every selectable status has one readable face and retains its saved emoji key', () => {
  assert.equal(keys.length, 20);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(new Set(Object.keys(faces.FACES).filter(key => key !== '🚗')), new Set(keys));
  assert.equal(faces.has('🚗'), true, 'previously saved On my way statuses still render');
  for (const emoji of keys) {
    const svg = faces.html(emoji);
    assert.match(svg, /^<svg class="cc-status-face" viewBox="0 0 64 64"/);
    assert.match(svg, /<path d="M/);
    assert.match(svg, /stroke-linecap="round"/);
    assert.equal(faces.has(emoji), true);
  }
  assert.equal(faces.html('🦄'), '');
  assert.equal(faces.has('🦄'), false);
  assert.equal(faces.key('✈️'), '✈');
});

test('status picker has four clear groups and every choice belongs to exactly one', () => {
  const groupIds = [...app.matchAll(/\{ id: '(feeling|connection|everyday|offtime)', label: '[^']+' \}/g)].map(match => match[1]);
  assert.deepEqual(groupIds, ['feeling', 'connection', 'everyday', 'offtime']);
  assert.equal(groups.length, keys.length);
  assert.ok(groups.every(group => groupIds.includes(group)));
  assert.match(app, /<section class=\"cc-status-group\"/);
});

test('similar choices use different outlines or marks, not just different colours', () => {
  const body = emoji => faces.html(emoji).replace(/fill=\"#[0-9a-f]{6}\"/g, 'fill=\"COLOR\"');
  for (const [first, second] of [['🫂', '🥰'], ['😴', '🌙'], ['🚗', '✈️'], ['😰', '😢'], ['🍜', '🛁']]) {
    assert.notEqual(body(first), body(second), `${first} and ${second} need distinct shapes`);
  }
});
