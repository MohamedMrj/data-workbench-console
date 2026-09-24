import {
  AUTH_MODE_DEFINITIONS,
  SOURCE_DEFINITIONS,
  buildConnectionFingerprint,
  getSourceDefinition,
  getServicePrincipalEnvIssues,
  normalizeConnectionInput,
  normalizeBoolean,
  withConnection
} from './source-config.js';
import { addAuditEntry, getAuditConfig, getAuditEntries, loadAuditEntriesFromDisk } from './audit-store.js';
import { claimConfirmation, createConfirmation, deleteConfirmation, getConfirmation, hashConfirmationParts, loadConfirmationStore, purgeExpiredConfirmations } from './confirmation-store.js';
import { deleteSavedConnection, initializeSavedConnectionsStore, listSavedConnections, upsertSavedConnection } from './saved-connections-store.js';
import { isLoopbackRequestUrl } from './next-handler.js';
import {
  analyzeSingleTableSelect,
  classifyQuery,
  buildLimitedReadQuery,
  compactProcedurePreview,
  compactQueryPreview,
  stripCommentsAndTrim
} from './sql-classifier.js';
import { resolveWriteAcknowledgement } from './write-acknowledgement.js';
import { executeWrite, previewWrite, runRead } from './write-execution.js';
import { NO_RUN, cancelRun, countActiveRuns, isCancelError, normalizeRunId, registerRun } from './run-registry.js';
import { exportFileName, startQueryExport } from './query-export.js';
import {
  executeStoredProcedure,
  composeQualifiedObjectName,
  describeQueryResultShape,
  isInlineEditableColumnType,
  loadEstimatedQueryPlan,
  loadColumnsForObject,
  loadObjectDefinition,
  loadObjectDependencies,
  loadObjectKeyColumns,
  loadObjectKind,
  loadObjectRowCount,
  loadObjectSampleProfile,
  loadObjectTopValues,
  loadObjects,
  loadProcedureCatalog,
  loadProcedureParameters,
  loadSchemaCompare,
  mapRecordset,
  normalizeParameterPayload,
  normalizeProcedureName,
  parseQualifiedObjectName,
  sumRowsAffected
} from './sql-metadata.js';

const PORT = Number(process.env.PORT || 3000);
const WRITE_PREVIEW_LIMIT = Number(process.env.WRITE_PREVIEW_LIMIT || 10);
const HEIGHTENED_CONFIRM_LIMIT = Number(process.env.HEIGHTENED_CONFIRM_LIMIT || 3);
const CONFIRMATION_TTL_MS = Number(process.env.CONFIRMATION_TTL_MS || 5 * 60 * 1000);
const RESPONSE_ROW_LIMIT = Number(process.env.RESPONSE_ROW_LIMIT || 250);
const EXPORT_ROW_LIMIT = Math.max(1, Math.min(1000000, Number(process.env.EXPORT_ROW_LIMIT || 100000)));
// Longer than DB_REQUEST_TIMEOUT_MS: the driver timeout keeps running while a slow download
// has the request paused, so a large export would otherwise be cut off mid-file.
const EXPORT_REQUEST_TIMEOUT_MS = Number(process.env.EXPORT_REQUEST_TIMEOUT_MS || 600000);
const MAX_ACTIVE_EXPORTS_PER_SESSION = 2;
const AUDIT_LOCAL_ONLY = normalizeBoolean(process.env.AUDIT_LOCAL_ONLY, true);
const MAX_QUERY_LENGTH = Number(process.env.MAX_QUERY_LENGTH || 50000);
const MAX_PROCEDURE_PARAM_LENGTH = Number(process.env.MAX_PROCEDURE_PARAM_LENGTH || 4000);
const AUDIT_ACCESS_MODE = String(process.env.AUDIT_ACCESS_MODE || (AUDIT_LOCAL_ONLY ? 'loopback' : 'same-origin')).trim();
const SIDE_PANEL_AUTO_HIDE_ENABLED = normalizeBoolean(process.env.APP_SIDE_PANEL_AUTO_HIDE_ENABLED, true);
const SIDE_PANEL_IDLE_MS = Number(process.env.APP_SIDE_PANEL_IDLE_MS || 10000);
const SIDE_PANEL_FADE_MS = Number(process.env.APP_SIDE_PANEL_FADE_MS || 800);
const AMBIENT_MOTION_ENABLED = normalizeBoolean(process.env.APP_AMBIENT_MOTION_ENABLED, true);
const AMBIENT_MOTION_DURATION_MS = Number(process.env.APP_AMBIENT_MOTION_DURATION_MS || 90000);
const AMBIENT_COLOR = String(process.env.APP_AMBIENT_COLOR || '').trim();
const AMBIENT_INTENSITY = Number(process.env.APP_AMBIENT_INTENSITY || 55);
const TOOLTIPS_ENABLED = normalizeBoolean(process.env.APP_TOOLTIPS_ENABLED, true);
const TOOLTIP_DELAY_MS = Number(process.env.APP_TOOLTIP_DELAY_MS || 650);
const EDITOR_AUTOCOMPLETE_ENABLED = normalizeBoolean(process.env.APP_EDITOR_AUTOCOMPLETE_ENABLED, true);

// Startup environment validation — warn loudly but do not crash, because
// some deployments use sqlLogin auth and never need the Azure variables.
(function warnOnMissingEnv() {
  const RECOMMENDED_VARS = [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'AUDIT_LOG_FILE'
  ];
  const missing = RECOMMENDED_VARS.filter((name) => !process.env[name]);
  if (missing.length) {
    console.warn(
      `[db_interface] Startup notice: the following environment variables are not set: ${missing.join(', ')}. ` +
      'Service-principal authentication will be unavailable until AZURE_* variables are provided.'
    );
  }
}());

function makeConfirmationHash(parts) {
  return hashConfirmationParts(parts);
}

function sortedParameterHashPayload(parameters = {}) {
  return Object.keys(parameters)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = parameters[key];
      return accumulator;
    }, {});
}

function buildWriteReviewMessage(classification = {}, rowsAffected = null) {
  const action = String(classification.action || 'QUERY').toUpperCase();
  const warnings = Array.isArray(classification.warnings) ? classification.warnings : [];
  const warningSuffix = warnings.length ? ` ${warnings.join(' ')}` : '';

  if (action === 'BATCH') {
    const count = Number(classification.statementCount || 0);
    const operations = Array.isArray(classification.actions) && classification.actions.length
      ? ` Operations detected: ${classification.actions.join(', ')}.`
      : '';
    return `This batch contains ${count || 'multiple'} SQL statements.${operations} Review every statement, type RUN BATCH, then click Continue to execute.`;
  }

  if (classification.requiresAcknowledgement) {
    const rowSuffix = Number.isFinite(Number(rowsAffected)) && Number(rowsAffected) > HEIGHTENED_CONFIRM_LIMIT
      ? ` This write touches ${rowsAffected} rows.`
      : '';
    return `${action} requires explicit acknowledgement.${rowSuffix}${warningSuffix} Review the SQL, type EXECUTE ${action}, then click Continue to execute.`;
  }

  if (Number.isFinite(Number(rowsAffected)) && Number(rowsAffected) > HEIGHTENED_CONFIRM_LIMIT) {
    return `${action} preview complete. This write touches ${rowsAffected} rows. Review it, then click Continue to execute.`;
  }

  return `${action} preview complete.${warningSuffix} Review it, then click Continue to execute.`;
}

// Confirmation records are persisted to disk (.data/pending-confirmations.json)
// for the TTL window. The stored connection is never read back at execute time
// (the request re-supplies the connection), so we must never persist the secret.
function sanitizeConnectionForPersistence(connection) {
  const { password, ...rest } = normalizeConnectionInput(connection);
  return rest;
}

async function createWriteConfirmationRecord({
  sessionId,
  connection,
  query,
  rowsAffected,
  action,
  expectedText = '',
  statementCount = 1,
  actions = [],
  highRiskActions = [],
  warnings = []
}) {
  const normalizedConnection = normalizeConnectionInput(connection);
  return createConfirmation({
    type: 'write',
    ownerSessionId: sessionId,
    hash: makeConfirmationHash({
      type: 'write',
      connection: buildConnectionFingerprint(normalizedConnection),
      query: stripCommentsAndTrim(query)
    }),
    payload: {
      connection: sanitizeConnectionForPersistence(normalizedConnection),
      query: String(query),
      rowsAffected: Number(rowsAffected || 0),
      action: String(action || ''),
      expectedText: String(expectedText || ''),
      statementCount: Number(statementCount || 1),
      actions: Array.isArray(actions) ? actions : [],
      highRiskActions: Array.isArray(highRiskActions) ? highRiskActions : [],
      warnings: Array.isArray(warnings) ? warnings : []
    },
    ttlMs: CONFIRMATION_TTL_MS
  });
}

async function createProcedureConfirmationRecord({ sessionId, connection, procedure, parameters }) {
  const normalizedConnection = normalizeConnectionInput(connection);
  const normalizedProcedure = normalizeProcedureName(procedure);
  const normalizedParameters = normalizeParameterPayload(parameters);
  return createConfirmation({
    type: 'procedure',
    ownerSessionId: sessionId,
    hash: makeConfirmationHash({
      type: 'procedure',
      connection: buildConnectionFingerprint(normalizedConnection),
      procedure: normalizedProcedure.fullName,
      parameters: sortedParameterHashPayload(normalizedParameters)
    }),
    payload: {
      connection: sanitizeConnectionForPersistence(normalizedConnection),
      procedure: normalizedProcedure,
      parameters: normalizedParameters
    },
    ttlMs: CONFIRMATION_TTL_MS
  });
}

function getConnectionFromBody(body, query) {
  return normalizeConnectionInput({
    sourceType: body?.sourceType ?? query?.sourceType,
    authMode: body?.authMode ?? query?.authMode,
    server: body?.server ?? query?.server,
    port: body?.port ?? query?.port,
    database: body?.database ?? query?.database,
    domain: body?.domain ?? query?.domain,
    username: body?.username ?? query?.username,
    password: body?.password ?? query?.password,
    trustServerCertificate: body?.trustServerCertificate ?? query?.trustServerCertificate
  });
}

const initPromise = Promise.all([loadAuditEntriesFromDisk(), loadConfirmationStore(), initializeSavedConnectionsStore()]);

function limitReadQuery(query) {
  // Re-checked here as well as at routing: the capped shapes (ORDER BY, CTE) execute the
  // user's statement as written, so anything that is not a plain read must never get this far.
  if (classifyQuery(query).kind !== 'read') {
    const error = new Error('Only read queries can run on the read path.');
    error.httpStatus = 400;
    throw error;
  }
  // One row past the limit: capping the SQL at exactly the limit made "exactly 250 rows" and
  // "250 of millions" look the same, so the grid never said a result was cut off.
  // mapRecordset slices back to RESPONSE_ROW_LIMIT and reports `truncated`.
  return buildLimitedReadQuery(query, RESPONSE_ROW_LIMIT + 1);
}

function validateConnection(connection) {
  if (!connection.server || !connection.database) {
    const error = new Error('Server and database are required.');
    error.httpStatus = 400;
    throw error;
  }
  if (connection.authMode === 'sqlLogin' && (!connection.username || !connection.password)) {
    const error = new Error('Username and password are required for SQL login.');
    error.httpStatus = 400;
    throw error;
  }
  if (connection.authMode === 'windowsNtlm' && (!connection.domain || !connection.username || !connection.password)) {
    const error = new Error('Domain, username, and password are required for Windows authentication.');
    error.httpStatus = 400;
    throw error;
  }
}

function assertTextLength(value, maxLength, label) {
  if (String(value || '').length > maxLength) {
    const error = new Error(`${label} exceeds the maximum allowed length.`);
    error.httpStatus = 400;
    throw error;
  }
}

function canReadAudit(req) {
  if (AUDIT_ACCESS_MODE === 'same-origin') {
    return true;
  }
  if (AUDIT_ACCESS_MODE === 'loopback') {
    return isLoopbackRequestUrl(req.url);
  }
  return false;
}

function isUnsupportedResultShapeMetadataError(error) {
  return /dm_exec_describe_first_result_set|Dynamic Management View|not supported|Invalid object name/i.test(String(error?.message || ''));
}

function isUnsupportedShowplanError(error) {
  return /SHOWPLAN|SET SHOWPLAN|not supported|must be the only statements in the batch/i.test(String(error?.message || ''));
}

export async function ensureInitialized() {
  await initPromise;
}

export function getHealth(_req, res) {
  res.json({
    ok: true,
    app: 'db_interface',
    port: PORT,
    time: new Date().toISOString(),
    writePreviewLimit: WRITE_PREVIEW_LIMIT,
    heightenedConfirmLimit: HEIGHTENED_CONFIRM_LIMIT,
    confirmationTtlMs: CONFIRMATION_TTL_MS,
    responseRowLimit: RESPONSE_ROW_LIMIT,
    exportRowLimit: EXPORT_ROW_LIMIT,
    sidePanels: {
      autoHideEnabled: SIDE_PANEL_AUTO_HIDE_ENABLED,
      idleMs: SIDE_PANEL_IDLE_MS,
      fadeMs: SIDE_PANEL_FADE_MS
    },
    appearance: {
      ambientMotionEnabled: AMBIENT_MOTION_ENABLED,
      ambientMotionDurationMs: AMBIENT_MOTION_DURATION_MS,
      ambientColor: AMBIENT_COLOR,
      ambientIntensity: AMBIENT_INTENSITY,
      tooltipsEnabled: TOOLTIPS_ENABLED,
      tooltipDelayMs: TOOLTIP_DELAY_MS,
      editorAutocompleteEnabled: EDITOR_AUTOCOMPLETE_ENABLED
    },
    audit: {
      localOnly: AUDIT_LOCAL_ONLY,
      accessMode: AUDIT_ACCESS_MODE,
      ...getAuditConfig()
    },
    supportedSourceTypes: Object.values(SOURCE_DEFINITIONS).map((source) => ({
      id: source.id,
      label: source.label,
      authModes: source.authModes,
      supportsProcedures: source.supportsProcedures
    })),
    supportedAuthModes: Object.values(AUTH_MODE_DEFINITIONS),
    servicePrincipalConfig: {
      valid: getServicePrincipalEnvIssues().length === 0,
      issues: getServicePrincipalEnvIssues()
    },
    safety: {
      deleteRequiresWhere: false,
      writePreviewFirst: true,
      procedureExecutionRequiresTypedConfirmation: false,
      confirmWithButtonOnly: true,
      fullUserControl: true
    }
  });
}

export function getAudit(req, res) {
  if (!canReadAudit(req)) {
    return res.status(403).json({ success: false, error: 'Audit endpoint is not available for this request context.' });
  }
  res.json(getAuditEntries(req.query.limit || 25, {
    event: req.query.event,
    outcome: req.query.outcome,
    action: req.query.action,
    sourceType: req.query.sourceType,
    database: req.query.database,
    search: req.query.search
  }));
}

export async function postTestConnection(req, res) {
  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  try {
    const data = await withConnection(connection, async (pool, normalizedConnection) => {
      const result = await pool.request().query(`
        SELECT
          DB_NAME() AS database_name,
          @@SERVERNAME AS server_name,
          @@VERSION AS version_info;
      `);
      return {
        ...(result.recordset?.[0] || {}),
        sourceType: normalizedConnection.sourceType,
        authMode: normalizedConnection.authMode
      };
    });

    addAuditEntry({
      event: 'test_connection',
      outcome: 'success',
      action: 'CONNECT',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: `Connection test succeeded for ${connection.sourceLabel}.`
    });
    res.json({ success: true, message: 'Connection successful.', data });
  } catch (error) {
    addAuditEntry({
      event: 'test_connection',
      outcome: 'error',
      action: 'CONNECT',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    res.status(500).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function getTables(req, res) {
  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  try {
    const objects = await withConnection(connection, async (pool) => loadObjects(pool));
    addAuditEntry({
      event: 'load_objects',
      outcome: 'success',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      rowCount: objects.length,
      detail: `Loaded ${objects.length} data objects.`
    });
    res.json({ success: true, objects, tables: objects });
  } catch (error) {
    addAuditEntry({
      event: 'load_objects',
      outcome: 'error',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    res.status(500).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function getColumns(req, res) {
  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  const objectName = req.query?.table || req.query?.object || req.body?.table || req.body?.object;
  if (!String(objectName || '').trim()) {
    addAuditEntry({
      event: 'load_columns',
      outcome: 'blocked',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: 'Object name is required.'
    });
    return res.status(400).json({ success: false, error: 'Object name is required.' });
  }

  try {
    const columns = await withConnection(connection, async (pool) => loadColumnsForObject(pool, objectName));
    const parsed = parseQualifiedObjectName(objectName);
    addAuditEntry({
      event: 'load_columns',
      outcome: 'success',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      rowCount: columns.length,
      detail: `Loaded columns for ${parsed.fullName}.`
    });
    res.json({ success: true, columns, object: parsed.fullName });
  } catch (error) {
    addAuditEntry({
      event: 'load_columns',
      outcome: 'error',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    res.status(500).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function postObjectInsight(req, res) {
  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  const objectName = req.body?.object || req.query?.object;
  const action = String(req.body?.action || req.query?.action || '').trim().toLowerCase();

  if (!['profile', 'dependencies', 'rowcount', 'topvalues', 'resultshape', 'editability'].includes(action)) {
    return res.status(400).json({ success: false, error: 'Unsupported object insight action.' });
  }

  if (!['resultshape', 'editability'].includes(action) && !String(objectName || '').trim()) {
    return res.status(400).json({ success: false, error: 'Object name is required.' });
  }

  try {
    if (action === 'editability') {
      // Advisory only: decides whether the client shows the results-grid Edit
      // button. It never authorizes a write on its own — a save from the editor
      // still becomes an ordinary UPDATE that goes through classifyQuery, a
      // rollback preview, and confirmation exactly like any other write, so a
      // wrong answer here can at worst show/hide a button. This runs after
      // every read the client considers editable-shaped, so it is not audited
      // (unlike the other object-insight actions below) to avoid flooding the
      // audit log with a check that performs no write and reads only catalog
      // metadata already covered by 'load_columns' elsewhere.
      const query = req.body?.query || req.query?.query || '';
      assertTextLength(query, MAX_QUERY_LENGTH, 'Query');
      if (!String(query || '').trim()) {
        return res.json({ success: true, action: 'editability', editable: false, reason: 'No query to inspect.' });
      }

      if (connection.sourceType === 'fabric-lakehouse') {
        return res.json({
          success: true,
          action: 'editability',
          editable: false,
          reason: 'Fabric Lakehouse SQL endpoints are read-only, so results from this source cannot be edited.'
        });
      }

      const shape = analyzeSingleTableSelect(query);
      if (!shape.ok) {
        return res.json({ success: true, action: 'editability', editable: false, reason: shape.reason });
      }

      const fullName = composeQualifiedObjectName(shape.schemaName || 'dbo', shape.objectName);
      const data = await withConnection(connection, async (pool) => {
        const [kind, keyInfo, columns] = await Promise.all([
          loadObjectKind(pool, fullName),
          loadObjectKeyColumns(pool, fullName),
          loadColumnsForObject(pool, fullName)
        ]);
        return { kind, keyInfo, columns };
      });

      if (!data.kind.exists) {
        return res.json({ success: true, action: 'editability', editable: false, reason: `${fullName} was not found in the current catalog.` });
      }
      if (data.kind.objectType !== 'table') {
        return res.json({
          success: true,
          action: 'editability',
          editable: false,
          reason: 'Only tables support inline editing in this version; this result comes from a view.'
        });
      }
      const realColumnNames = new Set(data.columns.map((column) => column.name.toLowerCase()));
      const selectedColumns = shape.columns; // null means the query was `SELECT *`

      if (selectedColumns) {
        const missingKeyColumns = data.keyInfo.keyColumns.filter((key) => (
          !selectedColumns.some((column) => column.toLowerCase() === key.toLowerCase())
        ));
        if (missingKeyColumns.length) {
          return res.json({
            success: true,
            action: 'editability',
            editable: false,
            reason: `Include the primary key column(s) (${missingKeyColumns.join(', ')}) in the SELECT to enable editing.`
          });
        }

        const unknownColumns = selectedColumns.filter((column) => !realColumnNames.has(column.toLowerCase()));
        if (unknownColumns.length) {
          return res.json({
            success: true,
            action: 'editability',
            editable: false,
            reason: `Selected column(s) not found on ${fullName}: ${unknownColumns.join(', ')}.`
          });
        }
      }

      const hasDeclaredKey = data.keyInfo.keyColumns.length > 0;
      const visibleColumnNames = selectedColumns || data.columns.map((column) => column.name);
      // Key columns are included here, not excluded: editing a key column's
      // value is safe because the generated UPDATE always matches the row by
      // its *original* key value in the WHERE clause (buildMatchClause() in
      // public/console-core.js) and sets the new value in the SET clause —
      // the two are independent, so renaming a key never loses the row.
      const editableColumns = data.columns
        .filter((column) => visibleColumnNames.some((name) => name.toLowerCase() === column.name.toLowerCase()))
        .filter((column) => isInlineEditableColumnType(column.type))
        .map((column) => column.name);

      // No declared primary key or unique constraint (common on Fabric Warehouse,
      // which does not enforce them): fall back to matching a row by every
      // visible, comparable column's value instead of refusing to edit outright.
      // This is inherently weaker than a real key — two rows could have
      // identical values in every comparable column — so the client verifies
      // each specific row is still unique in the table right before it writes
      // anything, and refuses that row if it no longer is. See
      // saveResultEdits()/buildRowMatchCountQuery() in public/console-core.js.
      const matchColumns = hasDeclaredKey ? data.keyInfo.keyColumns : editableColumns;

      if (!matchColumns.length) {
        return res.json({
          success: true,
          action: 'editability',
          editable: false,
          reason: 'No column in this result has a type that can be used to match a specific row for editing.'
        });
      }

      return res.json({
        success: true,
        action: 'editability',
        editable: true,
        object: fullName,
        keyColumns: data.keyInfo.keyColumns,
        matchColumns,
        keyType: hasDeclaredKey ? data.keyInfo.keyType : 'all-columns',
        editableColumns,
        columns: data.columns
      });
    }

    if (action === 'resultshape') {
      const query = req.body?.query || req.query?.query || '';
      const fallbackObjectName = req.body?.object || req.query?.object || '';
      assertTextLength(query, MAX_QUERY_LENGTH, 'Query');
      const classification = classifyQuery(query);
      if (classification.kind !== 'read') {
        return res.status(400).json({ success: false, error: 'Result shape metadata is only available for read queries in this app.' });
      }
      const shape = await withConnection(connection, async (pool) => {
        try {
          const rows = await describeQueryResultShape(pool, query);
          return { rows, source: 'sys_dm_exec_describe_first_result_set' };
        } catch (error) {
          if (!fallbackObjectName || !isUnsupportedResultShapeMetadataError(error)) {
            throw error;
          }
          const columns = await loadColumnsForObject(pool, fallbackObjectName);
          return {
            rows: columns.map((column, index) => ({
              column_ordinal: index + 1,
              name: column.name,
              system_type_name: String(column.type || '').toUpperCase(),
              is_nullable: Boolean(column.nullable),
              error_number: null,
              error_message: null
            })),
            source: 'information_schema_columns_fallback',
            warning: 'Result-shape DMV is not supported by this source. Returned active-object column metadata instead.'
          };
        }
      });
      const rows = shape.rows || [];
      addAuditEntry({
        event: 'query_result_shape',
        outcome: 'success',
        action: 'READ_METADATA',
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        rowCount: rows.length,
        detail: compactQueryPreview(query)
      });
      return res.json({
        success: true,
        action: 'resultShape',
        columns: ['column_ordinal', 'name', 'system_type_name', 'is_nullable', 'error_number', 'error_message'],
        rows,
        totalRows: rows.length,
        output: { query_columns: rows.length, source: shape.source },
        warnings: shape.warning ? [shape.warning] : [],
        message: shape.warning || `Loaded result shape metadata for ${rows.length} column(s).`
      });
    }

    if (action === 'profile') {
      const data = await withConnection(connection, async (pool) => (
        loadObjectSampleProfile(pool, objectName, req.body?.selectedColumns || [], req.body?.sampleRows)
      ));
      addAuditEntry({
        event: 'object_profile',
        outcome: 'success',
        action: 'READ_METADATA',
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        rowCount: data.rows.length,
        detail: `Profiled ${objectName} across ${data.selectedColumns.length} column(s) using ${data.sampleRows} sampled row(s).`
      });
      return res.json({
        success: true,
        action: 'profile',
        object: objectName,
        columns: ['column_name', 'data_type', 'nullable', 'sample_rows', 'null_rows', 'distinct_values', 'completeness_pct', 'min_value', 'max_value'],
        rows: data.rows,
        totalRows: data.rows.length,
        output: {
          object: objectName,
          sampled_rows: data.sampleRows,
          profiled_columns: data.selectedColumns.length
        },
        message: `Profiled ${objectName} using ${data.sampleRows} sampled row(s).`
      });
    }

    if (action === 'rowcount') {
      const allowCountFallback = Boolean(req.body?.allowCountFallback || req.query?.allowCountFallback === 'true');
      if (connection.sourceType === 'fabric-lakehouse' && !allowCountFallback) {
        return res.status(400).json({
          success: false,
          error: 'Metadata row count is not supported for Fabric Lakehouse SQL endpoints. Use Count rows to generate an explicit COUNT_BIG query when you want an exact count.'
        });
      }
      const data = await withConnection(connection, async (pool) => loadObjectRowCount(pool, objectName, {
        allowCountFallback
      }));
      const rows = [{
        object_name: data.object,
        row_count: data.rowCount,
        source: data.source,
        exact: data.exact ? 'YES' : 'NO'
      }];
      addAuditEntry({
        event: 'object_row_count',
        outcome: 'success',
        action: 'READ_METADATA',
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        rowCount: data.rowCount,
        detail: `Loaded row count for ${data.object}.`
      });
      return res.json({
        success: true,
        action: 'rowCount',
        object: data.object,
        columns: ['object_name', 'row_count', 'source', 'exact'],
        rows,
        totalRows: rows.length,
        output: { object: data.object, row_count: data.rowCount, source: data.source, exact: data.exact },
        warnings: data.warnings || [],
        message: `Loaded ${data.exact ? 'exact' : 'metadata'} row count for ${data.object}.`
      });
    }

    if (action === 'topvalues') {
      const data = await withConnection(connection, async (pool) => loadObjectTopValues(
        pool,
        objectName,
        req.body?.selectedColumns || [],
        req.body?.topN
      ));
      addAuditEntry({
        event: 'object_top_values',
        outcome: 'success',
        action: 'READ_METADATA',
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        rowCount: data.rows.length,
        detail: `Loaded top values for ${data.object} across ${data.selectedColumns.length} column(s).`
      });
      return res.json({
        success: true,
        action: 'topValues',
        object: data.object,
        columns: ['column_name', 'value', 'value_count'],
        rows: data.rows,
        totalRows: data.rows.length,
        output: { object: data.object, analyzed_columns: data.selectedColumns.length },
        message: `Loaded top values for ${data.object}.`
      });
    }

    const data = await withConnection(connection, async (pool) => loadObjectDependencies(pool, objectName));
    const rows = data.rows || [];
    addAuditEntry({
      event: 'object_dependencies',
      outcome: 'success',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      rowCount: rows.length,
      detail: `Loaded dependency view for ${objectName}.`
    });
    return res.json({
      success: true,
      action: 'dependencies',
      object: objectName,
      columns: ['dependency_direction', 'primary_object', 'related_object', 'related_type'],
      rows,
      nodes: data.nodes || [],
      edges: data.edges || [],
      upstreamCount: data.upstreamCount || 0,
      downstreamCount: data.downstreamCount || 0,
      warnings: data.warnings || [],
      totalRows: rows.length,
      output: {
        object: objectName,
        dependency_rows: rows.length,
        upstream_count: data.upstreamCount || 0,
        downstream_count: data.downstreamCount || 0
      },
      message: rows.length
        ? `Loaded ${rows.length} dependency row(s) for ${objectName}.`
        : `No dependency rows were found for ${objectName}.`
    });
  } catch (error) {
    addAuditEntry({
      event: action === 'profile' ? 'object_profile' : action === 'dependencies' ? 'object_dependencies' : `object_${action}`,
      outcome: 'error',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    return res.status(Number(error.httpStatus || 500)).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function postObjectDefinition(req, res) {
  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  const objectName = req.body?.object || req.query?.object;
  const objectType = req.body?.objectType || req.query?.objectType;
  const scriptMode = req.body?.scriptMode || req.query?.scriptMode || 'alter';

  if (!String(objectName || '').trim()) {
    return res.status(400).json({ success: false, error: 'Object name is required.' });
  }

  try {
    const definition = await withConnection(connection, async (pool) => (
      loadObjectDefinition(pool, objectName, objectType, scriptMode, { sourceType: connection.sourceType })
    ));
    addAuditEntry({
      event: 'object_definition',
      outcome: 'success',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: `Loaded ${definition.scriptMode.toUpperCase()} script for ${definition.objectType} ${definition.object}.`
    });
    return res.json({ success: true, ...definition });
  } catch (error) {
    addAuditEntry({
      event: 'object_definition',
      outcome: 'error',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    return res.status(Number(error.httpStatus || 500)).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function postSchemaCompare(req, res) {
  const leftConnection = normalizeConnectionInput(req.body?.leftConnection || {});
  const rightConnection = normalizeConnectionInput(req.body?.rightConnection || {});
  validateConnection(leftConnection);
  validateConnection(rightConnection);
  const leftObject = req.body?.leftObject;
  const rightObject = req.body?.rightObject;
  const objectType = String(req.body?.objectType || 'table').toLowerCase() === 'view' ? 'view' : 'table';

  if (!String(leftObject || '').trim() || !String(rightObject || '').trim()) {
    return res.status(400).json({ success: false, error: 'Left and right object names are required.' });
  }

  try {
    const data = await withConnection(leftConnection, async (leftPool) => (
      withConnection(rightConnection, async (rightPool) => (
        loadSchemaCompare(leftPool, rightPool, {
          leftObject,
          rightObject,
          objectType,
          leftSourceType: leftConnection.sourceType,
          rightSourceType: rightConnection.sourceType
        })
      ))
    ));
    addAuditEntry({
      event: 'schema_compare',
      outcome: 'success',
      action: 'READ_METADATA',
      sourceType: leftConnection.sourceType,
      server: leftConnection.server,
      database: leftConnection.database,
      rowCount: data.differences.length,
      detail: `Compared ${leftObject} to ${rightObject}.`
    });
    return res.json(data);
  } catch (error) {
    addAuditEntry({
      event: 'schema_compare',
      outcome: 'error',
      action: 'READ_METADATA',
      sourceType: leftConnection.sourceType,
      server: leftConnection.server,
      database: leftConnection.database,
      detail: error.message
    });
    return res.status(Number(error.httpStatus || 500)).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function postQueryPlan(req, res) {
  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  const query = req.body?.query || req.query?.query || '';
  assertTextLength(query, MAX_QUERY_LENGTH, 'Query');
  if (!String(query || '').trim()) {
    return res.status(400).json({ success: false, error: 'Query is required.' });
  }
  const classification = classifyQuery(query);
  if (classification.kind !== 'read') {
    return res.status(400).json({ success: false, error: 'Estimated plans are only available for read queries in this app.' });
  }
  if (connection.sourceType === 'fabric-lakehouse') {
    return res.status(400).json({
      success: false,
      error: 'Estimated plans are not supported for Fabric Lakehouse SQL endpoints in this app.'
    });
  }

  try {
    const data = await withConnection(connection, async (pool) => loadEstimatedQueryPlan(pool, query));
    addAuditEntry({
      event: 'query_plan',
      outcome: 'success',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: compactQueryPreview(query)
    });
    return res.json({
      success: true,
      mode: 'estimated',
      planXml: data.planXml,
      columns: ['property', 'value'],
      rows: [
        { property: 'mode', value: 'estimated' },
        { property: 'plan_xml_length', value: String(data.planXml.length) }
      ],
      totalRows: 2,
      message: data.planXml
        ? 'Loaded estimated execution plan. The query was not executed.'
        : 'Estimated plan request completed, but no plan XML was returned.'
    });
  } catch (error) {
    addAuditEntry({
      event: 'query_plan',
      outcome: 'error',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    const friendlyError = isUnsupportedShowplanError(error)
      ? 'Estimated plans are not supported by this source or permission set. The query was not executed.'
      : `Estimated plan unavailable: ${error.message}`;
    return res.status(Number(error.httpStatus || (isUnsupportedShowplanError(error) ? 400 : 500))).json({
      success: false,
      error: friendlyError,
      code: error.code || null
    });
  }
}

export async function getProcedures(req, res) {
  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  const source = getSourceDefinition(connection.sourceType);

  if (!source.supportsProcedures) {
    return res.json({
      success: true,
      supported: false,
      procedures: [],
      note: `${source.label} does not expose stored procedures in this app.`
    });
  }

  try {
    const procedures = await withConnection(connection, async (pool) => loadProcedureCatalog(pool));
    addAuditEntry({
      event: 'load_procedures',
      outcome: 'success',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      rowCount: procedures.length,
      detail: `Loaded ${procedures.length} stored procedures.`
    });
    res.json({ success: true, supported: true, procedures });
  } catch (error) {
    addAuditEntry({
      event: 'load_procedures',
      outcome: 'error',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    res.status(500).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function getProcedureParameters(req, res) {
  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  const procedureName = req.query?.procedure || req.body?.procedure;
  const source = getSourceDefinition(connection.sourceType);

  if (!String(procedureName || '').trim()) {
    return res.status(400).json({ success: false, error: 'Procedure name is required.' });
  }

  if (!source.supportsProcedures) {
    return res.json({
      success: true,
      supported: false,
      parameters: [],
      note: `${source.label} does not expose stored procedures in this app.`
    });
  }

  try {
    const parameters = await withConnection(connection, async (pool) => loadProcedureParameters(pool, procedureName));
    const procedure = normalizeProcedureName(procedureName);
    addAuditEntry({
      event: 'load_procedure_parameters',
      outcome: 'success',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      rowCount: parameters.length,
      detail: `Loaded parameters for ${procedure.fullName}.`
    });
    res.json({ success: true, supported: true, procedure: procedure.fullName, parameters });
  } catch (error) {
    addAuditEntry({
      event: 'load_procedure_parameters',
      outcome: 'error',
      action: 'READ_METADATA',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    res.status(500).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function postProcedures(req, res) {
  await purgeExpiredConfirmations();

  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  const source = getSourceDefinition(connection.sourceType);
  const procedure = normalizeProcedureName(req.body?.procedure);
  const confirmToken = req.body?.confirmToken;
  const rawParameters = normalizeParameterPayload(req.body?.parameters || {});
  assertTextLength(procedure.fullName, 512, 'Procedure name');
  for (const [name, value] of Object.entries(rawParameters)) {
    assertTextLength(name, 256, 'Procedure parameter name');
    assertTextLength(value, MAX_PROCEDURE_PARAM_LENGTH, `Procedure parameter ${name}`);
  }

  if (!source.supportsProcedures) {
    return res.status(400).json({
      success: false,
      error: `${source.label} does not support stored procedure execution in this app.`
    });
  }

  if (!procedure.fullName) {
    return res.status(400).json({ success: false, error: 'Procedure name is required.' });
  }

  try {
    const parametersMetadata = await withConnection(connection, async (pool) => loadProcedureParameters(pool, procedure.fullName));

    if (confirmToken) {
      const record = await getConfirmation(confirmToken);
      if (!record) {
        return res.status(400).json({ success: false, error: 'Procedure confirmation expired or not found. Prepare the procedure again.' });
      }

      const expectedHash = makeConfirmationHash({
        type: 'procedure',
        connection: buildConnectionFingerprint(connection),
        procedure: procedure.fullName,
        parameters: sortedParameterHashPayload(rawParameters)
      });

      if (!record || record.type !== 'procedure' || record.ownerSessionId !== req.sessionId || record.expiresAt <= Date.now() || record.hash !== expectedHash) {
        await deleteConfirmation(confirmToken);
        return res.status(400).json({ success: false, error: 'The procedure inputs changed or expired. Prepare it again before executing.' });
      }

      const claimed = await claimConfirmation(confirmToken);
      if (!claimed) {
        return res.status(400).json({ success: false, error: 'This procedure run was already executed or expired. Prepare the procedure again before executing.' });
      }

      const data = await withConnection(connection, async (pool) => (
        executeStoredProcedure(pool, procedure.fullName, rawParameters, parametersMetadata, RESPONSE_ROW_LIMIT)
      ));

      addAuditEntry({
        event: 'procedure_execute',
        outcome: 'success',
        action: 'EXEC',
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        rowCount: data.totalRows,
        detail: compactProcedurePreview(procedure.fullName, rawParameters)
      });
      return res.json({
        success: true,
        mode: 'procedure',
        executed: true,
        procedure: procedure.fullName,
        ...data,
        message: `Stored procedure ${procedure.fullName} executed successfully.`
      });
    }

    const record = await createProcedureConfirmationRecord({
      sessionId: req.sessionId,
      connection,
      procedure: procedure.fullName,
      parameters: rawParameters
    });
    addAuditEntry({
      event: 'procedure_prepare',
      outcome: 'success',
      action: 'EXEC',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: compactProcedurePreview(procedure.fullName, rawParameters)
    });
    return res.json({
      success: true,
      mode: 'procedure-preview',
      requiresConfirmation: true,
      confirmationToken: record.token,
      action: 'EXEC',
      procedure: procedure.fullName,
      parameterCount: parametersMetadata.length,
      heightened: true,
      reviewRequired: true,
      message: `Stored procedure ${procedure.fullName} is ready. Review the parameters and click Run procedure to continue.`
    });
  } catch (error) {
    addAuditEntry({
      event: 'procedure_execute',
      outcome: 'error',
      action: 'EXEC',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    res.status(Number(error.httpStatus || 500)).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function postQuery(req, res) {
  await purgeExpiredConfirmations();

  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  const query = req.body?.query;
  const confirmToken = req.body?.confirmToken;
  
  assertTextLength(query, MAX_QUERY_LENGTH, 'Query');

  if (!query || !String(query).trim()) {
    return res.status(400).json({ success: false, error: 'Query is required.' });
  }

  const classification = classifyQuery(query);
  if (classification.kind === 'blocked') {
    addAuditEntry({
      event: 'query',
      outcome: 'blocked',
      action: 'BLOCKED',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: classification.reason
    });
    return res.status(400).json({ success: false, error: classification.reason });
  }

  // The run id is optional: callers that never cancel (older clients, the live results
  // editor's saves) keep working without one.
  const rawRunId = req.body?.runId;
  const runId = normalizeRunId(rawRunId);
  if (rawRunId && !runId) {
    return res.status(400).json({ success: false, error: 'Run id must be a UUID.' });
  }
  const runHandle = runId ? registerRun({ runId, sessionId: req.sessionId, kind: 'query' }) : NO_RUN;
  const startedAt = Date.now();
  let stage = 'read';

  try {
    if (classification.kind === 'read') {
      const data = await withConnection(connection, async (pool) => {
        const result = await runRead(pool, limitReadQuery(query), { runHandle });
        return {
          ...mapRecordset(result, RESPONSE_ROW_LIMIT),
          rowsAffected: sumRowsAffected(result)
        };
      });

      addAuditEntry({
        event: 'query',
        outcome: 'success',
        action: classification.action,
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        rowCount: data.totalRows,
        detail: compactQueryPreview(query)
      });
      return res.json({ success: true, mode: 'read', ...data, rowLimit: RESPONSE_ROW_LIMIT, elapsedMs: Date.now() - startedAt });
    }

    if (confirmToken) {
      const record = await getConfirmation(confirmToken);
      if (!record) {
        return res.status(400).json({ success: false, error: 'Write confirmation expired or not found. Preview the write again.' });
      }

      const expectedHash = makeConfirmationHash({
        type: 'write',
        connection: buildConnectionFingerprint(connection),
        query: stripCommentsAndTrim(query)
      });

      if (!record || record.type !== 'write' || record.ownerSessionId !== req.sessionId || record.expiresAt <= Date.now() || record.hash !== expectedHash) {
        await deleteConfirmation(confirmToken);
        return res.status(400).json({ success: false, error: 'The query changed or expired after preview. Preview again before executing.' });
      }

      const expectedText = String(record.payload.expectedText || '').trim();
      if (expectedText) {
        const acknowledgement = String(req.body?.acknowledgement || '').trim();
        if (acknowledgement.toUpperCase() !== expectedText.toUpperCase()) {
          return res.status(400).json({
            success: false,
            error: `Type the confirmation phrase exactly before executing this operation: ${expectedText}`
          });
        }
      }

      const claimed = await claimConfirmation(confirmToken);
      if (!claimed) {
        return res.status(400).json({ success: false, error: 'This write was already executed or expired. Preview the write again before executing.' });
      }

      stage = 'execute';
      const data = await withConnection(connection, async (pool) => executeWrite(pool, claimed.payload.query, {
        rowLimit: RESPONSE_ROW_LIMIT,
        runHandle
      }));
      const executedAction = String(claimed.payload.action || classification.action || 'QUERY').toUpperCase();
      addAuditEntry({
        event: 'write_execute',
        outcome: 'success',
        action: executedAction,
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        rowCount: data.rowsAffected,
        detail: compactQueryPreview(record.payload.query)
      });
      return res.json({
        success: true,
        mode: 'write',
        executed: true,
        action: executedAction,
        columns: data.columns || [],
        rows: data.rows || [],
        totalRows: Number(data.totalRows || 0),
        truncated: Boolean(data.truncated),
        recordsetCount: data.recordsetCount || 0,
        rowsAffected: data.rowsAffected,
        elapsedMs: Date.now() - startedAt,
        message: `${executedAction} completed successfully.`
      });
    }

    const classificationWarnings = Array.isArray(classification.warnings) ? classification.warnings : [];
    const { expectedText } = resolveWriteAcknowledgement({ classification });

    if (classification.directConfirmOnly) {
      const record = await createWriteConfirmationRecord({
        sessionId: req.sessionId,
        connection,
        query,
        rowsAffected: 0,
        action: classification.action,
        expectedText,
        statementCount: classification.statementCount || 1,
        actions: classification.actions || [classification.action],
        highRiskActions: classification.highRiskActions || [],
        warnings: classificationWarnings
      });

      addAuditEntry({
        event: 'write_prepare',
        outcome: 'success',
        action: classification.action,
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        detail: compactQueryPreview(query)
      });
      return res.json({
        success: true,
        mode: 'write-review',
        requiresConfirmation: true,
        confirmationToken: record.token,
        rowsAffected: null,
        action: classification.action,
        statementCount: classification.statementCount || 1,
        actions: classification.actions || [classification.action],
        highRiskActions: classification.highRiskActions || [],
        expectedText,
        heightened: true,
        reviewRequired: true,
        warnings: classificationWarnings,
        message: buildWriteReviewMessage(classification)
      });
    }

    stage = 'preview';
    const preview = await withConnection(connection, async (pool) => previewWrite(pool, query, { runHandle }));
    // The phrase depends on the previewed row count, so it has to be resolved before the
    // confirmation record is created: the confirm step only enforces what the record stores.
    const previewAcknowledgement = resolveWriteAcknowledgement({
      classification,
      rowsAffected: preview.rowsAffected,
      heightenedLimit: HEIGHTENED_CONFIRM_LIMIT
    });
    const previewExpectedText = previewAcknowledgement.expectedText;
    const heightened = previewAcknowledgement.heightened;

    const record = await createWriteConfirmationRecord({
      sessionId: req.sessionId,
      connection,
      query,
      rowsAffected: preview.rowsAffected,
      action: classification.action,
      expectedText: previewExpectedText,
      statementCount: classification.statementCount || 1,
      actions: classification.actions || [classification.action],
      highRiskActions: classification.highRiskActions || [],
      warnings: classificationWarnings
    });

    addAuditEntry({
      event: 'write_preview',
      outcome: 'success',
      action: classification.action,
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      rowCount: preview.rowsAffected,
      detail: compactQueryPreview(query)
    });
    return res.json({
      success: true,
      mode: 'write-preview',
      requiresConfirmation: true,
      confirmationToken: record.token,
      rowsAffected: preview.rowsAffected,
      action: classification.action,
      statementCount: classification.statementCount || 1,
      actions: classification.actions || [classification.action],
      highRiskActions: classification.highRiskActions || [],
      expectedText: previewExpectedText,
      heightened,
      reviewRequired: true,
      warnings: classificationWarnings,
      message: buildWriteReviewMessage(
        { ...classification, requiresAcknowledgement: Boolean(previewExpectedText) },
        preview.rowsAffected
      )
    });
  } catch (error) {
    if (isCancelError(error, runHandle)) {
      // A cancelled write is rolled back by write-execution.js. rolledBack is false only
      // when that rollback itself failed, which the user must be told about plainly.
      const rolledBack = stage === 'read' ? true : error.rolledBack !== false;
      const message = stage === 'execute'
        ? (rolledBack
          ? 'The write was cancelled and rolled back. Nothing was changed. Preview it again to run it.'
          : 'The write was cancelled, but the rollback could not be confirmed. Check the data before running it again.')
        : stage === 'preview' ? 'The preview was cancelled. Nothing was changed.' : 'The query was cancelled.';
      addAuditEntry({
        event: 'query_cancel',
        outcome: rolledBack ? 'cancelled' : 'error',
        action: classification.action || 'QUERY',
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        detail: `${stage}: ${compactQueryPreview(query)}`
      });
      return res.status(409).json({ success: false, cancelled: true, rolledBack, code: 'CANCELLED', error: message, elapsedMs: Date.now() - startedAt });
    }
    addAuditEntry({
      event: 'query',
      outcome: 'error',
      action: classification.action || 'QUERY',
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    res.status(Number(error.httpStatus || 500)).json({ success: false, error: error.message, code: error.code || null });
  } finally {
    runHandle.release();
  }
}

export async function postQueryExport(req, res) {
  const connection = getConnectionFromBody(req.body, req.query);
  validateConnection(connection);
  const query = req.body?.query;
  assertTextLength(query, MAX_QUERY_LENGTH, 'Query');
  if (!query || !String(query).trim()) {
    return res.status(400).json({ success: false, error: 'Query is required.' });
  }
  const format = String(req.body?.format || 'csv').toLowerCase();
  if (!['csv', 'json'].includes(format)) {
    return res.status(400).json({ success: false, error: 'Export format must be csv or json.' });
  }
  // Exports run the statement for real and uncapped by the grid limit, so only plain reads
  // qualify; writes must keep going through preview and confirmation.
  const classification = classifyQuery(query);
  if (classification.kind !== 'read') {
    return res.status(400).json({ success: false, error: 'Only read (SELECT) queries can be exported.' });
  }
  const rawRunId = req.body?.runId;
  const runId = normalizeRunId(rawRunId);
  if (rawRunId && !runId) {
    return res.status(400).json({ success: false, error: 'Run id must be a UUID.' });
  }
  if (countActiveRuns({ sessionId: req.sessionId, kind: 'export' }) >= MAX_ACTIVE_EXPORTS_PER_SESSION) {
    return res.status(429).json({ success: false, error: `Only ${MAX_ACTIVE_EXPORTS_PER_SESSION} exports can run at once. Wait for one to finish.` });
  }
  const runHandle = runId ? registerRun({ runId, sessionId: req.sessionId, kind: 'export' }) : NO_RUN;
  const startedAt = Date.now();

  let handOver;
  let refuse;
  let streaming = false;
  const handoff = new Promise((resolve, reject) => {
    handOver = resolve;
    refuse = reject;
  });
  // withConnection releases the pool when its callback settles, so the callback waits for the
  // whole stream, not just for the handler to return the response.
  const lifetime = withConnection(connection, async (pool) => {
    const exportRun = startQueryExport({
      pool,
      sql: buildLimitedReadQuery(query, EXPORT_ROW_LIMIT + 1),
      format,
      rowLimit: EXPORT_ROW_LIMIT,
      timeoutMs: EXPORT_REQUEST_TIMEOUT_MS,
      runHandle,
      signal: req.signal
    });
    try {
      const { stream } = await exportRun.ready;
      streaming = true;
      handOver(stream);
    } catch (error) {
      refuse(error);
    }
    return exportRun.finished;
  });
  lifetime.catch((error) => refuse(error));
  lifetime
    .then((stats) => {
      // Failures before the first row are answered (and audited) as a normal JSON error below.
      if (!stats || !streaming) return;
      addAuditEntry({
        event: 'query_export',
        outcome: stats.error ? 'error' : stats.cancelled ? 'cancelled' : 'success',
        action: classification.action,
        sourceType: connection.sourceType,
        server: connection.server,
        database: connection.database,
        rowCount: stats.rowCount,
        detail: `${format.toUpperCase()}${stats.truncated ? ` (stopped at ${EXPORT_ROW_LIMIT} rows)` : ''}: ${compactQueryPreview(query)}`
      });
    })
    .catch(() => {})
    .finally(() => runHandle.release());

  try {
    const stream = await handoff;
    return res.stream(stream, {
      headers: {
        'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFileName(format)}"`,
        'X-Export-Row-Limit': String(EXPORT_ROW_LIMIT),
        'X-Export-Started-At': String(startedAt)
      }
    });
  } catch (error) {
    if (isCancelError(error, runHandle)) {
      return res.status(409).json({ success: false, cancelled: true, code: 'CANCELLED', error: 'The export was cancelled.' });
    }
    addAuditEntry({
      event: 'query_export',
      outcome: 'error',
      action: classification.action,
      sourceType: connection.sourceType,
      server: connection.server,
      database: connection.database,
      detail: error.message
    });
    return res.status(Number(error.httpStatus || 500)).json({ success: false, error: error.message, code: error.code || null });
  }
}

export async function postQueryCancel(req, res) {
  const runId = normalizeRunId(req.body?.runId);
  if (!runId) {
    return res.status(400).json({ success: false, error: 'Run id must be a UUID.' });
  }
  // Unknown and someone else's run look identical, so a session cannot probe for others' runs.
  const outcome = cancelRun({ runId, sessionId: req.sessionId });
  if (!outcome.found) {
    return res.status(404).json({ success: false, error: 'That query is not running.' });
  }
  if (!outcome.cancelled) {
    return res.status(409).json({ success: false, phase: outcome.phase, error: 'The write is already committing and can no longer be cancelled.' });
  }
  return res.status(202).json({ success: true, cancelled: true });
}

export async function getSavedConnections(_req, res) {
  const items = await listSavedConnections();
  return res.json({ success: true, items });
}

export async function postSavedConnections(req, res) {
  const saved = await upsertSavedConnection(req.body || {});
  addAuditEntry({
    event: 'saved_connection_upsert',
    outcome: 'success',
    action: 'SAVE_CONNECTION',
    sourceType: saved.sourceType,
    server: saved.server,
    database: saved.database,
    detail: `Saved connection profile ${saved.profileName || saved.database}.`
  });
  return res.json({ success: true, item: saved });
}

export async function deleteSavedConnections(req, res) {
  const id = String(req.body?.id || req.query?.id || '').trim();
  if (!id) {
    const error = new Error('Saved connection id is required.');
    error.httpStatus = 400;
    throw error;
  }
  const removed = await deleteSavedConnection(id);
  if (!removed) {
    const error = new Error('Saved connection profile not found.');
    error.httpStatus = 404;
    throw error;
  }
  addAuditEntry({
    event: 'saved_connection_delete',
    outcome: 'success',
    action: 'DELETE_CONNECTION',
    detail: `Deleted saved connection profile ${id}.`
  });
  return res.json({ success: true, id });
}
