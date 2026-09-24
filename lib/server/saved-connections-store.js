import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { buildConnectionFingerprint, normalizeBoolean, normalizeConnectionInput } from './source-config.js';
import { writeFileAtomic } from './atomic-file.js';

const dataDir = path.resolve(process.cwd(), process.env.APP_DATA_DIR || 'data');
const storePath = path.resolve(dataDir, process.env.SAVED_CONNECTIONS_FILE || 'saved-connections.json');
const LIST_LIMIT = Number(process.env.SAVED_CONNECTIONS_LIMIT || 50);

let initPromise = null;
let writeQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

export const ENVIRONMENTS = ['', 'dev', 'test', 'prod'];

// Strict for input (an unknown tag is a client bug worth a 400), lenient for stored rows (a
// hand-edited file must not stop the store from loading).
function normalizeEnvironment(value, { strict = false } = {}) {
  const text = String(value ?? '').trim().toLowerCase();
  if (ENVIRONMENTS.includes(text)) {
    return text;
  }
  if (strict) {
    const error = new Error('Environment must be dev, test, prod, or empty.');
    error.httpStatus = 400;
    throw error;
  }
  return '';
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
    domain: String(base.domain || '').trim().slice(0, 200),
    username: String(base.username || '').trim().slice(0, 400),
    trustServerCertificate: normalizeBoolean(base.trustServerCertificate, true),
    // undefined (not '') when the caller did not send the field: an older client that knows
    // nothing about environments must not silently clear a prod tag on re-save.
    environment: Object.hasOwn(input, 'environment') ? normalizeEnvironment(input.environment, { strict: true }) : undefined
  };
}

function normalizeSavedConnectionRow(row = {}) {
  const normalized = normalizeSavedConnectionInput({ ...row, environment: normalizeEnvironment(row.environment) });
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
    domain: normalized.domain,
    username: normalized.username,
    trustServerCertificate: normalized.trustServerCertificate,
    environment: normalized.environment || '',
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
  await writeFileAtomic(storePath, JSON.stringify(items, null, 2));
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
    // A save without an id updates the profile with the same connection details instead of
    // appending a copy; older clients never sent the id, so every re-save added a duplicate.
    const fingerprint = buildConnectionFingerprint(normalized);
    const matched = normalized.id ? null : items.find((item) => buildConnectionFingerprint(item) === fingerprint);
    const id = normalized.id || matched?.id || crypto.randomUUID();
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
      domain: normalized.domain,
      username: normalized.username,
      trustServerCertificate: normalized.trustServerCertificate,
      environment: normalized.environment ?? existing?.environment ?? '',
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

/**
 * The environment tag that applies to a connection, from the saved profiles.
 *
 * Matched on source, server, port and database only. Auth mode and username are deliberately
 * ignored, so signing in as someone else does not step around a prod tag. When several
 * profiles point at the same database, any prod one makes it prod.
 *
 * @param {object} connection
 * @returns {Promise<{ environment: string, profileName: string }>}
 */
export async function resolveConnectionEnvironment(connection) {
  const target = normalizeConnectionInput(connection);
  const key = (item) => [item.sourceType, String(item.server || '').toLowerCase(), String(Number(item.port) || 1433), String(item.database || '').toLowerCase()].join('|');
  const wanted = key(target);
  await writeQueue;
  const matches = (await readStore()).filter((item) => key(item) === wanted);
  const prod = matches.find((item) => item.environment === 'prod');
  const chosen = prod || matches.find((item) => item.environment) || null;
  return { environment: chosen?.environment || '', profileName: chosen?.profileName || '' };
}
