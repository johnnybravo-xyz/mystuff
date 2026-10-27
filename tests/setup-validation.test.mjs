import test from 'node:test';
import assert from 'node:assert/strict';

const validation = await import('../app/setup/validation.ts');

test('administrator step reports each invalid field', () => {
  assert.deepEqual(
    Object.keys(
      validation.administratorErrors({
        displayName: ' ',
        password: 'short',
        title: '',
        subtitle: 'x'.repeat(161),
      }),
    ),
    ['displayName', 'password', 'title', 'subtitle'],
  );
  assert.deepEqual(
    validation.administratorErrors({
      displayName: 'Alex',
      password: 'correct horse battery staple',
      title: 'Things',
      subtitle: 'Collected with care.',
    }),
    {},
  );
});

test('region, profile and collection steps validate their inputs', () => {
  assert.deepEqual(
    Object.keys(
      validation.regionErrors({ locale: '??', timeZone: 'Nowhere', baseCurrency: 'usd' }),
    ),
    ['locale', 'timeZone', 'baseCurrency'],
  );
  assert.deepEqual(
    validation.regionErrors({ locale: 'en-IN', timeZone: 'Asia/Kolkata', baseCurrency: 'INR' }),
    {},
  );
  assert.match(validation.profileErrors([]).profiles, /between one and 20/);
  assert.match(validation.profileErrors(['Me', ' me ']).profiles, /different/);
  assert.deepEqual(validation.profileErrors(['Me', 'Partner']), {});
  assert.match(validation.collectionErrors([]).collections, /at least one/);
});

test('public shop needs a configured origin and explicit confirmation', () => {
  assert.deepEqual(
    validation.featureErrors({ shop: false, shopExposureConfirmed: false, shopOrigin: null }),
    {},
  );
  assert.match(
    validation.featureErrors({ shop: true, shopExposureConfirmed: true, shopOrigin: null }).shop,
    /MYSTUFF_PUBLIC_URL/,
  );
  assert.ok(
    validation.featureErrors({
      shop: true,
      shopExposureConfirmed: false,
      shopOrigin: 'https://stuff.example.com',
    }).shopExposureConfirmed,
  );
  assert.deepEqual(
    validation.featureErrors({
      shop: true,
      shopExposureConfirmed: true,
      shopOrigin: 'https://stuff.example.com',
    }),
    {},
  );
});
