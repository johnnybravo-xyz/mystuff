import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialSchema } from './initial-schema';
import { shopMigration } from './shop-migration';
import { groupMigration } from './group-migration';
import { platformMigration } from './platform-migration';

const currentSchemaVersion = 4;
const migrations = [
  { version: 2, sql: shopMigration },
  { version: 3, sql: groupMigration },
  { version: 4, sql: platformMigration },
] as const;

function createMigrationBackup(
  connection: DatabaseSync,
  databasePath: string,
  version: number,
) {
  const directory = resolve(dirname(databasePath), 'migration-backups');
  mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const path = resolve(
    directory,
    'archive-v' + version + '-' + stamp + '.sqlite',
  );
  connection.exec("VACUUM INTO '" + path.replaceAll("'", "''") + "'");
  const check = new DatabaseSync(path, { readOnly: true });
  try {
    const integrity = check
      .prepare('PRAGMA integrity_check')
      .get()?.integrity_check;
    const copiedVersion = check
      .prepare('PRAGMA user_version')
      .get()?.user_version;
    if (integrity !== 'ok' || copiedVersion !== version)
      throw new Error('Pre-migration database backup failed validation.');
  } finally {
    check.close();
  }
  const backups = readdirSync(directory)
    .filter((name) => name.endsWith('.sqlite'))
    .sort()
    .reverse();
  for (const name of backups.slice(3)) unlinkSync(resolve(directory, name));
  console.info(
    JSON.stringify({ event: 'archive.migration.backup', version, path }),
  );
}

type Binding = string | number | null;
class PreparedQuery {
  connection: DatabaseSync;
  sql: string;
  values: Binding[];
  constructor(connection: DatabaseSync, sql: string, values: Binding[] = []) {
    this.connection = connection;
    this.sql = sql;
    this.values = values;
  }
  bind(...values: Binding[]) {
    return new PreparedQuery(this.connection, this.sql, values);
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.connection.prepare(this.sql).get(...this.values) as T) || null;
  }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return {
      results: this.connection.prepare(this.sql).all(...this.values) as T[],
    };
  }
  runSync() {
    return this.connection.prepare(this.sql).run(...this.values);
  }
  async run() {
    return this.runSync();
  }
}

function verifyExistingSchema(connection: DatabaseSync) {
  const expected = new DatabaseSync(':memory:');
  try {
    expected.exec(initialSchema);
    const tables = expected
      .prepare("SELECT name FROM sqlite_schema WHERE type='table'")
      .all() as {
      name: string;
    }[];
    for (const { name } of tables) {
      const columns = (db: DatabaseSync) =>
        db
          .prepare(
            'SELECT name,type,"notnull",dflt_value,pk FROM pragma_table_info(?) ORDER BY cid',
          )
          .all(name);
      if (
        JSON.stringify(columns(connection)) !==
        JSON.stringify(columns(expected))
      )
        throw new Error(
          `Archive database schema is incompatible: table ${name} does not match version 1.`,
        );
      const indexes = expected
        .prepare('SELECT name,"unique",partial FROM pragma_index_list(?)')
        .all(name) as { name: string; unique: number; partial: number }[];
      for (const index of indexes) {
        const actual = connection
          .prepare(
            'SELECT name,"unique",partial FROM pragma_index_list(?) WHERE name=?',
          )
          .get(name, index.name);
        const indexColumns = (db: DatabaseSync) =>
          db
            .prepare(
              'SELECT seqno,cid,name FROM pragma_index_info(?) ORDER BY seqno',
            )
            .all(index.name);
        if (
          JSON.stringify(actual) !== JSON.stringify(index) ||
          JSON.stringify(indexColumns(connection)) !==
            JSON.stringify(indexColumns(expected))
        )
          throw new Error(
            `Archive database schema is incompatible: index ${index.name} does not match version 1.`,
          );
      }
    }
  } finally {
    expected.close();
  }
}

class ArchiveDatabase {
  connection: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.connection = new DatabaseSync(path);
    try {
      let version = this.connection.prepare('PRAGMA user_version').get()
        ?.user_version as number;
      if (version > currentSchemaVersion)
        throw new Error(
          `Archive database version ${version} is newer than supported version ${currentSchemaVersion}.`,
        );
      this.connection.exec(
        'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;',
      );
      if (version > 0 && version < currentSchemaVersion)
        createMigrationBackup(this.connection, path, version);
      if (version === 0) {
        this.connection.exec('BEGIN IMMEDIATE');
        try {
          const existing = this.connection
            .prepare(
              "SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('import_batches','images','wardrobe_items','outfits','preferences','purchase_lines')",
            )
            .all();
          if (existing.length === 0) this.connection.exec(initialSchema);
          else verifyExistingSchema(this.connection);
          this.connection.exec('PRAGMA user_version=1; COMMIT');
          version = 1;
        } catch (error) {
          this.connection.exec('ROLLBACK');
          throw error;
        }
      }
      for (const migration of migrations) {
        if (version >= migration.version) continue;
        this.connection.exec('BEGIN IMMEDIATE');
        try {
          this.connection.exec(migration.sql);
          this.connection.exec(
            `PRAGMA user_version=${migration.version}; COMMIT`,
          );
          version = migration.version;
          console.info(
            JSON.stringify({
              event: 'archive.migration',
              version: migration.version,
            }),
          );
        } catch (error) {
          this.connection.exec('ROLLBACK');
          throw error;
        }
      }
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }
  prepare(sql: string) {
    return new PreparedQuery(this.connection, sql);
  }
  async batch(statements: PreparedQuery[]) {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => statement.runSync());
      this.connection.exec('COMMIT');
      return results;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }
}

// A process owns one SQLite connection; persistent state stays in the configured data directory.
let database: ArchiveDatabase | undefined;
export function dataDirectory() {
  return resolve(process.env.ARCHIVE_DATA_DIR || 'data');
}
export function getDb() {
  database ??= new ArchiveDatabase(resolve(dataDirectory(), 'archive.sqlite'));
  return database;
}
function imagePath(key: string) {
  const root = resolve(dataDirectory(), 'images');
  const path = resolve(root, key);
  if (!path.startsWith(root + sep))
    throw new Error('Image path must stay inside the archive data directory.');
  return path;
}
export function getImageStore() {
  return {
    async put(key: string, bytes: Uint8Array, _metadata?: unknown) {
      const path = imagePath(key);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, path);
    },
    async get(key: string) {
      try {
        return { body: new Uint8Array(await readFile(imagePath(key))) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}
