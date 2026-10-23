import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayUsdPrice,
  itemPriceError,
  editedItemPrice,
} from '../app/wardrobe/item-price.ts';

test('display prices round up to whole US dollars without changing recorded values', () => {
  for (const [amount, expected] of [
    [0, '$0'],
    [12, '$12'],
    [12.01, '$13'],
    [69.91, '$70'],
    [139367.97, '$139,368'],
  ])
    assert.equal(displayUsdPrice(amount), expected);
  const recorded = {
    amount: 69.91,
    originalAmount: 60,
    originalCurrency: 'EUR',
  };
  assert.equal(displayUsdPrice(recorded.amount), '$70');
  assert.equal(recorded.amount, 69.91);
  assert.equal(recorded.originalAmount, 60);
});

const price = {
  amount: 123.45,
  currency: 'USD',
  basis: 'retail',
  checkedAt: '2026-09-09',
  sourceUrl: 'https://example.com/product',
  notes: 'Listed price; exact purchase price unknown.',
  originalAmount: 110,
  originalCurrency: 'EUR',
  exchangeRate: 1.1222727273,
  exchangeRateDate: '2026-09-09',
  exchangeRateSourceUrl: 'https://example.com/rates',
};

test('optional prices accept zero and currency provenance, reject malformed money and sources', () => {
  for (const value of [
    undefined,
    null,
    price,
    { ...price, amount: 0 },
    { ...price, isLowerBound: true },
    { ...price, isLowerBound: false },
    { ...price, currency: 'INR' },
  ])
    assert.equal(itemPriceError(value), null);
  for (const invalid of [
    [],
    '',
    12,
    { ...price, amount: NaN },
    { ...price, amount: Infinity },
    { ...price, amount: -1 },
    { ...price, amount: 1e10 },
    { ...price, amount: '123' },
    { ...price, isLowerBound: 'true' },
    { ...price, isLowerBound: 1 },
    { ...price, isLowerBound: null },
    { ...price, isLowerBound: {} },
    { ...price, currency: 'inr' },
    { ...price, currency: 'ZZZ' },
    { ...price, basis: 'paid' },
    { ...price, checkedAt: 'yesterday' },
    { ...price, checkedAt: '2026-02-30' },
    { ...price, checkedAt: '2026-09-09T25:00:00Z' },
    { ...price, sourceUrl: 'http://example.com' },
    { ...price, sourceUrl: 'https://name:secret@example.com' },
    { ...price, notes: 'x'.repeat(1501) },
    { ...price, originalAmount: -1 },
    { ...price, originalCurrency: 'euros' },
    { ...price, originalCurrency: 'ZZZ' },
    { ...price, exchangeRate: 0 },
    { ...price, exchangeRate: Infinity },
    { ...price, exchangeRateDate: '2026-13-01' },
    { ...price, exchangeRateSourceUrl: 'javascript:alert(1)' },
  ])
    assert.ok(itemPriceError(invalid), JSON.stringify(invalid));
});

test('price edits preserve conversion provenance unless the amount changes, and blank clears', () => {
  const draft = {
    amount: '123.45',
    isLowerBound: false,
    basis: 'retail',
    sourceUrl: price.sourceUrl,
    notes: 'New note',
  };
  assert.deepEqual(editedItemPrice(price, draft, '2026-09-10'), {
    ...price,
    checkedAt: '2026-09-10',
    notes: 'New note',
  });
  const changed = editedItemPrice(
    price,
    { ...draft, amount: '125' },
    '2026-09-10',
  );
  assert.equal(changed.amount, 125);
  assert.equal(changed.originalAmount, undefined);
  assert.equal(changed.exchangeRate, undefined);
  assert.equal(
    editedItemPrice(price, { ...draft, amount: '' }, '2026-09-10'),
    null,
  );
  assert.throws(
    () => editedItemPrice(price, { ...draft, amount: '-1' }, '2026-09-10'),
    /finite amount/,
  );
});

test('lower-bound price edits preserve the threshold meaning and can explicitly change it', () => {
  const original = { ...price, basis: 'purchase', isLowerBound: true };
  const draft = {
    amount: String(price.amount),
    basis: 'purchase',
    isLowerBound: true,
    sourceUrl: price.sourceUrl,
    notes: 'The exact cost is unknown.',
  };
  const unchangedAmount = editedItemPrice(original, draft, '2026-09-10');
  assert.deepEqual(unchangedAmount, {
    ...original,
    notes: draft.notes,
    checkedAt: '2026-09-10',
  });
  const newThreshold = editedItemPrice(
    original,
    { ...draft, amount: '200' },
    '2026-09-10',
  );
  assert.equal(newThreshold.amount, 200);
  assert.equal(newThreshold.isLowerBound, true);
  assert.equal(newThreshold.basis, 'purchase');
  assert.equal(newThreshold.originalAmount, undefined);
  const exact = editedItemPrice(
    original,
    { ...draft, isLowerBound: false },
    '2026-09-10',
  );
  assert.equal(exact.isLowerBound, undefined);
  assert.equal(exact.amount, price.amount);
  assert.equal(exact.originalAmount, price.originalAmount);
  assert.equal(
    editedItemPrice(original, { ...draft, amount: '' }, '2026-09-10'),
    null,
  );
});
