// Version 3 adds only explicit, private product groups. Existing items stay independent.
export const groupMigration = `
CREATE TABLE item_groups (
  id text PRIMARY KEY NOT NULL,
  account_id text NOT NULL,
  data text NOT NULL
);
CREATE INDEX group_account ON item_groups(account_id);
`;
