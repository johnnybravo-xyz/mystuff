// Version 2 adds private buyer inquiries and two persistent, global request buckets.
export const shopMigration = `
CREATE TABLE shop_inquiries (
  id text PRIMARY KEY NOT NULL,
  account_id text NOT NULL,
  item_id text NOT NULL,
  item_name text NOT NULL,
  name text NOT NULL,
  contact text NOT NULL,
  comment text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX inquiry_account_created ON shop_inquiries(account_id, created_at);
CREATE TABLE shop_rate_limits (
  bucket text PRIMARY KEY NOT NULL,
  started_at integer NOT NULL,
  attempts integer NOT NULL
);
`;
