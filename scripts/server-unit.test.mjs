import assert from 'assert/strict';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dwb-server-unit-'));
process.env.APP_DATA_DIR = path.join(tempRoot, 'data');
process.env.SAVED_CONNECTIONS_FILE = 'saved-connections.json';
process.env.AUDIT_LOG_FILE = path.join(tempRoot, 'audit.ndjson');
process.env.CONFIRMATION_STORE_FILE = path.join(tempRoot, 'confirmations.json');
// Deliberately tiny so the audit byte cap and the rate-limit pruning window are observable.
process.env.AUDIT_LOG_MAX_BYTES = '1024';
process.env.RATE_LIMIT_WINDOW_MS = '1';

await fs.mkdir(path.dirname(process.env.CONFIRMATION_STORE_FILE), { recursive: true });
await fs.writeFile(process.env.CONFIRMATION_STORE_FILE, JSON.stringify([
  {
    token: 'expired-token',
    type: 'write',
    ownerSessionId: 'session-123456',
    hash: 'hash',
    payload: {},
    createdAt: Date.now() - 10_000,
    expiresAt: Date.now() - 5_000
  }
]), 'utf8');

const sourceConfig = await import('../lib/server/source-config.js');
const rateLimit = await import('../lib/server/rate-limit.js');
const auditStore = await import('../lib/server/audit-store.js');
const confirmationStore = await import('../lib/server/confirmation-store.js');
const savedStore = await import('../lib/server/saved-connections-store.js');
const lifecycleStore = await import('../lib/server/lifecycle-store.js');
const nextHandler = await import('../lib/server/next-handler.js');
const envSettingsStore = await import('../lib/server/env-settings-store.js');
const updateLauncher = await import('../lib/server/update-launcher.js');
const updateStatusStore = await import('../lib/server/update-status-store.js');

function makeReq(url, options = {}) {
  return new Request(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

assert.equal(sourceConfig.normalizeSourceType('lakehouse'), 'fabric-lakehouse');
assert.equal(sourceConfig.normalizeSourceType('mssql'), 'sql-server');
assert.deepEqual(sourceConfig.parseServerAndPort('demo.fabric.microsoft.com,1444'), {
  server: 'demo.fabric.microsoft.com',
  port: 1444
});
assert.equal(sourceConfig.normalizeAuthMode('', 'sql-server'), 'sqlLogin');
assert.equal(sourceConfig.normalizeAuthMode('sqlLogin', 'fabric-sql'), 'servicePrincipal');
assert.equal(sourceConfig.normalizeAuthMode('windowsNtlm', 'sql-server'), 'windowsNtlm');
assert.equal(sourceConfig.normalizeAuthMode('windowsNtlm', 'fabric-sql'), 'servicePrincipal');
assert.throws(
  () => sourceConfig.buildConfig({ sourceType: 'sql-server', authMode: 'sqlLogin', server: 'demo', database: 'meta_store' }),
  /Username and password/
);
assert.throws(
  () => sourceConfig.buildConfig({
    sourceType: 'sql-server',
    authMode: 'windowsNtlm',
    server: 'demo',
    database: 'meta_store',
    username: 'tester',
    password: 'secret'
  }),
  /Domain, username, and password/
);
const sqlLoginConfig = sourceConfig.buildConfig({
  sourceType: 'sql-server',
  authMode: 'sqlLogin',
  server: 'demo,1444',
  database: 'meta_store',
  username: 'tester',
  password: 'secret',
  trustServerCertificate: false
});
assert.equal(sqlLoginConfig.server, 'demo');
assert.equal(sqlLoginConfig.port, 1444);
assert.equal(sqlLoginConfig.user, 'tester');
assert.equal(sqlLoginConfig.options.trustServerCertificate, false);
const windowsConfig = sourceConfig.buildConfig({
  sourceType: 'sql-server',
  authMode: 'windowsNtlm',
  server: 'demo,1444',
  database: 'meta_store',
  domain: 'CONTOSO',
  username: 'tester',
  password: 'secret',
  trustServerCertificate: false
});
assert.equal(windowsConfig.server, 'demo');
assert.equal(windowsConfig.port, 1444);
assert.equal(windowsConfig.authentication.type, 'ntlm');
assert.equal(windowsConfig.authentication.options.domain, 'CONTOSO');
assert.equal(windowsConfig.authentication.options.userName, 'tester');
assert.equal(windowsConfig.authentication.options.password, 'secret');
assert.equal(Object.hasOwn(windowsConfig, 'user'), false);
assert.equal(windowsConfig.options.trustServerCertificate, false);

const rateKey = `server-unit-${Date.now()}`;
assert.equal(rateLimit.checkRateLimit(rateKey, { maxRequests: 2, windowMs: 60_000 }).allowed, true);
assert.equal(rateLimit.checkRateLimit(rateKey, { maxRequests: 2, windowMs: 60_000 }).remaining, 0);
assert.equal(rateLimit.checkRateLimit(rateKey, { maxRequests: 2, windowMs: 60_000 }).allowed, false);

// Bucket pruning must respect the widest window a caller asked for. RATE_LIMIT_WINDOW_MS is 1ms
// here, so pruning with the module default would discard both hits and wrongly re-allow.
const wideRateKey = `server-unit-wide-${Date.now()}`;
assert.equal(rateLimit.checkRateLimit(wideRateKey, { maxRequests: 2, windowMs: 60_000 }).allowed, true);
assert.equal(rateLimit.checkRateLimit(wideRateKey, { maxRequests: 2, windowMs: 60_000 }).allowed, true);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(rateLimit.checkRateLimit(wideRateKey, { maxRequests: 2, windowMs: 60_000 }).allowed, false);

auditStore.addAuditEntry({
  event: 'query',
  outcome: 'success',
  action: 'SELECT',
  sourceType: 'mssql',
  server: 'demo,1433',
  database: 'meta_store',
  detail: 'SELECT 1',
  rowCount: 1
});
auditStore.addAuditEntry({
  event: 'query',
  outcome: 'blocked',
  action: 'BLOCKED',
  sourceType: 'fabric-sql',
  server: 'fabric',
  database: 'bronze',
  detail: 'Only one SQL statement is allowed.'
});
const auditQuery = auditStore.getAuditEntries(10, { outcome: 'success', database: 'meta' });
assert.equal(auditQuery.totalMatched, 1);
assert.equal(auditQuery.entries[0].sourceType, 'sql-server');
assert.equal(auditQuery.entries[0].rowCount, 1);
assert.equal(auditStore.getAuditEntries(10, { search: 'blocked' }).totalMatched, 1);
// Alias filters still resolve, but an unrecognised source type must match nothing rather than
// normalizing into the default source and returning its rows.
assert.equal(auditStore.getAuditEntries(10, { sourceType: 'mssql' }).totalMatched, 1);
assert.equal(auditStore.getAuditEntries(10, { sourceType: 'sql-server' }).totalMatched, 1);
assert.equal(auditStore.getAuditEntries(10, { sourceType: 'nonsense' }).totalMatched, 0);
assert.equal(auditStore.getAuditEntries(10, { sourceType: 'nonsense' }).entries.length, 0);

// The persisted audit file must honour AUDIT_LOG_MAX_BYTES (1024 above) by dropping the
// oldest entries, while never writing an empty file.
const auditProbeCount = 12;
for (let index = 0; index < auditProbeCount; index += 1) {
  auditStore.addAuditEntry({
    event: 'query',
    outcome: 'success',
    action: 'SELECT',
    sourceType: 'sql-server',
    server: 'demo',
    database: 'meta_store',
    detail: `byte cap probe ${index} ${'x'.repeat(80)}`
  });
}
// Each entry queues a serialized full rewrite; let the queue drain before inspecting the file
// (and before the temp directory is removed at the end of this suite).
await new Promise((resolve) => setTimeout(resolve, 600));
const auditFileSize = (await fs.stat(process.env.AUDIT_LOG_FILE)).size;
assert.ok(auditFileSize > 0, 'audit file should never be emptied by the byte cap');
assert.ok(
  auditFileSize <= Number(process.env.AUDIT_LOG_MAX_BYTES),
  `audit file (${auditFileSize} bytes) should stay within AUDIT_LOG_MAX_BYTES`
);
const auditFileLines = (await fs.readFile(process.env.AUDIT_LOG_FILE, 'utf8')).split('\n').filter(Boolean);
assert.ok(auditFileLines.length > 0);
// Oldest overflow is dropped, so the newest entry must survive.
assert.match(auditFileLines.at(-1), new RegExp(`byte cap probe ${auditProbeCount - 1}\\b`));
assert.ok(auditFileLines.length < auditProbeCount, 'oldest entries should have been trimmed');

assert.equal(await confirmationStore.getConfirmation('expired-token'), null);
const confirmationHashA = confirmationStore.hashConfirmationParts({ b: 2, a: 1 });
const confirmationHashB = confirmationStore.hashConfirmationParts({ a: 1, b: 2 });
assert.equal(confirmationHashA, confirmationHashB);
const confirmation = await confirmationStore.createConfirmation({
  type: 'write',
  ownerSessionId: 'session-123456',
  hash: confirmationHashA,
  payload: { query: 'UPDATE dbo.T SET A = 1 WHERE Id = 1' },
  ttlMs: 60_000
});
assert.equal((await confirmationStore.getConfirmation(confirmation.token)).hash, confirmationHashA);
assert.equal(await confirmationStore.deleteConfirmation(confirmation.token), true);
assert.equal(await confirmationStore.getConfirmation(confirmation.token), null);

// claimConfirmation is single-use: a second claim of the same token returns null
// (guards against the confirmation-token double-execution race).
const claimable = await confirmationStore.createConfirmation({
  type: 'write',
  ownerSessionId: 'session-123456',
  hash: confirmationHashA,
  payload: { query: 'DELETE FROM dbo.T WHERE Id = 1' },
  ttlMs: 60_000
});
const concurrentClaims = await Promise.all([
  confirmationStore.claimConfirmation(claimable.token),
  confirmationStore.claimConfirmation(claimable.token)
]);
const winners = concurrentClaims.filter(Boolean);
assert.equal(winners.length, 1, 'exactly one concurrent claim should win');
assert.equal(winners[0].payload.query, 'DELETE FROM dbo.T WHERE Id = 1');
assert.equal(await confirmationStore.claimConfirmation(claimable.token), null);
assert.equal(await confirmationStore.getConfirmation(claimable.token), null);

await savedStore.initializeSavedConnectionsStore();
const saved = await savedStore.upsertSavedConnection({
  profileName: 'Unit Test',
  sourceType: 'sql-server',
  authMode: 'sqlLogin',
  server: 'demo,1444',
  database: 'meta_store',
  username: 'tester',
  password: 'must-not-persist'
});
assert.equal(saved.profileName, 'Unit Test');
assert.equal(saved.server, 'demo');
assert.equal(saved.port, '1444');
assert.equal(Object.hasOwn(saved, 'password'), false);
assert.equal((await savedStore.listSavedConnections()).length, 1);
assert.equal(await savedStore.deleteSavedConnection(saved.id), true);
assert.equal((await savedStore.listSavedConnections()).length, 0);
const savedWindows = await savedStore.upsertSavedConnection({
  profileName: 'Windows Unit Test',
  sourceType: 'sql-server',
  authMode: 'windowsNtlm',
  server: 'demo,1444',
  database: 'meta_store',
  domain: 'CONTOSO',
  username: 'tester',
  password: 'must-not-persist'
});
assert.equal(savedWindows.profileName, 'Windows Unit Test');
assert.equal(savedWindows.authMode, 'windowsNtlm');
assert.equal(savedWindows.domain, 'CONTOSO');
assert.equal(savedWindows.username, 'tester');
assert.equal(Object.hasOwn(savedWindows, 'password'), false);
assert.equal(await savedStore.deleteSavedConnection(savedWindows.id), true);
assert.equal((await savedStore.listSavedConnections()).length, 0);

// A re-save without an id updates the matching profile instead of appending a duplicate.
const dedupeInput = {
  profileName: 'Dedupe',
  sourceType: 'sql-server',
  authMode: 'sqlLogin',
  server: 'demo',
  database: 'dedupe_db',
  username: 'tester'
};
const dedupeFirst = await savedStore.upsertSavedConnection(dedupeInput);
const dedupeSecond = await savedStore.upsertSavedConnection({ ...dedupeInput, profileName: 'Dedupe renamed' });
assert.equal(dedupeSecond.id, dedupeFirst.id);
assert.equal(dedupeSecond.createdAt, dedupeFirst.createdAt);
assert.equal(dedupeSecond.profileName, 'Dedupe renamed');
assert.equal((await savedStore.listSavedConnections()).length, 1);
const distinctDatabase = await savedStore.upsertSavedConnection({ ...dedupeInput, database: 'other_db' });
assert.notEqual(distinctDatabase.id, dedupeFirst.id);
assert.equal((await savedStore.listSavedConnections()).length, 2);

// Parallel saves go through temp-file + rename and must leave no temp files behind.
await Promise.all(Array.from({ length: 8 }, (_, index) => savedStore.upsertSavedConnection({
  ...dedupeInput,
  database: `parallel_${index}`
})));
assert.equal((await savedStore.listSavedConnections()).length, 10);
const savedDirEntries = await fs.readdir(process.env.APP_DATA_DIR);
assert.deepEqual(savedDirEntries.filter((name) => name.endsWith('.tmp')), []);
for (const item of await savedStore.listSavedConnections()) {
  assert.equal(await savedStore.deleteSavedConnection(item.id), true);
}
assert.equal((await savedStore.listSavedConnections()).length, 0);

// Typed acknowledgement: statement-implied phrases, plus the row-count escalation.
const writeAck = await import('../lib/server/write-acknowledgement.js');
const previewedUpdate = { kind: 'write', action: 'UPDATE', requiresAcknowledgement: false };
assert.deepEqual(writeAck.resolveWriteAcknowledgement({ classification: previewedUpdate, rowsAffected: 3, heightenedLimit: 3 }), {
  expectedText: '',
  heightened: false
});
assert.deepEqual(writeAck.resolveWriteAcknowledgement({ classification: previewedUpdate, rowsAffected: 4, heightenedLimit: 3 }), {
  expectedText: 'EXECUTE UPDATE',
  heightened: true
});
assert.equal(writeAck.resolveWriteAcknowledgement({
  classification: { action: 'UPDATE', requiresAcknowledgement: true },
  rowsAffected: 1,
  heightenedLimit: 3
}).expectedText, 'EXECUTE UPDATE');
assert.equal(writeAck.resolveWriteAcknowledgement({
  classification: { action: 'BATCH', multiStatement: true, requiresAcknowledgement: true },
  rowsAffected: 50,
  heightenedLimit: 3
}).expectedText, 'RUN BATCH');
assert.deepEqual(writeAck.resolveWriteAcknowledgement({ classification: previewedUpdate, rowsAffected: null, heightenedLimit: 3 }), {
  expectedText: '',
  heightened: false
});

assert.equal(lifecycleStore.recordHeartbeat({ sessionId: 'bad' }).ok, false);
const heartbeat = lifecycleStore.recordHeartbeat({ sessionId: 'session_1234567890', event: 'active', userAgent: 'unit' });
assert.equal(heartbeat.ok, true);
assert.equal(heartbeat.activeSessions >= 1, true);
assert.equal(lifecycleStore.isLocalLifecycleRequest(makeReq('http://127.0.0.1:3000/api/lifecycle/status', {
  headers: { host: '127.0.0.1:3000' }
})), true);
assert.equal(lifecycleStore.isLocalLifecycleRequest(makeReq('http://127.0.0.1:3000/api/lifecycle/status', {
  headers: { host: 'example.com' }
})), false);

const fastExitUpdater = new EventEmitter();
const fastExitPromise = updateLauncher.waitForUpdaterStart(fastExitUpdater, 50);
fastExitUpdater.emit('spawn');
fastExitUpdater.emit('exit', 0, null);
await fastExitPromise;

const updateLaunchCommand = updateLauncher.buildUpdaterLaunchCommand({
  powerShellPath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  updaterPath: 'C:\\Data Workbench\\scripts\\apply-update.ps1',
  projectDir: 'C:\\Data Workbench',
  port: '3000',
  oldPid: '1234'
});
assert.match(updateLaunchCommand, /^start "" \/min/);
assert.match(updateLaunchCommand, /-WindowStyle Hidden/);
assert.match(updateLaunchCommand, /-File "C:\\Data Workbench\\scripts\\apply-update\.ps1"/);
assert.match(updateLaunchCommand, /-ProjectDir "C:\\Data Workbench"/);
assert.match(updateLaunchCommand, /-OldPid "1234"/);

const failedUpdater = new EventEmitter();
const failedUpdaterPromise = updateLauncher.waitForUpdaterStart(failedUpdater, 50);
failedUpdater.emit('error', new Error('powershell missing'));
await assert.rejects(failedUpdaterPromise, /powershell missing/);

// Guards the fix for a silently-failed self-update: apply-update.ps1's outer try/catch
// always restarts a server on the way out, so the API resets this to 'pending' before
// launching it and the client refuses to treat "server responded" as "update succeeded"
// until it reads back a definite outcome.
const updateStatusProjectDir = path.join(tempRoot, 'update-status-project');
assert.equal(await updateStatusStore.readUpdateStatus(updateStatusProjectDir), null);
await updateStatusStore.writeUpdateStatusPending(updateStatusProjectDir);
const pendingStatus = await updateStatusStore.readUpdateStatus(updateStatusProjectDir);
assert.equal(pendingStatus.outcome, 'pending');
await fs.writeFile(
  path.join(updateStatusProjectDir, '.data', 'update-status.json'),
  JSON.stringify({ outcome: 'failed', error: 'npm run build failed', finishedAt: Date.now() }),
  'utf8'
);
const failedStatus = await updateStatusStore.readUpdateStatus(updateStatusProjectDir);
assert.equal(failedStatus.outcome, 'failed');
assert.equal(failedStatus.error, 'npm run build failed');

assert.deepEqual(envSettingsStore.validateEnvSettingsForTest({
  PORT: '3001',
  NODE_ENV: 'production',
  APP_SELF_UPDATE_ENABLED: 'false',
  APP_SIDE_PANEL_AUTO_HIDE_ENABLED: 'false',
  APP_SIDE_PANEL_IDLE_MS: '30000',
  APP_SIDE_PANEL_FADE_MS: '1200',
  APP_AMBIENT_MOTION_ENABLED: 'false',
  APP_AMBIENT_MOTION_DURATION_MS: '120000',
  APP_TOOLTIPS_ENABLED: 'false',
  APP_TOOLTIP_DELAY_MS: '1200',
  AZURE_CLIENT_SECRET: ''
}), {
  PORT: '3001',
  NODE_ENV: 'production',
  APP_SELF_UPDATE_ENABLED: 'false',
  APP_SIDE_PANEL_AUTO_HIDE_ENABLED: 'false',
  APP_SIDE_PANEL_IDLE_MS: '30000',
  APP_SIDE_PANEL_FADE_MS: '1200',
  APP_AMBIENT_MOTION_ENABLED: 'false',
  APP_AMBIENT_MOTION_DURATION_MS: '120000',
  APP_TOOLTIPS_ENABLED: 'false',
  APP_TOOLTIP_DELAY_MS: '1200'
});
assert.throws(() => envSettingsStore.validateEnvSettingsForTest({ PORT: '99999' }), /at most 65535/);
assert.throws(() => envSettingsStore.validateEnvSettingsForTest({ NODE_ENV: 'staging' }), /must be one of/);
assert.throws(() => envSettingsStore.validateEnvSettingsForTest({ APP_SIDE_PANEL_IDLE_MS: '500' }), /at least 1000/);
assert.throws(() => envSettingsStore.validateEnvSettingsForTest({ APP_AMBIENT_MOTION_DURATION_MS: '1000' }), /at least 30000/);
assert.throws(() => envSettingsStore.validateEnvSettingsForTest({ APP_TOOLTIP_DELAY_MS: '9000' }), /at most 3000/);
assert.throws(() => envSettingsStore.validateEnvSettingsForTest({ UNKNOWN_SETTING: 'x' }), /Unknown setting/);

const envSyncRoot = path.join(tempRoot, 'env-sync');
await fs.mkdir(envSyncRoot, { recursive: true });
const envFile = path.join(envSyncRoot, '.env');
const exampleFile = path.join(envSyncRoot, '.env.example');
const backupDir = path.join(envSyncRoot, 'backups');
await fs.writeFile(envFile, 'PORT=3009\nNODE_ENV=production\n', 'utf8');
await fs.writeFile(exampleFile, 'PORT=3000\nNODE_ENV=production\nAPP_TOOLTIP_DELAY_MS=650\n', 'utf8');
const envBeforeSync = await envSettingsStore.getEnvSettings({ envFile, exampleFile, backupDir });
assert.equal(envBeforeSync.envSync.missingKeys.includes('APP_TOOLTIP_DELAY_MS'), true);
const syncResult = await envSettingsStore.syncMissingEnvSettings({ envFile, exampleFile, backupDir });
assert.equal(syncResult.addedKeys.includes('APP_TOOLTIP_DELAY_MS'), true);
assert.equal(typeof syncResult.backupPath, 'string');
const syncedEnvText = await fs.readFile(envFile, 'utf8');
assert.match(syncedEnvText, /^PORT=3009/m);
assert.match(syncedEnvText, /^APP_TOOLTIP_DELAY_MS=650/m);
assert.equal((await envSettingsStore.getEnvSettings({ envFile, exampleFile, backupDir })).envSync.missingKeys.includes('APP_TOOLTIP_DELAY_MS'), false);
const repositoryEnvExample = await fs.readFile(path.join(process.cwd(), '.env.example'), 'utf8');
for (const field of envSettingsStore.FIELD_DEFINITIONS) {
  assert.match(repositoryEnvExample, new RegExp(`^${field.key}=`, 'm'), `.env.example should include ${field.key}`);
}

const okResponse = await nextHandler.runHandler((_req, res) => res.json({ success: true, value: 42 }), makeReq('http://127.0.0.1:3000/api/unit'));
assert.equal(okResponse.status, 200);
assert.equal(okResponse.headers.get('x-content-type-options'), 'nosniff');
assert.equal((await okResponse.json()).value, 42);
const blockedResponse = await nextHandler.runHandler((_req, res) => res.json({ success: true }), makeReq('http://example.com/api/unit', {
  method: 'POST',
  body: { value: 1 }
}));
assert.equal(blockedResponse.status, 403);
const thrownResponse = await nextHandler.runHandler(() => {
  const error = new Error('teapot');
  error.httpStatus = 418;
  throw error;
}, makeReq('http://127.0.0.1:3000/api/unit'));
assert.equal(thrownResponse.status, 418);
assert.equal((await thrownResponse.json()).error, 'teapot');

// Same-origin guard treats loopback host variants (localhost / 127.0.0.1 / ::1)
// as one origin (matched scheme + port). This is what lets a browser on
// 127.0.0.1 reach a server whose req.url host Next reports as localhost, while
// external origins and mismatched ports are still rejected.
const sameOriginStatus = async (reqUrl, originHeader) => {
  const response = await nextHandler.runHandler((_req, res) => res.json({ success: true }), makeReq(reqUrl, {
    method: 'POST',
    headers: { origin: originHeader },
    body: { value: 1 }
  }));
  return response.status;
};
assert.equal(await sameOriginStatus('http://localhost:3000/api/unit', 'http://127.0.0.1:3000'), 200);
assert.equal(await sameOriginStatus('http://127.0.0.1:3000/api/unit', 'http://localhost:3000'), 200);
assert.equal(await sameOriginStatus('http://localhost:3000/api/unit', 'http://[::1]:3000'), 200);
assert.equal(await sameOriginStatus('http://localhost:3000/api/unit', 'http://evil.com'), 403);
assert.equal(await sameOriginStatus('http://localhost:3000/api/unit', 'http://127.0.0.1:9999'), 403);

// Run registry: session isolation, cancels that land before the query starts, and the
// refusal once a write is committing.
const runRegistry = await import('../lib/server/run-registry.js');
const runIdA = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
assert.equal(runRegistry.normalizeRunId(runIdA.toUpperCase()), runIdA);
assert.equal(runRegistry.normalizeRunId('not-a-uuid'), '');
assert.equal(runRegistry.normalizeRunId(''), '');
const runA = runRegistry.registerRun({ runId: runIdA, sessionId: 'session-a' });
assert.throws(() => runRegistry.registerRun({ runId: runIdA, sessionId: 'session-a' }), (error) => error.httpStatus === 409);
assert.equal(runRegistry.cancelRun({ runId: runIdA, sessionId: 'session-b' }).found, false, 'another session must not see the run');
assert.equal(runA.cancelRequested, false);
assert.deepEqual(runRegistry.cancelRun({ runId: runIdA, sessionId: 'session-a' }), { found: true, cancelled: true, phase: 'running' });
assert.equal(runA.cancelRequested, true);
assert.throws(() => runA.throwIfCancelled('stopped'), (error) => error.code === 'CANCELLED' && error.httpStatus === 409);
runA.release();
assert.equal(runRegistry.cancelRun({ runId: runIdA, sessionId: 'session-a' }).found, false);
const runCommit = runRegistry.registerRun({ runId: runIdA, sessionId: 'session-a' });
let cancelCalls = 0;
runCommit.attach({ cancel: () => { cancelCalls += 1; } });
runCommit.setPhase('committing');
assert.deepEqual(runRegistry.cancelRun({ runId: runIdA, sessionId: 'session-a' }), { found: true, cancelled: false, phase: 'committing' });
assert.equal(cancelCalls, 0, 'a committing write must not be sent a cancel');
runCommit.release();
assert.equal(runRegistry.countActiveRuns({ sessionId: 'session-a' }), 0);
assert.equal(runRegistry.isCancelError({ code: 'ECANCEL' }), true);
assert.equal(runRegistry.isCancelError({ code: 'EABORT', originalError: { code: 'ECANCEL' } }), true);
assert.equal(runRegistry.isCancelError({ code: 'EREQUEST' }), false);

// write-execution with fake pools: a cancel never commits, and a preview always rolls back.
const writeExecution = await import('../lib/server/write-execution.js');
function fakePool({ onQuery = () => ({ rowsAffected: [2], recordset: undefined }) } = {}) {
  const calls = [];
  return {
    calls,
    transaction() {
      return {
        begin: async () => { calls.push('begin'); },
        commit: async () => { calls.push('commit'); },
        rollback: async () => { calls.push('rollback'); },
        request: () => ({ query: async (sql) => { calls.push(`query:${sql}`); return onQuery(sql); }, cancel() {} })
      };
    },
    request: () => ({ query: async (sql) => { calls.push(`read:${sql}`); return onQuery(sql); }, cancel() {} })
  };
}
const previewPool = fakePool();
assert.deepEqual(await writeExecution.previewWrite(previewPool, 'UPDATE t SET a = 1 WHERE b = 2'), { rowsAffected: 2 });
assert.deepEqual(previewPool.calls, ['begin', 'query:UPDATE t SET a = 1 WHERE b = 2', 'rollback']);

const executePool = fakePool();
const executed = await writeExecution.executeWrite(executePool, 'DELETE FROM t WHERE id = 1');
assert.equal(executed.rowsAffected, 2);
assert.deepEqual(executePool.calls, ['begin', 'query:DELETE FROM t WHERE id = 1', 'commit']);

// A cancel that arrives while the statement runs (after it started, before COMMIT) rolls back.
const runIdB = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d';
const cancelDuringRun = runRegistry.registerRun({ runId: runIdB, sessionId: 'session-a' });
const lateCancelPool = fakePool({
  onQuery: () => {
    runRegistry.cancelRun({ runId: runIdB, sessionId: 'session-a' });
    return { rowsAffected: [5] };
  }
});
await assert.rejects(
  writeExecution.executeWrite(lateCancelPool, 'UPDATE t SET a = 1 WHERE b = 2', { runHandle: cancelDuringRun }),
  (error) => error.code === 'CANCELLED' && error.rolledBack === true
);
assert.equal(lateCancelPool.calls.includes('commit'), false, 'a cancelled write must never commit');
assert.equal(lateCancelPool.calls.at(-1), 'rollback');
cancelDuringRun.release();

// A cancel requested before the statement starts stops it from running at all.
const cancelBeforeRun = runRegistry.registerRun({ runId: runIdB, sessionId: 'session-a' });
runRegistry.cancelRun({ runId: runIdB, sessionId: 'session-a' });
const earlyCancelPool = fakePool();
await assert.rejects(writeExecution.runRead(earlyCancelPool, 'SELECT 1', { runHandle: cancelBeforeRun }), (error) => error.code === 'CANCELLED');
assert.deepEqual(earlyCancelPool.calls, [], 'the statement must not be sent after an early cancel');
cancelBeforeRun.release();

// query-export: CSV formula escaping, column de-duplication, and the streaming lifecycle
// against a fake mssql request that emits recordset/row/error/done like the real driver.
const queryExport = await import('../lib/server/query-export.js');
assert.equal(queryExport.csvCell('=1+1'), "'=1+1");
assert.equal(queryExport.csvCell('@SUM(A1)'), "'@SUM(A1)");
assert.equal(queryExport.csvCell('-5'), '-5');
assert.equal(queryExport.csvCell('-x'), "'-x");
assert.equal(queryExport.csvCell('a,b'), '"a,b"');
assert.equal(queryExport.csvCell('say "hi"'), '"say ""hi"""');
assert.equal(queryExport.csvCell('line1\nline2'), '"line1\nline2"');
assert.equal(queryExport.csvCell(null), 'NULL');
assert.equal(queryExport.csvCell(''), '');
assert.equal(queryExport.csvCell(Buffer.from([0xde, 0xad])), '0xDEAD');
assert.equal(queryExport.csvCell(new Date('2026-01-02T03:04:05.000Z')), '2026-01-02T03:04:05.000Z');
assert.deepEqual(queryExport.dedupeColumnNames(['Id', 'id', '', 'Name', 'Id']), ['Id', 'id_2', 'column_3', 'Name', 'Id_3']);
assert.match(queryExport.exportFileName('json', new Date('2026-09-24T10:11:12Z')), /^data-workbench-export-20260924-101112\.json$/);

function fakeExportPool(script) {
  const log = { cancelled: 0, paused: 0, resumed: 0, sql: '', overrides: null };
  const pool = {
    log,
    request(overrides) {
      log.overrides = overrides;
      const request = new EventEmitter();
      request.pause = () => { log.paused += 1; };
      request.resume = () => { log.resumed += 1; };
      request.cancel = () => {
        log.cancelled += 1;
        request.cancelled = true;
      };
      request.query = async (sql) => {
        log.sql = sql;
        setImmediate(() => script(request));
      };
      return request;
    }
  };
  return pool;
}

async function readStream(stream) {
  return new Response(stream).text();
}

const csvPool = fakeExportPool((request) => {
  request.emit('recordset', [{ name: 'Id' }, { name: 'Id' }, { name: 'Note' }]);
  request.emit('row', [1, 10, '=cmd']);
  request.emit('row', [2, null, 'plain']);
  request.emit('done', {});
});
const csvExport = queryExport.startQueryExport({ pool: csvPool, sql: 'SELECT 1', format: 'csv', rowLimit: 100, timeoutMs: 5000 });
const csvText = await readStream((await csvExport.ready).stream);
assert.equal(csvText, "Id,Id_2,Note\r\n1,10,'=cmd\r\n2,NULL,plain\r\n");
assert.deepEqual(await csvExport.finished, { rowCount: 2, truncated: false, cancelled: false, error: null });
assert.deepEqual(csvPool.log.overrides, { requestTimeout: 5000 });

// The server enforces the row limit itself: some query shapes cannot be capped in SQL.
const truncatedPool = fakeExportPool((request) => {
  request.emit('recordset', [{ name: 'n' }]);
  for (let n = 1; n <= 3 && !request.cancelled; n += 1) request.emit('row', [n]);
  if (request.cancelled) request.emit('error', Object.assign(new Error('Canceled.'), { code: 'ECANCEL' }));
  request.emit('done', {});
});
const truncatedExport = queryExport.startQueryExport({ pool: truncatedPool, sql: 'SELECT n', format: 'json', rowLimit: 2 });
const truncatedJson = JSON.parse(await readStream((await truncatedExport.ready).stream));
assert.deepEqual(truncatedJson, { recordsets: [{ columns: ['n'], rows: [{ n: 1 }, { n: 2 }] }], rowCount: 2, truncated: true });
assert.equal((await truncatedExport.finished).truncated, true);
assert.equal(truncatedPool.log.cancelled, 1, 'hitting the export limit must cancel the database request');

// Several recordsets become several JSON entries / CSV blocks.
const multiPool = fakeExportPool((request) => {
  request.emit('recordset', [{ name: 'a' }]);
  request.emit('row', [1]);
  request.emit('recordset', [{ name: 'b' }]);
  request.emit('row', ['x']);
  request.emit('done', {});
});
const multiExport = queryExport.startQueryExport({ pool: multiPool, sql: 'SELECT 1; SELECT 2', format: 'json', rowLimit: 10 });
assert.deepEqual(JSON.parse(await readStream((await multiExport.ready).stream)).recordsets, [
  { columns: ['a'], rows: [{ a: 1 }] },
  { columns: ['b'], rows: [{ b: 'x' }] }
]);

// An error before any metadata rejects `ready`, so the route can still answer with JSON.
const failingPool = fakeExportPool((request) => {
  request.emit('error', Object.assign(new Error('Invalid object name.'), { code: 'EREQUEST' }));
  request.emit('done', {});
});
const failingExport = queryExport.startQueryExport({ pool: failingPool, sql: 'SELECT * FROM nope', format: 'csv', rowLimit: 10 });
await assert.rejects(failingExport.ready, /Invalid object name/);
assert.equal((await failingExport.finished).error.message, 'Invalid object name.');

// Closing the download cancels the database request.
let releaseRows;
const abortPool = fakeExportPool((request) => {
  request.emit('recordset', [{ name: 'n' }]);
  request.emit('row', [1]);
  releaseRows = () => {
    request.emit('error', Object.assign(new Error('Canceled.'), { code: 'ECANCEL' }));
    request.emit('done', {});
  };
});
const abortExport = queryExport.startQueryExport({ pool: abortPool, sql: 'SELECT n', format: 'csv', rowLimit: 10 });
const abortStream = (await abortExport.ready).stream;
await abortStream.cancel();
assert.equal(abortPool.log.cancelled, 1);
releaseRows();
const abortStats = await abortExport.finished;
assert.equal(abortStats.cancelled, true);
assert.equal(abortStats.error, null);

// runHandler passes a streamed body through with the usual security headers.
const streamed = await nextHandler.runHandler(async (_req, res) => {
  res.stream(new Response('a,b\r\n1,2\r\n').body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="x.csv"' } });
}, makeReq('http://localhost:3000/api/unit', { method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: {} }));
assert.equal(streamed.status, 200);
assert.equal(streamed.headers.get('content-type'), 'text/csv; charset=utf-8');
assert.equal(streamed.headers.get('x-content-type-options'), 'nosniff');
assert.equal(streamed.headers.get('cache-control'), 'no-store');
assert.equal(await streamed.text(), 'a,b\r\n1,2\r\n');

await fs.rm(tempRoot, { recursive: true, force: true });
console.log('Server unit tests passed.');
process.exit(0);
