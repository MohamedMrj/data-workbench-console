import { ClientSecretCredential } from '@azure/identity';
import { getRequiredEnv } from './source-config.js';

const FABRIC_API_ORIGIN = 'https://api.fabric.microsoft.com';
const FABRIC_API_BASE = `${FABRIC_API_ORIGIN}/v1`;
const FABRIC_SCOPE = 'https://api.fabric.microsoft.com/.default';
// Fabric runs a full sync for up to 15 minutes by default. The request is not held that long:
// past this, the sync keeps running in Fabric and the operator is told to refresh shortly.
const DEFAULT_WAIT_LIMIT_MS = 3 * 60 * 1000;
const MAX_LIST_PAGES = 50;

function fabricError(message, httpStatus = 502) {
  const error = new Error(message);
  error.httpStatus = httpStatus;
  return error;
}

function normalizeHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^tcp:/, '')
    .replace(/[,:]\d+$/, '');
}

// Fabric's Location headers point at regional Power BI hosts (for example
// wabi-north-europe-redirect.analysis.windows.net) rather than api.fabric.microsoft.com.
function isTrustedFabricUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && (
      `https://${hostname}` === FABRIC_API_ORIGIN ||
      hostname.endsWith('.analysis.windows.net') ||
      hostname.endsWith('.fabric.microsoft.com')
    );
  } catch {
    return false;
  }
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid URL';
  }
}

// A per-table sync error can carry a full HTTP response dump (status line, then every header).
// The part before the headers says what went wrong; the rest is noise for an operator.
function compactSyncError(error) {
  const message = String(error?.message || '').split(/\r?\n\s*\r?\n\s*Headers:/)[0];
  const compact = message.replace(/\s+/g, ' ').trim();
  const code = String(error?.errorCode || '').trim();
  const text = code && !compact.includes(code) ? `${code}: ${compact}` : compact;
  return text.length > 300 ? `${text.slice(0, 299)}…` : text;
}

function retryAfterMs(response, fallbackSeconds = 5) {
  const seconds = Number(response.headers.get('retry-after'));
  return Math.min(30, Math.max(1, Number.isFinite(seconds) && seconds > 0 ? seconds : fallbackSeconds)) * 1000;
}

async function readFabricError(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // An empty or non-JSON error body still gets the status line below.
  }
  const code = String(body?.errorCode || '').trim();
  const detail = String(body?.message || response.statusText || '').trim();
  const prefix = `Fabric API ${response.status}${code ? ` ${code}` : ''}`;
  if (response.status === 401 || response.status === 403) {
    return fabricError(`${prefix}: ${detail} The service principal needs the Contributor role on the workspace, and the tenant setting "Service principals can use Fabric APIs" must be on.`, 403);
  }
  if (response.status === 429) {
    return fabricError(`${prefix}: Fabric is rate limiting requests. Try again in ${Math.round(retryAfterMs(response, 30) / 1000)} seconds.`, 429);
  }
  return fabricError(`${prefix}: ${detail}`, response.status === 404 ? 404 : 502);
}

/**
 * @param {object} [options]
 * @param {Function} [options.fetchImpl]
 * @param {Function} [options.getToken] resolves to a bearer token for the Fabric API
 * @param {Function} [options.sleep]
 * @param {number} [options.waitLimitMs]
 */
export function createLakehouseMetadataSync(options = {}) {
  const fetchImpl = options.fetchImpl || ((...args) => fetch(...args));
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const waitLimitMs = Number(options.waitLimitMs || DEFAULT_WAIT_LIMIT_MS);
  const now = options.now || (() => Date.now());
  let credential = null;
  const getToken = options.getToken || (async () => {
    credential = credential || new ClientSecretCredential(
      getRequiredEnv('AZURE_TENANT_ID'),
      getRequiredEnv('AZURE_CLIENT_ID'),
      getRequiredEnv('AZURE_CLIENT_SECRET')
    );
    const token = await credential.getToken(FABRIC_SCOPE);
    if (!token?.token) {
      throw fabricError('Could not get a Fabric API token for the service principal.', 502);
    }
    return token.token;
  });
  const endpointCache = new Map();

  async function call(url, { method = 'GET', body } = {}) {
    // The bearer token only goes to Microsoft's Fabric hosts, whatever a Location header says.
    if (!isTrustedFabricUrl(url)) {
      throw fabricError(`Fabric returned an operation URL on an unexpected host (${safeHost(url)}); the sync was not followed.`, 502);
    }
    const token = await getToken();
    return fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  async function listAll(url) {
    const items = [];
    let next = url;
    for (let page = 0; next && page < MAX_LIST_PAGES; page += 1) {
      const response = await call(next);
      if (!response.ok) {
        throw await readFabricError(response);
      }
      const payload = await response.json();
      items.push(...(Array.isArray(payload?.value) ? payload.value : []));
      next = payload?.continuationUri || '';
    }
    return items;
  }

  // The SQL connection only knows a host name and a database name. The host is shared by every
  // item in a workspace, so the Lakehouse is found by both: its SQL endpoint connection string
  // and its display name, which is the database name the endpoint exposes.
  async function resolveSqlEndpoint(connection) {
    const host = normalizeHost(connection.server);
    const database = String(connection.database || '').trim().toLowerCase();
    const cacheKey = `${host}|${database}`;
    if (endpointCache.has(cacheKey)) {
      return endpointCache.get(cacheKey);
    }
    const workspaces = await listAll(`${FABRIC_API_BASE}/workspaces`);
    for (const workspace of workspaces) {
      let lakehouses = [];
      try {
        lakehouses = await listAll(`${FABRIC_API_BASE}/workspaces/${encodeURIComponent(workspace.id)}/lakehouses`);
      } catch (error) {
        // A workspace the principal can see but not read items in is not the one we want.
        if (error.httpStatus === 403 || error.httpStatus === 404) continue;
        throw error;
      }
      const match = lakehouses.find((item) => (
        normalizeHost(item?.properties?.sqlEndpointProperties?.connectionString) === host &&
        String(item?.displayName || '').trim().toLowerCase() === database
      ));
      const sqlEndpointId = match?.properties?.sqlEndpointProperties?.id;
      if (match && sqlEndpointId) {
        const endpoint = {
          workspaceId: workspace.id,
          workspaceName: String(workspace.displayName || ''),
          lakehouseName: String(match.displayName || ''),
          sqlEndpointId
        };
        endpointCache.set(cacheKey, endpoint);
        return endpoint;
      }
    }
    throw fabricError(`No Lakehouse named "${connection.database}" with this SQL endpoint was found in the workspaces the service principal can see. Add the service principal to the Lakehouse's workspace (Contributor) and try again.`, 404);
  }

  // A Lakehouse can hold hundreds of tables and Fabric reports every one, almost all NotRun
  // (already in sync). Only the tables the sync changed or could not sync are passed on.
  function summarize(endpoint, tables, pending) {
    const list = (Array.isArray(tables) ? tables : []).map((table) => ({
      tableName: String(table?.tableName || ''),
      status: String(table?.status || ''),
      lastSuccessfulSyncDateTime: table?.lastSuccessfulSyncDateTime || null,
      error: compactSyncError(table?.error)
    }));
    return {
      ...endpoint,
      pending,
      tables: list.filter((table) => table.status !== 'NotRun'),
      succeeded: list.filter((table) => table.status === 'Success').length,
      failed: list.filter((table) => table.status === 'Failure').length,
      notRun: list.filter((table) => table.status === 'NotRun').length
    };
  }

  // With an operation id the documented api.fabric.microsoft.com/v1/operations URLs are used
  // throughout; the Location headers are only followed when Fabric sends no id.
  async function waitForOperation({ operationId, location }, firstDelayMs, endpoint) {
    const deadline = now() + waitLimitMs;
    const canonicalUrl = operationId ? `${FABRIC_API_BASE}/operations/${encodeURIComponent(operationId)}` : '';
    let operationUrl = canonicalUrl || location;
    let delayMs = firstDelayMs;
    while (now() + delayMs <= deadline) {
      await sleep(delayMs);
      const response = await call(operationUrl);
      if (!response.ok) {
        throw await readFabricError(response);
      }
      const state = await response.json();
      const status = String(state?.status || '');
      if (status === 'Succeeded') {
        const resultUrl = canonicalUrl
          ? `${canonicalUrl}/result`
          : (response.headers.get('location') || `${operationUrl.replace(/\/$/, '')}/result`);
        const result = await call(resultUrl);
        if (!result.ok) {
          throw await readFabricError(result);
        }
        const payload = await result.json();
        return summarize(endpoint, payload?.value, false);
      }
      if (status === 'Failed' || status === 'Undefined') {
        throw fabricError(`Fabric could not sync the SQL endpoint: ${state?.error?.message || status}.`, 502);
      }
      operationUrl = canonicalUrl || response.headers.get('location') || operationUrl;
      delayMs = retryAfterMs(response, delayMs / 1000);
    }
    return summarize(endpoint, [], true);
  }

  async function syncLakehouseMetadata(connection) {
    const endpoint = await resolveSqlEndpoint(connection);
    const url = `${FABRIC_API_BASE}/workspaces/${encodeURIComponent(endpoint.workspaceId)}/sqlEndpoints/${encodeURIComponent(endpoint.sqlEndpointId)}/refreshMetadata`;
    const response = await call(url, { method: 'POST', body: {} });
    if (response.status === 404) {
      // The Lakehouse may have been recreated with a new SQL endpoint; look it up again next time.
      endpointCache.delete(`${normalizeHost(connection.server)}|${String(connection.database || '').trim().toLowerCase()}`);
    }
    if (response.status === 202) {
      const operationId = String(response.headers.get('x-ms-operation-id') || '').trim();
      const location = response.headers.get('location') || '';
      if (!operationId && !location) {
        return summarize(endpoint, [], true);
      }
      return waitForOperation({ operationId, location }, retryAfterMs(response), endpoint);
    }
    if (!response.ok) {
      throw await readFabricError(response);
    }
    const payload = await response.json();
    return summarize(endpoint, payload?.value, false);
  }

  return { resolveSqlEndpoint, syncLakehouseMetadata };
}

const defaultSync = createLakehouseMetadataSync();

export function syncLakehouseMetadata(connection) {
  return defaultSync.syncLakehouseMetadata(connection);
}
