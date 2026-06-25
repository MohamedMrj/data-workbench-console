import fs from 'fs/promises';
import path from 'path';

const ENV_FILE = path.join(process.cwd(), '.env');
const ENV_EXAMPLE_FILE = path.join(process.cwd(), '.env.example');

export const ENV_SETTING_GROUPS = [
  {
    id: 'runtime',
    title: 'Runtime',
    description: 'Controls how the local desktop server starts and which port it uses.'
  },
  {
    id: 'database',
    title: 'Database Defaults',
    description: 'Connection timeout and pool defaults used by Fabric SQL, Lakehouse SQL, and SQL Server.'
  },
  {
    id: 'safety',
    title: 'Query Safety',
    description: 'Limits that protect query length, previews, confirmations, and response size.'
  },
  {
    id: 'audit',
    title: 'Audit And Local Storage',
    description: 'Controls local audit retention and where runtime files are stored.'
  },
  {
    id: 'lifecycle',
    title: 'Desktop Lifecycle',
    description: 'Controls shutdown, restart, and self-update behavior for the local desktop launcher.'
  },
  {
    id: 'security',
    title: 'Request Guardrails',
    description: 'Browser/API safety settings for local and hosted deployments.'
  },
  {
    id: 'fabric',
    title: 'Fabric Authentication',
    description: 'Service principal credentials used when connecting to Microsoft Fabric sources.'
  }
];

const FIELD_DEFINITIONS = [
  {
    key: 'PORT',
    group: 'runtime',
    type: 'number',
    min: 1,
    max: 65535,
    defaultValue: '3000',
    label: 'App port',
    description: 'Local browser port for Data Workbench. Keep 3000 unless another app already uses it.',
    appropriate: '1-65535. Most users should keep 3000.',
    restartRequired: true
  },
  {
    key: 'NODE_ENV',
    group: 'runtime',
    type: 'select',
    options: ['production', 'development'],
    defaultValue: 'production',
    label: 'Runtime mode',
    description: 'Production uses the optimized built app. Development is only for coding with npm run dev.',
    appropriate: 'Use production for desktop users.',
    restartRequired: true
  },
  {
    key: 'DB_PORT',
    group: 'database',
    type: 'number',
    min: 1,
    max: 65535,
    defaultValue: '1433',
    label: 'Default SQL port',
    description: 'Default port used when a connection profile does not specify a port.',
    appropriate: '1433 for Fabric and most SQL Server connections.',
    restartRequired: true
  },
  {
    key: 'DB_CONNECTION_TIMEOUT_MS',
    group: 'database',
    type: 'number',
    min: 1000,
    max: 300000,
    defaultValue: '30000',
    label: 'Connection timeout',
    description: 'How long to wait while opening a database connection.',
    appropriate: '30000-60000 for most networks.',
    restartRequired: true
  },
  {
    key: 'DB_REQUEST_TIMEOUT_MS',
    group: 'database',
    type: 'number',
    min: 1000,
    max: 1800000,
    defaultValue: '120000',
    label: 'Request timeout',
    description: 'Maximum time a database request can run before the driver cancels it.',
    appropriate: '120000 for normal use; increase only for slow metadata or long reads.',
    restartRequired: true
  },
  {
    key: 'DB_POOL_IDLE_TIMEOUT_MS',
    group: 'database',
    type: 'number',
    min: 1000,
    max: 600000,
    defaultValue: '30000',
    label: 'Pool idle timeout',
    description: 'How long idle SQL connections stay open before they are closed.',
    appropriate: '30000 is a practical local default.',
    restartRequired: true
  },
  {
    key: 'DB_POOL_CACHE_TTL_MS',
    group: 'database',
    type: 'number',
    min: 1000,
    max: 3600000,
    defaultValue: '600000',
    label: 'Pool cache TTL',
    description: 'How long compatible connection pools can be reused.',
    appropriate: '600000 means 10 minutes.',
    restartRequired: true
  },
  {
    key: 'WRITE_PREVIEW_LIMIT',
    group: 'safety',
    type: 'number',
    min: 1,
    max: 100,
    defaultValue: '10',
    label: 'Write preview rows',
    description: 'Number of rows sampled for write previews before confirmation.',
    appropriate: 'Keep small, usually 10.',
    restartRequired: true
  },
  {
    key: 'HEIGHTENED_CONFIRM_LIMIT',
    group: 'safety',
    type: 'number',
    min: 1,
    max: 1000000,
    defaultValue: '3',
    label: 'Heightened confirmation threshold',
    description: 'Write previews above this affected-row count require stronger confirmation.',
    appropriate: 'Small values are safer. Default is 3.',
    restartRequired: true
  },
  {
    key: 'CONFIRMATION_TTL_MS',
    group: 'safety',
    type: 'number',
    min: 10000,
    max: 3600000,
    defaultValue: '300000',
    label: 'Confirmation expiry',
    description: 'How long a write/procedure confirmation token remains valid.',
    appropriate: '300000 means 5 minutes.',
    restartRequired: true
  },
  {
    key: 'RESPONSE_ROW_LIMIT',
    group: 'safety',
    type: 'number',
    min: 1,
    max: 5000,
    defaultValue: '250',
    label: 'Response row limit',
    description: 'Maximum number of result rows returned to the browser by default.',
    appropriate: '250 keeps the UI responsive. Avoid large values.',
    restartRequired: true
  },
  {
    key: 'MAX_QUERY_LENGTH',
    group: 'safety',
    type: 'number',
    min: 1000,
    max: 1000000,
    defaultValue: '50000',
    label: 'Max query length',
    description: 'Maximum SQL text length accepted by the query endpoint.',
    appropriate: '50000 is enough for most scripts loaded into the editor.',
    restartRequired: true
  },
  {
    key: 'MAX_PROCEDURE_PARAM_LENGTH',
    group: 'safety',
    type: 'number',
    min: 100,
    max: 100000,
    defaultValue: '4000',
    label: 'Max procedure parameter length',
    description: 'Maximum text length accepted for each stored procedure parameter value.',
    appropriate: '4000 is suitable for normal procedure parameters.',
    restartRequired: true
  },
  {
    key: 'AUDIT_LOG_LIMIT',
    group: 'audit',
    type: 'number',
    min: 1,
    max: 10000,
    defaultValue: '200',
    label: 'Audit entry limit',
    description: 'Maximum number of local audit entries kept in memory/file rotation.',
    appropriate: '200-1000 for local desktop use.',
    restartRequired: true
  },
  {
    key: 'AUDIT_LOG_MAX_BYTES',
    group: 'audit',
    type: 'number',
    min: 1024,
    max: 104857600,
    defaultValue: '1048576',
    label: 'Audit max file size',
    description: 'Maximum audit file size before rotation compacts entries.',
    appropriate: '1048576 means 1 MB.',
    restartRequired: true
  },
  {
    key: 'AUDIT_LOCAL_ONLY',
    group: 'audit',
    type: 'boolean',
    defaultValue: 'true',
    label: 'Audit local only',
    description: 'Restricts audit reads to local desktop access.',
    appropriate: 'Keep true for local desktop installs.',
    restartRequired: true
  },
  {
    key: 'AUDIT_ACCESS_MODE',
    group: 'audit',
    type: 'select',
    options: ['loopback', 'same-origin'],
    defaultValue: 'loopback',
    label: 'Audit access mode',
    description: 'Controls which browser requests can read audit entries.',
    appropriate: 'loopback for desktop, same-origin for hosted/internal web deployments.',
    restartRequired: true
  },
  {
    key: 'AUDIT_LOG_FILE',
    group: 'audit',
    type: 'text',
    defaultValue: './audit-log.ndjson',
    label: 'Audit log file',
    description: 'Local file used for audit entries.',
    appropriate: 'Use a relative path in the app folder or a private local path.',
    restartRequired: true
  },
  {
    key: 'APP_DATA_DIR',
    group: 'audit',
    type: 'text',
    defaultValue: 'data',
    label: 'App data folder',
    description: 'Folder for local saved profiles and app data files.',
    appropriate: 'Use data or a private local folder.',
    restartRequired: true
  },
  {
    key: 'SAVED_CONNECTIONS_FILE',
    group: 'audit',
    type: 'text',
    defaultValue: 'saved-connections.json',
    label: 'Saved profiles file',
    description: 'File name used inside the app data folder for saved connection profiles.',
    appropriate: 'Keep saved-connections.json unless you need a separate profile store.',
    restartRequired: true
  },
  {
    key: 'CONFIRMATION_STORE_FILE',
    group: 'audit',
    type: 'text',
    defaultValue: '.data/pending-confirmations.json',
    label: 'Pending confirmations file',
    description: 'Local file used for pending write/procedure confirmation tokens.',
    appropriate: 'Keep under .data for local desktop use.',
    restartRequired: true
  },
  {
    key: 'APP_HEARTBEAT_GRACE_MS',
    group: 'lifecycle',
    type: 'number',
    min: 60000,
    max: 86400000,
    defaultValue: '7200000',
    label: 'Shutdown grace period',
    description: 'How long the hidden server waits without browser heartbeats before auto-shutdown.',
    appropriate: '7200000 means 2 hours.',
    restartRequired: true
  },
  {
    key: 'APP_SHUTDOWN_DELAY_MS',
    group: 'lifecycle',
    type: 'number',
    min: 0,
    max: 60000,
    defaultValue: '2500',
    label: 'Shutdown delay',
    description: 'Delay before the server process exits after shutdown is requested.',
    appropriate: '2500 is a short, visible delay.',
    restartRequired: true
  },
  {
    key: 'APP_LOCAL_SHUTDOWN_ENABLED',
    group: 'lifecycle',
    type: 'boolean',
    defaultValue: 'true',
    label: 'Local shutdown enabled',
    description: 'Allows the browser to stop the local desktop server.',
    appropriate: 'Keep true for desktop; use false for hosted environments.',
    restartRequired: true
  },
  {
    key: 'APP_SIDE_PANEL_AUTO_HIDE_ENABLED',
    group: 'lifecycle',
    type: 'boolean',
    defaultValue: 'true',
    label: 'Side panel auto-hide',
    description: 'Controls whether the connection panel and themes/history panel fade and collapse after they are not used.',
    appropriate: 'true keeps the current space-saving behavior; false keeps side panels visible until users hide them manually.',
    restartRequired: true
  },
  {
    key: 'APP_SIDE_PANEL_IDLE_MS',
    group: 'lifecycle',
    type: 'number',
    min: 1000,
    max: 3600000,
    defaultValue: '10000',
    label: 'Side panel idle delay',
    description: 'How long visible side panels wait without pointer, focus, or input activity before fade-out starts.',
    appropriate: '10000 means 10 seconds. Use 30000-60000 if users want panels to stay visible longer.',
    restartRequired: true
  },
  {
    key: 'APP_SIDE_PANEL_FADE_MS',
    group: 'lifecycle',
    type: 'number',
    min: 0,
    max: 10000,
    defaultValue: '800',
    label: 'Side panel fade duration',
    description: 'How long the side panel fade animation lasts before the panel collapses.',
    appropriate: '800 is the default soft fade. Use 0 for instant collapse or 1200-2000 for a slower fade.',
    restartRequired: true
  },
  {
    key: 'APP_SELF_UPDATE_ENABLED',
    group: 'lifecycle',
    type: 'boolean',
    defaultValue: 'true',
    label: 'Self-update enabled',
    description: 'Allows the local-only Update button/API for Git-installed desktop copies.',
    appropriate: 'Keep true for trusted local desktop installs.',
    restartRequired: true
  },
  {
    key: 'ALLOW_LOCAL_MISSING_ORIGIN',
    group: 'security',
    type: 'boolean',
    defaultValue: 'true',
    label: 'Allow missing local origin',
    description: 'Allows local loopback requests without Origin/Referer headers.',
    appropriate: 'true for desktop compatibility; false for hosted environments.',
    restartRequired: true
  },
  {
    key: 'POST_RATE_LIMIT_MAX',
    group: 'security',
    type: 'number',
    min: 1,
    max: 10000,
    defaultValue: '90',
    label: 'POST rate limit',
    description: 'Maximum POST requests per rate-limit window.',
    appropriate: '90 is enough for normal UI use.',
    restartRequired: true
  },
  {
    key: 'POST_RATE_LIMIT_WINDOW_MS',
    group: 'security',
    type: 'number',
    min: 1000,
    max: 3600000,
    defaultValue: '60000',
    label: 'POST rate window',
    description: 'Window used for POST rate limiting.',
    appropriate: '60000 means 1 minute.',
    restartRequired: true
  },
  {
    key: 'AZURE_CLIENT_ID',
    group: 'fabric',
    type: 'text',
    defaultValue: '',
    label: 'Azure client ID',
    description: 'Application/client ID for the service principal used with Fabric sources.',
    appropriate: 'Use the app registration client ID.',
    restartRequired: true
  },
  {
    key: 'AZURE_CLIENT_SECRET',
    group: 'fabric',
    type: 'secret',
    defaultValue: '',
    label: 'Azure client secret',
    description: 'Client secret for the Fabric service principal.',
    appropriate: 'Paste a valid secret. It is written to .env but never returned to the browser.',
    restartRequired: true
  },
  {
    key: 'AZURE_TENANT_ID',
    group: 'fabric',
    type: 'text',
    defaultValue: '',
    label: 'Azure tenant ID',
    description: 'Entra ID tenant that owns the service principal.',
    appropriate: 'Use the tenant/directory ID.',
    restartRequired: true
  }
];

const FIELD_MAP = new Map(FIELD_DEFINITIONS.map((field) => [field.key, field]));
const BOOLEAN_VALUES = new Set(['true', 'false']);

function normalizeLineEndings(text = '') {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseEnvText(text = '') {
  const normalized = normalizeLineEndings(text);
  const lines = normalized.length ? normalized.split('\n') : [];
  if (lines.at(-1) === '') {
    lines.pop();
  }

  const values = {};
  const entries = [];
  const keyIndex = new Map();

  lines.forEach((raw, index) => {
    const match = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      entries.push({ type: 'raw', raw });
      return;
    }

    const key = match[1];
    const value = unquoteEnvValue(match[2] || '');
    values[key] = value;
    keyIndex.set(key, index);
    entries.push({ type: 'setting', raw, key, value });
  });

  return { entries, values, keyIndex };
}

function unquoteEnvValue(value = '') {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function quoteEnvValue(value = '') {
  const text = String(value ?? '');
  if (!text) {
    return '';
  }
  if (/[\s#"'`]/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function sanitizeFieldValue(field, rawValue) {
  let value = String(rawValue ?? '').trim();

  if (field.type === 'secret' && value === '') {
    return { value, skip: true };
  }

  if (field.type === 'number') {
    if (!/^-?\d+$/.test(value)) {
      throw new Error(`${field.key} must be a whole number.`);
    }
    const numberValue = Number(value);
    if (!Number.isSafeInteger(numberValue)) {
      throw new Error(`${field.key} must be a safe whole number.`);
    }
    if (field.min !== undefined && numberValue < field.min) {
      throw new Error(`${field.key} must be at least ${field.min}.`);
    }
    if (field.max !== undefined && numberValue > field.max) {
      throw new Error(`${field.key} must be at most ${field.max}.`);
    }
    value = String(numberValue);
  }

  if (field.type === 'boolean') {
    value = value.toLowerCase();
    if (!BOOLEAN_VALUES.has(value)) {
      throw new Error(`${field.key} must be true or false.`);
    }
  }

  if (field.type === 'select') {
    if (!field.options.includes(value)) {
      throw new Error(`${field.key} must be one of: ${field.options.join(', ')}.`);
    }
  }

  if (['text', 'secret'].includes(field.type)) {
    if (/[\r\n]/.test(value)) {
      throw new Error(`${field.key} cannot contain line breaks.`);
    }
    if (value.length > 4000) {
      throw new Error(`${field.key} is too long.`);
    }
  }

  return { value };
}

function fieldForClient(field, values) {
  const configured = Object.hasOwn(values, field.key) && values[field.key] !== '';
  return {
    ...field,
    value: field.type === 'secret' ? '' : (values[field.key] ?? field.defaultValue ?? ''),
    configured,
    secret: field.type === 'secret'
  };
}

export async function getEnvSettings() {
  const [envText, exampleText] = await Promise.all([
    readOptionalFile(ENV_FILE),
    readOptionalFile(ENV_EXAMPLE_FILE)
  ]);
  const env = parseEnvText(envText || exampleText);

  return {
    envExists: Boolean(envText),
    envPath: ENV_FILE,
    groups: ENV_SETTING_GROUPS,
    settings: FIELD_DEFINITIONS.map((field) => fieldForClient(field, env.values)),
    restartRequired: true
  };
}

export async function updateEnvSettings(input = {}) {
  const updates = input.settings && typeof input.settings === 'object' ? input.settings : {};
  const unknownKeys = Object.keys(updates).filter((key) => !FIELD_MAP.has(key));
  if (unknownKeys.length) {
    throw new Error(`Unknown setting(s): ${unknownKeys.join(', ')}.`);
  }

  const [envText, exampleText] = await Promise.all([
    readOptionalFile(ENV_FILE),
    readOptionalFile(ENV_EXAMPLE_FILE)
  ]);
  const parsed = parseEnvText(envText || exampleText);
  const lines = parsed.entries.map((entry) => entry.raw);
  const changedKeys = [];

  for (const [key, rawValue] of Object.entries(updates)) {
    const field = FIELD_MAP.get(key);
    const { value, skip } = sanitizeFieldValue(field, rawValue);
    if (skip) {
      continue;
    }

    const nextLine = `${key}=${quoteEnvValue(value)}`;
    const lineIndex = parsed.keyIndex.get(key);
    const previousValue = parsed.values[key] ?? '';
    if (lineIndex !== undefined) {
      lines[lineIndex] = nextLine;
    } else {
      if (lines.length && lines.at(-1) !== '') {
        lines.push('');
      }
      lines.push(nextLine);
    }

    if (previousValue !== value) {
      changedKeys.push(key);
    }
  }

  if (!lines.length) {
    for (const field of FIELD_DEFINITIONS) {
      lines.push(`${field.key}=${quoteEnvValue(field.defaultValue ?? '')}`);
    }
  }

  await fs.writeFile(ENV_FILE, `${lines.join('\n')}\n`, 'utf8');

  return {
    envPath: ENV_FILE,
    changedKeys,
    restartRequired: changedKeys.length > 0,
    settings: (await getEnvSettings()).settings
  };
}

export function validateEnvSettingsForTest(input = {}) {
  const output = {};
  for (const [key, rawValue] of Object.entries(input)) {
    const field = FIELD_MAP.get(key);
    if (!field) {
      throw new Error(`Unknown setting(s): ${key}.`);
    }
    const sanitized = sanitizeFieldValue(field, rawValue);
    if (!sanitized.skip) {
      output[key] = sanitized.value;
    }
  }
  return output;
}
