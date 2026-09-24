import { JSDOM } from 'jsdom';
import fs from 'fs/promises';
import path from 'path';

const appDir = path.join(process.cwd(), '.next', 'server', 'app');
const coreScript = await fs.readFile(path.join(process.cwd(), 'public', 'console-core.js'), 'utf8');
const appScript = await fs.readFile(path.join(process.cwd(), 'public', 'console-app.js'), 'utf8');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function waitForCondition(predicate, message, timeoutMs = 2500, intervalMs = 25) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(message);
}

async function readBuiltHtml(routeSegments = []) {
  const candidates = routeSegments.length === 0
    ? [path.join(appDir, 'index.html')]
    : [
        path.join(appDir, `${routeSegments.join(path.sep)}.html`),
        path.join(appDir, ...routeSegments, 'index.html')
      ];

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error(`Could not locate built HTML for route ${routeSegments.join('/') || '/'}.`);
}

async function assertBuildIsFresh() {
  const buildArtifact = path.join(appDir, 'index.html');
  try {
    await fs.stat(buildArtifact);
  } catch {
    throw new Error('UI smoke test build output is missing. Run `npm run build` before `node scripts/ui-smoke.mjs`.');
  }
}

function attachMocks(window) {
  let envSettingsSynced = false;
  window.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};

    if (String(url).includes('/api/health')) {
      return new Response(JSON.stringify({
        ok: true,
        writePreviewLimit: 10,
        heightenedConfirmLimit: 3,
        responseRowLimit: 250,
        confirmationTtlMs: 300000,
        safety: {
          deleteRequiresWhere: false,
          writePreviewFirst: true,
          procedureExecutionRequiresTypedConfirmation: false,
          confirmWithButtonOnly: true,
          fullUserControl: true
        },
        sidePanels: {
          autoHideEnabled: true,
          idleMs: 10000,
          fadeMs: 800
        },
        appearance: {
          ambientMotionEnabled: true,
          ambientMotionDurationMs: 90000,
          tooltipsEnabled: true,
          tooltipDelayMs: 0
        },
        supportedSourceTypes: [
          { id: 'fabric-sql', label: 'Fabric SQL endpoint', authModes: ['servicePrincipal'], supportsProcedures: true },
          { id: 'fabric-lakehouse', label: 'Fabric Lakehouse SQL endpoint', authModes: ['servicePrincipal'], supportsProcedures: false },
          { id: 'sql-server', label: 'SQL Server', authModes: ['sqlLogin', 'windowsNtlm', 'servicePrincipal'], supportsProcedures: true }
        ],
        supportedAuthModes: [
          { id: 'servicePrincipal', label: 'Azure service principal' },
          { id: 'sqlLogin', label: 'SQL login' },
          { id: 'windowsNtlm', label: 'Windows authentication' }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/tables')) {
      return new Response(JSON.stringify({
        success: true,
        objects: [
          { schema: 'dbo', name: 'Alerts', table: 'Alerts', fullName: 'dbo.Alerts', objectType: 'table' },
          { schema: 'dbo', name: 'AlertView', table: 'AlertView', fullName: 'dbo.AlertView', objectType: 'view' }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/columns')) {
      return new Response(JSON.stringify({
        success: true,
        columns: [
          { name: 'AlertId', type: 'int', nullable: false },
          { name: 'Status', type: 'varchar', nullable: true }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/procedure-parameters')) {
      return new Response(JSON.stringify({
        success: true,
        supported: true,
        procedure: 'dbo.usp_ProcessAlert',
        parameters: [
          { name: '@AlertId', cleanName: 'AlertId', mode: 'IN', dataType: 'int' },
          { name: '@ResultMessage', cleanName: 'ResultMessage', mode: 'INOUT', dataType: 'varchar' }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/procedures')) {
      if (body.procedure || body.confirmToken) {
        if (body.confirmToken) {
          return new Response(JSON.stringify({
            success: true,
            mode: 'procedure',
            procedure: 'dbo.usp_ProcessAlert',
            columns: ['AlertId', 'Processed'],
            rows: [{ AlertId: 42, Processed: 'YES' }],
            totalRows: 1,
            rowsAffected: 1,
            truncated: false,
            output: { ResultMessage: 'OK' },
            returnValue: 0,
            message: 'Stored procedure dbo.usp_ProcessAlert executed successfully.'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          mode: 'procedure-preview',
          requiresConfirmation: true,
          confirmationToken: 'procedure-token',
          procedure: 'dbo.usp_ProcessAlert',
          parameterCount: 2,
          expectedText: 'RUN DBO.USP_PROCESSALERT',
          message: 'Stored procedures are executed directly in this app. Review the parameters and type the confirmation text before running dbo.usp_ProcessAlert.'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        supported: true,
        procedures: [
          { schema: 'dbo', name: 'usp_ProcessAlert', fullName: 'dbo.usp_ProcessAlert' },
          { schema: 'ops', name: 'usp_OtherProcedure', fullName: 'ops.usp_OtherProcedure' }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/audit')) {
      return new Response(JSON.stringify({
        success: true,
        entries: [
          { timestamp: '2026-06-17T10:00:00.000Z', sourceType: 'fabric-sql', event: 'query', outcome: 'success', action: 'SELECT', database: 'meta_store', detail: 'SELECT TOP (100)' }
        ],
        limit: 25,
        totalMatched: 1
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/lifecycle/heartbeat')) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/version')) {
      return new Response(JSON.stringify({ success: true, version: 'ui-smoke' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/env-settings')) {
      const syncRequest = options.method === 'POST' && body.action === 'syncMissing';
      if (syncRequest) {
        envSettingsSynced = true;
      }
      const missingKeys = envSettingsSynced ? [] : ['APP_SIDE_PANEL_FADE_MS'];
      const payload = {
        success: true,
        envExists: true,
        envPath: '.env',
        groups: [
          { id: 'runtime', title: 'Runtime', description: 'Runtime settings' },
          { id: 'appearance', title: 'Appearance', description: 'Appearance settings' },
          { id: 'fabric', title: 'Fabric Authentication', description: 'Fabric auth settings' }
        ],
        settings: [
          {
            key: 'PORT',
            group: 'runtime',
            type: 'number',
            min: 1,
            max: 65535,
            label: 'App port',
            value: '3000',
            description: 'Local browser port.',
            appropriate: 'Keep 3000.',
            restartRequired: true
          },
          {
            key: 'NODE_ENV',
            group: 'runtime',
            type: 'select',
            options: ['production', 'development'],
            label: 'Runtime mode',
            value: 'production',
            description: 'Production for users.',
            appropriate: 'Use production.',
            restartRequired: true
          },
          {
            key: 'AZURE_CLIENT_SECRET',
            group: 'fabric',
            type: 'secret',
            label: 'Azure client secret',
            value: '',
            configured: true,
            secret: true,
            description: 'Client secret.',
            appropriate: 'Leave blank to keep current.',
            restartRequired: true
          },
          {
            key: 'APP_SIDE_PANEL_AUTO_HIDE_ENABLED',
            group: 'runtime',
            type: 'boolean',
            label: 'Side panel auto-hide',
            value: 'true',
            description: 'Controls side panel auto-hide.',
            appropriate: 'Use true.',
            restartRequired: true
          },
          {
            key: 'APP_SIDE_PANEL_IDLE_MS',
            group: 'runtime',
            type: 'number',
            min: 1000,
            max: 3600000,
            label: 'Side panel idle delay',
            value: '10000',
            description: 'Idle delay.',
            appropriate: '10000 means 10 seconds.',
            restartRequired: true
          },
          {
            key: 'APP_SIDE_PANEL_FADE_MS',
            group: 'runtime',
            type: 'number',
            min: 0,
            max: 10000,
            label: 'Side panel fade duration',
            value: '800',
            missing: !envSettingsSynced,
            description: 'Fade duration.',
            appropriate: '800 is default.',
            restartRequired: true
          },
          {
            key: 'APP_AMBIENT_MOTION_ENABLED',
            group: 'appearance',
            type: 'boolean',
            label: 'Ambient color motion',
            value: 'true',
            description: 'Controls slow background color movement.',
            appropriate: 'Use false for a static background.',
            restartRequired: true
          },
          {
            key: 'APP_AMBIENT_MOTION_DURATION_MS',
            group: 'appearance',
            type: 'number',
            min: 30000,
            max: 300000,
            label: 'Ambient motion speed',
            value: '90000',
            description: 'One motion cycle duration.',
            appropriate: '90000 means 90 seconds.',
            restartRequired: true
          },
          {
            key: 'APP_TOOLTIPS_ENABLED',
            group: 'appearance',
            type: 'boolean',
            label: 'Helpful tooltips',
            value: 'true',
            description: 'Shows delayed interface hints.',
            appropriate: 'Use false for a quieter UI.',
            restartRequired: true
          },
          {
            key: 'APP_TOOLTIP_DELAY_MS',
            group: 'appearance',
            type: 'number',
            min: 0,
            max: 3000,
            label: 'Tooltip delay',
            value: '650',
            description: 'Tooltip delay in milliseconds.',
            appropriate: '650 is calm.',
            restartRequired: true
          }
        ],
        envSync: {
          missingKeys,
          missingSettings: missingKeys.map((key) => ({
            key,
            label: 'Side panel fade duration',
            group: 'runtime',
            defaultValue: '800',
            restartRequired: true
          })),
          canSync: missingKeys.length > 0
        },
        changedKeys: options.method === 'POST' && !syncRequest ? ['PORT'] : [],
        addedKeys: syncRequest ? ['APP_SIDE_PANEL_FADE_MS'] : [],
        backupPath: syncRequest ? '.data/backups/.env-ui-smoke.bak' : null,
        restartRequired: options.method === 'POST'
      };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/object-insights')) {
      if (body.action === 'editability') {
        const queryText = String(body.query || '');
        if (/\bJOIN\b/i.test(queryText)) {
          return new Response(JSON.stringify({
            success: true,
            action: 'editability',
            editable: false,
            reason: 'Only a plain single-table SELECT can be edited (no JOIN, UNION, GROUP BY, or subquery source).'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        // A table with no declared primary key or unique constraint: the
        // client falls back to matching rows by every visible column.
        if (/LegacyImport/i.test(queryText)) {
          return new Response(JSON.stringify({
            success: true,
            action: 'editability',
            editable: true,
            object: 'dbo.LegacyImport',
            keyColumns: [],
            matchColumns: ['ImportId', 'Payload'],
            keyType: 'all-columns',
            editableColumns: ['ImportId', 'Payload'],
            columns: [
              { name: 'ImportId', type: 'int', nullable: false },
              { name: 'Payload', type: 'varchar', nullable: true }
            ]
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({
          success: true,
          action: 'editability',
          editable: true,
          object: 'dbo.Alerts',
          keyColumns: ['AlertId'],
          matchColumns: ['AlertId'],
          keyType: 'primary',
          editableColumns: ['AlertId', 'Status'],
          columns: [
            { name: 'AlertId', type: 'int', nullable: false },
            { name: 'Status', type: 'varchar', nullable: true }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (body.action === 'rowCount') {
        return new Response(JSON.stringify({
          success: true,
          action: 'rowCount',
          object: body.object || 'dbo.Alerts',
          columns: ['object_name', 'row_count', 'source', 'exact'],
          rows: [{ object_name: body.object || 'dbo.Alerts', row_count: 2, source: 'sys_dm_db_partition_stats', exact: 'NO' }],
          totalRows: 1,
          output: { row_count: 2 },
          message: 'Loaded metadata row count.'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (body.action === 'topValues') {
        return new Response(JSON.stringify({
          success: true,
          action: 'topValues',
          object: body.object || 'dbo.Alerts',
          columns: ['column_name', 'value', 'value_count'],
          rows: [{ column_name: 'Status', value: 'FAILED', value_count: 1 }],
          totalRows: 1,
          output: { analyzed_columns: 1 },
          message: 'Loaded top values.'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (body.action === 'resultShape') {
        return new Response(JSON.stringify({
          success: true,
          action: 'resultShape',
          columns: ['column_ordinal', 'name', 'system_type_name', 'is_nullable', 'error_number', 'error_message'],
          rows: [{ column_ordinal: 1, name: 'AlertId', system_type_name: 'int', is_nullable: false, error_number: null, error_message: null }],
          totalRows: 1,
          output: { query_columns: 1 },
          message: 'Loaded result shape metadata.'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (body.action === 'profile') {
        return new Response(JSON.stringify({
          success: true,
          action: 'profile',
          object: body.object || 'dbo.Alerts',
          columns: ['column_name', 'data_type', 'nullable', 'sample_rows', 'null_rows', 'distinct_values', 'completeness_pct', 'min_value', 'max_value'],
          rows: [
            { column_name: 'AlertId', data_type: 'int', nullable: 'NO', sample_rows: 2, null_rows: 0, distinct_values: 2, completeness_pct: 100, min_value: '1', max_value: '2' },
            { column_name: 'Status', data_type: 'varchar', nullable: 'YES', sample_rows: 2, null_rows: 1, distinct_values: 1, completeness_pct: 50, min_value: 'FAILED', max_value: 'FAILED' }
          ],
          totalRows: 2,
          output: {
            object: body.object || 'dbo.Alerts',
            sampled_rows: 2,
            profiled_columns: 2
          },
          message: `Profiled ${body.object || 'dbo.Alerts'} using 2 sampled row(s).`
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        action: 'dependencies',
        object: body.object || 'dbo.Alerts',
        columns: ['dependency_direction', 'primary_object', 'related_object', 'related_type'],
        rows: [
          { dependency_direction: 'referenced_by', primary_object: 'dbo.Alerts', related_object: 'dbo.AlertView', related_type: 'VIEW' }
        ],
        nodes: [
          { id: body.object || 'dbo.Alerts', role: 'selected' },
          { id: 'dbo.AlertView', role: 'downstream' }
        ],
        edges: [
          { id: 'edge-1', from: 'dbo.AlertView', to: body.object || 'dbo.Alerts', direction: 'referenced_by' }
        ],
        upstreamCount: 0,
        downstreamCount: 1,
        totalRows: 1,
        output: {
          object: body.object || 'dbo.Alerts',
          dependency_rows: 1
        },
        message: `Loaded 1 dependency row(s) for ${body.object || 'dbo.Alerts'}.`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/object-definition')) {
      const objectType = body.objectType || 'table';
      const mode = String(body.scriptMode || 'alter').toUpperCase();
      const definition = objectType === 'procedure'
        ? `${mode} PROCEDURE ${body.object || 'dbo.usp_ProcessAlert'}\nAS\nBEGIN\n    SELECT 1 AS SmokeValue;\nEND`
        : `${mode} TABLE [dbo].[Alerts]\n(\n    [AlertId] INT NOT NULL,\n    [Status] VARCHAR(50) NULL\n);`;
      return new Response(JSON.stringify({
        success: true,
        object: body.object || 'dbo.Alerts',
        objectType,
        scriptMode: body.scriptMode || 'alter',
        definition,
        generated: body.scriptMode === 'create',
        editable: body.scriptMode !== 'create',
        definitionSource: body.scriptMode === 'create' ? 'generated_catalog_metadata' : 'exact_source_metadata',
        completeness: 'catalog metadata'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/schema-compare')) {
      return new Response(JSON.stringify({
        success: true,
        leftObject: body.leftObject || 'dbo.Alerts',
        rightObject: body.rightObject || 'dbo.Alerts',
        objectType: body.objectType || 'table',
        columns: ['item', 'difference', 'left', 'right'],
        rows: [{ item: 'Status', difference: 'nullable', left: 'true', right: 'false' }],
        differences: [{ kind: 'changed', column: 'Status', field: 'nullable', left: true, right: false }],
        summary: { differenceCount: 1 },
        warnings: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/query-plan')) {
      return new Response(JSON.stringify({
        success: true,
        mode: 'estimated',
        planXml: '<ShowPlanXML />',
        columns: ['property', 'value'],
        rows: [{ property: 'mode', value: 'estimated' }, { property: 'plan_xml_length', value: '15' }],
        totalRows: 2,
        message: 'Loaded estimated execution plan. The query was not executed.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/query/export')) {
      window.__exportRequests = [...(window.__exportRequests || []), body];
      const csv = 'AlertId,Status\r\n1,NULL\r\n2,FAILED\r\n';
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="data-workbench-export-20260924-101112.csv"',
          'X-Export-Row-Limit': '100000'
        }
      });
    }

    if (String(url).includes('/api/query/cancel')) {
      window.__cancelledRunIds = [...(window.__cancelledRunIds || []), body.runId];
      window.__releaseSlowQuery?.();
      return new Response(JSON.stringify({ success: true, cancelled: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/query')) {
      const queryText = String(body.query || '');
      window.__postedQueries = [...(window.__postedQueries || []), queryText];
      window.__postedRunIds = [...(window.__postedRunIds || []), body.runId];
      // A read that hit the row limit: the server fetched limit + 1 rows and reports truncated.
      if (queryText.includes('TRUNCATED_TEST')) {
        return new Response(JSON.stringify({
          success: true,
          mode: 'read',
          columns: ['AlertId', 'Status'],
          rows: [{ AlertId: 1, Status: null }, { AlertId: 2, Status: 'FAILED' }],
          totalRows: 3,
          truncated: true,
          rowLimit: 2,
          rowsAffected: 0,
          elapsedMs: 12
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // A read that only finishes when the client aborts it, like a long query being cancelled.
      if (queryText.includes('SLOW_CANCEL_TEST')) {
        return new Promise((resolve, reject) => {
          const abort = () => reject(new window.DOMException('The operation was aborted.', 'AbortError'));
          if (options.signal?.aborted) abort();
          options.signal?.addEventListener('abort', abort);
        });
      }
      // A confirmed write that the server reports as cancelled and rolled back.
      if (body.confirmToken === 'query-slow-write-token') {
        return new Promise((resolve) => {
          window.__releaseSlowQuery = () => resolve(new Response(JSON.stringify({
            success: false,
            cancelled: true,
            rolledBack: true,
            code: 'CANCELLED',
            error: 'The write was cancelled and rolled back. Nothing was changed. Preview it again to run it.'
          }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
        });
      }
      if (queryText.includes('SLOW_WRITE_TEST') && !body.confirmToken) {
        return new Response(JSON.stringify({
          success: true,
          mode: 'write-preview',
          requiresConfirmation: true,
          confirmationToken: 'query-slow-write-token',
          rowsAffected: 1,
          action: 'UPDATE',
          statementCount: 1,
          actions: ['UPDATE'],
          highRiskActions: [],
          expectedText: '',
          heightened: false,
          reviewRequired: true,
          warnings: [],
          message: 'UPDATE preview complete. Review it, then click Continue to execute.'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (/\bLIMIT\s+\d+\s*;?\s*$/i.test(queryText)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Incorrect syntax near 'LIMIT'.",
          code: 'EREQUEST'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // The results-grid editor's row-uniqueness pre-check for keyless tables
      // (buildMatchClause/saveResultEdits in console-core.js): one UNION ALL of
      // "SELECT <index> AS row_index, (SELECT COUNT(*) ...) AS match_count"
      // per row being saved. Reports 2 matches for the row whose original
      // Payload was 'DUP' (two physically identical rows in the mocked table)
      // and 1 for 'UNQ' (the only row with that value).
      if (queryText.includes('AS match_count')) {
        const matchCount = queryText.includes("[Payload] = 'DUP'") ? 2 : 1;
        return new Response(JSON.stringify({
          success: true,
          columns: ['row_index', 'match_count'],
          rows: [{ row_index: 0, match_count: matchCount }],
          totalRows: 1,
          rowsAffected: 0,
          truncated: false
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // A keyless table's own data, always the same two identical rows and one
      // unique row regardless of any staged edit (this mock is static, like
      // the generic Alerts read below).
      if (/^\s*SELECT \* FROM dbo\.LegacyImport\s*$/i.test(queryText.trim()) && !body.confirmToken) {
        return new Response(JSON.stringify({
          success: true,
          columns: ['ImportId', 'Payload'],
          rows: [
            { ImportId: 1, Payload: 'DUP' },
            { ImportId: 1, Payload: 'DUP' },
            { ImportId: 2, Payload: 'UNQ' }
          ],
          totalRows: 3,
          rowsAffected: 0,
          truncated: false
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const statementCount = queryText.split(';').map((part) => part.trim()).filter(Boolean).length;
      if (statementCount > 1 && !body.confirmToken) {
        return new Response(JSON.stringify({
          success: true,
          mode: 'write-review',
          requiresConfirmation: true,
          confirmationToken: 'query-batch-token',
          rowsAffected: null,
          action: 'BATCH',
          statementCount,
          actions: ['SELECT', 'SELECT'],
          highRiskActions: [],
          expectedText: 'RUN BATCH',
          heightened: true,
          reviewRequired: true,
          warnings: [`This batch contains ${statementCount} SQL statements. Review every statement before execution.`],
          message: `This batch contains ${statementCount} SQL statements. Review every statement, type RUN BATCH, then click Continue to execute.`
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (/^\s*(CREATE|ALTER)\b/i.test(queryText) && !body.confirmToken) {
        const action = queryText.trim().toUpperCase().startsWith('CREATE') ? 'CREATE' : 'ALTER';
        return new Response(JSON.stringify({
          success: true,
          mode: 'write-review',
          requiresConfirmation: true,
          confirmationToken: 'query-write-token',
          rowsAffected: null,
          action,
          statementCount: 1,
          actions: [action],
          highRiskActions: [action],
          expectedText: `EXECUTE ${action}`,
          heightened: true,
          reviewRequired: true,
          warnings: [],
          message: `DDL is ready to run. Review it carefully, type EXECUTE ${action}, then click Continue to execute.`
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // A single plain UPDATE ... WHERE (the shape the results-grid inline
      // editor generates for one edited row) needs no typed acknowledgement,
      // just the normal preview + single-click confirm. Scoped to a marker
      // used only by the inline-editor test below: an existing test elsewhere
      // in this file also runs a single builder-generated UPDATE and relies
      // on the generic fallback response further down, so matching on the
      // UPDATE keyword alone would change that unrelated test's mock response.
      // A previewed write above HEIGHTENED_CONFIRM_LIMIT: the server now returns a typed
      // phrase for it, and the client must gate Continue on that phrase.
      if (statementCount === 1 && queryText.includes('HEIGHTENED_EDIT_TEST') && !body.confirmToken) {
        return new Response(JSON.stringify({
          success: true,
          mode: 'write-preview',
          requiresConfirmation: true,
          confirmationToken: 'query-heightened-token',
          rowsAffected: 5,
          action: 'UPDATE',
          statementCount: 1,
          actions: ['UPDATE'],
          highRiskActions: [],
          expectedText: 'EXECUTE UPDATE',
          heightened: true,
          reviewRequired: true,
          warnings: [],
          message: 'UPDATE requires explicit acknowledgement. This write touches 5 rows. Review the SQL, type EXECUTE UPDATE, then click Continue to execute.'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (body.confirmToken === 'query-heightened-token') {
        const acknowledged = String(body.acknowledgement || '').trim().toUpperCase() === 'EXECUTE UPDATE';
        return new Response(JSON.stringify(acknowledged
          ? { success: true, mode: 'write', executed: true, action: 'UPDATE', columns: [], rows: [], totalRows: 0, truncated: false, rowsAffected: 5, message: 'UPDATE completed successfully.' }
          : { success: false, error: 'Type the confirmation phrase exactly before executing this operation: EXECUTE UPDATE' }), {
          status: acknowledged ? 200 : 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (statementCount === 1 && /^\s*UPDATE\b/i.test(queryText) && queryText.includes('INLINE_EDIT_TEST') && !body.confirmToken) {
        return new Response(JSON.stringify({
          success: true,
          mode: 'write-preview',
          requiresConfirmation: true,
          confirmationToken: 'query-update-token',
          rowsAffected: 1,
          action: 'UPDATE',
          statementCount: 1,
          actions: ['UPDATE'],
          highRiskActions: [],
          expectedText: '',
          heightened: false,
          reviewRequired: true,
          warnings: [],
          message: 'UPDATE preview complete. Review it, then click Continue to execute.'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (body.confirmToken === 'query-batch-token' && String(body.acknowledgement || '').toUpperCase() !== 'RUN BATCH') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Type the confirmation phrase exactly before executing this operation: RUN BATCH'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (body.confirmToken === 'query-write-token') {
        const expected = queryText.trim().toUpperCase().startsWith('CREATE') ? 'EXECUTE CREATE' : 'EXECUTE ALTER';
        if (String(body.acknowledgement || '').toUpperCase() !== expected) {
          return new Response(JSON.stringify({
            success: false,
            error: `Type the confirmation phrase exactly before executing this operation: ${expected}`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      if (body.confirmToken) {
        const executedAction = body.confirmToken === 'query-batch-token' ? 'BATCH' : body.confirmToken === 'query-update-token' ? 'UPDATE' : 'DDL';
        return new Response(JSON.stringify({
          success: true,
          mode: 'write',
          executed: true,
          action: executedAction,
          columns: [],
          rows: [],
          totalRows: 0,
          rowsAffected: 0,
          // Matches the real server's `${action} completed successfully.` shape
          // (lib/server/db-interface.js postQuery) closely enough for status-text assertions.
          message: `${executedAction} completed successfully.`
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        success: true,
        columns: ['AlertId', 'Status', 'JsonPayload'],
        rows: [
          { AlertId: 1, Status: null, JsonPayload: '{"severity":"low","nested":{"ok":true}}' },
          { AlertId: 2, Status: 'FAILED', JsonPayload: '{"severity":"high","nested":{"ok":false}}' },
          { AlertId: 3, Status: '', JsonPayload: '{"severity":"none","nested":{"ok":true}}' }
        ],
        totalRows: 3,
        rowsAffected: 0,
        truncated: false
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (String(url).includes('/api/test-connection')) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Connection successful.',
        data: {
          database_name: body.database || 'meta_store',
          server_name: body.server || 'demo',
          version_info: 'SQL Server test build',
          sourceType: body.sourceType || 'fabric-sql',
          authMode: body.authMode || 'servicePrincipal'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    throw new Error(`Unhandled fetch: ${url}`);
  };

  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(target) { this.callback([{ isIntersecting: true, target }]); }
    unobserve() {}
    disconnect() {}
  };
  window.__lastClipboardText = '';
  window.navigator.clipboard = {
    writeText: async (text) => {
      window.__lastClipboardText = String(text ?? '');
    }
  };
  window.document.execCommand = () => true;
  window.prompt = () => 'Smoke scratchpad';
  window.Response = Response;
}

async function createWindow(routePath, routeSegments = [], viewport = { width: 1680, height: 980 }, prepareWindow) {
  await assertBuildIsFresh();
  const html = await readBuiltHtml(routeSegments);
  const dom = new JSDOM(html, {
    url: routePath,
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });

  const { window } = dom;
  Object.defineProperty(window, 'innerWidth', { value: viewport.width, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: viewport.height, writable: true, configurable: true });
  const visualViewport = {
    width: viewport.visualWidth || viewport.width,
    height: viewport.visualHeight || viewport.height,
    scale: viewport.scale || 1,
    addEventListener() {},
    removeEventListener() {}
  };
  Object.defineProperty(window, 'visualViewport', { value: visualViewport, configurable: true });
  attachMocks(window);
  if (typeof prepareWindow === 'function') {
    await prepareWindow(window);
  }
  window.eval(coreScript);
  window.eval(appScript);
  if (typeof window.initConsoleApp === 'function') {
    await window.initConsoleApp();
  }
  if (window.consoleAppReady) {
    await window.consoleAppReady;
  }
  return window;
}

function dragHandle(window, handleName, start, end) {
  const handle = window.document.querySelector(`[data-resize-handle="${handleName}"]`);
  if (!handle || typeof handle.onpointerdown !== 'function') {
    throw new Error(`Resize handle ${handleName} is not wired.`);
  }

  handle.onpointerdown({
    clientX: start.x,
    clientY: start.y,
    pointerId: 1,
    preventDefault() {},
    target: handle
  });

  if (typeof handle.onpointermove !== 'function') {
    throw new Error(`Resize handle ${handleName} did not enter dragging mode.`);
  }

  handle.onpointermove({
    clientX: end.x,
    clientY: end.y,
    pointerId: 1,
    preventDefault() {},
    target: handle
  });

  handle.onpointerup({
    clientX: end.x,
    clientY: end.y,
    pointerId: 1,
    preventDefault() {},
    target: handle
  });
}

function extractBody(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!match) {
    throw new Error('Could not extract body markup from built HTML.');
  }
  return match[1];
}

const legacyWindow = await createWindow(
  'http://127.0.0.1:3100/',
  [],
  { width: 1680, height: 980 },
  (window) => {
    window.localStorage.setItem('dataWorkbenchConnectionsV0', JSON.stringify({
      primary: {
        source: 'fabric-sql',
        auth: 'servicePrincipal',
        host: 'legacy-demo',
        db: 'legacy_meta_store'
      }
    }));
  }
);

if (!legacyWindow.document.getElementById('savedConnections').textContent.includes('legacy_meta_store')) {
  throw new Error('Legacy saved connections were not migrated into the visible saved connections list.');
}

legacyWindow.document.getElementById('serverInput').value = 'fresh-demo';
legacyWindow.document.getElementById('databaseInput').value = 'fresh_meta_store';
legacyWindow.document.getElementById('saveConnectionBtn').click();
await flush();

if (!legacyWindow.document.getElementById('savedConnections').textContent.includes('fresh_meta_store')) {
  throw new Error('Saving a connection failed after loading a legacy saved-connections payload.');
}

legacyWindow.document.querySelector('[data-connection-index="0"]').click();
await flush();
await flush();
if (!legacyWindow.document.getElementById('tableList').textContent.includes('dbo.Alerts')) {
  throw new Error('Clicking a saved profile should automatically load the catalog.');
}

const sqlWindow = await createWindow('http://127.0.0.1:3100/');
if (sqlWindow.document.querySelectorAll('#themeList .theme-chip').length !== 6) {
  throw new Error('Theme chips did not render on the SQL page.');
}
['midnight', 'harbor', 'forge', 'field', 'ink', 'paper'].forEach((theme) => {
  sqlWindow.document.querySelector(`[data-theme="${theme}"]`)?.click();
  if (sqlWindow.document.documentElement.getAttribute('data-theme') !== theme) {
    throw new Error(`Theme ${theme} did not apply to the document root.`);
  }
});
assertVisibleAffordance(sqlWindow, '#serverInput', 'server input');
assertVisibleAffordance(sqlWindow, '#testConnectionBtn', 'test connection button');
assertVisibleAffordance(sqlWindow, '#queryEditor', 'SQL editor');
sqlWindow.document.getElementById('sourceTypeSelect').value = 'sql-server';
sqlWindow.document.getElementById('sourceTypeSelect').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
const sqlAuthOptions = Array.from(sqlWindow.document.getElementById('authModeSelect').options);
if (!sqlAuthOptions.some((option) => option.value === 'windowsNtlm' && option.textContent.includes('Windows authentication'))) {
  throw new Error('SQL Server auth selector should include Windows authentication.');
}
sqlWindow.document.getElementById('authModeSelect').value = 'windowsNtlm';
sqlWindow.document.getElementById('authModeSelect').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
if (sqlWindow.document.getElementById('domainField').classList.contains('hidden')) {
  throw new Error('Windows authentication should show the domain field.');
}
if (!sqlWindow.document.querySelector('#usernameField span')?.textContent.includes('Windows username')) {
  throw new Error('Windows authentication should label the username field clearly.');
}
if (sqlWindow.document.getElementById('passwordField').classList.contains('hidden')) {
  throw new Error('Windows authentication should show the password field.');
}
if (sqlWindow.document.getElementById('trustServerCertificateField').classList.contains('hidden')) {
  throw new Error('Windows authentication should keep SQL Server trust certificate visible.');
}
sqlWindow.document.getElementById('sourceTypeSelect').value = 'fabric-sql';
sqlWindow.document.getElementById('sourceTypeSelect').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
if (sqlWindow.document.querySelector('.results-card')?.dataset.resultsState !== 'empty') {
  throw new Error('Empty results should mark the results card as empty for compact sizing.');
}
if (sqlWindow.document.documentElement.dataset.ambientMotion !== 'enabled') {
  throw new Error('Ambient motion setting from health should be applied to the document root.');
}
if (sqlWindow.document.documentElement.style.getPropertyValue('--ambient-motion-duration') !== '90000ms') {
  throw new Error('Ambient motion duration from health should be applied as a CSS variable.');
}
if (sqlWindow.document.documentElement.dataset.tooltips !== 'enabled') {
  throw new Error('Tooltip setting from health should enable app tooltips.');
}
if (sqlWindow.document.documentElement.style.getPropertyValue('--tooltip-delay-ms') !== '0ms') {
  throw new Error('Tooltip delay from health should be applied as a CSS variable.');
}
{
  // The Safety Policy panel must render the policy and limits /api/health actually reports,
  // not the hardcoded fallback sentence.
  const policyText = sqlWindow.document.getElementById('policySummary').textContent;
  if (policyText.includes('Default policy')) {
    throw new Error('Safety Policy panel fell back to default text despite health returning a safety payload.');
  }
  if (!policyText.includes('Active policy') || !policyText.includes('Write preview first: Yes')) {
    throw new Error(`Safety Policy panel did not render the server safety payload. Got: ${policyText}`);
  }
  if (!policyText.includes('Row cap 250') || !policyText.includes('Typed ack above 3 row(s)')) {
    throw new Error(`Safety Policy panel did not render the server safety limits. Got: ${policyText}`);
  }
}
['saveConnectionBtn', 'testConnectionBtn', 'loadTablesBtn', 'runQueryBtn', 'runAllQueryBtn', 'exportJsonBtn', 'exportAllCsvBtn', 'exportAllJsonBtn', 'contextCopyInsertBtn', 'contextCopyAllInsertBtn', 'contextCopyMarkdownBtn', 'clearHistoryBtn', 'toggleAdvancedOperationsBtn', 'insertSelectTemplateBtn', 'updateJoinTemplateBtn', 'mergePreviewBtn', 'profileObjectBtn', 'dependencyViewBtn', 'insertSqlHelperBtn', 'wrapSqlHelperBtn', 'openWorkbenchToolsBtn', 'openEnvSettingsBtn', 'openSupportBtn', 'scrollResultsLeftBtn', 'scrollResultsRightBtn', 'scrollResultsDockLeftBtn', 'scrollResultsDockRightBtn'].forEach((id) => {
  const element = sqlWindow.document.getElementById(id);
  if (!element || typeof element.onclick !== 'function') {
    throw new Error(`Expected ${id} to be wired on the SQL page.`);
  }
});
sqlWindow.document.getElementById('openEnvSettingsBtn').dispatchEvent(new sqlWindow.Event('pointerover', { bubbles: true }));
await waitForCondition(
  () => sqlWindow.document.getElementById('appTooltip')?.classList.contains('visible'),
  'Hovering a toolbar button should show the controlled app tooltip.'
);
if (!sqlWindow.document.getElementById('appTooltip').textContent.includes('Edit local app settings')) {
  throw new Error('Toolbar tooltip text should explain the settings action.');
}
if (sqlWindow.document.getElementById('appTooltip').textContent.trim() === sqlWindow.document.getElementById('openEnvSettingsBtn').textContent.trim()) {
  throw new Error('Toolbar tooltip should explain the action instead of repeating the button label.');
}
sqlWindow.document.getElementById('openEnvSettingsBtn').dispatchEvent(new sqlWindow.Event('pointerout', { bubbles: true }));
await flush();
sqlWindow.document.getElementById('testConnectionBtn').dispatchEvent(new sqlWindow.Event('pointerover', { bubbles: true }));
await waitForCondition(
  () => sqlWindow.document.getElementById('appTooltip')?.textContent.includes('Verify the server'),
  'Hovering Test connection should show an explanatory tooltip.'
);
if (sqlWindow.document.getElementById('appTooltip').textContent.trim() === sqlWindow.document.getElementById('testConnectionBtn').textContent.trim()) {
  throw new Error('Connection tooltip should explain the action instead of repeating the button label.');
}
sqlWindow.document.getElementById('testConnectionBtn').dispatchEvent(new sqlWindow.Event('pointerout', { bubbles: true }));
await flush();
const themeChip = sqlWindow.document.querySelector('.theme-chip');
themeChip.dispatchEvent(new sqlWindow.Event('pointerover', { bubbles: true }));
await waitForCondition(
  () => sqlWindow.document.getElementById('appTooltip')?.textContent.includes('visual theme'),
  'Hovering a theme chip should explain what the chip does.'
);
if (sqlWindow.document.getElementById('appTooltip').textContent.trim() === themeChip.textContent.trim()) {
  throw new Error('Theme tooltip should explain the action instead of repeating the theme name.');
}
themeChip.dispatchEvent(new sqlWindow.Event('pointerout', { bubbles: true }));
await flush();
sqlWindow.document.getElementById('openEnvSettingsBtn').click();
await flush();
await flush();
if (sqlWindow.document.getElementById('envSettingsDialog').classList.contains('hidden')) {
  throw new Error('App settings dialog did not open.');
}
if (!sqlWindow.document.getElementById('envSettingsContent').textContent.includes('App port')) {
  throw new Error('App settings did not render editable settings.');
}
if (!sqlWindow.document.getElementById('envSettingsContent').textContent.includes('Side panel idle delay')) {
  throw new Error('App settings did not render side panel auto-hide controls.');
}
if (!sqlWindow.document.getElementById('envSettingsContent').textContent.includes('Ambient color motion')) {
  throw new Error('App settings did not render ambient motion controls.');
}
if (!sqlWindow.document.getElementById('envSettingsContent').textContent.includes('Helpful tooltips')) {
  throw new Error('App settings did not render tooltip enablement controls.');
}
if (!sqlWindow.document.getElementById('envSettingsContent').textContent.includes('Tooltip delay')) {
  throw new Error('App settings did not render tooltip timing controls.');
}
if (!sqlWindow.document.querySelector('[data-env-key="APP_TOOLTIP_DELAY_MS"]')?.dataset.tooltip) {
  throw new Error('Tooltip settings should expose helpful controlled tooltip text.');
}
if (sqlWindow.document.getElementById('syncEnvSettingsBtn').classList.contains('hidden')) {
  throw new Error('Settings should show Sync new settings when .env is missing schema keys.');
}
if (!sqlWindow.document.querySelector('[data-env-key="APP_SIDE_PANEL_FADE_MS"]')?.closest('.env-setting-item')?.classList.contains('env-setting-missing')) {
  throw new Error('Missing .env settings should be marked in the settings form.');
}
sqlWindow.document.getElementById('syncEnvSettingsBtn').click();
await flush();
await flush();
if (!sqlWindow.document.getElementById('envSettingsStatus').textContent.includes('APP_SIDE_PANEL_FADE_MS')) {
  throw new Error('Syncing missing .env settings should report the added key.');
}
if (!sqlWindow.document.getElementById('syncEnvSettingsBtn').classList.contains('hidden')) {
  throw new Error('Sync new settings should hide after missing .env keys are synchronized.');
}
const secretInput = sqlWindow.document.querySelector('[data-env-key="AZURE_CLIENT_SECRET"]');
if (!secretInput || secretInput.value !== '') {
  throw new Error('Secret environment setting should render blank.');
}
sqlWindow.document.querySelector('[data-env-key="PORT"]').value = '3001';
sqlWindow.document.getElementById('applyEnvSettingsBtn').click();
await flush();
await flush();
if (!sqlWindow.document.getElementById('envSettingsStatus').textContent.includes('Restart Data Workbench')) {
  throw new Error('Applying settings did not show restart guidance.');
}
sqlWindow.document.getElementById('closeEnvSettingsBtn').click();
await flush();
if (!sqlWindow.document.getElementById('envSettingsDialog').classList.contains('hidden')) {
  throw new Error('App settings dialog did not close.');
}
sqlWindow.document.getElementById('openSupportBtn').click();
await flush();
if (sqlWindow.document.getElementById('supportDialog').classList.contains('hidden')) {
  throw new Error('Support dialog did not open.');
}
sqlWindow.document.getElementById('supportTitleInput').value = 'Smoke support bug';
sqlWindow.document.getElementById('supportDescriptionInput').value = 'Support smoke description';
sqlWindow.document.getElementById('copySupportReportBtn').click();
await flush();
if (!sqlWindow.__lastClipboardText.includes('Smoke support bug') || !sqlWindow.__lastClipboardText.includes('Safe diagnostics')) {
  throw new Error('Copy support report did not write the report with diagnostics to the clipboard.');
}
sqlWindow.document.getElementById('closeSupportBtn').click();
await flush();
if (!sqlWindow.document.getElementById('supportDialog').classList.contains('hidden')) {
  throw new Error('Support dialog did not close.');
}
sqlWindow.document.getElementById('openWorkbenchToolsBtn').click();
await flush();
if (sqlWindow.document.getElementById('workbenchToolsDialog').classList.contains('hidden')) {
  throw new Error('Workbench tools dialog did not open.');
}
if (!sqlWindow.document.getElementById('commandPaletteList').textContent.includes('Load catalog')) {
  throw new Error('Workbench tools did not render command palette actions.');
}
if (!sqlWindow.document.getElementById('diagnosticsPanel').textContent.includes('Version')) {
  throw new Error('Workbench tools did not render diagnostics.');
}
sqlWindow.document.getElementById('copyDiagnosticsBtn').click();
await flush();
if (!sqlWindow.__lastClipboardText.includes('"catalog"')) {
  throw new Error('Copy diagnostics did not write diagnostics JSON to the clipboard.');
}
sqlWindow.document.getElementById('queryEditor').value = 'SELECT 1 AS SmokeValue;';
sqlWindow.document.getElementById('queryEditor').dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
sqlWindow.document.getElementById('saveScratchpadBtn').click();
await flush();
if (!sqlWindow.document.getElementById('scratchpadList').textContent.includes('Smoke scratchpad')) {
  throw new Error('Saving a scratchpad did not render it in workbench tools.');
}
sqlWindow.document.querySelector('[data-load-scratchpad]')?.click();
await flush();
if (!sqlWindow.document.getElementById('queryEditor').value.includes('SmokeValue')) {
  throw new Error('Loading a scratchpad did not restore SQL into the editor.');
}
if (!sqlWindow.document.getElementById('sqlHelperSelect')) {
  throw new Error('Expected SQL helper selector to render on the SQL page.');
}
if (!sqlWindow.document.getElementById('advancedOperationsContent').classList.contains('hidden')) {
  throw new Error('Advanced operations should start collapsed by default.');
}
sqlWindow.document.getElementById('toggleAdvancedOperationsBtn').click();
if (sqlWindow.document.getElementById('advancedOperationsContent').classList.contains('hidden')) {
  throw new Error('Advanced operations did not expand after clicking the toggle.');
}
if (sqlWindow.document.getElementById('toggleAdvancedOperationsBtn').getAttribute('aria-expanded') !== 'true') {
  throw new Error('Advanced operations toggle did not update aria-expanded when opened.');
}
['controlRail', 'explorer', 'activity', 'results'].forEach((name) => {
  const handle = sqlWindow.document.querySelector(`[data-resize-handle="${name}"]`);
  if (!handle || typeof handle.onpointerdown !== 'function') {
    throw new Error(`Expected ${name} resize handle to be wired on the SQL page.`);
  }
});

{
  const safetySection = sqlWindow.document.querySelector('.control-rail .safety-section');
  const connectionSection = sqlWindow.document.querySelector('.control-rail .connection-section');
  const savedProfilesSection = sqlWindow.document.querySelector('.control-rail .grow-section');
  if (!safetySection || !connectionSection || !savedProfilesSection) {
    throw new Error('Connection panel should render Safety Policy, Connection, and Saved Profiles sections.');
  }
  if (!(safetySection.compareDocumentPosition(connectionSection) & sqlWindow.Node.DOCUMENT_POSITION_FOLLOWING)) {
    throw new Error('Safety Policy should appear above Connection in the left panel.');
  }
  if (!(connectionSection.compareDocumentPosition(savedProfilesSection) & sqlWindow.Node.DOCUMENT_POSITION_FOLLOWING)) {
    throw new Error('Saved Profiles should remain below Connection in the left panel.');
  }
}

dragHandle(sqlWindow, 'controlRail', { x: 320, y: 120 }, { x: 370, y: 120 });
if (sqlWindow.document.querySelector('.app-shell').style.getPropertyValue('--control-rail-width') !== '390px') {
  throw new Error('Control rail resize did not update the persisted width.');
}
{
  const title = sqlWindow.document.querySelector('.connection-section .section-title-row')?.getBoundingClientRect();
  const firstFieldGroup = sqlWindow.document.querySelector('.connection-section .conn-field-group')?.getBoundingClientRect();
  const gap = firstFieldGroup && title ? firstFieldGroup.top - title.bottom : 999;
  if (gap > 24) {
    throw new Error(`Connection panel opened a large blank gap below the Connection heading after resize: ${gap}px.`);
  }
}

dragHandle(sqlWindow, 'explorer', { x: 480, y: 180 }, { x: 540, y: 180 });
if (sqlWindow.document.querySelector('.app-shell').style.getPropertyValue('--explorer-width') !== '360px') {
  throw new Error('Explorer resize did not update the persisted width.');
}

dragHandle(sqlWindow, 'activity', { x: 1460, y: 180 }, { x: 1410, y: 180 });
if (sqlWindow.document.querySelector('.app-shell').style.getPropertyValue('--activity-width') !== '370px') {
  throw new Error('Activity resize did not update the persisted width.');
}

dragHandle(sqlWindow, 'results', { x: 900, y: 760 }, { x: 900, y: 700 });
if (sqlWindow.document.querySelector('.app-shell').style.getPropertyValue('--results-height') !== '200px') {
  throw new Error('Results resize did not update the persisted height.');
}

sqlWindow.document.getElementById('sourceTypeSelect').value = 'nonsense';
sqlWindow.document.getElementById('authModeSelect').value = 'junk';
sqlWindow.document.getElementById('sourceTypeSelect').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
await flush();

if (sqlWindow.document.getElementById('sourceTypeSelect').value !== 'fabric-sql') {
  throw new Error('Source selector did not recover from an invalid value.');
}
if (sqlWindow.document.getElementById('authModeSelect').value !== 'servicePrincipal') {
  throw new Error('Auth selector did not recover from an invalid value.');
}
if (!sqlWindow.document.getElementById('usernameInput').disabled || !sqlWindow.document.getElementById('passwordInput').disabled) {
  throw new Error('Hidden SQL login inputs should be disabled for non-SQL-login sources.');
}

sqlWindow.document.getElementById('serverInput').value = 'demo';
sqlWindow.document.getElementById('databaseInput').value = 'meta_store';
sqlWindow.document.getElementById('serverInput').dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
sqlWindow.document.getElementById('databaseInput').dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
{
  const activeSource = sqlWindow.document.getElementById('activeSource');
  if (!activeSource || activeSource.dataset.state !== 'ready' || !activeSource.textContent.includes('demo') || !activeSource.textContent.includes('meta_store')) {
    throw new Error('Hero active-source line did not follow the connection fields.');
  }
}
sqlWindow.document.getElementById('saveConnectionBtn').click();
sqlWindow.document.getElementById('testConnectionBtn').click();
await flush();
if (!sqlWindow.document.getElementById('testConnectionResult').textContent.includes('Connection successful')) {
  throw new Error('Connection test did not render a visible success summary in the connection panel.');
}
if (!sqlWindow.document.getElementById('testConnectionResult').textContent.includes('meta_store')) {
  throw new Error('Connection test did not render the tested database details.');
}
{
  const activeSource = sqlWindow.document.getElementById('activeSource');
  if (activeSource.dataset.state !== 'profile' || !activeSource.querySelector('.active-source-profile')) {
    throw new Error('Hero active-source line should show the saved profile name when the connection matches a saved profile.');
  }
  const serverInput = sqlWindow.document.getElementById('serverInput');
  serverInput.value = 'demo-edited';
  serverInput.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
  if (activeSource.dataset.state !== 'ready' || !activeSource.textContent.includes('demo-edited')) {
    throw new Error('Hero active-source line should fall back to raw connection details once the fields no longer match a saved profile.');
  }
  serverInput.value = 'demo';
  serverInput.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
  if (activeSource.dataset.state !== 'profile') {
    throw new Error('Hero active-source line did not return to the saved profile name when the fields matched again.');
  }
}
sqlWindow.document.getElementById('loadTablesBtn').click();
await flush();
if (sqlWindow.document.querySelector('[data-object="dbo.Alerts"]')?.hasAttribute('title')) {
  throw new Error('Explorer object rows should not use native title tooltips.');
}
if (sqlWindow.document.querySelector('[data-pin-object="dbo.Alerts"]')?.hasAttribute('title')) {
  throw new Error('Explorer object pin controls should not use native title tooltips.');
}
sqlWindow.document.querySelector('[data-object="dbo.Alerts"]').click();
await flush();

sqlWindow.document.getElementById('advancedSourceObjectSelect').value = 'dbo.AlertView';
sqlWindow.document.getElementById('advancedSourceObjectSelect').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
sqlWindow.document.getElementById('targetJoinColumnSelect').value = 'AlertId';
sqlWindow.document.getElementById('targetJoinColumnSelect').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
sqlWindow.document.getElementById('sourceJoinColumnInput').value = 'AlertId';
sqlWindow.document.getElementById('sourceJoinColumnInput').dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));

sqlWindow.document.getElementById('insertSelectTemplateBtn').click();
if (!sqlWindow.document.getElementById('queryEditor').value.includes('INSERT INTO [dbo].[Alerts]')) {
  throw new Error('Insert SELECT template was not generated.');
}
if (!sqlWindow.document.getElementById('queryEditor').value.includes('FROM [dbo].[AlertView] AS src')) {
  throw new Error('Insert SELECT template did not use the selected source object.');
}

sqlWindow.document.getElementById('updateJoinTemplateBtn').click();
if (!sqlWindow.document.getElementById('queryEditor').value.includes('UPDATE tgt')) {
  throw new Error('Update JOIN template was not generated.');
}
if (!sqlWindow.document.getElementById('queryEditor').value.includes('INNER JOIN [dbo].[AlertView] AS src')) {
  throw new Error('Update JOIN template did not use the selected source object.');
}

sqlWindow.document.getElementById('mergePreviewBtn').click();
if (!sqlWindow.document.getElementById('queryEditor').value.includes('MERGE [dbo].[Alerts] AS tgt')) {
  throw new Error('MERGE preview template was not generated.');
}
if (!sqlWindow.document.getElementById('queryEditor').value.includes('execution requires explicit confirmation')) {
  throw new Error('MERGE preview template is missing the safety warning.');
}

sqlWindow.document.getElementById('profileObjectBtn').click();
await flush();
if (!sqlWindow.document.getElementById('statusText').textContent.includes('Profiled dbo.Alerts')) {
  throw new Error('Object profile action did not update the status text.');
}
if (!sqlWindow.document.querySelector('.results-table')?.textContent.includes('AlertId')) {
  throw new Error('Object profile action did not render profile results.');
}
if (!sqlWindow.document.querySelector('.visual-helper-card')?.textContent.includes('Profile insights')) {
  throw new Error('Object profile action did not render visual helper cards.');
}

function assertVisibleAffordance(window, selector, label) {
  const element = window.document.querySelector(selector);
  if (!element) {
    throw new Error(`Missing element for affordance check: ${label}`);
  }
  const style = window.getComputedStyle(element);
  const borderWidth = Number.parseFloat(style.borderTopWidth || '0');
  const background = style.backgroundColor || style.backgroundImage || '';
  if (borderWidth < 1) {
    throw new Error(`${label} should have a visible border.`);
  }
  if (!background || background === 'rgba(0, 0, 0, 0)' || background === 'transparent') {
    throw new Error(`${label} should have a visible background.`);
  }
}

sqlWindow.document.getElementById('dependencyViewBtn').click();
await flush();
if (!sqlWindow.document.getElementById('statusText').textContent.includes('dependency row')) {
  throw new Error('Dependency view action did not update the status text.');
}
if (!sqlWindow.document.querySelector('.results-table')?.textContent.includes('dbo.AlertView')) {
  throw new Error('Dependency view action did not render dependency results.');
}
if (!sqlWindow.document.querySelector('.dependency-visual')?.textContent.includes('Dependency map')) {
  throw new Error('Dependency view action did not render the dependency visual helper.');
}
if (sqlWindow.document.querySelectorAll('#resultTabs .result-tab').length < 2) {
  throw new Error('Profile and dependency actions should create result tabs.');
}

sqlWindow.document.querySelector('[data-pin-object="dbo.Alerts"]').click();
await flush();
if (!sqlWindow.document.querySelector('[data-object="dbo.Alerts"]')?.textContent.includes('★')) {
  throw new Error('Pinned object did not render with a visible pin marker.');
}
sqlWindow.document.getElementById('pinnedOnlyObjectsToggle').checked = true;
sqlWindow.document.getElementById('pinnedOnlyObjectsToggle').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
if (!sqlWindow.document.querySelector('[data-object="dbo.Alerts"]') || sqlWindow.document.querySelector('[data-object="dbo.AlertView"]')) {
  throw new Error('Pinned-only object filter did not restrict the explorer list.');
}
sqlWindow.document.getElementById('pinnedOnlyObjectsToggle').checked = false;
sqlWindow.document.getElementById('pinnedOnlyObjectsToggle').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));

sqlWindow.document.getElementById('rowCountInsightBtn').click();
await flush();
if (!sqlWindow.document.querySelector('.results-table')?.textContent.includes('row_count')) {
  throw new Error('Row count insight did not render a result grid.');
}
sqlWindow.document.getElementById('topValuesInsightBtn').click();
await flush();
if (!sqlWindow.document.querySelector('.results-table')?.textContent.includes('FAILED')) {
  throw new Error('Top values insight did not render expected value counts.');
}
sqlWindow.document.getElementById('schemaCompareBtn').click();
await flush();
if (!sqlWindow.document.querySelector('.results-table')?.textContent.includes('nullable')) {
  throw new Error('Schema compare did not render difference rows.');
}
sqlWindow.document.getElementById('resultShapeBtn').click();
await flush();
if (!sqlWindow.document.querySelector('.results-table')?.textContent.includes('system_type_name')) {
  throw new Error('Result shape insight did not render metadata rows.');
}
sqlWindow.document.getElementById('queryPlanBtn').click();
await flush();
if (!sqlWindow.document.getElementById('statusText').textContent.includes('estimated')) {
  throw new Error('Estimated plan action did not update status text.');
}
if (sqlWindow.document.querySelectorAll('#resultTabs .result-tab').length > 5) {
  throw new Error('Result tabs exceeded the configured five-tab cap.');
}

sqlWindow.document.getElementById('loadAuditBtn').click();
await flush();
if (sqlWindow.document.getElementById('auditFilterDialog').classList.contains('hidden')) {
  throw new Error('Audit log button did not open the audit filter dialog.');
}
sqlWindow.document.getElementById('auditEventFilter').value = 'query';
sqlWindow.document.getElementById('applyAuditFiltersBtn').click();
await flush();
if (!sqlWindow.document.querySelector('.results-table')?.textContent.includes('SELECT')) {
  throw new Error('Filtered audit load did not render audit entries.');
}

const editor = sqlWindow.document.getElementById('queryEditor');
editor.value = 'SELECT *\nFROM dbo.Alerts';
editor.selectionStart = editor.selectionEnd = editor.value.length;
sqlWindow.document.getElementById('insertWhereBtn').click();

if (editor.value.includes('WHERE')) {
  throw new Error('INSERT WHERE should not inject a raw WHERE clause before the filter is complete.');
}
if (!sqlWindow.document.querySelector('.filter-row')) {
  throw new Error('INSERT WHERE did not create a filter row when no filters existed.');
}

const filterRow = sqlWindow.document.querySelector('.filter-row');
filterRow.querySelector('.filter-column').value = 'Status';
filterRow.querySelector('.filter-column').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
filterRow.querySelector('.filter-operator').value = 'LIKE';
filterRow.querySelector('.filter-operator').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
filterRow.querySelector('.filter-value').value = 'FAIL';
filterRow.querySelector('.filter-value').dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
filterRow.querySelector('.filter-value').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));

if (!editor.value.includes("WHERE [Status] LIKE '%FAIL%'")) {
  throw new Error(`Live filter editing did not rebuild the SQL automatically. SQL was: ${editor.value}`);
}

sqlWindow.document.getElementById('generateQueryBtn').click();
if (!editor.value.includes("WHERE [Status] LIKE '%FAIL%'")) {
  throw new Error(`Refresh SQL did not build the LIKE filter correctly. SQL was: ${editor.value}`);
}

sqlWindow.document.getElementById('sqlHelperSelect').value = 'replace';
editor.selectionStart = editor.selectionEnd = editor.value.length;
sqlWindow.document.getElementById('insertSqlHelperBtn').click();
if (!editor.value.includes('REPLACE([AlertId]')) {
  throw new Error(`SQL helper did not insert a REPLACE expression. SQL was: ${editor.value}`);
}

sqlWindow.document.querySelector('[data-mode="delete"]').click();
if (!editor.value.includes('DELETE FROM [dbo].[Alerts]') || !editor.value.includes("WHERE [Status] LIKE '%FAIL%'")) {
  throw new Error(`Delete mode did not rebuild the filtered DELETE statement correctly. SQL was: ${editor.value}`);
}

sqlWindow.document.querySelector('[data-mode="update"]').click();
const updateRow = sqlWindow.document.querySelector('.filter-row');
updateRow.querySelector('.filter-column').value = 'AlertId';
updateRow.querySelector('.filter-column').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
updateRow.querySelector('.filter-operator').value = '=';
updateRow.querySelector('.filter-operator').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));
updateRow.querySelector('.filter-value').value = '42';
updateRow.querySelector('.filter-value').dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
updateRow.querySelector('.filter-value').dispatchEvent(new sqlWindow.Event('change', { bubbles: true }));

if (!editor.value.includes('UPDATE [dbo].[Alerts]') || !editor.value.includes("SET [Status] = ''") || !editor.value.includes('WHERE [AlertId] = 42;')) {
  throw new Error(`Update mode did not rebuild the WHERE clause correctly. SQL was: ${editor.value}`);
}

sqlWindow.document.getElementById('runQueryBtn').click();
await flush();

if (!sqlWindow.document.querySelector('.results-table')) {
  throw new Error('Run query did not render the results table.');
}
if (sqlWindow.document.querySelector('.results-card')?.dataset.resultsState !== 'table') {
  throw new Error('Populated results should mark the results card as table state for runtime sizing.');
}
if (!sqlWindow.document.querySelector('.result-null')) {
  throw new Error('Null results are not rendered with the structured null style.');
}
if (!sqlWindow.document.querySelector('.row-index')) {
  throw new Error('Results table row indexes are missing.');
}
{
  // Copy rows must keep SQL NULL distinguishable from an empty string, matching the grid and
  // the single-cell copy action.
  sqlWindow.document.getElementById('copyResultsBtn').click();
  await flush();
  const copiedLines = sqlWindow.__lastClipboardText.split('\n');
  if (copiedLines[0] !== 'AlertId\tStatus\tJsonPayload') {
    throw new Error(`Copy rows did not emit the column header row. Got: ${copiedLines[0]}`);
  }
  const nullRow = copiedLines.find((line) => line.startsWith('1\t'));
  const blankRow = copiedLines.find((line) => line.startsWith('3\t'));
  if (!nullRow || !blankRow) {
    throw new Error(`Copy rows did not emit both the NULL and empty-string rows. Got: ${sqlWindow.__lastClipboardText}`);
  }
  if (!nullRow.startsWith('1\tNULL\t')) {
    throw new Error(`Copy rows should render SQL NULL as NULL. Got: ${nullRow}`);
  }
  if (!blankRow.startsWith('3\t\t')) {
    throw new Error(`Copy rows should render an empty string as an empty field. Got: ${blankRow}`);
  }
}
assertVisibleAffordance(sqlWindow, '.result-tab.active', 'active result tab');
assertVisibleAffordance(sqlWindow, '.table-header-btn', 'result table header button');
const firstDataCell = sqlWindow.document.querySelector('#resultsPanel tbody tr td:nth-child(2)');
if (!firstDataCell) {
  throw new Error('Results table did not render a data cell for context-menu checks.');
}
firstDataCell.dispatchEvent(new sqlWindow.MouseEvent('contextmenu', {
  bubbles: true,
  cancelable: true,
  clientX: 120,
  clientY: 120
}));
if (sqlWindow.document.getElementById('resultsContextMenu').classList.contains('hidden')) {
  throw new Error('Results context menu did not open for a result row.');
}
sqlWindow.document.getElementById('contextCopyCellBtn').click();
await flush();
if (!sqlWindow.__lastClipboardText) {
  throw new Error('Context menu did not copy the clicked cell value.');
}
const firstJsonCell = sqlWindow.document.querySelector('#resultsPanel tbody tr td:nth-child(4)');
firstJsonCell?.dispatchEvent(new sqlWindow.MouseEvent('contextmenu', {
  bubbles: true,
  cancelable: true,
  clientX: 140,
  clientY: 140
}));
if (sqlWindow.document.getElementById('contextCopyFormattedJsonBtn').disabled) {
  throw new Error('Formatted JSON copy should be enabled for JSON result cells.');
}
sqlWindow.document.getElementById('contextCopyFormattedJsonBtn').click();
await flush();
if (!sqlWindow.__lastClipboardText.includes('\n  "severity": "low"')) {
  throw new Error(`Formatted JSON copy did not write pretty JSON. Clipboard: ${sqlWindow.__lastClipboardText}`);
}
// Copy as INSERT keeps SQL NULL and the empty string apart, quotes strings as N'...', and
// leaves numbers bare; Markdown escapes the table syntax.
sqlWindow.document.getElementById('contextCopyInsertBtn').click();
await flush();
if (!/^INSERT INTO \S+ \(\[AlertId\], \[Status\], \[JsonPayload\]\)\nVALUES\n {2}\(1, NULL, N'\{"severity":"low"/.test(sqlWindow.__lastClipboardText)) {
  throw new Error(`Copy row as INSERT produced an unexpected statement: ${sqlWindow.__lastClipboardText}`);
}
sqlWindow.document.getElementById('contextCopyAllInsertBtn').click();
await flush();
if (!sqlWindow.__lastClipboardText.includes("(2, N'FAILED',") || !sqlWindow.__lastClipboardText.includes("(3, N'',") || sqlWindow.__lastClipboardText.split('\n  (').length !== 4) {
  throw new Error(`Copy loaded rows as INSERT should emit one VALUES row per result row. Got: ${sqlWindow.__lastClipboardText}`);
}
sqlWindow.document.getElementById('contextCopyMarkdownBtn').click();
await flush();
const markdownLines = sqlWindow.__lastClipboardText.split('\n');
if (markdownLines[0] !== '| AlertId | Status | JsonPayload |' || markdownLines[1] !== '| --- | --- | --- |' || !markdownLines[2].startsWith('| 1 | NULL |')) {
  throw new Error(`Copy as Markdown produced an unexpected table: ${sqlWindow.__lastClipboardText}`);
}
// Export JSON writes the loaded rows, with SQL NULL kept as null.
const exportedBlobs = [];
// jsdom's Blob has no .text(); the export route's blob comes from Node's Response and does.
const readBlob = (blob) => (typeof blob.text === 'function' ? blob.text() : new Promise((resolve) => {
  const reader = new sqlWindow.FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.readAsText(blob);
}));
sqlWindow.URL.createObjectURL = (blob) => {
  exportedBlobs.push(blob);
  return 'blob:smoke';
};
sqlWindow.URL.revokeObjectURL = () => {};
// jsdom cannot navigate, so a download link's click is recorded instead of followed.
sqlWindow.HTMLAnchorElement.prototype.click = function recordDownload() {
  sqlWindow.__lastDownloadName = this.download;
};
sqlWindow.document.getElementById('exportJsonBtn').click();
await flush();
const exportedJson = JSON.parse(await readBlob(exportedBlobs.at(-1)));
if (exportedJson.rows.length !== 3 || exportedJson.rows[0].Status !== null || exportedJson.truncated !== false) {
  throw new Error(`Export JSON should write the loaded rows with nulls intact. Got: ${JSON.stringify(exportedJson)}`);
}
if (!sqlWindow.document.getElementById('resultsTruncatedBanner').classList.contains('hidden')) {
  throw new Error('A result within the row limit must not show the truncation banner.');
}

editor.value = 'SELECT * FROM dbo.Alerts LIMIT 100;';
editor.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
sqlWindow.document.getElementById('runQueryBtn').click();
await flush();
if (!sqlWindow.document.querySelector('.result-error-card')?.textContent.includes('LIMIT is not valid')) {
  throw new Error('LIMIT syntax errors should explain the T-SQL TOP/OFFSET alternative.');
}

// Run all keeps the old behaviour: the whole editor goes as one request, so several
// statements are a confirmed batch.
editor.value = 'SELECT 1 AS a; SELECT 2 AS b;';
editor.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
sqlWindow.document.getElementById('runAllQueryBtn').click();
await flush();
if (sqlWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
  throw new Error('Multi-statement SQL did not open the confirmation modal.');
}
if (!sqlWindow.document.getElementById('modalReview').textContent.includes('Operations')) {
  throw new Error('Batch confirmation did not render detected operation context.');
}
if (sqlWindow.document.getElementById('confirmModalBtn').disabled !== true) {
  throw new Error('Batch confirmation button should be disabled before acknowledgement.');
}
const batchConfirmInput = sqlWindow.document.getElementById('secondConfirmInput');
batchConfirmInput.value = 'RUN BATCH';
batchConfirmInput.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
if (sqlWindow.document.getElementById('confirmModalBtn').disabled) {
  throw new Error('Batch confirmation button stayed disabled after the correct acknowledgement phrase.');
}
sqlWindow.document.getElementById('cancelModalBtn').click();
await flush();

sqlWindow.document.getElementById('scriptCreateBtn').click();
await flush();
if (!editor.value.includes('CREATE TABLE [dbo].[Alerts]')) {
  throw new Error(`Script CREATE did not load the object definition into the editor. SQL was: ${editor.value}`);
}
if (!sqlWindow.document.getElementById('statusText').textContent.includes('Loaded CREATE script')) {
  throw new Error('Script CREATE did not show the expected loaded-script status.');
}
sqlWindow.document.getElementById('scriptAlterBtn').click();
await flush();
if (!editor.value.includes('ALTER TABLE [dbo].[Alerts]')) {
  throw new Error(`Script ALTER/Edit did not load the editable object definition into the editor. SQL was: ${editor.value}`);
}
if (!sqlWindow.document.querySelector('.page-link.active')?.textContent.includes('SQL Studio')) {
  throw new Error('SQL page navigation did not highlight the active page.');
}

sqlWindow.document.querySelector('[data-object="dbo.AlertView"]').click();
await flush();
if (!sqlWindow.document.getElementById('activeTarget').textContent.includes('dbo.AlertView')) {
  throw new Error('Selecting a second object did not update the active target before history restore.');
}
sqlWindow.document.querySelector('[data-mode="select"]').click();
if (!sqlWindow.document.querySelector('[data-mode="select"]')?.classList.contains('active')) {
  throw new Error('Selecting a different mode before history restore did not update the query mode segment.');
}
sqlWindow.document.querySelector('[data-history-id]').click();
await flush();
await flush();
if (!sqlWindow.document.getElementById('activeTarget').textContent.includes('dbo.Alerts')) {
  throw new Error('Loading SQL history did not restore the active object used by the query.');
}
if (!sqlWindow.document.querySelector('[data-object="dbo.Alerts"]')?.classList.contains('active')) {
  throw new Error('Loading SQL history did not mark the restored object active in the explorer.');
}
if (!sqlWindow.document.getElementById('queryEditor').value.includes('UPDATE [dbo].[Alerts]')) {
  throw new Error('Loading SQL history did not preserve the saved SQL text after restoring the active object.');
}
if (!sqlWindow.document.querySelector('[data-mode="update"]')?.classList.contains('active')) {
  throw new Error('Loading SQL history did not restore the query operation mode used by the saved SQL.');
}
if (!sqlWindow.document.getElementById('queryModeHint').textContent.includes('Update')) {
  throw new Error('Loading SQL history did not update the visible query mode hint.');
}

editor.value = "UPDATE dbo.Alerts SET Status = 'HEIGHTENED_EDIT_TEST' WHERE AlertId > 0";
editor.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
sqlWindow.document.getElementById('runQueryBtn').click();
await flush();
if (sqlWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
  throw new Error('A write above the heightened row limit did not open the confirmation modal.');
}
if (sqlWindow.document.getElementById('secondConfirmWrap').classList.contains('hidden')) {
  throw new Error('A write above the heightened row limit must show the typed acknowledgement box.');
}
if (!sqlWindow.document.getElementById('confirmModalBtn').disabled) {
  throw new Error('A write above the heightened row limit must keep Continue disabled until the phrase is typed.');
}
const heightenedConfirmInput = sqlWindow.document.getElementById('secondConfirmInput');
heightenedConfirmInput.value = 'EXECUTE UPDATE';
heightenedConfirmInput.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
if (sqlWindow.document.getElementById('confirmModalBtn').disabled) {
  throw new Error('Continue stayed disabled after typing the heightened write phrase.');
}
sqlWindow.document.getElementById('confirmModalBtn').click();
await flush();
if (!sqlWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
  throw new Error('Confirming a heightened write with the correct phrase should close the modal.');
}

// Run query / Ctrl+Enter sends only the statement under the cursor, so a multi-statement
// editor no longer turns into a confirmed batch just because other queries sit next to it.
editor.value = 'SELECT 1 AS a;\n\nSELECT 2 AS b;';
editor.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
editor.setSelectionRange(editor.value.indexOf('SELECT 2') + 3, editor.value.indexOf('SELECT 2') + 3);
sqlWindow.__postedQueries = [];
sqlWindow.document.getElementById('runQueryBtn').click();
await flush();
if (sqlWindow.__postedQueries.at(-1) !== 'SELECT 2 AS b;') {
  throw new Error(`Run query should send only the statement under the cursor. Sent: ${JSON.stringify(sqlWindow.__postedQueries)}`);
}
if (!sqlWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
  throw new Error('Running one read statement out of several must not open the batch confirmation.');
}
if (!sqlWindow.document.getElementById('queryEditorBackdrop').querySelector('.sql-run-range')?.textContent.includes('SELECT 2 AS b;')) {
  throw new Error('The executed statement should be highlighted in the editor backdrop.');
}
editor.setSelectionRange(0, 'SELECT 1 AS a'.length);
sqlWindow.document.getElementById('runQueryBtn').click();
await flush();
if (sqlWindow.__postedQueries.at(-1) !== 'SELECT 1 AS a') {
  throw new Error(`Run query should send exactly the selected text. Sent: ${sqlWindow.__postedQueries.at(-1)}`);
}
editor.setSelectionRange(0, 0);
sqlWindow.document.dispatchEvent(new sqlWindow.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
await flush();
if (sqlWindow.__postedQueries.at(-1) !== 'SELECT 1 AS a;') {
  throw new Error(`Ctrl+Enter should run the statement under the cursor. Sent: ${sqlWindow.__postedQueries.at(-1)}`);
}

// Autocomplete: object names after FROM, alias-qualified columns, and Escape to dismiss.
const suggestList = sqlWindow.document.getElementById('editorSuggest');
const typeInEditor = (text, cursor = text.length) => {
  editor.value = text;
  editor.setSelectionRange(cursor, cursor);
  editor.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
};
const pressInEditor = (key) => editor.dispatchEvent(new sqlWindow.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
typeInEditor('SELECT * FROM dbo.Al');
await flush();
if (suggestList.classList.contains('hidden') || !suggestList.textContent.includes('dbo.Alerts')) {
  throw new Error(`Typing an object prefix after FROM should suggest dbo.Alerts. Suggestions: ${suggestList.textContent}`);
}
const firstObjectSuggestion = suggestList.querySelector('.editor-suggest-item .editor-suggest-label').textContent;
pressInEditor('Tab');
if (editor.value !== `SELECT * FROM ${firstObjectSuggestion}`) {
  throw new Error(`Accepting an object suggestion should replace the typed prefix. Editor: ${editor.value}`);
}
if (!suggestList.classList.contains('hidden')) {
  throw new Error('The suggestion list should close after accepting a suggestion.');
}
typeInEditor('SELECT a.Al FROM dbo.Alerts a', 'SELECT a.Al'.length);
await flush();
await flush();
if (!suggestList.textContent.includes('AlertId')) {
  throw new Error(`An alias prefix should suggest that object's columns. Suggestions: ${suggestList.textContent}`);
}
pressInEditor('Enter');
if (editor.value !== 'SELECT a.AlertId FROM dbo.Alerts a') {
  throw new Error(`Accepting a column suggestion should insert the column. Editor: ${editor.value}`);
}
typeInEditor('SELECT * FROM dbo.Al');
await flush();
pressInEditor('Escape');
if (!suggestList.classList.contains('hidden')) {
  throw new Error('Escape should close the suggestion list.');
}
typeInEditor("SELECT 'dbo.Al");
await flush();
if (!suggestList.classList.contains('hidden')) {
  throw new Error('Typing inside a string literal must not open suggestions.');
}

// Editor tabs: each tab keeps its own SQL, switching swaps the editor text, the tabs are
// persisted with the workspace, and closing a tab falls back to its neighbour.
const tabStrip = sqlWindow.document.getElementById('editorTabs');
if (tabStrip.querySelectorAll('[data-editor-tab]').length !== 1) {
  throw new Error('The SQL editor should start with exactly one tab.');
}
typeInEditor('SELECT 1 AS first_tab');
sqlWindow.document.getElementById('newEditorTabBtn').click();
if (tabStrip.querySelectorAll('[data-editor-tab]').length !== 2 || editor.value !== '') {
  throw new Error(`A new editor tab should open empty. Tabs: ${tabStrip.querySelectorAll('[data-editor-tab]').length}, editor: ${editor.value}`);
}
typeInEditor('SELECT 2 AS second_tab');
tabStrip.querySelectorAll('[data-editor-tab]')[0].click();
if (editor.value !== 'SELECT 1 AS first_tab') {
  throw new Error(`Switching back to the first tab should restore its SQL. Editor: ${editor.value}`);
}
sqlWindow.document.querySelectorAll('#editorTabs [data-editor-tab]')[1].click();
if (editor.value !== 'SELECT 2 AS second_tab') {
  throw new Error(`Switching to the second tab should restore its SQL. Editor: ${editor.value}`);
}
const persistedTabs = JSON.parse(sqlWindow.sessionStorage.getItem('dataWorkbenchWorkspaceStateV1') || '{}').sql?.builder?.editorTabs || [];
if (persistedTabs.length !== 2 || !persistedTabs.some((tab) => tab.query === 'SELECT 1 AS first_tab')) {
  throw new Error(`Editor tabs should be persisted with the workspace. Persisted: ${JSON.stringify(persistedTabs)}`);
}
typeInEditor('');
[...sqlWindow.document.querySelectorAll('#editorTabs [data-close-editor-tab]')].at(-1).click();
if (sqlWindow.document.querySelectorAll('#editorTabs [data-editor-tab]').length !== 1 || editor.value !== 'SELECT 1 AS first_tab') {
  throw new Error(`Closing the empty active tab should fall back to the remaining tab. Tabs: ${sqlWindow.document.querySelectorAll('#editorTabs [data-editor-tab]').length}, editor: ${editor.value}`);
}
if (sqlWindow.document.querySelector('#editorTabs [data-close-editor-tab]')) {
  throw new Error('The last remaining editor tab should not offer a close button.');
}

// Keyboard shortcuts: ? opens the overlay (not while typing), / focuses explorer search,
// Ctrl+Alt+N / W open and close editor tabs.
const pressOnDocument = (init) => sqlWindow.document.body.dispatchEvent(new sqlWindow.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
editor.blur();
pressOnDocument({ key: '?' });
const shortcutsDialog = sqlWindow.document.getElementById('shortcutsDialog');
if (shortcutsDialog.classList.contains('hidden') || !sqlWindow.document.getElementById('shortcutsList').textContent.includes('Ctrl+Shift+Enter')) {
  throw new Error('Pressing ? should open the keyboard shortcut overlay listing the run shortcuts.');
}
pressOnDocument({ key: 'Escape' });
if (!shortcutsDialog.classList.contains('hidden')) {
  throw new Error('Escape should close the keyboard shortcut overlay.');
}
editor.dispatchEvent(new sqlWindow.KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
if (!shortcutsDialog.classList.contains('hidden')) {
  throw new Error('Typing ? in the editor must not open the shortcut overlay.');
}
pressOnDocument({ key: '/' });
if (sqlWindow.document.activeElement?.id !== 'tableSearchInput') {
  throw new Error(`Pressing / should focus the explorer search. Focused: ${sqlWindow.document.activeElement?.id}`);
}
sqlWindow.document.getElementById('tableSearchInput').blur();
pressOnDocument({ key: 'n', ctrlKey: true, altKey: true });
if (sqlWindow.document.querySelectorAll('#editorTabs [data-editor-tab]').length !== 2 || editor.value !== '') {
  throw new Error('Ctrl+Alt+N should open a new, empty editor tab.');
}
pressOnDocument({ key: 'w', ctrlKey: true, altKey: true });
if (sqlWindow.document.querySelectorAll('#editorTabs [data-editor-tab]').length !== 1 || editor.value !== 'SELECT 1 AS first_tab') {
  throw new Error('Ctrl+Alt+W should close the empty editor tab and return to the previous one.');
}

// Cancel a running read: the cancel reaches the server with the query's run id, the fetch
// is aborted, and the grid says "Cancelled" instead of showing an error.
editor.value = 'SELECT SLOW_CANCEL_TEST FROM dbo.Alerts';
editor.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
sqlWindow.__cancelledRunIds = [];
sqlWindow.document.getElementById('runQueryBtn').click();
await flush();
if (sqlWindow.document.getElementById('cancelQueryBtn').classList.contains('hidden')) {
  throw new Error('The Cancel button should appear while a query is running.');
}
if (!sqlWindow.document.getElementById('runQueryBtn').disabled || !sqlWindow.document.getElementById('runAllQueryBtn').disabled) {
  throw new Error('Run buttons should be disabled while a query is running.');
}
const slowRunId = sqlWindow.__postedRunIds.at(-1);
if (!/^[0-9a-f-]{36}$/.test(String(slowRunId || ''))) {
  throw new Error(`A running query should carry a UUID run id. Got: ${slowRunId}`);
}
sqlWindow.document.getElementById('cancelQueryBtn').click();
await flush();
await flush();
if (sqlWindow.__cancelledRunIds.at(-1) !== slowRunId) {
  throw new Error(`Cancel should post the running query's run id. Posted: ${JSON.stringify(sqlWindow.__cancelledRunIds)}`);
}
if (!sqlWindow.document.getElementById('resultsMeta').textContent.startsWith('Cancelled')) {
  throw new Error(`A cancelled read should say Cancelled in the results meta. Got: ${sqlWindow.document.getElementById('resultsMeta').textContent}`);
}
if (sqlWindow.document.querySelector('.result-error-card')) {
  throw new Error('A cancelled query must not render as an error.');
}
if (!sqlWindow.document.getElementById('cancelQueryBtn').classList.contains('hidden') || sqlWindow.document.getElementById('runQueryBtn').disabled) {
  throw new Error('After a cancel the Cancel button should hide and Run should be enabled again.');
}

// Cancel a confirmed write from the dialog: the dialog's Cancel becomes "Cancel write",
// and the server's rolled-back answer is shown rather than a guess.
editor.value = "UPDATE dbo.Alerts SET Status = 'SLOW_WRITE_TEST' WHERE AlertId = 1";
editor.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
sqlWindow.document.getElementById('runQueryBtn').click();
await flush();
sqlWindow.document.getElementById('confirmModalBtn').click();
await flush();
if (sqlWindow.document.getElementById('cancelModalBtn').textContent !== 'Cancel write') {
  throw new Error(`While a confirmed write runs, the dialog Cancel should read "Cancel write". Got: ${sqlWindow.document.getElementById('cancelModalBtn').textContent}`);
}
sqlWindow.document.getElementById('cancelModalBtn').click();
await flush();
await flush();
if (!sqlWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
  throw new Error('The dialog should close once the cancelled write has answered.');
}
if (!sqlWindow.document.getElementById('statusText').textContent.includes('rolled back')) {
  throw new Error(`A cancelled write should report the rollback. Status: ${sqlWindow.document.getElementById('statusText').textContent}`);
}

// A result cut off at the row limit says so, never claims a total, and offers Export all,
// which re-runs the same query through the streaming export route.
editor.value = 'SELECT AlertId, Status FROM dbo.Alerts WHERE 1 = 1 /* TRUNCATED_TEST */';
editor.dispatchEvent(new sqlWindow.Event('input', { bubbles: true }));
sqlWindow.document.getElementById('runQueryBtn').click();
await flush();
const truncatedBanner = sqlWindow.document.getElementById('resultsTruncatedBanner');
if (truncatedBanner.classList.contains('hidden') || !sqlWindow.document.getElementById('resultsTruncatedText').textContent.includes('first 2 rows')) {
  throw new Error(`A truncated result should show the banner. Banner: ${sqlWindow.document.getElementById('resultsTruncatedText').textContent}`);
}
const truncatedMeta = sqlWindow.document.getElementById('resultsMeta').textContent;
if (!truncatedMeta.includes('more rows exist') || truncatedMeta.includes(' of 3')) {
  throw new Error(`A truncated result must not present the probe row count as a total. Meta: ${truncatedMeta}`);
}
sqlWindow.__exportRequests = [];
sqlWindow.document.getElementById('exportAllCsvBtn').click();
await flush();
await flush();
const exportRequest = sqlWindow.__exportRequests.at(-1);
if (!exportRequest || exportRequest.format !== 'csv' || !exportRequest.query.includes('TRUNCATED_TEST') || !/^[0-9a-f-]{36}$/.test(String(exportRequest.runId || ''))) {
  throw new Error(`Export all should post the result's query, the format and a run id. Posted: ${JSON.stringify(exportRequest)}`);
}
if ((await readBlob(exportedBlobs.at(-1))) !=='AlertId,Status\r\n1,NULL\r\n2,FAILED\r\n') {
  throw new Error('Export all should save the streamed file exactly as the server sent it.');
}
if (sqlWindow.__lastDownloadName !== 'data-workbench-export-20260924-101112.csv') {
  throw new Error(`Export all should keep the server's file name. Got: ${sqlWindow.__lastDownloadName}`);
}
if (!sqlWindow.document.getElementById('statusText').textContent.includes('Exported the full result')) {
  throw new Error(`Export all should report success. Status: ${sqlWindow.document.getElementById('statusText').textContent}`);
}

const proceduresHtml = await readBuiltHtml(['procedures']);
sqlWindow.document.body.innerHTML = extractBody(proceduresHtml);
await sqlWindow.initConsoleApp('/procedures');
await flush();

if (sqlWindow.document.getElementById('serverInput').value !== 'demo' || sqlWindow.document.getElementById('databaseInput').value !== 'meta_store') {
  throw new Error('Active connection was not restored after switching to the procedure page.');
}
if (!sqlWindow.document.getElementById('savedConnections').textContent.includes('meta_store')) {
  throw new Error('Saved connections were not restored after switching to the procedure page.');
}
if (!sqlWindow.document.querySelector('[data-procedure="dbo.usp_ProcessAlert"]')) {
  throw new Error('Procedure catalog was not restored automatically on the procedure page.');
}
if (sqlWindow.document.querySelectorAll('#themeList .theme-chip').length !== 6) {
  throw new Error('Theme chips did not render after switching to the procedure page.');
}
if (sqlWindow.document.getElementById('advancedOperationsContent').classList.contains('hidden')) {
  throw new Error('Advanced operations visibility was not restored after switching pages.');
}
if (sqlWindow.document.querySelector('.app-shell').style.getPropertyValue('--control-rail-width') !== '390px') {
  throw new Error('Control rail width was not restored after switching to the procedure page.');
}
if (sqlWindow.document.querySelector('.app-shell').style.getPropertyValue('--explorer-width') !== '360px') {
  throw new Error('Explorer width was not restored after switching to the procedure page.');
}
if (sqlWindow.document.querySelector('.app-shell').style.getPropertyValue('--activity-width') !== '370px') {
  throw new Error('Activity width was not restored after switching to the procedure page.');
}
if (sqlWindow.document.querySelector('.app-shell').style.getPropertyValue('--results-height') !== '200px') {
  throw new Error('Results height was not restored after switching to the procedure page.');
}

const procedureWindow = await createWindow(
  'http://127.0.0.1:3100/procedures',
  ['procedures'],
  { width: 1880, height: 980 },
  (window) => {
    window.localStorage.setItem('dataWorkbenchSidePanelVisibilityV1', JSON.stringify({
      controlRailCollapsed: true,
      activityPanelCollapsed: false
    }));
  }
);
if (procedureWindow.document.querySelectorAll('#themeList .theme-chip').length !== 6) {
  throw new Error('Theme chips did not render on the procedure page.');
}
['saveConnectionBtn', 'testConnectionBtn', 'loadTablesBtn', 'runProcedureBtn', 'clearHistoryBtn', 'confirmModalBtn'].forEach((id) => {
  const element = procedureWindow.document.getElementById(id);
  if (!element || typeof element.onclick !== 'function') {
    throw new Error(`Expected ${id} to be wired on the procedure page.`);
  }
});
procedureWindow.document.getElementById('serverInput').value = 'demo';
procedureWindow.document.getElementById('databaseInput').value = 'meta_store';
procedureWindow.document.getElementById('loadTablesBtn').click();
await flush();

procedureWindow.document.getElementById('sourceTypeSelect').value = 'sql-server';
procedureWindow.document.getElementById('sourceTypeSelect').dispatchEvent(new procedureWindow.Event('change', { bubbles: true }));
procedureWindow.document.getElementById('authModeSelect').value = 'sqlLogin';
procedureWindow.document.getElementById('authModeSelect').dispatchEvent(new procedureWindow.Event('change', { bubbles: true }));
procedureWindow.document.getElementById('usernameInput').value = 'demo_user';
procedureWindow.document.getElementById('passwordInput').value = 'demo_password';
procedureWindow.document.getElementById('usernameInput').dispatchEvent(new procedureWindow.Event('input', { bubbles: true }));
procedureWindow.document.getElementById('passwordInput').dispatchEvent(new procedureWindow.Event('input', { bubbles: true }));
await flush();

if (procedureWindow.document.getElementById('usernameInput').disabled || procedureWindow.document.getElementById('passwordInput').disabled) {
  throw new Error('SQL login inputs should be enabled when SQL login is selected.');
}
if (procedureWindow.document.getElementById('trustServerCertificateField').classList.contains('hidden')) {
  throw new Error('SQL Server trust certificate toggle should be visible for SQL Server connections.');
}

if (!procedureWindow.document.querySelector('.page-link.active')?.textContent.includes('Procedure Runner')) {
  throw new Error('Procedure page navigation did not highlight the active page.');
}
const procedureResizeHandle = procedureWindow.document.querySelector('[data-resize-handle="procedure"]');
if (!procedureResizeHandle || typeof procedureResizeHandle.onpointerdown !== 'function') {
  throw new Error('Expected the procedure resize handle to be wired on the procedure page.');
}
dragHandle(procedureWindow, 'procedure', { x: 760, y: 180 }, { x: 720, y: 180 });
if (procedureWindow.document.querySelector('.app-shell').style.getPropertyValue('--procedure-panel-width') !== '320px') {
  throw new Error('Procedure runner resize did not update the persisted width.');
}

procedureWindow.document.querySelector('[data-procedure="dbo.usp_ProcessAlert"]').click();
await flush();

if (procedureWindow.document.querySelector('[data-procedure="dbo.usp_ProcessAlert"]')?.hasAttribute('title')) {
  throw new Error('Explorer procedure rows should not use native title tooltips.');
}
if (procedureWindow.document.querySelector('[data-pin-procedure="dbo.usp_ProcessAlert"]')?.hasAttribute('title')) {
  throw new Error('Explorer procedure pin controls should not use native title tooltips.');
}

if (!procedureWindow.document.getElementById('procedureSummary').textContent.includes('dbo.usp_ProcessAlert')) {
  throw new Error('Selecting a procedure did not update the procedure summary.');
}

procedureWindow.document.getElementById('scriptProcedureAlterBtn').click();
await flush();
await flush();
if (procedureWindow.document.getElementById('procedureScriptPanel').classList.contains('hidden')) {
  throw new Error('Procedure ALTER script did not open the Procedure Runner script editor.');
}
if (!procedureWindow.document.querySelector('.app-shell').classList.contains('procedure-script-expanded')) {
  throw new Error('Procedure script loading should expand the editor workspace.');
}
if (!procedureWindow.document.getElementById('toggleProcedureScriptExpandBtn').textContent.includes('Collapse')) {
  throw new Error('Expanded procedure script editor should show a collapse action.');
}
procedureWindow.document.getElementById('toggleProcedureScriptExpandBtn').click();
await flush();
if (procedureWindow.document.querySelector('.app-shell').classList.contains('procedure-script-expanded')) {
  throw new Error('Procedure script collapse action did not restore the normal runner layout.');
}
procedureWindow.document.getElementById('toggleProcedureScriptExpandBtn').click();
await flush();
if (!procedureWindow.document.getElementById('procedureScriptEditor').value.includes('ALTER PROCEDURE dbo.usp_ProcessAlert')) {
  throw new Error('Procedure ALTER script was not loaded into the Procedure Runner script editor.');
}
if (!procedureWindow.document.getElementById('procedureScriptEditorBackdrop').innerHTML.includes('sql-keyword')) {
  throw new Error('Procedure script editor did not render SQL syntax highlighting.');
}
if (!procedureWindow.document.getElementById('activeTarget').textContent.includes('dbo.usp_ProcessAlert')) {
  throw new Error('Procedure script loading should keep the active procedure on the Procedure Runner page.');
}
procedureWindow.document.getElementById('runProcedureScriptBtn').click();
await flush();
if (procedureWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
  throw new Error('Running a procedure script did not open the existing SQL confirmation modal.');
}
if (!procedureWindow.document.getElementById('modalReview').textContent.includes('/api/query confirmation token')) {
  throw new Error('Procedure script confirmation should use the existing /api/query confirmation path.');
}
procedureWindow.document.getElementById('cancelModalBtn').click();
await flush();

const paramInput = procedureWindow.document.querySelector('[data-procedure-param="AlertId"]');
if (!paramInput) {
  throw new Error('Procedure input field was not rendered.');
}
paramInput.value = '42';
paramInput.dispatchEvent(new procedureWindow.Event('input', { bubbles: true }));

procedureWindow.document.getElementById('runProcedureBtn').click();
await flush();

if (procedureWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
  throw new Error('Running a procedure did not open the confirmation modal.');
}
if (!procedureWindow.document.getElementById('modalReview').textContent.includes('Execution path')) {
  throw new Error('Procedure confirmation modal did not render review context.');
}

procedureWindow.document.getElementById('secondConfirmInput').value = 'RUN DBO.USP_PROCESSALERT';
procedureWindow.document.getElementById('confirmModalBtn').click();
await flush();

if (!procedureWindow.document.querySelector('.artifact-card')) {
  throw new Error('Procedure execution did not render output artifacts.');
}
if (!procedureWindow.document.getElementById('statusText').textContent.includes('executed successfully')) {
  throw new Error('Procedure execution did not update the status text.');
}

procedureWindow.document.querySelector('[data-procedure="ops.usp_OtherProcedure"]').click();
await flush();
if (!procedureWindow.document.getElementById('activeTarget').textContent.includes('ops.usp_OtherProcedure')) {
  throw new Error('Selecting a second procedure did not update the active target before history restore.');
}
procedureWindow.document.querySelector('[data-procedure-history-id]').click();
await flush();
await flush();
if (!procedureWindow.document.getElementById('activeTarget').textContent.includes('dbo.usp_ProcessAlert')) {
  throw new Error('Loading procedure history did not restore the active procedure used by the run.');
}
if (!procedureWindow.document.querySelector('[data-procedure="dbo.usp_ProcessAlert"]')?.classList.contains('active')) {
  throw new Error('Loading procedure history did not mark the restored procedure active in the explorer.');
}

const mediumWindow = await createWindow('http://127.0.0.1:3100/', [], { width: 1300, height: 980 });
if (mediumWindow.document.querySelector('[data-resize-handle="activity"]')?.getAttribute('aria-hidden') !== 'true') {
  throw new Error('Activity resize handle should be disabled below the wide desktop breakpoint.');
}

const bothPanelsDesktopWindow = await createWindow(
  'http://127.0.0.1:3100/',
  [],
  { width: 1840, height: 980 },
  (window) => {
    window.localStorage.setItem('dataWorkbenchSidePanelVisibilityV1', JSON.stringify({
      controlRailCollapsed: false,
      activityPanelCollapsed: false
    }));
  }
);
if (bothPanelsDesktopWindow.document.querySelector('.app-shell')?.dataset.workspaceMode !== 'wide') {
  throw new Error('Default-width visible side panels should keep themes/history in the desktop row when there is enough room.');
}
if (bothPanelsDesktopWindow.document.querySelector('.app-shell')?.classList.contains('activity-panel-collapsed')) {
  throw new Error('Themes/history panel should remain visible when both side panels are enabled.');
}
if (bothPanelsDesktopWindow.document.querySelector('[data-resize-handle="activity"]')?.getAttribute('aria-hidden') !== 'false') {
  throw new Error('Themes/history resize handle should remain enabled when the right panel is visible in desktop layout.');
}

const maxPanelsWindow = await createWindow(
  'http://127.0.0.1:3100/',
  [],
  { width: 1680, height: 980 },
  (window) => {
    window.localStorage.setItem('dataWorkbenchPanelLayoutV1', JSON.stringify({
      controlRail: 460,
      explorer: 420,
      activity: 420,
      results: 300,
      builder: 760
    }));
  }
);
if (maxPanelsWindow.document.querySelector('.app-shell')?.dataset.workspaceMode === 'wide') {
  throw new Error('Max-width visible panels should not leave the workspace in wide mode.');
}
if (maxPanelsWindow.document.querySelector('.app-shell')?.dataset.studioMode !== 'stacked') {
  throw new Error('Max-width visible panels should stack the studio area before controls can overlap.');
}
if (maxPanelsWindow.document.querySelector('[data-resize-handle="activity"]')?.getAttribute('aria-hidden') !== 'true') {
  throw new Error('Activity resize handle should be disabled once max-width visible panels force a non-wide workspace layout.');
}

const narrowStudioWindow = await createWindow(
  'http://127.0.0.1:3100/',
  [],
  { width: 1500, height: 980 },
  (window) => {
    window.localStorage.setItem('dataWorkbenchSidePanelVisibilityV1', JSON.stringify({
      controlRailCollapsed: true,
      activityPanelCollapsed: true
    }));
  }
);
if (narrowStudioWindow.document.querySelector('.app-shell')?.dataset.studioMode !== 'stacked') {
  throw new Error('Studio area should stack builder and editor earlier when side panels leave the main studio too narrow.');
}

const zoomWindow = await createWindow(
  'http://127.0.0.1:3100/',
  [],
  { width: 1500, height: 980, visualWidth: 1080, scale: 1.25 },
  (window) => {
    window.localStorage.setItem('dataWorkbenchPanelLayoutV1', JSON.stringify({
      controlRail: 420,
      explorer: 420,
      activity: 420,
      results: 520,
      builder: 760
    }));
  }
);
if (zoomWindow.document.querySelector('.app-shell')?.dataset.layoutMode !== 'split') {
  throw new Error('Zoom-like reduced visual viewport width should keep the split shell while it still has enough usable width.');
}
if (zoomWindow.document.querySelector('.app-shell')?.dataset.workspaceMode !== 'stacked') {
  throw new Error('Zoom-like reduced visual viewport width should stack the inner workspace before controls can overlap.');
}
if (zoomWindow.document.querySelector('.app-shell')?.style.getPropertyValue('--control-rail-width') !== '367px') {
  throw new Error('Zoom-like reduced visual viewport width should clamp stale persisted control rail widths to the available shell.');
}
if (zoomWindow.document.querySelector('.app-shell')?.style.getPropertyValue('--results-height') !== '200px') {
  throw new Error('Zoom-like reduced visual viewport width should compact empty results height.');
}
if (zoomWindow.document.querySelector('[data-resize-handle="controlRail"]')?.getAttribute('aria-hidden') !== 'true') {
  throw new Error('Zoom-like reduced visual viewport width should hide the control rail resize handle when resizing is disabled.');
}

const narrowWindow = await createWindow('http://127.0.0.1:3100/', [], { width: 1000, height: 980 });
if (narrowWindow.document.querySelector('.app-shell')?.dataset.layoutMode !== 'split') {
  throw new Error('Split-screen tablet width should keep the connection rail beside the workspace.');
}
if (narrowWindow.document.querySelector('.app-shell')?.dataset.workspaceMode !== 'stacked') {
  throw new Error('Split-screen tablet width should stack the inner workspace panels.');
}
if (!narrowWindow.document.querySelector('.app-shell')?.classList.contains('panel-resize-disabled')) {
  throw new Error('Resize handles should be disabled on narrow split layouts.');
}
['controlRail', 'explorer', 'results'].forEach((name) => {
  const handle = narrowWindow.document.querySelector(`[data-resize-handle="${name}"]`);
  if (handle?.getAttribute('aria-hidden') !== 'true') {
    throw new Error(`${name} resize handle should be hidden on narrow layouts.`);
  }
});

const autoHideWindow = await createWindow(
  'http://127.0.0.1:3100/',
  [],
  { width: 1680, height: 980 },
  (window) => {
    window.__dataWorkbenchTestConfig = {
      sidePanelIdleMs: 500,
      sidePanelFadeMs: 100
    };
  }
);
const autoHideShell = autoHideWindow.document.querySelector('.app-shell');
await waitForCondition(
  () => autoHideShell?.classList.contains('control-rail-auto-hiding') && autoHideShell?.classList.contains('activity-panel-auto-hiding'),
  'Visible side panels should begin fading after the idle timeout.'
);
autoHideWindow.document.querySelector('.control-rail')?.dispatchEvent(new autoHideWindow.Event('pointerdown', { bubbles: true }));
if (autoHideShell.classList.contains('control-rail-auto-hiding')) {
  throw new Error('Using the connection panel should cancel its in-progress fade.');
}
await waitForCondition(
  () => autoHideShell.classList.contains('activity-panel-collapsed'),
  'An unused themes panel should collapse after its fade completes.'
);
if (autoHideShell.classList.contains('control-rail-collapsed')) {
  throw new Error('Panel activity should restart the connection panel idle timer.');
}
await waitForCondition(
  () => autoHideShell.classList.contains('control-rail-auto-hiding'),
  'The restarted connection panel idle timer should enter the fade state.'
);
await waitForCondition(
  () => autoHideShell.classList.contains('control-rail-collapsed'),
  'The connection panel should collapse after the restarted idle timer and fade complete.'
);
if (autoHideWindow.localStorage.getItem('dataWorkbenchSidePanelVisibilityV1')) {
  throw new Error('Automatic side panel collapse should not overwrite the saved visibility preference.');
}

// Results-grid inline editor: full CRUD flow (modify a cell, delete a row,
// insert a row, discard, then save and confirm) plus the JOIN-rejection
// guard. Isolated in its own window rather than reusing sqlWindow above: a
// confirmed save adds its generated statement to query history exactly like
// any other write (confirmPendingAction's existing behavior), which would
// otherwise become the newest entry and break the history-restore assertions
// earlier in this file that depend on a specific earlier entry staying newest.
{
  const editorWindow = await createWindow('http://127.0.0.1:3100/');
  editorWindow.document.getElementById('serverInput').value = 'demo';
  editorWindow.document.getElementById('databaseInput').value = 'meta_store';
  editorWindow.document.getElementById('serverInput').dispatchEvent(new editorWindow.Event('input', { bubbles: true }));
  editorWindow.document.getElementById('databaseInput').dispatchEvent(new editorWindow.Event('input', { bubbles: true }));
  const editor = editorWindow.document.getElementById('queryEditor');

  // A JOIN result must never offer editing, even though the query itself is a
  // plain read with no errors.
  editor.value = 'SELECT a.AlertId, b.Name FROM dbo.Alerts a JOIN dbo.Users b ON a.UserId = b.Id';
  editor.dispatchEvent(new editorWindow.Event('input', { bubbles: true }));
  editorWindow.document.getElementById('runQueryBtn').click();
  await flush();
  if (!editorWindow.document.getElementById('toggleEditResultsBtn').classList.contains('hidden')) {
    throw new Error('Edit results button should stay hidden for a JOIN result.');
  }

  editor.value = 'SELECT * FROM dbo.Alerts';
  editor.dispatchEvent(new editorWindow.Event('input', { bubbles: true }));
  editorWindow.document.getElementById('runQueryBtn').click();
  await flush();
  if (editorWindow.document.getElementById('toggleEditResultsBtn').classList.contains('hidden')) {
    throw new Error('Edit results button should appear for an editable plain single-table SELECT.');
  }

  editorWindow.document.getElementById('toggleEditResultsBtn').click();
  await flush();
  if (editorWindow.document.getElementById('pendingEditsBar').classList.contains('hidden')) {
    throw new Error('Pending edits bar should show once edit mode is active.');
  }
  if (editorWindow.document.getElementById('toggleEditResultsBtn').textContent !== 'Exit edit mode') {
    throw new Error('Edit results button should switch to "Exit edit mode" while active.');
  }
  if (!editorWindow.document.querySelector('.row-actions-head')) {
    throw new Error('Row-actions column should render in edit mode.');
  }
  if (editorWindow.document.querySelectorAll('[data-toggle-delete-row-key]').length !== 3) {
    throw new Error('Expected one delete button per loaded row.');
  }
  if (!editorWindow.document.querySelector('[data-toggle-delete-row-key]').classList.contains('row-delete-btn')) {
    throw new Error('The Delete button should carry the danger (red) styling class.');
  }
  // A key column is editable, not locked — renaming it is safe because the
  // generated UPDATE always matches the row by its ORIGINAL key value — but it
  // keeps a "key" badge as a hint that changing it renames the row's identity.
  if (!editorWindow.document.querySelector('.result-edit-input[data-edit-column="AlertId"]')) {
    throw new Error('The key column (AlertId) should still render as an editable input.');
  }
  if (!editorWindow.document.querySelector('.result-edit-key-wrap .result-edit-key-marker')) {
    throw new Error('An editable key column should keep its "key" badge as a hint.');
  }
  if (editorWindow.document.querySelectorAll('.result-edit-input[data-edit-column="Status"]').length !== 3) {
    throw new Error('The editable Status column should render as an input for every row.');
  }

  // --- A single modified cell (no delete, no insert) is a single-statement
  // UPDATE and takes a different confirmation path than the multi-op save
  // below: single-click confirm, no typed acknowledgement required. The typed
  // value below is also the marker the mocked /api/query handler matches on
  // to return a plain write-preview instead of colliding with the unrelated,
  // marker-free single-UPDATE test elsewhere in this file.
  const singleEditInput = editorWindow.document.querySelectorAll('.result-edit-input[data-edit-column="Status"]')[0];
  singleEditInput.focus();
  singleEditInput.value = 'INLINE_EDIT_TEST';
  singleEditInput.dispatchEvent(new editorWindow.Event('input', { bubbles: true }));
  editorWindow.document.getElementById('saveResultEditsBtn').click();
  await flush();
  if (editorWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
    throw new Error('Saving a single cell edit should open the confirmation modal.');
  }
  if (!editorWindow.document.getElementById('secondConfirmWrap').classList.contains('hidden')) {
    throw new Error('A single plain UPDATE should not require a typed acknowledgement phrase.');
  }
  if (editorWindow.document.getElementById('confirmModalBtn').disabled) {
    throw new Error('A single plain UPDATE confirmation button should be enabled immediately.');
  }
  editorWindow.document.getElementById('confirmModalBtn').click();
  await flush();
  const singleEditToast = editorWindow.document.querySelector('#appToastContainer .app-toast');
  if (!singleEditToast || !singleEditToast.classList.contains('app-toast-success') || !singleEditToast.textContent.includes('Saved 1 change to dbo.Alerts.')) {
    throw new Error(`A success toast should appear after saving a single cell edit. Toast: ${singleEditToast?.textContent}`);
  }
  if (!editorWindow.document.querySelector('.results-table') || editorWindow.document.getElementById('toggleEditResultsBtn').textContent !== 'Exit edit mode') {
    throw new Error('Saving a single cell edit should refresh the grid in place and stay in edit mode.');
  }

  // --- Delete row 3 (AlertId=3); this rebuilds the table, so later steps
  // re-query fresh elements rather than reusing references from before it.
  editorWindow.document.querySelectorAll('[data-toggle-delete-row-key]')[2].click();
  await flush();
  if (editorWindow.document.querySelectorAll('tr.result-row-deleted').length !== 1) {
    throw new Error('Deleting a row should mark exactly one row as deleted.');
  }
  if (editorWindow.document.querySelectorAll('[data-toggle-delete-row-key]')[2].classList.contains('row-delete-btn')) {
    throw new Error('Once a row is deleted its button becomes Restore and should drop the danger styling.');
  }

  // --- Modify row 1's Status cell.
  const statusInput = editorWindow.document.querySelectorAll('.result-edit-input[data-edit-column="Status"]')[0];
  statusInput.focus();
  statusInput.value = 'RESOLVED';
  statusInput.dispatchEvent(new editorWindow.Event('input', { bubbles: true }));
  if (!statusInput.classList.contains('result-edit-dirty')) {
    throw new Error('Editing a cell should mark it dirty.');
  }

  // --- Insert a new row.
  editorWindow.document.getElementById('addResultRowBtn').click();
  await flush();
  if (editorWindow.document.getElementById('resultsNewRows').classList.contains('hidden')) {
    throw new Error('New-row section should appear after clicking + New row.');
  }
  const newRowStatusInput = editorWindow.document.querySelector('#resultsNewRows [data-new-row-column="Status"]');
  if (!newRowStatusInput) {
    throw new Error('New row form should include an input for each insertable column.');
  }
  newRowStatusInput.value = 'PENDING';
  newRowStatusInput.dispatchEvent(new editorWindow.Event('input', { bubbles: true }));

  const summaryText = editorWindow.document.getElementById('pendingEditsSummary').textContent;
  if (!summaryText.includes('3 unsaved changes') || !summaryText.includes('1 modified') || !summaryText.includes('1 deleted') || !summaryText.includes('1 new')) {
    throw new Error(`Pending edits summary should report the modified/deleted/new breakdown. Got: ${summaryText}`);
  }
  if (editorWindow.document.getElementById('saveResultEditsBtn').disabled) {
    throw new Error('Save changes should be enabled once changes are staged.');
  }

  // --- Discard must clear all three kinds of staged change.
  editorWindow.document.getElementById('discardResultEditsBtn').click();
  await flush();
  if (editorWindow.document.getElementById('pendingEditsSummary').textContent !== 'No unsaved changes') {
    throw new Error('Discarding edits should clear modified/deleted/new state.');
  }
  if (!editorWindow.document.getElementById('resultsNewRows').classList.contains('hidden')) {
    throw new Error('Discarding edits should also clear staged new rows.');
  }
  if (editorWindow.document.querySelector('tr.result-row-deleted')) {
    throw new Error('Discarding edits should un-mark deleted rows.');
  }
  if (editorWindow.document.querySelector('.result-edit-dirty')) {
    throw new Error('Discarding edits should clear dirty cell styling.');
  }

  // --- Redo the same three changes, then save and confirm end to end.
  editorWindow.document.querySelectorAll('[data-toggle-delete-row-key]')[2].click();
  await flush();
  const statusInput2 = editorWindow.document.querySelectorAll('.result-edit-input[data-edit-column="Status"]')[0];
  statusInput2.value = 'RESOLVED';
  statusInput2.dispatchEvent(new editorWindow.Event('input', { bubbles: true }));
  editorWindow.document.getElementById('addResultRowBtn').click();
  await flush();
  editorWindow.document.querySelector('#resultsNewRows [data-new-row-column="Status"]').value = 'PENDING';
  editorWindow.document.querySelector('#resultsNewRows [data-new-row-column="Status"]').dispatchEvent(new editorWindow.Event('input', { bubbles: true }));

  editorWindow.document.getElementById('saveResultEditsBtn').click();
  await flush();
  if (editorWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
    throw new Error('Saving staged changes should open the confirmation modal.');
  }
  const reviewText = editorWindow.document.getElementById('modalReview').textContent;
  if (!reviewText.includes('dbo.Alerts') || !reviewText.includes('1 deleted, 1 modified, 1 new')) {
    throw new Error(`Save confirmation review should summarize the object and change breakdown. Got: ${reviewText}`);
  }
  if (editorWindow.document.getElementById('confirmModalBtn').disabled !== true) {
    throw new Error('Save confirmation button should be disabled before the typed acknowledgement.');
  }
  const editSaveConfirmInput = editorWindow.document.getElementById('secondConfirmInput');
  editSaveConfirmInput.value = 'nonsense';
  editSaveConfirmInput.dispatchEvent(new editorWindow.Event('input', { bubbles: true }));
  if (!editorWindow.document.getElementById('confirmModalBtn').disabled) {
    throw new Error('Save confirmation button should stay disabled for the wrong acknowledgement phrase.');
  }
  editSaveConfirmInput.value = 'RUN BATCH';
  editSaveConfirmInput.dispatchEvent(new editorWindow.Event('input', { bubbles: true }));
  if (editorWindow.document.getElementById('confirmModalBtn').disabled) {
    throw new Error('Save confirmation button should enable once the correct acknowledgement phrase is typed.');
  }

  editorWindow.document.getElementById('confirmModalBtn').click();
  await flush();
  if (!editorWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
    throw new Error('Confirming the save should close the modal.');
  }
  // Toasts fade out on a real 5s timer rather than being removed synchronously,
  // so the single-cell-edit save above may have left its own toast in the DOM
  // — take the most recently appended one, not the first match.
  const toast = Array.from(editorWindow.document.querySelectorAll('#appToastContainer .app-toast')).pop();
  if (!toast || !toast.classList.contains('app-toast-success') || !toast.textContent.includes('Saved 3 changes to dbo.Alerts.')) {
    throw new Error(`A success toast naming the object and change count should appear after saving. Toast: ${toast?.textContent}`);
  }
  if (!toast.classList.contains('visible')) {
    throw new Error('The success toast should be visible immediately after it is added.');
  }
  if (!editorWindow.document.querySelector('.results-table')) {
    throw new Error('Saving should refresh the grid in place, not blank into a generic write-result view.');
  }
  if (editorWindow.document.getElementById('toggleEditResultsBtn').textContent !== 'Exit edit mode') {
    throw new Error('A saved, refreshed grid should stay in edit mode automatically.');
  }
  if (editorWindow.document.getElementById('pendingEditsSummary').textContent !== 'No unsaved changes') {
    throw new Error('Pending changes should be cleared once the refreshed grid loads after a save.');
  }
}

// Fallback row-matching for a table with no declared primary key or unique
// constraint (common on Fabric Warehouse, which does not enforce them): rows
// are matched by every visible column's original value instead, and each
// changed row must be verified unique in the table right before saving.
// Isolated in its own window for the same reason as editorWindow above.
{
  const noKeyWindow = await createWindow('http://127.0.0.1:3100/');
  noKeyWindow.document.getElementById('serverInput').value = 'demo';
  noKeyWindow.document.getElementById('databaseInput').value = 'meta_store';
  noKeyWindow.document.getElementById('serverInput').dispatchEvent(new noKeyWindow.Event('input', { bubbles: true }));
  noKeyWindow.document.getElementById('databaseInput').dispatchEvent(new noKeyWindow.Event('input', { bubbles: true }));
  const noKeyEditor = noKeyWindow.document.getElementById('queryEditor');

  noKeyEditor.value = 'SELECT * FROM dbo.LegacyImport';
  noKeyEditor.dispatchEvent(new noKeyWindow.Event('input', { bubbles: true }));
  noKeyWindow.document.getElementById('runQueryBtn').click();
  await flush();
  if (noKeyWindow.document.getElementById('toggleEditResultsBtn').classList.contains('hidden')) {
    throw new Error('A keyless table should still offer editing via the all-columns fallback.');
  }

  noKeyWindow.document.getElementById('toggleEditResultsBtn').click();
  await flush();
  if (noKeyWindow.document.getElementById('resultEditModeNote').classList.contains('hidden')) {
    throw new Error('The no-primary-key note should show while editing a keyless table.');
  }
  if (!noKeyWindow.document.getElementById('resultEditModeNote').textContent.includes('no primary key')) {
    throw new Error('The no-primary-key note should explain the fallback matching behavior.');
  }
  if (noKeyWindow.document.querySelector('.result-edit-key-marker')) {
    throw new Error('A keyless table has no declared key column, so no cell should show the read-only key marker.');
  }
  const payloadInputs = noKeyWindow.document.querySelectorAll('.result-edit-input[data-edit-column="Payload"]');
  if (payloadInputs.length !== 3) {
    throw new Error('Every column should be editable on a keyless table, including columns used for row matching.');
  }

  // Row 3 (ImportId=2, Payload='UNQ') is unique across every visible column —
  // editing and saving it should pass the uniqueness check and proceed
  // through the normal single-click confirm path, same as a real key.
  const uniqueRowInput = payloadInputs[2];
  uniqueRowInput.focus();
  uniqueRowInput.value = 'INLINE_EDIT_TEST';
  uniqueRowInput.dispatchEvent(new noKeyWindow.Event('input', { bubbles: true }));
  noKeyWindow.document.getElementById('saveResultEditsBtn').click();
  await flush();
  if (noKeyWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
    throw new Error('Saving a uniquely-identifiable row on a keyless table should pass the uniqueness check and open the confirmation modal.');
  }
  noKeyWindow.document.getElementById('confirmModalBtn').click();
  await flush();
  const noKeyToast = noKeyWindow.document.querySelector('#appToastContainer .app-toast');
  if (!noKeyToast || !noKeyToast.textContent.includes('Saved 1 change to dbo.LegacyImport.')) {
    throw new Error(`Saving the unique row on a keyless table should succeed and toast. Toast: ${noKeyToast?.textContent}`);
  }

  // Rows 1 and 2 (ImportId=1, Payload='DUP') are identical across every
  // visible column — the app cannot tell them apart, so editing either one
  // and saving must be refused by the uniqueness check rather than risk the
  // generated UPDATE silently touching both rows.
  const dupRowInput = noKeyWindow.document.querySelectorAll('.result-edit-input[data-edit-column="Payload"]')[0];
  dupRowInput.focus();
  dupRowInput.value = 'RENAMED';
  dupRowInput.dispatchEvent(new noKeyWindow.Event('input', { bubbles: true }));
  noKeyWindow.document.getElementById('saveResultEditsBtn').click();
  await flush();
  if (!noKeyWindow.document.getElementById('confirmModal').classList.contains('hidden')) {
    throw new Error('Saving an ambiguous (duplicate-content) row on a keyless table must not open the confirmation modal.');
  }
  if (!noKeyWindow.document.getElementById('statusText').textContent.includes('no longer match exactly one row')) {
    throw new Error(`Saving an ambiguous row should explain that it could not be uniquely matched. Status: ${noKeyWindow.document.getElementById('statusText').textContent}`);
  }
  if (!dupRowInput.classList.contains('result-edit-dirty')) {
    throw new Error('A blocked save should leave the staged edit in place so the user does not lose their change.');
  }
}

console.log('UI smoke test passed.');
process.exit(0);
