import test from 'node:test';
import assert from 'node:assert/strict';
import {
    collectionEntries,
    groupForItem,
    groupPath,
} from '../app/wardrobe/group-model.ts';

const item = (id, changes = {}) => ({
    id,
    name: 'Oxford shirt',
    owner: 'me',
    status: 'owned',
    colour: 'Black',
    category: 'shirt',
    ...changes,
});
const group = (id, itemIds) => ({
    id,
    name: 'Chosen variants',
    itemIds,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
});

test('collection grouping is explicit and keeps individual variants and totals intact', () => {
    const items = [
        item('black'),
        item('other', { name: 'Another thing' }),
        item('grey', { colour: 'Grey' }),
    ];
    assert.equal(
        collectionEntries(items, []).length,
        3,
        'Identical product names do not create groups.',
    );
    const entries = collectionEntries(items, [
        group('oxford', ['black', 'grey']),
    ]);
    assert.deepEqual(
        entries.map((entry) => entry.kind),
        ['group', 'item'],
    );
    assert.deepEqual(entries[0].items, [items[0], items[2]]);
    assert.equal(entries[1].item, items[1]);
    assert.equal(
        entries.reduce(
            (count, entry) =>
                count + (entry.kind === 'group' ? entry.items.length : 1),
            0,
        ),
        items.length,
    );
    assert.equal(
        groupForItem([group('oxford', ['black', 'grey'])], 'grey').id,
        'oxford',
    );
    assert.equal(groupForItem([], 'grey'), undefined);
});

test('filtered group cards never reintroduce hidden owners, statuses, categories or search results', () => {
    const items = [
        item('black'),
        item('grey', { colour: 'Grey' }),
        item('wife', { owner: 'wife' }),
        item('wish', { status: 'wishlist' }),
        item('trash', { status: 'trashed' }),
        item('returned', { status: 'returned' }),
        item('wallet', { category: 'accessory' }),
    ];
    const groups = [
        group(
            'chosen',
            items.map((entry) => entry.id),
        ),
        group('empty', []),
    ];
    const filtered = items.filter(
        (entry) =>
            entry.owner === 'me' &&
            entry.status === 'owned' &&
            entry.category === 'shirt' &&
            entry.colour === 'Grey',
    );
    const entries = collectionEntries(filtered, groups);
    assert.equal(entries.length, 1);
    assert.deepEqual(
        entries[0].items.map((entry) => entry.id),
        ['grey'],
    );
    assert.deepEqual(collectionEntries([], groups), []);
    const wishlist = collectionEntries(
        items.filter((entry) => entry.status === 'wishlist'),
        groups,
    );
    assert.deepEqual(
        wishlist[0].items.map((entry) => entry.id),
        ['wish'],
    );
});

test('group presentation preserves source arrays and the first matching item position', () => {
    const items = [item('one'), item('two'), item('three'), item('four')];
    const groups = [group('a', ['one', 'four']), group('b', ['two', 'three'])];
    const snapshot = structuredClone({ items, groups });
    for (const entry of items) Object.freeze(entry);
    for (const entry of groups) {
        Object.freeze(entry.itemIds);
        Object.freeze(entry);
    }
    Object.freeze(items);
    Object.freeze(groups);
    const entries = collectionEntries(items, groups);
    assert.deepEqual(
        entries.map((entry) => entry.group.id),
        ['a', 'b'],
    );
    assert.deepEqual(
        entries[1].items.map((entry) => entry.id),
        ['two', 'three'],
    );
    assert.deepEqual({ items, groups }, snapshot);
});

test('group links preserve explicit view and collection context with safe path encoding', () => {
    const defaultUrl = new URL(
        groupPath('chosen'),
        'https://inventory.example',
    );
    assert.equal(defaultUrl.pathname, '/groups/chosen');
    assert.equal(defaultUrl.searchParams.get('view'), 'owned');
    const url = new URL(
        groupPath('with/slash?', 'wishlist', 'wife', 'fashion'),
        'https://inventory.example',
    );
    assert.equal(url.pathname, '/groups/with%2Fslash%3F');
    assert.equal(url.searchParams.get('view'), 'wishlist');
    assert.equal(url.searchParams.get('owner'), 'wife');
    assert.equal(url.searchParams.get('collection'), 'fashion');
});
