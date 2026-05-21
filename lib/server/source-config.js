import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

export const DEFAULT_PORT = Number(process.env.DB_PORT || 1433);
export const DEFAULT_CONNECTION_TIMEOUT_MS = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 30000);
export const DEFAULT_REQUEST_TIMEOUT_MS = Number(process.env.DB_REQUEST_TIMEOUT_MS || 120000);
export const DEFAULT_POOL_IDLE_TIMEOUT_MS = Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30000);
export const DEFAULT_POOL_CACHE_TTL_MS = Number(process.env.DB_POOL_CACHE_TTL_MS || 10 * 60 * 1000);

export const SOURCE_DEFINITIONS = {
  'fabric-sql': {
    id: 'fabric-sql',
    label: 'Fabric SQL endpoint',
    authModes: ['servicePrincipal'],
    supportsProcedures: true,
    supportsObjects: true
  },
  'fabric-lakehouse': {
    id: 'fabric-lakehouse',
    label: 'Fabric Lakehouse SQL endpoint',
    authModes: ['servicePrincipal'],
    supportsProcedures: false,
    supportsObjects: true
  },
  'sql-server': {
    id: 'sql-server',
    label: 'SQL Server',
    authModes: ['sqlLogin', 'servicePrincipal'],
    supportsProcedures: true,
    supportsObjects: true
  }
};

export const SOURCE_TYPE_ALIASES = {
  fabric: 'fabric-sql',
  'fabric-database': 'fabric-sql',
  'fabric-db': 'fabric-sql',
  warehouse: 'fabric-sql',
  database: 'fabric-sql',
  lakehouse: 'fabric-lakehouse',
  'lakehouse-sql': 'fabric-lakehouse',
  'fabric-lakehouse-sql': 'fabric-lakehouse',
  sqlserver: 'sql-server',
  sql_server: 'sql-server',
  mssql: 'sql-server'
};

export const AUTH_MODE_DEFINITIONS = {
  servicePrincipal: {
    id: 'servicePrincipal',
    label: 'Azure service principal'
  },
  sqlLogin: {
    id: 'sqlLogin',
    label: 'SQL login'
  }
};

const SERVICE_PRINCIPAL_ENV_NAMES = ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'];

export function getServicePrincipalEnvIssues() {
  return SERVICE_PRINCIPAL_ENV_NAMES
    .filter((name) => !process.env[name])
    .map((name) => `Missing required environment variable: ${name}`);
}

export function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (/^(true|1|yes|on)$/i.test(value)) return true;
    if (/^(false|0|no|off)$/i.test(value)) return false;
  }
  return fallback;
}

export function normalizeSourceType(sourceType) {
  const raw = String(sourceType || '').trim();
  if (!raw) {
    return 'fabric-sql';
  }
  return SOURCE_DEFINITIONS[raw] ? raw : (SOURCE_TYPE_ALIASES[raw.toLowerCase()] || 'fabric-sql');
}

export function getSourceDefinition(sourceType) {
  const normalized = normalizeSourceType(sourceType);
  return SOURCE_DEFINITIONS[normalized] || SOURCE_DEFINITIONS['fabric-sql'];
}

export function normalizeAuthMode(authMode, sourceType) {
  const source = getSourceDefinition(sourceType);
  const normalized = String(authMode || '').trim();
  if (normalized && source.authModes.includes(normalized)) {
    return normalized;
  }
  return source.id === 'sql-server' ? 'sqlLogin' : 'servicePrincipal';
}

export function parseServerAndPort(server, explicitPort) {
  const rawServer = String(server || '').trim();
  if (!rawServer) {
    return { server: '', port: DEFAULT_PORT };
  }

  const cleanServer = rawServer.replace(/^\[|\]$/g, '');
  const explicit = Number(explicitPort);
  if (Number.isInteger(explicit) && explicit > 0 && explicit <= 65535) {
    return {
      server: cleanServer.replace(/[,:]\d+$/, ''),
      port: explicit
    };
  }

  const match = cleanServer.match(/^(.*?)[,:](\d+)$/);
  if (match) {
    const parsedPort = Number(match[2]);
    return {
      server: match[1],
      port: Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : DEFAULT_PORT
    };
  }

  return { server: cleanServer, port: DEFAULT_PORT };
}

export function normalizeServer(server, explicitPort) {
  return parseServerAndPort(server, explicitPort).server;
}

export function normalizeConnectionInput(input = {}) {
  const sourceType = normalizeSourceType(input.sourceType);
  const authMode = normalizeAuthMode(input.authMode, sourceType);
  const parsedServer = parseServerAndPort(input.server, input.port);
  const database = String(input.database || '').trim();
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  const trustServerCertificate = sourceType === 'sql-server'
    ? normalizeBoolean(input.trustServerCertificate, true)
    : false;

  return {
    sourceType,
    sourceLabel: getSourceDefinition(sourceType).label,
    authMode,
    server: parsedServer.server,
    port: parsedServer.port,
    database,
    username,
    password,
    trustServerCertificate
  };
}

export function buildConnectionFingerprint(input) {
  const connection = normalizeConnectionInput(input);
  return [
    connection.sourceType,
    connection.authMode,
    connection.server,
    connection.port,
    connection.database,
    connection.username,
    connection.trustServerCertificate ? 'trust' : 'verify'
  ].join('|');
}

export function buildConfig(connectionInput) {
  const connection = normalizeConnectionInput(connectionInput);
  if (!connection.server || !connection.database) {
    throw new Error('Server and database are required.');
  }

  const source = getSourceDefinition(connection.sourceType);
  if (!source.authModes.includes(connection.authMode)) {
    throw new Error(`${source.label} does not support ${connection.authMode}.`);
  }

  const config = {
    server: connection.server,
    port: connection.port,
    database: connection.database,
    options: {
      encrypt: true,
      trustServerCertificate: connection.trustServerCertificate,
      enableArithAbort: true
    },
    pool: {
      max: 10,
      min: connection.authMode === 'servicePrincipal' ? 1 : 0,
      idleTimeoutMillis: DEFAULT_POOL_IDLE_TIMEOUT_MS
    },
    connectionTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
    requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS
  };

  if (connection.authMode === 'servicePrincipal') {
    config.authentication = {
      type: 'azure-active-directory-service-principal-secret',
      options: {
        clientId: getRequiredEnv('AZURE_CLIENT_ID'),
        clientSecret: getRequiredEnv('AZURE_CLIENT_SECRET'),
        tenantId: getRequiredEnv('AZURE_TENANT_ID')
      }
    };
    return config;
  }

  if (!connection.username || !connection.password) {
    throw new Error('Username and password are required for SQL login.');
  }

  config.user = connection.username;
  config.password = connection.password;
  return config;
}

const poolCache = new Map();

async function disposePoolEntry(fingerprint, cached) {
  const current = poolCache.get(fingerprint);
  if (current && current !== cached) {
    return;
  }

  poolCache.delete(fingerprint);
  if (cached?.disposeTimer) {
    clearTimeout(cached.disposeTimer);
    cached.disposeTimer = null;
  }

  try {
    await cached?.pool?.close();
  } catch {
    // Ignore disposal failures during pool eviction.
  }
}

function schedulePoolDisposal(fingerprint) {
  const cached = poolCache.get(fingerprint);
  if (!cached) {
    return;
  }

  if (cached.disposeTimer) {
    clearTimeout(cached.disposeTimer);
  }

  cached.disposeTimer = setTimeout(async () => {
    const current = poolCache.get(fingerprint);
    if (!current || current.inUse > 0) {
      return;
    }

    await disposePoolEntry(fingerprint, current);
  }, DEFAULT_POOL_CACHE_TTL_MS);
}

async function acquirePool(connectionInput) {
  const normalizedConnection = normalizeConnectionInput(connectionInput);
  const fingerprint = buildConnectionFingerprint(normalizedConnection);
  let cached = poolCache.get(fingerprint);

  if (!cached) {
    const pool = new sql.ConnectionPool(buildConfig(normalizedConnection));
    pool.on('error', () => {
      void disposePoolEntry(fingerprint, cached);
    });
    const connectPromise = pool.connect().catch(async (error) => {
      await disposePoolEntry(fingerprint, cached);
      throw error;
    });
    cached = {
      pool,
      connectPromise,
      inUse: 0,
      disposeTimer: null,
      connection: normalizedConnection
    };
    poolCache.set(fingerprint, cached);
  }

  if (cached.disposeTimer) {
    clearTimeout(cached.disposeTimer);
    cached.disposeTimer = null;
  }

  await cached.connectPromise;
  cached.inUse += 1;
  return { cached, fingerprint };
}

export async function withConnection(connectionInput, work) {
  const { cached, fingerprint } = await acquirePool(connectionInput);
  try {
    return await work(cached.pool, cached.connection);
  } finally {
    cached.inUse = Math.max(0, cached.inUse - 1);
    schedulePoolDisposal(fingerprint);
  }
}
