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
import { createConfirmation, deleteConfirmation, getConfirmation, hashConfirmationParts, loadConfirmationStore, purgeExpiredConfirmations } from './confirmation-store.js';
import { deleteSavedConnection, initializeSavedConnectionsStore, listSavedConnections, upsertSavedConnection } from './saved-connections-store.js';
import { isLoopbackRequestUrl } from './next-handler.js';
import {
  classifyQuery,
  buildLimitedReadQuery,
  compactProcedurePreview,
  compactQueryPreview,
  stripCommentsAndTrim
} from './sql-classifier.js';
import {
  executeStoredProcedure,
  describeQueryResultShape,
  loadEstimatedQueryPlan,
  loadColumnsForObject,
  loadObjectDefinition,
  loadObjectDependencies,
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
const AUDIT_LOCAL_ONLY = normalizeBoolean(process.env.AUDIT_LOCAL_ONLY, true);
const MAX_QUERY_LENGTH = Number(process.env.MAX_QUERY_LENGTH || 50000);
const MAX_PROCEDURE_PARAM_LENGTH = Number(process.env.MAX_PROCEDURE_PARAM_LENGTH || 4000);
const AUDIT_ACCESS_MODE = String(process.env.AUDIT_ACCESS_MODE || (AUDIT_LOCAL_ONLY ? 'loopback' : 'same-origin')).trim();

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

async function createWriteConfirmationRecord({ sessionId, connection, query, rowsAffected, action }) {
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
      connection: normalizedConnection,
      query: String(query),
      rowsAffected: Number(rowsAffected || 0),
      action: String(action || '')
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
      connection: normalizedConnection,
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
    username: body?.username ?? query?.username,
    password: body?.password ?? query?.password,
    trustServerCertificate: body?.trustServerCertificate ?? query?.trustServerCertificate
  });
}

async function previewWrite(pool, query) {
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const request = transaction.request();
    const result = await request.query(String(query));
    const rowsAffected = sumRowsAffected(result);
    await transaction.rollback();
    return { rowsAffected };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // Ignore rollback failure after query failure.
    }
    throw error;
  }
}

async function executeWrite(pool, query) {
  const transaction = pool.transaction();
  let committed = false;
  await transaction.begin();
  try {
    const request = transaction.request();
    const result = await request.query(String(query));
    const rowsAffected = sumRowsAffected(result);
    await transaction.commit();
    committed = true;
    return { rowsAffected };
  } catch (error) {
    try {
      if (!committed) {
        await transaction.rollback();
      }
    } catch {
      // Ignore rollback failure after execution failure.
    }
    throw error;
  }
}

const initPromise = Promise.all([loadAuditEntriesFromDisk(), loadConfirmationStore(), initializeSavedConnectionsStore()]);

function limitReadQuery(query) {
  return buildLimitedReadQuery(query, RESPONSE_ROW_LIMIT);
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

  if (!['profile', 'dependencies', 'rowcount', 'topvalues', 'resultshape'].includes(action)) {
    return res.status(400).json({ success: false, error: 'Unsupported object insight action.' });
  }

  if (action !== 'resultshape' && !String(objectName || '').trim()) {
    return res.status(400).json({ success: false, error: 'Object name is required.' });
  }

  try {
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

      const data = await withConnection(connection, async (pool) => (
        executeStoredProcedure(pool, procedure.fullName, rawParameters, parametersMetadata, RESPONSE_ROW_LIMIT)
      ));

      await deleteConfirmation(confirmToken);
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

  try {
    if (classification.kind === 'read') {
      const data = await withConnection(connection, async (pool) => {
        const result = await pool.request().query(limitReadQuery(query));
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
      return res.json({ success: true, mode: 'read', ...data });
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

      const data = await withConnection(connection, async (pool) => executeWrite(pool, record.payload.query));
      await deleteConfirmation(confirmToken);
      addAuditEntry({
        event: 'write_execute',
        outcome: 'success',
        action: classification.action,
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
        rowsAffected: data.rowsAffected,
        message: `${classification.action} completed successfully.`
      });
    }

    const classificationWarnings = Array.isArray(classification.warnings) ? classification.warnings : [];

    if (classification.directConfirmOnly) {
      const record = await createWriteConfirmationRecord({
        sessionId: req.sessionId,
        connection,
        query,
        rowsAffected: 0,
        action: classification.action
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
        heightened: true,
        reviewRequired: true,
        warnings: classificationWarnings,
        message: `${classification.action} is ready to run. Review it carefully, then click Continue to execute.`
      });
    }

    const preview = await withConnection(connection, async (pool) => previewWrite(pool, query));

    const record = await createWriteConfirmationRecord({
      sessionId: req.sessionId,
      connection,
      query,
      rowsAffected: preview.rowsAffected,
      action: classification.action
    });
    const heightened = preview.rowsAffected > HEIGHTENED_CONFIRM_LIMIT;

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
      heightened,
      reviewRequired: true,
      warnings: classificationWarnings,
      message: heightened
        ? `${classification.action} preview complete. This write touches ${preview.rowsAffected} rows. Review it, then click Continue to execute.`
        : `${classification.action} preview complete. Review it, then click Continue to execute.`
    });
  } catch (error) {
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
  }
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
