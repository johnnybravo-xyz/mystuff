import { getArchiveUser, validAgentToken } from '@/app/auth';
import { createHash } from 'node:crypto';
import { getDb, getImageStore } from '@/db';
import { itemPriceError } from './item-price';
import { validateSale } from './shop-model';
import {
  categories,
  occasions,
  normalizeOccasion,
  statuses,
  defaultPreferences,
  purchaseItems,
  nextUpdatedAt,
  itemPhotos,
  reconcileItem,
  isAvailable,
  supportsStyling,
} from './model';
import type {
  Archive,
  WardrobeItem,
  SourceFacts,
  ImportPayload,
  ImportImage,
  ImportBatch,
  Preferences,
  Outfit,
  ProductPhoto,
  ItemGroup,
} from './model';

// The API holds this queue across each complete read-modify-write operation.
let archiveWriteQueue: Promise<unknown> = Promise.resolve();
export function withArchiveWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = archiveWriteQueue.then(operation);
  archiveWriteQueue = result.catch(() => undefined);
  return result;
}

export class ArchiveError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireValue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new ArchiveError(message);
}
export const recordKey = (account: string, id: string) => `${account}:${id}`;
const validId = (value: unknown) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const safeText = (value: unknown, max: number) =>
  typeof value === 'string' && value.length <= max;
const validUrl = (value: unknown) =>
  value === null ||
  value === '' ||
  (typeof value === 'string' &&
    value.length < 2000 &&
    value.startsWith('https://') &&
    (() => {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    })());
function validatePhotos(photos: ProductPhoto[] | undefined) {
  requireValue(
    photos === undefined ||
      (Array.isArray(photos) &&
        photos.length <= 30 &&
        photos.every(
          (photo) =>
            photo &&
            validId(photo.imageId) &&
            ['model', 'product', 'detail', 'personal'].includes(photo.kind) &&
            safeText(photo.alt, 300) &&
            (photo.sourceUrl === undefined ||
              (typeof photo.sourceUrl === 'string' &&
                validUrl(photo.sourceUrl))) &&
            (photo.referenceConfirmed === undefined ||
              typeof photo.referenceConfirmed === 'boolean'),
        )),
    'The photo gallery is invalid.',
  );
}

async function validateImageReferences(
  account: string,
  records: Array<{ imageId: string | null; photos?: ProductPhoto[] }>,
  incomingIds: string[] = [],
) {
  const rows = await getDb()
    .prepare('SELECT id FROM images WHERE account_id=?')
    .bind(account)
    .all<{ id: string }>();
  const known = new Set([
    ...rows.results.map((row) => row.id),
    ...incomingIds.map((id) => recordKey(account, id)),
  ]);
  for (const record of records)
    for (const id of [
      record.imageId,
      ...(record.photos || []).map((photo) => photo.imageId),
    ]) {
      if (id)
        requireValue(
          known.has(recordKey(account, id)),
          'This photo is not part of your archive. Import the photo files first.',
        );
    }
}

export async function accountForRequest(request?: Request): Promise<string> {
  if (request?.headers.has('authorization')) {
    if (!validAgentToken(request))
      throw new ArchiveError(
        'The integration credential is invalid or revoked.',
        401,
      );
    return 'owner';
  }
  const user = await getArchiveUser(request);
  if (!user)
    throw new ArchiveError('Sign in to open your private archive.', 401);
  if (request && request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (
      origin !== new URL(request.url).origin ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      throw new ArchiveError('This change must come from your archive.', 403);
  }
  return user.userId;
}

export async function getArchive(account: string): Promise<Archive> {
  const db = getDb();
  const [itemRows, purchaseRows, outfitRows, batchRows, prefs, groupRows] =
    await Promise.all([
      db
        .prepare('SELECT data FROM wardrobe_items WHERE account_id = ?')
        .bind(account)
        .all<{ data: string }>(),
      db
        .prepare('SELECT data FROM purchase_lines WHERE account_id = ?')
        .bind(account)
        .all<{ data: string }>(),
      db
        .prepare('SELECT data FROM outfits WHERE account_id = ?')
        .bind(account)
        .all<{ data: string }>(),
      db
        .prepare('SELECT data FROM import_batches WHERE account_id = ?')
        .bind(account)
        .all<{ data: string }>(),
      db
        .prepare('SELECT data FROM preferences WHERE account_id = ?')
        .bind(account)
        .first<{ data: string }>(),
      db
        .prepare('SELECT data FROM item_groups WHERE account_id = ?')
        .bind(account)
        .all<{ data: string }>(),
    ]);
  const facts = new Map(
    purchaseRows.results.map((row) => {
      const fact = JSON.parse(row.data) as SourceFacts;
      return [fact.id, fact];
    }),
  );
  return {
    groups: groupRows.results
      .map((row) => JSON.parse(row.data) as ItemGroup)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    items: itemRows.results
      .map((row) => {
        const item = JSON.parse(row.data) as WardrobeItem;
        return {
          ...item,
          facts: item.purchaseId ? facts.get(item.purchaseId) : undefined,
        };
      })
      .sort(
        (a, b) =>
          (b.facts?.orderDate || b.updatedAt).localeCompare(
            a.facts?.orderDate || a.updatedAt,
          ) || a.name.localeCompare(b.name),
      ),
    outfits: outfitRows.results
      .map((row) => {
        const outfit = JSON.parse(row.data);
        return {
          ...outfit,
          occasion: normalizeOccasion(outfit.occasion),
        };
      })
      .sort((a: Outfit, b: Outfit) => b.createdAt.localeCompare(a.createdAt)),
    batches: batchRows.results
      .map((row) => JSON.parse(row.data))
      .sort((a: ImportBatch, b: ImportBatch) =>
        b.importedAt.localeCompare(a.importedAt),
      ),
    preferences: prefs
      ? {
          ...structuredClone(defaultPreferences),
          ...JSON.parse(prefs.data),
        }
      : structuredClone(defaultPreferences),
  };
}

function groupFromArchive(archive: Archive, id: unknown): ItemGroup {
  requireValue(validId(id), 'Choose a valid group.');
  const group = archive.groups.find((entry) => entry.id === id);
  if (!group) throw new ArchiveError('This group is no longer available.', 404);
  return group;
}

function validateGroupName(value: unknown): string {
  requireValue(
    safeText(value, 120) && (value as string).trim().length > 0,
    'Give the group a name (up to 120 characters).',
  );
  return (value as string).trim();
}

function validateGroupMembers(
  archive: Archive,
  value: unknown,
  original?: ItemGroup,
): string[] {
  requireValue(
    Array.isArray(value) &&
      value.length <= 500 &&
      value.every(validId) &&
      new Set(value).size === value.length,
    'Choose up to 500 different item IDs for this group.',
  );
  const itemIds = value as string[];
  for (const id of itemIds) {
    const item = archive.items.find((entry) => entry.id === id);
    requireValue(item, 'Every group member must belong to your archive.');
    requireValue(
      item.status !== 'trashed' || original?.itemIds.includes(id),
      'Restore an item before adding it to a group.',
    );
    if (
      archive.groups.some(
        (group) => group.id !== original?.id && group.itemIds.includes(id),
      )
    )
      throw new ArchiveError(
        'An item already belongs to another group. Move it explicitly from its item page.',
        409,
      );
  }
  return [...itemIds];
}

function checkGroupRevision(group: ItemGroup, expected: unknown) {
  requireValue(
    typeof expected === 'string' && expected.length <= 50,
    'Send the group’s last-read updatedAt value.',
  );
  if (expected !== group.updatedAt)
    throw new ArchiveError(
      'This group changed since you opened it. Reload before applying your changes.',
      409,
    );
}

function groupWrite(account: string, group: ItemGroup) {
  return getDb()
    .prepare('UPDATE item_groups SET data=? WHERE id=? AND account_id=?')
    .bind(JSON.stringify(group), recordKey(account, group.id), account);
}

export async function createGroup(
  account: string,
  values: { name: string; itemIds?: string[] },
  requestId?: string,
): Promise<ItemGroup> {
  requireValue(
    values && typeof values === 'object' && !Array.isArray(values),
    'Provide a group name and its chosen items.',
  );
  requireValue(
    requestId === undefined ||
      (typeof requestId === 'string' &&
        /^[A-Za-z0-9_.:-]{1,180}$/.test(requestId)),
    'Request IDs must use 1–180 letters, numbers, dots, colons, dashes or underscores.',
  );
  const archive = await getArchive(account);
  const id = requestId
    ? `group-${createHash('sha256').update(requestId).digest('hex')}`
    : crypto.randomUUID();
  const existing = archive.groups.find((group) => group.id === id);
  if (existing) return existing;
  const now = nextUpdatedAt();
  const group: ItemGroup = {
    id,
    name: validateGroupName(values.name),
    itemIds: validateGroupMembers(
      archive,
      values.itemIds === undefined ? [] : values.itemIds,
    ),
    createdAt: now,
    updatedAt: now,
  };
  await getDb()
    .prepare('INSERT INTO item_groups (id,account_id,data) VALUES (?,?,?)')
    .bind(recordKey(account, id), account, JSON.stringify(group))
    .run();
  return group;
}

export async function updateGroup(
  account: string,
  id: string,
  patch: { name?: string; itemIds?: string[] },
  expectedUpdatedAt: string,
): Promise<ItemGroup> {
  requireValue(
    patch &&
      typeof patch === 'object' &&
      !Array.isArray(patch) &&
      Object.keys(patch).length > 0 &&
      Object.keys(patch).every((key) => ['name', 'itemIds'].includes(key)),
    'Change the group name or its chosen items.',
  );
  const archive = await getArchive(account);
  const original = groupFromArchive(archive, id);
  checkGroupRevision(original, expectedUpdatedAt);
  const group: ItemGroup = {
    ...original,
    name: 'name' in patch ? validateGroupName(patch.name) : original.name,
    itemIds:
      'itemIds' in patch
        ? validateGroupMembers(archive, patch.itemIds, original)
        : original.itemIds,
    updatedAt: nextUpdatedAt(original.updatedAt),
  };
  await groupWrite(account, group).run();
  return group;
}

export async function deleteGroup(
  account: string,
  id: string,
  expectedUpdatedAt: string,
) {
  const group = groupFromArchive(await getArchive(account), id);
  checkGroupRevision(group, expectedUpdatedAt);
  await getDb()
    .prepare('DELETE FROM item_groups WHERE id=? AND account_id=?')
    .bind(recordKey(account, id), account)
    .run();
  return { id };
}

export async function setItemGroup(
  account: string,
  itemId: string,
  groupId: string | null,
  expectedGroupId: string | null,
) {
  requireValue(
    validId(itemId) &&
      (groupId === null || validId(groupId)) &&
      (expectedGroupId === null || validId(expectedGroupId)),
    'Choose an item, a group or null, and its last-read group ID.',
  );
  const archive = await getArchive(account);
  const item = archive.items.find((entry) => entry.id === itemId);
  if (!item) throw new ArchiveError('This item is no longer available.', 404);
  const previous = archive.groups.find((group) =>
    group.itemIds.includes(itemId),
  );
  if ((previous?.id ?? null) !== expectedGroupId)
    throw new ArchiveError(
      'This item’s group changed since you opened it. Reload before moving it.',
      409,
    );
  const target =
    groupId === null ? undefined : groupFromArchive(archive, groupId);
  if ((previous?.id ?? null) === groupId) return { itemId, groupId };
  requireValue(
    !target || item.status !== 'trashed',
    'Restore an item before adding it to a group.',
  );
  requireValue(
    !target || target.itemIds.length < 500,
    'A group can contain up to 500 items.',
  );
  const changes: ItemGroup[] = [];
  if (previous)
    changes.push({
      ...previous,
      itemIds: previous.itemIds.filter((id) => id !== itemId),
      updatedAt: nextUpdatedAt(previous.updatedAt),
    });
  if (target)
    changes.push({
      ...target,
      itemIds: [...target.itemIds, itemId],
      updatedAt: nextUpdatedAt(target.updatedAt),
    });
  // Moving an item changes both membership lists in one transaction.
  if (changes.length)
    await getDb().batch(changes.map((group) => groupWrite(account, group)));
  return { itemId, groupId };
}

function validProfile(id: string) {
  if (id === 'unassigned') return true;
  return Boolean(
    getDb().connection.prepare('SELECT 1 FROM profiles WHERE id=?').get(id),
  );
}

function validateItem(item: WardrobeItem) {
  requireValue(item && validId(item.id), 'Each piece needs a valid ID.');
  requireValue(
    safeText(item.sourceKey, 240) && item.sourceKey.length > 0,
    'Each piece needs a source reference.',
  );
  requireValue(
    validProfile(item.owner) && statuses.includes(item.status),
    'Choose a valid owner and wardrobe status.',
  );
  requireValue(
    item.status !== 'owned' || item.owner !== 'unassigned',
    'Assign an owner before adding a piece to a wardrobe.',
  );
  requireValue(
    item.status === 'trashed'
      ? item.trash &&
          statuses.includes(item.trash.previousStatus) &&
          item.trash.previousStatus !== ('trashed' as string) &&
          safeText(item.trash.trashedAt, 50) &&
          !Number.isNaN(Date.parse(item.trash.trashedAt))
      : item.trash === undefined,
    'Trash records need a valid previous status and removal date.',
  );
  requireValue(
    categories.includes(item.category),
    'Choose a valid collection category.',
  );
  requireValue(
    safeText(item.name, 200) && item.name.trim().length > 0,
    'Give the piece a name (up to 200 characters).',
  );
  for (const field of ['brand', 'colour', 'size', 'fit', 'pattern'] as const)
    requireValue(
      safeText(item[field], 160),
      `${field} must be text up to 160 characters.`,
    );
  requireValue(
    safeText(item.notes, 3000),
    'Notes must be no more than 3,000 characters.',
  );
  requireValue(
    typeof item.favourite === 'boolean',
    'Favourite must be true or false.',
  );
  for (const field of ['purchaseVendor', 'purchaseLocation'] as const)
    requireValue(
      item[field] === undefined || safeText(item[field], 200),
      `${field} must be text up to 200 characters.`,
    );
  const purchaseDate = item.purchaseDate;
  requireValue(
    purchaseDate === undefined ||
      purchaseDate === '' ||
      (typeof purchaseDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) &&
        Number.isFinite(Date.parse(purchaseDate)) &&
        new Date(purchaseDate).toISOString().slice(0, 10) === purchaseDate),
    'Purchase date must be a valid date (YYYY-MM-DD), or empty to clear it.',
  );
  const priceError = itemPriceError(item.price);
  requireValue(!priceError, priceError || 'The price is invalid.');
  const saleError = validateSale(item.sale, {
    ...item,
    photos: itemPhotos(item),
  });
  requireValue(!saleError, saleError || 'The sale listing is invalid.');
  requireValue(
    safeText(item.updatedAt, 50) && !Number.isNaN(Date.parse(item.updatedAt)),
    'The piece date is invalid.',
  );
  validatePhotos(item.photos);
  validatePhotos(itemPhotos(item));
  requireValue(
    item.location === undefined || safeText(item.location, 160),
    'Location must be text up to 160 characters.',
  );
  requireValue(
    item.details === undefined ||
      (Array.isArray(item.details) &&
        item.details.length <= 30 &&
        item.details.every(
          (detail) =>
            detail &&
            safeText(detail.label, 100) &&
            safeText(detail.value, 1000),
        )),
    'Details need up to 30 labelled values.',
  );
  if (item.fragrance !== undefined) {
    const fragrance = item.fragrance;
    requireValue(
      fragrance &&
        safeText(fragrance.concentration, 160) &&
        safeText(fragrance.family, 160) &&
        safeText(fragrance.notes, 1500) &&
        typeof fragrance.variantConfirmed === 'boolean',
      'Fragrance details must include concentration, scent family, notes, and edition confirmation.',
    );
  }
  requireValue(
    ['light', 'medium', 'warm'].includes(item.warmth),
    'Choose a valid warmth.',
  );
  requireValue(
    item.quantity === null ||
      (Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 100),
    'Quantity must be a whole number from 1 to 100, or unknown.',
  );
  requireValue(
    item.imageId === null || validId(item.imageId),
    'The image reference is invalid.',
  );
  requireValue(
    item.purchaseId === null || validId(item.purchaseId),
    'The purchase reference is invalid.',
  );
  requireValue(
    validUrl(item.productUrl),
    'Product links must be valid HTTPS URLs.',
  );
}

function validatePurchase(purchase: SourceFacts) {
  requireValue(
    purchase && validId(purchase.id) && safeText(purchase.sourceKey, 240),
    'The purchase reference is invalid.',
  );
  for (const field of [
    'retailer',
    'orderId',
    'orderDate',
    'parcel',
    'sourceStatus',
    'article',
    'name',
    'colour',
    'size',
  ] as const)
    requireValue(
      safeText(purchase[field], 500),
      `Purchase ${field} is invalid.`,
    );
  requireValue(
    [
      'delivered',
      'in_transit',
      'return_unknown',
      'returned',
      'cancelled',
    ].includes(purchase.fulfillment),
    'The purchase delivery status is invalid.',
  );
  requireValue(
    Number.isInteger(purchase.quantity) &&
      purchase.quantity > 0 &&
      purchase.quantity <= 50,
    'Purchase quantity must be between 1 and 50.',
  );
  for (const field of ['price', 'paid'] as const)
    requireValue(
      purchase[field] === null ||
        (typeof purchase[field] === 'number' &&
          Number.isFinite(purchase[field]) &&
          purchase[field] >= 0),
      'Purchase prices must be positive numbers or unknown.',
    );
  requireValue(
    validUrl(purchase.productUrl) && validUrl(purchase.sourceImageUrl),
    'Purchase links must use HTTPS.',
  );
  requireValue(
    purchase.imageId === null || validId(purchase.imageId),
    'The purchase image reference is invalid.',
  );
  validatePhotos(purchase.photos);
}

function validImageBytes(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg')
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png')
    return (
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    );
  if (type === 'image/webp')
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    );
  if (type === 'image/gif')
    return String.fromCharCode(...bytes.slice(0, 3)) === 'GIF';
  if (type === 'image/avif')
    return (
      String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp' &&
      /avif|avis/.test(String.fromCharCode(...bytes.slice(8, 32)))
    );
  return false;
}

export async function storeImage(
  account: string,
  id: string,
  bytes: Uint8Array,
  type: string,
) {
  requireValue(validId(id), 'The image ID is invalid.');
  requireValue(
    bytes.byteLength > 0 && bytes.byteLength <= 8 * 1024 * 1024,
    'Choose a photo smaller than 8 MB.',
  );
  requireValue(
    validImageBytes(bytes, type),
    'Use a valid JPG, PNG, WebP, AVIF, or GIF photo.',
  );
  const objectKey = `${encodeURIComponent(account)}/${id}`;
  await getImageStore().put(objectKey, bytes, {
    httpMetadata: { contentType: type, cacheControl: 'private, no-store' },
  });
  await getDb()
    .prepare(
      'INSERT INTO images (id,account_id,object_key,content_type) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET content_type=excluded.content_type, object_key=excluded.object_key',
    )
    .bind(recordKey(account, id), account, objectKey, type)
    .run();
}

export async function importArchive(account: string, payload: ImportPayload) {
  requireValue(
    payload?.version === 1,
    'Choose a My Stuff import file (version 1).',
  );
  requireValue(
    Array.isArray(payload.purchases) && Array.isArray(payload.items),
    'The import needs purchases and items arrays.',
  );
  requireValue(
    payload.purchases.length <= 1000 && payload.items.length <= 1000,
    'Import up to 1,000 purchase lines or pieces at a time.',
  );
  requireValue(
    safeText(payload.label, 200) && safeText(payload.source, 100),
    'The import label or source is invalid.',
  );
  requireValue(
    Number.isInteger(payload.orderCount) &&
      payload.orderCount >= 0 &&
      Number.isInteger(payload.listedItemCount) &&
      payload.listedItemCount >= 0,
    'The import counts are invalid.',
  );
  for (const purchase of payload.purchases) validatePurchase(purchase);
  for (const item of payload.items) {
    validateItem(item);
    requireValue(
      item.purchaseId === null,
      'Manual import entries cannot attach to purchase lines.',
    );
  }
  requireValue(
    payload.images === undefined ||
      (Array.isArray(payload.images) && payload.images.length <= 200),
    'Import up to 200 photos at a time.',
  );
  const db = getDb();
  const oldPurchaseRows = await db
    .prepare('SELECT data FROM purchase_lines WHERE account_id=?')
    .bind(account)
    .all<{ data: string }>();
  const oldPurchases = oldPurchaseRows.results.map(
    (row) => JSON.parse(row.data) as SourceFacts,
  );
  for (const purchase of payload.purchases) {
    const previous = oldPurchases.find(
      (value) => value.sourceKey === purchase.sourceKey,
    );
    requireValue(
      !previous || previous.id === purchase.id,
      'A purchase reference changed its ID. Reuse the original import identifiers.',
    );
    requireValue(
      !oldPurchases.some(
        (value) =>
          value.id === purchase.id && value.sourceKey !== purchase.sourceKey,
      ),
      'A purchase ID already belongs to another source reference.',
    );
    if (previous) {
      purchase.photos = [
        ...new Map(
          [...(previous.photos || []), ...(purchase.photos || [])].map(
            (photo) => [photo.imageId, photo],
          ),
        ).values(),
      ];
      purchase.imageId =
        purchase.photos.find((photo) => photo.kind === 'product')?.imageId ||
        null;
      validatePhotos(purchase.photos);
    }
  }
  const incoming = [
    ...payload.purchases.flatMap(purchaseItems),
    ...payload.items,
  ];
  requireValue(
    new Set(incoming.map((item) => item.sourceKey)).size === incoming.length,
    'The import contains duplicate source references.',
  );
  requireValue(
    new Set(incoming.map((item) => item.id)).size === incoming.length,
    'The import contains duplicate piece IDs.',
  );
  requireValue(
    new Set(payload.purchases.map((item) => item.id)).size ===
      payload.purchases.length,
    'The import contains duplicate purchase IDs.',
  );
  requireValue(
    new Set(payload.purchases.map((item) => item.sourceKey)).size ===
      payload.purchases.length,
    'The import contains duplicate purchase references.',
  );
  for (const item of incoming) validateItem(item);
  const decoded = (payload.images || []).map((image: ImportImage) => {
    requireValue(
      image &&
        validId(image.id) &&
        typeof image.base64 === 'string' &&
        image.base64.length < 12 * 1024 * 1024,
      'An imported image is invalid or too large.',
    );
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(image.base64), (character) =>
        character.charCodeAt(0),
      );
    } catch {
      throw new ArchiveError('An imported image could not be decoded.');
    }
    requireValue(
      bytes.byteLength <= 8 * 1024 * 1024 &&
        validImageBytes(bytes, image.contentType),
      'An imported image is not a supported photo or exceeds 8 MB.',
    );
    return { ...image, bytes };
  });
  requireValue(
    decoded.length <= 200 &&
      decoded.reduce((sum, image) => sum + image.bytes.byteLength, 0) <=
        40 * 1024 * 1024,
    'Import up to 200 photos and 40 MB at a time.',
  );
  const existing = await getArchive(account);
  for (const item of incoming) {
    requireValue(
      !existing.items.some(
        (value) => value.id === item.id && value.sourceKey !== item.sourceKey,
      ),
      'A piece ID already belongs to another source reference.',
    );
    requireValue(
      !existing.items.some(
        (value) => value.sourceKey === item.sourceKey && value.id !== item.id,
      ),
      'A piece reference changed its ID. Reuse the original import identifiers.',
    );
  }
  const bySource = new Map(
    existing.items.map((item) => [item.sourceKey, item]),
  );
  const facts = new Map(
    payload.purchases.map((purchase) => [purchase.id, purchase]),
  );
  let newItems = 0;
  const merged = incoming.map((item) => {
    const previous = bySource.get(item.sourceKey);
    if (!previous) {
      newItems++;
      return item;
    }
    return reconcileItem(
      previous,
      item,
      item.purchaseId ? facts.get(item.purchaseId) : undefined,
    );
  });
  for (const item of merged)
    validateItem({
      ...item,
      facts: item.purchaseId
        ? facts.get(item.purchaseId) || item.facts
        : undefined,
    });
  await validateImageReferences(
    account,
    [...merged, ...payload.purchases],
    decoded.map((image) => image.id),
  );
  for (const image of decoded)
    await storeImage(account, image.id, image.bytes, image.contentType);
  const statements = payload.purchases.map((purchase) =>
    db
      .prepare(
        'INSERT INTO purchase_lines (id,account_id,source_key,data) VALUES (?,?,?,?) ON CONFLICT(account_id,source_key) DO UPDATE SET data=excluded.data',
      )
      .bind(
        recordKey(account, purchase.id),
        account,
        purchase.sourceKey,
        JSON.stringify(purchase),
      ),
  );
  for (const item of merged) {
    const { facts: _, ...data } = item;
    statements.push(
      db
        .prepare(
          'INSERT INTO wardrobe_items (id,account_id,source_key,purchase_id,data) VALUES (?,?,?,?,?) ON CONFLICT(account_id,source_key) DO UPDATE SET data=excluded.data',
        )
        .bind(
          recordKey(account, item.id),
          account,
          item.sourceKey,
          item.purchaseId,
          JSON.stringify(data),
        ),
    );
  }
  const batch: ImportBatch = {
    id: crypto.randomUUID(),
    source: payload.source,
    label: payload.label,
    importedAt: new Date().toISOString(),
    orderCount: payload.orderCount,
    listedItemCount: payload.listedItemCount,
    newItems,
    updatedPurchases: payload.purchases.length,
  };
  statements.push(
    db
      .prepare('INSERT INTO import_batches (id,account_id,data) VALUES (?,?,?)')
      .bind(recordKey(account, batch.id), account, JSON.stringify(batch)),
  );
  await db.batch(statements);
  console.info(
    JSON.stringify({
      event: 'archive.import',
      source: payload.source,
      purchases: payload.purchases.length,
      newItems,
      images: decoded.length,
    }),
  );
  return batch;
}

async function selectedItems(
  account: string,
  ids: string[],
  expectedUpdatedAt?: Record<string, string>,
) {
  requireValue(
    Array.isArray(ids) &&
      ids.length > 0 &&
      ids.length <= 500 &&
      ids.every(validId),
    'Select between 1 and 500 pieces.',
  );
  const archive = await getArchive(account);
  const selected = archive.items.filter((item) => ids.includes(item.id));
  if (selected.length !== new Set(ids).size)
    throw new ArchiveError('One of these pieces is no longer available.', 404);
  if (expectedUpdatedAt !== undefined) {
    requireValue(
      expectedUpdatedAt &&
        typeof expectedUpdatedAt === 'object' &&
        !Array.isArray(expectedUpdatedAt) &&
        selected.every(
          (item) => typeof expectedUpdatedAt[item.id] === 'string',
        ),
      'Provide the last-read update timestamp for every selected item.',
    );
    if (selected.some((item) => item.updatedAt !== expectedUpdatedAt[item.id]))
      throw new ArchiveError(
        'An item changed since you opened it. Reload the latest item and apply your changes again.',
        409,
      );
  }
  return selected;
}

export async function updateItems(
  account: string,
  ids: string[],
  patch: Partial<WardrobeItem>,
  expectedUpdatedAt?: Record<string, string>,
) {
  requireValue(
    patch && typeof patch === 'object',
    'Provide the changes to save.',
  );
  const selected = await selectedItems(account, ids, expectedUpdatedAt);
  requireValue(
    patch.status !== 'trashed' &&
      !('trash' in patch) &&
      selected.every((item) => item.status !== 'trashed'),
    'Use Move to Trash or Restore before editing removed items.',
  );
  const editable = [
    'owner',
    'status',
    'name',
    'brand',
    'category',
    'colour',
    'size',
    'quantity',
    'fit',
    'pattern',
    'warmth',
    'notes',
    'favourite',
    'price',
    'sale',
    'imageId',
    'photos',
    'fragrance',
    'details',
    'location',
    'purchaseDate',
    'purchaseVendor',
    'purchaseLocation',
    'productUrl',
  ] as const;
  const updates = selected.map((item) => {
    const next = { ...item };
    for (const field of editable)
      if (field in patch)
        (next as unknown as Record<string, unknown>)[field] = patch[field];
    // Older clients replace the sale object without knowing its currency.
    if (
      patch.sale &&
      typeof patch.sale === 'object' &&
      !Array.isArray(patch.sale) &&
      patch.sale.currency === undefined &&
      item.sale?.currency !== undefined
    )
      next.sale = { ...patch.sale, currency: item.sale.currency };
    next.updatedAt = nextUpdatedAt(item.updatedAt);
    if (
      next.status !== 'owned' &&
      next.sale?.published &&
      !patch.sale?.published
    )
      next.sale = { ...next.sale, published: false };
    validateItem(next);
    return next;
  });
  for (const item of updates)
    requireValue(
      item.status !== 'owned' ||
        !['returned', 'cancelled', 'in_transit'].includes(
          item.facts?.fulfillment || '',
        ),
      'This purchase must be confirmed as delivered before it can enter the wardrobe.',
    );
  await validateImageReferences(account, updates);
  const statements = updates.map((item) => {
    const { facts: _, ...data } = item;
    return getDb()
      .prepare('UPDATE wardrobe_items SET data=? WHERE id=? AND account_id=?')
      .bind(JSON.stringify(data), recordKey(account, item.id), account);
  });
  await getDb().batch(statements);
  return updates;
}

export async function changeTrash(
  account: string,
  ids: string[],
  action: 'trash' | 'restore',
  expectedUpdatedAt?: Record<string, string>,
) {
  const selected = await selectedItems(account, ids, expectedUpdatedAt);
  requireValue(
    selected.every((item) =>
      action === 'trash'
        ? item.status !== 'trashed'
        : item.status === 'trashed' && item.trash,
    ),
    action === 'trash'
      ? 'Some selected items are already in Trash.'
      : 'Select removed items to restore.',
  );
  const updates = selected.map((item) => {
    const now = nextUpdatedAt(item.updatedAt);
    const next = { ...item, updatedAt: now };
    if (action === 'trash') {
      next.trash = {
        previousStatus: item.status as Exclude<
          WardrobeItem['status'],
          'trashed'
        >,
        trashedAt: now,
      };
      next.status = 'trashed';
      if (next.sale) next.sale = { ...next.sale, published: false };
    } else {
      next.status = item.trash!.previousStatus;
      delete next.trash;
      const fulfillment = item.facts?.fulfillment;
      if (fulfillment === 'returned' || fulfillment === 'cancelled')
        next.status = 'returned';
      else if (
        fulfillment === 'in_transit' &&
        !['retired', 'outgrown', 'returned'].includes(next.status)
      )
        next.status = 'awaiting_delivery';
      else if (
        next.status === 'awaiting_delivery' &&
        fulfillment === 'delivered'
      )
        next.status = 'review';
      if (next.status === 'owned' && next.owner === 'unassigned')
        next.status = 'review';
    }
    validateItem(next);
    return next;
  });
  await getDb().batch(
    updates.map((item) => {
      const { facts: _, ...data } = item;
      return getDb()
        .prepare('UPDATE wardrobe_items SET data=? WHERE id=? AND account_id=?')
        .bind(JSON.stringify(data), recordKey(account, item.id), account);
    }),
  );
  console.info(
    JSON.stringify({
      event: 'archive.trash',
      action,
      count: updates.length,
    }),
  );
  return updates;
}

export async function addItem(
  account: string,
  values: Partial<WardrobeItem>,
  requestId?: string,
) {
  requireValue(
    values &&
      typeof values === 'object' &&
      !Array.isArray(values) &&
      values.status !== 'trashed' &&
      !('trash' in values),
    'Add an active item before moving it to Trash.',
  );
  const id = crypto.randomUUID();
  requireValue(
    requestId === undefined ||
      (typeof requestId === 'string' &&
        /^[A-Za-z0-9_.:-]{1,180}$/.test(requestId)),
    'Request IDs must use 1–180 letters, numbers, dots, colons, dashes or underscores.',
  );
  const sourceKey = requestId ? `request:${requestId}` : `manual:${id}`;
  if (requestId) {
    const existing = (await getArchive(account)).items.find(
      (item) => item.sourceKey === sourceKey,
    );
    if (existing) return existing;
  }
  const item: WardrobeItem = {
    id,
    sourceKey: `manual:${id}`,
    purchaseId: null,
    owner: 'me',
    status: 'owned',
    name: '',
    brand: '',
    category: 'other',
    colour: '',
    size: '',
    quantity: 1,
    fit: '',
    pattern: '',
    warmth: 'light',
    notes: '',
    favourite: false,
    imageId: null,
    productUrl: null,
    updatedAt: new Date().toISOString(),
    ...values,
  };
  item.id = id;
  item.updatedAt = nextUpdatedAt();
  item.sourceKey = sourceKey;
  item.purchaseId = null;
  delete item.facts;
  validateItem(item);
  await validateImageReferences(account, [item]);
  await getDb()
    .prepare(
      'INSERT INTO wardrobe_items (id,account_id,source_key,purchase_id,data) VALUES (?,?,?,?,?)',
    )
    .bind(
      recordKey(account, id),
      account,
      item.sourceKey,
      null,
      JSON.stringify(item),
    )
    .run();
  return item;
}

export async function saveOutfit(account: string, values: Outfit) {
  requireValue(
    values && validProfile(values.owner) && values.owner !== 'unassigned',
    'Choose a wardrobe for this outfit.',
  );
  requireValue(
    safeText(values.name, 120) && values.name.trim().length > 0,
    'Give the outfit a name.',
  );
  requireValue(
    occasions.includes(values.occasion) &&
      ['warm', 'mild', 'cool'].includes(values.temperature),
    'Choose an occasion and temperature.',
  );
  requireValue(
    Array.isArray(values.itemIds) &&
      values.itemIds.length > 0 &&
      values.itemIds.length <= 12 &&
      new Set(values.itemIds).size === values.itemIds.length,
    'Choose 1–12 different pieces.',
  );
  const archive = await getArchive(account);
  requireValue(
    values.itemIds.every((id) =>
      archive.items.some(
        (item) =>
          item.id === id &&
          isAvailable(item, values.owner) &&
          supportsStyling(item),
      ),
    ),
    'Outfits can only contain available pieces from the same wardrobe.',
  );
  const outfit: Outfit = {
    id: crypto.randomUUID(),
    owner: values.owner,
    name: values.name,
    occasion: values.occasion,
    temperature: values.temperature,
    itemIds: values.itemIds,
    notes: safeText(values.notes, 3000) ? values.notes : '',
    createdAt: new Date().toISOString(),
  };
  await getDb()
    .prepare('INSERT INTO outfits (id,account_id,data) VALUES (?,?,?)')
    .bind(recordKey(account, outfit.id), account, JSON.stringify(outfit))
    .run();
  return outfit;
}

export async function savePreferences(account: string, values: Preferences) {
  requireValue(
    values &&
      (values.blurPrices === undefined ||
        typeof values.blurPrices === 'boolean'),
    'Blur prices must be true or false.',
  );
  await getDb()
    .prepare(
      'INSERT INTO preferences (account_id,data) VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET data=excluded.data',
    )
    .bind(
      account,
      JSON.stringify({
        ...values,
        blurPrices:
          values.blurPrices ??
          (await getArchive(account)).preferences.blurPrices ??
          true,
      }),
    )
    .run();
}

export function errorResponse(error: unknown, action: string) {
  if (error instanceof SyntaxError)
    error = new ArchiveError(
      'The import is not valid JSON. Check the file and try again.',
    );
  const known = error instanceof ArchiveError ? error : null;
  console.error(
    JSON.stringify({
      event: 'archive.error',
      action,
      status: known ? known.status : 500,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return Response.json(
    {
      error: known
        ? known.message
        : 'The archive could not save this change. Try again in a moment.',
    },
    {
      status: known ? known.status : 500,
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}
