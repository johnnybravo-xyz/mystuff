'use client';
import { useState } from 'react';
import type { SubmitEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { SelectField } from './components';
import { archiveAction } from './client-api';
import { groupForItem, groupPath } from './group-model';
import { isAvailable, profileLabel, statusLabels } from './model';
import type { Profile } from '@/app/installation';
import type { Archive, ItemGroup, WardrobeItem } from './model';
import styles from './groups.module.css';

export function ItemGroupDialog({
    item,
    archive,
    onArchive,
    onClose,
}: {
    item: WardrobeItem;
    archive: Archive;
    onArchive: (archive: Archive) => void;
    onClose: () => void;
}) {
    const current = groupForItem(archive.groups, item.id);
    const [mode, setMode] = useState<'existing' | 'new'>(
        archive.groups.length ? 'existing' : 'new',
    );
    const [target, setTarget] = useState(current?.id || '');
    const [name, setName] = useState('');
    const [requestId] = useState(() => crypto.randomUUID());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function submit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        const expectedGroupId = current?.id || null;
        try {
            if (mode === 'new') {
                const created = await archiveAction({
                    action: 'create_group',
                    requestId,
                    group: {
                        name: name.trim(),
                        itemIds: current ? [] : [item.id],
                    },
                });
                onArchive(created.archive);
                if (current) {
                    const group = created.result as ItemGroup;
                    setMode('existing');
                    setTarget(group.id);
                    const moved = await archiveAction({
                        action: 'set_item_group',
                        itemId: item.id,
                        groupId: group.id,
                        expectedGroupId,
                    });
                    onArchive(moved.archive);
                }
            } else {
                const result = await archiveAction({
                    action: 'set_item_group',
                    itemId: item.id,
                    groupId: target || null,
                    expectedGroupId,
                });
                onArchive(result.archive);
            }
            onClose();
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'The group could not be saved.',
            );
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !busy) onClose();
            }}
        >
            <DialogContent className={styles.dialog} showCloseButton={!busy}>
                <DialogHeader>
                    <DialogTitle className={styles.dialogTitle}>
                        Group this item
                    </DialogTitle>
                    <DialogDescription>
                        Keep variants together in your collection. Each item
                        keeps its own photos, size and details.
                    </DialogDescription>
                </DialogHeader>
                <p className={styles.itemName}>
                    {item.name}
                    {item.colour ? ` · ${item.colour}` : ''}
                    {item.size ? ` · ${item.size}` : ''}
                </p>
                {current && (
                    <p className={styles.hint}>
                        Currently in{' '}
                        <Link href={groupPath(current.id)}>
                            {current.name} ↗
                        </Link>
                    </p>
                )}
                <div className={styles.modeButtons}>
                    <Button
                        type="button"
                        variant={mode === 'existing' ? 'default' : 'outline'}
                        onClick={() => setMode('existing')}
                        disabled={busy}
                    >
                        Choose a group
                    </Button>
                    <Button
                        type="button"
                        variant={mode === 'new' ? 'default' : 'outline'}
                        onClick={() => setMode('new')}
                        disabled={busy}
                    >
                        New group
                    </Button>
                </div>
                <form onSubmit={submit} className={styles.form}>
                    {mode === 'new' ? (
                        <label className="field">
                            <span>Group name</span>
                            <Input
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                                maxLength={120}
                                required
                                placeholder="For example, March Hammo Lite"
                                disabled={busy}
                            />
                        </label>
                    ) : (
                        <SelectField
                            label="Group"
                            value={target}
                            onChange={setTarget}
                            disabled={busy}
                            options={[
                                { value: '', label: 'No group' },
                                ...[...archive.groups]
                                    .sort((a, b) =>
                                        a.name.localeCompare(b.name),
                                    )
                                    .map((group) => ({
                                        value: group.id,
                                        label: group.name,
                                    })),
                            ]}
                        />
                    )}
                    {error && (
                        <p className={styles.error} role="alert">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={busy}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                busy ||
                                (mode === 'new'
                                    ? !name.trim()
                                    : target === (current?.id || ''))
                            }
                        >
                            {busy
                                ? 'Saving…'
                                : mode === 'new'
                                  ? current
                                      ? 'Create and move item'
                                      : 'Create group'
                                  : target
                                    ? 'Save group'
                                    : 'Remove from group'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function GroupManager({
    group,
    archive,
    mode,
    profiles,
    onArchive,
    onClose,
    onDeleted,
}: {
    group: ItemGroup;
    archive: Archive;
    mode: 'rename' | 'add' | 'delete';
    profiles: Profile[];
    onArchive: (archive: Archive) => void;
    onClose: () => void;
    onDeleted: () => void;
}) {
    const [name, setName] = useState(group.name);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const candidates = archive.items.filter(
        (item) =>
            (isAvailable(item, item.owner) ||
                ['wishlist', 'retired', 'outgrown'].includes(item.status)) &&
            !groupForItem(archive.groups, item.id) &&
            `${item.name} ${item.brand} ${item.colour} ${item.size}`
                .toLowerCase()
                .includes(query.toLowerCase()),
    );
    async function submit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const result = await archiveAction(
                mode === 'delete'
                    ? {
                          action: 'delete_group',
                          id: group.id,
                          expectedUpdatedAt: group.updatedAt,
                      }
                    : {
                          action: 'update_group',
                          id: group.id,
                          expectedUpdatedAt: group.updatedAt,
                          patch:
                              mode === 'rename'
                                  ? { name: name.trim() }
                                  : {
                                        itemIds: [
                                            ...group.itemIds,
                                            ...selected,
                                        ],
                                    },
                      },
            );
            onArchive(result.archive);
            if (mode === 'delete') onDeleted();
            else onClose();
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'The group could not be updated.',
            );
        } finally {
            setBusy(false);
        }
    }
    const title =
        mode === 'rename'
            ? 'Rename group'
            : mode === 'add'
              ? 'Add items to this group'
              : 'Delete this group?';
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !busy) onClose();
            }}
        >
            <DialogContent className={styles.dialog} showCloseButton={!busy}>
                <DialogHeader>
                    <DialogTitle className={styles.dialogTitle}>
                        {title}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'delete'
                            ? 'The items will appear separately in your collection. Their photos and details stay with them.'
                            : mode === 'add'
                              ? 'Choose ungrouped items. You can move an item from another group using Group on its item page.'
                              : 'Give these variants a name that makes them easy to find.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className={styles.form}>
                    {mode === 'rename' && (
                        <label className="field">
                            <span>Group name</span>
                            <Input
                                required
                                maxLength={120}
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                                disabled={busy}
                            />
                        </label>
                    )}
                    {mode === 'delete' && (
                        <p className={styles.itemName}>{group.name}</p>
                    )}
                    {mode === 'add' && (
                        <>
                            <Input
                                aria-label="Search ungrouped items"
                                placeholder="Find an item, colour or size"
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                            />
                            <div className={styles.memberPicker}>
                                {candidates.map((item) => (
                                    <label
                                        key={item.id}
                                        aria-label={[
                                            item.name,
                                            item.colour,
                                            item.size,
                                            profileLabel(item.owner, profiles),
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(item.id)}
                                            disabled={
                                                busy ||
                                                (!selected.includes(item.id) &&
                                                    group.itemIds.length +
                                                        selected.length >=
                                                        500)
                                            }
                                            onChange={(event) =>
                                                setSelected((previous) =>
                                                    event.target.checked
                                                        ? [...previous, item.id]
                                                        : previous.filter(
                                                              (id) =>
                                                                  id !==
                                                                  item.id,
                                                          ),
                                                )
                                            }
                                        />
                                        <span>
                                            <strong>{item.name}</strong>
                                            <small>
                                                {[
                                                    profileLabel(item.owner, profiles),
                                                    statusLabels[item.status],
                                                    item.colour,
                                                    item.size,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </small>
                                        </span>
                                    </label>
                                ))}
                                {!candidates.length && (
                                    <p className={styles.hint}>
                                        No ungrouped items match this search.
                                    </p>
                                )}
                            </div>
                            <p className={styles.hint}>
                                {selected.length} selected
                            </p>
                        </>
                    )}
                    {error && (
                        <p className={styles.error} role="alert">
                            {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={busy}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant={
                                mode === 'delete' ? 'destructive' : 'default'
                            }
                            disabled={
                                busy ||
                                (mode === 'rename' && !name.trim()) ||
                                (mode === 'add' && !selected.length)
                            }
                        >
                            {busy
                                ? 'Saving…'
                                : mode === 'delete'
                                  ? 'Delete group'
                                  : mode === 'add'
                                    ? `Add ${selected.length || ''} ${selected.length === 1 ? 'item' : 'items'}`
                                    : 'Save name'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
