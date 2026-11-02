import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error plain .mjs helper without type declarations
import { applyRating, readGuest } from '../scripts/guest-ratings.mjs';

const FILE = `name: Test Guest
kind: gm
title: GM
federation: FIN
fideId: 503142
rating:
  value: 2570
  month: '2026-10'
peakRating: 2656
order: 2
`;
const found = (rating: number, month = '2026-11', title = 'GM') => ({ status: 'found', rating, month, title });

test('reads the ID, rating, month and peak of a guest file', () => {
  assert.deepEqual(readGuest(FILE), { fideId: '503142', value: 2570, month: '2026-10', peak: 2656, title: 'GM' });
  assert.equal(readGuest('name: x\n'), null);
});

test('a new rating and month are written, and nothing else in the file changes', () => {
  const r = applyRating(FILE, found(2581));
  assert.equal(r.changed, true);
  assert.equal(r.text, FILE.replace('value: 2570', 'value: 2581').replace("'2026-10'", "'2026-11'"));
});

test('the peak rating only moves up', () => {
  assert.match(applyRating(FILE, found(2660)).text, /peakRating: 2660/);
  assert.match(applyRating(FILE, found(2500)).text, /peakRating: 2656/);
});

test('an unchanged rating in a newer month only updates the month; the same month is "up to date"', () => {
  assert.equal(applyRating(FILE, found(2570)).changed, true);
  const same = applyRating(FILE, found(2570, '2026-10'));
  assert.equal(same.changed, false);
  assert.equal(same.note, 'up to date');
});

test('answers that cannot be used change nothing', () => {
  for (const list of [{ status: 'not_found' }, found(0), found(2600, '2026-09'), null]) {
    assert.equal(applyRating(FILE, list as never).changed, false);
  }
});

test('a changed title is reported but not written', () => {
  const r = applyRating(FILE, found(2581, '2026-11', 'IM'));
  assert.match(r.note, /title is now IM/);
  assert.match(r.text, /^title: GM$/m);
});
