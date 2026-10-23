import test from 'node:test';
import assert from 'node:assert/strict';
import {
    sortCollectionEntries,
    collectionSortOptions,
} from '../app/wardrobe/collection-sort.ts';
import { collectionEntries } from '../app/wardrobe/group-model.ts';

const item = (id, changes = {}) => ({
    id,
    name: id,
    brand: 'Acme',
    updatedAt: '2026-09-14T10:00:00.000Z',
    owner: 'me',
    category: 'accessory',
    status: 'owned',
    colour: 'Brown',
    favourite: false,
    ...changes,
});
const ids = (entries) =>
    entries.map((entry) =>
        entry.kind === 'group' ? entry.group.id : entry.item.id,
    );
const entries = (items) => collectionEntries(items, []);

test('collection order preserves the existing purchase/manual order without mutation', () => {
    const original = entries([item('z'), item('a'), item('m')]);
    Object.freeze(original);
    const sorted = sortCollectionEntries(original, 'collection');
    assert.deepEqual(ids(sorted), ['z', 'a', 'm']);
    assert.notEqual(sorted, original);
});

test('names use natural case-insensitive order and brands break ties by name', () => {
    const original = entries([
        item('ten', { name: 'Wallet 10', brand: 'Bellroy' }),
        item('zulu', { name: 'Zulu', brand: 'Acme' }),
        item('two', { name: 'wallet 2', brand: 'Bellroy' }),
        item('alpha', { name: 'Alpha', brand: 'Acme' }),
    ]);
    assert.deepEqual(ids(sortCollectionEntries(original, 'name-asc')), [
        'alpha',
        'two',
        'ten',
        'zulu',
    ]);
    assert.deepEqual(ids(sortCollectionEntries(original, 'name-desc')), [
        'zulu',
        'ten',
        'two',
        'alpha',
    ]);
    assert.deepEqual(ids(sortCollectionEntries(original, 'brand')), [
        'alpha',
        'zulu',
        'two',
        'ten',
    ]);
});

test('price sorts use recorded USD values and put missing prices last both ways', () => {
    const original = entries([
        item('missing', { facts: { price: 999, paid: 888 } }),
        item('expensive', {
            price: { amount: 100, originalAmount: 2, originalCurrency: 'GBP' },
        }),
        item('invalid', { price: { amount: NaN } }),
        item('free', { price: { amount: 0 } }),
        item('threshold', { price: { amount: 50, isLowerBound: true } }),
        item('cheap', { price: { amount: 10 } }),
    ]);
    assert.deepEqual(ids(sortCollectionEntries(original, 'price-asc')), [
        'free',
        'cheap',
        'threshold',
        'expensive',
        'invalid',
        'missing',
    ]);
    assert.deepEqual(ids(sortCollectionEntries(original, 'price-desc')), [
        'expensive',
        'threshold',
        'cheap',
        'free',
        'invalid',
        'missing',
    ]);
    assert.equal(original[4].item.price.isLowerBound, true);
});

test('all explicit sort orders use stable IDs for equal labels, dates, brands and prices', () => {
    const original = entries(
        ['z', 'a', 'b'].map((id) =>
            item(id, { name: 'Same', price: { amount: 10 } }),
        ),
    );
    for (const { value } of collectionSortOptions.filter(
        (option) => option.value !== 'collection',
    )) {
        assert.deepEqual(ids(sortCollectionEntries(original, value)), [
            'a',
            'b',
            'z',
        ]);
        assert.deepEqual(
            ids(sortCollectionEntries([...original].reverse(), value)),
            ['a', 'b', 'z'],
        );
    }
});

test('groups sort by their displayed name and representative brand/price while retaining members and cover', () => {
    const first = item('first', {
        name: 'Zipper',
        brand: 'Bellroy',
        price: { amount: 60 },
        imageId: 'cover',
    });
    const second = item('second', {
        name: 'Another wallet',
        brand: 'AAA',
        price: { amount: 1 },
    });
    const solo = item('solo', {
        name: 'Camera',
        brand: 'Canon',
        price: { amount: 20 },
    });
    const groups = [
        {
            id: 'wallets',
            name: 'Bellroy wallets',
            itemIds: ['first', 'second'],
        },
    ];
    const original = collectionEntries([solo, first, second], groups);
    const grouped = original[1];
    const snapshot = structuredClone(original);
    Object.freeze(grouped.items);
    Object.freeze(original);
    for (const order of ['name-asc', 'brand', 'price-desc'])
        assert.deepEqual(ids(sortCollectionEntries(original, order)), [
            'wallets',
            'solo',
        ]);
    assert.deepEqual(ids(sortCollectionEntries(original, 'price-asc')), [
        'solo',
        'wallets',
    ]);
    for (const { value } of collectionSortOptions) {
        const sortedGroup = sortCollectionEntries(original, value).find(
            (entry) => entry.kind === 'group',
        );
        assert.equal(sortedGroup, grouped);
        assert.equal(sortedGroup.items[0], first);
        assert.equal(sortedGroup.items[0].imageId, 'cover');
        assert.deepEqual(
            sortedGroup.items.map((member) => member.id),
            ['first', 'second'],
        );
    }
    assert.deepEqual(original, snapshot);
});

test('recent updates use the newest matching group member instead of the representative purchase date', () => {
    const original = collectionEntries(
        [
            item('solo', { updatedAt: '2026-09-14T09:00:00.000Z' }),
            item('cover', {
                updatedAt: '2026-09-10T09:00:00.000Z',
                facts: { orderDate: '2026-09-09' },
            }),
            item('edited', {
                updatedAt: '2026-09-14T10:00:00.000Z',
                facts: { orderDate: '2026-09-01' },
            }),
        ],
        [{ id: 'wallets', name: 'Wallets', itemIds: ['cover', 'edited'] }],
    );
    assert.deepEqual(ids(sortCollectionEntries(original, 'updated')), [
        'wallets',
        'solo',
    ]);
    assert.equal(
        sortCollectionEntries(original, 'updated')[0].items[0].id,
        'cover',
    );
});

test('sorting filtered groups never reintroduces excluded owners, categories, statuses, Saved or search results', () => {
    const matching = item('matching', {
        name: 'Golden wallet',
        favourite: true,
    });
    const hidden = [
        item('owner', { owner: 'wife' }),
        item('category', { category: 'camera' }),
        item('status', { status: 'wishlist' }),
        item('unsaved'),
        item('search', { name: 'Black wallet', favourite: true }),
    ].map((record) => ({
        ...record,
        price: { amount: 99999 },
        updatedAt: '2027-01-01T00:00:00Z',
    }));
    const all = [matching, ...hidden];
    const filtered = all.filter(
        (record) =>
            record.owner === 'me' &&
            record.category === 'accessory' &&
            record.status === 'owned' &&
            record.favourite &&
            record.name.includes('Golden'),
    );
    const original = collectionEntries(filtered, [
        {
            id: 'wallets',
            name: 'Wallets',
            itemIds: all.map((record) => record.id),
        },
    ]);
    for (const { value } of collectionSortOptions) {
        const sorted = sortCollectionEntries(original, value);
        assert.deepEqual(ids(sorted), ['wallets']);
        assert.deepEqual(sorted[0].items, [matching]);
    }
});
