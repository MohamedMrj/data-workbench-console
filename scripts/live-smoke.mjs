import { postQuery, postTestConnection, getTables } from '../lib/server/db-interface.js';

if (!/^true$/i.test(String(process.env.DATA_WORKBENCH_LIVE_TESTS || ''))) {
  console.log('Live smoke skipped. Set DATA_WORKBENCH_LIVE_TESTS=true to enable.');
  process.exit(0);
}

if (process.env.LIVE_TEST_CONFIRM_NON_PRODUCTION !== 'YES_I_UNDERSTAND') {
  throw new Error('Refusing live smoke: set LIVE_TEST_CONFIRM_NON_PRODUCTION=YES_I_UNDERSTAND for a non-production source.');
}

const connection = {
  sourceType: process.env.LIVE_TEST_SOURCE_TYPE || 'fabric-sql',
  authMode: process.env.LIVE_TEST_AUTH_MODE || 'servicePrincipal',
  server: process.env.LIVE_TEST_SERVER || '',
  port: process.env.LIVE_TEST_PORT || '',
  database: process.env.LIVE_TEST_DATABASE || '',
  username: process.env.LIVE_TEST_USERNAME || '',
  password: process.env.LIVE_TEST_PASSWORD || '',
  trustServerCertificate: /^true$/i.test(String(process.env.LIVE_TEST_TRUST_SERVER_CERTIFICATE || 'true'))
};

const productionPattern = /\b(prod|prd|production|live)\b/i;
const liveName = [connection.server, connection.database].join(' ');
if (productionPattern.test(liveName)) {
  throw new Error(`Refusing live smoke: server/database looks production-like (${liveName}). Use an explicit non-production test source.`);
}

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    },
    setHeader() {
      return this;
    }
  };
}

async function call(handler, body = {}, query = {}) {
  const res = makeRes();
  await handler({
    body,
    query,
    sessionId: 'live_smoke_session_123456',
    method: 'POST',
    headers: {},
    cookies: {},
    clientIp: 'local'
  }, res);
  if (res.statusCode >= 400) {
    throw new Error(`Live smoke handler failed with ${res.statusCode}: ${res.payload?.error || JSON.stringify(res.payload)}`);
  }
  return res.payload;
}

await call(postTestConnection, connection);
await call(getTables, connection);
await call(postQuery, { ...connection, query: 'SELECT 1 AS smoke_test_value' });

console.log('Live smoke passed against the configured non-production source.');
