export const platformMigration = `
CREATE TABLE installations (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL UNIQUE,
  setup_complete INTEGER NOT NULL DEFAULT 0,
  setup_token_digest TEXT,
  setup_token_created_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE installation_settings (
  installation_id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE CASCADE
);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  installation_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX user_installation ON users(installation_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  token_digest TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX session_expiry ON sessions(expires_at);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX profile_account_label ON profiles(account_id, label);
CREATE INDEX profile_account_position ON profiles(account_id, position);

CREATE TABLE login_attempts (
  scope TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  blocked_until TEXT
);

INSERT INTO installations (
  id, account_id, setup_complete, created_at, updated_at
)
SELECT
  'main',
  'owner',
  CASE WHEN
    EXISTS(SELECT 1 FROM wardrobe_items LIMIT 1)
    OR EXISTS(SELECT 1 FROM preferences LIMIT 1)
    OR EXISTS(SELECT 1 FROM images LIMIT 1)
  THEN 1 ELSE 0 END,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

INSERT INTO installation_settings (installation_id, data) VALUES (
  'main',
  '{"title":"My Stuff","subtitle":"Everything you own, remembered.","locale":"en-GB","timeZone":"UTC","baseCurrency":"USD","enabledCollections":["fashion","home","tech","pantry","pets","other"],"features":{"wishlist":true,"outfits":true,"shop":false},"onboarding":{"dismissed":false}}'
);

INSERT INTO profiles (id, account_id, label, position, created_at, updated_at)
VALUES
  ('me', 'owner', 'Me', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('wife', 'owner', 'Wife', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('child', 'owner', 'Child', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('household', 'owner', 'Household', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

UPDATE installation_settings
SET data = json_set(data, '$.features.shop', json('true'))
WHERE EXISTS (
  SELECT 1 FROM wardrobe_items
  WHERE json_type(data, '$.sale') IS NOT NULL
)
OR EXISTS (SELECT 1 FROM shop_inquiries LIMIT 1);
`;
