const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('test runner is wired up', () => {
  assert.equal(1 + 1, 2);
});

test('jsdom loads a document', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="x">hi</div></body></html>');
  assert.equal(dom.window.document.getElementById('x').textContent, 'hi');
});
