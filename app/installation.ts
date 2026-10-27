import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hash, verify, argon2id } from 'argon2';
import { dataDirectory, getDb } from '@/db';
import { collections } from './wardrobe/model';
import type { Collection } from './wardrobe/model';

export type Profile = { id: string; label: string; position: number };
export type InstallationSettings = {
  title: string;
  subtitle: string;
  locale: string;
  timeZone: string;
  baseCurrency: string;
  enabledCollections: Exclude<Collection, 'all'>[];
  features: { wishlist: boolean; outfits: boolean; shop: boolean };
  shop: {
    title: string;
    introduction: string;
    privacyCopy: string;
    defaultCurrency: string;
  };
  onboarding: { dismissed: boolean };
};
export type SetupInput = Omit<InstallationSettings, 'onboarding' | 'shop'> & {
  displayName: string;
  password: string;
  profiles: string[];
  shopExposureConfirmed?: boolean;
  demoData?: boolean;
};

type InstallationRow = {
  id: string;
  account_id: string;
  setup_complete: number;
  setup_token_digest: string | null;
};
type UserRow = {
  id: string;
  account_id: string;
  display_name: string;
  password_hash: string;
};

const installationId = 'main';
const accountId = 'owner';
const setupCollectionIds = collections.filter(
  (collection): collection is Exclude<Collection, 'all'> =>
    collection !== 'all',
);
let setupLinkLogged = false;
let processSessionKey: Buffer | null = null;

export const defaultInstallationSettings: InstallationSettings = {
  title: 'My Stuff',
  subtitle: 'Everything you own, remembered.',
  locale: 'en-GB',
  timeZone: 'UTC',
  baseCurrency: 'USD',
  enabledCollections: ['fashion', 'home', 'tech', 'pantry', 'pets', 'other'],
  features: { wishlist: true, outfits: true, shop: false },
  shop: {
    title: 'For their next chapter.',
    introduction:
      'Things ready to pass along. Find something you like and get in touch.',
    privacyCopy: 'Arrange the details directly with the owner.',
    defaultCurrency: 'USD',
  },
  onboarding: { dismissed: false },
};

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function sessionDigest(value: string) {
  if (!processSessionKey) {
    const configured = process.env.ARCHIVE_SESSION_SECRET;
    if (configured && configured.length >= 32) {
      processSessionKey = Buffer.from(configured);
    } else {
      const path = resolve(dataDirectory(), 'secrets', 'session.key');
      mkdirSync(dirname(path), { recursive: true });
      try {
        processSessionKey = readFileSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const generated = randomBytes(32);
        try {
          writeFileSync(path, generated, { flag: 'wx', mode: 0o600 });
        } catch (writeError) {
          if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST')
            throw writeError;
        }
        chmodSync(path, 0o600);
        processSessionKey = readFileSync(path);
      }
    }
  }
  return createHmac('sha256', processSessionKey).update(value).digest('hex');
}

function installationRow(): InstallationRow {
  const row = getDb()
    .connection.prepare(
      'SELECT id,account_id,setup_complete,setup_token_digest FROM installations WHERE id=?',
    )
    .get(installationId) as InstallationRow | undefined;
  if (!row) throw new Error('The installation record is missing.');
  return row;
}

function cleanText(value: unknown, fallback: string, maximum: number) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text && text.length <= maximum ? text : fallback;
}

export function parseInstallationSettings(
  value: unknown,
): InstallationSettings {
  const raw = value && typeof value === 'object' ? value : {};
  const candidate = raw as Partial<InstallationSettings>;
  const enabled = Array.isArray(candidate.enabledCollections)
    ? candidate.enabledCollections.filter(
        (entry): entry is Exclude<Collection, 'all'> =>
          typeof entry === 'string' &&
          setupCollectionIds.includes(entry as Exclude<Collection, 'all'>),
      )
    : defaultInstallationSettings.enabledCollections;
  return {
    title: cleanText(candidate.title, defaultInstallationSettings.title, 80),
    subtitle: cleanText(
      candidate.subtitle,
      defaultInstallationSettings.subtitle,
      160,
    ),
    locale: validLocale(candidate.locale)
      ? candidate.locale
      : defaultInstallationSettings.locale,
    timeZone: validTimeZone(candidate.timeZone)
      ? candidate.timeZone
      : defaultInstallationSettings.timeZone,
    baseCurrency: validCurrency(candidate.baseCurrency)
      ? candidate.baseCurrency
      : defaultInstallationSettings.baseCurrency,
    enabledCollections: [...new Set(enabled)],
    features: {
      wishlist: candidate.features?.wishlist !== false,
      outfits: candidate.features?.outfits !== false,
      shop: candidate.features?.shop === true,
    },
    shop: {
      title: cleanText(
        candidate.shop?.title,
        defaultInstallationSettings.shop.title,
        100,
      ),
      introduction: cleanText(
        candidate.shop?.introduction,
        defaultInstallationSettings.shop.introduction,
        300,
      ),
      privacyCopy: cleanText(
        candidate.shop?.privacyCopy,
        defaultInstallationSettings.shop.privacyCopy,
        300,
      ),
      defaultCurrency: validCurrency(candidate.shop?.defaultCurrency)
        ? candidate.shop.defaultCurrency
        : defaultInstallationSettings.shop.defaultCurrency,
    },
    onboarding: {
      dismissed: candidate.onboarding?.dismissed === true,
    },
  };
}

export function validLocale(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 35) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validCurrency(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: value }).format(
      1,
    );
    return true;
  } catch {
    return false;
  }
}

export async function getInstallation() {
  const installation = installationRow();
  const settingsRow = getDb()
    .connection.prepare(
      'SELECT data FROM installation_settings WHERE installation_id=?',
    )
    .get(installationId) as { data: string } | undefined;
  const profileRows = getDb()
    .connection.prepare(
      'SELECT id,label,position FROM profiles WHERE account_id=? ORDER BY position,id',
    )
    .all(accountId) as Profile[];
  const profiles = profileRows.map(({ id, label, position }) => ({
    id,
    label,
    position,
  }));
  let decoded: unknown = {};
  try {
    decoded = settingsRow ? JSON.parse(settingsRow.data) : {};
  } catch {
    console.warn(JSON.stringify({ event: 'installation.settings.invalid' }));
  }
  return {
    id: installation.id,
    accountId: installation.account_id,
    setupComplete: installation.setup_complete === 1,
    settings: parseInstallationSettings(decoded),
    profiles,
  };
}

export async function setupRequired() {
  return installationRow().setup_complete !== 1;
}

function setupTokenPath() {
  return resolve(dataDirectory(), 'secrets', 'setup.token');
}

// The plaintext token lives beside session.key so restarts keep the same link.
// It is valid only while its digest matches the database row.
function storedSetupToken(expectedDigest: string | null) {
  if (!expectedDigest) return null;
  try {
    const token = readFileSync(setupTokenPath(), 'utf8').trim();
    return digest(token) === expectedDigest ? token : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}

export async function ensureSetupClaim() {
  const row = installationRow();
  if (row.setup_complete === 1) return null;
  let token = storedSetupToken(row.setup_token_digest);
  if (!token) {
    token = randomBytes(32).toString('base64url');
    const path = setupTokenPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, token, { mode: 0o600 });
    chmodSync(path, 0o600);
    const now = new Date().toISOString();
    getDb()
      .connection.prepare(
        'UPDATE installations SET setup_token_digest=?,setup_token_created_at=?,updated_at=? WHERE id=? AND setup_complete=0',
      )
      .run(digest(token), now, now, installationId);
    console.info(JSON.stringify({ event: 'installation.setup.token_created' }));
  }
  if (!setupLinkLogged) {
    setupLinkLogged = true;
    console.info(
      JSON.stringify({
        event: 'installation.setup.ready',
        setupPath: `/setup?token=${token}`,
      }),
    );
  }
  return token;
}

export async function verifySetupToken(token: string) {
  const row = installationRow();
  return (
    row.setup_complete !== 1 &&
    Boolean(row.setup_token_digest) &&
    digest(token) === row.setup_token_digest
  );
}

function validateSetup(input: unknown): SetupInput {
  if (!input || typeof input !== 'object')
    throw new Error('Setup details are required.');
  const value = input as Partial<SetupInput>;
  const displayName = cleanText(value.displayName, '', 80);
  const password = typeof value.password === 'string' ? value.password : '';
  const title = cleanText(value.title, '', 80);
  const subtitle = cleanText(value.subtitle, '', 160);
  const profiles = Array.isArray(value.profiles)
    ? [
        ...new Set(
          value.profiles
            .map((label) => cleanText(label, '', 60))
            .filter(Boolean),
        ),
      ]
    : [];
  const enabledCollections = Array.isArray(value.enabledCollections)
    ? [...new Set(value.enabledCollections)].filter(
        (entry): entry is Exclude<Collection, 'all'> =>
          typeof entry === 'string' &&
          setupCollectionIds.includes(entry as Exclude<Collection, 'all'>),
      )
    : [];
  if (!displayName) throw new Error('Enter an administrator name.');
  if (password.length < 12 || password.length > 1024)
    throw new Error('Use a password between 12 and 1,024 characters.');
  if (!title || !subtitle)
    throw new Error('Enter an installation title and subtitle.');
  if (!validLocale(value.locale)) throw new Error('Choose a valid locale.');
  if (!validTimeZone(value.timeZone))
    throw new Error('Choose a valid time zone.');
  if (!validCurrency(value.baseCurrency))
    throw new Error('Choose a valid currency code.');
  if (!profiles.length || profiles.length > 20)
    throw new Error('Add between one and 20 household profiles.');
  if (!enabledCollections.length)
    throw new Error('Enable at least one collection.');
  return {
    displayName,
    password,
    title,
    subtitle,
    locale: value.locale,
    timeZone: value.timeZone,
    baseCurrency: value.baseCurrency,
    profiles,
    enabledCollections,
    features: {
      wishlist: value.features?.wishlist !== false,
      outfits: value.features?.outfits !== false,
      shop: value.features?.shop === true,
    },
    shopExposureConfirmed: value.shopExposureConfirmed === true,
    demoData: value.demoData === true,
  };
}

export async function completeSetup(token: string, input: unknown) {
  const row = installationRow();
  if (row.setup_complete === 1) throw new Error('Setup is already complete.');
  if (!row.setup_token_digest || digest(token) !== row.setup_token_digest)
    throw new Error('This setup link is invalid or has expired.');
  const value = validateSetup(input);
  if (
    value.features.shop &&
    (value.shopExposureConfirmed !== true || !publicShopOrigin())
  )
    throw new Error(
      'Set MYSTUFF_PUBLIC_URL to the public HTTPS origin and confirm shop exposure first.',
    );
  const now = new Date().toISOString();
  const setupProfiles = value.profiles.map((label, position) => ({
    id: randomUUID(),
    label,
    position,
  }));
  const passwordHash = await hash(value.password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const settings: InstallationSettings = {
    title: value.title,
    subtitle: value.subtitle,
    locale: value.locale,
    timeZone: value.timeZone,
    baseCurrency: value.baseCurrency,
    enabledCollections: value.enabledCollections,
    features: value.features,
    shop: defaultInstallationSettings.shop,
    onboarding: { dismissed: false },
  };
  const db = getDb().connection;
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db
      .prepare(
        'SELECT setup_complete,setup_token_digest FROM installations WHERE id=?',
      )
      .get(installationId) as Pick<
      InstallationRow,
      'setup_complete' | 'setup_token_digest'
    >;
    if (
      current.setup_complete === 1 ||
      current.setup_token_digest !== digest(token)
    )
      throw new Error('This setup link is invalid or has expired.');
    db.prepare('DELETE FROM users WHERE installation_id=?').run(installationId);
    db.prepare('DELETE FROM profiles WHERE account_id=?').run(accountId);
    db.prepare(
      'INSERT INTO users(id,installation_id,account_id,display_name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    ).run(
      randomUUID(),
      installationId,
      accountId,
      value.displayName,
      passwordHash,
      now,
      now,
    );
    const insertProfile = db.prepare(
      'INSERT INTO profiles(id,account_id,label,position,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    );
    setupProfiles.forEach(({ id, label, position }) =>
      insertProfile.run(id, accountId, label, position, now, now),
    );
    if (value.demoData) {
      const examples = [
        {
          collection: 'home',
          category: 'kitchenware',
          name: 'Example pour-over kettle',
          notes: 'Synthetic demo item — safe to move to Trash.',
        },
        {
          collection: 'pantry',
          category: 'coffee',
          name: 'Example single-origin coffee',
          notes: 'Synthetic demo item with editable tasting notes.',
        },
        {
          collection: 'pets',
          category: 'pet_supply',
          name: 'Example pet travel carrier',
          notes: 'Synthetic demo item — safe to move to Trash.',
        },
      ].filter((example) =>
        value.enabledCollections.includes(
          example.collection as Exclude<Collection, 'all'>,
        ),
      );
      const insertItem = db.prepare(
        'INSERT INTO wardrobe_items(id,account_id,source_key,purchase_id,data) VALUES(?,?,?,?,?)',
      );
      for (const example of examples) {
        const id = randomUUID();
        const item = {
          id,
          sourceKey: 'demo:' + id,
          purchaseId: null,
          owner: setupProfiles[0].id,
          status: 'owned',
          name: example.name,
          brand: 'Demo',
          category: example.category,
          colour: '',
          size: '',
          quantity: 1,
          fit: '',
          pattern: '',
          warmth: 'light',
          notes: example.notes,
          favourite: false,
          imageId: null,
          photos: [],
          productUrl: null,
          updatedAt: now,
          details: [],
          location: '',
        };
        insertItem.run(
          accountId + ':' + id,
          accountId,
          item.sourceKey,
          null,
          JSON.stringify(item),
        );
      }
    }
    db.prepare(
      'UPDATE installation_settings SET data=? WHERE installation_id=?',
    ).run(JSON.stringify(settings), installationId);
    db.prepare(
      'UPDATE installations SET setup_complete=1,setup_token_digest=NULL,setup_token_created_at=NULL,updated_at=? WHERE id=?',
    ).run(now, installationId);
    db.exec('COMMIT');
    rmSync(setupTokenPath(), { force: true });
    console.info(JSON.stringify({ event: 'installation.setup.completed' }));
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function publicShopOrigin() {
  const value =
    process.env.MYSTUFF_PUBLIC_URL || process.env.ARCHIVE_PUBLIC_URL || '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function profileReferences(id: string) {
  const db = getDb().connection;
  const records = [
    ...db
      .prepare('SELECT data FROM wardrobe_items WHERE account_id=?')
      .all(accountId),
    ...db.prepare('SELECT data FROM outfits WHERE account_id=?').all(accountId),
  ] as { data: string }[];
  if (
    records.some((record) => {
      try {
        return JSON.parse(record.data).owner === id;
      } catch {
        return false;
      }
    })
  )
    return true;
  const preferences = db
    .prepare('SELECT data FROM preferences WHERE account_id=?')
    .get(accountId) as { data: string } | undefined;
  if (!preferences) return false;
  try {
    return Object.hasOwn(JSON.parse(preferences.data).budgets || {}, id);
  } catch {
    return false;
  }
}

export async function updateInstallation(input: unknown) {
  if (!input || typeof input !== 'object')
    throw new Error('Settings are required.');
  const value = input as {
    settings?: Partial<InstallationSettings>;
    profiles?: Array<{ id?: unknown; label?: unknown }>;
    shopExposureConfirmed?: unknown;
  };
  const current = await getInstallation();
  const raw = value.settings;
  if (!raw || typeof raw !== 'object')
    throw new Error('Installation settings are required.');
  if (!validLocale(raw.locale)) throw new Error('Choose a valid locale.');
  if (!validTimeZone(raw.timeZone))
    throw new Error('Choose a valid time zone.');
  if (!validCurrency(raw.baseCurrency))
    throw new Error('Choose a valid currency code.');
  const title = cleanText(raw.title, '', 80);
  const subtitle = cleanText(raw.subtitle, '', 160);
  if (!title || !subtitle)
    throw new Error('Enter an installation title and subtitle.');
  const settings = parseInstallationSettings({
    ...current.settings,
    ...raw,
    title,
    subtitle,
  });
  if (!settings.enabledCollections.length)
    throw new Error('Enable at least one collection.');
  if (
    settings.features.shop &&
    !current.settings.features.shop &&
    (value.shopExposureConfirmed !== true || !publicShopOrigin())
  )
    throw new Error(
      'Set MYSTUFF_PUBLIC_URL to the public HTTPS origin and confirm shop exposure first.',
    );

  if (
    !Array.isArray(value.profiles) ||
    !value.profiles.length ||
    value.profiles.length > 20
  )
    throw new Error('Keep between one and 20 household profiles.');
  const existingIds = new Set(current.profiles.map((profile) => profile.id));
  const nextProfiles = value.profiles.map((profile, position) => ({
    id:
      typeof profile.id === 'string' && existingIds.has(profile.id)
        ? profile.id
        : randomUUID(),
    label: cleanText(profile.label, '', 60),
    position,
  }));
  if (nextProfiles.some((profile) => !profile.label))
    throw new Error('Every profile needs a label up to 60 characters.');
  if (
    new Set(nextProfiles.map((profile) => profile.label.toLocaleLowerCase()))
      .size !== nextProfiles.length
  )
    throw new Error('Profile labels must be different.');
  const removed = current.profiles.filter(
    (profile) => !nextProfiles.some((next) => next.id === profile.id),
  );
  const referenced = removed.find((profile) => profileReferences(profile.id));
  if (referenced)
    throw new Error(
      `Reassign items, outfits, and budgets before deleting ${referenced.label}.`,
    );

  const db = getDb().connection;
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      'UPDATE installation_settings SET data=? WHERE installation_id=?',
    ).run(JSON.stringify(settings), installationId);
    const saveProfile = db.prepare(
      'INSERT INTO profiles(id,account_id,label,position,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,position=excluded.position,updated_at=excluded.updated_at',
    );
    for (const profile of nextProfiles)
      saveProfile.run(
        profile.id,
        accountId,
        profile.label,
        profile.position,
        now,
        now,
      );
    for (const profile of removed)
      db.prepare('DELETE FROM profiles WHERE id=? AND account_id=?').run(
        profile.id,
        accountId,
      );
    db.prepare('UPDATE installations SET updated_at=? WHERE id=?').run(
      now,
      installationId,
    );
    db.exec('COMMIT');
    console.info(JSON.stringify({ event: 'installation.settings.updated' }));
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getInstallation();
}

export async function authenticateAdministrator(password: string) {
  const row = getDb()
    .connection.prepare(
      'SELECT id,account_id,display_name,password_hash FROM users WHERE installation_id=?',
    )
    .get(installationId) as UserRow | undefined;
  if (!row || !(await verify(row.password_hash, password))) return null;
  return row;
}

export function databaseSession(token: string | null) {
  if (!token || token.length > 200) return null;
  const now = new Date().toISOString();
  const row = getDb()
    .connection.prepare(
      'SELECT users.id,users.account_id,users.display_name FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_digest=? AND sessions.expires_at>?',
    )
    .get(sessionDigest(token), now) as
    | Omit<UserRow, 'password_hash'>
    | undefined;
  return row || null;
}

export function createDatabaseSession(user: Omit<UserRow, 'password_hash'>) {
  const token = randomBytes(32).toString('base64url');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const db = getDb().connection;
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(
    createdAt.toISOString(),
  );
  db.prepare(
    'INSERT INTO sessions(id,user_id,account_id,token_digest,created_at,expires_at) VALUES(?,?,?,?,?,?)',
  ).run(
    randomUUID(),
    user.id,
    user.account_id,
    sessionDigest(token),
    createdAt.toISOString(),
    expiresAt.toISOString(),
  );
  return token;
}

export function deleteDatabaseSession(token: string | null) {
  if (!token) return;
  getDb()
    .connection.prepare('DELETE FROM sessions WHERE token_digest=?')
    .run(sessionDigest(token));
}

export function persistentLoginAttempt(now = Date.now()) {
  const scope = 'administrator';
  const duration = 15 * 60 * 1000;
  const db = getDb().connection;
  const row = db
    .prepare('SELECT attempts,started_at FROM login_attempts WHERE scope=?')
    .get(scope) as { attempts: number; started_at: string } | undefined;
  const startedAt = row ? Date.parse(row.started_at) : now;
  if (
    !row ||
    !Number.isFinite(startedAt) ||
    now < startedAt ||
    now - startedAt >= duration
  ) {
    db.prepare(
      'INSERT INTO login_attempts(scope,attempts,started_at,blocked_until) VALUES(?,?,?,NULL) ON CONFLICT(scope) DO UPDATE SET attempts=excluded.attempts,started_at=excluded.started_at,blocked_until=NULL',
    ).run(scope, 1, new Date(now).toISOString());
    return 0;
  }
  if (row.attempts >= 10)
    return Math.max(1, Math.ceil((startedAt + duration - now) / 1000));
  db.prepare('UPDATE login_attempts SET attempts=attempts+1 WHERE scope=?').run(
    scope,
  );
  return 0;
}

export function clearPersistentLoginAttempts() {
  getDb()
    .connection.prepare('DELETE FROM login_attempts WHERE scope=?')
    .run('administrator');
}
