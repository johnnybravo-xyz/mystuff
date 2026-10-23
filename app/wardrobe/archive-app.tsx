'use client';
import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowDownUp,
  Check,
  CloudSun,
  Heart,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import {
  ArchiveFrame,
  GarmentCard,
  EmptyState,
  Notice,
  SelectField,
  GarmentPhoto,
} from './components';
import type { View } from './components';
import { AddItem } from './add-item';
import { OutfitBoard } from './outfit-board';
import { ExportCollection } from './export-collection';
import { ManageCollection } from './manage-collection';
import { InquiryPanel } from './shop-seller';
import { ArchiveSettings } from './archive-settings';
import { makeOutfitIdeas } from './outfits';
import { archiveAction } from './client-api';
import { collectionEntries, groupPath } from './group-model';
import {
  collectionSortOptions,
  sortCollectionEntries,
} from './collection-sort';
import type { CollectionSort } from './collection-sort';
import {
  categories,
  collections,
  collectionLabels,
  collectionHeadings,
  collectionFor,
  supportsStyling,
  categoryLabels,
  profileLabel,
  occasionOptions,
  isAvailable,
  colourFamily,
  reviewReason,
} from './model';
import type {
  Archive,
  Owner,
  OwnerFilter,
  Collection,
  WardrobeItem,
  Occasion,
  Temperature
} from './model';
import type { InstallationSettings, Profile } from '@/app/installation';

export function ArchiveApp({
  initial,
  initialOwner = 'all',
  initialCollection = 'all',
  initialView = 'wardrobe',
  configuration,
  profiles,
}: {
  initial: Archive;
  initialOwner?: OwnerFilter;
  initialCollection?: Collection;
  initialView?: View;
  configuration: InstallationSettings;
  profiles: Profile[];
}) {
  const primaryProfile = profiles[0]?.id || 'unassigned';
  const [archive, setArchive] = useState(initial);
  const [scopeOwner, setScopeOwner] = useState<OwnerFilter>(initialOwner);
  const owner: Owner = scopeOwner === 'all' ? primaryProfile : scopeOwner;
  const [collection, setCollection] = useState<Collection>(initialCollection);
  const [view, setView] = useState<View>(initialView);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [colour, setColour] = useState('all');
  const [size, setSize] = useState('all');
  const [favourites, setFavourites] = useState(false);
  const [sortOrder, setSortOrder] = useState<CollectionSort>('collection');
  const [archived, setArchived] = useState(false);
  const [filters, setFilters] = useState(false);
  const [editor, setEditor] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [targetOwner, setTargetOwner] = useState<Owner>(
    initialOwner === 'all' ? primaryProfile : initialOwner,
  );
  const [reviewMode, setReviewMode] = useState('ready');
  const [occasion, setOccasion] = useState<Occasion>('everyday');
  const [temperature, setTemperature] = useState<Temperature>('mild');
  const [anchor, setAnchor] = useState('');
  const [rotation, setRotation] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  function navigate(
    nextView: View,
    nextOwner: OwnerFilter = scopeOwner,
    nextCollection: Collection = collection,
  ) {
    if (nextOwner === 'unassigned' && nextView !== 'manage') nextOwner = 'all';
    if (
      (nextView === 'outfits') &&
      nextOwner === 'all'
    )
      nextOwner = primaryProfile;
    setCollection(nextCollection);
    setView(nextView);
    if (nextOwner !== scopeOwner || nextCollection !== collection) {
      setCategory('all');
      setColour('all');
      setSize('all');
      setQuery('');
    }
    setScopeOwner(nextOwner);
    setTargetOwner(nextOwner === 'all' ? primaryProfile : nextOwner);
    setSelected([]);
    setAnchor('');
    setRotation(0);
    window.history.replaceState(
      null,
      '',
      `/?view=${nextView}&owner=${nextOwner}&collection=${nextCollection}`,
    );
  }
  async function mutate(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const result = await archiveAction(body);
      setArchive(result.archive);
      setNotice({ message });
      return result;
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : 'This change could not be saved.',
        error: true,
      });
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const run = (body: Record<string, unknown>, message: string) => {
    void mutate(body, message).catch(() => {});
  };
  const owned = archive.items.filter(
    (item) => isAvailable(item, owner) && supportsStyling(item),
  );
  const ready = archive.items.filter(
    (item) =>
      item.status === 'review' && item.facts?.fulfillment !== 'return_unknown',
  );
  const returnChecks = archive.items.filter(
    (item) =>
      item.status === 'review' && item.facts?.fulfillment === 'return_unknown',
  );
  const awaiting = archive.items.filter(
    (item) => item.status === 'awaiting_delivery',
  );
  const discarded = archive.items.filter(
    (item) => item.status === 'returned',
  ).length;
  const baseWardrobe = archive.items.filter(
    (item) =>
      (scopeOwner === 'all' || item.owner === scopeOwner) &&
      (collection === 'all' || collectionFor(item.category) === collection) &&
      (view === 'wishlist'
        ? item.status === 'wishlist'
        : archived
          ? ['retired', 'outgrown'].includes(item.status)
          : isAvailable(item, item.owner)),
  );
  const shown = baseWardrobe.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      (colour === 'all' || colourFamily(item.colour) === colour) &&
      (size === 'all' || item.size === size) &&
      (!favourites || item.favourite) &&
      `${item.name} ${item.brand} ${item.colour} ${item.size} ${item.location || ''} ${(item.details || []).map((detail) => detail.value).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const shownEntries = sortCollectionEntries(
    collectionEntries(shown, archive.groups),
    sortOrder,
  );
  const sortLabel = collectionSortOptions.find(
    (option) => option.value === sortOrder,
  )!.label;
  const reviewBase =
    reviewMode === 'returns'
      ? returnChecks
      : reviewMode === 'awaiting'
        ? awaiting
        : ready;
  const reviewItems = reviewBase.filter((item) =>
    `${item.name} ${item.brand} ${item.colour} ${item.size} ${item.location || ''} ${(item.details || []).map((detail) => detail.value).join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const ideas = useMemo(
    () =>
      view === 'outfits'
        ? makeOutfitIdeas(
            archive.items,
            owner,
            occasion,
            temperature,
            anchor,
            rotation,
          )
        : [],
    [view, archive.items, owner, occasion, temperature, anchor, rotation],
  );
  const savedOutfits = archive.outfits.filter(
    (outfit) => outfit.owner === owner,
  );
  const quickCategories = categories.filter((value) =>
    baseWardrobe.some((item) => item.category === value),
  );
  const collectionCounts = Object.fromEntries(
    collections.map((key) => [
      key,
      archive.items.filter(
        (item) =>
          isAvailable(item, item.owner) &&
          (scopeOwner === 'all' || item.owner === scopeOwner) &&
          (key === 'all' || collectionFor(item.category) === key),
      ).length,
    ]),
  );
  const browseCounts =
    view === 'wishlist'
      ? Object.fromEntries(
          collections.map((key) => [
            key,
            archive.items.filter(
              (item) =>
                item.status === 'wishlist' &&
                (scopeOwner === 'all' || item.owner === scopeOwner) &&
                (key === 'all' || collectionFor(item.category) === key),
            ).length,
          ]),
        )
      : collectionCounts;
  async function keepSelected() {
    try {
      await mutate(
        {
          action: 'update',
          ids: selected,
          patch: { owner: targetOwner, status: 'owned' },
        },
        `${selected.length} ${selected.length === 1 ? 'piece' : 'pieces'} added to ${profileLabel(targetOwner, profiles)}.`,
      );
      setSelected([]);
    } catch {}
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const ordered = Array.from(files).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      for (let index = 0; index < ordered.length; index++) {
        const file = ordered[index];
        setNotice({
          message: `Importing ${index + 1} of ${ordered.length}: ${file.name}`,
        });
        const payload = JSON.parse(await file.text());
        const result = await archiveAction({
          action: 'import',
          payload,
        });
        setArchive(result.archive);
      }
      setNotice({
        message: 'Import complete. Existing corrections were preserved.',
      });
      setView('review');
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : 'The file could not be imported.',
        error: true,
      });
    } finally {
      setBusy(false);
      if (importInput.current) importInput.current.value = '';
    }
  }
  return (
    <ArchiveFrame
      owner={scopeOwner}
      view={view}
      collection={collection}
      collectionCounts={collectionCounts}
      configuration={configuration}
      profiles={profiles}
      onCollection={(next) => navigate('wardrobe', scopeOwner, next)}
      onOwner={(next) => navigate(view, next)}
      onView={(next) => {
        setQuery('');
        if (
          next === 'export' ||
          next === 'manage' ||
          next === 'wishlist' ||
          next === 'inquiries' ||
          next === 'settings'
        )
          navigate(next, 'all', 'all');
        else navigate(next);
      }}
      reviewCount={ready.length + returnChecks.length}
    >
      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}
      <input
        ref={importInput}
        type="file"
        accept="application/json,.json"
        multiple
        hidden
        onChange={(event) => void importFiles(event.target.files)}
      />
      <section className="page-heading">
        <div>
          <span className="eyebrow blue">
            {view === 'wardrobe'
              ? collectionLabels[collection].toUpperCase()
              : view === 'wishlist'
                ? 'SOMEDAY, MAYBE'
                : view === 'inquiries'
                  ? 'YOUR PERSONAL SHOP'
                  : view === 'settings'
                    ? 'MAKE IT YOURS'
                    : view === 'outfits'
                      ? 'PUT IT TOGETHER'
                        : view === 'export'
                          ? 'KEEP A COPY'
                          : view === 'manage'
                            ? 'YOUR INVENTORY'
                            : 'MAKE IT YOURS'}
          </span>
          <h1>
            {view === 'wardrobe'
              ? collectionHeadings[collection]
              : view === 'wishlist'
                ? 'On your wishlist.'
                : view === 'inquiries'
                  ? 'Shop conversations.'
                  : view === 'settings'
                    ? 'Your preferences.'
                    : view === 'outfits'
                      ? 'More ways to wear.'
                        : view === 'export'
                          ? 'Take your stuff with you.'
                          : view === 'manage'
                            ? 'Manage your inventory.'
                            : 'Review your pieces.'}
          </h1>
          <p>
            {view === 'wardrobe'
              ? 'The things you live with, use, wear, and love.'
              : view === 'wishlist'
                ? 'Things you would like to own, with their details ready for when you do.'
                : view === 'inquiries'
                  ? 'Messages from people interested in the items you have listed.'
                  : view === 'settings'
                    ? 'Simple settings for your whole archive.'
                    : view === 'outfits'
                      ? 'Real combinations, using the pieces in this wardrobe.'
                        : view === 'export'
                          ? 'A readable copy of your collection, with its details and links.'
                          : view === 'manage'
                            ? 'Add, update, organise, and remove items in one place.'
                            : 'Confirm what you still own and who it belongs to.'}
          </p>
        </div>
        {view !== 'export' && view !== 'inquiries' && view !== 'settings' && (
          <div className="heading-actions">
            {view === 'wardrobe' && collection === 'fashion' && (
              <Button
                variant="outline"
                className="secondary-action"
                onClick={() => navigate('outfits')}
              >
                <Sparkles /> Style my wardrobe
              </Button>
            )}
            <Button
              className="primary-action"
              onClick={() =>
                view === 'review'
                  ? importInput.current?.click()
                  : setEditor(true)
              }
              disabled={busy}
            >
              {view === 'review' ? <Upload /> : <Plus />}
              {view === 'review'
                ? 'Import file'
                : view === 'wishlist'
                  ? 'Add to wishlist'
                  : 'Add an item'}
            </Button>
          </div>
        )}
      </section>
      {view === 'inquiries' && <InquiryPanel />}
      {view === 'settings' && (
        <ArchiveSettings
          preferences={archive.preferences}
          configuration={configuration}
          profiles={profiles}
          itemCount={archive.items.length}
          busy={busy}
          onBlurPrices={async (blurPrices) => {
            await mutate(
              {
                action: 'preferences',
                preferences: {
                  ...archive.preferences,
                  blurPrices,
                },
              },
              blurPrices
                ? 'Prices will start blurred on every item.'
                : 'Prices will be visible on item pages.',
            );
          }}
        />
      )}

      {view === 'export' && (
        <ExportCollection
          key={`${scopeOwner}:${collection}`}
          items={archive.items}
          owner={scopeOwner}
          collection={collection}
          profiles={profiles}
          archiveTitle={configuration.title}
          onCollection={(next) => navigate('export', scopeOwner, next)}
        />
      )}

      {view === 'manage' && (
        <ManageCollection
          key={`${scopeOwner}:${collection}`}
          items={archive.items}
          owner={scopeOwner}
          collection={collection}
          profiles={profiles}
          baseCurrency={configuration.baseCurrency}
          shopCurrency={configuration.shop.defaultCurrency}
          busy={busy}
          onCollection={(next) => navigate('manage', scopeOwner, next)}
          onAdd={() => setEditor(true)}
          onMutate={mutate}
        />
      )}

      {(view === 'wardrobe' || view === 'wishlist') && (
        <>
          {view === 'wardrobe' && ready.length > 0 && (
            <button
              className="review-banner"
              onClick={() => {
                setReviewMode('ready');
                navigate('review');
              }}
            >
              <span>
                <span className="banner-dot" />
                {ready.length} delivered pieces are ready to find their owner.
              </span>
              <span>
                Review pieces <ArrowRight size={14} />
              </span>
            </button>
          )}
          <div className="collection-toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                aria-label="Search belongings"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find an item, brand, model, or room"
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery('')}>
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="toolbar-actions">
              <Button
                variant={favourites ? 'secondary' : 'outline'}
                aria-pressed={favourites}
                onClick={() => setFavourites(!favourites)}
              >
                <Heart /> Saved
              </Button>
              <Button
                variant={filters ? 'secondary' : 'outline'}
                aria-expanded={filters}
                onClick={() => setFilters(!filters)}
              >
                <SlidersHorizontal /> Filters
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant={
                        sortOrder === 'collection' ? 'outline' : 'secondary'
                      }
                    />
                  }
                  aria-label={`Sort order: ${sortLabel}`}
                  title={`Sort: ${sortLabel}`}
                >
                  <ArrowDownUp /> Sort
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuRadioGroup
                    aria-label="Sort collection"
                    value={sortOrder}
                    onValueChange={(value) =>
                      setSortOrder(value as CollectionSort)
                    }
                  >
                    {collectionSortOptions.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        closeOnClick
                      >
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {filters && (
            <div className="filter-row">
              <SelectField
                label="Category"
                value={category}
                onChange={setCategory}
                options={[
                  { value: 'all', label: 'All categories' },
                  ...categories.map((value) => ({
                    value,
                    label: categoryLabels[value],
                  })),
                ]}
              />
              <SelectField
                label="Colour"
                value={colour}
                onChange={setColour}
                options={[
                  { value: 'all', label: 'All colours' },
                  ...[
                    ...new Set(
                      baseWardrobe.map((item) => colourFamily(item.colour)),
                    ),
                  ]
                    .sort()
                    .map((value) => ({
                      value,
                      label: value,
                    })),
                ]}
              />
              <SelectField
                label="Size"
                value={size}
                onChange={setSize}
                options={[
                  { value: 'all', label: 'All sizes' },
                  ...[
                    ...new Set(
                      baseWardrobe.map((item) => item.size).filter(Boolean),
                    ),
                  ]
                    .sort()
                    .map((value) => ({
                      value,
                      label: value,
                    })),
                ]}
              />
              {view === 'wardrobe' && (
                <label className="checkbox-label" htmlFor="show-archived">
                  <Checkbox
                    id="show-archived"
                    aria-label="No longer owned / outgrown"
                    checked={archived}
                    onCheckedChange={(checked) => setArchived(Boolean(checked))}
                  />
                  No longer owned / outgrown
                </label>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setCategory('all');
                  setColour('all');
                  setSize('all');
                  setFavourites(false);
                  setArchived(false);
                }}
              >
                Reset
              </Button>
            </div>
          )}
          <div className="collection-tabs" aria-label="Collection filter">
            {collections
              .filter((key) => key !== 'other' || browseCounts[key] > 0)
              .map((key) => (
                <button
                  key={key}
                  aria-pressed={collection === key}
                  className={collection === key ? 'active' : ''}
                  onClick={() => navigate(view, scopeOwner, key)}
                >
                  {collectionLabels[key]} <span>{browseCounts[key]}</span>
                </button>
              ))}
          </div>
          <div className="category-tabs">
            <button
              className={category === 'all' ? 'active' : ''}
              onClick={() => setCategory('all')}
            >
              Everything <span>{baseWardrobe.length}</span>
            </button>
            {quickCategories
              .filter((value) =>
                baseWardrobe.some((item) => item.category === value),
              )
              .map((value) => (
                <button
                  key={value}
                  className={category === value ? 'active' : ''}
                  onClick={() => setCategory(value)}
                >
                  {categoryLabels[value]}
                </button>
              ))}
          </div>
          <div className="collection-heading">
            <h2>
              {view === 'wishlist'
                ? `Wishlist · ${collectionLabels[collection]}`
                : archived
                  ? 'Previously owned'
                  : collectionLabels[collection]}
            </h2>
            <span>
              {shown.length} {shown.length === 1 ? 'entry' : 'entries'} ·{' '}
              {scopeOwner === 'all'
                ? 'Everyone'
                : profileLabel(scopeOwner, profiles)}
            </span>
          </div>
          {shown.length ? (
            <div className="garment-grid">
              {shownEntries.map((entry) =>
                entry.kind === 'group' ? (
                  <GarmentCard
                    profiles={profiles}
                    key={`group:${entry.group.id}`}
                    item={entry.items[0]}
                    group={{
                      name: entry.group.name,
                      matchingCount: entry.items.length,
                      href: groupPath(
                        entry.group.id,
                        view === 'wishlist'
                          ? 'wishlist'
                          : archived
                            ? 'archived'
                            : 'owned',
                        scopeOwner,
                        collection,
                      ),
                    }}
                  />
                ) : (
                  <GarmentCard
                    profiles={profiles}
                    key={entry.item.id}
                    item={entry.item}
                    showOwner={scopeOwner === 'all'}
                    onFavourite={(piece) =>
                      run(
                        {
                          action: 'update',
                          ids: [piece.id],
                          patch: {
                            favourite: !piece.favourite,
                          },
                        },
                        piece.favourite ? 'Piece unsaved.' : 'Piece saved.',
                      )
                    }
                  />
                ),
              )}
            </div>
          ) : (
            <EmptyState
              title={
                baseWardrobe.length
                  ? 'No pieces match these filters.'
                  : view === 'wishlist'
                    ? 'What is on your wishlist?'
                    : 'A collection waiting to take shape.'
              }
              description={
                baseWardrobe.length
                  ? 'Try another colour, category, or search.'
                  : view === 'wishlist'
                    ? 'Save a product link, add a few details, or upload a photo.'
                    : 'Add something you own or assign an imported purchase.'
              }
              action={
                <Button
                  onClick={() => {
                    if (view === 'wishlist') setEditor(true);
                    else {
                      setReviewMode('ready');
                      navigate('review');
                    }
                  }}
                >
                  {view === 'wishlist' ? 'Add to wishlist' : 'Review purchases'}{' '}
                  <ArrowRight />
                </Button>
              }
            />
          )}
          <div className="archive-note">
            <strong className="blue">A place for everything.</strong>{' '}
            {view === 'wishlist'
              ? 'Wishlist items stay separate from what you own. Open an item to edit it or move it to your owned collection.'
              : 'Returned pieces stay out of your collection. Photos and details can be updated on each item’s page.'}
          </div>
        </>
      )}

      {view === 'review' && (
        <>
          <div className="import-summary">
            <div>
              <strong>
                {archive.batches.length
                  ? Math.max(
                      ...archive.batches.map((batch) => batch.orderCount),
                    )
                  : 0}
              </strong>
              <span>H&M orders checked</span>
            </div>
            <div>
              <strong>
                {archive.items.filter((item) => item.purchaseId).length}
              </strong>
              <span>Purchased units captured</span>
            </div>
            <div>
              <strong>{discarded}</strong>
              <span>Returned pieces excluded</span>
            </div>
            <p>
              H&M sometimes reports returns for a whole parcel. Keep only the
              pieces you still own.
            </p>
          </div>
          <div className="category-tabs review-tabs">
            {[
              {
                id: 'ready',
                label: 'Ready to assign',
                count: ready.length,
              },
              {
                id: 'returns',
                label: 'Return checks',
                count: returnChecks.length,
              },
              {
                id: 'awaiting',
                label: 'On the way',
                count: awaiting.length,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                className={reviewMode === tab.id ? 'active' : ''}
                onClick={() => {
                  setReviewMode(tab.id);
                  setSelected([]);
                  setQuery('');
                }}
              >
                {tab.label}
                <span>{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="collection-toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                aria-label="Search imported pieces"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a piece in these purchases"
              />
            </div>
            {reviewMode !== 'awaiting' && (
              <Button
                variant="outline"
                onClick={() =>
                  setSelected(
                    selected.length === reviewItems.length
                      ? []
                      : reviewItems.map((item) => item.id),
                  )
                }
              >
                {selected.length === reviewItems.length && selected.length
                  ? 'Clear selection'
                  : 'Select all shown'}
              </Button>
            )}
          </div>
          {reviewMode === 'returns' && (
            <div className="review-explanation">
              These pieces are held outside all wardrobes because the parcel has
              a return. Select items you kept, or discard returned items.
            </div>
          )}
          {selected.length > 0 && (
            <div className="bulk-toolbar">
              <strong>{selected.length} selected</strong>
              <SelectField
                label="Keep for"
                value={targetOwner}
                onChange={(value) => setTargetOwner(value as Owner)}
                options={profiles.map((profile) => ({
                  value: profile.id,
                  label: profile.label,
                }))}
              />
              <Button disabled={busy} onClick={() => void keepSelected()}>
                <Check />
                Still owned
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  try {
                    await mutate(
                      {
                        action: 'update',
                        ids: selected,
                        patch: { status: 'returned' },
                      },
                      'Returned pieces excluded.',
                    );
                    setSelected([]);
                  } catch {}
                }}
              >
                Discard returned
              </Button>
            </div>
          )}
          <div className="collection-heading">
            <h2>
              {reviewMode === 'returns'
                ? 'Confirm what you kept'
                : reviewMode === 'awaiting'
                  ? 'Arriving soon'
                  : 'Choose who each piece belongs to'}
            </h2>
            <span>{reviewItems.length} pieces</span>
          </div>
          {reviewItems.length ? (
            <div className="garment-grid review-grid">
              {reviewItems.map((item) => (
                <div key={item.id}>
                  <GarmentCard
                    profiles={profiles}
                    item={item}
                    showOwner
                    selected={selected.includes(item.id)}
                    onSelect={
                      reviewMode === 'awaiting'
                        ? undefined
                        : (id) =>
                            setSelected((previous) =>
                              previous.includes(id)
                                ? previous.filter((value) => value !== id)
                                : [...previous, id],
                            )
                    }
                  />
                  <p className="review-item-note">{reviewReason(item)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                reviewMode === 'ready'
                  ? 'All ready pieces have a place.'
                  : reviewMode === 'returns'
                    ? 'No return checks left.'
                    : 'Nothing is on its way.'
              }
              description={
                reviewMode === 'ready'
                  ? 'You can review uncertain returns separately or head back to your wardrobe.'
                  : 'New purchase imports will update this list.'
              }
              action={
                <Button variant="outline" onClick={() => navigate('wardrobe')}>
                  Open wardrobe
                </Button>
              }
            />
          )}
          <details className="import-history">
            <summary>Import history</summary>
            {archive.batches.map((batch) => (
              <div key={batch.id}>
                <strong>{batch.label}</strong>
                <span>
                  {new Date(batch.importedAt).toLocaleDateString(configuration.locale)} ·{' '}
                  {batch.newItems} new entries
                </span>
              </div>
            ))}
            {!archive.batches.length && (
              <p>
                Import a prepared archive file to bring in purchase history and
                photos.
              </p>
            )}
          </details>
        </>
      )}

      {view === 'outfits' && (
        <>
          <div className="styling-controls">
            <SelectField
              label="Dress for"
              value={occasion}
              onChange={(value) => {
                setOccasion(value as Occasion);
                setRotation(0);
              }}
              options={occasionOptions}
            />
            <SelectField
              label="Weather feel"
              value={temperature}
              onChange={(value) => {
                setTemperature(value as Temperature);
                setRotation(0);
              }}
              options={[
                { value: 'warm', label: 'Warm day' },
                { value: 'mild', label: 'Mild day' },
                { value: 'cool', label: 'Cooler evening' },
              ]}
            />
            <SelectField
              label="Start with a piece"
              value={anchor}
              onChange={(value) => {
                setAnchor(value);
                setRotation(0);
              }}
              options={[
                { value: '', label: 'Any piece' },
                ...owned
                  .filter(
                    (item) =>
                      !['underwear', 'sleepwear', 'other'].includes(
                        item.category,
                      ),
                  )
                  .map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.colour || 'colour unknown'}`,
                  })),
              ]}
            />
            <Button
              variant="outline"
              onClick={() => setRotation((value) => value + 3)}
            >
              <RefreshCw /> More combinations
            </Button>
          </div>
          <div className="category-tabs">
            <button
              className={!savedOnly ? 'active' : ''}
              onClick={() => setSavedOnly(false)}
            >
              Outfit ideas
            </button>
            <button
              className={savedOnly ? 'active' : ''}
              onClick={() => setSavedOnly(true)}
            >
              Saved outfits <span>{savedOutfits.length}</span>
            </button>
          </div>
          {!savedOnly &&
            (ideas.length ? (
              <div className="outfit-grid">
                {ideas.map((idea) => (
                  <OutfitBoard
                    key={`${idea.key}-${occasion}-${temperature}`}
                    idea={idea}
                    allItems={archive.items}
                    owner={owner}
                    busy={busy}
                    lockedItemId={anchor}
                    onSave={async (items, name, notes) => {
                      await mutate(
                        {
                          action: 'save_outfit',
                          outfit: {
                            owner,
                            name,
                            occasion,
                            temperature,
                            itemIds: items.map((item) => item.id),
                            notes,
                          },
                        },
                        'Outfit saved.',
                      );
                    }}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="A few pieces make a whole new outfit."
                description="Add or confirm a top and bottom, a dress, or a set in this wardrobe. Suggestions use available pieces belonging to this person."
                action={
                  <Button onClick={() => navigate('review')}>
                    Review purchases
                  </Button>
                }
              />
            ))}
          {savedOnly &&
            (savedOutfits.length ? (
              <div className="outfit-grid">
                {savedOutfits.map((outfit) => {
                  const pieces = outfit.itemIds
                    .map((id) => archive.items.find((item) => item.id === id))
                    .filter(Boolean) as WardrobeItem[];
                  const unavailable = pieces.some(
                    (item) => !isAvailable(item, owner),
                  );
                  return (
                    <article className="outfit-board" key={outfit.id}>
                      <div className="outfit-collage">
                        {pieces.map((item) => (
                          <a
                            href={`/pieces/${item.id}`}
                            className="outfit-piece"
                            key={item.id}
                          >
                            <GarmentPhoto item={item} />
                            <span>{item.name}</span>
                          </a>
                        ))}
                      </div>
                      <div className="outfit-board-body">
                        <h2>{outfit.name}</h2>
                        <p>
                          {unavailable
                            ? 'One or more pieces are no longer available in this wardrobe.'
                            : outfit.notes}
                        </p>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            run(
                              {
                                action: 'delete_outfit',
                                id: outfit.id,
                              },
                              'Saved outfit removed.',
                            )
                          }
                        >
                          Remove saved outfit
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="Keep the combinations you love."
                description="Save an outfit idea and it will be here whenever you need it."
              />
            ))}
          <div className="archive-note">
            <CloudSun size={15} />
            <span>
              Choose the weather feel yourself; these suggestions do not use a live forecast.
            </span>
          </div>
        </>
      )}

      {editor && (
        <AddItem
          initialStatus={view === 'wishlist' ? 'wishlist' : 'owned'}
          owner={scopeOwner === 'all' ? primaryProfile : scopeOwner}
          collection={collection}
          profiles={profiles}
          baseCurrency={configuration.baseCurrency}
          shopCurrency={configuration.shop.defaultCurrency}
          onClose={() => setEditor(false)}
          onSave={async (item) => {
            await mutate({ action: 'add', item }, 'Item added to My Stuff.');
          }}
        />
      )}
    </ArchiveFrame>
  );
}
