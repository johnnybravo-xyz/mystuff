'use client';
import { useState } from 'react';
import {
    ArrowUpRight,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GarmentPhoto, SelectField } from './components';
import { PieceEditor } from './piece-editor';
import {
    categories,
    categoryLabels,
    collectionFor,
    collectionLabels,
    collections,
    profileLabel,
    statuses,
    statusLabels,
} from './model';
import type { Profile } from '@/app/installation';
import type {
    Category,
    Collection,
    OwnerFilter,
    Status,
    WardrobeItem,
} from './model';

export function ManageCollection({
    items,
    owner,
    collection,
    profiles,
    baseCurrency,
    shopCurrency,
    busy,
    onCollection,
    onAdd,
    onMutate,
}: {
    items: WardrobeItem[];
    owner: OwnerFilter;
    collection: Collection;
    profiles: Profile[];
    baseCurrency: string;
    shopCurrency: string;
    busy: boolean;
    onCollection: (collection: Collection) => void;
    onAdd: () => void;
    onMutate: (
        body: Record<string, unknown>,
        message: string,
    ) => Promise<unknown>;
}) {
    const [trash, setTrash] = useState(false);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<Category | 'all'>('all');
    const [status, setStatus] = useState<Status | 'all'>('all');
    const [selected, setSelected] = useState<string[]>([]);
    const [editing, setEditing] = useState<WardrobeItem | null>(null);
    const [trashIds, setTrashIds] = useState<string[] | null>(null);
    const [bulkField, setBulkField] = useState<'owner' | 'category' | 'status'>(
        'owner',
    );
    const [bulkValue, setBulkValue] = useState('');
    const [actionError, setActionError] = useState('');
    const inScope = items.filter(
        (item) =>
            (owner === 'all' || item.owner === owner) &&
            (collection === 'all' ||
                collectionFor(item.category) === collection),
    );
    const availableCategories = categories.filter(
        (value) => collection === 'all' || collectionFor(value) === collection,
    );
    const shown = inScope
        .filter(
            (item) =>
                (trash
                    ? item.status === 'trashed'
                    : item.status !== 'trashed') &&
                (category === 'all' || item.category === category) &&
                (trash || status === 'all' || item.status === status) &&
                `${item.name} ${item.brand} ${item.colour} ${item.size} ${item.location || ''} ${item.notes} ${(item.details || []).map((detail) => `${detail.label} ${detail.value}`).join(' ')}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
        )
        .sort(
            (a, b) =>
                b.updatedAt.localeCompare(a.updatedAt) ||
                a.name.localeCompare(b.name),
        );
    const selectedIds = selected.filter((id) =>
        shown.some((item) => item.id === id),
    );
    const allSelected = shown.length > 0 && selectedIds.length === shown.length;
    const bulkOptions =
        bulkField === 'owner'
            ? [...profiles.map((profile) => ({ value: profile.id, label: profile.label })), { value: 'unassigned', label: 'Unassigned' }]
            : bulkField === 'category'
              ? categories.map((value) => ({
                    value,
                    label: `${collectionLabels[collectionFor(value)]} · ${categoryLabels[value]}`,
                }))
              : statuses
                    .filter((value) => value !== 'trashed')
                    .map((value) => ({ value, label: statusLabels[value] }));
    function changeTab(nextTrash: boolean) {
        setTrash(nextTrash);
        setSelected([]);
        setStatus('all');
        setActionError('');
    }
    async function perform(body: Record<string, unknown>, message: string) {
        setActionError('');
        try {
            await onMutate(body, message);
            setSelected([]);
            return true;
        } catch (error) {
            setActionError(
                error instanceof Error
                    ? error.message
                    : 'This change could not be saved. Please try again.',
            );
            return false;
        }
    }
    function expectedUpdatedAt(ids: string[]) {
        return Object.fromEntries(
            items
                .filter((item) => ids.includes(item.id))
                .map((item) => [item.id, item.updatedAt]),
        );
    }
    function restore(ids: string[]) {
        void perform(
            {
                action: 'restore',
                ids,
                expectedUpdatedAt: expectedUpdatedAt(ids),
            },
            `${ids.length === 1 ? 'Item' : `${ids.length} items`} restored from Trash. Items needing review remain in Import review.`,
        );
    }
    return (
        <section className="min-w-0" aria-label="Manage inventory">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div
                    className="flex flex-wrap gap-2"
                    aria-label="Inventory location"
                >
                    <Button
                        variant={trash ? 'outline' : 'secondary'}
                        aria-pressed={!trash}
                        onClick={() => changeTab(false)}
                    >
                        Items{' '}
                        <span className="text-muted-foreground">
                            {
                                inScope.filter(
                                    (item) => item.status !== 'trashed',
                                ).length
                            }
                        </span>
                    </Button>
                    <Button
                        variant={trash ? 'secondary' : 'outline'}
                        aria-pressed={trash}
                        onClick={() => changeTab(true)}
                    >
                        <Trash2 /> Trash{' '}
                        <span className="text-muted-foreground">
                            {
                                inScope.filter(
                                    (item) => item.status === 'trashed',
                                ).length
                            }
                        </span>
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    {owner === 'all' ? 'Everyone' : profileLabel(owner, profiles)} ·{' '}
                    {collectionLabels[collection]}
                </p>
            </div>
            <div className="mb-5 rounded-xl border bg-card p-4 sm:p-5">
                <div className="search-box mb-4 w-full">
                    <Search size={17} />
                    <input
                        aria-label="Search inventory"
                        placeholder="Search names, brands, rooms, or details"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setSelected([]);
                        }}
                    />
                    {query && (
                        <button
                            aria-label="Clear inventory search"
                            onClick={() => {
                                setQuery('');
                                setSelected([]);
                            }}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
                <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                    <SelectField
                        label="Collection"
                        value={collection}
                        onChange={(value) => onCollection(value as Collection)}
                        options={collections.map((value) => ({
                            value,
                            label: collectionLabels[value],
                        }))}
                    />
                    <SelectField
                        label="Category"
                        value={category}
                        onChange={(value) => {
                            setCategory(value as Category | 'all');
                            setSelected([]);
                        }}
                        options={[
                            { value: 'all', label: 'All categories' },
                            ...availableCategories.map((value) => ({
                                value,
                                label: categoryLabels[value],
                            })),
                        ]}
                    />
                    <SelectField
                        label="Status"
                        value={trash ? 'trashed' : status}
                        disabled={trash}
                        onChange={(value) => {
                            setStatus(value as Status | 'all');
                            setSelected([]);
                        }}
                        options={
                            trash
                                ? [{ value: 'trashed', label: 'Trash' }]
                                : [
                                      { value: 'all', label: 'All statuses' },
                                      ...statuses
                                          .filter(
                                              (value) => value !== 'trashed',
                                          )
                                          .map((value) => ({
                                              value,
                                              label: statusLabels[value],
                                          })),
                                  ]
                        }
                    />
                </div>
            </div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={allSelected}
                        disabled={!shown.length || busy}
                        onChange={() =>
                            setSelected(
                                allSelected ? [] : shown.map((item) => item.id),
                            )
                        }
                    />
                    Select all matching items
                </label>
                <output className="text-xs text-muted-foreground">
                    {shown.length} {shown.length === 1 ? 'item' : 'items'}
                    {selectedIds.length > 0
                        ? ` · ${selectedIds.length} selected`
                        : ''}
                </output>
            </div>
            {selectedIds.length > 0 && (
                <div
                    className="mb-4 rounded-xl border border-primary/30 bg-secondary p-4"
                    aria-label="Selected item actions"
                >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <strong>{selectedIds.length} selected</strong>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => setSelected([])}
                        >
                            Clear selection
                        </Button>
                    </div>
                    {trash ? (
                        <Button
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => restore(selectedIds)}
                        >
                            <RotateCcw /> Restore selected
                        </Button>
                    ) : (
                        <div className="grid min-w-0 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[150px_minmax(180px,1fr)_auto_auto]">
                            <SelectField
                                label="Change selected"
                                value={bulkField}
                                disabled={busy}
                                onChange={(value) => {
                                    setBulkField(value as typeof bulkField);
                                    setBulkValue('');
                                }}
                                options={[
                                    { value: 'owner', label: 'Owner' },
                                    {
                                        value: 'category',
                                        label: 'Category / collection',
                                    },
                                    { value: 'status', label: 'Status' },
                                ]}
                            />
                            <SelectField
                                label="New value"
                                value={bulkValue}
                                disabled={busy}
                                onChange={setBulkValue}
                                options={[
                                    { value: '', label: 'Choose a value' },
                                    ...bulkOptions,
                                ]}
                            />
                            <Button
                                className="min-h-11"
                                disabled={busy || !bulkValue}
                                onClick={() =>
                                    void perform(
                                        {
                                            action: 'update',
                                            ids: selectedIds,
                                            patch: { [bulkField]: bulkValue },
                                            expectedUpdatedAt:
                                                expectedUpdatedAt(selectedIds),
                                        },
                                        `${selectedIds.length} items updated.`,
                                    )
                                }
                            >
                                Apply change
                            </Button>
                            <Button
                                variant="outline"
                                className="min-h-11"
                                disabled={busy}
                                onClick={() => {
                                    setActionError('');
                                    setTrashIds(selectedIds);
                                }}
                            >
                                <Trash2 /> Move to Trash
                            </Button>
                        </div>
                    )}
                </div>
            )}
            {actionError && !trashIds && (
                <p
                    role="alert"
                    className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
                >
                    {actionError}
                </p>
            )}
            {shown.length ? (
                <ul className="grid gap-3">
                    {shown.map((item) => (
                        <li
                            key={item.id}
                            className={`min-w-0 rounded-xl border bg-card p-4 ${selectedIds.includes(item.id) ? 'border-primary' : ''}`}
                        >
                            <div className="grid min-w-0 grid-cols-[24px_56px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[24px_72px_minmax(0,1fr)_auto] sm:items-center">
                                <input
                                    type="checkbox"
                                    aria-label={`Select ${item.name}`}
                                    className="mt-3 size-4 accent-primary sm:mt-0"
                                    checked={selectedIds.includes(item.id)}
                                    disabled={busy}
                                    onChange={() =>
                                        setSelected(
                                            selectedIds.includes(item.id)
                                                ? selectedIds.filter(
                                                      (id) => id !== item.id,
                                                  )
                                                : [...selectedIds, item.id],
                                        )
                                    }
                                />
                                <div className="h-16 min-w-0 overflow-hidden rounded-md bg-background sm:h-20">
                                    <GarmentPhoto
                                        item={item}
                                        className="h-full w-full object-contain [&.photo-placeholder]:p-1 [&.photo-placeholder_span]:hidden [&.photo-placeholder_small]:hidden"
                                    />
                                </div>
                                <div className="min-w-0">
                                    <a
                                        className="font-semibold leading-snug hover:text-primary [overflow-wrap:anywhere]"
                                        href={`/pieces/${item.id}`}
                                    >
                                        {item.name}{' '}
                                        <ArrowUpRight
                                            size={13}
                                            className="inline"
                                            aria-hidden="true"
                                        />
                                    </a>
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                                        {[item.brand, item.colour, item.size]
                                            .filter(Boolean)
                                            .join(' · ') ||
                                            'Add brand, colour, or size details'}
                                    </p>
                                    <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                                        <span className="rounded bg-secondary px-2 py-1">
                                            {statusLabels[item.status]}
                                        </span>
                                        <span className="py-1">
                                            {profileLabel(item.owner, profiles)} ·{' '}
                                            {categoryLabels[item.category]}
                                        </span>
                                    </p>
                                    {trash && item.trash && (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            Previously{' '}
                                            {statusLabels[
                                                item.trash.previousStatus
                                            ].toLowerCase()}
                                        </p>
                                    )}
                                </div>
                                <div className="col-start-2 col-end-4 flex flex-wrap gap-2 sm:col-auto sm:justify-end">
                                    {trash ? (
                                        <Button
                                            variant="outline"
                                            className="min-h-11"
                                            disabled={busy}
                                            aria-label={`Restore ${item.name}`}
                                            onClick={() => restore([item.id])}
                                        >
                                            <RotateCcw /> Restore
                                        </Button>
                                    ) : (
                                        <>
                                            <Button
                                                variant="outline"
                                                className="min-h-11"
                                                disabled={busy}
                                                aria-label={`Edit ${item.name}`}
                                                onClick={() => setEditing(item)}
                                            >
                                                <Pencil /> Edit
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="min-h-11"
                                                disabled={busy}
                                                aria-label={`Move ${item.name} to Trash`}
                                                onClick={() => {
                                                    setActionError('');
                                                    setTrashIds([item.id]);
                                                }}
                                            >
                                                <Trash2 /> Remove
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="rounded-xl border bg-card px-5 py-12 text-center">
                    <h2 className="font-heading text-3xl font-semibold">
                        {trash ? 'Nothing in Trash here.' : 'No items match.'}
                    </h2>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                        {trash
                            ? 'Removed items stay here with their details and photos, ready to restore.'
                            : 'Try another owner, collection, or search, or add a new item.'}
                    </p>
                    {!trash && (
                        <Button className="mt-5" onClick={onAdd}>
                            <Plus /> Add an item
                        </Button>
                    )}
                </div>
            )}
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                {trash
                    ? 'Restore returns each item to its previous status. Purchases that still need confirmation return to review.'
                    : 'Manage includes owned items and purchases still in review. Remove sends items to Trash; their details and photos are kept.'}
            </p>
            {editing && (
                <PieceEditor
                    item={editing}
                    owner={editing.owner}
                    profiles={profiles}
                    baseCurrency={baseCurrency}
                    shopCurrency={shopCurrency}
                    onClose={() => setEditing(null)}
                    onSave={async (patch) => {
                        await onMutate(
                            {
                                action: 'update',
                                ids: [editing.id],
                                patch,
                                expectedUpdatedAt: {
                                    [editing.id]: editing.updatedAt,
                                },
                            },
                            'Item updated.',
                        );
                    }}
                />
            )}
            <AlertDialog
                open={trashIds !== null}
                onOpenChange={(open) => {
                    if (!open && !busy) setTrashIds(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Move{' '}
                            {trashIds?.length === 1
                                ? 'this item'
                                : `${trashIds?.length || 0} items`}{' '}
                            to Trash?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            They will leave your collection. Their details and
                            photos stay in Trash, where you can restore them
                            whenever you like.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {actionError && (
                        <p role="alert" className="text-sm text-destructive">
                            {actionError}
                        </p>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>
                            Keep items
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy || !trashIds?.length}
                            onClick={async () => {
                                if (
                                    trashIds &&
                                    (await perform(
                                        {
                                            action: 'trash',
                                            ids: trashIds,
                                            expectedUpdatedAt:
                                                expectedUpdatedAt(trashIds),
                                        },
                                        `${trashIds.length === 1 ? 'Item' : `${trashIds.length} items`} moved to Trash.`,
                                    ))
                                )
                                    setTrashIds(null);
                            }}
                        >
                            {busy ? 'Moving…' : 'Move to Trash'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    );
}
