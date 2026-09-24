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

  const favicon = await fetch(`${baseUrl}/favicon.ico`);
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get('content-type') || '', /image\/(x-icon|vnd\.microsoft\.icon)/i);
  assert.ok((await favicon.arrayBuffer()).byteLength > 1024);

  assert.equal(typeof health.payload.sidePanels.autoHideEnabled, 'boolean');
  assert.equal(typeof health.payload.sidePanels.idleMs, 'number');
  assert.equal(typeof health.payload.sidePanels.fadeMs, 'number');
  assert.equal(typeof health.payload.appearance.ambientMotionEnabled, 'boolean');
  assert.equal(typeof health.payload.appearance.ambientMotionDurationMs, 'number');
  assert.equal(typeof health.payload.appearance.tooltipsEnabled, 'boolean');
  assert.equal(typeof health.payload.appearance.tooltipDelayMs, 'number');
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
  assert.equal(envSettings.payload.settings.some((field) => field.key === 'APP_AMBIENT_MOTION_ENABLED'), true);
  assert.equal(envSettings.payload.settings.some((field) => field.key === 'APP_TOOLTIPS_ENABLED'), true);
  assert.equal(envSettings.payload.settings.some((field) => field.key === 'APP_TOOLTIP_DELAY_MS'), true);
  assert.equal(Array.isArray(envSettings.payload.envSync?.missingKeys), true);
  assert.equal(Array.isArray(envSettings.payload.envSync?.missingSettings), true);
  assert.equal(typeof envSettings.payload.envSync?.canSync, 'boolean');

  const envWriteAllowedLoopback = await request('/api/env-settings', {
    method: 'POST',
    headers: { Origin: `http://localhost:${port}` },
    body: { settings: {} }
  });
  assert.equal(envWriteAllowedLoopback.response.status, 200);
  assert.equal(envWriteAllowedLoopback.payload.success, true);
  assert.equal(Array.isArray(envWriteAllowedLoopback.payload.changedKeys), true);
  assert.equal(Array.isArray(envWriteAllowedLoopback.payload.envSync?.missingKeys), true);

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

  const updateStatus = await request('/api/update-status');
  assert.equal(updateStatus.response.status, 200);
  assert.equal(updateStatus.payload.success, true);
  assert.equal(updateStatus.payload.status, null);

  const tablesMissingConnection = await request('/api/tables', {
    method: 'POST',
    body: {}
  });
  assert.equal(tablesMissingConnection.response.status, 400);
  assert.match(tablesMissingConnection.payload.error, /Server and database/);

  const columnsMissingObject = await request('/api/columns', {
    method: 'POST',
    body: safeSqlLogin
  });
  assert.equal(columnsMissingObject.response.status, 400);
  assert.match(columnsMissingObject.payload.error, /Object name is required/);

  const testConnectionMissingConnection = await request('/api/test-connection', {
    method: 'POST',
    body: {}
  });
  assert.equal(testConnectionMissingConnection.response.status, 400);
  assert.match(testConnectionMissingConnection.payload.error, /Server and database/);

  const procedureParamsMissingName = await request('/api/procedure-parameters', {
    method: 'POST',
    body: safeSqlLogin
  });
  assert.equal(procedureParamsMissingName.response.status, 400);
  assert.match(procedureParamsMissingName.payload.error, /Procedure name is required/);

  const procedureRunMissingName = await request('/api/procedures', {
    method: 'POST',
    body: { ...safeSqlLogin, procedure: '' }
  });
  assert.equal(procedureRunMissingName.response.status, 400);
  assert.match(procedureRunMissingName.payload.error, /Procedure name is required/);

  const batchReview = await request('/api/query', {
    method: 'POST',
    body: { ...safeSqlLogin, query: 'SELECT 1; SELECT 2' }
  });
  assert.equal(batchReview.response.status, 200);
  assert.equal(batchReview.payload.requiresConfirmation, true);
  assert.equal(batchReview.payload.action, 'BATCH');
  assert.equal(batchReview.payload.expectedText, 'RUN BATCH');
  assert.equal(batchReview.payload.statementCount, 2);

  // SELECT ... INTO creates a table, so it must come back as a typed-confirmation review
  // (which never touches the database) instead of running on the read path.
  const selectIntoReview = await request('/api/query', {
    method: 'POST',
    body: { ...safeSqlLogin, query: 'SELECT * INTO dbo.NewCopy FROM dbo.Alerts ORDER BY AlertId' }
  });
  assert.equal(selectIntoReview.response.status, 200);
  assert.equal(selectIntoReview.payload.mode, 'write-review');
  assert.equal(selectIntoReview.payload.action, 'SELECT INTO');
  assert.equal(selectIntoReview.payload.expectedText, 'EXECUTE SELECT INTO');

  // Export all runs the statement uncapped by the grid limit, so only reads may use it; both
  // refusals happen before any database connection.
  const exportWrite = await request('/api/query/export', {
    method: 'POST',
    body: { ...safeSqlLogin, query: 'DELETE FROM dbo.Alerts WHERE AlertId = 1', format: 'csv' }
  });
  assert.equal(exportWrite.response.status, 400);
  assert.match(exportWrite.payload.error, /Only read/);
  const exportSelectInto = await request('/api/query/export', {
    method: 'POST',
    body: { ...safeSqlLogin, query: 'SELECT * INTO dbo.Copy FROM dbo.Alerts', format: 'csv' }
  });
  assert.equal(exportSelectInto.response.status, 400);
  const exportBadFormat = await request('/api/query/export', {
    method: 'POST',
    body: { ...safeSqlLogin, query: 'SELECT 1', format: 'xlsx' }
  });
  assert.equal(exportBadFormat.response.status, 400);
  assert.match(exportBadFormat.payload.error, /csv or json/);

  const cancelBadId = await request('/api/query/cancel', { method: 'POST', body: { runId: 'nope' } });
  assert.equal(cancelBadId.response.status, 400);
  const cancelUnknown = await request('/api/query/cancel', {
    method: 'POST',
    body: { runId: '0c9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e6f' }
  });
  assert.equal(cancelUnknown.response.status, 404);
  const queryBadRunId = await request('/api/query', {
    method: 'POST',
    body: { ...safeSqlLogin, query: 'SELECT 1; SELECT 2', runId: 'not-a-uuid' }
  });
  assert.equal(queryBadRunId.response.status, 400);
  assert.match(queryBadRunId.payload.error, /Run id/);
  // A valid run id on a query that never reaches the database is released again, so the
  // same id can be reused straight away.
  const reviewRunId = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reviewed = await request('/api/query', {
      method: 'POST',
      body: { ...safeSqlLogin, query: 'SELECT 1; SELECT 2', runId: reviewRunId }
    });
    assert.equal(reviewed.response.status, 200);
  }

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

  const audit = await request('/api/audit?limit=10&event=write_prepare&outcome=success');
  assert.equal(audit.response.status, 200);
  assert.equal(Array.isArray(audit.payload.entries), true);
  assert.equal(audit.payload.entries.some((entry) => entry.event === 'write_prepare' && entry.action === 'BATCH'), true);

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

  // Saved query library round trip.
  const queryCreate = await request('/api/saved-queries', {
    method: 'POST',
    body: { name: 'Contract query', folder: 'Contract', query: 'SELECT 1 AS n' }
  });
  assert.equal(queryCreate.response.status, 200);
  assert.equal(queryCreate.payload.item.folder, 'Contract');
  const queryUpdate = await request('/api/saved-queries', {
    method: 'POST',
    body: { name: 'Contract query', folder: 'Contract', query: 'SELECT 2 AS n' }
  });
  assert.equal(queryUpdate.payload.item.id, queryCreate.payload.item.id);
  const queryList = await request('/api/saved-queries');
  assert.equal(queryList.payload.items.filter((item) => item.name === 'Contract query').length, 1);
  const queryMissingName = await request('/api/saved-queries', { method: 'POST', body: { query: 'SELECT 1' } });
  assert.equal(queryMissingName.response.status, 400);
  const queryDelete = await request('/api/saved-queries', { method: 'DELETE', body: { id: queryCreate.payload.item.id } });
  assert.equal(queryDelete.response.status, 200);
  const queryDeleteAgain = await request('/api/saved-queries', { method: 'DELETE', body: { id: queryCreate.payload.item.id } });
  assert.equal(queryDeleteAgain.response.status, 404);

  // A profile tagged prod (the tag alone, never the host name) makes every write on that
  // database need a phrase naming the profile. The batch review never touches the database.
  const prodTagged = await request('/api/saved-connections', {
    method: 'POST',
    body: { ...safeSqlLogin, profileName: 'Contract Gold', environment: 'prod' }
  });
  assert.equal(prodTagged.response.status, 200);
  assert.equal(prodTagged.payload.item.environment, 'prod');
  const prodBatch = await request('/api/query', {
    method: 'POST',
    body: { ...safeSqlLogin, username: 'another-user', query: 'SELECT 1; SELECT 2' }
  });
  assert.equal(prodBatch.response.status, 200);
  assert.equal(prodBatch.payload.expectedText, 'RUN BATCH ON PROD CONTRACT GOLD');
  assert.equal(prodBatch.payload.environment, 'prod');
  // The confirmation belongs to the session that prepared it, so reuse that session cookie.
  const prodSessionCookie = String(prodBatch.response.headers.get('set-cookie') || '').split(';')[0];
  const prodWrongPhrase = await request('/api/query', {
    method: 'POST',
    headers: { cookie: prodSessionCookie },
    body: { ...safeSqlLogin, username: 'another-user', query: 'SELECT 1; SELECT 2', confirmToken: prodBatch.payload.confirmationToken, acknowledgement: 'RUN BATCH' }
  });
  assert.equal(prodWrongPhrase.response.status, 400);
  assert.match(prodWrongPhrase.payload.error, /RUN BATCH ON PROD CONTRACT GOLD/);
  const badEnvironment = await request('/api/saved-connections', {
    method: 'POST',
    body: { ...safeSqlLogin, profileName: 'Bad', environment: 'production' }
  });
  assert.equal(badEnvironment.response.status, 400);
  const prodUntag = await request('/api/saved-connections', {
    method: 'DELETE',
    body: { id: prodTagged.payload.item.id }
  });
  assert.equal(prodUntag.response.status, 200);
  const afterUntag = await request('/api/query', {
    method: 'POST',
    body: { ...safeSqlLogin, query: 'SELECT 1; SELECT 2' }
  });
  assert.equal(afterUntag.payload.expectedText, 'RUN BATCH');

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

  // Row-editability check: the Fabric Lakehouse short-circuit must return before
  // ever opening a connection, so this is safe to assert without a real DB.
  const lakehouseEditability = await request('/api/object-insights', {
    method: 'POST',
    body: {
      sourceType: 'fabric-lakehouse',
      authMode: 'servicePrincipal',
      server: 'demo',
      database: 'lakehouse_db',
      action: 'editability',
      query: 'SELECT * FROM dbo.Table1'
    }
  });
  assert.equal(lakehouseEditability.response.status, 200);
  assert.equal(lakehouseEditability.payload.editable, false);
  assert.match(lakehouseEditability.payload.reason, /read-only/i);

  // A non-editable query shape must also short-circuit before touching a
  // connection, since the shape check runs before withConnection.
  const joinEditability = await request('/api/object-insights', {
    method: 'POST',
    body: { ...safeSqlLogin, action: 'editability', query: 'SELECT a.Id FROM dbo.A a JOIN dbo.B b ON a.Id = b.Id' }
  });
  assert.equal(joinEditability.response.status, 200);
  assert.equal(joinEditability.payload.editable, false);
  assert.match(joinEditability.payload.reason, /JOIN/i);

  const emptyQueryEditability = await request('/api/object-insights', {
    method: 'POST',
    body: { ...safeSqlLogin, action: 'editability', query: '' }
  });
  assert.equal(emptyQueryEditability.response.status, 200);
  assert.equal(emptyQueryEditability.payload.editable, false);

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
