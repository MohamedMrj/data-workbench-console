import fs from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import { chromium } from 'playwright';
import { setTimeout as delay } from 'timers/promises';

let baseUrl = process.env.RESPONSIVE_AUDIT_BASE_URL || '';
const outDir = path.join(process.cwd(), 'responsive-audit');
const widths = [320, 360, 390, 430, 540, 700, 768, 900, 960, 1024, 1200, 1280, 1366, 1440, 1600, 1920];
const screenshotWidths = new Set([320, 390, 768, 960, 1200, 1600, 1920]);

const healthPayload = {
  ok: true,
  writePreviewLimit: 10,
  heightenedConfirmLimit: 3,
  responseRowLimit: 250,
  supportedSourceTypes: [
    { id: 'fabric-sql', label: 'Fabric SQL endpoint', authModes: ['servicePrincipal'], supportsProcedures: true },
    { id: 'fabric-lakehouse', label: 'Fabric Lakehouse SQL endpoint', authModes: ['servicePrincipal'], supportsProcedures: false },
    { id: 'sql-server', label: 'SQL Server', authModes: ['sqlLogin', 'servicePrincipal'], supportsProcedures: true }
  ],
  supportedAuthModes: [
    { id: 'servicePrincipal', label: 'Azure service principal' },
    { id: 'sqlLogin', label: 'SQL login' }
  ]
};

async function hasWorkbenchShell(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }
    const html = await response.text();
    return html.includes('app-shell') && html.includes('serverInput');
  } catch {
    return false;
  }
}

async function waitForWorkbench(url, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await hasWorkbenchShell(url)) {
      return;
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for a Data Workbench server at ${url}. Run npm run build before the responsive audit if no dev server is already running.`);
}

async function ensureServer() {
  if (baseUrl && await hasWorkbenchShell(baseUrl)) {
    return null;
  }

  const port = process.env.RESPONSIVE_AUDIT_PORT || '3210';
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) }
  });
  baseUrl = `http://127.0.0.1:${port}`;
  await waitForWorkbench(baseUrl);
  return child;
}

async function attachApiMocks(page) {
  await page.route('**/api/health', (route) => route.fulfill({ json: healthPayload }));

  await page.route('**/api/tables', (route) => route.fulfill({
    json: {
      success: true,
      objects: [
        {
          schema: 'dbo',
          name: 'VeryLongOperationalTelemetryFactTableNameForResponsiveAudit',
          fullName: 'dbo.VeryLongOperationalTelemetryFactTableNameForResponsiveAudit',
          objectType: 'table'
        },
        {
          schema: 'reporting',
          name: 'CompactView',
          fullName: 'reporting.CompactView',
          objectType: 'view'
        }
      ]
    }
  }));

  await page.route('**/api/columns', (route) => route.fulfill({
    json: {
      success: true,
      columns: [
        { name: 'ExtremelyLongBusinessIdentifierColumnNameForLayoutTesting', type: 'uniqueidentifier', nullable: false },
        { name: 'Status', type: 'varchar', nullable: true },
        { name: 'CreatedUtc', type: 'datetime2', nullable: false }
      ]
    }
  }));

  await page.route('**/api/query', (route) => route.fulfill({
    json: {
      success: true,
      columns: [
        'ExtremelyLongBusinessIdentifierColumnNameForLayoutTesting',
        'Status',
        'CreatedUtc',
        'VerboseJsonPayload'
      ],
      rows: Array.from({ length: 4 }, (_, index) => ({
        ExtremelyLongBusinessIdentifierColumnNameForLayoutTesting: `00000000-0000-0000-0000-00000000000${index}`,
        Status: index % 2 ? 'FAILED_NEEDS_REVIEW_WITH_LONG_LABEL' : null,
        CreatedUtc: '2026-06-01T10:00:00Z',
        VerboseJsonPayload: JSON.stringify({
          nested: {
            message: 'This is deliberately long text to test wrapping and table cell containment at narrow widths.'
          }
        })
      })),
      totalRows: 4,
      rowsAffected: 0,
      truncated: false
    }
  }));

  await page.route('**/api/procedures', async (route) => {
    const body = route.request().postDataJSON?.() || {};

    if (body.confirmToken) {
      await route.fulfill({
        json: {
          success: true,
          procedure: 'dbo.usp_RunResponsiveAuditWithLongName',
          columns: ['RunId', 'OutputMessage'],
          rows: [
            {
              RunId: 1,
              OutputMessage: 'Completed with a long output message that should wrap cleanly inside the results grid.'
            }
          ],
          totalRows: 1,
          rowsAffected: 1,
          output: { Message: 'OK' },
          returnValue: 0,
          message: 'Executed.'
        }
      });
      return;
    }

    if (body.procedure) {
      await route.fulfill({
        status: 428,
        json: {
          success: true,
          requiresConfirmation: true,
          confirmationToken: 'token',
          expectedText: 'RUN DBO.USP_RUNRESPONSIVEAUDITWITHLONGNAME',
          parameterCount: 2,
          message: 'Confirm procedure.'
        }
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        supported: true,
        procedures: [
          {
            schema: 'dbo',
            name: 'usp_RunResponsiveAuditWithLongName',
            fullName: 'dbo.usp_RunResponsiveAuditWithLongName'
          },
          {
            schema: 'ops',
            name: 'usp_Short',
            fullName: 'ops.usp_Short'
          }
        ]
      }
    });
  });

  await page.route('**/api/procedure-parameters', (route) => route.fulfill({
    json: {
      success: true,
      supported: true,
      procedure: 'dbo.usp_RunResponsiveAuditWithLongName',
      parameters: [
        {
          name: '@ReallyLongInputParameterNameForResponsiveAudit',
          cleanName: 'ReallyLongInputParameterNameForResponsiveAudit',
          mode: 'IN',
          dataType: 'varchar'
        },
        {
          name: '@OutputMessage',
          cleanName: 'OutputMessage',
          mode: 'OUT',
          dataType: 'nvarchar'
        }
      ]
    }
  }));

  await page.route('**/api/test-connection', (route) => route.fulfill({
    json: {
      success: true,
      message: 'Connection successful.',
      data: { database_name: 'meta_store', server_name: 'demo' }
    }
  }));

  await page.route('**/api/object-insights', (route) => route.fulfill({
    json: {
      success: true,
      action: 'profile',
      object: 'dbo.VeryLongOperationalTelemetryFactTableNameForResponsiveAudit',
      columns: ['column_name', 'data_type'],
      rows: [{ column_name: 'Status', data_type: 'varchar' }],
      totalRows: 1,
      output: {},
      message: 'Profiled object.'
    }
  }));

  await page.route('**/api/audit', (route) => route.fulfill({ json: { success: true, entries: [], limit: 25 } }));
}

async function populateSqlPage(page) {
  await page.fill('#serverInput', 'demo');
  await page.fill('#databaseInput', 'meta_store');
  await page.click('#loadTablesBtn');
  await page.waitForTimeout(250);
  await page.click('[data-object]');
  await page.waitForTimeout(250);
  await page.click('#toggleAdvancedOperationsBtn');
  await page.waitForTimeout(100);
  await page.click('#addFilterBtn');
  await page.click('#runQueryBtn');
  await page.waitForTimeout(300);
}

async function populateProcedurePage(page) {
  await page.fill('#serverInput', 'demo');
  await page.fill('#databaseInput', 'meta_store');
  await page.click('#loadTablesBtn');
  await page.waitForTimeout(250);
  await page.click('[data-procedure]');
  await page.waitForTimeout(300);
}

async function inspectViewport(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const shell = document.querySelector('.app-shell');
    const scrollContainerIds = new Set([
      'resultsPanel',
      'tableList',
      'procedureList',
      'queryHistory',
      'savedConnections',
      'columnsPanel'
    ]);
    const problems = [];
    const visibleElements = [...document.querySelectorAll('body *')].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 1 &&
        rect.height > 1 &&
        rect.bottom > 0 &&
        rect.top < viewportHeight;
    });

    for (const element of visibleElements) {
      if (element.closest('.shell-backdrop')) {
        continue;
      }
      if (element.closest('.hidden')) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const insideManagedScroller = [...scrollContainerIds].some((id) => element.closest(`#${id}`));
      if (!insideManagedScroller && (rect.left < -1 || rect.right > viewportWidth + 1)) {
        problems.push({
          type: 'offscreen',
          tag: element.tagName,
          id: element.id,
          className: String(element.className || ''),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          text: element.textContent.trim().slice(0, 80)
        });
      }

      const shouldFitOwnBox = element.matches('button, a, input, select, textarea') ||
        element.classList.contains('builder-panel') ||
        element.classList.contains('param-card');
      if (shouldFitOwnBox && !insideManagedScroller && element.scrollWidth > element.clientWidth + 3) {
        problems.push({
          type: 'own-overflow',
          tag: element.tagName,
          id: element.id,
          className: String(element.className || ''),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          text: element.textContent.trim().slice(0, 80)
        });
      }
    }

    const builder = document.querySelector('.builder-primary-grid');
    const operationPanel = document.querySelector('.builder-panel-operation');
    const columnsPanel = document.querySelector('.builder-panel-columns');
    const advancedContent = document.querySelector('#advancedOperationsContent');
    if (builder && operationPanel && columnsPanel && advancedContent && !advancedContent.classList.contains('hidden')) {
      const builderRect = builder.getBoundingClientRect();
      const operationRect = operationPanel.getBoundingClientRect();
      const columnsRect = columnsPanel.getBoundingClientRect();
      const advancedRect = advancedContent.getBoundingClientRect();
      const advancedPanels = [...advancedContent.querySelectorAll('.builder-panel')]
        .map((panel) => ({ panel, rect: panel.getBoundingClientRect() }));
      const collapsedAdvancedPanel = advancedPanels.find(({ rect }) =>
        rect.width < Math.min(280, advancedRect.width - 2)
      );

      if (
        Math.abs(operationRect.left - columnsRect.left) > 2 ||
        columnsRect.top < operationRect.bottom - 2 ||
        operationRect.width < Math.min(300, builderRect.width - 2) ||
        advancedRect.width < Math.min(220, builderRect.width - 2) ||
        collapsedAdvancedPanel
      ) {
        problems.push({
          type: 'advanced-builder-collapsed',
          builder: {
            left: Math.round(builderRect.left),
            right: Math.round(builderRect.right),
            width: Math.round(builderRect.width)
          },
          operation: {
            left: Math.round(operationRect.left),
            top: Math.round(operationRect.top),
            right: Math.round(operationRect.right),
            bottom: Math.round(operationRect.bottom),
            width: Math.round(operationRect.width)
          },
          columns: {
            left: Math.round(columnsRect.left),
            top: Math.round(columnsRect.top),
            right: Math.round(columnsRect.right),
            bottom: Math.round(columnsRect.bottom),
            width: Math.round(columnsRect.width)
          },
          advanced: {
            left: Math.round(advancedRect.left),
            right: Math.round(advancedRect.right),
            width: Math.round(advancedRect.width)
          },
          advancedPanels: advancedPanels.map(({ panel, rect }) => ({
            className: String(panel.className || ''),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width)
          }))
        });
      }
    }

    return {
      route: location.pathname,
      width: viewportWidth,
      layoutMode: shell?.dataset.layoutMode || '',
      workspaceMode: shell?.dataset.workspaceMode || '',
      studioMode: shell?.dataset.studioMode || '',
      procedureLayoutMode: shell?.dataset.procedureLayoutMode || '',
      documentOverflow: document.documentElement.scrollWidth - viewportWidth,
      problems
    };
  });
}

async function runCase(browser, routePath, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await attachApiMocks(page);
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'networkidle' });

  if (routePath === '/') {
    await populateSqlPage(page);
  } else {
    await populateProcedurePage(page);
  }

  const result = await inspectViewport(page);
  if (screenshotWidths.has(width)) {
    const name = routePath === '/' ? 'sql' : 'procedures';
    await page.screenshot({ path: path.join(outDir, `${name}-${width}.png`), fullPage: false });
  }
  await page.close();
  return result;
}

await fs.mkdir(outDir, { recursive: true });

const serverProcess = await ensureServer();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of widths) {
    results.push(await runCase(browser, '/', width));
    results.push(await runCase(browser, '/procedures', width));
  }
} finally {
  await browser.close();
  serverProcess?.kill();
}

const failing = results.filter((result) => result.problems.length);
await fs.writeFile(path.join(outDir, 'responsive-audit.json'), JSON.stringify(results, null, 2));

if (failing.length) {
  console.error(JSON.stringify(failing, null, 2));
  throw new Error(`Responsive audit failed for ${failing.length} viewport(s). See ${path.join(outDir, 'responsive-audit.json')}.`);
}

console.log(`Responsive audit passed for ${results.length} populated viewport checks. Screenshots: ${outDir}`);
