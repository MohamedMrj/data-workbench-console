import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const CONFIRMATION_STORE_FILE = path.resolve(
  process.env.CONFIRMATION_STORE_FILE || path.join(process.cwd(), '.data', 'pending-confirmations.json')
);

const confirmations = new Map();
let initialized = false;
let writeQueue = Promise.resolve();

function stableClone(value) {
  if (Array.isArray(value)) {
    return value.map(stableClone);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableClone(value[key]);
        return acc;
      }, {});
  }
  return value;
}

async function safeReplaceFile(tmpPath, finalPath) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rename(tmpPath, finalPath);
      return;
    } catch (error) {
      const isWindowsLockIssue =
        process.platform === 'win32' &&
        ['EPERM', 'EACCES'].includes(error?.code);

      const isMissingTmp =
        error?.code === 'ENOENT';

      if (isMissingTmp) {
        throw error;
      }

      if (isWindowsLockIssue && attempt < maxAttempts) {
        try {
          await fs.rm(finalPath, { force: true });
        } catch {
          // ignore
        }

        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        continue;
      }

      throw error;
    }
  }
}

async function persistUnsafe() {
  const directory = path.dirname(CONFIRMATION_STORE_FILE);
  await fs.mkdir(directory, { recursive: true });

  const records = [...confirmations.values()].sort((a, b) => a.createdAt - b.createdAt);
  const payload = JSON.stringify(records, null, 2);

  const tmpPath = `${CONFIRMATION_STORE_FILE}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;

  await fs.writeFile(tmpPath, payload, 'utf8');
  await safeReplaceFile(tmpPath, CONFIRMATION_STORE_FILE);
}

function queuePersist() {
  writeQueue = writeQueue
    .then(() => persistUnsafe())
    .catch((error) => {
      console.error(`Failed to persist confirmations: ${error.message}`);
    });

  return writeQueue;
}

export async function loadConfirmationStore() {
  if (initialized) {
    return;
  }

  initialized = true;

  try {
    const directory = path.dirname(CONFIRMATION_STORE_FILE);
    await fs.mkdir(directory, { recursive: true });

    const raw = await fs.readFile(CONFIRMATION_STORE_FILE, 'utf8');
    const items = JSON.parse(raw);
    const now = Date.now();

    confirmations.clear();

    for (const item of Array.isArray(items) ? items : []) {
      if (!item?.token || !item?.expiresAt || Number(item.expiresAt) <= now) {
        continue;
      }
      confirmations.set(item.token, item);
    }

    if (confirmations.size > 0) {
      await queuePersist();
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Failed to load confirmation store: ${error.message}`);
    }
  }
}

export async function purgeExpiredConfirmations() {
  const now = Date.now();
  let changed = false;

  for (const [token, record] of confirmations.entries()) {
    if (Number(record.expiresAt) <= now) {
      confirmations.delete(token);
      changed = true;
    }
  }

  if (changed) {
    await queuePersist();
  }
}

export async function createConfirmation({ type, ownerSessionId, hash, payload, ttlMs }) {
  if (!initialized) {
    await loadConfirmationStore();
  }

  const now = Date.now();
  const safeTtlMs = Math.max(1000, Number(ttlMs || 0));

  const record = {
    token: crypto.randomUUID(),
    type: String(type || '').trim(),
    ownerSessionId: String(ownerSessionId || '').trim(),
    hash: String(hash || '').trim(),
    payload: stableClone(payload || {}),
    createdAt: now,
    expiresAt: now + safeTtlMs
  };

  confirmations.set(record.token, record);
  await queuePersist();
  return record;
}

export async function getConfirmation(token) {
  if (!initialized) {
    await loadConfirmationStore();
  }

  await purgeExpiredConfirmations();
  return confirmations.get(String(token || '').trim()) || null;
}

/**
 * Atomically consume a confirmation token: return the live record and remove it
 * in the same synchronous step, so two concurrent requests with the same token
 * can never both execute. Returns null if the token is unknown or expired.
 */
export async function claimConfirmation(token) {
  if (!initialized) {
    await loadConfirmationStore();
  }

  // No `await` between the lookup and the delete below: Node runs this block to
  // completion without yielding, so only the first caller can claim the token.
  const key = String(token || '').trim();
  const record = confirmations.get(key);
  if (!record) {
    return null;
  }

  confirmations.delete(key);

  if (Number(record.expiresAt) <= Date.now()) {
    queuePersist();
    return null;
  }

  queuePersist();
  return record;
}

export async function deleteConfirmation(token) {
  if (!initialized) {
    await loadConfirmationStore();
  }

  const removed = confirmations.delete(String(token || '').trim());

  if (removed) {
    await queuePersist();
  }

  return removed;
}

export function hashConfirmationParts(parts) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableClone(parts)))
    .digest('hex');
}