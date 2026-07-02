import fs from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import { chromium } from 'playwright';
import { setTimeout as delay } from 'timers/promises';

let baseUrl = process.env.RESPONSIVE_AUDIT_BASE_URL || '';
const outDir = path.join(process.cwd(), 'responsive-audit');
const widths = [320, 360, 390, 430, 540, 700, 768, 900, 960, 1024, 1200, 1280, 1366, 1440, 1600, 1920];
const screenshotWidths = new Set([320, 390, 768, 960, 1200, 1600, 1920]);
const themes = ['midnight', 'harbor', 'forge', 'field', 'ink', 'paper'];

const healthPayload = {
  ok: true,
  writePreviewLimit: 10,
  heightenedConfirmLimit: 3,
  responseRowLimit: 250,
  sidePanels: {
    autoHideEnabled: true,
    idleMs: 10000,
    fadeMs: 800
  },
  appearance: {
    ambientMotionEnabled: true,
    ambientMotionDurationMs: 90000,
    tooltipsEnabled: true,
    tooltipDelayMs: 650
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
      if (element.closest('.control-rail') && shell?.classList.contains('control-rail-collapsed')) {
        continue;
      }
      if (element.closest('.activity-panel') && shell?.classList.contains('activity-panel-collapsed')) {
        continue;
      }

      if (element.matches('.table-item, .procedure-item, .pin-toggle') && element.hasAttribute('title')) {
        problems.push({
          type: 'native-tooltip-title',
          tag: element.tagName,
          id: element.id,
          className: String(element.className || ''),
          text: element.textContent.trim().slice(0, 80)
        });
      }

      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
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

      const nativeSmallControl = element.matches('input[type="checkbox"], input[type="radio"]');
      const implementationBackedControl = element.id === 'queryEditor';
      const interactive = element.closest('.app-shell') &&
        element.matches('button, a, input, select, textarea') &&
        !nativeSmallControl &&
        !implementationBackedControl;
      const exemptTextControl = element.classList.contains('text-btn');
      if (interactive && !insideManagedScroller && !exemptTextControl) {
        const borderWidth = Number.parseFloat(style.borderTopWidth || '0') || 0;
        const visualHeight = Math.max(
          rect.height,
          Number.parseFloat(style.minHeight || '0') || 0,
          (Number.parseFloat(style.paddingTop || '0') || 0) +
            (Number.parseFloat(style.paddingBottom || '0') || 0) +
            (Number.parseFloat(style.fontSize || '16') || 16)
        );
        const disabled = element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
        if (!disabled && borderWidth < 1) {
          problems.push({
            type: 'weak-affordance-border',
            tag: element.tagName,
            id: element.id,
            className: String(element.className || ''),
            text: element.textContent.trim().slice(0, 80)
          });
        }
        if (!disabled && visualHeight < 30) {
          problems.push({
            type: 'weak-affordance-size',
            tag: element.tagName,
            id: element.id,
            className: String(element.className || ''),
            height: Math.round(visualHeight),
            text: element.textContent.trim().slice(0, 80)
          });
        }
      }

      if (element.classList.contains('active') && interactive) {
        const borderColor = style.borderTopColor || '';
        const background = style.backgroundColor || style.backgroundImage || '';
        if ((!borderColor || borderColor === 'rgba(0, 0, 0, 0)') && (!background || background === 'rgba(0, 0, 0, 0)' || background === 'none')) {
          problems.push({
            type: 'weak-active-state',
            tag: element.tagName,
            id: element.id,
            className: String(element.className || ''),
            text: element.textContent.trim().slice(0, 80)
          });
        }
      }
    }

    const controlRail = document.querySelector('.control-rail');
    const controlRailVisible = controlRail &&
      !shell?.classList.contains('control-rail-collapsed') &&
      getComputedStyle(controlRail).display !== 'none';
    if (controlRailVisible) {
      const connectionTitle = document.querySelector('.connection-section .section-title-row')?.getBoundingClientRect();
      const firstConnectionField = document.querySelector('.connection-section .conn-field-group')?.getBoundingClientRect();
      const savedTitle = document.querySelector('.control-rail .grow-section > .section-title-row')?.getBoundingClientRect();
      const savedList = document.querySelector('#savedConnections')?.getBoundingClientRect();
      const connectionGap = connectionTitle && firstConnectionField ? firstConnectionField.top - connectionTitle.bottom : 0;
      const savedGap = savedTitle && savedList ? savedList.top - savedTitle.bottom : 0;

      if (connectionGap > 28) {
        problems.push({
          type: 'control-rail-connection-gap',
          gap: Math.round(connectionGap),
          titleBottom: Math.round(connectionTitle.bottom),
          firstFieldTop: Math.round(firstConnectionField.top)
        });
      }

      if (savedGap > 28 || (savedTitle && savedTitle.height > 96)) {
        problems.push({
          type: 'control-rail-saved-profiles-gap',
          gap: Math.round(savedGap),
          titleHeight: Math.round(savedTitle?.height || 0),
          titleBottom: Math.round(savedTitle?.bottom || 0),
          listTop: Math.round(savedList?.top || 0)
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

async function inspectFocusAffordance(page) {
  return page.evaluate(() => {
    const problems = [];
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
    };

    const serverInput = document.querySelector('#serverInput');
    if (visible(serverInput)) {
      serverInput.focus();
      const style = getComputedStyle(serverInput);
      if (!style.boxShadow || style.boxShadow === 'none') {
        problems.push({ type: 'missing-focus-affordance', id: 'serverInput' });
      }
    }

    const queryEditor = document.querySelector('#queryEditor');
    const editorContainer = document.querySelector('#editorContainer');
    if (visible(queryEditor) && visible(editorContainer)) {
      queryEditor.focus();
      const style = getComputedStyle(editorContainer);
      if (!style.boxShadow || style.boxShadow === 'none') {
        problems.push({ type: 'missing-focus-affordance', id: 'editorContainer' });
      }
    }

    return problems;
  });
}

async function inspectHoverStability(page) {
  const problems = [];
  const controls = page.locator('.toggle-field.compact-toggle');
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (!await control.isVisible().catch(() => false)) {
      continue;
    }
    const before = await control.boundingBox();
    const label = await control.textContent().catch(() => '');
    await control.hover();
    await page.waitForTimeout(80);
    const during = await control.boundingBox();
    await page.mouse.move(1, 1);
    await page.waitForTimeout(80);
    const after = await control.boundingBox();
    if (!before || !during || !after) {
      continue;
    }
    const maxWidthDelta = Math.max(Math.abs(before.width - during.width), Math.abs(before.width - after.width));
    const maxHeightDelta = Math.max(Math.abs(before.height - during.height), Math.abs(before.height - after.height));
    if (maxWidthDelta > 0.75 || maxHeightDelta > 0.75) {
      problems.push({
        type: 'hover-size-instability',
        text: String(label || '').trim(),
        before: { width: Math.round(before.width), height: Math.round(before.height) },
        during: { width: Math.round(during.width), height: Math.round(during.height) },
        after: { width: Math.round(after.width), height: Math.round(after.height) }
      });
    }
  }
  return problems;
}

async function runCase(browser, routePath, width, options = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await attachApiMocks(page);
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'networkidle' });

  if (options.theme) {
    await page.locator(`[data-theme="${options.theme}"]`).click().catch(async () => {
      await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), options.theme);
    });
  }

  if (routePath === '/') {
    await populateSqlPage(page);
  } else if (routePath === '/procedures') {
    await populateProcedurePage(page);
  }

  if (options.controlRailWidth) {
    await page.evaluate((width) => {
      document.querySelector('.app-shell')?.style.setProperty('--control-rail-width', `${width}px`);
    }, options.controlRailWidth);
    await page.waitForTimeout(100);
  }

  if (options.hidePanels) {
    await page.locator('#toggleControlRailBtn').click().catch(() => {});
    await page.locator('#toggleActivityPanelBtn').click().catch(() => {});
    await page.waitForTimeout(150);
  }

  const result = await inspectViewport(page);
  result.problems.push(...await inspectFocusAffordance(page));
  result.problems.push(...await inspectHoverStability(page));
  if (screenshotWidths.has(width) || options.screenshot) {
    const routeName = routePath === '/' ? 'sql' : routePath.replace(/^\/|\/$/g, '').replace(/\//g, '-');
    const suffix = [
      routeName,
      options.theme || '',
      options.hidePanels ? 'panels-hidden' : '',
      width
    ].filter(Boolean).join('-');
    await page.screenshot({ path: path.join(outDir, `${suffix}.png`), fullPage: false });
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

  for (const theme of themes) {
    results.push(await runCase(browser, '/', 1200, { theme, screenshot: true }));
  }

  results.push(await runCase(browser, '/', 1920, { controlRailWidth: 420, screenshot: true }));

  for (const routePath of ['/', '/procedures']) {
    results.push(await runCase(browser, routePath, 1200, { hidePanels: true, screenshot: true }));
  }

  for (const routePath of ['/docs/sql-studio', '/docs/procedure-runner']) {
    for (const width of [390, 1200]) {
      results.push(await runCase(browser, routePath, width, { screenshot: true }));
    }
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
