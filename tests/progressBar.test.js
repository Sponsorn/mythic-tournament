const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

const files = [
  'public/compositor/components/_util.js',
  'public/compositor/components/brand-strip.js',
];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  new Function('window', 'document', src)(dom.window, dom.window.document);
}
const BrandStrip = dom.window.BrandStrip;

test('progress bar before start shows "Starts in" and gold fill', () => {
  const el = dom.window.document.createElement('div');
  const now = Date.parse('2026-01-31T17:00:00+01:00');
  BrandStrip.renderAt(el, {
    tournamentStartSE: '2026-01-31T18:00:00+01:00',
    tournamentEndSE: '2026-01-31T22:00:00+01:00',
    title: 'M+ Tournament',
    now,
  });
  const label = el.querySelector('.brand-progress-label').textContent;
  assert.match(label, /Starts in/);
  const fill = el.querySelector('.brand-progress-fill');
  assert.match(fill.className, /brand-progress-fill--pre/);
});

test('progress bar during event shows remaining time and live fill', () => {
  const el = dom.window.document.createElement('div');
  const start = Date.parse('2026-01-31T18:00:00+01:00');
  const end = Date.parse('2026-01-31T22:00:00+01:00');
  const now = start + 2 * 60 * 60 * 1000; // halfway
  BrandStrip.renderAt(el, {
    tournamentStartSE: '2026-01-31T18:00:00+01:00',
    tournamentEndSE: '2026-01-31T22:00:00+01:00',
    title: 'M+ Tournament',
    now,
  });
  const fill = el.querySelector('.brand-progress-fill');
  assert.match(fill.className, /brand-progress-fill--live/);
  const width = parseFloat(fill.style.width);
  assert.ok(width > 45 && width < 55, `expected ~50%, got ${width}`);
});

test('progress bar after end shows "Event ended" and full green fill', () => {
  const el = dom.window.document.createElement('div');
  const now = Date.parse('2026-01-31T23:00:00+01:00');
  BrandStrip.renderAt(el, {
    tournamentStartSE: '2026-01-31T18:00:00+01:00',
    tournamentEndSE: '2026-01-31T22:00:00+01:00',
    title: 'M+ Tournament',
    now,
  });
  assert.match(el.querySelector('.brand-progress-label').textContent, /ended/i);
  assert.match(el.querySelector('.brand-progress-fill').className, /brand-progress-fill--post/);
});

test('progress bar renders "Schedule not set" when dates missing', () => {
  const el = dom.window.document.createElement('div');
  BrandStrip.renderAt(el, {
    tournamentStartSE: '',
    tournamentEndSE: '',
    title: 'M+ Tournament',
    now: Date.now(),
  });
  assert.match(el.querySelector('.brand-progress-label').textContent, /not set/i);
});
