import type { CollectionEntry } from './group-model';

export const collectionSortOptions = [
    { value: 'collection', label: 'Collection order' },
    { value: 'updated', label: 'Recently updated' },
    { value: 'name-asc', label: 'Name A–Z' },
    { value: 'name-desc', label: 'Name Z–A' },
    { value: 'brand', label: 'Brand A–Z' },
    { value: 'price-asc', label: 'Price low to high' },
    { value: 'price-desc', label: 'Price high to low' },
] as const;

export type CollectionSort = (typeof collectionSortOptions)[number]['value'];

function entryItem(entry: CollectionEntry) {
    return entry.kind === 'group' ? entry.items[0] : entry.item;
}

function entryName(entry: CollectionEntry) {
    return entry.kind === 'group' ? entry.group.name : entry.item.name;
}

function entryId(entry: CollectionEntry) {
    return entry.kind === 'group'
        ? `group:${entry.group.id}`
        : `item:${entry.item.id}`;
}

function compareText(left: string, right: string) {
    return left.localeCompare(right, 'en', {
        sensitivity: 'base',
        numeric: true,
    });
}

function latestUpdate(entry: CollectionEntry) {
    const items = entry.kind === 'group' ? entry.items : [entry.item];
    return Math.max(...items.map((item) => Date.parse(item.updatedAt) || 0));
}

function comparePrice(
    left: CollectionEntry,
    right: CollectionEntry,
    descending: boolean,
) {
    const leftPrice = entryItem(left).price?.amount;
    const rightPrice = entryItem(right).price?.amount;
    const leftKnown =
        typeof leftPrice === 'number' && Number.isFinite(leftPrice);
    const rightKnown =
        typeof rightPrice === 'number' && Number.isFinite(rightPrice);
    if (!leftKnown || !rightKnown)
        return Number(rightKnown) - Number(leftKnown);
    return descending ? rightPrice - leftPrice : leftPrice - rightPrice;
}

// Sort cards after filtering and grouping; their representative and member order stay fixed.
export function sortCollectionEntries(
    entries: CollectionEntry[],
    order: CollectionSort,
): CollectionEntry[] {
    if (order === 'collection') return [...entries];
    return [...entries].sort((left, right) => {
        let comparison = 0;
        if (order === 'updated')
            comparison = latestUpdate(right) - latestUpdate(left);
        else if (order === 'name-asc' || order === 'name-desc')
            comparison =
                compareText(entryName(left), entryName(right)) *
                (order === 'name-desc' ? -1 : 1);
        else if (order === 'brand')
            comparison = compareText(
                entryItem(left).brand,
                entryItem(right).brand,
            );
        else if (order === 'price-asc' || order === 'price-desc')
            comparison = comparePrice(left, right, order === 'price-desc');
        return (
            comparison ||
            compareText(entryName(left), entryName(right)) ||
            entryId(left).localeCompare(entryId(right), 'en')
        );
    });
}
