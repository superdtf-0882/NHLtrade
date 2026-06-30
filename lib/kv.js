import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '.data', 'db.json');

// The Redis instance is shared with other Vercel projects — prefix every key
// so NHLtrade's data stays isolated within the shared store.
const KEY_PREFIX = 'nhltrade:';

const usingRemoteKv = Boolean(process.env.REDIS_URL);

function loadLocalDb() {
  if (!existsSync(DB_PATH)) return {};
  return JSON.parse(readFileSync(DB_PATH, 'utf-8'));
}

function saveLocalDb(db) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let redisClient;
async function getRedis() {
  if (!redisClient) {
    const { default: Redis } = await import('ioredis');
    redisClient = new Redis(process.env.REDIS_URL);
  }
  return redisClient;
}

function prefixed(key) {
  return `${KEY_PREFIX}${key}`;
}

export const kv = {
  async get(key) {
    if (usingRemoteKv) {
      const redis = await getRedis();
      const raw = await redis.get(prefixed(key));
      return raw ? JSON.parse(raw) : null;
    }
    const db = loadLocalDb();
    return db[prefixed(key)] ?? null;
  },

  async set(key, value) {
    if (usingRemoteKv) {
      const redis = await getRedis();
      await redis.set(prefixed(key), JSON.stringify(value));
      return 'OK';
    }
    const db = loadLocalDb();
    db[prefixed(key)] = value;
    saveLocalDb(db);
    return 'OK';
  },

  async del(key) {
    if (usingRemoteKv) {
      const redis = await getRedis();
      return redis.del(prefixed(key));
    }
    const db = loadLocalDb();
    delete db[prefixed(key)];
    saveLocalDb(db);
    return 1;
  },

  async keys(pattern) {
    if (usingRemoteKv) {
      const redis = await getRedis();
      const matched = await redis.keys(prefixed(pattern));
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
