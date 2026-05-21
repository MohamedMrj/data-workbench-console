import path from 'path';
import fs from 'fs/promises';
import { normalizeServer, normalizeSourceType } from './source-config';

const AUDIT_LOG_LIMIT = Number(process.env.AUDIT_LOG_LIMIT || 200);
const AUDIT_LOG_FILE = path.resolve(
  process.env.AUDIT_LOG_FILE || path.join(process.cwd(), 'audit-log.ndjson')
);
const AUDIT_LOG_MAX_BYTES = Math.max(
  1024,
  Number(process.env.AUDIT_LOG_MAX_BYTES || 1024 * 1024)
);

const auditEntries = [];
let auditWriteQueue = Promise.resolve();
let initialized = false;

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

      const isMissingTmp = error?.code === 'ENOENT';

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

async function rewriteAuditFile(entries = auditEntries) {
  const directory = path.dirname(AUDIT_LOG_FILE);
  const tmpPath = `${AUDIT_LOG_FILE}.tmp`;

  await fs.mkdir(directory, { recursive: true });

  const lines = entries
    .slice(0, AUDIT_LOG_LIMIT)
    .reverse()
    .map((entry) => JSON.stringify(entry))
    .join('\n');

  await fs.writeFile(tmpPath, lines ? `${lines}\n` : '', 'utf8');
  await safeReplaceFile(tmpPath, AUDIT_LOG_FILE);
}

function queueAuditWrite(entry) {
  auditWriteQueue = auditWriteQueue
    .then(async () => {
      const directory = path.dirname(AUDIT_LOG_FILE);
      await fs.mkdir(directory, { recursive: true });

      await fs.appendFile(AUDIT_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');

      let stats;
      try {
        stats = await fs.stat(AUDIT_LOG_FILE);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
        stats = { size: 0 };
      }

      if (stats.size > AUDIT_LOG_MAX_BYTES || auditEntries.length >= AUDIT_LOG_LIMIT) {
        await rewriteAuditFile();
      }
    })
    .catch(async (error) => {
      console.error(`Failed to persist audit entry: ${error.message}`);

      try {
        await fs.rm(`${AUDIT_LOG_FILE}.tmp`, { force: true });
      } catch {
        // ignore cleanup failure
      }
    });

  return auditWriteQueue;
}

export async function loadAuditEntriesFromDisk() {
  if (initialized) {
    return;
  }

  initialized = true;

  try {
    const directory = path.dirname(AUDIT_LOG_FILE);
    await fs.mkdir(directory, { recursive: true });

    const raw = await fs.readFile(AUDIT_LOG_FILE, 'utf8');

    const entries = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-AUDIT_LOG_LIMIT)
      .reverse();

    auditEntries.splice(0, auditEntries.length, ...entries);
    await rewriteAuditFile();
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Failed to load audit log: ${error.message}`);
    }
  }
}

export function addAuditEntry({
  event,
  outcome,
  action = '',
  sourceType = '',
  server = '',
  database = '',
  detail = '',
  rowCount = null
}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    outcome,
    action,
    sourceType: normalizeSourceType(sourceType || ''),
    server: normalizeServer(server),
    database: String(database || '').trim(),
    rowCount: rowCount == null ? null : Number(rowCount),
    detail: String(detail || '')
  };

  auditEntries.unshift(entry);

  if (auditEntries.length > AUDIT_LOG_LIMIT) {
    auditEntries.length = AUDIT_LOG_LIMIT;
  }

  queueAuditWrite(entry);
}

export function getAuditEntries(limit = 25) {
  const safeLimit = Math.max(1, Math.min(AUDIT_LOG_LIMIT, Number(limit || 25)));

  return {
    success: true,
    entries: auditEntries.slice(0, safeLimit),
    limit: safeLimit
  };
}

export function getAuditConfig() {
  return {
    auditLogLimit: AUDIT_LOG_LIMIT,
    auditLogMaxBytes: AUDIT_LOG_MAX_BYTES,
    auditLogFile: path.basename(AUDIT_LOG_FILE)
  };
}