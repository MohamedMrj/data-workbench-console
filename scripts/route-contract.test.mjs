import assert from 'assert/strict';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

const port = Number(process.env.ROUTE_CONTRACT_PORT || 3120);
const baseUrl = `http://127.0.0.1:${port}`;
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dwb-route-contract-'));
const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

async function waitFor(url, attempts = 45) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // Wait for production server startup.
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  return { response, payload };
}

const safeSqlLogin = {
  sourceType: 'sql-server',
  authMode: 'sqlLogin',
  server: 'demo',
  database: 'meta_store',
  username: 'tester',
  password: 'secret'
};

const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
    APP_LOCAL_SHUTDOWN_ENABLED: 'false',
    APP_DATA_DIR: path.join(tempRoot, 'data'),
    AUDIT_LOG_FILE: path.join(tempRoot, 'audit.ndjson'),
    CONFIRMATION_STORE_FILE: path.join(tempRoot, 'confirmations.json'),
    ALLOW_LOCAL_MISSING_ORIGIN: 'true',
    APP_SELF_UPDATE_ENABLED: 'false'
  }
});

try {
  await waitFor(`${baseUrl}/api/health`);

  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.payload.ok, true);
  assert.equal(health.response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.payload.sidePanels.autoHideEnabled, true);
  assert.equal(typeof health.payload.sidePanels.idleMs, 'number');
  assert.equal(typeof health.payload.sidePanels.fadeMs, 'number');
  const sqlServerSource = health.payload.supportedSourceTypes.find((source) => source.id === 'sql-server');
  assert.equal(sqlServerSource.authModes.includes('windowsNtlm'), true);
  assert.equal(health.payload.supportedAuthModes.some((auth) => auth.id === 'windowsNtlm'), true);

  const version = await request('/api/version');
  assert.equal(version.response.status, 200);
  assert.equal(version.payload.success, true);
  assert.equal(typeof version.payload.version, 'string');

  const envSettings = await request('/api/env-settings');
  assert.equal(envSettings.response.status, 200);
  assert.equal(envSettings.payload.success, true);
  assert.equal(Array.isArray(envSettings.payload.settings), true);
  const clientSecretField = envSettings.payload.settings.find((field) => field.key === 'AZURE_CLIENT_SECRET');
  assert.equal(clientSecretField?.value, '');
  assert.equal(clientSecretField?.secret, true);
  assert.equal(envSettings.payload.settings.some((field) => field.key === 'APP_SIDE_PANEL_IDLE_MS'), true);

  const envWriteBlocked = await request('/api/env-settings', {
    method: 'POST',
    body: { settings: { PORT: '3001' } }
  });
  assert.equal(envWriteBlocked.response.status, 403);
  assert.match(envWriteBlocked.payload.error, /same-origin/i);

  const updateDisabled = await request('/api/update', {
    method: 'POST',
    body: {}
  });
  assert.equal(updateDisabled.response.status, 403);
  assert.match(updateDisabled.payload.error, /Self-update is disabled/);

  const blockedQuery = await request('/api/query', {
    method: 'POST',
    body: { ...safeSqlLogin, query: 'SELECT 1; SELECT 2' }
  });
  assert.equal(blockedQuery.response.status, 400);
  assert.match(blockedQuery.payload.error, /one SQL statement|blocked/i);

  const missingWindowsDomain = await request('/api/query', {
    method: 'POST',
    body: {
      sourceType: 'sql-server',
      authMode: 'windowsNtlm',
      server: 'demo',
      database: 'meta_store',
      username: 'tester',
      password: 'secret',
      query: 'SELECT 1'
    }
  });
  assert.equal(missingWindowsDomain.response.status, 400);
  assert.match(missingWindowsDomain.payload.error, /Domain, username, and password/);

  const audit = await request('/api/audit?limit=10&event=query&outcome=blocked');
  assert.equal(audit.response.status, 200);
  assert.equal(Array.isArray(audit.payload.entries), true);
  assert.equal(audit.payload.entries.some((entry) => entry.event === 'query' && entry.outcome === 'blocked'), true);

  const savedBefore = await request('/api/saved-connections');
  assert.equal(savedBefore.response.status, 200);
  assert.equal(Array.isArray(savedBefore.payload.items), true);

  const savedCreate = await request('/api/saved-connections', {
    method: 'POST',
    body: { ...safeSqlLogin, profileName: 'Route Contract', password: 'must-not-persist' }
  });
  assert.equal(savedCreate.response.status, 200);
  assert.equal(savedCreate.payload.success, true);
  assert.equal(Object.hasOwn(savedCreate.payload.item, 'password'), false);

  const savedDelete = await request('/api/saved-connections', {
    method: 'DELETE',
    body: { id: savedCreate.payload.item.id }
  });
  assert.equal(savedDelete.response.status, 200);
  assert.equal(savedDelete.payload.success, true);

  const savedWindowsCreate = await request('/api/saved-connections', {
    method: 'POST',
    body: {
      sourceType: 'sql-server',
      authMode: 'windowsNtlm',
      server: 'demo',
      database: 'meta_store',
      domain: 'CONTOSO',
      username: 'tester',
      password: 'must-not-persist',
      profileName: 'Windows Route Contract'
    }
  });
  assert.equal(savedWindowsCreate.response.status, 200);
  assert.equal(savedWindowsCreate.payload.success, true);
  assert.equal(savedWindowsCreate.payload.item.authMode, 'windowsNtlm');
  assert.equal(savedWindowsCreate.payload.item.domain, 'CONTOSO');
  assert.equal(Object.hasOwn(savedWindowsCreate.payload.item, 'password'), false);
  const savedWindowsDelete = await request('/api/saved-connections', {
    method: 'DELETE',
    body: { id: savedWindowsCreate.payload.item.id }
  });
  assert.equal(savedWindowsDelete.response.status, 200);
  assert.equal(savedWindowsDelete.payload.success, true);

  const objectDefinition = await request('/api/object-definition', {
    method: 'POST',
    body: { ...safeSqlLogin, objectType: 'table', scriptMode: 'create' }
  });
  assert.equal(objectDefinition.response.status, 400);
  assert.match(objectDefinition.payload.error, /Object name is required/);

  const objectInsights = await request('/api/object-insights', {
    method: 'POST',
    body: { ...safeSqlLogin, action: 'profile' }
  });
  assert.equal(objectInsights.response.status, 400);
  assert.match(objectInsights.payload.error, /Object name is required/);

  const resultShapeWithoutObject = await request('/api/object-insights', {
    method: 'POST',
    body: { ...safeSqlLogin, action: 'resultShape', query: '' }
  });
  assert.equal(resultShapeWithoutObject.response.status, 400);
  assert.doesNotMatch(resultShapeWithoutObject.payload.error, /Object name is required/);

  const lakehouseRowCount = await request('/api/object-insights', {
    method: 'POST',
    body: {
      sourceType: 'fabric-lakehouse',
      authMode: 'servicePrincipal',
      server: 'demo',
      database: 'lakehouse_db',
      action: 'rowCount',
      object: 'dbo.Table1'
    }
  });
  assert.equal(lakehouseRowCount.response.status, 400);
  assert.match(lakehouseRowCount.payload.error, /Lakehouse SQL endpoints/i);

  const queryPlan = await request('/api/query-plan', {
    method: 'POST',
    body: { ...safeSqlLogin, query: 'UPDATE dbo.T SET A = 1' }
  });
  assert.equal(queryPlan.response.status, 400);
  assert.match(queryPlan.payload.error, /read queries/i);

  const lakehouseQueryPlan = await request('/api/query-plan', {
    method: 'POST',
    body: {
      sourceType: 'fabric-lakehouse',
      authMode: 'servicePrincipal',
      server: 'demo',
      database: 'lakehouse_db',
      query: 'SELECT 1 AS value'
    }
  });
  assert.equal(lakehouseQueryPlan.response.status, 400);
  assert.match(lakehouseQueryPlan.payload.error, /not supported for Fabric Lakehouse/i);

  const schemaCompare = await request('/api/schema-compare', {
    method: 'POST',
    body: {
      leftConnection: safeSqlLogin,
      rightConnection: safeSqlLogin,
      objectType: 'table'
    }
  });
  assert.equal(schemaCompare.response.status, 400);
  assert.match(schemaCompare.payload.error, /Left and right object names/);

  const heartbeatBad = await request('/api/lifecycle/heartbeat', {
    method: 'POST',
    body: { sessionId: 'bad' }
  });
  assert.equal(heartbeatBad.response.status, 400);

  const heartbeatGood = await request('/api/lifecycle/heartbeat', {
    method: 'POST',
    body: { sessionId: 'route_contract_1234567890', event: 'active' }
  });
  assert.equal(heartbeatGood.response.status, 200);
  assert.equal(heartbeatGood.payload.success, true);

  const lifecycleStatus = await request('/api/lifecycle/status');
  assert.equal(lifecycleStatus.response.status, 200);
  assert.equal(lifecycleStatus.payload.success, true);
  assert.equal(typeof lifecycleStatus.payload.lifecycle.activeSessions, 'number');

  const exitLocal = await request('/api/lifecycle/exit', {
    method: 'POST',
    body: {}
  });
  assert.equal(exitLocal.response.status, 200);
  assert.equal(exitLocal.payload.success, true);

  console.log('Route contract tests passed.');
} finally {
  child.kill();
  await fs.rm(tempRoot, { recursive: true, force: true });
}
