'use client';
import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Heart,
  ImagePlus,
  Layers,
  Pencil,
  RotateCcw,
  Sparkles,
  Store,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ArchiveFrame,
  GarmentCard,
  EmptyState,
  GarmentPhoto,
  Notice,
  SelectField,
} from './components';
import { PieceEditor } from './piece-editor';
import { ItemGroupDialog } from './group-dialogs';
import { groupForItem, groupPath } from './group-model';
import { PiecePrice } from './piece-price';
import { OutfitBoard } from './outfit-board';
import { makeOutfitIdeas } from './outfits';
import { archiveAction, uploadPhoto } from './client-api';
import {
  categoryLabels,
  collectionFor,
  collectionLabels,
  isClothing,
  supportsStyling,
  isAvailable,
  itemPhotos,
  photoKindLabels,
  productCover,
  occasionOptions,
  profileLabel,
  reviewReason,
  statusLabels,
} from './model';
import type { InstallationSettings, Profile } from '@/app/installation';
import type {
  Archive,
  Occasion,
  Owner,
  ProductPhoto,
  Temperature,
  WardrobeItem,
} from './model';

export function PieceOverview({
  initial,
  itemId,
  configuration,
  profiles,
}: {
  initial: Archive;
  itemId: string;
  configuration: InstallationSettings;
  profiles: Profile[];
}) {
  const [archive, setArchive] = useState(initial);
  const item = archive.items.find((piece) => piece.id === itemId)!;
  const [activePhoto, setActivePhoto] = useState('');
  const [editing, setEditing] = useState<'details' | 'sale' | null>(null);
  const [grouping, setGrouping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [targetOwner, setTargetOwner] = useState<Owner>(
    item.owner === 'unassigned' ? profiles[0]?.id || 'unassigned' : item.owner,
  );
  const [occasion, setOccasion] = useState<Occasion>('everyday');
  const [temperature, setTemperature] = useState<Temperature>('mild');
  const [photoKind, setPhotoKind] = useState<ProductPhoto['kind']>('product');
  const uploadInput = useRef<HTMLInputElement>(null);
  const photos = itemPhotos(item);
  const selectedPhoto =
    photos.find((photo) => photo.imageId === activePhoto) ||
    photos.find((photo) => photo.imageId === productCover(item)) ||
    photos[0];
  const owner = item.owner === 'unassigned' ? targetOwner : item.owner;
  const available = isAvailable(item, owner);
  const trashed = item.status === 'trashed';
  const isFragrance = item.category === 'fragrance';
  const clothing = isClothing(item);
  const styleable = supportsStyling(item);
  const collection = collectionFor(item.category);
  const itemGroup = groupForItem(archive.groups, item.id);
  const related = archive.items
    .filter(
      (other) =>
        other.id !== item.id &&
        collectionFor(other.category) === collection &&
        isAvailable(other, other.owner),
    )
    .slice(0, 4);
  const ideas =
    available && styleable
      ? makeOutfitIdeas(archive.items, owner, occasion, temperature, item.id)
      : [];
  async function mutate(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const result = await archiveAction(body);
      setArchive(result.archive);
      setNotice({ message });
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
  const update = (patch: Partial<WardrobeItem>, message: string) =>
    mutate(
      {
        action: 'update',
        ids: [item.id],
        patch,
        expectedUpdatedAt: { [item.id]: item.updatedAt },
      },
      message,
    );
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      if (photos.length + files.length > 30)
        throw new Error('Keep up to 30 photos in a piece’s gallery.');
      const added: ProductPhoto[] = [];
      for (const file of Array.from(files)) {
        const imageId = await uploadPhoto(file);
        added.push({
          imageId,
          kind: photoKind,
          alt: `${item.name} · ${file.name}`,
        });
      }
      await update(
        {
          photos: [...photos, ...added],
          imageId: item.imageId,
        },
        `${added.length} ${added.length === 1 ? 'photo' : 'photos'} added.`,
      );
    } catch (error) {
      setNotice({
        message:
          error instanceof Error ? error.message : 'Photos could not be added.',
        error: true,
      });
    } finally {
      setBusy(false);
      if (uploadInput.current) uploadInput.current.value = '';
    }
  }
  return (
    <ArchiveFrame
      owner={owner}
      view={
        trashed
          ? 'manage'
          : item.status === 'wishlist'
            ? 'wishlist'
            : 'wardrobe'
      }
      collection={collection}
      configuration={configuration}
      profiles={profiles}
      reviewCount={
        archive.items.filter((piece) => piece.status === 'review').length
      }
    >
      {notice && <Notice {...notice} onClose={() => setNotice(null)} />}
      <a
        className="back-link"
        href={`/?collection=${collection}&owner=${owner}&view=${trashed ? 'manage' : item.status === 'wishlist' ? 'wishlist' : item.status === 'review' || item.status === 'awaiting_delivery' ? 'review' : 'wardrobe'}`}
      >
        <ArrowLeft size={15} />
        Back to{' '}
        {trashed
          ? 'Manage inventory'
          : item.status === 'wishlist'
            ? 'Wishlist'
            : item.status === 'review' || item.status === 'awaiting_delivery'
              ? 'import review'
              : collectionLabels[collection]}
      </a>
      {trashed && (
        <div className="mb-6 rounded-xl border bg-secondary p-4 text-sm leading-relaxed">
          This item is in Trash. Its details and photos are kept. Restore it
          below to make changes or return it to your collection.
        </div>
      )}
      <section className="piece-overview">
        <div className="piece-gallery">
          <div className="gallery-main">
            <GarmentPhoto
              item={item}
              imageId={selectedPhoto?.imageId}
              priority
            />
            {selectedPhoto && (
              <span className="gallery-caption">
                {selectedPhoto.referenceConfirmed === false
                  ? 'Reference photo'
                  : photoKindLabels[selectedPhoto.kind]}
              </span>
            )}
          </div>
          {photos.length > 1 && (
            <div className="gallery-thumbnails" aria-label="Piece photos">
              {photos.map((photo, index) => (
                <button
                  key={photo.imageId}
                  className={
                    selectedPhoto?.imageId === photo.imageId ? 'active' : ''
                  }
                  aria-label={`Photo ${index + 1}: ${photo.alt}`}
                  aria-pressed={selectedPhoto?.imageId === photo.imageId}
                  onClick={() => setActivePhoto(photo.imageId)}
                >
                  <GarmentPhoto item={item} imageId={photo.imageId} />
                  <span>{photoKindLabels[photo.kind]}</span>
                </button>
              ))}
            </div>
          )}
          <SelectField
            label="New photo type"
            disabled={trashed}
            value={photoKind}
            onChange={(value) => setPhotoKind(value as ProductPhoto['kind'])}
            options={Object.entries(photoKindLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <div className="gallery-actions">
            <Button
              variant="outline"
              disabled={busy || trashed || photos.length >= 30}
              onClick={() => uploadInput.current?.click()}
            >
              <ImagePlus />
              Add photos
            </Button>
            {selectedPhoto && selectedPhoto.imageId !== productCover(item) && (
              <Button
                variant="ghost"
                disabled={busy || trashed}
                onClick={() =>
                  void update(
                    { imageId: selectedPhoto.imageId },
                    'Primary photo updated.',
                  ).catch(() => {})
                }
              >
                Use as primary
              </Button>
            )}
            {selectedPhoto && selectedPhoto.imageId === productCover(item) && (
              <span>
                <Check size={13} />
                Primary photo
              </span>
            )}
          </div>
          <input
            ref={uploadInput}
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            onChange={(event) => void upload(event.target.files)}
          />
          <p className="gallery-footnote">
            {selectedPhoto?.referenceConfirmed === false
              ? 'This reference shows the product family. The pictured finish, capacity, or edition may differ from yours.'
              : isFragrance
                ? 'Retailer photos identify the fragrance; bottle size and packaging are not confirmed from these images.'
                : photos.some((photo) => photo.kind === 'model')
                  ? 'Choose any photo as primary. Otherwise, product photos are preferred, with worn views as a fallback. Styling suggestions use your confirmed wardrobe.'
                  : photos.length
                    ? 'More photos can be added whenever you have them.'
                    : 'Add a photo to see this piece at a glance.'}
          </p>
        </div>
        <div className="piece-information">
          <div className="piece-brand">
            <span className="eyebrow blue">
              {item.brand || 'YOUR COLLECTION'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={item.favourite ? 'Unsave piece' : 'Save piece'}
              disabled={busy || trashed}
              onClick={() =>
                void update(
                  { favourite: !item.favourite },
                  item.favourite ? 'Piece unsaved.' : 'Piece saved.',
                ).catch(() => {})
              }
            >
              <Heart
                size={18}
                fill={item.favourite ? 'currentColor' : 'none'}
              />
            </Button>
          </div>
          <h1>{item.name}</h1>
          <div className="piece-subtitle">
            {isFragrance
              ? item.fragrance?.family || 'Scent family to confirm'
              : item.colour && item.colour !== 'unknown'
                ? item.colour
                : collectionLabels[collection]}{' '}
            <span>·</span> {categoryLabels[item.category]}
          </div>
          <div className={`status-tag status-${item.status}`}>
            {statusLabels[item.status]}
          </div>
          <dl className="piece-specs">
            <div>
              <dt>Belongs to</dt>
              <dd>{profileLabel(item.owner, profiles)}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{item.quantity ?? 'To confirm'}</dd>
            </div>
            {(clothing ||
              isFragrance ||
              item.category === 'spirit' ||
              item.size) && (
              <div>
                <dt>
                  {isFragrance || item.category === 'spirit'
                    ? 'Bottle size'
                    : clothing
                      ? 'Size on label'
                      : 'Size / capacity'}
                </dt>
                <dd>{item.size || 'To confirm'}</dd>
              </div>
            )}
            {item.purchaseDate && (
              <div>
                <dt>Date purchased</dt>
                <dd>{item.purchaseDate}</dd>
              </div>
            )}
            {item.purchaseVendor && (
              <div>
                <dt>Vendor / shop</dt>
                <dd>{item.purchaseVendor}</dd>
              </div>
            )}
            {item.purchaseLocation && (
              <div>
                <dt>Purchase location</dt>
                <dd>{item.purchaseLocation}</dd>
              </div>
            )}
            {item.location && (
              <div>
                <dt>Location</dt>
                <dd>{item.location}</dd>
              </div>
            )}
            {clothing && (
              <>
                <div>
                  <dt>Fit</dt>
                  <dd>{item.fit || 'Not recorded'}</dd>
                </div>
                <div>
                  <dt>Texture / pattern</dt>
                  <dd>{item.pattern || 'Not recorded'}</dd>
                </div>
                <div>
                  <dt>Weather feel</dt>
                  <dd>
                    {item.warmth === 'light'
                      ? 'Light / breathable'
                      : item.warmth === 'medium'
                        ? 'Light layer'
                        : 'Warm layer'}
                  </dd>
                </div>
              </>
            )}
            {isFragrance && (
              <>
                <div>
                  <dt>Concentration</dt>
                  <dd>{item.fragrance?.concentration || 'To confirm'}</dd>
                </div>
                <div>
                  <dt>Edition</dt>
                  <dd>
                    {item.fragrance?.variantConfirmed
                      ? 'Confirmed'
                      : 'To confirm'}
                  </dd>
                </div>
              </>
            )}
            {(item.details || []).map((detail, index) => (
              <div key={`${detail.label}-${index}`}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
          <PiecePrice
            key={`${item.id}:${archive.preferences.blurPrices !== false}`}
            price={item.price}
            locale={configuration.locale}
            blurPrices={archive.preferences.blurPrices !== false}
          />
          {isFragrance && item.fragrance?.notes && (
            <div className="piece-notes">
              <h2>Scent notes</h2>
              <p>{item.fragrance.notes}</p>
            </div>
          )}
          {isFragrance && !item.fragrance?.variantConfirmed && (
            <p className="review-explanation">
              The fragrance line is recorded. Confirm the exact edition or
              concentration from your bottle before using edition-specific notes
              or photos.
            </p>
          )}
          {item.notes && (
            <div className="piece-notes">
              <h2>
                {collection === 'pantry'
                  ? 'Tasting notes & thoughts'
                  : 'Your notes'}
              </h2>
              <p>{item.notes}</p>
            </div>
          )}
          <div className="piece-actions">
            <Button
              variant="outline"
              disabled={busy || trashed}
              onClick={() => setGrouping(true)}
            >
              <Layers />
              Group
            </Button>
            {trashed ? (
              <Button
                disabled={busy}
                onClick={() =>
                  void mutate(
                    {
                      action: 'restore',
                      ids: [item.id],
                      expectedUpdatedAt: {
                        [item.id]: item.updatedAt,
                      },
                    },
                    'Item restored from Trash.',
                  ).catch(() => {})
                }
              >
                <RotateCcw /> Restore item
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setEditing('details')}
              >
                <Pencil />
                Edit details
              </Button>
            )}
            {!trashed && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Move “${item.name}” to Trash? Its details and photos will be kept.`,
                    )
                  )
                    void mutate(
                      {
                        action: 'trash',
                        ids: [item.id],
                        expectedUpdatedAt: {
                          [item.id]: item.updatedAt,
                        },
                      },
                      'Item moved to Trash.',
                    ).catch(() => {});
                }}
              >
                <Trash2 /> Move to Trash
              </Button>
            )}
            {!trashed && configuration.features.shop && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setEditing('sale')}
              >
                <Store />
                {item.sale?.published ? 'Manage listing' : 'Add to shop'}
              </Button>
            )}
            {item.productUrl && (
              <a
                className="retailer-link"
                href={item.productUrl}
                target="_blank"
                rel="noreferrer"
              >
                Retailer page <ArrowUpRight size={14} />
              </a>
            )}
          </div>
          {itemGroup && (
            <p className="price-caption">
              Grouped in{' '}
              <a
                className="retailer-link"
                href={groupPath(
                  itemGroup.id,
                  item.status === 'wishlist'
                    ? 'wishlist'
                    : ['retired', 'outgrown'].includes(item.status)
                      ? 'archived'
                      : 'owned',
                  item.owner === 'unassigned' ? 'all' : item.owner,
                  collection,
                )}
              >
                {itemGroup.name} <ArrowUpRight size={13} />
              </a>
            </p>
          )}
          {grouping && (
            <ItemGroupDialog
              item={item}
              archive={archive}
              onArchive={setArchive}
              onClose={() => setGrouping(false)}
            />
          )}
          {item.status === 'wishlist' && (
            <div className="piece-review">
              <h2>On your wishlist.</h2>
              <p>
                When it arrives, move this item into your owned collection. Its
                details and photos stay together.
              </p>
              <SelectField
                label="Belongs to"
                value={targetOwner}
                onChange={(value) => setTargetOwner(value as Owner)}
                options={profiles.map((profile) => ({
                  value: profile.id,
                  label: profile.label,
                }))}
              />
              <Button
                disabled={busy}
                onClick={() =>
                  void update(
                    { status: 'owned', owner: targetOwner },
                    'Moved from Wishlist to your owned collection.',
                  ).catch(() => {})
                }
              >
                <Check /> Move to owned
              </Button>
            </div>
          )}
          {item.status === 'review' && (
            <div className="piece-review">
              <h2>Give this piece a place.</h2>
              <p>{reviewReason(item)}</p>
              <SelectField
                label="Keep for"
                value={targetOwner}
                onChange={(value) => setTargetOwner(value as Owner)}
                options={profiles.map((profile) => ({
                  value: profile.id,
                  label: profile.label,
                }))}
              />
              <div className="piece-actions">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void update(
                      {
                        owner: targetOwner,
                        status: 'owned',
                      },
                      `Added to ${profileLabel(targetOwner, profiles)}’s wardrobe.`,
                    ).catch(() => {})
                  }
                >
                  <Check />I still own this
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void update(
                      { status: 'returned' },
                      'Returned piece excluded.',
                    ).catch(() => {})
                  }
                >
                  Discard returned
                </Button>
              </div>
            </div>
          )}
          {item.status === 'awaiting_delivery' && (
            <p className="review-explanation">
              This parcel is on its way. It will stay outside outfit suggestions
              until delivery is confirmed in a new import.
            </p>
          )}
          {item.facts && (
            <details className="source-details">
              <summary>Original purchase details</summary>
              <dl className="source-specs">
                <div>
                  <dt>Retailer</dt>
                  <dd>{item.facts.retailer}</dd>
                </div>
                <div>
                  <dt>Order</dt>
                  <dd>{item.facts.orderId}</dd>
                </div>
                <div>
                  <dt>Ordered</dt>
                  <dd>
                    {new Date(item.facts.orderDate).toLocaleDateString(configuration.locale)}
                  </dd>
                </div>
                <div>
                  <dt>Article</dt>
                  <dd>{item.facts.article}</dd>
                </div>
                <div>
                  <dt>Original colour / size</dt>
                  <dd>
                    {item.facts.colour} · {item.facts.size}
                  </dd>
                </div>
                <div>
                  <dt>Purchase quantity</dt>
                  <dd>{item.facts.quantity}</dd>
                </div>
                <div>
                  <dt>Parcel</dt>
                  <dd>{item.facts.parcel}</dd>
                </div>
                <div>
                  <dt>Source status</dt>
                  <dd>
                    {item.facts.fulfillment === 'return_unknown'
                      ? 'Parcel return reported; individual piece unconfirmed'
                      : item.facts.fulfillment.replaceAll('_', ' ')}
                  </dd>
                </div>
              </dl>
              <p>
                Purchase facts stay intact when you edit your wardrobe details.
              </p>
            </details>
          )}
        </div>
      </section>
      {styleable && (
        <section className="piece-styling">
          <div className="section-heading">
            <div>
              <span className="eyebrow blue">FROM THE SAME WARDROBE</span>
              <h2>Wear it with.</h2>
              <p>
                Build around this piece with items{' '}
                {profileLabel(owner, profiles)} already {'owns'}.
              </p>
            </div>
            <Sparkles size={22} />
          </div>
          {available && (
            <div className="styling-controls">
              <SelectField
                label="Dress for"
                value={occasion}
                onChange={(value) => setOccasion(value as Occasion)}
                options={occasionOptions}
              />
              <SelectField
                label="Weather feel"
                value={temperature}
                onChange={(value) => setTemperature(value as Temperature)}
                options={[
                  { value: 'warm', label: 'Warm day' },
                  {
                    value: 'mild',
                    label: 'Mild day',
                  },
                  { value: 'cool', label: 'Cooler evening' },
                ]}
              />
            </div>
          )}
          {ideas.length ? (
            <div className="outfit-grid">
              {ideas.map((idea) => (
                <OutfitBoard
                  key={`${idea.key}-${occasion}-${temperature}`}
                  idea={idea}
                  allItems={archive.items}
                  owner={owner}
                  busy={busy}
                  lockedItemId={item.id}
                  onSave={(items, name, notes) =>
                    mutate(
                      {
                        action: 'save_outfit',
                        outfit: {
                          owner,
                          name,
                          occasion,
                          temperature,
                          itemIds: items.map((piece) => piece.id),
                          notes,
                        },
                      },
                      'Outfit saved.',
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                available
                  ? 'A little more to pair with.'
                  : 'Confirm this piece before styling.'
              }
              description={
                available
                  ? 'Add or assign more pieces to this wardrobe to see combinations built around this one.'
                  : 'Only pieces you still own appear in styling suggestions. Returned and unconfirmed purchases stay out.'
              }
              action={
                <a className="text-link" href={`/?view=review&owner=${owner}`}>
                  Review imported pieces <ArrowUpRight size={14} />
                </a>
              }
            />
          )}
        </section>
      )}
      {!styleable && related.length > 0 && (
        <section className="piece-styling">
          <div className="section-heading">
            <div>
              <span className="eyebrow blue">
                {collectionLabels[collection]}
              </span>
              <h2>In the same collection.</h2>
              <p>More things you already own.</p>
            </div>
          </div>
          <div className="garment-grid related-grid">
            {related.map((other) => (
              <GarmentCard
                key={other.id}
                item={other}
                profiles={profiles}
                showOwner
              />
            ))}
          </div>
        </section>
      )}
      {editing && !trashed && (
        <PieceEditor
          item={item}
          owner={owner}
          profiles={profiles}
          baseCurrency={configuration.baseCurrency}
          shopCurrency={configuration.shop.defaultCurrency}
          initialSection={editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            await update(values, 'Item details saved.');
            setActivePhoto('');
          }}
        />
      )}
    </ArchiveFrame>
  );
}
