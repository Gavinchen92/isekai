import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DATABASE_PATH = "data/isekai.sqlite";
const IN_MEMORY_DATABASE_PATH = ":memory:";

type DatabaseConnection = {
  database: DatabaseSync;
  path: string;
};

let connection: DatabaseConnection | undefined;

export function getDatabase(): DatabaseSync {
  const databasePath = resolveDatabasePath();

  if (connection?.path === databasePath) {
    return connection.database;
  }

  connection?.database.close();

  if (databasePath !== IN_MEMORY_DATABASE_PATH) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);

  initializeDatabase(database);
  connection = {
    database,
    path: databasePath
  };

  return database;
}

export function closeDatabaseForTests(): void {
  connection?.database.close();
  connection = undefined;
}

export function resetDatabaseForTests(): void {
  const database = getDatabase();

  database.exec(`
    DELETE FROM gm_internal_state_patches;
    DELETE FROM journey_memory_entries;
    DELETE FROM suggested_moves;
    DELETE FROM messages;
    DELETE FROM sessions;
    DELETE FROM adventures;
  `);
}

function resolveDatabasePath(): string {
  const configuredPath = process.env.ISEKAI_DB_PATH;

  if (configuredPath) {
    return configuredPath === IN_MEMORY_DATABASE_PATH ? configuredPath : resolve(configuredPath);
  }

  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return IN_MEMORY_DATABASE_PATH;
  }

  return resolve(DEFAULT_DATABASE_PATH);
}

function initializeDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS adventures (
      id TEXT PRIMARY KEY,
      source_candidate_id TEXT NOT NULL,
      world_seed_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      adventure_id TEXT NOT NULL,
      current_act TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suggested_moves (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journey_memory_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gm_internal_state_patches (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
  `);
}
