import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const shopInquiries = sqliteTable(
  'shop_inquiries',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    itemId: text('item_id').notNull(),
    itemName: text('item_name').notNull(),
    name: text('name').notNull(),
    contact: text('contact').notNull(),
    comment: text('comment').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('inquiry_account_created').on(table.accountId, table.createdAt),
  ],
);

export const shopRateLimits = sqliteTable('shop_rate_limits', {
  bucket: text('bucket').primaryKey(),
  startedAt: integer('started_at').notNull(),
  attempts: integer('attempts').notNull(),
});
