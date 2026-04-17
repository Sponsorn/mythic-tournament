const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-director-state.json');

function freshState() {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  delete require.cache[require.resolve('../src/directorState')];
  process.env.DIRECTOR_STATE_PATH = TMP;
  return require('../src/directorState');
}

test('directorState defaults', () => {
  const ds = freshState();
  const s = ds.getState();
  assert.equal(s.activeLayout, 'A');
  assert.equal(s.slots.main, null);
  assert.deepEqual(s.slots.grid, [null, null, null, null, null, null]);
  assert.equal(s.altCard.pinnedSlide, null);
  assert.equal(s.mainAudioUnmuted, false);
});

test('directorState.setLayout persists and emits', () => {
  const ds = freshState();
  let emitted = null;
  ds.on('change', (s) => { emitted = s; });
  ds.setLayout('C');
  assert.equal(ds.getState().activeLayout, 'C');
  assert.equal(emitted.activeLayout, 'C');
  const saved = JSON.parse(fs.readFileSync(TMP, 'utf8'));
  assert.equal(saved.activeLayout, 'C');
});

test('directorState.setSlot updates main', () => {
  const ds = freshState();
  ds.setSlot('main', 'ALPHA');
  assert.equal(ds.getState().slots.main, 'ALPHA');
});

test('directorState.setSlot updates grid[i]', () => {
  const ds = freshState();
  ds.setSlot('grid[2]', 'CHARLIE');
  assert.equal(ds.getState().slots.grid[2], 'CHARLIE');
});

test('directorState.setLayout rejects unknown layout', () => {
  const ds = freshState();
  assert.throws(() => ds.setLayout('XYZ'), /unknown layout/i);
});

test('directorState loads persisted state on require', () => {
  const ds1 = freshState();
  ds1.setLayout('LB');
  ds1.setSlot('main', 'BRAVO');
  delete require.cache[require.resolve('../src/directorState')];
  process.env.DIRECTOR_STATE_PATH = TMP;
  const ds3 = require('../src/directorState');
  assert.equal(ds3.getState().activeLayout, 'LB');
  assert.equal(ds3.getState().slots.main, 'BRAVO');
});
