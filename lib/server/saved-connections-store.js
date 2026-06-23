import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { normalizeBoolean, normalizeConnectionInput } from './source-config.js';

const dataDir = path.resolve(process.cwd(), process.env.APP_DATA_DIR || 'data');
const storePath = path.resolve(dataDir, process.env.SAVED_CONNECTIONS_FILE || 'saved-connections.json');
const LIST_LIMIT = Number(process.env.SAVED_CONNECTIONS_LIMIT || 50);

let initPromise = null;
let writeQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function normalizeSavedConnectionInput(input = {}) {
  const base = normalizeConnectionInput(input);
  const profileName = String(input.profileName || input.name || base.database || '').trim().slice(0, 200);

  return {
    id: String(input.id || '').trim(),
    profileName,
    sourceType: base.sourceType,
    authMode: base.authMode,
    server: base.server,
    port: String(Number(base.port) || 1433),
    database: base.database,
    username: String(base.username || '').trim().slice(0, 400),
    trustServerCertificate: normalizeBoolean(base.trustServerCertificate, true)
  };
}

function normalizeSavedConnectionRow(row = {}) {
  const normalized = normalizeSavedConnectionInput(row);
  if (!normalized.server || !normalized.database) {
    return null;
  }

  return {
    id: String(row.id || normalized.id || '').trim(),
    profileName: normalized.profileName || normalized.database,
    sourceType: normalized.sourceType,
    authMode: normalized.authMode,
    server: normalized.server,
    port: normalized.port,
    database: normalized.database,
    username: normalized.username,
    trustServerCertificate: normalized.trustServerCertificate,
    createdAt: String(row.createdAt || row.created_at || '').trim(),
    updatedAt: String(row.updatedAt || row.updated_at || '').trim()
  };
}

async function ensureStore() {
  if (!initPromise) {
    initPromise = (async () => {
      await fs.mkdir(dataDir, { recursive: true });
      try {
        await fs.access(storePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
        await fs.writeFile(storePath, '[]', 'utf8');
      }
    })();
  }

  return initPromise;
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(storePath, 'utf8');
  let parsed = [];
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }

  return (Array.isArray(parsed) ? parsed : [])
    .map((item) => normalizeSavedConnectionRow(item))
    .filter(Boolean);
}

async function writeStore(items) {
  await ensureStore();
  await fs.writeFile(storePath, JSON.stringify(items, null, 2), 'utf8');
}

async function withSerializedWrite(work) {
  writeQueue = writeQueue.then(async () => {
    const items = await readStore();
    const result = await work(items);
    await writeStore(items);
    return result;
  });

  return writeQueue;
}

export async function initializeSavedConnectionsStore() {
  await ensureStore();
}

export async function listSavedConnections() {
  await writeQueue;
  const items = await readStore();
  return items
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || 0) || 0;
      const rightTime = Date.parse(right.updatedAt || right.createdAt || 0) || 0;
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return String(left.profileName || '').localeCompare(String(right.profileName || ''));
    })
    .slice(0, Math.max(1, Math.min(LIST_LIMIT, 500)));
}

export async function upsertSavedConnection(input = {}) {
  const normalized = normalizeSavedConnectionInput(input);

  if (!normalized.server || !normalized.database) {
    throw new Error('Server and database are required to save a connection profile.');
  }

  return withSerializedWrite(async (items) => {
    const timestamp = nowIso();
    const id = normalized.id || crypto.randomUUID();
    const existingIndex = items.findIndex((item) => item.id === id);
    const existing = existingIndex >= 0 ? items[existingIndex] : null;

    const saved = {
      id,
      profileName: normalized.profileName || normalized.database,
      sourceType: normalized.sourceType,
      authMode: normalized.authMode,
      server: normalized.server,
      port: normalized.port,
      database: normalized.database,
      username: normalized.username,
      trustServerCertificate: normalized.trustServerCertificate,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };

    if (existingIndex >= 0) {
      items[existingIndex] = saved;
    } else {
      items.unshift(saved);
    }

    return saved;
  });
}

export async function deleteSavedConnection(id) {
  const cleanId = String(id || '').trim();

  if (!cleanId) {
    throw new Error('Saved connection id is required.');
  }

  return withSerializedWrite(async (items) => {
    const index = items.findIndex((item) => item.id === cleanId);
    if (index < 0) {
      return false;
    }
    items.splice(index, 1);
    return true;
  });
}
