'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Layers, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ArchiveFrame, EmptyState, GarmentCard, Notice } from './components';
import { GroupManager } from './group-dialogs';
import { groupPath } from './group-model';
import type { GroupView } from './group-model';
import { archiveAction } from './client-api';
import { collectionFor, isAvailable } from './model';
import type { Archive, Collection, OwnerFilter, WardrobeItem } from './model';
import type { InstallationSettings, Profile } from '@/app/installation';
import styles from './groups.module.css';

export function GroupOverview({
  initial,
  groupId,
  initialView = 'owned',
  initialOwner = 'all',
  initialCollection = 'all',
  configuration,
  profiles,
}: {
  initial: Archive;
  groupId: string;
  initialView?: GroupView;
  initialOwner?: OwnerFilter;
  initialCollection?: Collection;
  configuration: InstallationSettings;
  profiles: Profile[];
}) {
  const [archive, setArchive] = useState(initial);
  const [view, setView] = useState(initialView);
  const [owner, setOwner] = useState(initialOwner);
  const [query, setQuery] = useState('');
  const [managing, setManaging] = useState<'rename' | 'add' | 'delete' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const group = archive.groups.find((entry) => entry.id === groupId);
  const back = `/?view=${view === 'wishlist' ? 'wishlist' : 'wardrobe'}&owner=${owner}&collection=${initialCollection}`;
  function navigate(nextView: GroupView, nextOwner = owner) {
    setView(nextView);
    setOwner(nextOwner);
    window.history.replaceState(
      null,
      '',
      groupPath(groupId, nextView, nextOwner, initialCollection),
    );
  }
  async function mutate(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const result = await archiveAction(body);
      setArchive(result.archive);
      setNotice({ message });
    } catch (failure) {
      setNotice({
        message:
          failure instanceof Error
            ? failure.message
            : 'This change could not be saved.',
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }
  const matchesView = (item: WardrobeItem, next: GroupView) =>
    next === 'wishlist'
      ? item.status === 'wishlist'
      : next === 'archived'
        ? ['retired', 'outgrown'].includes(item.status)
        : isAvailable(item, item.owner);
  const members = archive.items.filter(
    (item) =>
      group?.itemIds.includes(item.id) &&
      (owner === 'all' || item.owner === owner) &&
      (initialCollection === 'all' ||
        collectionFor(item.category) === initialCollection),
  );
  const shown = members.filter(
    (item) =>
      matchesView(item, view) &&
      `${item.name} ${item.brand} ${item.colour} ${item.size}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <ArchiveFrame
      owner={owner}
      onOwner={(next) => navigate(view, next)}
      view={view === 'wishlist' ? 'wishlist' : 'wardrobe'}
      collection={initialCollection}
      configuration={configuration}
      profiles={profiles}
    >
      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}
      <Link className="back-link" href={back}>
        <ArrowLeft size={15} />
        Back to the collection
      </Link>
      {!group ? (
        <EmptyState
          title="This group has been deleted."
          description="Its items are still in your collection."
          action={<Link href={back}>Back to the collection</Link>}
        />
      ) : (
        <>
          <section className="page-heading">
            <div>
              <span className="eyebrow blue">A GROUP IN YOUR COLLECTION</span>
              <h1>{group.name}</h1>
              <p>Variants kept together, with their own photos and details.</p>
              {(owner !== 'all' || initialCollection !== 'all') && (
                <Link
                  className={styles.groupLink}
                  href={groupPath(groupId, view)}
                >
                  View all group variants
                </Link>
              )}
            </div>
            <div className="heading-actions">
              <Button
                variant="outline"
                onClick={() => setManaging('rename')}
                disabled={busy}
              >
                <Pencil />
                Rename
              </Button>
              <Button onClick={() => setManaging('add')} disabled={busy}>
                <Plus />
                Add items
              </Button>
              <Button
                variant="outline"
                onClick={() => setManaging('delete')}
                disabled={busy}
                aria-label="Delete group"
              >
                <Trash2 />
              </Button>
            </div>
          </section>
          <div className={styles.toolbar}>
            <div className={styles.viewButtons}>
              {(['owned', 'wishlist', 'archived'] as const).map((next) => (
                <button
                  key={next}
                  type="button"
                  className={view === next ? styles.active : ''}
                  aria-pressed={view === next}
                  onClick={() => navigate(next)}
                >
                  {next === 'owned'
                    ? 'Owned'
                    : next === 'wishlist'
                      ? 'Wishlist'
                      : 'Previously owned'}{' '}
                  <span>
                    {members.filter((item) => matchesView(item, next)).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="search-box">
              <Search size={17} />
              <input
                aria-label="Search group variants"
                placeholder="Find a colour, size or item"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="collection-heading">
            <h2>
              <Layers size={15} className={styles.inlineIcon} />
              The variants
            </h2>
            <span>
              {shown.length} {shown.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          {shown.length ? (
            <div className="garment-grid">
              {shown.map((item) => (
                <div key={item.id}>
                  <GarmentCard
                    item={item}
                    showOwner={owner === 'all'}
                    onFavourite={(piece) =>
                      void mutate(
                        {
                          action: 'update',
                          ids: [piece.id],
                          patch: {
                            favourite: !piece.favourite,
                          },
                        },
                        piece.favourite ? 'Item unsaved.' : 'Item saved.',
                      )
                    }
                  />
                  <button
                    className={styles.removeMember}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        {
                          action: 'set_item_group',
                          itemId: item.id,
                          groupId: null,
                          expectedGroupId: group.id,
                        },
                        'Item removed from this group.',
                      )
                    }
                  >
                    Remove from group
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                query
                  ? 'No variants match this search.'
                  : `No ${view === 'archived' ? 'previously owned' : view} items in this view.`
              }
              description={
                query
                  ? 'Try another name, colour or size.'
                  : 'Add items to this group or choose another view or owner.'
              }
              action={
                <Button onClick={() => setManaging('add')}>
                  <Plus />
                  Add items
                </Button>
              }
            />
          )}
          {managing && (
            <GroupManager
              group={group}
              archive={archive}
              mode={managing}
              profiles={profiles}
              onArchive={setArchive}
              onClose={() => setManaging(null)}
              onDeleted={() => {
                setManaging(null);
              }}
            />
          )}
        </>
      )}
    </ArchiveFrame>
  );
}
