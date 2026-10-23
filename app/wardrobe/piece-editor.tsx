'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { SelectField } from './components';
import {
  categories,
  categoryLabels,
  collections,
  collectionLabels,
  collectionFor,
  isClothing,
  owners,
  ownerLabels,
  statuses,
  statusLabels,
  inferCategory,
  itemPhotos,
  orderedCoverPhotos,
  photoKindLabels,
} from './model';
import type { Profile } from '@/app/installation';
import type {
  WardrobeItem,
  Owner,
  Status,
  Category,
  Collection,
  ProductPhoto,
} from './model';
import { uploadPhoto } from './client-api';
import { SaleEditor } from './shop-seller';
import {
  editedItemPrice,
  maximumPrice,
  priceBases,
  priceBasisLabels,
} from './item-price';
import type { PriceDraft } from './item-price';
import { prepareEditorPhotos } from './editor-photos';
import type { PendingPhoto } from './editor-photos';

function TextField({
  label,
  value,
  onChange,
  placeholder = 'Unknown for now',
  maxLength = 160,
  required = false,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Input
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
      />
    </label>
  );
}

export function PieceEditor({
  item,
  initialValues,
  initialCollection,
  initialSection = 'details',
  sourceWarnings = [],
  owner,
  profiles = owners
    .filter((value) => value !== 'unassigned')
    .map((id, position) => ({ id, label: ownerLabels[id], position })),
  baseCurrency = 'USD',
  shopCurrency = 'USD',
  onClose,
  onSave,
}: {
  item?: WardrobeItem;
  initialValues?: Partial<WardrobeItem>;
  initialCollection?: Collection;
  initialSection?: 'details' | 'sale';
  sourceWarnings?: string[];
  owner: Owner;
  profiles?: Profile[];
  baseCurrency?: string;
  shopCurrency?: string;
  onClose: () => void;
  onSave: (values: Partial<WardrobeItem>) => Promise<void>;
}) {
  const saleSummaryRef = useRef<HTMLElement>(null);
  const [values, setValues] = useState<Partial<WardrobeItem>>(() => {
    if (item) return { ...item, photos: itemPhotos(item) };
    const category =
      initialValues?.category ||
      (initialCollection && initialCollection !== 'all'
        ? categories.find((value) => collectionFor(value) === initialCollection)
        : inferCategory(initialValues?.name || '')) ||
      'other';
    const next: Partial<WardrobeItem> = {
      name: '',
      brand: '',
      colour: '',
      size: '',
      quantity: 1,
      owner: owner === 'unassigned' ? profiles[0]?.id || 'unassigned' : owner,
      status: 'owned',
      fit: '',
      pattern: '',
      warmth: 'light',
      notes: '',
      location: '',
      details: [],
      productUrl: null,
      imageId: null,
      favourite: false,
      ...initialValues,
      category,
    };
    next.photos = [...(next.photos || [])];
    if (
      next.imageId &&
      !next.photos.some((photo) => photo.imageId === next.imageId)
    )
      next.photos.unshift({
        imageId: next.imageId,
        kind: 'product',
        alt: next.name || 'Product reference',
      });
    if (next.owner === 'unassigned' && next.status === 'owned')
      next.status = 'review';
    return next;
  });
  const category = values.category || 'other';
  const collection = collectionFor(category);
  const clothing = isClothing({ category });
  const consumable = collection === 'pantry';
  const isFragrance = category === 'fragrance';
  const fragrance = values.fragrance || {
    concentration: '',
    family: '',
    notes: '',
    variantConfirmed: false,
  };
  const details = values.details || [];
  const [priceDraft, setPriceDraft] = useState<PriceDraft>(() => ({
    amount: values.price ? String(values.price.amount) : '',
    isLowerBound: values.price?.isLowerBound === true,
    basis: values.price?.basis || (consumable ? 'purchase' : 'estimate'),
    sourceUrl: values.price?.sourceUrl || '',
    notes: values.price?.notes || '',
  }));
  const [priceChanged, setPriceChanged] = useState(false);
  function setPriceField<K extends keyof PriceDraft>(
    key: K,
    value: PriceDraft[K],
  ) {
    setPriceChanged(true);
    setPriceDraft((previous) => ({ ...previous, [key]: value }));
  }
  const photos = values.photos || [];
  const [photoKind, setPhotoKind] = useState<ProductPhoto['kind']>('product');
  const [uploads, setUploads] = useState<PendingPhoto[]>([]);
  const [primaryPhotoId, setPrimaryPhotoId] = useState(values.imageId || '');
  const primaryPhoto = orderedCoverPhotos(
    [
      ...photos,
      ...uploads.map((upload) => ({
        imageId: upload.id,
        kind: upload.kind,
        alt: upload.file.name,
      })),
    ],
    primaryPhotoId,
    clothing,
  )[0]?.imageId;
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof WardrobeItem, value: unknown) =>
    setValues((previous) => ({
      ...previous,
      [key]: value,
      ...(key === 'status' && value !== 'owned' && previous.sale
        ? { sale: { ...previous.sale, published: false } }
        : {}),
    }));
  const setFragrance = (key: keyof typeof fragrance, value: string | boolean) =>
    set('fragrance', { ...fragrance, [key]: value });
  const setDetail = (index: number, key: 'label' | 'value', value: string) =>
    set(
      'details',
      details.map((detail, position) =>
        position === index ? { ...detail, [key]: value } : detail,
      ),
    );

  function updatePhoto(imageId: string, patch: Partial<ProductPhoto>) {
    setValues((previous) => ({
      ...previous,
      photos: (previous.photos || []).map((photo) =>
        photo.imageId === imageId ? { ...photo, ...patch } : photo,
      ),
    }));
  }

  function removePhoto(imageId: string) {
    if (primaryPhotoId === imageId) setPrimaryPhotoId('');
    setValues((previous) => ({
      ...previous,
      photos: (previous.photos || []).filter(
        (photo) => photo.imageId !== imageId,
      ),
      imageId: previous.imageId === imageId ? null : previous.imageId,
      ...(previous.sale
        ? {
            sale: {
              ...previous.sale,
              photoIds: previous.sale.photoIds.filter((id) => id !== imageId),
              published:
                previous.sale.published &&
                previous.sale.photoIds.some((id) => id !== imageId),
            },
          }
        : {}),
    }));
  }

  function chooseFiles(files: File[]) {
    if (photos.length + uploads.length + files.length > 30) {
      setError(
        'Keep up to 30 photos in this gallery. Remove a selected file to make room.',
      );
      return;
    }
    if (files.some((file) => file.size > 8 * 1024 * 1024)) {
      setError('Each photo must be 8 MB or smaller.');
      return;
    }
    setError('');
    setUploads((previous) => [
      ...previous,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        kind: photoKind,
      })),
    ]);
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (photos.length + uploads.length > 30)
        throw new Error('Keep up to 30 photos in this gallery.');
      const next = {
        ...values,
        details: details.filter(
          (detail) => detail.label.trim() || detail.value.trim(),
        ),
      };
      if (priceChanged)
        next.price = editedItemPrice(
          values.price,
          priceDraft,
          new Date().toISOString().slice(0, 10),
          baseCurrency,
        );
      if (next.details.some((detail) => !detail.label.trim()))
        throw new Error('Give each detail a label, or remove the empty row.');
      const preparedPhotos = await prepareEditorPhotos({
        photos,
        uploads,
        primaryPhotoId,
        clothing,
        name: next.name || '',
        uploadPhoto,
        onUploaded: (id, imageId) =>
          setUploads((previous) =>
            previous.map((photo) =>
              photo.id === id ? { ...photo, imageId } : photo,
            ),
          ),
      });
      await onSave({ ...next, ...preparedPhotos });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'This item could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <SheetContent
        className="editor-sheet"
        initialFocus={
          initialSection === 'sale'
            ? () => {
                saleSummaryRef.current?.scrollIntoView({
                  block: 'start',
                });
                return saleSummaryRef.current;
              }
            : undefined
        }
      >
        <SheetHeader>
          <SheetTitle>{item ? 'Edit item' : 'Add an item'}</SheetTitle>
          <SheetDescription>
            {item
              ? 'Keep the details of your collection accurate.'
              : 'A name, a few details, and photos when you have them.'}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="editor-form">
          {sourceWarnings.length > 0 && (
            <div
              className="photo-upload field"
              role="note"
              aria-label="Details to review"
            >
              <span>Review these details</span>
              {sourceWarnings.map((warning, index) => (
                <small key={index}>{warning}</small>
              ))}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <fieldset disabled={saving} className="grid min-w-0 gap-[18px]">
            <div className="field-pair">
              <SelectField
                label="Collection"
                value={collection}
                onChange={(value) => {
                  if (!priceChanged && !values.price)
                    setPriceDraft((draft) => ({
                      ...draft,
                      basis: value === 'pantry' ? 'purchase' : 'estimate',
                    }));
                  set(
                    'category',
                    categories.find(
                      (candidate) => collectionFor(candidate) === value,
                    ) || 'other',
                  );
                }}
                options={collections
                  .filter((value) => value !== 'all')
                  .map((value) => ({
                    value,
                    label: collectionLabels[value],
                  }))}
              />
              <SelectField
                label="Category"
                value={category}
                onChange={(value) => set('category', value as Category)}
                options={categories
                  .filter((value) => collectionFor(value) === collection)
                  .map((value) => ({
                    value,
                    label: categoryLabels[value],
                  }))}
              />
            </div>
            <TextField
              label="Item name"
              value={values.name}
              onChange={(value) => set('name', value)}
              required
              maxLength={200}
              placeholder={
                clothing ? 'e.g. Slim-fit cotton polo' : 'e.g. Era 300 speaker'
              }
            />
            <TextField
              label="Brand"
              value={values.brand}
              onChange={(value) => set('brand', value)}
              placeholder="Brand or maker"
            />
            <div className="field-pair">
              <SelectField
                label="Belongs to"
                value={values.owner || profiles[0]?.id || 'unassigned'}
                onChange={(value) => {
                  set('owner', value as Owner);
                  if (value === 'unassigned') set('status', 'review');
                }}
                options={[
                  ...profiles.map((profile) => ({
                    value: profile.id,
                    label: profile.label,
                  })),
                  { value: 'unassigned', label: 'Unassigned' },
                ]}
              />
              <SelectField
                label="Status"
                value={values.status || 'owned'}
                onChange={(value) => set('status', value as Status)}
                options={statuses
                  .filter(
                    (status) =>
                      status !== 'trashed' &&
                      (values.owner !== 'unassigned' || status !== 'owned'),
                  )
                  .map((value) => ({
                    value,
                    label: statusLabels[value],
                  }))}
              />
            </div>
            <div className="field-pair">
              <TextField
                label={clothing ? 'Colour / wash' : 'Colour / finish'}
                value={values.colour}
                onChange={(value) => set('colour', value)}
              />
              <TextField
                label={
                  isFragrance || category === 'spirit'
                    ? 'Bottle size / volume'
                    : clothing
                      ? 'Label size'
                      : 'Size / capacity'
                }
                value={values.size}
                onChange={(value) => set('size', value)}
              />
            </div>
            <div className="field-pair">
              <label className="field">
                <span>Quantity</span>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={values.quantity ?? ''}
                  onChange={(event) =>
                    set(
                      'quantity',
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                  placeholder="Unknown"
                />
              </label>
              <TextField
                label="Storage location"
                value={values.location}
                onChange={(value) => set('location', value)}
                placeholder="e.g. Living room"
              />
            </div>
            {(consumable ||
              values.purchaseDate ||
              values.purchaseVendor ||
              values.purchaseLocation) && (
              <fieldset className="grid gap-4">
                <legend>Purchase details</legend>
                <label className="field">
                  <span>Date purchased</span>
                  <Input
                    type="date"
                    value={values.purchaseDate || ''}
                    onChange={(event) =>
                      set('purchaseDate', event.target.value)
                    }
                  />
                </label>
                <TextField
                  label="Vendor / shop"
                  value={values.purchaseVendor}
                  maxLength={200}
                  onChange={(value) => set('purchaseVendor', value)}
                  placeholder="Roaster, market stall, or online shop"
                />
                <TextField
                  label="Purchase location"
                  value={values.purchaseLocation}
                  maxLength={200}
                  onChange={(value) => set('purchaseLocation', value)}
                  placeholder="City, country, or market"
                />
              </fieldset>
            )}
            {clothing && (
              <>
                <TextField
                  label="Fit"
                  value={values.fit}
                  onChange={(value) => set('fit', value)}
                  placeholder="Slim, regular, relaxed…"
                />
                <div className="field-pair">
                  <TextField
                    label="Pattern / texture"
                    value={values.pattern}
                    onChange={(value) => set('pattern', value)}
                    placeholder="Solid, stripes, herringbone…"
                  />
                  <SelectField
                    label="Warmth"
                    value={values.warmth || 'light'}
                    onChange={(value) => set('warmth', value)}
                    options={[
                      {
                        value: 'light',
                        label: 'Light / breathable',
                      },
                      {
                        value: 'medium',
                        label: 'Light layer',
                      },
                      {
                        value: 'warm',
                        label: 'Warm layer',
                      },
                    ]}
                  />
                </div>
              </>
            )}
            {isFragrance && (
              <>
                <div className="field-pair">
                  <TextField
                    label="Concentration"
                    value={fragrance.concentration}
                    onChange={(value) => setFragrance('concentration', value)}
                  />
                  <TextField
                    label="Scent family"
                    value={fragrance.family}
                    onChange={(value) => setFragrance('family', value)}
                    placeholder="Citrus, woody, aromatic…"
                  />
                </div>
                <SelectField
                  label="Edition confirmed"
                  value={fragrance.variantConfirmed ? 'yes' : 'no'}
                  onChange={(value) =>
                    setFragrance('variantConfirmed', value === 'yes')
                  }
                  options={[
                    {
                      value: 'no',
                      label: 'Confirm from my bottle',
                    },
                    {
                      value: 'yes',
                      label: 'Exact edition confirmed',
                    },
                  ]}
                />
                <label className="field">
                  <span>Scent notes</span>
                  <Textarea
                    value={fragrance.notes}
                    maxLength={1500}
                    onChange={(event) =>
                      setFragrance('notes', event.target.value)
                    }
                    placeholder="Notes listed for this exact edition"
                  />
                </label>
              </>
            )}
            <SaleEditor
              item={values}
              defaultCurrency={shopCurrency}
              onChange={(sale) => set('sale', sale)}
              initialOpen={initialSection === 'sale'}
              summaryRef={saleSummaryRef}
            />
            <details className="source-details" open={consumable || undefined}>
              <summary>Edit private {baseCurrency} price</summary>
              <div className="grid gap-[18px] py-4">
                <p className="text-xs text-muted-foreground">
                  Only shown on the item page. Leave the amount empty to clear
                  it. An estimate or retail price is separate from what you
                  paid.
                </p>
                <div className="field-pair">
                  <label className="field">
                    <span>Amount ({baseCurrency})</span>
                    <Input
                      type="number"
                      min={0}
                      max={maximumPrice}
                      step="any"
                      value={priceDraft.amount}
                      onChange={(event) =>
                        setPriceField('amount', event.target.value)
                      }
                      placeholder="Unknown"
                    />
                  </label>
                  <SelectField
                    label="Price basis"
                    value={priceDraft.basis}
                    onChange={(value) =>
                      setPriceField('basis', value as PriceDraft['basis'])
                    }
                    options={priceBases.map((value) => ({
                      value,
                      label: priceBasisLabels[value],
                    }))}
                  />
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={priceDraft.isLowerBound}
                    onChange={(event) =>
                      setPriceField('isLowerBound', event.target.checked)
                    }
                  />
                  More than this amount
                </label>
                <TextField
                  label="Price source URL"
                  value={priceDraft.sourceUrl}
                  maxLength={2000}
                  onChange={(value) => setPriceField('sourceUrl', value)}
                  placeholder="https://… (optional)"
                />
                <label className="field">
                  <span>Price notes</span>
                  <Textarea
                    value={priceDraft.notes}
                    maxLength={1500}
                    onChange={(event) =>
                      setPriceField('notes', event.target.value)
                    }
                    placeholder="Market, date, or assumptions (optional)"
                  />
                </label>
              </div>
            </details>
            <div className="field">
              <span>Details</span>
              {details.map((detail, index) => (
                <div key={index} className="grid gap-2 rounded border p-3">
                  <div className="field-pair">
                    <TextField
                      label="Label"
                      value={detail.label}
                      maxLength={100}
                      onChange={(value) => setDetail(index, 'label', value)}
                      placeholder="e.g. Model, material, year"
                    />
                    <TextField
                      label="Value"
                      value={detail.value}
                      maxLength={1000}
                      onChange={(value) => setDetail(index, 'value', value)}
                      placeholder="Add a detail"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-self-end"
                    aria-label={`Remove detail ${index + 1}`}
                    onClick={() =>
                      set(
                        'details',
                        details.filter((_, position) => position !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={details.length >= 30}
                onClick={() =>
                  set('details', [...details, { label: '', value: '' }])
                }
              >
                Add detail
              </Button>
            </div>
            <label className="field">
              <span>Product link</span>
              <Input
                type="url"
                maxLength={1999}
                value={values.productUrl || ''}
                onChange={(event) =>
                  set('productUrl', event.target.value || null)
                }
                placeholder="https://…"
              />
            </label>
            {photos.length > 0 && (
              <div className="field">
                <span>Review photos</span>
                <small>
                  Choose the primary photo shown on cards and when opening this
                  item. Save changes to apply.
                </small>
                <div className="editor-photo-grid">
                  {photos.map((photo, index) => (
                    <div key={photo.imageId} className="editor-photo">
                      {failedPhotos.includes(photo.imageId) ? (
                        <div className="editor-photo-preview photo-placeholder">
                          <span>Photo unavailable</span>
                        </div>
                      ) : (
                        // Protected image requests use the same-origin session cookie.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="editor-photo-preview"
                          src={`/api/images/${photo.imageId}`}
                          alt={
                            photo.alt ||
                            values.name ||
                            `Item photo ${index + 1}`
                          }
                          width={120}
                          height={120}
                          loading="lazy"
                          onError={() =>
                            setFailedPhotos((previous) => [
                              ...previous,
                              photo.imageId,
                            ])
                          }
                        />
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={primaryPhoto === photo.imageId}
                        aria-label={`Use photo ${index + 1} as primary`}
                        onClick={() => setPrimaryPhotoId(photo.imageId)}
                      >
                        {primaryPhoto === photo.imageId
                          ? 'Primary photo'
                          : 'Use as primary'}
                      </Button>
                      <SelectField
                        label={`Photo ${index + 1} type`}
                        value={photo.kind}
                        onChange={(value) =>
                          updatePhoto(photo.imageId, {
                            kind: value as ProductPhoto['kind'],
                          })
                        }
                        options={Object.entries(photoKindLabels).map(
                          ([value, label]) => ({
                            value,
                            label,
                          }),
                        )}
                      />
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={photo.referenceConfirmed === true}
                          onChange={(event) =>
                            updatePhoto(photo.imageId, {
                              referenceConfirmed: event.target.checked,
                            })
                          }
                        />
                        Matches my item
                      </label>
                      {item?.facts?.photos?.some(
                        (source) => source.imageId === photo.imageId,
                      ) ? (
                        <small>From purchase record</small>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove photo ${index + 1}`}
                          onClick={() => removePhoto(photo.imageId)}
                        >
                          Remove photo
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <SelectField
              label="Photo type for new files"
              value={photoKind}
              onChange={(value) => setPhotoKind(value as ProductPhoto['kind'])}
              options={Object.entries(photoKindLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
            <label className="field photo-upload">
              <span>Add photos</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                disabled={photos.length + uploads.length >= 30}
                onChange={(event) => {
                  chooseFiles(Array.from(event.target.files || []));
                  event.target.value = '';
                }}
              />
              <small>
                JPG, PNG, WebP, AVIF, or GIF · up to 8 MB each · 30 photos per
                item.{' '}
                {photos.length > 0
                  ? `${photos.length} existing ${photos.length === 1 ? 'photo is' : 'photos are'} kept. `
                  : ''}
                Choose any photo as primary. Without a selection, product photos
                are preferred; clothing can use a worn view when needed.
              </small>
            </label>
            {uploads.map((upload) => (
              <div key={upload.id} className="grid gap-2 rounded border p-3">
                <small className="break-all">{upload.file.name}</small>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={primaryPhoto === upload.id}
                  aria-label={`Use ${upload.file.name} as primary`}
                  onClick={() => setPrimaryPhotoId(upload.id)}
                >
                  {primaryPhoto === upload.id
                    ? 'Primary photo'
                    : 'Use as primary'}
                </Button>
                <SelectField
                  label={`Photo type for ${upload.file.name}`}
                  value={upload.kind}
                  onChange={(value) =>
                    setUploads((previous) =>
                      previous.map((photo) =>
                        photo.id === upload.id
                          ? {
                              ...photo,
                              kind: value as ProductPhoto['kind'],
                            }
                          : photo,
                      ),
                    )
                  }
                  options={Object.entries(photoKindLabels).map(
                    ([value, label]) => ({
                      value,
                      label,
                    }),
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-end"
                  onClick={() => {
                    if (primaryPhotoId === upload.id) setPrimaryPhotoId('');
                    setUploads((previous) =>
                      previous.filter((photo) => photo.id !== upload.id),
                    );
                  }}
                  aria-label={`Remove ${upload.file.name}`}
                >
                  Remove file
                </Button>
              </div>
            ))}
            <label className="field">
              <span>{consumable ? 'Tasting notes & thoughts' : 'Notes'}</span>
              <Textarea
                value={values.notes || ''}
                maxLength={3000}
                onChange={(event) => set('notes', event.target.value)}
                placeholder={
                  consumable
                    ? 'Flavour, brewing method, how you used it, and whether you’d buy it again…'
                    : isFragrance
                      ? 'Your impressions, when you wear it, or bottle details to confirm.'
                      : clothing
                        ? 'Fit notes, how you like to wear it, or details to fill in later.'
                        : 'How you use it, care notes, or details to confirm.'
                }
              />
            </label>
            <div className="editor-actions">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
              </Button>
            </div>
          </fieldset>
        </form>
      </SheetContent>
    </Sheet>
  );
}
