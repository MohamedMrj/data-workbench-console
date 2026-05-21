import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { normalizeBoolean, normalizeConnectionInput } from './source-config';
import { getSupabaseAdminClient, hasSupabaseConfig } from './supabase-client';

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
    authMode: base.sourceType === 'sql-server' ? base.authMode : 'servicePrincipal',
    server: base.server,
    port: String(Number(base.port) || 1433),
    database: base.database,
    username: base.sourceType === 'sql-server' ? String(base.username || '').trim().slice(0, 400) : '',
    trustServerCertificate: normalizeBoolean(base.trustServerCertificate, true)
  };
}

function normalizeSavedConnectionRow(row = {}) {
  const normalized = normalizeSavedConnectionInput({
    id: row.id,
    profileName: row.profileName || row.profile_name,
    sourceType: row.sourceType || row.source_type,
    authMode: row.authMode || row.auth_mode,
    server: row.server,
    port: row.port,
    database: row.database,
    username: row.username,
    trustServerCertificate: row.trustServerCertificate ?? row.trust_server_certificate
  });
  if (!normalized.server || !normalized.database) {
    return null;
  }

  return {
    id: String(row.id || normalized.id || '').trim(),
    ownerEmail: String(row.ownerEmail || row.owner_email || '').trim().toLowerCase(),
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

function normalizeOwnerEmail(ownerEmail) {
  return String(ownerEmail || 'local').trim().toLowerCase() || 'local';
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

async function listSavedConnectionsFromSupabase(ownerEmail) {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from('saved_connections')
    .select('id, owner_email, profile_name, source_type, auth_mode, server, port, database, trust_server_certificate, created_at, updated_at')
    .eq('owner_email', normalizeOwnerEmail(ownerEmail))
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(LIST_LIMIT, 500)));

  if (error) {
    throw new Error(`Could not load saved connections: ${error.message}`);
  }

  return (data || []).map((row) => normalizeSavedConnectionRow(row)).filter(Boolean);
}

async function upsertSavedConnectionToSupabase(ownerEmail, input = {}) {
  const client = getSupabaseAdminClient();
  const normalized = normalizeSavedConnectionInput(input);

  if (!normalized.server || !normalized.database) {
    throw new Error('Server and database are required to save a connection profile.');
  }

  const row = {
    owner_email: normalizeOwnerEmail(ownerEmail),
    profile_name: normalized.profileName || normalized.database,
    source_type: normalized.sourceType,
    auth_mode: normalized.authMode,
    server: normalized.server,
    port: Number(normalized.port) || 1433,
    database: normalized.database,
    trust_server_certificate: normalized.trustServerCertificate,
    updated_at: nowIso()
  };

  let result;
  if (normalized.id) {
    result = await client
      .from('saved_connections')
      .update(row)
      .eq('id', normalized.id)
      .eq('owner_email', normalizeOwnerEmail(ownerEmail))
      .select('id, owner_email, profile_name, source_type, auth_mode, server, port, database, trust_server_certificate, created_at, updated_at')
      .maybeSingle();
  } else {
    result = await client
      .from('saved_connections')
      .insert(row)
      .select('id, owner_email, profile_name, source_type, auth_mode, server, port, database, trust_server_certificate, created_at, updated_at')
      .single();
  }

  if (result.error) {
    throw new Error(`Could not save connection profile: ${result.error.message}`);
  }

  if (!result.data) {
    throw new Error('Saved connection profile not found.');
  }

  return normalizeSavedConnectionRow(result.data);
}

async function deleteSavedConnectionFromSupabase(ownerEmail, id) {
  const cleanId = String(id || '').trim();
  if (!cleanId) {
    throw new Error('Saved connection id is required.');
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from('saved_connections')
    .delete()
    .eq('id', cleanId)
    .eq('owner_email', normalizeOwnerEmail(ownerEmail))
    .select('id');

  if (error) {
    throw new Error(`Could not delete saved connection profile: ${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
}

export async function listSavedConnections(ownerEmail = 'local') {
  if (hasSupabaseConfig()) {
    return listSavedConnectionsFromSupabase(ownerEmail);
  }

  await writeQueue;
  const items = await readStore();
  return items
    .filter((item) => !item.ownerEmail || item.ownerEmail === normalizeOwnerEmail(ownerEmail))
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

export async function upsertSavedConnection(ownerEmail = 'local', input = {}) {
  if (hasSupabaseConfig()) {
    return upsertSavedConnectionToSupabase(ownerEmail, input);
  }

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
      ownerEmail: normalizeOwnerEmail(ownerEmail),
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

export async function deleteSavedConnection(ownerEmail = 'local', id) {
  if (hasSupabaseConfig()) {
    return deleteSavedConnectionFromSupabase(ownerEmail, id);
  }

  const cleanId = String(id || '').trim();

  if (!cleanId) {
    throw new Error('Saved connection id is required.');
  }

  return withSerializedWrite(async (items) => {
    const index = items.findIndex((item) => item.id === cleanId && (!item.ownerEmail || item.ownerEmail === normalizeOwnerEmail(ownerEmail)));
    if (index < 0) {
      return false;
    }
    items.splice(index, 1);
    return true;
  });
}
