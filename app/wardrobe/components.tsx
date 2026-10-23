'use client';
import { useState } from 'react';
import {
  ArrowUpRight,
  Boxes,
  Download,
  ListChecks,
  Menu,
  Armchair,
  Monitor,
  Watch,
  Car,
  Wine,
  Coffee,
  PawPrint,
  Baby,
  Package,
  Check,
  FolderHeart,
  Heart,
  ImageOff,
  LockKeyhole,
  Shirt,
  ShoppingBag,
  Sparkles,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ArchiveBrand } from './archive-brand';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  categoryLabels,
  profileLabel,
  coverPhotos,
  collectionLabels,
  collections,
  collectionFor,
  isClothing,
} from './model';
import type { WardrobeItem, OwnerFilter, Collection } from './model';
import type { InstallationSettings, Profile } from '@/app/installation';

export type View =
  | 'wardrobe'
  | 'wishlist'
  | 'inquiries'
  | 'settings'
  | 'outfits'
  | 'review'
  | 'export'
  | 'manage';
export function ArchiveFrame({
  children,
  owner,
  view,
  onOwner,
  onView,
  reviewCount = 0,
  collection = 'all',
  onCollection,
  collectionCounts,
  configuration,
  profiles,
}: {
  children: React.ReactNode;
  owner: OwnerFilter;
  view: View;
  onOwner?: (owner: OwnerFilter) => void;
  onView?: (view: View) => void;
  reviewCount?: number;
  collection?: Collection;
  onCollection?: (collection: Collection) => void;
  collectionCounts?: Partial<Record<Collection, number>>;
  configuration: InstallationSettings;
  profiles: Profile[];
}) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  async function signOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      const response = await fetch('/api/session', { method: 'DELETE' });
      if (!response.ok) throw new Error('Sign-out failed. Please try again.');
      const result = await response.json();
      window.location.assign(
        typeof result.redirectTo === 'string' ? result.redirectTo : '/signin',
      );
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : 'Sign-out failed.',
      );
      setSigningOut(false);
    }
  }
  const icons = {
    all: Boxes,
    fashion: Shirt,
    home: Armchair,
    tech: Monitor,
    watches: Watch,
    vehicles: Car,
    spirits: Wine,
    pantry: Coffee,
    pets: PawPrint,
    kids: Baby,
    other: Package,
  };
  const tools = [
    { id: 'wishlist', label: 'Wishlist', Icon: Heart },
    { id: 'inquiries', label: 'Shop inquiries', Icon: ShoppingBag },
    { id: 'manage', label: 'Manage inventory', Icon: ListChecks },
    { id: 'outfits', label: 'Outfit ideas', Icon: Sparkles },
    { id: 'review', label: 'Import review', Icon: FolderHeart },
    { id: 'export', label: 'Export collection', Icon: Download },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ] as const;
  const people: OwnerFilter[] =
    view === 'outfits'
      ? profiles.map((profile) => profile.id)
      : view === 'manage'
        ? ['all', ...profiles.map((profile) => profile.id), 'unassigned']
        : ['all', ...profiles.map((profile) => profile.id)];
  const visibleCollections = collections.filter(
    (id) => id === 'all' || configuration.enabledCollections.includes(id),
  );
  const visibleTools = tools.filter(
    ({ id }) =>
      (id !== 'wishlist' || configuration.features.wishlist) &&
      (id !== 'inquiries' || configuration.features.shop) &&
      (id !== 'outfits' ||
        (configuration.features.outfits &&
          configuration.enabledCollections.includes('fashion'))),
  );
  const navigation = (
    <div className="sidebar-content">
      <div className="sidebar-label">COLLECTIONS</div>
      <nav className="main-nav" aria-label="Collections">
        {visibleCollections.map((id) => {
          const Icon = icons[id];
          const active = view === 'wardrobe' && collection === id;
          const content = (
            <>
              <Icon />
              {collectionLabels[id]}
              {collectionCounts?.[id] !== undefined && (
                <span className="nav-count">{collectionCounts[id]}</span>
              )}
            </>
          );
          return onCollection ? (
            <button
              key={id}
              className={active ? 'active' : ''}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                setNavigationOpen(false);
                onCollection(id);
              }}
            >
              {content}
            </button>
          ) : (
            <a
              key={id}
              className={active ? 'active' : ''}
              aria-current={active ? 'page' : undefined}
              onClick={() => setNavigationOpen(false)}
              href={`/?collection=${id}`}
            >
              {content}
            </a>
          );
        })}
      </nav>
      <div className="sidebar-label tools-label">TOOLS</div>
      <nav className="main-nav" aria-label="Collection tools">
        {visibleTools.map(({ id, label, Icon }) => {
          const content = (
            <>
              <Icon />
              {label}
              {id === 'review' && reviewCount > 0 && (
                <span className="nav-count">{reviewCount}</span>
              )}
            </>
          );
          return onView ? (
            <button
              key={id}
              className={view === id ? 'active' : ''}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => {
                setNavigationOpen(false);
                onView(id);
              }}
            >
              {content}
            </button>
          ) : (
            <a
              key={id}
              onClick={() => setNavigationOpen(false)}
              href={
                id === 'export' ||
                id === 'manage' ||
                id === 'wishlist' ||
                id === 'inquiries' ||
                id === 'settings'
                  ? `/?view=${id}&owner=all&collection=all`
                  : `/?view=${id}&owner=${owner === 'all' ? profiles[0]?.id || 'unassigned' : owner}`
              }
            >
              {content}
            </a>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <Button
          variant="ghost"
          size="sm"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
        {signOutError && <small role="alert">{signOutError}</small>}
        <small>
          {configuration.locale} · {configuration.timeZone}
        </small>
      </div>
    </div>
  );
  return (
    <div className="archive-shell">
      <aside className="sidebar">
        <ArchiveBrand
          title={configuration.title}
          subtitle={configuration.subtitle}
        />
        {navigation}
      </aside>
      <header className="mobile-header">
        <ArchiveBrand
          title={configuration.title}
          subtitle={configuration.subtitle}
        />
        <Button
          variant="outline"
          className="mobile-menu-button"
          aria-haspopup="dialog"
          aria-expanded={navigationOpen}
          onClick={() => setNavigationOpen(true)}
        >
          <Menu /> Menu
        </Button>
      </header>
      <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
        <SheetContent side="left" className="mobile-navigation">
          <SheetHeader>
            <SheetTitle>Browse My Stuff</SheetTitle>
            <SheetDescription>Collections and tools</SheetDescription>
          </SheetHeader>
          {navigation}
        </SheetContent>
      </Sheet>
      <main className="workspace">
        <header className="topbar">
          <span className="eyebrow">A PERSONAL INVENTORY</span>
          {view !== 'settings' && (
            <div className="family-switch" aria-label="Belongings owner">
              {people.map((person) =>
                onOwner ? (
                  <button
                    key={person}
                    className={owner === person ? 'active' : ''}
                    aria-pressed={owner === person}
                    onClick={() => onOwner(person)}
                  >
                    {person === 'all'
                      ? 'Everyone'
                      : profileLabel(person, profiles)}
                  </button>
                ) : (
                  <a
                    key={person}
                    className={owner === person ? 'active' : ''}
                    href={`/?owner=${person}&collection=${collection}`}
                  >
                    {person === 'all'
                      ? 'Everyone'
                      : profileLabel(person, profiles)}
                  </a>
                ),
              )}
            </div>
          )}
          <button
            className="private-label"
            type="button"
            disabled={signingOut}
            onClick={() => void signOut()}
            aria-label="Sign out of My Stuff"
          >
            <LockKeyhole size={11} /> Sign out
          </button>
        </header>
        {children}
      </main>
    </div>
  );
}

export function GarmentPhoto({
  item,
  imageId,
  className = '',
  priority = false,
}: {
  item: WardrobeItem;
  imageId?: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = imageId
    ? [imageId]
    : coverPhotos(item).map((photo) => photo.imageId);
  const source = candidates.find((candidate) => !failed.includes(candidate));
  if (!source)
    return (
      <div className={`photo-placeholder ${className}`}>
        <ImageOff size={24} />
        <span>{item.brand || categoryLabels[item.category]}</span>
        <small>
          {candidates.length ? 'Photo unavailable' : 'Photo to add'}
        </small>
      </div>
    );
  return (
    // Private image endpoints require the browser session cookie.
    // oxlint-disable-next-line next/no-img-element
    <img
      className={`${className} ${!isClothing(item) ? 'object-image' : ''}`}
      src={`/api/images/${source}`}
      alt={item.name}
      loading={priority ? 'eager' : 'lazy'}
      onError={() => setFailed((previous) => [...previous, source])}
    />
  );
}

export function GarmentCard({
  item,
  selected,
  onSelect,
  onFavourite,
  showOwner = false,
  group,
  profiles = [],
}: {
  item: WardrobeItem;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onFavourite?: (item: WardrobeItem) => void;
  showOwner?: boolean;
  group?: { name: string; href: string; matchingCount: number };
  profiles?: Profile[];
}) {
  const href = group?.href || `/pieces/${item.id}`;
  const title = group?.name || item.name;
  return (
    <article className={`garment-card ${selected ? 'selected-card' : ''}`}>
      <div className="garment-photo">
        <a href={href} className="photo-link" aria-label={`Open ${title}`}>
          <GarmentPhoto item={item} />
        </a>
        {group ? (
          <span className="size-label">
            {group.matchingCount}{' '}
            {group.matchingCount === 1 ? 'variant' : 'variants'}
          </span>
        ) : (
          item.size && <span className="size-label">{item.size}</span>
        )}
        {(coverPhotos(item)[0]?.referenceConfirmed === false ||
          coverPhotos(item)[0]?.kind === 'model') && (
          <span className="reference-label">
            {coverPhotos(item)[0]?.kind === 'model'
              ? coverPhotos(item)[0]?.referenceConfirmed === false
                ? 'Worn reference'
                : 'Worn view'
              : 'Reference photo'}
          </span>
        )}
        {!group && onSelect && (
          <div className="selection-checkbox">
            <Checkbox
              aria-label={`Select ${item.name}`}
              checked={Boolean(selected)}
              onCheckedChange={() => onSelect(item.id)}
            />
          </div>
        )}
        {!group && onFavourite && (
          <Button
            variant="ghost"
            size="icon"
            className={`card-favourite ${item.favourite ? 'is-favourite' : ''}`}
            aria-label={`${item.favourite ? 'Unsave' : 'Save'} ${item.name}`}
            onClick={() => onFavourite(item)}
          >
            <Heart size={15} fill={item.favourite ? 'currentColor' : 'none'} />
          </Button>
        )}
        <a
          href={href}
          className="card-open"
          aria-label={`View details for ${title}`}
        >
          <ArrowUpRight size={17} />
        </a>
        {item.status === 'awaiting_delivery' && (
          <span className="photo-status">On its way</span>
        )}
      </div>
      <div className="garment-caption">
        <div className="brand-row">
          <span>{group ? 'GROUP' : item.brand || 'UNLABELLED'}</span>
          {!group && (
            <span>
              {item.category === 'fragrance'
                ? item.fragrance?.concentration || 'Edition to confirm'
                : item.colour && item.colour !== 'unknown'
                  ? item.colour
                  : collectionLabels[collectionFor(item.category)]}
            </span>
          )}
        </div>
        <a href={href}>
          <h3>{title}</h3>
        </a>
        <p className="item-note">
          {group
            ? 'View variants and their details'
            : showOwner
              ? profileLabel(item.owner, profiles)
              : categoryLabels[item.category]}
          {!group && isClothing(item) && item.fit ? ` · ${item.fit}` : ''}
          {!group && !isClothing(item) && item.location
            ? ` · ${item.location}`
            : ''}
          {!group && item.quantity === null ? ' · Quantity unknown' : ''}
        </p>
      </div>
    </article>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <NativeSelect
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Shirt size={28} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Notice({
  message,
  error = false,
  onClose,
}: {
  message: string;
  error?: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`notice ${error ? 'notice-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {!error && <Check size={16} />}
      <span>{message}</span>
      <button aria-label="Dismiss message" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
