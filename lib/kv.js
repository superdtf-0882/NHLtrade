import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '.data', 'db.json');

// The Redis instance this connects to in production is shared with other
// Vercel projects (e.g. aiarchitecture-taxonomy). Prefixing every key here
// keeps this project's data isolated even though the underlying store isn't
// dedicated to it.
const KEY_PREFIX = 'nhltrade:';

const usingRemoteKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

function loadLocalDb() {
  if (!existsSync(DB_PATH)) return {};
  return JSON.parse(readFileSync(DB_PATH, 'utf-8'));
}

function saveLocalDb(db) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let remoteKv;
async function getRemoteKv() {
  if (!remoteKv) {
    const mod = await import('@vercel/kv');
    remoteKv = mod.kv;
  }
  return remoteKv;
}

function prefixed(key) {
  return `${KEY_PREFIX}${key}`;
}

export const kv = {
  async get(key) {
    if (usingRemoteKv) {
      const client = await getRemoteKv();
      return client.get(prefixed(key));
    }
    const db = loadLocalDb();
    return db[prefixed(key)] ?? null;
  },

  async set(key, value) {
    if (usingRemoteKv) {
      const client = await getRemoteKv();
      return client.set(prefixed(key), value);
    }
    const db = loadLocalDb();
    db[prefixed(key)] = value;
    saveLocalDb(db);
    return 'OK';
  },

  async del(key) {
    if (usingRemoteKv) {
      const client = await getRemoteKv();
      return client.del(prefixed(key));
    }
    const db = loadLocalDb();
    delete db[prefixed(key)];
    saveLocalDb(db);
    return 1;
  },

  async keys(pattern) {
    if (usingRemoteKv) {
      const client = await getRemoteKv();
      const matched = await client.keys(prefixed(pattern));
      return matched.map((k) => k.slice(KEY_PREFIX.length));
    }
    const db = loadLocalDb();
    const prefix = prefixed(pattern.replace('*', ''));
    return Object.keys(db)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(KEY_PREFIX.length));
  },
};

export const isUsingRemoteKv = usingRemoteKv;
