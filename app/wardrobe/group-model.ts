import type { Collection, ItemGroup, OwnerFilter, WardrobeItem } from './model';

export type GroupView = 'owned' | 'wishlist' | 'archived';
export type CollectionEntry =
    | { kind: 'item'; item: WardrobeItem }
    | { kind: 'group'; group: ItemGroup; items: WardrobeItem[] };

export function groupForItem(groups: ItemGroup[], itemId: string) {
    return groups.find((group) => group.itemIds.includes(itemId));
}

// Filter individual items first. A group never introduces members outside that result.
export function collectionEntries(
    items: WardrobeItem[],
    groups: ItemGroup[],
): CollectionEntry[] {
    const memberships = new Map<string, ItemGroup>();
    for (const group of groups)
        for (const id of group.itemIds) memberships.set(id, group);
    const entries: CollectionEntry[] = [];
    const emitted = new Map<
        string,
        Extract<CollectionEntry, { kind: 'group' }>
    >();
    for (const item of items) {
        const group = memberships.get(item.id);
        if (!group) {
            entries.push({ kind: 'item', item });
            continue;
        }
        const existing = emitted.get(group.id);
        if (existing) existing.items.push(item);
        else {
            const entry = { kind: 'group' as const, group, items: [item] };
            emitted.set(group.id, entry);
            entries.push(entry);
        }
    }
    return entries;
}

export function groupPath(
    id: string,
    view: GroupView = 'owned',
    owner: OwnerFilter = 'all',
    collection: Collection = 'all',
) {
    return `/groups/${encodeURIComponent(id)}?${new URLSearchParams({ view, owner, collection })}`;
}
