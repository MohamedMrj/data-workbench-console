import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { writeFileAtomic } from './atomic-file.js';

const dataDir = path.resolve(process.cwd(), process.env.APP_DATA_DIR || 'data');
const storePath = path.resolve(dataDir, 'saved-queries.json');
const LIST_LIMIT = 200;
const MAX_QUERY_LENGTH = Number(process.env.MAX_QUERY_LENGTH || 50000);

let initPromise = null;
let writeQueue = Promise.resolve();

function httpError(message) {
  const error = new Error(message);
  error.httpStatus = 400;
  return error;
}

function normalizeSavedQueryInput(input = {}) {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const query = String(input.query || '');
  if (!name) {
    throw httpError('A saved query needs a name.');
  }
  if (!query.trim()) {
    throw httpError('A saved query needs SQL text.');
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw httpError('Query exceeds the maximum allowed length.');
  }
  return {
    id: String(input.id || '').trim().slice(0, 80),
    name,
    folder: String(input.folder || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    query,
    profileId: String(input.profileId || '').trim().slice(0, 80)
  };
}

function normalizeSavedQueryRow(row = {}) {
  try {
    const normalized = normalizeSavedQueryInput(row);
    return {
      ...normalized,
      id: normalized.id || crypto.randomUUID(),
      createdAt: String(row.createdAt || '').trim(),
      updatedAt: String(row.updatedAt || '').trim()
    };
  } catch {
    // A hand-edited or truncated row is dropped rather than failing the whole library.
    return null;
  }
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
        await writeFileAtomic(storePath, '[]');
      }
    })();
  }
  return initPromise;
}

async function readStore() {
  await ensureStore();
  let parsed = [];
  try {
    parsed = JSON.parse(await fs.readFile(storePath, 'utf8'));
  } catch {
    parsed = [];
  }
  return (Array.isArray(parsed) ? parsed : []).map(normalizeSavedQueryRow).filter(Boolean);
}

async function withSerializedWrite(work) {
  writeQueue = writeQueue.then(async () => {
    const items = await readStore();
    const result = await work(items);
    await writeFileAtomic(storePath, JSON.stringify(items, null, 2));
    return result;
  });
  return writeQueue;
}

export async function listSavedQueries() {
  await writeQueue;
  const items = await readStore();
  return items
    .sort((left, right) => (
      String(left.folder).localeCompare(String(right.folder)) || String(left.name).localeCompare(String(right.name))
    ))
    .slice(0, LIST_LIMIT);
}

/**
 * Save a query. Without an id, a query with the same folder and name is updated instead of
 * duplicated, so "save again" after editing replaces the earlier version.
 */
export async function upsertSavedQuery(input = {}) {
  const normalized = normalizeSavedQueryInput(input);
  return withSerializedWrite(async (items) => {
    const timestamp = new Date().toISOString();
    const sameName = (item) => item.folder.toLowerCase() === normalized.folder.toLowerCase() && item.name.toLowerCase() === normalized.name.toLowerCase();
    const existingIndex = normalized.id
      ? items.findIndex((item) => item.id === normalized.id)
      : items.findIndex(sameName);
    if (existingIndex < 0 && items.length >= LIST_LIMIT) {
      throw httpError(`The query library is full (${LIST_LIMIT}). Delete a saved query first.`);
    }
    const existing = existingIndex >= 0 ? items[existingIndex] : null;
    const saved = {
      ...normalized,
      id: existing?.id || normalized.id || crypto.randomUUID(),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };
    if (existingIndex >= 0) {
      items[existingIndex] = saved;
    } else {
      items.push(saved);
    }
    return saved;
  });
}

export async function deleteSavedQuery(id) {
  const cleanId = String(id || '').trim();
  if (!cleanId) {
    throw httpError('Saved query id is required.');
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
