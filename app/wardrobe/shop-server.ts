import { randomUUID } from 'node:crypto';
import { getDb, getImageStore } from '@/db';
import { sameOriginMutation } from '@/app/auth';
import {
  accountForRequest,
  ArchiveError,
  recordKey,
  withArchiveWrite,
} from './server';
import { publicListing, validateInquiry } from './shop-model';
import type { ShopInquiry, ShopListing } from './shop-model';
import type { WardrobeItem } from './model';

const shopAccount = 'owner';
export const shopHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
function listingFromRow(row: {
  data: string;
  purchase_data: string | null;
}): ShopListing | null {
  const item = JSON.parse(row.data) as WardrobeItem;
  if (row.purchase_data) item.facts = JSON.parse(row.purchase_data);
  return publicListing(item);
}
export async function getShopListings(): Promise<ShopListing[]> {
  const rows = await getDb()
    .prepare(`SELECT i.data,p.data AS purchase_data FROM wardrobe_items i
        LEFT JOIN purchase_lines p ON p.id=i.account_id || ':' || i.purchase_id AND p.account_id=i.account_id
        WHERE i.account_id=?`)
    .bind(shopAccount)
    .all<{ data: string; purchase_data: string | null }>();
  return rows.results
    .map(listingFromRow)
    .filter((item): item is ShopListing => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getShopListing(id: string): Promise<ShopListing | null> {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return null;
  const row = await getDb()
    .prepare(`SELECT i.data,p.data AS purchase_data FROM wardrobe_items i
        LEFT JOIN purchase_lines p ON p.id=i.account_id || ':' || i.purchase_id AND p.account_id=i.account_id
        WHERE i.id=? AND i.account_id=?`)
    .bind(recordKey(shopAccount, id), shopAccount)
    .first<{ data: string; purchase_data: string | null }>();
  return row ? listingFromRow(row) : null;
}
export async function getShopImage(
  itemId: string,
  imageId: string,
): Promise<Response> {
  const item = await getShopListing(itemId);
  if (!item?.photoIds.includes(imageId))
    throw new ArchiveError('This photo is unavailable.', 404);
  const record = await getDb()
    .prepare(
      'SELECT object_key,content_type FROM images WHERE id=? AND account_id=?',
    )
    .bind(recordKey(shopAccount, imageId), shopAccount)
    .first<{ object_key: string; content_type: string }>();
  if (
    !record ||
    ![
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ].includes(record.content_type)
  )
    throw new ArchiveError('This photo is unavailable.', 404);
  const object = await getImageStore().get(record.object_key);
  if (!object) throw new ArchiveError('This photo is unavailable.', 404);
  return new Response(object.body, {
    headers: { ...shopHeaders, 'Content-Type': record.content_type },
  });
}

// Global buckets avoid trusting caller-supplied proxy/IP headers. Two fixed rows survive restarts.
export function consumeInquiryLimit(now = Date.now()): void {
  const db = getDb().connection;
  db.exec('BEGIN IMMEDIATE');
  try {
    let exceeded = false;
    for (const [bucket, duration, maximum] of [
      ['minute', 60_000, 8],
      ['hour', 3_600_000, 60],
    ] as const) {
      const row = db
        .prepare(
          'SELECT started_at,attempts FROM shop_rate_limits WHERE bucket=?',
        )
        .get(bucket) as { started_at: number; attempts: number } | undefined;
      const fresh =
        !row || now - row.started_at >= duration || now < row.started_at;
      const attempts = fresh ? 1 : Math.min(row.attempts + 1, maximum + 1);
      db.prepare(
        'INSERT INTO shop_rate_limits(bucket,started_at,attempts) VALUES (?,?,?) ON CONFLICT(bucket) DO UPDATE SET started_at=excluded.started_at,attempts=excluded.attempts',
      ).run(bucket, fresh ? now : row.started_at, attempts);
      exceeded ||= attempts > maximum;
    }
    db.exec('COMMIT');
    if (exceeded)
      throw new ArchiveError('Too many requests. Please try again later.', 429);
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
export async function shopJson(request: Request): Promise<unknown> {
  if (!sameOriginMutation(request))
    throw new ArchiveError('Send this request from the shop page.', 403);
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    throw new ArchiveError('Send a JSON request.', 415);
  if (Number(request.headers.get('content-length')) > 8192)
    throw new ArchiveError('This request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ArchiveError('The request is empty.');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 8192) {
      await reader.cancel();
      throw new ArchiveError('This request is too large.', 413);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new ArchiveError('The request is not valid JSON.');
  }
}
export async function submitShopInquiry(value: unknown): Promise<void> {
  const input = validateInquiry(value);
  if (typeof input === 'string') throw new ArchiveError(input);
  if (input.website) return;
  await withArchiveWrite(async () => {
    const item = await getShopListing(input.itemId);
    if (!item)
      throw new ArchiveError('This listing is no longer available.', 404);
    const db = getDb();
    const count = await db
      .prepare(
        'SELECT count(*) AS count FROM shop_inquiries WHERE account_id=?',
      )
      .bind(shopAccount)
      .first<{ count: number }>();
    if ((count?.count || 0) >= 5000)
      throw new ArchiveError(
        'Inquiries are temporarily unavailable. Please try again later.',
        503,
      );
    await db
      .prepare(
        'INSERT INTO shop_inquiries(id,account_id,item_id,item_name,name,contact,comment,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .bind(
        randomUUID(),
        shopAccount,
        item.id,
        item.name,
        input.name,
        input.contact,
        input.comment,
        new Date().toISOString(),
      )
      .run();
    console.info(
      JSON.stringify({ event: 'shop.inquiry.created', itemId: item.id }),
    );
  });
}
export async function shopSellerAccount(request: Request): Promise<string> {
  if (request.headers.has('authorization'))
    throw new ArchiveError('Sign in to manage shop inquiries.', 401);
  return accountForRequest(request);
}
export async function getShopInquiries(
  account: string,
  offset = 0,
): Promise<{ inquiries: ShopInquiry[]; total: number }> {
  const db = getDb();
  const rows = await db
    .prepare(
      'SELECT id,item_id AS itemId,item_name AS itemName,name,contact,comment,created_at AS createdAt FROM shop_inquiries WHERE account_id=? ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET ?',
    )
    .bind(account, Math.max(0, Math.min(5000, Math.floor(offset))))
    .all<ShopInquiry>();
  const total = await db
    .prepare('SELECT count(*) AS total FROM shop_inquiries WHERE account_id=?')
    .bind(account)
    .first<{ total: number }>();
  return { inquiries: rows.results, total: total?.total || 0 };
}
export async function deleteShopInquiry(
  account: string,
  id: unknown,
): Promise<void> {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id))
    throw new ArchiveError('Choose a valid inquiry.');
  await getDb()
    .prepare('DELETE FROM shop_inquiries WHERE id=? AND account_id=?')
    .bind(id, account)
    .run();
}
