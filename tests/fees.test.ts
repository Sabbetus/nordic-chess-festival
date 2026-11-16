import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bands, calculateFee, discountFor } from '../src/data/fees.ts';

const fee = (input: Parameters<typeof calculateFee>[0]) => calculateFee(input).amount;

test('regular and early bird prices for an unrated player', () => {
  assert.equal(fee({ birthYear: 1990, paidOn: '2027-03-01' }), 300);
  assert.equal(fee({ birthYear: 1990, paidOn: '2027-01-31' }), 240); // last early bird day
  assert.equal(fee({ birthYear: 1990, paidOn: '2027-02-01' }), 300); // first regular day
});

test('junior and senior birth year limits', () => {
  assert.equal(fee({ birthYear: 2009, paidOn: '2027-04-01', rating: 1500 }), 215);
  assert.equal(fee({ birthYear: 2008, paidOn: '2027-04-01', rating: 1500 }), 270);
  assert.equal(fee({ birthYear: 1962, paidOn: '2027-04-01', rating: 2200 }), 135);
  assert.equal(fee({ birthYear: 1963, paidOn: '2027-04-01', rating: 2200 }), 170);
});

test('discounts never stack', () => {
  assert.equal(fee({ birthYear: 2012, paidOn: '2027-01-10', rating: 1900 }), 170);
  assert.equal(discountFor(2012, '2027-01-10'), 'junior');
});

test('titles and rating band edges', () => {
  assert.equal(fee({ title: 'GM', birthYear: 1985, paidOn: '2027-04-01', rating: 2600 }), 0);
  assert.equal(fee({ title: 'WGM', birthYear: 1985, paidOn: '2027-04-01', rating: 2300 }), 0);
  assert.equal(fee({ title: 'IM', birthYear: 1985, paidOn: '2027-04-01', rating: 2400 }), 70);
  assert.equal(fee({ title: 'IM', birthYear: 1985, paidOn: '2027-01-02', rating: 2400 }), 55);
  assert.equal(fee({ title: 'FM', birthYear: 1985, paidOn: '2027-04-01', rating: 2250 }), 130);
  assert.equal(calculateFee({ birthYear: 1985, paidOn: '2027-04-01', rating: 2300 }).band.id, 'fm');
  assert.equal(calculateFee({ birthYear: 1985, paidOn: '2027-04-01', rating: 2299 }).band.id, 'r2150');
  assert.equal(calculateFee({ birthYear: 1985, paidOn: '2027-04-01', rating: 1399 }).band.id, 'unrated');
});

test('discounted fees are 20 % off rounded down to 5', () => {
  for (const b of bands.filter((x) => x.regular > 0)) {
    assert.equal(b.discounted, Math.floor((b.regular * 0.8) / 5) * 5, b.id);
  }
});
