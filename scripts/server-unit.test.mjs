import assert from 'assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dwb-server-unit-'));
process.env.APP_DATA_DIR = path.join(tempRoot, 'data');
process.env.SAVED_CONNECTIONS_FILE = 'saved-connections.json';
process.env.AUDIT_LOG_FILE = path.join(tempRoot, 'audit.ndjson');
process.env.CONFIRMATION_STORE_FILE = path.join(tempRoot, 'confirmations.json');

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
assert.throws(
  () => sourceConfig.buildConfig({ sourceType: 'sql-server', authMode: 'sqlLogin', server: 'demo', database: 'meta_store' }),
  /Username and password/
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

const rateKey = `server-unit-${Date.now()}`;
assert.equal(rateLimit.checkRateLimit(rateKey, { maxRequests: 2, windowMs: 60_000 }).allowed, true);
assert.equal(rateLimit.checkRateLimit(rateKey, { maxRequests: 2, windowMs: 60_000 }).remaining, 0);
assert.equal(rateLimit.checkRateLimit(rateKey, { maxRequests: 2, windowMs: 60_000 }).allowed, false);

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

await fs.rm(tempRoot, { recursive: true, force: true });
console.log('Server unit tests passed.');
process.exit(0);
