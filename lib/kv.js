import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '.data', 'db.json');

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

export const kv = {
  async get(key) {
    if (usingRemoteKv) {
      const client = await getRemoteKv();
      return client.get(key);
    }
    const db = loadLocalDb();
    return db[key] ?? null;
  },

  async set(key, value) {
    if (usingRemoteKv) {
      const client = await getRemoteKv();
      return client.set(key, value);
    }
    const db = loadLocalDb();
    db[key] = value;
    saveLocalDb(db);
    return 'OK';
  },

  async del(key) {
    if (usingRemoteKv) {
      const client = await getRemoteKv();
      return client.del(key);
    }
    const db = loadLocalDb();
    delete db[key];
    saveLocalDb(db);
    return 1;
  },

  async keys(pattern) {
    if (usingRemoteKv) {
      const client = await getRemoteKv();
      return client.keys(pattern);
    }
    const db = loadLocalDb();
    const prefix = pattern.replace('*', '');
    return Object.keys(db).filter((k) => k.startsWith(prefix));
  },
};

export const isUsingRemoteKv = usingRemoteKv;
