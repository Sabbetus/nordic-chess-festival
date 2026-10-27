import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helsinkiToday, quote, validateRegistration } from '../src/lib/registration.ts';

const good = {
  name: ' Mikko  Virtanen ', email: 'Mikko@Example.com', phoneCountry: 'FI', phoneNumber: '040 123 4567',
  fideId: '500410', title: '', rating: '1850', birthYear: '1990', federation: 'FIN', bus: false, accept: true, locale: 'fi',
};

test('a complete registration is accepted and normalised', () => {
  const r = validateRegistration(good);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.name, 'Mikko Virtanen');
  assert.equal(r.value.email, 'mikko@example.com');
  assert.equal(r.value.phone, '+358401234567');
  assert.equal(r.value.rating, 1850);
  assert.equal(r.value.title, null);
  assert.equal(r.value.locale, 'fi');
});

test('missing and invalid fields are reported per field', () => {
  const r = validateRegistration({ ...good, name: '', email: 'nope', phoneNumber: '12', fideId: 'abc', birthYear: '1850', federation: 'XXX', accept: false });
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.deepEqual(r.errors, { name: 'required', email: 'invalid', phone: 'invalid', fideId: 'invalid', birthYear: 'invalid', federation: 'invalid', accept: 'required' });
});

test('no FIDE ID: title and rating are ignored and the player is unrated', () => {
  const r = validateRegistration({ ...good, noFideId: true, fideId: '', title: 'GM', rating: '2600' });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.fideId, null);
  assert.equal(r.value.title, null);
  assert.equal(r.value.rating, null);
  assert.equal(quote(r.value, '2027-03-01').entryCents, 30000);
});

test('FIDE ID is required unless the player says they have none', () => {
  const r = validateRegistration({ ...good, fideId: '' });
  assert.ok(!r.ok);
  if (!r.ok) assert.equal(r.errors.fideId, 'required');
});

test('titles and ratings are checked', () => {
  assert.ok(!validateRegistration({ ...good, title: 'KING' }).ok);
  assert.ok(!validateRegistration({ ...good, rating: '99999' }).ok);
  assert.ok(validateRegistration({ ...good, title: 'WGM', rating: '' }).ok);
});

test('prices: bus is 50 EUR extra, grandmasters are free, early bird by date', () => {
  const reg = { title: null, rating: 1850, birthYear: 1990, bus: false };
  assert.equal(quote(reg, '2027-03-01').totalCents, 21500);
  assert.equal(quote({ ...reg, bus: true }, '2027-03-01').totalCents, 26500);
  assert.equal(quote(reg, '2027-01-31').totalCents, 16500);
  const gm = { title: 'GM' as const, rating: 2600, birthYear: 1985, bus: false };
  assert.equal(quote(gm, '2027-03-01').free, true);
  assert.equal(quote({ ...gm, bus: true }, '2027-03-01').totalCents, 5000);
  assert.equal(quote({ ...gm, bus: true }, '2027-03-01').free, false);
});

test('the Finnish date decides the early bird, not UTC', () => {
  assert.equal(helsinkiToday(new Date('2027-01-31T21:59:00Z')), '2027-01-31');
  assert.equal(helsinkiToday(new Date('2027-01-31T22:00:00Z')), '2027-02-01');
});
