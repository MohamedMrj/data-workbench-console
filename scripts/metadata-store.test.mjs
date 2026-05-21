import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import process from 'process';
import { setTimeout as delay } from 'timers/promises';
import { encode } from 'next-auth/jwt';

const port = 3102;
const origin = `http://localhost:${port}`;
const cwd = process.cwd();
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dwb-metadata-'));
const secret = 'metadata-store-test-secret-metadata-store-test';

function fail(message) {
  throw new Error(message);
}

async function waitFor(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          cookie: await sessionCookie('alpha@example.com')
        }
      });
      if (response.ok) {
        return response;
      }
    } catch {
      // Wait for the Next server.
    }
    await delay(1000);
  }

  fail(`Timed out waiting for ${url}`);
}

async function sessionCookie(email) {
  const value = await encode({
    secret,
    token: {
      email,
      name: email
    },
    maxAge: 60 * 60
  });
  return `next-auth.session-token=${encodeURIComponent(value)}`;
}

async function api(pathname, email, options = {}) {
  return fetch(`${origin}${pathname}`, {
    ...options,
    headers: {
      origin,
      'content-type': 'application/json',
      cookie: await sessionCookie(email),
      ...(options.headers || {})
    }
  });
}

const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
  cwd,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
    AUTH_REQUIRED: 'true',
    AUTH_SECRET: secret,
    NEXTAUTH_SECRET: secret,
    ALLOWED_USER_EMAILS: 'alpha@example.com,beta@example.com',
    APP_DATA_DIR: tempDir,
    SAVED_CONNECTIONS_FILE: 'saved-connections.json',
    AUDIT_LOG_FILE: path.join(tempDir, 'audit-log.ndjson'),
    ALLOW_LOCAL_MISSING_ORIGIN: 'true',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: ''
  }
});

try {
  await waitFor(`${origin}/api/health`);

  for (const [email, database] of [
    ['alpha@example.com', 'alpha_db'],
    ['beta@example.com', 'beta_db']
  ]) {
    const saveResponse = await api('/api/saved-connections', email, {
      method: 'POST',
      body: JSON.stringify({
        profileName: database,
        sourceType: 'fabric-sql',
        authMode: 'servicePrincipal',
        server: `${database}.datawarehouse.fabric.microsoft.com`,
        database
      })
    });
    if (!saveResponse.ok) {
      fail(`Saved connection request failed for ${email} with ${saveResponse.status}: ${await saveResponse.text()}`);
    }

    await api('/api/query', email, {
      method: 'POST',
      body: JSON.stringify({
        sourceType: 'fabric-sql',
        authMode: 'servicePrincipal',
        server: `${database}.datawarehouse.fabric.microsoft.com`,
        database,
        query: 'SELECT 1; SELECT 2'
      })
    });
  }

  const alphaConnections = await (await api('/api/saved-connections', 'alpha@example.com')).json();
  const betaConnections = await (await api('/api/saved-connections', 'beta@example.com')).json();

  if (alphaConnections.items?.length !== 1 || alphaConnections.items[0].database !== 'alpha_db') {
    fail('Saved connections were not scoped to alpha@example.com.');
  }
  if (betaConnections.items?.length !== 1 || betaConnections.items[0].database !== 'beta_db') {
    fail('Saved connections were not scoped to beta@example.com.');
  }

  const alphaAudit = await (await api('/api/audit?limit=10', 'alpha@example.com')).json();
  const betaAudit = await (await api('/api/audit?limit=10', 'beta@example.com')).json();

  if (!alphaAudit.entries?.some((entry) => entry.database === 'alpha_db')) {
    fail('Audit entries were not scoped to alpha@example.com.');
  }
  if (!betaAudit.entries?.some((entry) => entry.database === 'beta_db')) {
    fail('Audit entries were not scoped to beta@example.com.');
  }

  console.log('Metadata store test passed.');
} finally {
  child.kill();
  await fs.rm(tempDir, { recursive: true, force: true });
}
