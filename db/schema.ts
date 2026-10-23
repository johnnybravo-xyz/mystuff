import { sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export { shopInquiries, shopRateLimits } from './shop-schema';
export const itemGroups = sqliteTable(
  'item_groups',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    data: text('data').notNull(),
  },
  (table) => [index('group_account').on(table.accountId)],
);
export const purchases = sqliteTable(
  'purchase_lines',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    sourceKey: text('source_key').notNull(),
    data: text('data').notNull(),
  },
  (table) => [
    uniqueIndex('purchase_account_source').on(table.accountId, table.sourceKey),
  ],
);
export const items = sqliteTable(
  'wardrobe_items',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    sourceKey: text('source_key').notNull(),
    purchaseId: text('purchase_id'),
    data: text('data').notNull(),
  },
  (table) => [
    uniqueIndex('item_account_source').on(table.accountId, table.sourceKey),
    index('item_account').on(table.accountId),
  ],
);
export const outfits = sqliteTable(
  'outfits',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    data: text('data').notNull(),
  },
  (table) => [index('outfit_account').on(table.accountId)],
);
export const batches = sqliteTable(
  'import_batches',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    data: text('data').notNull(),
  },
  (table) => [index('batch_account').on(table.accountId)],
);
export const preferences = sqliteTable('preferences', {
  accountId: text('account_id').primaryKey(),
  data: text('data').notNull(),
});
export const images = sqliteTable(
  'images',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
  },
  (table) => [index('image_account').on(table.accountId)],
);
