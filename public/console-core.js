window.createConsoleApp = function createConsoleApp() {
  const HISTORY_KEY = 'dataWorkbenchConnectionsV2';
  const LEGACY_HISTORY_KEYS = ['dataWorkbenchConnectionsV0', 'dataWorkbenchConnections', 'savedConnections'];
  const QUERY_HISTORY_KEY = 'dataWorkbenchQueryHistoryV3';
  const PROCEDURE_HISTORY_KEY = 'dataWorkbenchProcedureHistoryV1';
  const THEME_KEY = 'dataWorkbenchThemeV2';
  const EDITOR_TEXT_SIZE_KEY = 'dataWorkbenchEditorTextSizeV1';
  const RESULTS_TEXT_SIZE_KEY = 'dataWorkbenchResultsTextSizeV1';
  const ACTIVE_CONNECTION_KEY = 'dataWorkbenchActiveConnectionV1';
  const CATALOG_STATE_KEY = 'dataWorkbenchCatalogStateV1';
  const WORKSPACE_STATE_KEY = 'dataWorkbenchWorkspaceStateV1';
  const PANEL_LAYOUT_KEY = 'dataWorkbenchPanelLayoutV1';
  const SIDE_PANEL_VISIBILITY_KEY = 'dataWorkbenchSidePanelVisibilityV1';
  const ADVANCED_OPERATIONS_VISIBILITY_KEY = 'dataWorkbenchAdvancedOperationsVisibleV1';
  const LIFECYCLE_SESSION_KEY = 'dataWorkbenchLifecycleSessionV1';
  const PINNED_OBJECTS_KEY = 'dataWorkbenchPinnedObjectsV1';
  const RECENT_OBJECTS_KEY = 'dataWorkbenchRecentObjectsV1';
  const SCRATCHPADS_KEY = 'dataWorkbenchScratchpadsV1';
  const SUPPORT_EMAIL = 'mohamed.al-mefrej@hotmail.com';
  const RESULT_TABS_MAX = 5;
  const LIFECYCLE_HEARTBEAT_MS = 10_000;
  const SIDE_PANEL_IDLE_MS = Math.max(0, Number(window.__dataWorkbenchTestConfig?.sidePanelIdleMs ?? 10_000));
  const SIDE_PANEL_FADE_MS = Math.max(0, Number(window.__dataWorkbenchTestConfig?.sidePanelFadeMs ?? 800));
  const THEMES = ['midnight', 'harbor', 'forge', 'field', 'ink', 'paper'];
  const CONNECTION_HISTORY_MAX = 12;
  const QUERY_HISTORY_MAX = 20;
  const QUERY_HISTORY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
  const DEFAULT_PANEL_LAYOUT = {
    controlRail: 340,
    explorer: 300,
    activity: 320,
    results: 300,
    builder: 420,
    procedure: 360
  };
  const PANEL_LIMITS = {
    controlRail: { min: 300, max: 460 },
    explorer: { min: 240, max: 720 },
    activity: { min: 260, max: 420 },
    results: { min: 140, max: 460 },
    builder: { min: 320, max: 760 },
    procedure: { min: 320, max: 640 }
  };
  const MIN_STUDIO_SPACE_WITH_EXPLORER = 720;
  const MIN_STUDIO_SPACE_WITH_ACTIVITY = 820;
  const WORKSPACE_WIDE_FIXED_SPACE = 104;
  const WORKSPACE_COMPRESSED_FIXED_SPACE = 52;
  const FALLBACK_SOURCES = [
    { id: 'fabric-sql', label: 'Fabric SQL endpoint', authModes: ['servicePrincipal'], supportsProcedures: true },
    { id: 'fabric-lakehouse', label: 'Fabric Lakehouse SQL endpoint', authModes: ['servicePrincipal'], supportsProcedures: false },
    { id: 'sql-server', label: 'SQL Server', authModes: ['sqlLogin', 'servicePrincipal'], supportsProcedures: true }
  ];
  const FALLBACK_AUTH = [
    { id: 'servicePrincipal', label: 'Azure service principal' },
    { id: 'sqlLogin', label: 'SQL login' }
  ];
  const DEFAULT_QUERY = `-- Connect to a source and load the catalog to get started.\n-- Select a table or view from the explorer to generate SQL automatically.\n-- You can also write or paste SQL directly here.\nSELECT TOP 100 *\nFROM dbo.YourTableName;`;
  const SNIPPETS = {};
  const SQL_HELPER_LABELS = {
    concat: 'CONCAT',
    replace: 'REPLACE',
    trim: 'TRIM',
    cast: 'CAST',
    tryConvert: 'TRY_CONVERT',
    coalesce: 'COALESCE',
    nullif: 'NULLIF blank',
    caseWhen: 'CASE',
    dateadd: 'DATEADD',
    datediff: 'DATEDIFF',
    sha2Key: 'SHA2 key'
  };

  const state = {
    health: null,
    versionInfo: null,
    currentTheme: 'midnight',
    editorTextSize: 0.95,
    resultsTextSize: 0.9,
    queryMode: 'select',
    workspace: 'sql',
    explorer: 'objects',
    connectionHistory: [],
    queryHistory: [],
    procedureHistory: [],
    objects: [],
    filteredObjects: [],
    procedures: [],
    filteredProcedures: [],
    procedureNote: '',
    activeObject: null,
    activeObjectType: '',
    activeColumns: [],
    selectedColumns: new Set(),
    activeProcedure: null,
    procedureParameters: [],
    procedureValues: {},
    pinnedItems: {},
    recentItems: {},
    objectColumnIndex: {},
    auditFilters: {},
    resultTabs: [],
    activeResultTabId: '',
    editorAdapter: null,
    pendingAction: null,
    lastFocusedElement: null,
    connectionTest: null,
    advancedOperationsVisible: false,
    sidePanels: {
      controlRailCollapsed: false,
      activityPanelCollapsed: false
    },
    sidePanelIdleTimers: {
      controlRail: null,
      activity: null
    },
    sidePanelFadeTimers: {
      controlRail: null,
      activity: null
    },
    results: {
      columns: [],
      rows: [],
      output: {},
      returnValue: null,
      rowsAffected: 0,
      totalRows: 0,
      truncated: false,
      page: 1,
      pageSize: 50,
      columnWidths: {},
      expandedCells: {},
      sortColumn: '',
      sortDirection: 'asc',
      visualKind: '',
      visualObject: ''
    },
    confirmCountdownTimer: null,
    lifecycle: {
      sessionId: '',
      heartbeatTimer: null,
      exitRequested: false
    },
    historyFilter: ''
  };

  function defaultResultsState() {
    return {
      columns: [],
      rows: [],
      output: {},
      returnValue: null,
      rowsAffected: 0,
      totalRows: 0,
      truncated: false,
      page: 1,
      pageSize: 50,
      columnWidths: {},
      expandedCells: {},
      sortColumn: '',
      sortDirection: 'asc',
      localFilter: '',
      visualKind: '',
      visualObject: ''
    };
  }

  function createResultTab(title = 'Results', results = defaultResultsState(), options = {}) {
    const tabId = options.id || `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      id: tabId,
      key: options.key || tabId,
      title: String(title || 'Results').slice(0, 48),
      workspace: state.workspace || 'sql',
      createdAt: new Date().toISOString(),
      results: normalizeResultsSnapshot(results)
    };
  }

  function syncActiveResultsToTab() {
    if (!state.activeResultTabId) {
      return;
    }
    const tab = state.resultTabs.find((item) => item.id === state.activeResultTabId);
    if (tab) {
      tab.results = normalizeResultsSnapshot(state.results);
    }
  }

  function activateResultTab(tabId) {
    syncActiveResultsToTab();
    const tab = state.resultTabs.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }
    state.activeResultTabId = tab.id;
    state.results = normalizeResultsSnapshot(tab.results);
    renderResultTabs();
    renderResults();
    persistWorkspaceState(state.workspace);
  }

  function closeResultTab(tabId) {
    const index = state.resultTabs.findIndex((item) => item.id === tabId);
    if (index < 0) {
      return;
    }
    state.resultTabs.splice(index, 1);
    if (state.activeResultTabId === tabId) {
      const next = state.resultTabs[Math.max(0, index - 1)] || state.resultTabs[0];
      state.activeResultTabId = next?.id || '';
      state.results = next ? normalizeResultsSnapshot(next.results) : defaultResultsState();
    }
    renderResultTabs();
    renderResults();
    persistWorkspaceState(state.workspace);
  }

  function upsertResultTab(title, results, options = {}) {
    syncActiveResultsToTab();
    const reusable = options.key
      ? state.resultTabs.find((item) => item.key === options.key && item.workspace === (state.workspace || 'sql'))
      : null;
    const tab = reusable || createResultTab(title, results, options);
    tab.title = String(title || tab.title || 'Results').slice(0, 48);
    tab.results = normalizeResultsSnapshot(results);
    tab.createdAt = new Date().toISOString();
    if (!reusable) {
      state.resultTabs.unshift(tab);
    }
    state.activeResultTabId = tab.id;
    while (state.resultTabs.length > RESULT_TABS_MAX) {
      const removed = state.resultTabs.pop();
      if (removed?.id === state.activeResultTabId) {
        state.activeResultTabId = state.resultTabs[0]?.id || '';
      }
    }
    renderResultTabs();
  }

  function renderResultTabs() {
    const container = $('resultTabs');
    if (!container) {
      return;
    }
    if (!state.resultTabs.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = state.resultTabs.map((tab) => (
      `<button class="result-tab${tab.id === state.activeResultTabId ? ' active' : ''}" data-result-tab="${esc(tab.id)}" type="button" title="${esc(tab.title)}"><strong>${esc(tab.title)}</strong><span>${esc(formatTimestamp(tab.createdAt).replace(/ UTC$/, ''))}</span><i data-close-result-tab="${esc(tab.id)}" title="Close tab">×</i></button>`
    )).join('');
    container.querySelectorAll('[data-result-tab]').forEach((button) => {
      button.onclick = (event) => {
        if (event.target?.matches?.('[data-close-result-tab]')) {
          return;
        }
        activateResultTab(button.dataset.resultTab);
      };
    });
    container.querySelectorAll('[data-close-result-tab]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        closeResultTab(button.dataset.closeResultTab);
      };
    });
  }

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const safeGet = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const safeSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  const safeSessionGet = (key) => {
    try { return sessionStorage.getItem(key); } catch { return null; }
  };
  const safeSessionSet = (key, value) => {
    try { sessionStorage.setItem(key, value); } catch {}
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const debounce = (fn, wait = 120) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  };
  const utcFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
    timeZoneName: 'short'
  });
  let panelLayout = { ...DEFAULT_PANEL_LAYOUT };

  function loadPanelLayout() {
    try {
      const saved = JSON.parse(safeGet(PANEL_LAYOUT_KEY) || 'null');
      if (!saved || typeof saved !== 'object') {
        panelLayout = { ...DEFAULT_PANEL_LAYOUT };
        return;
      }
      panelLayout = {
        controlRail: Number(saved.controlRail) || DEFAULT_PANEL_LAYOUT.controlRail,
        explorer: Number(saved.explorer) || DEFAULT_PANEL_LAYOUT.explorer,
        activity: Number(saved.activity) || DEFAULT_PANEL_LAYOUT.activity,
        results: Number(saved.results) || DEFAULT_PANEL_LAYOUT.results,
        builder: Number(saved.builder) || DEFAULT_PANEL_LAYOUT.builder,
        procedure: Number(saved.procedure) || DEFAULT_PANEL_LAYOUT.procedure
      };
    } catch {
      panelLayout = { ...DEFAULT_PANEL_LAYOUT };
    }
  }

  function loadAdvancedOperationsVisibility() {
    state.advancedOperationsVisible = safeGet(ADVANCED_OPERATIONS_VISIBILITY_KEY) === 'true';
  }

  function loadTextPreferences() {
    state.editorTextSize = clamp(Number(safeGet(EDITOR_TEXT_SIZE_KEY)) || 0.95, 0.8, 1.35);
    state.resultsTextSize = clamp(Number(safeGet(RESULTS_TEXT_SIZE_KEY)) || 0.9, 0.78, 1.25);
  }

  function scopedStorageKey(baseKey) {
    return `${baseKey}:${connectionSignature() || 'no-connection'}`;
  }

  function loadPinnedAndRecentItems() {
    try {
      state.pinnedItems = JSON.parse(safeGet(scopedStorageKey(PINNED_OBJECTS_KEY)) || '{}') || {};
    } catch {
      state.pinnedItems = {};
    }
    try {
      state.recentItems = JSON.parse(safeGet(scopedStorageKey(RECENT_OBJECTS_KEY)) || '{}') || {};
    } catch {
      state.recentItems = {};
    }
  }

  function savePinnedAndRecentItems() {
    safeSet(scopedStorageKey(PINNED_OBJECTS_KEY), JSON.stringify(state.pinnedItems || {}));
    safeSet(scopedStorageKey(RECENT_OBJECTS_KEY), JSON.stringify(state.recentItems || {}));
  }

  function applyTextPreferences() {
    const shell = document.querySelector('.app-shell');
    if (!shell) {
      return;
    }
    shell.style.setProperty('--sql-editor-font-size', `${state.editorTextSize}rem`);
    shell.style.setProperty('--results-font-size', `${state.resultsTextSize}rem`);
  }

  function changeEditorTextSize(delta) {
    state.editorTextSize = clamp(Math.round((state.editorTextSize + delta) * 100) / 100, 0.8, 1.35);
    safeSet(EDITOR_TEXT_SIZE_KEY, String(state.editorTextSize));
    applyTextPreferences();
    setStatus('success', `SQL editor text size set to ${state.editorTextSize.toFixed(2)}rem.`);
  }

  function changeResultsTextSize(delta) {
    state.resultsTextSize = clamp(Math.round((state.resultsTextSize + delta) * 100) / 100, 0.78, 1.25);
    safeSet(RESULTS_TEXT_SIZE_KEY, String(state.resultsTextSize));
    applyTextPreferences();
    setStatus('success', `Results text size set to ${state.resultsTextSize.toFixed(2)}rem.`);
  }

  function loadSidePanelVisibility() {
    try {
      const saved = JSON.parse(safeGet(SIDE_PANEL_VISIBILITY_KEY) || 'null');
      state.sidePanels.controlRailCollapsed = Boolean(saved?.controlRailCollapsed);
      state.sidePanels.activityPanelCollapsed = Boolean(saved?.activityPanelCollapsed);
    } catch {
      state.sidePanels.controlRailCollapsed = false;
      state.sidePanels.activityPanelCollapsed = false;
    }
  }

  function saveAdvancedOperationsVisibility() {
    safeSet(ADVANCED_OPERATIONS_VISIBILITY_KEY, state.advancedOperationsVisible ? 'true' : 'false');
  }

  function saveSidePanelVisibility() {
    safeSet(SIDE_PANEL_VISIBILITY_KEY, JSON.stringify(state.sidePanels));
  }

  function savePanelLayout() {
    safeSet(PANEL_LAYOUT_KEY, JSON.stringify(panelLayout));
  }

  function getViewportMetrics() {
    const visualViewport = window.visualViewport;
    const width = visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
    const height = visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
    return {
      width,
      height,
      scale: visualViewport?.scale || 1
    };
  }

  function getViewportWidth() {
    return getViewportMetrics().width;
  }

  function getShellWidth() {
    return document.querySelector('.app-shell')?.clientWidth || getViewportWidth();
  }

  function getWorkspaceWidth() {
    return document.querySelector('.workspace-shell')?.clientWidth || getViewportWidth();
  }

  function getWorkspaceGridWidth() {
    return document.querySelector('.workspace-grid')?.clientWidth || getWorkspaceWidth();
  }

  function getStudioWidth() {
    return document.querySelector('.studio-stack')?.clientWidth || getWorkspaceWidth();
  }

  function getSqlWorkspaceWidth() {
    return document.querySelector('#sqlWorkspace:not(.hidden)')?.clientWidth || getStudioWidth();
  }

  function getProcedureStudioWidth() {
    return document.querySelector('.procedure-studio-grid')?.clientWidth || getStudioWidth();
  }

  function getExplorerMaxWidth() {
    const workspaceWidth = getWorkspaceGridWidth();
    if (!workspaceWidth) {
      return 420;
    }

    const availableAfterStudio = workspaceWidth - MIN_STUDIO_SPACE_WITH_EXPLORER - 72;
    const viewportCap = Math.floor(workspaceWidth * (state.sidePanels.activityPanelCollapsed ? 0.52 : 0.46));
    return Math.max(300, Math.min(PANEL_LIMITS.explorer.max, viewportCap, availableAfterStudio));
  }

  function getEffectivePanelWidths() {
    return {
      controlRail: clamp(panelLayout.controlRail || DEFAULT_PANEL_LAYOUT.controlRail, PANEL_LIMITS.controlRail.min, PANEL_LIMITS.controlRail.max),
      explorer: clamp(panelLayout.explorer || DEFAULT_PANEL_LAYOUT.explorer, PANEL_LIMITS.explorer.min, getExplorerMaxWidth()),
      activity: clamp(panelLayout.activity || DEFAULT_PANEL_LAYOUT.activity, PANEL_LIMITS.activity.min, PANEL_LIMITS.activity.max),
      builder: clamp(panelLayout.builder || DEFAULT_PANEL_LAYOUT.builder, PANEL_LIMITS.builder.min, PANEL_LIMITS.builder.max),
      procedure: clamp(panelLayout.procedure || DEFAULT_PANEL_LAYOUT.procedure, PANEL_LIMITS.procedure.min, PANEL_LIMITS.procedure.max)
    };
  }

  function getLayoutMode() {
    const viewport = getViewportMetrics();
    const shellWidth = getShellWidth();
    const workspaceWidth = getWorkspaceGridWidth();
    const studioWidth = getSqlWorkspaceWidth();
    const widths = getEffectivePanelWidths();
    const controlRailDelta = state.sidePanels.controlRailCollapsed ? 0 : Math.max(0, widths.controlRail - DEFAULT_PANEL_LAYOUT.controlRail);
    const activityDelta = state.sidePanels.activityPanelCollapsed ? 0 : Math.max(0, widths.activity - DEFAULT_PANEL_LAYOUT.activity);
    const builderDelta = Math.max(0, widths.builder - DEFAULT_PANEL_LAYOUT.builder);
    const shellStackThreshold = Math.max(900, 820 + controlRailDelta);
    const workspaceStackThreshold = 1180;
    const workspaceWideThreshold = 1500 + activityDelta;
    const studioWideThreshold = 1360 + builderDelta;
    const studioSpaceWithActivity = workspaceWidth - widths.explorer - (state.sidePanels.activityPanelCollapsed ? 0 : widths.activity) - WORKSPACE_WIDE_FIXED_SPACE;
    const studioSpaceCompressed = workspaceWidth - widths.explorer - WORKSPACE_COMPRESSED_FIXED_SPACE;
    const workspaceMode = workspaceWidth <= workspaceStackThreshold || studioSpaceCompressed < MIN_STUDIO_SPACE_WITH_EXPLORER
      ? 'stacked'
      : workspaceWidth <= workspaceWideThreshold || (!state.sidePanels.activityPanelCollapsed && studioSpaceWithActivity < MIN_STUDIO_SPACE_WITH_ACTIVITY)
        ? 'compressed'
        : 'wide';
    const estimatedStudioWidth = workspaceMode === 'wide'
      ? studioSpaceWithActivity
      : workspaceMode === 'compressed'
        ? studioSpaceCompressed
        : workspaceWidth;

    return {
      viewportWidth: viewport.width,
      viewportScale: viewport.scale,
      shellMode: shellWidth <= shellStackThreshold || viewport.width <= 900 ? 'stacked' : 'split',
      workspaceMode,
      studioMode: studioWidth <= studioWideThreshold || estimatedStudioWidth <= studioWideThreshold || workspaceMode !== 'wide' ? 'stacked' : 'wide'
    };
  }

  function normalizePanelLayoutForViewport() {
    const layoutMode = getLayoutMode();
    const shellWidth = getShellWidth();
    const workspaceWidth = getWorkspaceGridWidth();
    const studioWidth = getSqlWorkspaceWidth();
    const procedureStudioWidth = getProcedureStudioWidth();
    const shellWide = layoutMode.shellMode !== 'stacked';
    const workspaceWide = layoutMode.workspaceMode === 'wide';
    const workspaceCompressed = layoutMode.workspaceMode === 'compressed';
    const studioWide = layoutMode.studioMode === 'wide';

    if (!shellWide) {
      panelLayout.controlRail = DEFAULT_PANEL_LAYOUT.controlRail;
    } else {
      const maxControlRail = Math.max(320, Math.min(PANEL_LIMITS.controlRail.max, Math.floor(shellWidth * 0.34)));
      panelLayout.controlRail = clamp(panelLayout.controlRail, PANEL_LIMITS.controlRail.min, maxControlRail);
    }

    if (!workspaceWide && !workspaceCompressed) {
      panelLayout.explorer = DEFAULT_PANEL_LAYOUT.explorer;
      panelLayout.activity = DEFAULT_PANEL_LAYOUT.activity;
      panelLayout.builder = DEFAULT_PANEL_LAYOUT.builder;
      panelLayout.procedure = DEFAULT_PANEL_LAYOUT.procedure;
    } else {
      const maxExplorer = getExplorerMaxWidth();
      const maxActivity = Math.max(280, Math.min(PANEL_LIMITS.activity.max, Math.floor(workspaceWidth * 0.3)));
      const maxBuilder = Math.max(360, Math.min(PANEL_LIMITS.builder.max, Math.floor(studioWidth * (studioWide ? 0.58 : 0.5))));
      const maxProcedure = Math.max(360, Math.min(PANEL_LIMITS.procedure.max, Math.floor(procedureStudioWidth * 0.42)));

      panelLayout.explorer = clamp(panelLayout.explorer, PANEL_LIMITS.explorer.min, maxExplorer);
      panelLayout.activity = clamp(panelLayout.activity, PANEL_LIMITS.activity.min, maxActivity);
      panelLayout.builder = clamp(panelLayout.builder, PANEL_LIMITS.builder.min, maxBuilder);
      panelLayout.procedure = clamp(panelLayout.procedure, PANEL_LIMITS.procedure.min, maxProcedure);
    }

    if (layoutMode.shellMode === 'stacked') {
      panelLayout.results = DEFAULT_PANEL_LAYOUT.results;
    } else if (!state.results.columns.length && !state.results.rowsAffected && !Object.keys(state.results.output || {}).length && state.results.returnValue == null) {
      panelLayout.results = Math.min(panelLayout.results, 200);
    } else if (!state.results.rows.length) {
      panelLayout.results = Math.min(panelLayout.results, 240);
    } else if (layoutMode.viewportWidth <= 900) {
      panelLayout.results = clamp(Math.max(panelLayout.results, 260), 220, 380);
    } else {
      panelLayout.results = clamp(Math.max(panelLayout.results, DEFAULT_PANEL_LAYOUT.results), 260, 460);
    }
  }

  function resizeEnabled(handleName) {
    const layoutMode = getLayoutMode();
    const shellWidth = getShellWidth();
    const workspaceWidth = getWorkspaceGridWidth();
    const studioWidth = getSqlWorkspaceWidth();
    const procedureStudioWidth = getProcedureStudioWidth();

    if (handleName === 'activity') {
      return layoutMode.workspaceMode === 'wide' && workspaceWidth > 1500;
    }
    if (handleName === 'builder') {
      return layoutMode.studioMode === 'wide' && studioWidth > 1180;
    }
    if (handleName === 'procedure') {
      return layoutMode.shellMode !== 'stacked' && procedureStudioWidth > 920;
    }
    if (handleName === 'explorer') {
      return layoutMode.workspaceMode !== 'stacked' && workspaceWidth > 1180;
    }
    if (handleName === 'results') {
      return layoutMode.shellMode !== 'stacked' && shellWidth > 1180;
    }
    return layoutMode.shellMode !== 'stacked' && shellWidth > 1180;
  }

  function applyPanelLayout() {
    const shell = document.querySelector('.app-shell');
    const resultsCard = $('resultsPanel')?.closest('.results-card');
    if (!shell || !resultsCard) {
      return;
    }

    normalizePanelLayoutForViewport();
    panelLayout.controlRail = clamp(panelLayout.controlRail, PANEL_LIMITS.controlRail.min, PANEL_LIMITS.controlRail.max);
    panelLayout.explorer = clamp(panelLayout.explorer, PANEL_LIMITS.explorer.min, getExplorerMaxWidth());
    panelLayout.activity = clamp(panelLayout.activity, PANEL_LIMITS.activity.min, PANEL_LIMITS.activity.max);
    panelLayout.results = clamp(panelLayout.results, PANEL_LIMITS.results.min, PANEL_LIMITS.results.max);
    panelLayout.builder = clamp(panelLayout.builder, PANEL_LIMITS.builder.min, PANEL_LIMITS.builder.max);
    panelLayout.procedure = clamp(panelLayout.procedure, PANEL_LIMITS.procedure.min, PANEL_LIMITS.procedure.max);

    shell.style.setProperty('--control-rail-width', `${panelLayout.controlRail}px`);
    shell.style.setProperty('--explorer-width', `${panelLayout.explorer}px`);
    shell.style.setProperty('--activity-width', `${panelLayout.activity}px`);
    shell.style.setProperty('--procedure-panel-width', `${panelLayout.procedure}px`);
    shell.style.setProperty('--results-height', `${panelLayout.results}px`);
    shell.style.setProperty('--builder-primary-width', `${panelLayout.builder}px`);
    shell.classList.toggle('control-rail-collapsed', state.sidePanels.controlRailCollapsed);
    shell.classList.toggle('activity-panel-collapsed', state.sidePanels.activityPanelCollapsed);
    const layoutMode = getLayoutMode();
    const procedureLayoutMode = layoutMode.shellMode === 'stacked' || getProcedureStudioWidth() <= 920 ? 'stacked' : 'split';
    const builderPrimarySplit = resizeEnabled('builder');
    shell.dataset.layoutMode = layoutMode.shellMode;
    shell.dataset.workspaceMode = layoutMode.workspaceMode;
    shell.dataset.studioMode = layoutMode.studioMode;
    shell.dataset.procedureLayoutMode = procedureLayoutMode;
    shell.dataset.viewportScale = String(Math.round(layoutMode.viewportScale * 100) / 100);
    shell.classList.toggle('builder-primary-split', builderPrimarySplit);

    document.querySelectorAll('[data-resize-handle]').forEach((handle) => {
      const enabled = resizeEnabled(handle.dataset.resizeHandle);
      const hiddenByPanelState =
        (handle.dataset.resizeHandle === 'controlRail' && state.sidePanels.controlRailCollapsed) ||
        (handle.dataset.resizeHandle === 'activity' && state.sidePanels.activityPanelCollapsed);
      handle.classList.toggle('is-active', enabled);
      handle.setAttribute('aria-hidden', enabled && !hiddenByPanelState ? 'false' : 'true');
    });

    renderSidePanelToggles();
  }

  function renderSidePanelToggles() {
    const leftButton = $('toggleControlRailBtn');
    const rightButton = $('toggleActivityPanelBtn');

    if (leftButton) {
      leftButton.textContent = state.sidePanels.controlRailCollapsed ? 'Show connection panel' : 'Hide connection panel';
      leftButton.setAttribute('aria-pressed', state.sidePanels.controlRailCollapsed ? 'true' : 'false');
    }

    if (rightButton) {
      rightButton.textContent = state.sidePanels.activityPanelCollapsed ? 'Show themes & history' : 'Hide themes & history';
      rightButton.setAttribute('aria-pressed', state.sidePanels.activityPanelCollapsed ? 'true' : 'false');
    }
  }

  function sidePanelConfig(panelName) {
    if (panelName === 'controlRail') {
      return {
        element: document.querySelector('.control-rail'),
        stateKey: 'controlRailCollapsed',
        fadingClass: 'control-rail-auto-hiding'
      };
    }
    return {
      element: document.querySelector('.activity-panel'),
      stateKey: 'activityPanelCollapsed',
      fadingClass: 'activity-panel-auto-hiding'
    };
  }

  function clearSidePanelAutoHide(panelName, removeFade = true) {
    if (state.sidePanelIdleTimers[panelName]) {
      window.clearTimeout(state.sidePanelIdleTimers[panelName]);
      state.sidePanelIdleTimers[panelName] = null;
    }
    if (state.sidePanelFadeTimers[panelName]) {
      window.clearTimeout(state.sidePanelFadeTimers[panelName]);
      state.sidePanelFadeTimers[panelName] = null;
    }
    if (removeFade) {
      const shell = document.querySelector('.app-shell');
      shell?.classList.remove(sidePanelConfig(panelName).fadingClass);
    }
  }

  function sidePanelIsInUse(panel) {
    if (!panel) {
      return false;
    }
    const hasFocus = panel.contains(document.activeElement);
    let hovered = false;
    try {
      hovered = panel.matches(':hover');
    } catch {
      hovered = false;
    }
    return hasFocus || hovered;
  }

  function scheduleSidePanelAutoHide(panelName) {
    const config = sidePanelConfig(panelName);
    clearSidePanelAutoHide(panelName);
    if (!config.element || state.sidePanels[config.stateKey]) {
      return;
    }

    state.sidePanelIdleTimers[panelName] = window.setTimeout(() => {
      state.sidePanelIdleTimers[panelName] = null;
      if (sidePanelIsInUse(config.element)) {
        scheduleSidePanelAutoHide(panelName);
        return;
      }

      const shell = document.querySelector('.app-shell');
      shell?.classList.add(config.fadingClass);
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const fadeMs = reducedMotion ? 0 : SIDE_PANEL_FADE_MS;
      state.sidePanelFadeTimers[panelName] = window.setTimeout(() => {
        state.sidePanelFadeTimers[panelName] = null;
        shell?.classList.remove(config.fadingClass);
        state.sidePanels[config.stateKey] = true;
        syncResizablePanels();
      }, fadeMs);
    }, SIDE_PANEL_IDLE_MS);
  }

  function resetSidePanelAutoHide(panelName) {
    scheduleSidePanelAutoHide(panelName);
  }

  function setupSidePanelAutoHide() {
    ['controlRail', 'activity'].forEach((panelName) => {
      const panel = sidePanelConfig(panelName).element;
      if (!panel) {
        return;
      }
      ['pointerenter', 'pointerdown', 'input', 'change', 'focusin'].forEach((eventName) => {
        panel.addEventListener(eventName, () => resetSidePanelAutoHide(panelName));
      });
      panel.addEventListener('pointerleave', () => resetSidePanelAutoHide(panelName));
      panel.addEventListener('focusout', () => {
        window.setTimeout(() => resetSidePanelAutoHide(panelName), 0);
      });
      scheduleSidePanelAutoHide(panelName);
    });
  }

  function toggleSidePanel(panelName) {
    clearSidePanelAutoHide(panelName);
    if (panelName === 'controlRail') {
      state.sidePanels.controlRailCollapsed = !state.sidePanels.controlRailCollapsed;
      saveSidePanelVisibility();
      syncResizablePanels();
      if (!state.sidePanels.controlRailCollapsed) {
        scheduleSidePanelAutoHide(panelName);
      }
      setStatus('success', state.sidePanels.controlRailCollapsed ? 'Connection panel hidden.' : 'Connection panel restored.');
      return;
    }

    if (panelName === 'activity') {
      state.sidePanels.activityPanelCollapsed = !state.sidePanels.activityPanelCollapsed;
      saveSidePanelVisibility();
      syncResizablePanels();
      if (!state.sidePanels.activityPanelCollapsed) {
        scheduleSidePanelAutoHide(panelName);
      }
      setStatus('success', state.sidePanels.activityPanelCollapsed ? 'Themes and history panel hidden.' : 'Themes and history panel restored.');
    }
  }

  function syncResizablePanels() {
    const shell = document.querySelector('.app-shell');
    if (!shell) {
      return;
    }
    shell.classList.toggle('panel-resize-disabled', !resizeEnabled('controlRail'));
    applyPanelLayout();
  }

  function handleBounds(handleName) {
    if (handleName === 'controlRail') {
      return PANEL_LIMITS.controlRail;
    }
    if (handleName === 'explorer') {
      return { min: PANEL_LIMITS.explorer.min, max: getExplorerMaxWidth() };
    }
    if (handleName === 'activity') {
      return PANEL_LIMITS.activity;
    }
    if (handleName === 'builder') {
      return PANEL_LIMITS.builder;
    }
    if (handleName === 'procedure') {
      return PANEL_LIMITS.procedure;
    }
    return PANEL_LIMITS.results;
  }

  function setupResizablePanels() {
    syncResizablePanels();

    document.querySelectorAll('[data-resize-handle]').forEach((handle) => {
      handle.onpointerdown = null;
      handle.onpointermove = null;
      handle.onpointerup = null;
      handle.onpointercancel = null;
      handle.ondblclick = null;

      handle.onpointerdown = (event) => {
        const handleName = handle.dataset.resizeHandle;
        if (!resizeEnabled(handleName)) {
          return;
        }
        const shell = document.querySelector('.app-shell');
        const resultsCard = $('resultsPanel')?.closest('.results-card');
        if (!shell || !resultsCard) {
          return;
        }

        const startX = event.clientX;
        const startY = event.clientY;
        const startValue = panelLayout[handleName];
        const bounds = handleBounds(handleName);

        handle.classList.add('is-dragging');
        handle.setPointerCapture?.(event.pointerId);
        document.body.classList.add('panel-resize-dragging');
        document.body.style.cursor = handleName === 'results' ? 'row-resize' : 'col-resize';

        handle.onpointermove = (moveEvent) => {
          let nextValue = startValue;
          if (handleName === 'controlRail' || handleName === 'explorer' || handleName === 'builder' || handleName === 'procedure') {
            nextValue = startValue + (moveEvent.clientX - startX);
          } else if (handleName === 'activity') {
            nextValue = startValue - (moveEvent.clientX - startX);
          } else if (handleName === 'results') {
            nextValue = startValue + (startY - moveEvent.clientY);
          }

          panelLayout[handleName] = clamp(Math.round(nextValue), bounds.min, bounds.max);
          applyPanelLayout();
        };

        const finish = () => {
          handle.classList.remove('is-dragging');
          handle.onpointermove = null;
          handle.onpointerup = null;
          handle.onpointercancel = null;
          document.body.classList.remove('panel-resize-dragging');
          document.body.style.cursor = '';
          savePanelLayout();
        };

        handle.onpointerup = finish;
        handle.onpointercancel = finish;
      };

      handle.ondblclick = () => {
        const handleName = handle.dataset.resizeHandle;
        panelLayout[handleName] = DEFAULT_PANEL_LAYOUT[handleName];
        applyPanelLayout();
        savePanelLayout();
        setStatus('success', 'Panel size reset.');
      };
    });

    if (!window.__dataWorkbenchResizeBinding) {
      const syncLayout = debounce(() => {
        if (typeof window.__dataWorkbenchResizeBinding === 'function') {
          window.__dataWorkbenchResizeBinding();
        }
      }, 40);
      window.addEventListener('resize', syncLayout);
      window.visualViewport?.addEventListener?.('resize', syncLayout);
      window.visualViewport?.addEventListener?.('scroll', syncLayout);

      if (typeof window.ResizeObserver === 'function') {
        const resizeObserver = new window.ResizeObserver(() => syncLayout());
        const observeWhenReady = () => {
          document.querySelectorAll('.app-shell, .workspace-shell, .workspace-grid, .studio-stack, #sqlWorkspace, .procedure-studio-grid').forEach((element) => {
            if (element) {
              resizeObserver.observe(element);
            }
          });
        };
        observeWhenReady();
        window.__dataWorkbenchResizeObserver = resizeObserver;
      }
    }
    window.__dataWorkbenchResizeBinding = syncResizablePanels;
  }

  function bid(value) {
    return `[${String(value || '').replace(/]/g, ']]')}]`;
  }

  function quoteValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return `''`;
    if (/^null$/i.test(raw)) return 'NULL';
    if (/^-?\d+(\.\d+)?$/.test(raw)) return raw;
    return `'${raw.replace(/'/g, "''")}'`;
  }

  function templateLiteralForColumn(columnName) {
    const metadata = state.activeColumns.find((column) => column.name === columnName);
    const dataType = String(metadata?.type || '').toLowerCase();
    if (/(int|decimal|numeric|float|real|money)/.test(dataType)) return '0';
    if (dataType === 'bit') return '0';
    if (/(date|time)/.test(dataType)) return `'2000-01-01'`;
    if (dataType === 'uniqueidentifier') return `'00000000-0000-0000-0000-000000000000'`;
    if (/(char|text|xml)/.test(dataType)) return `''`;
    return 'NULL';
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value || '');
    }
    return utcFormatter.format(date);
  }

  function setStatus(kind, message) {
    $('statusBadge').className = `status-badge ${kind}`;
    $('statusBadge').textContent = kind === 'success' ? 'Success' : kind === 'error' ? 'Error' : kind === 'loading' ? 'Working' : 'Idle';
    $('statusText').textContent = message;
  }

  function renderVersionInfo(info = {}) {
    const versionText = $('appVersionText');
    const updateText = $('appUpdateText');
    if (!versionText || !updateText) {
      return;
    }

    const version = info.version || 'unknown';
    const commit = info.localCommitShort ? ` · ${info.localCommitShort}` : '';
    versionText.textContent = `v${version}${commit}`;

    if (info.updateAvailable) {
      updateText.textContent = info.latestCommitShort
        ? `Update available: ${info.latestCommitShort}`
        : 'Update available';
      updateText.classList.remove('hidden');
      return;
    }

    if (info.updateCheckAvailable === false) {
      updateText.textContent = 'Update check unavailable';
      updateText.classList.remove('hidden');
      return;
    }

    updateText.textContent = '';
    updateText.classList.add('hidden');
  }

  async function loadVersionInfo() {
    try {
      const info = await api('/api/version');
      state.versionInfo = info;
      renderVersionInfo(info);
      if (info.updateAvailable) {
        setStatus('neutral', `A newer Data Workbench version is available on GitHub. Current: ${info.localCommitShort || 'unknown'}, latest: ${info.latestCommitShort || 'unknown'}.`);
      }
    } catch (error) {
      state.versionInfo = { version: state.health?.version || 'unknown', updateCheckAvailable: false };
      renderVersionInfo(state.versionInfo);
      console.warn('Could not check Data Workbench version.', error);
    }
  }

  function createLifecycleSessionId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID().replace(/-/g, '');
    }

    return `dwb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  }

  function lifecycleSessionId() {
    if (state.lifecycle.sessionId) {
      return state.lifecycle.sessionId;
    }

    let sessionId = '';
    try {
      sessionId = sessionStorage.getItem(LIFECYCLE_SESSION_KEY) || '';
      if (!sessionId) {
        sessionId = createLifecycleSessionId();
        sessionStorage.setItem(LIFECYCLE_SESSION_KEY, sessionId);
      }
    } catch {
      sessionId = createLifecycleSessionId();
    }

    state.lifecycle.sessionId = sessionId;
    return sessionId;
  }

  function lifecyclePayload(event = 'active') {
    return {
      sessionId: lifecycleSessionId(),
      event,
      path: window.location.pathname
    };
  }

  async function sendLifecycleHeartbeat(event = 'active') {
    if (state.lifecycle.exitRequested) {
      return;
    }

    try {
      await api('/api/lifecycle/heartbeat', {
        method: 'POST',
        data: lifecyclePayload(event)
      });
    } catch (error) {
      console.warn('Could not send lifecycle heartbeat.', error);
    }
  }

  function sendLifecycleCloseBeacon() {
    if (state.lifecycle.exitRequested || !navigator.sendBeacon) {
      return;
    }

    try {
      const payload = JSON.stringify(lifecyclePayload('close'));
      const body = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/lifecycle/heartbeat', body);
    } catch (error) {
      console.warn('Could not send lifecycle close beacon.', error);
    }
  }

  function startLifecycleHeartbeat() {
    lifecycleSessionId();
    if (state.lifecycle.heartbeatTimer) {
      window.clearInterval(state.lifecycle.heartbeatTimer);
      state.lifecycle.heartbeatTimer = null;
    }

    sendLifecycleHeartbeat('active');
    state.lifecycle.heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        sendLifecycleHeartbeat('active');
      }
    }, LIFECYCLE_HEARTBEAT_MS);
  }

  function showShutdownOverlay(title, message, failed = false) {
    const overlay = $('shutdownOverlay');
    if (!overlay) {
      return;
    }

    $('shutdownTitle').textContent = title;
    $('shutdownMessage').textContent = message;
    overlay.classList.toggle('failed', failed);
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.querySelectorAll('button, input, select, textarea').forEach((element) => {
      if (!overlay.contains(element)) {
        element.disabled = true;
      }
    });
  }

  function showShutdownAccepted() {
    showShutdownOverlay('Data Workbench is stopping', 'The local server is shutting down. You can close this browser tab.');
    setStatus('success', 'Data Workbench server is stopping. You can close this browser tab.');
    document.body.classList.add('server-exit-requested');
  }

  async function exitWorkbench() {
    if (state.lifecycle.exitRequested) {
      return;
    }

    const confirmed = window.confirm('Exit Data Workbench and stop the local server?');
    if (!confirmed) {
      return;
    }

    state.lifecycle.exitRequested = true;
    const exitButton = $('exitWorkbenchBtn');
    if (exitButton) {
      exitButton.textContent = 'Stopping...';
      exitButton.disabled = true;
    }
    if (state.lifecycle.heartbeatTimer) {
      window.clearInterval(state.lifecycle.heartbeatTimer);
      state.lifecycle.heartbeatTimer = null;
    }

    showShutdownOverlay('Stopping Data Workbench', 'The local server is shutting down. You can close this browser tab.');
    setStatus('loading', 'Stopping Data Workbench server...');
    try {
      await api('/api/lifecycle/exit', { method: 'POST', data: { sessionId: lifecycleSessionId() } });
      showShutdownAccepted();
    } catch (error) {
      if (error instanceof TypeError || /failed to fetch|network/i.test(String(error.message || ''))) {
        showShutdownAccepted();
        return;
      }

      state.lifecycle.exitRequested = false;
      if (exitButton) {
        exitButton.textContent = 'Exit Data Workbench';
        exitButton.disabled = false;
      }
      showShutdownOverlay('Shutdown failed', `The local server could not be stopped: ${error.message}`, true);
      setStatus('error', `Could not stop the local server: ${error.message}`);
    }
  }

  function renderSaveConnectionResult(info = null) {
    const panel = $('saveConnectionResult');
    if (!panel) {
      return;
    }

    if (!info) {
      panel.className = 'connection-test-panel empty-note';
      panel.innerHTML = 'Save stores this connection in the app database so it is available every time the project starts.';
      return;
    }

    const stateClass = ['success', 'error'].includes(info.state) ? info.state : '';
    panel.className = `connection-test-panel empty-note${stateClass ? ` ${stateClass}` : ''}`;
    panel.innerHTML = `<strong>${esc(info.title || 'Save connection')}</strong><span>${esc(info.message || '')}</span>`;
  }

  async function api(url, { method = 'GET', data } = {}) {
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : { success: false, error: await response.text() };
    if (!response.ok || payload.success === false) {
      const error = new Error(payload.error || `Request failed with status ${response.status}`);
      Object.assign(error, payload);
      throw error;
    }
    return payload;
  }


  function sourceOptions() {
    return state.health?.supportedSourceTypes || FALLBACK_SOURCES;
  }

  function authOptionsForSource(sourceType) {
    const source = sourceOptions().find((item) => item.id === sourceType) || sourceOptions()[0];
    return (source?.authModes || ['servicePrincipal']).map((id) => (
      (state.health?.supportedAuthModes || FALLBACK_AUTH).find((option) => option.id === id) || { id, label: id }
    ));
  }
  function renderConnectionSelectors() {
    const sourceSelect = $('sourceTypeSelect');
    const authSelect = $('authModeSelect');
    if (!sourceSelect || !authSelect) {
      return;
    }

    const currentSource = sourceSelect.value;
    const sources = sourceOptions();

    sourceSelect.innerHTML = sources
      .map((source) => `<option value="${esc(source.id)}">${esc(source.label || source.id)}</option>`)
      .join('');

    const nextSource = sources.some((source) => source.id === currentSource)
      ? currentSource
      : (sources[0]?.id || 'fabric-sql');

    sourceSelect.value = nextSource;
    renderAuthOptions();
    renderConnectionSummary();
  }

  function renderAuthOptions() {
    const sourceType = selectedSourceType();
    const authSelect = $('authModeSelect');
    if (!authSelect) {
      return;
    }

    const currentAuth = authSelect.value;
    const options = authOptionsForSource(sourceType);

    authSelect.innerHTML = options
      .map((option) => `<option value="${esc(option.id)}">${esc(option.label || option.id)}</option>`)
      .join('');

    const nextAuth = options.some((option) => option.id === currentAuth)
      ? currentAuth
      : (options[0]?.id || 'servicePrincipal');

    authSelect.value = nextAuth;
    syncAuthFields();
  }

  function syncAuthFields() {
    const sourceType = selectedSourceType();
    const authMode = selectedAuthMode(sourceType);

    const authFields = $('authFields');
    const usernameField = $('usernameField');
    const passwordField = $('passwordField');
    const trustField = $('trustServerCertificateField');
    const usernameInput = $('usernameInput');
    const passwordInput = $('passwordInput');

    if (!authFields || !usernameField || !passwordField || !trustField) {
      return;
    }

    const isSqlLogin = authMode === 'sqlLogin';
    const sourceLabel =
      sourceOptions().find((source) => source.id === sourceType)?.label || sourceType;

    authFields.classList.toggle('hidden', false);
    usernameField.classList.toggle('hidden', false);
    passwordField.classList.toggle('hidden', !isSqlLogin);
    trustField.classList.toggle('hidden', sourceType !== 'sql-server');

    const usernameLabel = usernameField.querySelector('span');
    const passwordLabel = passwordField.querySelector('span');

    if (usernameLabel) {
      usernameLabel.textContent = isSqlLogin ? 'Username' : 'Client / app id';
    }
    if (passwordLabel) {
      passwordLabel.textContent = isSqlLogin ? 'Password' : 'Client secret';
    }

    if (usernameInput) {
      usernameInput.placeholder = isSqlLogin ? 'sql_login' : 'service principal client id';
      usernameInput.disabled = !isSqlLogin;
    }
    if (passwordInput) {
      passwordInput.placeholder = isSqlLogin ? 'password' : 'service principal client secret';
      passwordInput.disabled = !isSqlLogin;
    }

    if (!isSqlLogin) {
      usernameInput.value = '';
      passwordInput.value = '';
      window.__dataWorkbenchSessionPassword = '';
    }

    renderConnectionSummary();
    clearConnectionTestResult();

    const resultPanel = $('testConnectionResult');
    if (resultPanel && !state.connectionTest) {
      resultPanel.innerHTML = `<strong>Ready to test</strong><span>Current source: ${esc(sourceLabel)} using ${esc(authMode)}.</span>`;
    }
  }

  function renderConnectionSummary() {
    const panel = $('connectionSummary');
    if (!panel) {
      return;
    }

    const current = connection();
    const sourceLabel =
      sourceOptions().find((source) => source.id === current.sourceType)?.label || current.sourceType;

    const authLabel =
      authOptionsForSource(current.sourceType).find((auth) => auth.id === current.authMode)?.label || current.authMode;

    const ready = Boolean(current.server && current.database);

    panel.innerHTML = `
      <div class="info-chip">
        <strong>Session</strong>
        <span>${ready ? `${esc(sourceLabel)} • ${esc(current.server)} • ${esc(current.database)}` : 'No active connection yet.'}</span>
      </div>
      <div class="info-chip">
        <strong>Auth</strong>
        <span>${esc(authLabel)}</span>
      </div>
    `;
  }

  function renderPolicy() {
    const panel = $('policySummary');
    if (!panel) {
      return;
    }

    const policy = state.health?.safetyPolicy || state.health?.policy || null;

    if (!policy) {
      panel.innerHTML = `
        <div class="info-chip">
          <strong>Default policy</strong>
          <span>SELECT-style reads run directly. Writes and procedures stay user-controlled through preview and button confirmation.</span>
        </div>
      `;
      return;
    }

    const lines = [];
    if (policy.writeRequiresPreview !== undefined) {
      lines.push(`Write preview required: ${policy.writeRequiresPreview ? 'Yes' : 'No'}`);
    }
    if (policy.secondConfirmationRequired !== undefined) {
      lines.push(`Button confirmation only: ${policy.confirmWithButtonOnly ? 'Yes' : 'No'}`);
    }
    if (Array.isArray(policy.blockedStatements) && policy.blockedStatements.length) {
      lines.push(`Blocked: ${policy.blockedStatements.join(', ')}`);
    }

    panel.innerHTML = `
      <div class="info-chip">
        <strong>Active policy</strong>
        <span>${esc(lines.join(' • ') || 'Safety checks are enabled.')}</span>
      </div>
    `;
  }

  function renderConnectionTestResult() {
    const panel = $('testConnectionResult');
    if (!panel) {
      return;
    }

    const info = state.connectionTest;
    if (!info) {
      panel.className = 'connection-test-panel empty-note';
      panel.innerHTML = 'Run a connection test to verify the current server, database, and authentication settings.';
      return;
    }

    const stateClass = ['success', 'error'].includes(info.state) ? info.state : '';
    panel.className = `connection-test-panel empty-note${stateClass ? ` ${stateClass}` : ''}`;
    panel.innerHTML = `<strong>${esc(info.state === 'success' ? 'Connection verified' : info.state === 'error' ? 'Connection failed' : 'Testing connection')}</strong><span>${esc(info.message || '')}</span>`;
  }

  function clearConnectionTestResult() {
    state.connectionTest = null;
    renderConnectionTestResult();
  }

  function renderAdvancedOperationsVisibility() {
    const button = $('toggleAdvancedOperationsBtn');
    const content = $('advancedOperationsContent');
    const shell = document.querySelector('.app-shell');
    if (!button || !content) {
      return;
    }

    content.classList.toggle('hidden', !state.advancedOperationsVisible);
    shell?.classList.toggle('advanced-operations-expanded', state.advancedOperationsVisible);
    button.setAttribute('aria-expanded', state.advancedOperationsVisible ? 'true' : 'false');
    button.textContent = state.advancedOperationsVisible ? 'Hide advanced' : 'Show advanced';
  }
  function selectedSourceType() {
    const options = sourceOptions();
    const value = $('sourceTypeSelect').value;
    const normalized = options.some((item) => item.id === value) ? value : (options[0]?.id || 'fabric-sql');
    if ($('sourceTypeSelect').value !== normalized) {
      $('sourceTypeSelect').value = normalized;
    }
    return normalized;
  }

  function selectedAuthMode(sourceType = selectedSourceType()) {
    const options = authOptionsForSource(sourceType);
    const value = $('authModeSelect').value;
    const normalized = options.some((item) => item.id === value) ? value : (options[0]?.id || 'servicePrincipal');
    if ($('authModeSelect').value !== normalized) {
      $('authModeSelect').value = normalized;
    }
    return normalized;
  }

  function connection() {
    const sourceType = selectedSourceType();
    const authMode = selectedAuthMode(sourceType);
    return {
      sourceType,
      authMode,
      server: $('serverInput').value.trim(),
      port: $('portInput').value.trim(),
      database: $('databaseInput').value.trim(),
      username: $('usernameInput').value.trim(),
      password: $('passwordInput').value,
      trustServerCertificate: $('trustServerCertificateInput').checked
    };
  }

  function requestConnection(extra = {}) {
    return { ...connection(), ...extra };
  }

  function storageConnection() {
    const current = connection();
    return {
      sourceType: current.sourceType,
      authMode: current.authMode,
      server: current.server,
      port: current.port,
      database: current.database,
      username: current.username,
      trustServerCertificate: current.trustServerCertificate
    };
  }

  function connectionSignature(snapshot = storageConnection()) {
    return [
      snapshot.sourceType || '',
      snapshot.authMode || '',
      snapshot.server || '',
      snapshot.port || '',
      snapshot.database || '',
      snapshot.username || '',
      snapshot.trustServerCertificate === false ? '0' : '1'
    ].join('|');
  }

  function persistActiveConnection() {
    const current = connection();
    safeSessionSet(ACTIVE_CONNECTION_KEY, JSON.stringify(storageConnection()));
    window.__dataWorkbenchSessionPassword = current.authMode === 'sqlLogin' ? current.password : '';
  }

  function persistCatalogState() {
    safeSessionSet(CATALOG_STATE_KEY, JSON.stringify({
      connectionSignature: connectionSignature(),
      objects: state.objects,
      procedures: state.procedures,
      procedureNote: state.procedureNote,
      activeObject: state.activeObject,
      activeObjectType: state.activeObjectType,
      activeColumns: state.activeColumns,
      selectedColumns: [...state.selectedColumns],
      objectColumnIndex: state.objectColumnIndex,
      activeProcedure: state.activeProcedure,
      procedureParameters: state.procedureParameters,
      procedureValues: state.procedureValues
    }));
  }

  function normalizeResultsSnapshot(snapshot) {
    const base = defaultResultsState();
    if (!snapshot || typeof snapshot !== 'object') {
      return base;
    }
    return {
      ...base,
      columns: Array.isArray(snapshot.columns) ? snapshot.columns : [],
      rows: Array.isArray(snapshot.rows) ? snapshot.rows : [],
      output: snapshot.output && typeof snapshot.output === 'object' ? snapshot.output : {},
      returnValue: snapshot.returnValue ?? null,
      rowsAffected: Number(snapshot.rowsAffected || 0),
      totalRows: Number(snapshot.totalRows || 0),
      truncated: Boolean(snapshot.truncated),
      page: Math.max(1, Number(snapshot.page || 1)),
      pageSize: Math.max(1, Number(snapshot.pageSize || base.pageSize)),
      columnWidths: snapshot.columnWidths && typeof snapshot.columnWidths === 'object' ? snapshot.columnWidths : {},
      expandedCells: snapshot.expandedCells && typeof snapshot.expandedCells === 'object' ? snapshot.expandedCells : {},
      sortColumn: String(snapshot.sortColumn || ''),
      sortDirection: snapshot.sortDirection === 'desc' ? 'desc' : 'asc',
      localFilter: String(snapshot.localFilter || ''),
      visualKind: String(snapshot.visualKind || ''),
      visualObject: String(snapshot.visualObject || '')
    };
  }

  function readWorkspaceState() {
    try {
      const parsed = JSON.parse(safeSessionGet(WORKSPACE_STATE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeWorkspaceState(nextState) {
    safeSessionSet(WORKSPACE_STATE_KEY, JSON.stringify(nextState || {}));
  }

  function currentBuilderSnapshot() {
    const adapter = editorAdapter();
    const selection = adapter.getSelection();
    const scroll = adapter.getScroll();
    return {
      query: getQuery(),
      selectionStart: Number(selection.start || 0),
      selectionEnd: Number(selection.end || 0),
      editorScrollTop: Number(scroll.top || 0),
      editorScrollLeft: Number(scroll.left || 0),
      queryMode: state.queryMode,
      filters: getFilters(),
      sortColumn: $('sortColumnSelect')?.value || '',
      sortDirection: $('sortDirectionSelect')?.value || 'ASC',
      topRows: $('topRowsInput')?.value || '100',
      distinct: $('distinctSelect')?.value || 'false',
      advancedSourceObject: $('advancedSourceObjectSelect')?.value || '',
      targetJoinColumn: $('targetJoinColumnSelect')?.value || '',
      sourceJoinColumn: $('sourceJoinColumnInput')?.value || '',
      profileSampleRows: $('profileSampleRowsInput')?.value || '200'
    };
  }

  function persistWorkspaceState(workspace = state.workspace) {
    if (!$('queryEditor')) {
      return;
    }
    syncActiveResultsToTab();
    const allState = readWorkspaceState();
    const key = workspace === 'procedure' ? 'procedure' : 'sql';
    const snapshot = {
      connectionSignature: connectionSignature(),
      activeObject: state.activeObject || '',
      activeProcedure: state.activeProcedure || '',
      procedureValues: { ...(state.procedureValues || {}) },
      procedureParameters: Array.isArray(state.procedureParameters) ? state.procedureParameters : [],
      historyFilter: state.historyFilter || '',
      results: normalizeResultsSnapshot(state.results),
      resultTabs: state.resultTabs
        .filter((tab) => tab.workspace === key)
        .slice(0, RESULT_TABS_MAX)
        .map((tab) => ({
          ...tab,
          results: normalizeResultsSnapshot(tab.results)
        })),
      activeResultTabId: state.activeResultTabId || '',
      scrollY: Number(window.scrollY || 0),
      resultsScrollLeft: Number($('resultsPanel')?.scrollLeft || 0),
      resultsScrollTop: Number($('resultsPanel')?.scrollTop || 0),
      savedAt: new Date().toISOString()
    };
    if (key === 'sql') {
      snapshot.builder = currentBuilderSnapshot();
    }
    allState[key] = snapshot;
    writeWorkspaceState(allState);
  }

  function restoreFilterRows(filters = []) {
    const list = $('filtersList');
    if (!list) {
      return;
    }
    list.innerHTML = '';
    filters
      .filter((filter) => filter && state.activeColumns.some((column) => column.name === filter.column))
      .forEach((filter) => list.appendChild(createFilterRow(filter)));
    renderFilters();
  }

  function restoreWorkspaceState(workspace = state.workspace) {
    const allState = readWorkspaceState();
    const key = workspace === 'procedure' ? 'procedure' : 'sql';
    const snapshot = allState[key];
    if (!snapshot || snapshot.connectionSignature !== connectionSignature()) {
      return false;
    }

    if (key === 'sql') {
      const builder = snapshot.builder || {};
      setMode(builder.queryMode || state.queryMode || 'select');
      if ($('sortColumnSelect')) $('sortColumnSelect').value = builder.sortColumn || '';
      if ($('sortDirectionSelect')) $('sortDirectionSelect').value = builder.sortDirection || 'ASC';
      if ($('topRowsInput')) $('topRowsInput').value = builder.topRows || '100';
      if ($('distinctSelect')) $('distinctSelect').value = builder.distinct || 'false';
      if ($('advancedSourceObjectSelect')) $('advancedSourceObjectSelect').value = builder.advancedSourceObject || '';
      if ($('targetJoinColumnSelect')) $('targetJoinColumnSelect').value = builder.targetJoinColumn || '';
      if ($('sourceJoinColumnInput')) $('sourceJoinColumnInput').value = builder.sourceJoinColumn || '';
      if ($('profileSampleRowsInput')) $('profileSampleRowsInput').value = builder.profileSampleRows || '200';
      restoreFilterRows(Array.isArray(builder.filters) ? builder.filters : []);
      setQuery(typeof builder.query === 'string' ? builder.query : getQuery());
      const adapter = editorAdapter();
      const queryLength = getQuery().length;
      const start = Math.max(0, Math.min(Number(builder.selectionStart || 0), queryLength));
      const end = Math.max(start, Math.min(Number(builder.selectionEnd || start), queryLength));
      adapter.setSelection(start, end);
      adapter.setScroll(Number(builder.editorScrollTop || 0), Number(builder.editorScrollLeft || 0));
      syncEditorBackdrop();
      updateAdvancedOperationsSummary();
    } else {
      if (snapshot.activeProcedure && snapshot.activeProcedure === state.activeProcedure) {
        state.procedureValues = snapshot.procedureValues && typeof snapshot.procedureValues === 'object' ? { ...snapshot.procedureValues } : state.procedureValues;
        renderProcedureWorkspace();
        persistCatalogState();
      }
    }

    state.historyFilter = String(snapshot.historyFilter || '');
    if ($('queryHistorySearch')) {
      $('queryHistorySearch').value = state.historyFilter;
    }
    state.results = normalizeResultsSnapshot(snapshot.results);
    state.resultTabs = Array.isArray(snapshot.resultTabs)
      ? snapshot.resultTabs.slice(0, RESULT_TABS_MAX).map((tab) => ({
        ...tab,
        workspace: tab.workspace === 'procedure' ? 'procedure' : 'sql',
        results: normalizeResultsSnapshot(tab.results)
      }))
      : [];
    state.activeResultTabId = snapshot.activeResultTabId && state.resultTabs.some((tab) => tab.id === snapshot.activeResultTabId)
      ? snapshot.activeResultTabId
      : (state.resultTabs[0]?.id || '');
    if (state.activeResultTabId) {
      const activeTab = state.resultTabs.find((tab) => tab.id === state.activeResultTabId);
      state.results = normalizeResultsSnapshot(activeTab?.results || state.results);
    }
    if ($('localResultsFilter')) {
      $('localResultsFilter').value = state.results.localFilter || '';
    }
    renderHistoryPanel();
    renderResultTabs();
    renderResults();
    window.setTimeout(() => {
      try {
        if (!/jsdom/i.test(String(window.navigator?.userAgent || ''))) {
          window.scrollTo?.({ top: Number(snapshot.scrollY || 0), left: 0, behavior: 'auto' });
        }
      } catch {
        // jsdom does not implement scrollTo; browsers do.
      }
      const panel = $('resultsPanel');
      if (panel) {
        panel.scrollLeft = Number(snapshot.resultsScrollLeft || 0);
        panel.scrollTop = Number(snapshot.resultsScrollTop || 0);
        updateResultScrollControls();
      }
    }, 0);
    return true;
  }

  function restoreCatalogState() {
    let saved = null;
    try {
      saved = JSON.parse(safeSessionGet(CATALOG_STATE_KEY) || 'null');
    } catch {
      saved = null;
    }

    if (!saved || saved.connectionSignature !== connectionSignature()) {
      return false;
    }

    state.objects = Array.isArray(saved.objects) ? saved.objects : [];
    state.filteredObjects = [...state.objects];
    state.procedures = Array.isArray(saved.procedures) ? saved.procedures : [];
    state.filteredProcedures = [...state.procedures];
    state.procedureNote = String(saved.procedureNote || '');
    state.activeObject = saved.activeObject || null;
    state.activeObjectType = saved.activeObjectType || '';
    state.activeColumns = Array.isArray(saved.activeColumns) ? saved.activeColumns : [];
    state.selectedColumns = new Set(Array.isArray(saved.selectedColumns) ? saved.selectedColumns : []);
    state.activeProcedure = saved.activeProcedure || null;
    state.procedureParameters = Array.isArray(saved.procedureParameters) ? saved.procedureParameters : [];
    state.procedureValues = saved.procedureValues && typeof saved.procedureValues === 'object' ? saved.procedureValues : {};
    state.objectColumnIndex = saved.objectColumnIndex && typeof saved.objectColumnIndex === 'object' ? saved.objectColumnIndex : {};
    loadPinnedAndRecentItems();
    populateExplorerFilters();

    renderObjects();
    renderProcedures();
    if (state.activeObject) {
      populateColumnInputs();
      renderColumns();
    } else {
      resetActiveObject();
    }
    renderProcedureWorkspace();
    populateAdvancedObjectOptions();
    populateJoinColumnOptions();
    renderExplorerSummary();
    refreshActiveSummary();
    return state.objects.length > 0 || state.procedures.length > 0;
  }

  function loadStoredConnectionHistory() {
    for (const key of [HISTORY_KEY, ...LEGACY_HISTORY_KEYS]) {
      try {
        const normalized = normalizeConnectionHistory(JSON.parse(safeGet(key) || 'null'));
        if (normalized.length) {
          return normalized;
        }
      } catch {
        // Ignore malformed local payloads and keep looking.
      }
    }
    return [];
  }

  function saveStoredConnectionHistory(items) {
    safeSet(HISTORY_KEY, JSON.stringify(normalizeConnectionHistory(items)));
  }

  function restoreActiveConnection() {
    let saved = null;
    try {
      saved = JSON.parse(safeSessionGet(ACTIVE_CONNECTION_KEY) || 'null');
    } catch {
      saved = null;
    }

    const current = normalizeStoredConnection(saved) || loadStoredConnectionHistory()[0] || null;
    if (!current) {
      syncAuthFields();
      return;
    }

    const sourceType = sourceOptions().some((source) => source.id === current.sourceType) ? current.sourceType : 'fabric-sql';
    $('sourceTypeSelect').value = sourceType;
    renderAuthOptions();
    const authMode = authOptionsForSource(sourceType).some((auth) => auth.id === current.authMode) ? current.authMode : $('authModeSelect').value;
    $('authModeSelect').value = authMode;
    syncAuthFields();
    $('serverInput').value = current.server || '';
    $('portInput').value = current.port || '';
    $('databaseInput').value = current.database || '';
    $('usernameInput').value = current.username || '';
    $('passwordInput').value = authMode === 'sqlLogin' ? (window.__dataWorkbenchSessionPassword || '') : '';
    $('trustServerCertificateInput').checked = current.trustServerCertificate !== false;
    renderConnectionSummary();
  }

  function normalizeStoredConnection(item) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const normalized = {
      id: String(item.id || '').trim(),
      profileName: String(item.profileName || item.profile_name || item.name || item.database || item.db || '').trim(),
      sourceType: String(item.sourceType || item.source || item.source_type || 'fabric-sql').trim() || 'fabric-sql',
      authMode: String(item.authMode || item.auth || item.auth_mode || 'servicePrincipal').trim() || 'servicePrincipal',
      server: String(item.server || item.host || '').trim(),
      port: String(item.port || '').trim(),
      database: String(item.database || item.database_name || item.db || item.name || '').trim(),
      username: String(item.username || item.user || '').trim(),
      trustServerCertificate: item.trustServerCertificate !== false && item.trust_server_certificate !== 0
    };

    if (!normalized.server || !normalized.database) {
      return null;
    }

    return normalized;
  }

  function normalizeConnectionHistory(raw) {
    const items = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.connections)
        ? raw.connections
        : raw && typeof raw === 'object'
          ? Object.values(raw)
          : [];

    return items
      .map((item) => normalizeStoredConnection(item))
      .filter(Boolean)
      .slice(0, CONNECTION_HISTORY_MAX);
  }

  function normalizeQueryHistory(raw) {
    const now = Date.now();
    return (Array.isArray(raw) ? raw : [])
      .filter((item) => item && typeof item === 'object' && typeof item.query === 'string')
      .map((item) => {
        const query = String(item.query || '').slice(0, 20000);
        const queryMode = normalizeQueryMode(item.queryMode || inferQueryMode(query));
        return {
          id: String(item.id || `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`),
          query,
          queryMode,
          activeObject: String(item.activeObject || '').slice(0, 512),
          activeObjectType: String(item.activeObjectType || '').slice(0, 64),
          connectionSignature: String(item.connectionSignature || ''),
          database: String(item.database || ''),
          server: String(item.server || ''),
          timestamp: String(item.timestamp || new Date().toISOString())
        };
      })
      .filter((item) => item.query.trim())
      .filter((item) => {
        const time = new Date(item.timestamp).getTime();
        return Number.isFinite(time) && (now - time) <= QUERY_HISTORY_RETENTION_MS;
      })
      .slice(0, QUERY_HISTORY_MAX);
  }

  function stripSqlComments(query) {
    const sql = String(query || '');
    let output = '';

    for (let index = 0; index < sql.length; index += 1) {
      const char = sql[index];
      const next = sql[index + 1];

      if (char === "'") {
        output += char;
        index += 1;
        while (index < sql.length) {
          output += sql[index];
          if (sql[index] === "'" && sql[index + 1] === "'") {
            output += sql[index + 1];
            index += 2;
            continue;
          }
          if (sql[index] === "'") {
            break;
          }
          index += 1;
        }
        continue;
      }

      if (char === '-' && next === '-') {
        index += 2;
        while (index < sql.length && sql[index] !== '\n') {
          index += 1;
        }
        output += ' ';
        continue;
      }

      if (char === '/' && next === '*') {
        index += 2;
        while (index < sql.length) {
          if (sql[index] === '*' && sql[index + 1] === '/') {
            index += 1;
            break;
          }
          index += 1;
        }
        output += ' ';
        continue;
      }

      output += char;
    }

    return output.trim();
  }

  function normalizeQueryMode(mode) {
    const clean = String(mode || '').trim().toLowerCase();
    return ['select', 'insert', 'update', 'delete'].includes(clean) ? clean : 'select';
  }

  function inferQueryMode(query) {
    const clean = stripSqlComments(query).replace(/^\uFEFF/, '').trim();
    const match = clean.match(/^([a-z]+)/i);
    return normalizeQueryMode(match?.[1]);
  }

  function sanitizeSqlForObjectLookup(sql) {
    const text = String(sql || '');
    let output = '';
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '-' && next === '-') {
        output += '  ';
        index += 2;
        while (index < text.length && text[index] !== '\n') {
          output += ' ';
          index += 1;
        }
        if (index < text.length) {
          output += text[index];
        }
        continue;
      }

      if (char === '/' && next === '*') {
        output += '  ';
        index += 2;
        while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
          output += text[index] === '\n' ? '\n' : ' ';
          index += 1;
        }
        if (index < text.length) {
          output += '  ';
          index += 1;
        }
        continue;
      }

      if (char === "'") {
        output += ' ';
        index += 1;
        while (index < text.length) {
          output += text[index] === '\n' ? '\n' : ' ';
          if (text[index] === "'" && text[index + 1] === "'") {
            output += ' ';
            index += 2;
            continue;
          }
          if (text[index] === "'") {
            break;
          }
          index += 1;
        }
        continue;
      }

      output += char;
    }
    return output;
  }

  function readSqlIdentifierPart(sql, startIndex) {
    let index = startIndex;
    while (index < sql.length && /\s/.test(sql[index])) {
      index += 1;
    }

    if (sql[index] === '[') {
      let value = '';
      index += 1;
      while (index < sql.length) {
        if (sql[index] === ']' && sql[index + 1] === ']') {
          value += ']';
          index += 2;
          continue;
        }
        if (sql[index] === ']') {
          index += 1;
          break;
        }
        value += sql[index];
        index += 1;
      }
      return { value: value.trim(), endIndex: index };
    }

    if (sql[index] === '"') {
      let value = '';
      index += 1;
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        if (sql[index] === '"') {
          index += 1;
          break;
        }
        value += sql[index];
        index += 1;
      }
      return { value: value.trim(), endIndex: index };
    }

    let value = '';
    while (index < sql.length && /[A-Za-z0-9_@$#]/.test(sql[index])) {
      value += sql[index];
      index += 1;
    }
    return { value: value.trim(), endIndex: index };
  }

  function readSqlObjectName(sql, startIndex) {
    const parts = [];
    let index = startIndex;

    while (parts.length < 4) {
      const part = readSqlIdentifierPart(sql, index);
      if (!part.value) {
        break;
      }
      parts.push(part.value);
      index = part.endIndex;
      while (index < sql.length && /\s/.test(sql[index])) {
        index += 1;
      }
      if (sql[index] !== '.') {
        break;
      }
      index += 1;
    }

    return parts;
  }

  function objectLookupKeysFromParts(parts = []) {
    const cleanParts = parts.map((part) => String(part || '').trim()).filter(Boolean);
    if (!cleanParts.length) {
      return [];
    }
    const keys = [];
    if (cleanParts.length >= 2) {
      keys.push(cleanParts.slice(-2).join('.').toLowerCase());
    }
    keys.push(cleanParts[cleanParts.length - 1].toLowerCase());
    return [...new Set(keys)];
  }

  function catalogObjectKeys(item) {
    const fullName = String(item?.fullName || '').trim();
    const schema = String(item?.schema || '').trim();
    const name = String(item?.name || item?.table || '').trim();
    return [
      fullName,
      schema && name ? `${schema}.${name}` : '',
      name,
      fullName.split('.').pop() || ''
    ].map((value) => value.toLowerCase()).filter(Boolean);
  }

  function findCatalogObjectByKeys(keys = []) {
    const normalizedKeys = keys.map((key) => String(key || '').toLowerCase()).filter(Boolean);
    if (!normalizedKeys.length) {
      return null;
    }
    for (const key of normalizedKeys) {
      const found = state.objects.find((item) => catalogObjectKeys(item).includes(key));
      if (found) {
        return found;
      }
    }
    return null;
  }

  function inferQueryHistoryObject(query) {
    const rawSql = String(query || '');
    const cleanSql = sanitizeSqlForObjectLookup(rawSql);
    const patterns = [
      /\bFROM\b/gi,
      /\bUPDATE\b/gi,
      /\bINSERT\s+INTO\b/gi,
      /\bDELETE\s+FROM\b/gi,
      /\bJOIN\b/gi
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(cleanSql);
      if (!match) {
        continue;
      }
      const parts = readSqlObjectName(rawSql, match.index + match[0].length);
      const found = findCatalogObjectByKeys(objectLookupKeysFromParts(parts));
      if (found) {
        return found;
      }
    }

    return null;
  }

  function queryHistorySearchText(item) {
    return [
      item.query,
      item.activeObject,
      item.database,
      item.server
    ].join(' ').toLowerCase();
  }

  function normalizeProcedureHistory(raw) {
    const now = Date.now();
    return (Array.isArray(raw) ? raw : [])
      .filter((item) => item && typeof item === 'object' && typeof item.procedure === 'string')
      .map((item) => ({
        id: String(item.id || `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`),
        procedure: String(item.procedure || '').slice(0, 512),
        parameters: item.parameters && typeof item.parameters === 'object' ? Object.fromEntries(
          Object.entries(item.parameters).map(([key, value]) => [String(key), value == null ? '' : String(value)])
        ) : {},
        connectionSignature: String(item.connectionSignature || ''),
        database: String(item.database || ''),
        server: String(item.server || ''),
        timestamp: String(item.timestamp || new Date().toISOString())
      }))
      .filter((item) => item.procedure.trim())
      .filter((item) => {
        const time = new Date(item.timestamp).getTime();
        return Number.isFinite(time) && (now - time) <= QUERY_HISTORY_RETENTION_MS;
      })
      .slice(0, QUERY_HISTORY_MAX);
  }

  async function fetchSavedConnections() {
    try {
      const payload = await api('/api/saved-connections');
      const items = normalizeConnectionHistory(payload.items || []);
      saveStoredConnectionHistory(items);
      return items;
    } catch (error) {
      const fallback = loadStoredConnectionHistory();
      if (fallback.length) {
        return fallback;
      }
      throw error;
    }
  }

  async function loadConnectionHistory() {
    try {
      state.connectionHistory = await fetchSavedConnections();
      saveStoredConnectionHistory(state.connectionHistory);
      renderConnectionHistory();
    } catch (error) {
      state.connectionHistory = [];
      renderConnectionHistory();
      setStatus('error', `Could not load saved connections: ${error.message}`);
    }
  }

  async function deleteSavedConnectionProfile(id) {
    try {
      await api('/api/saved-connections', {
        method: 'DELETE',
        data: { id }
      });
    } catch (error) {
      if (!loadStoredConnectionHistory().some((item) => item.id === id)) {
        throw error;
      }
    }
  }

  function renderConnectionHistory() {
    const container = $('savedConnections');
    if (!state.connectionHistory.length) {
      container.innerHTML = '<div class="empty-note">Saved connections will appear here. They are stored in the app database and survive restarts.</div>';
      return;
    }
    container.innerHTML = state.connectionHistory.map((item, index) => (
      `<div class="saved-item"><button class="saved-item-main" data-connection-index="${index}" type="button"><strong>${esc(item.profileName || item.database)}</strong><span>${esc((sourceOptions().find((source) => source.id === item.sourceType)?.label) || item.sourceType)} • ${esc(item.server)} • ${esc(item.database)}</span></button><button class="saved-item-delete" data-delete-index="${index}" type="button">×</button></div>`
    )).join('');
    container.querySelectorAll('[data-connection-index]').forEach((button) => {
      button.onclick = () => applySavedConnectionAndLoadCatalog(state.connectionHistory[Number(button.dataset.connectionIndex)]);
    });
    container.querySelectorAll('[data-delete-index]').forEach((button) => {
      button.onclick = async (event) => {
        event.stopPropagation();
        const index = Number(button.dataset.deleteIndex);
        const item = state.connectionHistory[index];
        if (!item?.id) {
          setStatus('error', 'Saved connection id is missing.');
          return;
        }
        try {
          await deleteSavedConnectionProfile(item.id);
          state.connectionHistory.splice(index, 1);
          saveStoredConnectionHistory(state.connectionHistory);
          renderConnectionHistory();
          setStatus('success', `Deleted saved connection for ${item.profileName || item.database}.`);
        } catch (error) {
          setStatus('error', `Could not delete saved connection: ${error.message}`);
        }
      };
    });
  }

  function applySavedConnection(item) {
    const previousSignature = connectionSignature();
    const previousSessionPassword = window.__dataWorkbenchSessionPassword || $('passwordInput')?.value || '';
    const sourceType = sourceOptions().some((source) => source.id === item.sourceType) ? item.sourceType : 'fabric-sql';
    $('sourceTypeSelect').value = sourceType;
    renderAuthOptions();
    const authMode = authOptionsForSource(sourceType).some((auth) => auth.id === item.authMode) ? item.authMode : $('authModeSelect').value;
    $('authModeSelect').value = authMode;
    syncAuthFields();
    $('serverInput').value = item.server || '';
    $('portInput').value = item.port || '';
    $('databaseInput').value = item.database || '';
    $('usernameInput').value = item.username || '';
    $('trustServerCertificateInput').checked = item.trustServerCertificate !== false;
    const nextSignature = connectionSignature();
    $('passwordInput').value = authMode === 'sqlLogin' && previousSignature === nextSignature
      ? previousSessionPassword
      : '';
    window.__dataWorkbenchSessionPassword = $('passwordInput').value;
    persistActiveConnection();
    renderConnectionSummary();
    setStatus('success', `Loaded saved connection for ${item.profileName || item.database}.`);
  }

  async function applySavedConnectionAndLoadCatalog(item) {
    if (!item) {
      setStatus('error', 'Saved connection could not be loaded.');
      return;
    }

    applySavedConnection(item);
    const profileName = item.profileName || item.database || 'saved profile';
    if (selectedAuthMode() === 'sqlLogin' && !$('passwordInput')?.value) {
      setStatus('neutral', `Loaded ${profileName}. Enter the SQL password, then load the catalog.`);
      return;
    }

    try {
      await loadCatalog();
    } catch (error) {
      renderResultError(error, {
        title: 'Catalog load failed',
        operation: 'catalog'
      });
    }
  }

  async function saveCurrentConnection() {
    const current = storageConnection();
    if (!current.server || !current.database) {
      renderSaveConnectionResult({
        state: 'error',
        title: 'Connection not saved',
        message: 'Enter source, server, and database before saving.'
      });
      setStatus('error', 'Enter source, server, and database before saving.');
      return;
    }

    // Use the profile name input if the user filled it in, else fall back to database name.
    const profileNameRaw = ($('profileNameInput')?.value || '').trim();
    const profileName = profileNameRaw || current.database;

    try {
      let saved;
      try {
        const payload = await api('/api/saved-connections', {
          method: 'POST',
          data: {
            ...current,
            profileName
          }
        });
        saved = normalizeStoredConnection(payload.item || current);
        if (!saved) {
          throw new Error('Saved connection response was invalid.');
        }
        saved.id = payload.item?.id || saved.id;
        saved.profileName = payload.item?.profileName || profileName;
        saved.createdAt = payload.item?.createdAt || '';
        saved.updatedAt = payload.item?.updatedAt || '';
      } catch (error) {
        saved = normalizeStoredConnection({
          ...current,
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
          profileName
        });
        if (!saved) {
          throw error;
        }
      }
      const signature = [saved.sourceType, saved.authMode, saved.server, saved.port, saved.database, saved.username].join('|');
      state.connectionHistory = [saved, ...state.connectionHistory.filter((item) => [item.sourceType, item.authMode, item.server, item.port, item.database, item.username].join('|') !== signature)].slice(0, CONNECTION_HISTORY_MAX);
      saveStoredConnectionHistory(state.connectionHistory);
      renderConnectionHistory();
      // Clear the profile name input after a successful save.
      if ($('profileNameInput')) {
        $('profileNameInput').value = '';
      }
      renderSaveConnectionResult({
        state: 'success',
        title: 'Profile saved',
        message: `"${saved.profileName}" is now in the app database and will survive restarts.`
      });
      // Scroll the saved list into view so the user can see the result.
      setTimeout(() => {
        const savedConnections = $('savedConnections');
        if (typeof savedConnections?.scrollIntoView === 'function') {
          savedConnections.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 80);
      setStatus('success', `Connection profile "${saved.profileName}" saved.`);
    } catch (error) {
      renderSaveConnectionResult({
        state: 'error',
        title: 'Profile not saved',
        message: error.message || 'The connection profile could not be persisted.'
      });
      setStatus('error', `Connection profile could not be saved: ${error.message}`);
    }
  }

  function saveQueryHistory() {
    safeSet(QUERY_HISTORY_KEY, JSON.stringify(state.queryHistory));
  }

  function saveProcedureHistory() {
    safeSet(PROCEDURE_HISTORY_KEY, JSON.stringify(state.procedureHistory));
  }

  function addQueryHistory(query) {
    const clean = String(query || '').trim();
    if (!clean) return;
    const currentConnection = storageConnection();
    state.queryHistory = [{
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      query: clean.slice(0, 20000),
      queryMode: inferQueryMode(clean),
      activeObject: state.activeObject || '',
      activeObjectType: state.activeObjectType || '',
      connectionSignature: connectionSignature(currentConnection),
      database: currentConnection.database || '',
      server: currentConnection.server || '',
      timestamp: new Date().toISOString()
    }, ...state.queryHistory.filter((item) => item.query !== clean)].slice(0, QUERY_HISTORY_MAX);
    saveQueryHistory();
    renderHistoryPanel();
  }

  function addProcedureHistory(procedure, parameters = {}) {
    const cleanProcedure = String(procedure || '').trim();
    if (!cleanProcedure) return;
    const normalizedParameters = Object.fromEntries(
      Object.entries(parameters || {}).map(([key, value]) => [String(key), value == null ? '' : String(value)])
    );
    const currentConnection = storageConnection();
    const signature = `${cleanProcedure}|${connectionSignature(currentConnection)}|${JSON.stringify(normalizedParameters)}`;
    state.procedureHistory = [{
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      procedure: cleanProcedure.slice(0, 512),
      parameters: normalizedParameters,
      connectionSignature: connectionSignature(currentConnection),
      database: currentConnection.database || '',
      server: currentConnection.server || '',
      timestamp: new Date().toISOString()
    }, ...state.procedureHistory.filter((item) => `${item.procedure}|${item.connectionSignature}|${JSON.stringify(item.parameters || {})}` !== signature)].slice(0, QUERY_HISTORY_MAX);
    saveProcedureHistory();
    renderHistoryPanel();
  }

  function procedureHistorySearchText(item) {
    return [
      item.procedure,
      item.database,
      item.server,
      Object.entries(item.parameters || {}).map(([key, value]) => `${key} ${value}`).join(' ')
    ].join(' ').toLowerCase();
  }

  async function restoreQueryHistoryItem(item) {
    if (!item?.query) {
      setStatus('error', 'SQL history item is invalid.');
      return;
    }

    setWorkspace('sql');
    setExplorer('objects');
    const restoredMode = normalizeQueryMode(item.queryMode || inferQueryMode(item.query));

    const savedObject = item.activeObject
      ? findCatalogObjectByKeys([item.activeObject, item.activeObject.split('.').pop()])
      : null;
    const targetObject = savedObject || inferQueryHistoryObject(item.query);
    const currentSignature = connectionSignature();
    const sameConnection = !item.connectionSignature || item.connectionSignature === currentSignature;

    if (targetObject && hasReadyConnection()) {
      if (state.activeObject !== targetObject.fullName) {
        try {
          await selectObject(targetObject.fullName, targetObject.objectType);
        } catch (error) {
          setMode(restoredMode, { regenerate: false });
          setQuery(item.query);
          setStatus('error', `Loaded SQL, but could not restore ${targetObject.fullName}: ${error.message}`);
          return;
        }
      } else {
        renderObjects();
        refreshActiveSummary();
      }

      setMode(restoredMode, { regenerate: false });
      setQuery(item.query);
      renderObjects();
      refreshActiveSummary();
      persistCatalogState();
      setStatus(
        sameConnection ? 'success' : 'neutral',
        sameConnection
          ? `Loaded SQL from history and restored ${targetObject.fullName}.`
          : `Loaded SQL and restored ${targetObject.fullName}. Check the active connection before running.`
      );
      return;
    }

    setMode(restoredMode, { regenerate: false });
    setQuery(item.query);
    refreshActiveSummary();
    setStatus(
      'neutral',
      item.activeObject
        ? `Loaded SQL from history, but ${item.activeObject} was not found in the current catalog.`
        : 'Loaded SQL from history. No matching catalog object was found in the query.'
    );
  }

  function renderQueryHistory() {
    const container = $('queryHistory');
    const filtered = state.historyFilter
      ? state.queryHistory.filter((item) => queryHistorySearchText(item).includes(state.historyFilter))
      : state.queryHistory;
    if (!filtered.length) {
      container.innerHTML = state.historyFilter
        ? '<div class="empty-note">No history matches the search.</div>'
        : '<div class="empty-note">Recent SQL will appear here.</div>';
      return;
    }
    container.innerHTML = filtered.map((item) => `<button class="history-item" data-history-id="${item.id}" type="button" title="${esc(item.query)}"><strong>${esc((item.query.split('\n')[0] || 'Query').slice(0, 54))}</strong><span>${esc(formatTimestamp(item.timestamp))}</span></button>`).join('');
    container.querySelectorAll('[data-history-id]').forEach((button) => {
      button.onclick = () => {
        const item = state.queryHistory.find((candidate) => candidate.id === button.dataset.historyId);
        if (item) {
          restoreQueryHistoryItem(item).catch((error) => setStatus('error', error.message));
        }
      };
    });
  }

  function renderProcedureHistory() {
    const container = $('queryHistory');
    const filtered = state.historyFilter
      ? state.procedureHistory.filter((item) => procedureHistorySearchText(item).includes(state.historyFilter))
      : state.procedureHistory;
    if (!filtered.length) {
      container.innerHTML = state.historyFilter
        ? '<div class="empty-note">No procedure runs match the search.</div>'
        : '<div class="empty-note">Procedure runs will appear here after execution.</div>';
      return;
    }
    container.innerHTML = filtered.map((item) => {
      const parameterCount = Object.values(item.parameters || {}).filter((value) => String(value || '').trim()).length;
      const scope = [item.database, `${parameterCount} value${parameterCount === 1 ? '' : 's'}`].filter(Boolean).join(' • ');
      return `<button class="history-item" data-procedure-history-id="${esc(item.id)}" type="button" title="${esc(item.procedure)}"><strong>${esc(item.procedure.slice(0, 54))}</strong><span>${esc(formatTimestamp(item.timestamp))}${scope ? ` • ${esc(scope)}` : ''}</span></button>`;
    }).join('');
    container.querySelectorAll('[data-procedure-history-id]').forEach((button) => {
      button.onclick = () => {
        const item = state.procedureHistory.find((candidate) => candidate.id === button.dataset.procedureHistoryId);
        if (item) {
          restoreProcedureHistoryItem(item).catch((error) => setStatus('error', error.message));
        }
      };
    });
  }

  function updateHistoryPanelMode() {
    const procedureMode = state.workspace === 'procedure';
    if ($('historyPanelTitle')) {
      $('historyPanelTitle').textContent = procedureMode ? 'Procedure History' : 'Recent SQL';
    }
    if ($('queryHistorySearch')) {
      $('queryHistorySearch').placeholder = procedureMode ? 'Filter procedure runs...' : 'Filter recent queries...';
    }
  }

  function renderHistoryPanel() {
    updateHistoryPanelMode();
    if (state.workspace === 'procedure') {
      renderProcedureHistory();
      return;
    }
    renderQueryHistory();
  }

  function loadQueryHistory() {
    try { state.queryHistory = normalizeQueryHistory(JSON.parse(safeGet(QUERY_HISTORY_KEY) || '[]')); } catch { state.queryHistory = []; }
    renderHistoryPanel();
  }

  function loadProcedureHistory() {
    try { state.procedureHistory = normalizeProcedureHistory(JSON.parse(safeGet(PROCEDURE_HISTORY_KEY) || '[]')); } catch { state.procedureHistory = []; }
    renderHistoryPanel();
  }

  function clearCurrentHistory() {
    if (state.workspace === 'procedure') {
      state.procedureHistory = [];
      saveProcedureHistory();
      renderHistoryPanel();
      setStatus('success', 'Procedure history cleared.');
      return;
    }
    state.queryHistory = [];
    saveQueryHistory();
    renderHistoryPanel();
    setStatus('success', 'Recent SQL history cleared.');
  }

  function resetActiveObject() {
    state.activeObject = null;
    state.activeObjectType = '';
    state.activeColumns = [];
    state.selectedColumns.clear();
    $('columnsPanel').innerHTML = '<div class="empty-note">Load a table or view to see columns.</div>';
    $('selectedColumnsSummary').textContent = 'All columns will be used.';
    $('sortColumnSelect').innerHTML = '<option value="">None</option>';
    $('filtersList').innerHTML = '<div class="empty-note">No filters yet. Add one when you want a WHERE clause.</div>';
    populateJoinColumnOptions();
    updateAdvancedOperationsSummary();
    refreshActiveSummary();
    persistCatalogState();
  }

  function renderExplorerSummary() {
    const source = sourceOptions().find((item) => item.id === connection().sourceType);
    const objectsLabel = state.objects.length ? `${state.objects.length} objects` : 'no objects loaded';
    const proceduresLabel = source?.supportsProcedures ? `${state.procedures.length} procedures` : 'procedures unavailable for this source';
    $('explorerSummary').textContent = `${objectsLabel} • ${proceduresLabel}`;
  }

  function itemStorageId(kind, fullName) {
    return `${kind}:${String(fullName || '').toLowerCase()}`;
  }

  function markRecentItem(kind, fullName) {
    if (!fullName) return;
    state.recentItems[itemStorageId(kind, fullName)] = new Date().toISOString();
    const entries = Object.entries(state.recentItems)
      .sort((left, right) => String(right[1]).localeCompare(String(left[1])))
      .slice(0, 40);
    state.recentItems = Object.fromEntries(entries);
    savePinnedAndRecentItems();
  }

  function togglePinnedItem(kind, fullName) {
    const key = itemStorageId(kind, fullName);
    if (state.pinnedItems[key]) {
      delete state.pinnedItems[key];
    } else {
      state.pinnedItems[key] = { kind, fullName, pinnedAt: new Date().toISOString() };
    }
    savePinnedAndRecentItems();
    renderObjects();
    renderProcedures();
  }

  function isPinned(kind, fullName) {
    return Boolean(state.pinnedItems[itemStorageId(kind, fullName)]);
  }

  function isRecent(kind, fullName) {
    return Boolean(state.recentItems[itemStorageId(kind, fullName)]);
  }

  function populateExplorerFilters() {
    const objectSchemas = [...new Set(state.objects.map((item) => item.schema).filter(Boolean))].sort();
    const procedureSchemas = [...new Set(state.procedures.map((item) => item.schema).filter(Boolean))].sort();
    if ($('objectSchemaFilter')) {
      const current = $('objectSchemaFilter').value;
      $('objectSchemaFilter').innerHTML = '<option value="">All schemas</option>' + objectSchemas.map((schema) => `<option value="${esc(schema)}">${esc(schema)}</option>`).join('');
      $('objectSchemaFilter').value = objectSchemas.includes(current) ? current : '';
    }
    if ($('procedureSchemaFilter')) {
      const current = $('procedureSchemaFilter').value;
      $('procedureSchemaFilter').innerHTML = '<option value="">All schemas</option>' + procedureSchemas.map((schema) => `<option value="${esc(schema)}">${esc(schema)}</option>`).join('');
      $('procedureSchemaFilter').value = procedureSchemas.includes(current) ? current : '';
    }
  }

  function objectMatchesColumnSearch(item, search) {
    if (!search) return true;
    if (item.fullName.toLowerCase().includes(search)) return true;
    const columns = state.objectColumnIndex[String(item.fullName || '').toLowerCase()] || [];
    return columns.some((column) => String(column).toLowerCase().includes(search));
  }

  function applyExplorerFilters() {
    const objectSearch = ($('tableSearchInput')?.value || '').trim().toLowerCase();
    const objectType = $('objectTypeFilter')?.value || '';
    const objectSchema = $('objectSchemaFilter')?.value || '';
    const objectsPinnedOnly = Boolean($('pinnedOnlyObjectsToggle')?.checked);
    const objectsRecentOnly = Boolean($('recentOnlyObjectsToggle')?.checked);
    state.filteredObjects = state.objects
      .filter((item) => !objectType || item.objectType === objectType)
      .filter((item) => !objectSchema || item.schema === objectSchema)
      .filter((item) => !objectsPinnedOnly || isPinned('object', item.fullName))
      .filter((item) => !objectsRecentOnly || isRecent('object', item.fullName))
      .filter((item) => objectMatchesColumnSearch(item, objectSearch))
      .sort((left, right) => {
        const leftPinned = isPinned('object', left.fullName) ? 1 : 0;
        const rightPinned = isPinned('object', right.fullName) ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
        const leftRecent = state.recentItems[itemStorageId('object', left.fullName)] || '';
        const rightRecent = state.recentItems[itemStorageId('object', right.fullName)] || '';
        if (leftRecent !== rightRecent) return String(rightRecent).localeCompare(String(leftRecent));
        return String(left.fullName).localeCompare(String(right.fullName));
      });

    const procedureSearch = ($('procedureSearchInput')?.value || '').trim().toLowerCase();
    const procedureSchema = $('procedureSchemaFilter')?.value || '';
    const proceduresPinnedOnly = Boolean($('pinnedOnlyProceduresToggle')?.checked);
    const proceduresRecentOnly = Boolean($('recentOnlyProceduresToggle')?.checked);
    state.filteredProcedures = state.procedures
      .filter((item) => !procedureSchema || item.schema === procedureSchema)
      .filter((item) => !proceduresPinnedOnly || isPinned('procedure', item.fullName))
      .filter((item) => !proceduresRecentOnly || isRecent('procedure', item.fullName))
      .filter((item) => !procedureSearch || item.fullName.toLowerCase().includes(procedureSearch))
      .sort((left, right) => {
        const leftPinned = isPinned('procedure', left.fullName) ? 1 : 0;
        const rightPinned = isPinned('procedure', right.fullName) ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
        const leftRecent = state.recentItems[itemStorageId('procedure', left.fullName)] || '';
        const rightRecent = state.recentItems[itemStorageId('procedure', right.fullName)] || '';
        if (leftRecent !== rightRecent) return String(rightRecent).localeCompare(String(leftRecent));
        return String(left.fullName).localeCompare(String(right.fullName));
      });
  }

  function renderObjects() {
    const container = $('tableList');
    applyExplorerFilters();
    if (!state.filteredObjects.length) {
      container.innerHTML = '<div class="empty-note">No objects loaded.</div>';
      return;
    }
    container.innerHTML = state.filteredObjects.map((item) => `<button class="table-item ${state.activeObject === item.fullName ? 'active' : ''}" data-object="${esc(item.fullName)}" data-object-type="${esc(item.objectType)}" type="button" aria-label="${esc(`${item.objectType} ${item.fullName}`)}"><strong>${isPinned('object', item.fullName) ? '★ ' : ''}${esc(item.fullName)}</strong><span>${esc(item.objectType)}${isRecent('object', item.fullName) ? ' • recent' : ''}</span><i class="pin-toggle" data-pin-object="${esc(item.fullName)}" aria-label="${esc(isPinned('object', item.fullName) ? 'Unpin object' : 'Pin object')}">★</i></button>`).join('');
    container.querySelectorAll('[data-object]').forEach((button) => {
      button.onclick = () => selectObject(button.dataset.object, button.dataset.objectType).catch((error) => setStatus('error', error.message));
    });
    container.querySelectorAll('[data-pin-object]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        togglePinnedItem('object', button.dataset.pinObject);
      };
    });
  }

  function renderProcedures() {
    const container = $('procedureList');
    applyExplorerFilters();
    if (state.procedureNote) {
      container.innerHTML = `<div class="empty-note">${esc(state.procedureNote)}</div>`;
      return;
    }
    if (!state.filteredProcedures.length) {
      container.innerHTML = '<div class="empty-note">No procedures loaded.</div>';
      return;
    }
    container.innerHTML = state.filteredProcedures.map((item) => `<button class="procedure-item ${state.activeProcedure === item.fullName ? 'active' : ''}" data-procedure="${esc(item.fullName)}" type="button" aria-label="${esc(`procedure ${item.fullName}`)}"><strong>${isPinned('procedure', item.fullName) ? '★ ' : ''}${esc(item.fullName)}</strong><span>Stored procedure${isRecent('procedure', item.fullName) ? ' • recent' : ''}</span><i class="pin-toggle" data-pin-procedure="${esc(item.fullName)}" aria-label="${esc(isPinned('procedure', item.fullName) ? 'Unpin procedure' : 'Pin procedure')}">★</i></button>`).join('');
    container.querySelectorAll('[data-procedure]').forEach((button) => {
      button.onclick = () => selectProcedure(button.dataset.procedure).catch((error) => setStatus('error', error.message));
    });
    container.querySelectorAll('[data-pin-procedure]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        togglePinnedItem('procedure', button.dataset.pinProcedure);
      };
    });
  }

  function filterObjects() {
    renderObjects();
  }

  function filterProcedures() {
    renderProcedures();
  }

  function getFilters() {
    return Array.from(document.querySelectorAll('.filter-row')).map((row) => ({
      column: row.querySelector('.filter-column').value,
      operator: row.querySelector('.filter-operator').value,
      value: row.querySelector('.filter-value').value
    })).filter((item) => item.column && item.operator);
  }

  function renderFilters() {
    if (!$('filtersList').querySelector('.filter-row')) {
      $('filtersList').innerHTML = '<div class="empty-note">No filters yet. Add one when you want a WHERE clause.</div>';
    }
  }

  function createFilterRow(initial = {}) {
    const row = document.createElement('div');
    row.className = 'filter-row';

    const column = document.createElement('select');
    column.className = 'filter-column';
    column.innerHTML = ['<option value="">Column</option>'].concat(state.activeColumns.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`)).join('');
    column.value = initial.column || '';

    const operator = document.createElement('select');
    operator.className = 'filter-operator';
    operator.innerHTML = '<option value="=">=</option><option value="<>">&lt;&gt;</option><option value=">">&gt;</option><option value="<">&lt;</option><option value=">=">&gt;=</option><option value="<=">&lt;=</option><option value="LIKE">LIKE</option><option value="IS NULL">IS NULL</option><option value="IS NOT NULL">IS NOT NULL</option>';
    operator.value = initial.operator || '=';

    const value = document.createElement('input');
    value.className = 'filter-value';
    value.type = 'text';
    value.placeholder = 'Value';
    value.value = initial.value || '';

    const remove = document.createElement('button');
    remove.className = 'ghost-btn small';
    remove.type = 'button';
    remove.textContent = 'Remove';

    const sync = () => {
      const unary = operator.value === 'IS NULL' || operator.value === 'IS NOT NULL';
      value.disabled = unary;
      value.placeholder = unary ? 'Not needed' : 'Value';
      if (unary) value.value = '';
    };
    const refresh = () => {
      sync();
      if (state.activeObject && (state.queryMode === 'select' || state.queryMode === 'update' || state.queryMode === 'delete')) {
        generateQuery();
      } else {
        persistWorkspaceState('sql');
      }
    };

    column.onchange = refresh;
    operator.onchange = refresh;
    value.oninput = refresh;
    value.onchange = refresh;
    remove.onclick = () => {
      row.remove();
      renderFilters();
      refresh();
    };

    sync();
    row.append(column, operator, value, remove);
    return row;
  }

  function addFilter() {
    const list = $('filtersList');
    if (list.querySelector('.empty-note')) list.innerHTML = '';
    const row = createFilterRow();
    list.appendChild(row);
    return row;
  }

  function qObject() {
    if (!state.activeObject) return '';
    const parts = state.activeObject.split('.');
    return parts.length === 2 ? `${bid(parts[0])}.${bid(parts[1])}` : bid(state.activeObject);
  }

  function whereClause(filters) {
    const ready = filters.filter((item) => item.column && item.operator && ((item.operator === 'IS NULL' || item.operator === 'IS NOT NULL') || String(item.value ?? '').trim() !== ''));
    if (!ready.length) return '';
    return `\nWHERE ${ready.map((item) => item.operator === 'IS NULL' || item.operator === 'IS NOT NULL' ? `${bid(item.column)} ${item.operator}` : `${bid(item.column)} ${item.operator} ${item.operator === 'LIKE' ? quoteValue(`%${String(item.value || '').trim()}%`) : quoteValue(item.value)}`).join('\n  AND ')}`;
  }

  function completedFilters(filters = getFilters()) {
    return filters.filter((item) => item.column && item.operator && ((item.operator === 'IS NULL' || item.operator === 'IS NOT NULL') || String(item.value ?? '').trim() !== ''));
  }

  function selectedColumns() {
    if (!state.selectedColumns.size) {
      return state.activeColumns.map((column) => column.name);
    }
    return state.activeColumns
      .map((column) => column.name)
      .filter((columnName) => state.selectedColumns.has(columnName));
  }

  function updateSelectedColumnsSummary() {
    if (!state.selectedColumns.size) {
      $('selectedColumnsSummary').textContent = 'All columns will be used.';
      return;
    }
    const columns = [...state.selectedColumns];
    $('selectedColumnsSummary').textContent = `${columns.length} selected: ${columns.slice(0, 4).join(', ')}${columns.length > 4 ? '…' : ''}`;
  }

  function advancedSourceObject() {
    return $('advancedSourceObjectSelect')?.value || '';
  }

  function targetJoinColumn() {
    return $('targetJoinColumnSelect')?.value || '';
  }

  function sourceJoinColumn() {
    const manual = $('sourceJoinColumnInput')?.value.trim();
    return manual || targetJoinColumn();
  }

  function advancedTemplateColumns() {
    const columns = selectedColumns();
    return columns.length ? columns : state.activeColumns.map((column) => column.name);
  }

  function populateAdvancedObjectOptions() {
    const select = $('advancedSourceObjectSelect');
    if (!select) {
      return;
    }
    const current = select.value;
    const options = state.objects
      .filter((item) => item.fullName !== state.activeObject)
      .map((item) => `<option value="${esc(item.fullName)}">${esc(item.fullName)}</option>`);
    select.innerHTML = ['<option value="">Select loaded object</option>', ...options].join('');
    if (current && state.objects.some((item) => item.fullName === current && item.fullName !== state.activeObject)) {
      select.value = current;
    }
    updateAdvancedOperationsSummary();
  }

  function populateJoinColumnOptions() {
    const targetSelect = $('targetJoinColumnSelect');
    if (!targetSelect) {
      return;
    }
    const current = targetSelect.value;
    targetSelect.innerHTML = ['<option value="">Select target key</option>']
      .concat(state.activeColumns.map((column) => `<option value="${esc(column.name)}">${esc(column.name)}</option>`))
      .join('');
    if (current && state.activeColumns.some((column) => column.name === current)) {
      targetSelect.value = current;
    } else if (state.activeColumns.length) {
      targetSelect.value = state.activeColumns[0].name;
    }
    if ($('sourceJoinColumnInput') && !$('sourceJoinColumnInput').value.trim()) {
      $('sourceJoinColumnInput').value = targetSelect.value || '';
    }
    updateAdvancedOperationsSummary();
  }

  function updateAdvancedOperationsSummary() {
    const summary = $('advancedOperationsSummary');
    if (!summary) {
      return;
    }
    if (!state.activeObject) {
      summary.textContent = 'Choose a target object first. Cross-object templates need the current object metadata.';
      return;
    }
    const sourceObject = advancedSourceObject();
    const joinKey = targetJoinColumn();
    const pieces = [
      `Target: ${state.activeObject}`,
      sourceObject ? `Source: ${sourceObject}` : 'Source: choose a loaded companion object',
      joinKey ? `Join key: ${joinKey}${sourceJoinColumn() && sourceJoinColumn() !== joinKey ? ` -> ${sourceJoinColumn()}` : ''}` : 'Join key: choose a target key'
    ];
    summary.textContent = pieces.join(' • ');
  }

  function populateColumnInputs() {
    const existingFilters = getFilters();
    $('sortColumnSelect').innerHTML = ['<option value="">None</option>'].concat(state.activeColumns.map((column) => `<option value="${esc(column.name)}">${esc(column.name)}</option>`)).join('');
    $('filtersList').innerHTML = '';
    existingFilters.filter((filter) => state.activeColumns.some((column) => column.name === filter.column)).forEach((filter) => $('filtersList').appendChild(createFilterRow(filter)));
    renderFilters();
    populateJoinColumnOptions();
  }

  function renderColumns() {
    const container = $('columnsPanel');
    const panel = container?.closest('.builder-panel-columns');
    if (!state.activeColumns.length) {
      if (panel) {
        panel.dataset.columnsState = 'empty';
      }
      container.innerHTML = '<div class="empty-note">No columns found.</div>';
      $('selectedColumnsSummary').textContent = 'All columns will be used.';
      return;
    }
    if (panel) {
      panel.dataset.columnsState = 'loaded';
    }
    container.innerHTML = state.activeColumns.map((column) => `<button class="column-pill ${state.selectedColumns.has(column.name) ? 'active' : ''}" data-column="${esc(column.name)}" type="button"><strong>${esc(column.name)}</strong><span>${esc(column.type)}${column.nullable ? '' : ' • not null'}</span></button>`).join('');
    container.querySelectorAll('[data-column]').forEach((button) => {
      button.onclick = () => {
        state.selectedColumns.has(button.dataset.column) ? state.selectedColumns.delete(button.dataset.column) : state.selectedColumns.add(button.dataset.column);
        renderColumns();
        if (state.activeObject) generateQuery();
      };
    });
    updateSelectedColumnsSummary();
    updateAdvancedOperationsSummary();
  }

  function buildSelect() {
    const columns = selectedColumns();
    const top = Math.max(1, Math.min(5000, Number($('topRowsInput').value || 100)));
    const distinct = $('distinctSelect').value === 'true' ? 'DISTINCT ' : '';
    const order = $('sortColumnSelect').value ? `\nORDER BY ${bid($('sortColumnSelect').value)} ${$('sortDirectionSelect').value || 'DESC'}` : '';
    return `SELECT ${distinct}TOP (${top})\n       ${columns.length ? columns.map(bid).join(',\n       ') : '*'}\nFROM ${qObject()}${whereClause(getFilters())}${order};`;
  }

  function buildCount() {
    return `SELECT COUNT(*) AS row_count\nFROM ${qObject()}${whereClause(getFilters())};`;
  }

  function buildInsert() {
    const columns = selectedColumns();
    if (!columns.length) return '-- Select a table or view and at least one column first.';
    return `INSERT INTO ${qObject()} (\n    ${columns.map(bid).join(',\n    ')}\n)\nVALUES (\n    ${columns.map((column) => templateLiteralForColumn(column)).join(',\n    ')}\n);`;
  }

  function buildUpdate() {
    const columns = selectedColumns();
    if (!columns.length) return '-- Select a table or view and columns first.';
    const readyFilters = completedFilters();
    const filteredColumns = new Set(readyFilters.map((filter) => filter.column));
    const setColumns = columns.filter((column) => !filteredColumns.has(column));
    const updateColumns = setColumns.length ? setColumns : columns;
    if (!updateColumns.length) {
      return '-- Select one or more columns to update.';
    }
    if (!readyFilters.length) {
      return `-- UPDATE requires at least one completed filter.\nUPDATE ${qObject()}\nSET ${updateColumns.map((column) => `${bid(column)} = ${templateLiteralForColumn(column)}`).join(',\n    ')}\nWHERE <add filter>;`;
    }
    return `UPDATE ${qObject()}\nSET ${updateColumns.map((column) => `${bid(column)} = ${templateLiteralForColumn(column)}`).join(',\n    ')}${whereClause(readyFilters)};`;
  }

  function buildDelete() {
    const clause = whereClause(getFilters());
    if (!clause) return `-- DELETE requires at least one completed filter.\nDELETE FROM ${qObject()}\nWHERE <add filter>;`;
    return `DELETE FROM ${qObject()}${clause};`;
  }

  function buildInsertSelectTemplate() {
    const sourceObject = advancedSourceObject();
    const columns = advancedTemplateColumns();
    if (!state.activeObject) return '-- Select a target object first.';
    if (!sourceObject) return '-- Choose a source object from the loaded catalog first.';
    if (!columns.length) return '-- Select one or more columns first.';
    return `INSERT INTO ${qObject()} (\n    ${columns.map(bid).join(',\n    ')}\n)\nSELECT\n    ${columns.map((column) => `src.${bid(column)}`).join(',\n    ')}\nFROM ${qObjectFromFullName(sourceObject)} AS src\n-- Add source filters before running this insert-select template\n;`;
  }

  function qObjectFromFullName(fullName) {
    if (!fullName) return '';
    const parts = String(fullName).split('.');
    return parts.length === 2 ? `${bid(parts[0])}.${bid(parts[1])}` : bid(fullName);
  }

  function buildUpdateJoinTemplate() {
    const sourceObject = advancedSourceObject();
    const keyColumn = targetJoinColumn();
    const sourceKey = sourceJoinColumn();
    const columns = advancedTemplateColumns().filter((column) => column !== keyColumn);
    if (!state.activeObject) return '-- Select a target object first.';
    if (!sourceObject) return '-- Choose a source object from the loaded catalog first.';
    if (!keyColumn) return '-- Choose a target key column first.';
    if (!columns.length) return '-- Select one or more non-key columns to update.';
    return `UPDATE tgt\nSET ${columns.map((column) => `tgt.${bid(column)} = src.${bid(column)}`).join(',\n    ')}\nFROM ${qObject()} AS tgt\nINNER JOIN ${qObjectFromFullName(sourceObject)} AS src\n    ON tgt.${bid(keyColumn)} = src.${bid(sourceKey || keyColumn)}\nWHERE <review scope before execution>;`;
  }

  function buildMergePreviewTemplate() {
    const sourceObject = advancedSourceObject();
    const keyColumn = targetJoinColumn();
    const sourceKey = sourceJoinColumn();
    const columns = advancedTemplateColumns();
    const updatableColumns = columns.filter((column) => column !== keyColumn);
    if (!state.activeObject) return '-- Select a target object first.';
    if (!sourceObject) return '-- Choose a source object from the loaded catalog first.';
    if (!keyColumn) return '-- Choose a target key column first.';
    if (!columns.length) return '-- Select one or more columns first.';
    return `-- MERGE execution is blocked in this app. Review this template outside the preview-first runner before use.\nMERGE ${qObject()} AS tgt\nUSING ${qObjectFromFullName(sourceObject)} AS src\n    ON tgt.${bid(keyColumn)} = src.${bid(sourceKey || keyColumn)}\nWHEN MATCHED THEN\n    UPDATE SET ${updatableColumns.length ? updatableColumns.map((column) => `tgt.${bid(column)} = src.${bid(column)}`).join(',\n               ') : '-- no non-key columns selected'}\nWHEN NOT MATCHED BY TARGET THEN\n    INSERT (\n        ${columns.map(bid).join(',\n        ')}\n    )\n    VALUES (\n        ${columns.map((column) => `src.${bid(column)}`).join(',\n        ')}\n    )\n-- WHEN NOT MATCHED BY SOURCE THEN <optional cleanup clause>\n;`;
  }

  function currentPageMode() {
    const shellMode = document.querySelector('.app-shell')?.dataset.pageMode;
    if (shellMode === 'procedures' || shellMode === 'sql') {
      return shellMode;
    }
    return /\/procedures(?:\/|$)/i.test(window.location.pathname || '') ? 'procedures' : 'sql';
  }

  function setWorkspace(workspace) {
    const nextWorkspace = workspace === 'procedure' ? 'procedure' : 'sql';
    if (state.workspace && state.workspace !== nextWorkspace) {
      persistWorkspaceState(state.workspace);
    }
    state.workspace = nextWorkspace;
    $('sqlWorkspace')?.classList.toggle('hidden', state.workspace !== 'sql');
    $('procedureWorkspace')?.classList.toggle('hidden', state.workspace !== 'procedure');
    document.querySelectorAll('.workspace-segment').forEach((button) => {
      button.classList.toggle('active', button.dataset.workspace === state.workspace);
    });
    state.historyFilter = '';
    if ($('queryHistorySearch')) {
      $('queryHistorySearch').value = '';
    }
    renderHistoryPanel();
  }

  function setExplorer(explorer) {
    state.explorer = explorer === 'procedures' ? 'procedures' : 'objects';
    $('objectsExplorer')?.classList.toggle('hidden', state.explorer !== 'objects');
    $('procedureExplorer')?.classList.toggle('hidden', state.explorer !== 'procedures');
    document.querySelectorAll('.explorer-segment').forEach((button) => {
      button.classList.toggle('active', button.dataset.explorer === state.explorer);
    });
  }

  function textareaEditorAdapter() {
    const editor = $('queryEditor');
    return {
      kind: 'textarea',
      getValue: () => editor?.value || '',
      setValue: (value) => {
        if (editor) editor.value = String(value || '');
      },
      getSelection: () => ({
        start: Number(editor?.selectionStart || 0),
        end: Number(editor?.selectionEnd || 0)
      }),
      setSelection: (start, end = start) => editor?.setSelectionRange?.(start, end),
      getScroll: () => ({
        top: Number(editor?.scrollTop || 0),
        left: Number(editor?.scrollLeft || 0)
      }),
      setScroll: (top, left) => {
        if (editor) {
          editor.scrollTop = Number(top || 0);
          editor.scrollLeft = Number(left || 0);
        }
      },
      focus: () => editor?.focus?.()
    };
  }

  function initEditorAdapter() {
    state.editorAdapter = textareaEditorAdapter();
    const container = $('editorContainer');
    if (window.monaco?.editor && container && !$('monacoQueryEditor')) {
      try {
        const editor = $('queryEditor');
        const monacoHost = document.createElement('div');
        monacoHost.id = 'monacoQueryEditor';
        monacoHost.className = 'monaco-query-editor';
        monacoHost.style.minHeight = `${Math.max(260, editor?.clientHeight || 320)}px`;
        container.appendChild(monacoHost);
        const monacoEditor = window.monaco.editor.create(monacoHost, {
          value: editor?.value || '',
          language: 'sql',
          minimap: { enabled: false },
          automaticLayout: true,
          fontSize: Math.round(state.editorTextSize * 15),
          theme: 'vs-dark'
        });
        editor?.classList.add('hidden');
        $('queryEditorBackdrop')?.classList.add('hidden');
        monacoEditor.onDidChangeModelContent(() => {
          updateEditorStats();
          persistWorkspaceState('sql');
        });
        state.editorAdapter = {
          kind: 'monaco',
          getValue: () => monacoEditor.getValue(),
          setValue: (value) => monacoEditor.setValue(String(value || '')),
          getSelection: () => {
            const model = monacoEditor.getModel();
            const selection = monacoEditor.getSelection();
            return {
              start: model.getOffsetAt(selection.getStartPosition()),
              end: model.getOffsetAt(selection.getEndPosition())
            };
          },
          setSelection: (start, end = start) => {
            const model = monacoEditor.getModel();
            const startPos = model.getPositionAt(Number(start || 0));
            const endPos = model.getPositionAt(Number(end || start || 0));
            monacoEditor.setSelection(new window.monaco.Selection(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column));
          },
          getScroll: () => ({ top: monacoEditor.getScrollTop(), left: monacoEditor.getScrollLeft() }),
          setScroll: (top, left) => {
            monacoEditor.setScrollTop(Number(top || 0));
            monacoEditor.setScrollLeft(Number(left || 0));
          },
          focus: () => monacoEditor.focus()
        };
        setStatus('neutral', 'Monaco SQL editor active.');
      } catch (error) {
        console.warn('Monaco editor initialization failed; using textarea fallback.', error);
        state.editorAdapter = textareaEditorAdapter();
      }
    }
  }

  function editorAdapter() {
    if (!state.editorAdapter) {
      initEditorAdapter();
    }
    return state.editorAdapter || textareaEditorAdapter();
  }

  function getQuery() {
    return editorAdapter().getValue();
  }

  function highlightSql(text) {
    if (!text) return '';
    
    const upper = text.toUpperCase();
    const isUpdateOrDelete = upper.includes('UPDATE ') || upper.includes('DELETE FROM ') || upper.includes('DELETE ');
    const hasWhere = upper.includes('WHERE ');
    const isMissingWhere = isUpdateOrDelete && !hasWhere;
    const hasDanger = upper.includes('DROP ') || upper.includes('TRUNCATE ');

    let html = '';
    let inString = false;
    let currentString = '';
    let currentCode = '';

    const flushCode = () => {
      if (!currentCode) return '';
      let codeHtml = esc(currentCode);
      
      codeHtml = codeHtml.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="sql-number">$1</span>');
      
      const keywords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'ON', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'TOP', 'DISTINCT', 'MERGE', 'DROP', 'TRUNCATE', 'CREATE', 'ALTER', 'EXEC', 'EXECUTE', 'WITH', 'THEN', 'WHEN', 'MATCHED', 'USING', 'ASC', 'DESC'];
      const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
      codeHtml = codeHtml.replace(keywordRegex, '<span class="sql-keyword">$&</span>');
      
      const functions = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CAST', 'CONVERT', 'TRY_CONVERT', 'ISNULL', 'COALESCE', 'NULLIF', 'CONCAT', 'REPLACE', 'TRIM', 'LTRIM', 'RTRIM', 'DATEADD', 'DATEDIFF', 'HASHBYTES', 'UPPER', 'LOWER', 'LEFT', 'RIGHT', 'SUBSTRING'];
      const funcRegex = new RegExp(`\\b(${functions.join('|')})\\b(?=\\s*\\()`, 'gi');
      codeHtml = codeHtml.replace(funcRegex, '<span class="sql-function">$&</span>');

      return codeHtml;
    };

    for (let i = 0; i < text.length; i++) {
      if (text[i] === "'") {
        if (!inString) {
          html += flushCode();
          currentCode = '';
          inString = true;
          currentString = "'";
        } else {
          if (i + 1 < text.length && text[i + 1] === "'") {
            currentString += "''";
            i++;
          } else {
            currentString += "'";
            html += '<span class="sql-string">' + esc(currentString) + '</span>';
            currentString = '';
            inString = false;
          }
        }
      } else {
        if (inString) currentString += text[i];
        else currentCode += text[i];
      }
    }
    
    if (inString) html += '<span class="sql-string">' + esc(currentString) + '</span>';
    else html += flushCode();

    if (isMissingWhere) {
      html = html.replace(/(UPDATE |DELETE FROM |DELETE )/i, '<span class="sql-error-underline" title="Missing WHERE clause">$&</span>');
    }
    if (hasDanger) {
      html = html.replace(/(DROP |TRUNCATE )/i, '<span class="sql-error-underline" title="Destructive command detected">$&</span>');
    }

    return html;
  }

  function syncEditorBackdrop() {
    if (state.editorAdapter?.kind === 'monaco') return;
    const editor = $('queryEditor');
    const backdrop = $('queryEditorBackdrop');
    if (!editor || !backdrop) return;
    backdrop.innerHTML = highlightSql(editor.value) + '<br/>'; // Extra break for final newline scroll
    backdrop.scrollTop = editor.scrollTop;
    backdrop.scrollLeft = editor.scrollLeft;
  }

  function setQuery(query) {
    editorAdapter().setValue(String(query || ''));
    syncEditorBackdrop();
    updateEditorStats();
    persistWorkspaceState('sql');
  }

  function hasReadyConnection() {
    const current = connection();
    return Boolean(current.server && current.database);
  }

  function ensureReadyConnection(action) {
    if (hasReadyConnection()) {
      return true;
    }
    setStatus('error', `Enter server and database before ${action}.`);
    return false;
  }

  function currentActionSummary(query = getQuery()) {
    const clean = String(query || '')
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
    const action = (clean.match(/^([a-z]+)/i)?.[1] || '').toUpperCase() || 'NONE';
    const risk = ['DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'MERGE', 'EXEC', 'EXECUTE'].includes(action)
      ? 'High'
      : ['INSERT', 'UPDATE', 'DELETE'].includes(action)
        ? 'Write'
        : action === 'SELECT' || action === 'WITH'
          ? 'Read'
          : 'Review';
    return { action, risk, chars: String(query || '').length, lines: String(query || '').split(/\r?\n/).length };
  }

  function activeFilterCount() {
    try {
      return getFilters().filter((item) => item.column && item.operator).length;
    } catch {
      return 0;
    }
  }

  function sqlExplanationRows() {
    const summary = currentActionSummary();
    return [
      ['Action', summary.action],
      ['Risk', summary.risk],
      ['Builder mode', state.queryMode],
      ['Target object', state.activeObject || state.activeProcedure || 'none selected'],
      ['Selected columns', state.selectedColumns.size ? `${state.selectedColumns.size} selected` : 'all/default'],
      ['Filters', `${activeFilterCount()} configured`],
      ['Editor size', `${summary.lines} lines / ${summary.chars} chars`]
    ];
  }

  function renderInfoGrid(container, rows) {
    if (!container) {
      return;
    }
    container.innerHTML = rows.map(([label, value]) => (
      `<div class="tools-info"><strong>${esc(label)}</strong><span>${esc(value ?? '')}</span></div>`
    )).join('');
  }

  function capabilityRows() {
    const source = sourceOptions().find((item) => item.id === selectedSourceType());
    const hasObjects = state.objects.length > 0;
    const hasProcedures = state.procedures.length > 0;
    return [
      ['Catalog', hasObjects ? `${state.objects.length} objects loaded` : 'Load catalog to inspect objects'],
      ['Procedures', source?.supportsProcedures === false ? 'Not supported by selected source' : hasProcedures ? `${state.procedures.length} loaded` : 'Supported when catalog is loaded'],
      ['Object scripts', hasObjects || hasProcedures ? 'Available from loaded metadata' : 'Available after catalog load'],
      ['Estimated plan', selectedSourceType() === 'fabric-lakehouse' ? 'May be unsupported' : 'Read-only request path'],
      ['Audit', 'Local audited reads/writes available']
    ];
  }

  function renderCapabilities() {
    const panel = $('capabilityPanel');
    if (!panel) {
      return;
    }
    panel.innerHTML = capabilityRows().map(([label, value]) => (
      `<span class="visual-chip"><strong>${esc(label)}</strong><span>${esc(value)}</span></span>`
    )).join('');
  }

  function diagnosticRows() {
    const current = connection();
    const version = state.versionInfo || {};
    return [
      ['Version', version.version ? `v${version.version}${version.localCommitShort ? ` (${version.localCommitShort})` : ''}` : 'unknown'],
      ['Build/update', version.updateAvailable ? `Update available ${version.latestCommitShort || ''}` : version.updateCheckAvailable === false ? 'Update check unavailable' : 'Current or unchecked'],
      ['Source', `${sourceOptions().find((item) => item.id === current.sourceType)?.label || current.sourceType} / ${authOptionsForSource(current.sourceType).find((item) => item.id === current.authMode)?.label || current.authMode}`],
      ['Server/database', [current.server || 'no server', current.database || 'no database'].join(' / ')],
      ['Catalog', `${state.objects.length} objects / ${state.procedures.length} procedures`],
      ['Results', `${state.resultTabs.length}/${RESULT_TABS_MAX} result tabs`],
      ['Audit log', 'Filtered viewer and CSV export available'],
      ['Session', lifecycleSessionId().slice(0, 12)]
    ];
  }

  function diagnosticsPayload() {
    return {
      version: state.versionInfo || null,
      connection: storageConnection(),
      catalog: {
        objects: state.objects.length,
        procedures: state.procedures.length,
        activeObject: state.activeObject,
        activeProcedure: state.activeProcedure
      },
      editor: Object.fromEntries(sqlExplanationRows()),
      capabilities: Object.fromEntries(capabilityRows()),
      results: {
        tabs: state.resultTabs.length,
        maxTabs: RESULT_TABS_MAX,
        rows: state.results.rows.length,
        columns: state.results.columns.length
      }
    };
  }

  function loadScratchpads() {
    try {
      const parsed = JSON.parse(safeGet(SCRATCHPADS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
    } catch {
      return [];
    }
  }

  function saveScratchpads(items) {
    safeSet(SCRATCHPADS_KEY, JSON.stringify((items || []).slice(0, 10)));
  }

  function saveCurrentScratchpad() {
    const query = getQuery().trim();
    if (!query) {
      setStatus('error', 'Write SQL before saving a scratchpad.');
      return;
    }
    const summary = currentActionSummary(query);
    const name = window.prompt('Scratchpad name', `${summary.action} ${state.activeObject || state.activeProcedure || 'SQL'}`.trim());
    if (!name) {
      return;
    }
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: String(name).slice(0, 80),
      query: query.slice(0, 20000),
      connectionSignature: connectionSignature(),
      database: connection().database,
      savedAt: new Date().toISOString()
    };
    saveScratchpads([item, ...loadScratchpads().filter((existing) => existing.name !== item.name)]);
    renderScratchpads();
    setStatus('success', `Scratchpad "${item.name}" saved.`);
  }

  function renderScratchpads() {
    const list = $('scratchpadList');
    if (!list) {
      return;
    }
    const items = loadScratchpads();
    if (!items.length) {
      list.innerHTML = '<div class="empty-note">Saved SQL scratchpads will appear here.</div>';
      return;
    }
    list.innerHTML = items.map((item) => (
      `<div class="tools-item"><div><strong>${esc(item.name)}</strong><span>${esc(item.database || 'local')} • ${esc(formatTimestamp(item.savedAt))}</span></div><button class="ghost-btn" data-load-scratchpad="${esc(item.id)}" type="button">Load</button><button class="ghost-btn" data-delete-scratchpad="${esc(item.id)}" type="button">Delete</button></div>`
    )).join('');
    list.querySelectorAll('[data-load-scratchpad]').forEach((button) => {
      button.onclick = () => {
        const item = loadScratchpads().find((scratchpad) => scratchpad.id === button.dataset.loadScratchpad);
        if (!item) return;
        setQuery(item.query || '');
        closeWorkbenchTools();
        setStatus('success', `Scratchpad "${item.name}" loaded.`);
      };
    });
    list.querySelectorAll('[data-delete-scratchpad]').forEach((button) => {
      button.onclick = () => {
        const next = loadScratchpads().filter((scratchpad) => scratchpad.id !== button.dataset.deleteScratchpad);
        saveScratchpads(next);
        renderScratchpads();
        setStatus('success', 'Scratchpad deleted.');
      };
    });
  }

  function commandActions() {
    return [
      { id: 'load-catalog', label: 'Load catalog', detail: 'Refresh objects and procedures for the current connection.', shortcut: 'Catalog', run: () => loadCatalog().catch((error) => renderResultError(error, { title: 'Catalog load failed', operation: 'catalog' })) },
      { id: 'run-query', label: 'Run query', detail: 'Use the existing query execution and confirmation path.', shortcut: 'Ctrl+Enter', run: () => runQuery().catch((error) => setStatus('error', error.message)) },
      { id: 'format-sql', label: 'Format SQL', detail: 'Format the current SQL editor text.', shortcut: 'Ctrl+Shift+F', run: () => formatSql() },
      { id: 'save-scratchpad', label: 'Save scratchpad', detail: 'Store the current SQL locally for quick restore.', shortcut: 'Local', run: () => saveCurrentScratchpad() },
      { id: 'audit', label: 'Open audit filters', detail: 'Load or filter recent audit events.', shortcut: 'Audit', run: () => openAuditFilters() },
      { id: 'profile', label: 'Profile active object', detail: 'Run read-only object profiling.', shortcut: 'Read', run: () => loadObjectProfile().catch((error) => setStatus('error', error.message)) },
      { id: 'dependencies', label: 'Dependency view', detail: 'Load read-only dependency metadata.', shortcut: 'Read', run: () => loadDependencyView().catch((error) => setStatus('error', error.message)) },
      { id: 'script-edit', label: 'Script ALTER/Edit', detail: 'Load editable script for the active object/procedure.', shortcut: 'DDL', run: () => scriptActiveDefinition('alter').catch((error) => setStatus('error', error.message)) }
    ];
  }

  function renderCommandPalette() {
    const list = $('commandPaletteList');
    if (!list) return;
    const filter = String($('commandSearchInput')?.value || '').trim().toLowerCase();
    const commands = commandActions().filter((command) =>
      !filter || `${command.label} ${command.detail} ${command.shortcut}`.toLowerCase().includes(filter)
    );
    list.innerHTML = commands.map((command) => (
      `<button class="tools-command" data-command="${esc(command.id)}" type="button"><span><strong>${esc(command.label)}</strong><br>${esc(command.detail)}</span><kbd>${esc(command.shortcut)}</kbd></button>`
    )).join('') || '<div class="empty-note">No actions match this search.</div>';
    list.querySelectorAll('[data-command]').forEach((button) => {
      button.onclick = () => {
        const command = commandActions().find((item) => item.id === button.dataset.command);
        if (!command) return;
        closeWorkbenchTools();
        command.run();
      };
    });
  }

  function renderWorkbenchTools() {
    renderCommandPalette();
    renderInfoGrid($('sqlExplainPanel'), sqlExplanationRows());
    renderCapabilities();
    renderScratchpads();
    renderInfoGrid($('diagnosticsPanel'), diagnosticRows());
  }

  function openWorkbenchTools() {
    const dialog = $('workbenchToolsDialog');
    if (!dialog) return;
    renderWorkbenchTools();
    dialog.classList.remove('hidden');
    dialog.setAttribute('aria-hidden', 'false');
    $('commandSearchInput')?.focus();
  }

  function closeWorkbenchTools() {
    const dialog = $('workbenchToolsDialog');
    if (!dialog) return;
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
  }

  function copyDiagnostics() {
    copyText(JSON.stringify(diagnosticsPayload(), null, 2), 'Diagnostics copied to clipboard.');
  }

  function supportFieldValue(id) {
    return String($(id)?.value || '').trim();
  }

  function selectedScreenshotName() {
    const file = $('supportScreenshotInput')?.files?.[0];
    return file?.name || '';
  }

  function updateSupportScreenshotNote() {
    const note = $('supportScreenshotNote');
    if (!note) return;
    const fileName = selectedScreenshotName();
    note.textContent = fileName
      ? `Selected: ${fileName}. Attach it manually in the email draft before sending.`
      : 'Optional. The email draft will remind you to attach the selected screenshot.';
  }

  function supportDiagnosticsText() {
    const current = storageConnection();
    const summary = currentActionSummary();
    const version = state.versionInfo || {};
    const diagnostics = {
      version: version.version ? `v${version.version}` : 'unknown',
      commit: version.localCommitShort || 'unknown',
      workspace: state.workspace,
      sourceType: current.sourceType,
      authMode: current.authMode,
      server: current.server || 'not set',
      database: current.database || 'not set',
      activeObject: state.activeObject || '',
      activeProcedure: state.activeProcedure || '',
      queryAction: summary.action,
      queryRisk: summary.risk,
      querySize: `${summary.lines} lines / ${summary.chars} chars`,
      catalog: `${state.objects.length} objects / ${state.procedures.length} procedures`,
      resultTabs: `${state.resultTabs.length}/${RESULT_TABS_MAX}`,
      theme: state.currentTheme,
      browser: navigator.userAgent,
      time: new Date().toISOString()
    };
    return Object.entries(diagnostics).map(([key, value]) => `${key}: ${value}`).join('\n');
  }

  function buildSupportReport() {
    const title = supportFieldValue('supportTitleInput') || 'Data Workbench support report';
    const screenshot = selectedScreenshotName();
    const includeDiagnostics = $('supportDiagnosticsInput')?.checked !== false;
    const lines = [
      `Title: ${title}`,
      `Area: ${supportFieldValue('supportAreaSelect') || 'Other'}`,
      `Severity: ${supportFieldValue('supportSeveritySelect') || 'Bug'}`,
      `Reporter name: ${supportFieldValue('supportNameInput') || 'Not provided'}`,
      `Reporter email: ${supportFieldValue('supportEmailInput') || 'Not provided'}`,
      '',
      'What happened:',
      supportFieldValue('supportDescriptionInput') || 'Not provided',
      '',
      'Steps to reproduce:',
      supportFieldValue('supportStepsInput') || 'Not provided',
      '',
      'Screenshot:',
      screenshot ? `${screenshot} selected. Please attach it to this email before sending.` : 'No screenshot selected.'
    ];
    if (includeDiagnostics) {
      lines.push('', 'Safe diagnostics:', supportDiagnosticsText());
    }
    lines.push('', 'No passwords, client secrets, or saved credentials are included by this report form.');
    return { title, body: lines.join('\n') };
  }

  function openSupportDialog() {
    const dialog = $('supportDialog');
    if (!dialog) return;
    updateSupportScreenshotNote();
    dialog.classList.remove('hidden');
    dialog.setAttribute('aria-hidden', 'false');
    $('supportTitleInput')?.focus();
  }

  function closeSupportDialog() {
    const dialog = $('supportDialog');
    if (!dialog) return;
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
  }

  function copySupportReport() {
    const report = buildSupportReport();
    copyText(report.body, 'Support report copied. Paste it into an email if the draft does not open.');
  }

  function sendSupportReport() {
    const report = buildSupportReport();
    copyText(report.body, 'Support report copied. Review the email draft before sending.');
    const subject = encodeURIComponent(`[Data Workbench] ${report.title}`);
    const body = encodeURIComponent(report.body);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  function refreshActiveSummary() {
    const target = $('activeTarget');
    const meta = $('activeMeta');
    if (!target || !meta) {
      return;
    }

    if (state.workspace === 'procedure' && state.activeProcedure) {
      target.textContent = state.activeProcedure;
      meta.textContent = `Procedure selected with ${state.procedureParameters.length} discovered parameter${state.procedureParameters.length === 1 ? '' : 's'}. Execution stays behind review and button confirmation.`;
      return;
    }

    if (state.activeObject) {
      target.textContent = state.activeObject;
      meta.textContent = `${state.activeObjectType || 'object'} selected with ${state.activeColumns.length} loaded column${state.activeColumns.length === 1 ? '' : 's'}.`;
      return;
    }

    target.textContent = 'No object or procedure selected';
    meta.textContent = state.workspace === 'procedure'
      ? 'Connect to a source and load procedures to execute routines with clear parameter inspection and button confirmation.'
      : 'Connect to a source and load a catalog to build, inspect, and run SQL with stronger guardrails.';
  }

  function applyTheme(themeId) {
    state.currentTheme = THEMES.includes(themeId) ? themeId : 'midnight';
    document.documentElement.setAttribute('data-theme', state.currentTheme);
    safeSet(THEME_KEY, state.currentTheme);
    const list = $('themeList');
    if (!list) {
      return;
    }
    list.querySelectorAll('.theme-chip').forEach((button) => {
      const active = button.dataset.theme === state.currentTheme;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function loadTheme() {
    const list = $('themeList');
    state.currentTheme = THEMES.includes(safeGet(THEME_KEY)) ? safeGet(THEME_KEY) : 'midnight';
    if (list) {
      list.innerHTML = THEMES.map((theme) => (
        `<button class="theme-chip${theme === state.currentTheme ? ' active' : ''}" data-theme="${theme}" type="button" aria-pressed="${theme === state.currentTheme ? 'true' : 'false'}"><span class="theme-dot theme-dot-${theme}" aria-hidden="true"></span><span>${theme[0].toUpperCase() + theme.slice(1)}</span></button>`
      )).join('');
      list.querySelectorAll('.theme-chip').forEach((button) => {
        button.onclick = () => {
          applyTheme(button.dataset.theme);
          setStatus('success', `Theme changed to ${button.dataset.theme}.`);
        };
      });
    }
    applyTheme(state.currentTheme);
  }

  function modeWarning() {
    const warning = $('modeWarning');
    const messages = {
      insert: 'Insert mode builds a parameterized template. The backend still previews the write before execution.',
      update: 'Update mode treats selected columns as SET targets and uses completed filters for the WHERE clause.',
      delete: 'Delete mode keeps you in control. The backend previews the delete first and then lets you decide whether to continue.'
    };
    if (!messages[state.queryMode]) {
      warning.classList.add('hidden');
      warning.textContent = '';
      return;
    }
    warning.classList.remove('hidden');
    warning.textContent = messages[state.queryMode];
  }

  function setMode(mode, options = {}) {
    const nextMode = normalizeQueryMode(mode);
    state.queryMode = nextMode;
    document.querySelectorAll('#queryModeSegment .segment-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === nextMode);
    });
    $('queryModeHint').textContent = `Mode: ${nextMode[0].toUpperCase() + nextMode.slice(1)}`;
    modeWarning();
    if (options.regenerate !== false && state.activeObject) generateQuery();
    else persistWorkspaceState('sql');
  }

  function generateQuery() {
    if (!state.activeObject) {
      setStatus('error', 'Select a table or view first.');
      return;
    }
    const filters = getFilters();
    const readyFilters = filters.filter((item) => item.column && item.operator && ((item.operator === 'IS NULL' || item.operator === 'IS NOT NULL') || String(item.value ?? '').trim() !== ''));
    const query = state.queryMode === 'select' ? buildSelect() : state.queryMode === 'insert' ? buildInsert() : state.queryMode === 'update' ? buildUpdate() : buildDelete();
    setQuery(query);
    if (state.queryMode === 'insert' && filters.length) {
      setStatus('error', 'Filters are not used in Insert mode.');
      return;
    }
    if (state.queryMode === 'delete' && !readyFilters.length) {
      setStatus('error', 'Delete mode requires at least one completed filter.');
      return;
    }
    if ((state.queryMode === 'select' || state.queryMode === 'update') && filters.length && !readyFilters.length) {
      setStatus('neutral', 'Filter row added. Pick a value to generate the WHERE clause.');
      return;
    }
    setStatus('success', `${state.queryMode.toUpperCase()} query generated${readyFilters.length ? ` with ${readyFilters.length} filter${readyFilters.length === 1 ? '' : 's'}` : ''}.`);
  }

  function formatSql() {
    const raw = getQuery().trim();
    if (!raw) return;

    const normalized = raw.replace(/\r\n/g, '\n');
    const tokens = [];
    const punct = new Set([',', '(', ')', ';']);

    for (let index = 0; index < normalized.length; index += 1) {
      const char = normalized[index];
      const next = normalized[index + 1];

      if (/\s/.test(char)) {
        continue;
      }

      if (char === '-' && next === '-') {
        let comment = char + next;
        index += 2;
        while (index < normalized.length && normalized[index] !== '\n') {
          comment += normalized[index];
          index += 1;
        }
        index -= 1;
        tokens.push({ type: 'comment', value: comment.trimEnd() });
        continue;
      }

      if (char === "'") {
        let value = char;
        index += 1;
        while (index < normalized.length) {
          value += normalized[index];
          if (normalized[index] === "'" && normalized[index + 1] === "'") {
            value += normalized[index + 1];
            index += 2;
            continue;
          }
          if (normalized[index] === "'") {
            break;
          }
          index += 1;
        }
        tokens.push({ type: 'string', value });
        continue;
      }

      if (char === '[') {
        let value = char;
        index += 1;
        while (index < normalized.length) {
          value += normalized[index];
          if (normalized[index] === ']') {
            break;
          }
          index += 1;
        }
        tokens.push({ type: 'identifier', value });
        continue;
      }

      if (punct.has(char)) {
        tokens.push({ type: 'punct', value: char });
        continue;
      }

      let value = char;
      while (index + 1 < normalized.length) {
        const peek = normalized[index + 1];
        if (/\s/.test(peek) || punct.has(peek) || peek === "'" || peek === '[' || (peek === '-' && normalized[index + 2] === '-')) {
          break;
        }
        value += peek;
        index += 1;
      }
      tokens.push({ type: 'word', value });
    }

    const merged = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const current = tokens[index];
      const next = tokens[index + 1];
      const upper = String(current?.value || '').toUpperCase();
      const nextUpper = String(next?.value || '').toUpperCase();
      if (current?.type === 'word' && next?.type === 'word') {
        const pair = `${upper} ${nextUpper}`;
        if (['ORDER BY', 'GROUP BY', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN'].includes(pair)) {
          merged.push({ type: 'keyword', value: pair });
          index += 1;
          continue;
        }
      }
      if (current?.type === 'word') {
        merged.push({ type: 'keyword', value: upper });
      } else {
        merged.push(current);
      }
    }

    let formatted = '';
    let clause = '';
    const append = (text, { newline = false, space = false } = {}) => {
      if (!text) return;
      if (newline) {
        formatted = formatted.replace(/[ \t]+$/g, '');
        if (formatted && !formatted.endsWith('\n')) {
          formatted += '\n';
        }
      } else if (space) {
        if (formatted && !formatted.endsWith('\n') && !formatted.endsWith('(') && !formatted.endsWith(' ')) {
          formatted += ' ';
        }
      }
      formatted += text;
    };

    for (const token of merged) {
      if (!token) continue;
      if (token.type === 'comment') {
        append(token.value, { newline: true });
        continue;
      }

      if (token.type === 'keyword') {
        const upper = token.value;
        if (upper === 'SELECT') {
          clause = 'SELECT';
          append('SELECT', { newline: true });
          continue;
        }
        if (['FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'VALUES', 'SET', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN'].includes(upper)) {
          clause = upper;
          append(upper, { newline: true });
          continue;
        }
        if (upper === 'AND') {
          append('  AND', { newline: true });
          continue;
        }
        append(upper, { space: true });
        continue;
      }

      if (token.type === 'punct') {
        if (token.value === ',') {
          if (clause === 'SELECT') {
            formatted += ',\n       ';
          } else if (clause === 'SET' || clause === 'VALUES') {
            formatted += ',\n    ';
          } else {
            formatted += ', ';
          }
          continue;
        }
        if (token.value === '(') {
          append('(', {});
          continue;
        }
        if (token.value === ')') {
          formatted = formatted.replace(/[ \t]+$/g, '');
          formatted += ')';
          continue;
        }
        if (token.value === ';') {
          formatted = formatted.replace(/[ \t]+$/g, '');
          formatted += ';';
          continue;
        }
      }

      append(token.value, { space: true });
    }

    setQuery(formatted.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
    setStatus('success', 'SQL formatted.');
  }

  function updateEditorStats() {
    const query = getQuery();
    const lines = query ? query.split('\n').length : 0;
    $('editorStats').textContent = `${lines} line${lines === 1 ? '' : 's'} • ${query.length} chars`;
  }

  function insertAtCursor(text) {
    const adapter = editorAdapter();
    const query = adapter.getValue();
    const selection = adapter.getSelection();
    const start = Number(selection.start || 0);
    const end = Number(selection.end || start);
    adapter.setValue(`${query.slice(0, start)}${text}${query.slice(end)}`);
    adapter.focus();
    adapter.setSelection(start + text.length, start + text.length);
    updateEditorStats();
    syncEditorBackdrop();
    persistWorkspaceState('sql');
  }

  function preferredColumnExpression() {
    const selected = selectedColumns();
    const column = selected[0] || state.activeColumns[0]?.name || 'column_name';
    return state.activeColumns.some((item) => item.name === column) ? bid(column) : column;
  }

  function editorSelectionOrColumn() {
    const adapter = editorAdapter();
    const selection = adapter.getSelection();
    const query = adapter.getValue();
    const selectedText = selection.start !== selection.end
      ? query.slice(selection.start, selection.end).trim()
      : '';
    return selectedText || preferredColumnExpression();
  }

  function sqlHelperSnippet(helperId, subject = preferredColumnExpression()) {
    const expression = subject || preferredColumnExpression();
    const second = state.activeColumns[1]?.name ? bid(state.activeColumns[1].name) : 'other_column';
    switch (helperId) {
      case 'concat':
        return `CONCAT(${expression}, ' ', ${second})`;
      case 'replace':
        return `REPLACE(${expression}, 'old_value', 'new_value')`;
      case 'trim':
        return `TRIM(${expression})`;
      case 'cast':
        return `CAST(${expression} AS varchar(100))`;
      case 'tryConvert':
        return `TRY_CONVERT(date, ${expression})`;
      case 'coalesce':
        return `COALESCE(${expression}, 'fallback_value')`;
      case 'nullif':
        return `NULLIF(${expression}, '')`;
      case 'caseWhen':
        return `CASE\n    WHEN ${expression} IS NULL THEN 'missing'\n    ELSE ${expression}\nEND`;
      case 'dateadd':
        return `DATEADD(day, 1, ${expression})`;
      case 'datediff':
        return `DATEDIFF(day, ${expression}, GETDATE())`;
      case 'sha2Key':
        return `CONVERT(varchar(64), HASHBYTES('SHA2_256', CONCAT(${expression}, '|', ${second})), 2)`;
      default:
        return expression;
    }
  }

  function insertSqlHelper({ wrapSelection = false } = {}) {
    const helperId = $('sqlHelperSelect')?.value || 'concat';
    const subject = wrapSelection ? editorSelectionOrColumn() : preferredColumnExpression();
    insertAtCursor(sqlHelperSnippet(helperId, subject));
    syncEditorBackdrop();
    setStatus('success', `${SQL_HELPER_LABELS[helperId] || 'SQL'} helper inserted.`);
  }

  async function loadCatalog() {
    if (!ensureReadyConnection('loading the catalog')) {
      return;
    }
    setStatus('loading', 'Loading catalog...');
    resetActiveObject();
    state.activeProcedure = null;
    state.procedureParameters = [];
    state.procedureValues = {};
    state.procedureNote = '';
    renderProcedureWorkspace();

    const payload = requestConnection();
    loadPinnedAndRecentItems();
    const [objectsResult, proceduresResult] = await Promise.allSettled([
      api('/api/tables', { method: 'POST', data: payload }),
      api('/api/procedures', { method: 'POST', data: payload })
    ]);

    const errors = [];

    if (objectsResult.status === 'fulfilled') {
      state.objects = objectsResult.value.objects || objectsResult.value.tables || [];
      state.filteredObjects = [...state.objects];
      populateExplorerFilters();
      renderObjects();
      populateAdvancedObjectOptions();
    } else {
      state.objects = [];
      state.filteredObjects = [];
      renderObjects();
      populateAdvancedObjectOptions();
      errors.push(`Objects: ${objectsResult.reason.message}`);
    }

    if (proceduresResult.status === 'fulfilled') {
      state.procedures = proceduresResult.value.procedures || [];
      state.filteredProcedures = [...state.procedures];
      state.procedureNote = proceduresResult.value.supported === false ? (proceduresResult.value.note || 'Procedures unavailable for this source.') : '';
      populateExplorerFilters();
      renderProcedures();
    } else {
      state.procedures = [];
      state.filteredProcedures = [];
      state.procedureNote = proceduresResult.reason.message || 'Procedure catalog unavailable.';
      renderProcedures();
      errors.push(`Procedures: ${state.procedureNote}`);
    }

    renderExplorerSummary();
    persistActiveConnection();
    persistCatalogState();
    if (errors.length) {
      throw new Error(errors.join(' | '));
    }
    setStatus('success', `Loaded ${state.objects.length} objects${state.procedureNote ? '' : ` and ${state.procedures.length} procedures`}.`);
  }

  async function loadObjectDefinitionToEditor(objectName, objectType, scriptMode = 'alter') {
    if (!ensureReadyConnection('loading the object script')) {
      return;
    }
    if (!objectName) {
      setStatus('error', 'Select an object or procedure first.');
      return;
    }

    const normalizedType = objectType === 'procedure' ? 'procedure' : objectType === 'view' ? 'view' : 'table';
    const requestedMode = scriptMode === 'create' ? 'create' : 'alter';
    setStatus('loading', `Loading ${requestedMode.toUpperCase()} script for ${objectName}...`);

    const payload = await api('/api/object-definition', {
      method: 'POST',
      data: requestConnection({
        object: objectName,
        objectType: normalizedType,
        scriptMode: requestedMode
      })
    });

    const effectiveMode = payload.scriptMode || requestedMode;
    setQuery(payload.definition || '');
    persistWorkspaceState('sql');
    persistCatalogState();

    const sourceLabel = payload.generated
      ? 'generated from catalog metadata'
      : payload.definitionSource
        ? `from ${String(payload.definitionSource).replace(/_/g, ' ')}`
        : 'from source metadata';
    const message = `Loaded ${String(effectiveMode).toUpperCase()} script for ${payload.object || objectName} ${sourceLabel}. Review before executing.`;
    if (normalizedType === 'procedure') {
      state.activeObject = null;
      state.activeObjectType = '';
      state.activeColumns = [];
      state.selectedColumns.clear();
      if ($('columnsPanel')) $('columnsPanel').innerHTML = '<div class="empty-note">Load a table or view to see columns.</div>';
      if ($('selectedColumnsSummary')) $('selectedColumnsSummary').textContent = 'All columns will be used.';
      if ($('sortColumnSelect')) $('sortColumnSelect').innerHTML = '<option value="">None</option>';
      state.activeProcedure = payload.object || objectName;
      renderProcedures();
      renderObjects();
      refreshActiveSummary();
      setExplorer('procedures');
    } else {
      state.activeProcedure = null;
      state.procedureParameters = [];
      state.procedureValues = {};
      state.activeObject = payload.object || objectName;
      state.activeObjectType = normalizedType;
      state.activeColumns = [];
      state.selectedColumns.clear();
      if ($('columnsPanel')) $('columnsPanel').innerHTML = '<div class="empty-note">Select the object name to load columns for the query builder.</div>';
      if ($('selectedColumnsSummary')) $('selectedColumnsSummary').textContent = 'No columns loaded for the script action.';
      if ($('sortColumnSelect')) $('sortColumnSelect').innerHTML = '<option value="">None</option>';
      renderObjects();
      renderProcedures();
      renderProcedureWorkspace();
      refreshActiveSummary();
      setExplorer('objects');
    }

    setWorkspace('sql');
    setStatus('success', message);

    if (currentPageMode() === 'procedures') {
      persistWorkspaceState('sql');
      window.location.href = '/';
    }
  }

  async function scriptActiveDefinition(scriptMode = 'alter') {
    if (state.activeObject) {
      return loadObjectDefinitionToEditor(state.activeObject, state.activeObjectType || 'table', scriptMode);
    }
    if (state.activeProcedure) {
      return loadObjectDefinitionToEditor(state.activeProcedure, 'procedure', scriptMode);
    }
    setStatus('error', 'Select a table, view, or stored procedure before scripting it.');
  }

  async function selectObject(fullName, objectType) {
    if (!ensureReadyConnection('loading object metadata')) {
      setStatus('error', 'Enter a connection first.');
      return;
    }
    state.activeProcedure = null;
    state.procedureParameters = [];
    state.procedureValues = {};
    state.activeObject = fullName;
    state.activeObjectType = objectType || 'table';
    state.selectedColumns.clear();
    renderObjects();
    renderProcedures();
    renderProcedureWorkspace();
    refreshActiveSummary();
    persistCatalogState();
    setWorkspace('sql');
    setExplorer('objects');
    state.activeColumns = [];
    const columnsPanel = $('columnsPanel');
    const builderColumnsPanel = columnsPanel?.closest('.builder-panel-columns');
    if (builderColumnsPanel) {
      builderColumnsPanel.dataset.columnsState = 'loading';
    }
    columnsPanel.innerHTML = '<div class="empty-note">Loading columns...</div>';
    $('selectedColumnsSummary').textContent = 'Loading columns...';
    $('sortColumnSelect').innerHTML = '<option value="">Loading...</option>';
    try {
      const payload = await api('/api/columns', { method: 'POST', data: requestConnection({ object: state.activeObject }) });
      state.activeColumns = payload.columns || [];
      state.objectColumnIndex[String(state.activeObject || '').toLowerCase()] = state.activeColumns.map((column) => column.name);
      markRecentItem('object', state.activeObject);
      populateColumnInputs();
      renderColumns();
      persistCatalogState();
      generateQuery();
    } catch (error) {
      resetActiveObject();
      renderObjects();
      refreshActiveSummary();
      throw error;
    }
  }

  function renderProcedureWorkspace() {
    if (!state.activeProcedure) {
      $('procedureSummary').innerHTML = 'Select a stored procedure from the explorer to inspect its parameters.';
      $('procedureParametersPanel').innerHTML = 'Procedure parameters will appear here.';
      return;
    }
    const hasOutput = state.procedureParameters.some((parameter) => /OUT/i.test(parameter.mode));
    $('procedureSummary').innerHTML = `<strong>${esc(state.activeProcedure)}</strong><span>Review the parameters, then execute with button confirmation. Leave a parameter blank to omit it, or type NULL to pass a null value.</span><div class="procedure-meta"><span class="procedure-badge">${state.procedureParameters.length} parameters</span>${hasOutput ? '<span class="procedure-badge">Contains output parameters</span>' : ''}</div>`;
    if (!state.procedureParameters.length) {
      $('procedureParametersPanel').innerHTML = '<div class="empty-note">This procedure does not expose parameters.</div>';
      return;
    }
    $('procedureParametersPanel').innerHTML = state.procedureParameters.map((parameter) => {
      const outputOnly = /OUT/i.test(parameter.mode);
      const value = state.procedureValues[parameter.cleanName] || '';
      return `<div class="param-card"><strong>${esc(parameter.name)}</strong><span>${esc(parameter.dataType || 'unknown')} • ${esc(parameter.mode || 'IN')}</span>${outputOnly ? '<div class="empty-note">Output parameter value is returned after execution.</div>' : `<label class="field compact-field"><span>Value</span><input data-procedure-param="${esc(parameter.cleanName)}" type="text" value="${esc(value)}" placeholder="Leave blank to omit or type NULL" /></label>`}</div>`;
    }).join('');
    $('procedureParametersPanel').querySelectorAll('[data-procedure-param]').forEach((input) => {
      input.oninput = () => {
        state.procedureValues[input.dataset.procedureParam] = input.value;
        persistCatalogState();
        persistWorkspaceState('procedure');
      };
    });
  }

  async function selectProcedure(fullName, restoredValues = null) {
    if (!ensureReadyConnection('loading procedure parameters')) {
      setStatus('error', 'Enter a connection first.');
      return;
    }
    setStatus('loading', `Loading parameters for ${fullName}...`);
    const payload = await api('/api/procedure-parameters', { method: 'POST', data: requestConnection({ procedure: fullName }) });
    resetActiveObject();
    state.activeProcedure = fullName;
    markRecentItem('procedure', fullName);
    state.procedureParameters = payload.parameters || [];
    state.procedureValues = restoredValues && typeof restoredValues === 'object' ? { ...restoredValues } : {};
    setWorkspace('procedure');
    setExplorer('procedures');
    renderObjects();
    renderProcedures();
    renderProcedureWorkspace();
    refreshActiveSummary();
    persistCatalogState();
    setStatus('success', `Loaded parameters for ${fullName}.`);
  }

  async function restoreProcedureHistoryItem(item) {
    if (!item?.procedure) {
      setStatus('error', 'Procedure history item is invalid.');
      return;
    }
    if (!ensureReadyConnection('restoring the procedure run')) {
      return;
    }
    const currentSignature = connectionSignature();
    const sameConnection = !item.connectionSignature || item.connectionSignature === currentSignature;
    await selectProcedure(item.procedure, item.parameters || {});
    renderProcedureWorkspace();
    persistCatalogState();
    setStatus(
      sameConnection ? 'success' : 'neutral',
      sameConnection
        ? `Restored ${item.procedure} with saved parameter values.`
        : `Restored ${item.procedure} values. Check the active connection before running.`
    );
  }

  async function refreshProcedureParameters() {
    if (!state.activeProcedure) {
      setStatus('error', 'Select a stored procedure first.');
      return;
    }
    await selectProcedure(state.activeProcedure);
  }

  function currentProcedureValues() {
    const values = {};
    state.procedureParameters.forEach((parameter) => {
      values[parameter.cleanName] = state.procedureValues[parameter.cleanName] || '';
    });
    return values;
  }

  function setResults(columns = [], rows = [], meta = {}) {
    state.results = {
      ...state.results,
      columns,
      rows,
      output: meta.output || {},
      returnValue: meta.returnValue ?? null,
      rowsAffected: Number(meta.rowsAffected || 0),
      totalRows: Number(meta.totalRows ?? rows.length),
      truncated: Boolean(meta.truncated),
      page: 1,
      columnWidths: {},
      expandedCells: {},
      sortColumn: '',
      sortDirection: 'asc',
      localFilter: '',
      visualKind: meta.visualKind || '',
      visualObject: meta.visualObject || meta.object || ''
    };
    upsertResultTab(meta.tabTitle || meta.message || meta.visualKind || 'Results', state.results, {
      key: meta.tabKey || ''
    });
    renderResults();
    persistWorkspaceState(state.workspace);
  }

  function resetResultsForRun(message = 'Working...') {
    const pageSize = state.results.pageSize;
    state.results = {
      ...defaultResultsState(),
      pageSize
    };
    if ($('resultsArtifacts')) {
      $('resultsArtifacts').innerHTML = '';
    }
    if ($('resultsMeta')) {
      $('resultsMeta').textContent = message;
    }
    if ($('pageIndicator')) {
      $('pageIndicator').textContent = 'Page 1/1';
    }
    if ($('prevPageBtn')) {
      $('prevPageBtn').disabled = true;
    }
    if ($('nextPageBtn')) {
      $('nextPageBtn').disabled = true;
    }
    const panel = $('resultsPanel');
    const resultsCard = panel?.closest('.results-card');
    state.activeResultTabId = '';
    if (panel) {
      panel.innerHTML = `<div class="empty-state">${esc(message)}</div>`;
    }
    if (resultsCard) {
      resultsCard.dataset.resultsState = 'loading';
    }
    updateResultScrollControls();
    renderResultTabs();
  }

  function resultErrorHint(error, context = {}) {
    const message = String(error?.message || '');
    const sql = String(context.query || '').trim();
    const operation = String(context.operation || 'operation').toLowerCase();
    const ifBatchHint = 'This looks like a T-SQL IF/BEGIN/END batch. SQL Studio currently blocks multi-statement batches, so no database changes were made. Put this logic in a stored procedure, or run a single reviewed INSERT/UPDATE/DELETE statement.';
    if (/IF\/BEGIN\/END/i.test(message) || /^IF\b/i.test(sql)) {
      return ifBatchHint;
    }
    if (/Only one SQL statement/i.test(message)) {
      return 'SQL Studio currently accepts one executable statement per run. Remove extra statements or run them one at a time.';
    }
    if (/confirmation|token|expired/i.test(message)) {
      return 'The review window expired or no longer matches the request. Start the action again so the app can create a fresh confirmation.';
    }
    if (/login|authentication|credential|password|principal|access denied/i.test(message)) {
      return 'The database rejected the connection or permissions. Check the saved connection, credentials, and whether the account has access to this database/object.';
    }
    if (/timeout|timed out|deadlock|busy/i.test(message)) {
      return 'The database did not complete the request in time. Try again, narrow the query, or check whether the source is under load.';
    }
    if (/invalid object|does not exist|not found|could not find|unknown object/i.test(message)) {
      return 'The selected object may have been renamed, removed, or is not visible to this connection. Reload the catalog and select it again.';
    }
    if (/permission|not authorized|unauthorized|forbidden|denied/i.test(message)) {
      return 'The current account does not have enough permission for this action. Use a permitted account or ask the database owner to grant access.';
    }
    if (/syntax|parse|near/i.test(message)) {
      return 'SQL Server rejected the statement syntax. Review the highlighted SQL text and run a smaller statement if needed.';
    }
    if (/fetch|network/i.test(message)) {
      return 'The app could not reach the local server or database endpoint. Check that the Data Workbench server is still running and that the connection profile is valid.';
    }
    if (operation.includes('profile')) {
      return 'The object profile could not be loaded. Reload the catalog, verify the object still exists, and check that the connection can read its metadata and sample rows.';
    }
    if (operation.includes('dependenc')) {
      return 'The dependency view could not be loaded. Some sources may not expose dependency metadata, or the account may not have metadata permissions.';
    }
    if (operation.includes('audit')) {
      return 'The local audit log could not be loaded. The query itself was not executed by this action.';
    }
    if (operation.includes('catalog')) {
      return 'The object catalog could not be loaded. Check the connection, credentials, database name, and whether the account can read metadata.';
    }
    if (operation.includes('procedure')) {
      return 'The stored procedure action failed before completion. Check required parameters, permissions, and the procedure error text above.';
    }
    return 'No result rows were returned because the action failed before completion.';
  }

  function renderResultError(error, context = {}) {
    const title = context.title || 'Action failed';
    const message = error?.message || `${title}.`;
    const code = error?.code ? String(error.code) : '';
    const hint = resultErrorHint(error, context);
    const pageSize = state.results.pageSize;
    state.results = {
      ...defaultResultsState(),
      pageSize
    };
    if ($('resultsArtifacts')) {
      $('resultsArtifacts').innerHTML = '';
    }
    if ($('resultsMeta')) {
      $('resultsMeta').textContent = 'Query failed. No new result set was loaded.';
    }
    if ($('pageIndicator')) {
      $('pageIndicator').textContent = 'Page 1/1';
    }
    if ($('prevPageBtn')) {
      $('prevPageBtn').disabled = true;
    }
    if ($('nextPageBtn')) {
      $('nextPageBtn').disabled = true;
    }
    const panel = $('resultsPanel');
    const resultsCard = panel?.closest('.results-card');
    if (panel) {
      panel.innerHTML = `<div class="result-error-card"><strong>${esc(title)}</strong><p>${esc(message)}</p>${code ? `<code>${esc(code)}</code>` : ''}<span>${esc(hint)}</span></div>`;
    }
    if (resultsCard) {
      resultsCard.dataset.resultsState = 'error';
    }
    updateResultScrollControls();
    applyPanelLayout();
    setStatus('error', message);
  }

  function renderQueryError(error, query) {
    renderResultError(error, {
      title: 'Query failed',
      operation: 'query',
      query
    });
  }

  function sortedRows() {
    let rows = [...state.results.rows];
    
    if (state.results.localFilter) {
      const filterLower = state.results.localFilter.toLowerCase();
      rows = rows.filter(row => 
        Object.values(row).some(val => 
          String(val ?? '').toLowerCase().includes(filterLower)
        )
      );
    }

    const column = state.results.sortColumn;
    if (!column) return rows;
    const normalize = (value) => {
      if (value === null || value === undefined || value === '') return { type: 'empty', value: null };
      if (typeof value === 'number') return { type: 'number', value };
      if (value instanceof Date) return { type: 'date', value: value.getTime() };
      const text = String(value).trim();
      if (/^-?\d+(\.\d+)?$/.test(text)) return { type: 'number', value: Number(text) };
      const parsedDate = Date.parse(text);
      if (!Number.isNaN(parsedDate) && /[-/:T]/.test(text)) return { type: 'date', value: parsedDate };
      return { type: 'string', value: text.toLowerCase() };
    };
    rows.sort((left, right) => {
      const a = normalize(left?.[column]);
      const b = normalize(right?.[column]);
      if (a.type !== b.type) {
        const order = ['empty', 'number', 'date', 'string'];
        return (order.indexOf(a.type) - order.indexOf(b.type)) * (state.results.sortDirection === 'asc' ? 1 : -1);
      }
      if (a.value < b.value) return state.results.sortDirection === 'asc' ? -1 : 1;
      if (a.value > b.value) return state.results.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }

  function resultCellKey(rowIndex, column) {
    return `${rowIndex}:${column}`;
  }

  function isExpandableResultValue(value) {
    const text = String(value ?? '');
    if (!text) {
      return false;
    }
    return text.length > 160 || text.includes('\n') || text.includes('{') || text.includes('[');
  }

  function parseJsonValue(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'object') {
      return value instanceof Date ? null : value;
    }
    const text = String(value).trim();
    if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function formatJsonPlain(value) {
    const parsed = parseJsonValue(value);
    return parsed ? JSON.stringify(parsed, null, 2) : '';
  }

  function highlightJsonText(text) {
    return esc(text).replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) cls = 'json-key';
        else cls = 'json-string';
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }

  function formatResultValue(value, rowIndex, column) {
    if (value === null || value === undefined || value === '') return '<span class="result-null">NULL</span>';
    const text = String(value);
    const formattedJson = formatJsonPlain(value);
    const isJson = Boolean(formattedJson);

    if (!isJson && !isExpandableResultValue(text)) {
      return esc(text);
    }

    const cellKey = resultCellKey(rowIndex, column);
    const expanded = Boolean(state.results.expandedCells[cellKey]);
    const displayContent = isJson
      ? `<pre class="json-cell-pre">${highlightJsonText(formattedJson)}</pre>`
      : esc(text);

    return `<div class="result-cell-wrap${expanded ? ' expanded' : ''}${isJson ? ' json-cell' : ''}"><div class="result-cell-content">${displayContent}</div><button class="result-cell-toggle" data-result-cell-toggle="${esc(cellKey)}" type="button">${expanded ? 'Show less' : 'Show more'}</button></div>`;
  }

  function numericValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function renderMeter(value, label = '') {
    const percent = clamp(Number(value) || 0, 0, 100);
    return `<div class="visual-meter" title="${esc(label || `${percent}%`)}"><span style="width:${percent}%"></span></div>`;
  }

  function inferColumnKind(columnName, rows) {
    const values = rows.map((row) => row?.[columnName]).filter((value) => value !== null && value !== undefined && value !== '');
    if (!values.length) return 'empty';
    const numericCount = values.filter((value) => numericValue(value) !== null).length;
    const dateCount = values.filter((value) => {
      const text = String(value).trim();
      return /[-/:T]/.test(text) && !Number.isNaN(Date.parse(text));
    }).length;
    if (numericCount / values.length >= 0.8) return 'number';
    if (dateCount / values.length >= 0.8) return 'date';
    return 'text';
  }

  function renderProfileVisuals() {
    const rows = state.results.rows || [];
    if (state.results.visualKind !== 'profile' || !rows.length) return [];
    const avgCompleteness = rows.reduce((sum, row) => sum + (numericValue(row.completeness_pct) || 0), 0) / rows.length;
    const nullableCount = rows.filter((row) => String(row.nullable || '').toUpperCase() === 'YES').length;
    const sampledRows = Math.max(...rows.map((row) => numericValue(row.sample_rows ?? row.sampled_rows) || 0));
    const nullHeavy = rows
      .map((row) => ({
        column: row.column_name || 'Unknown column',
        pct: 100 - (numericValue(row.completeness_pct) || 0),
        nullRows: numericValue(row.null_rows) || 0
      }))
      .filter((row) => row.pct > 0)
      .sort((left, right) => right.pct - left.pct)
      .slice(0, 5);
    const incompleteRows = rows
      .slice()
      .filter((row) => (numericValue(row.completeness_pct) || 0) < 100)
      .sort((left, right) => (numericValue(left.completeness_pct) || 0) - (numericValue(right.completeness_pct) || 0))
      .slice(0, 5);
    const objectName = state.results.visualObject || state.activeObject || 'Profiled object';
    const chips = [
      ['Object', objectName],
      ['Profiled columns', rows.length],
      ['Sampled rows', sampledRows || 'n/a'],
      ['Average completeness', `${avgCompleteness.toFixed(1)}%`],
      ['Nullable columns', nullableCount],
      ['Null-heavy columns', nullHeavy.length]
    ];
    const completenessDetails = incompleteRows.length
      ? `<div class="profile-detail-list" aria-label="Incomplete columns">${incompleteRows.map((row) => `<div class="profile-detail-row"><span title="${esc(row.column_name || '')}">${esc(row.column_name || 'Unknown column')}</span>${renderMeter(row.completeness_pct, `${row.completeness_pct}% complete`)}<code>${esc(row.completeness_pct)}%</code></div>`).join('')}</div>`
      : '<span class="profile-good-chip">All profiled columns complete</span>';
    const nullDetails = nullHeavy.length
      ? `<div class="profile-detail-list compact" aria-label="Null-heavy columns">${nullHeavy.map((row) => `<div class="profile-detail-row compact"><span title="${esc(row.column)}">${esc(row.column)}</span><code>${row.pct.toFixed(1)}% missing${row.nullRows ? ` - ${row.nullRows} rows` : ''}</code></div>`).join('')}</div>`
      : '<span class="profile-good-chip">No sampled null or blank values</span>';

    return [
      `<div class="artifact-card visual-helper-card profile-insights-card"><div class="profile-insights-head"><strong>Profile insights</strong><span>${esc(objectName)}</span></div><div class="profile-insight-row">${chips.map(([label, value]) => `<span class="profile-insight-chip"><small>${esc(label)}</small>${esc(value)}</span>`).join('')}</div><div class="profile-status-row">${completenessDetails}${nullDetails}</div></div>`
    ];
  }

  function renderDependencyVisuals() {
    const rows = state.results.rows || [];
    if (state.results.visualKind !== 'dependencies') return [];
    const center = state.results.visualObject || state.activeObject || 'Selected object';
    const dependsOn = rows.filter((row) => row.dependency_direction === 'depends_on');
    const referencedBy = rows.filter((row) => row.dependency_direction === 'referenced_by');
    const node = (row) => `<span class="dependency-node" title="${esc(row.related_type || '')}">${esc(row.related_object || row.primary_object || 'Unknown')}<small>${esc(row.related_type || 'object')}</small></span>`;
    return [
      `<div class="artifact-card visual-helper-card visual-helper-wide dependency-visual"><strong>Dependency map</strong><div class="dependency-lanes"><div>${dependsOn.length ? dependsOn.map(node).join('') : '<span class="empty-note">No upstream dependencies</span>'}</div><div class="dependency-center">${esc(center)}</div><div>${referencedBy.length ? referencedBy.map(node).join('') : '<span class="empty-note">No downstream references</span>'}</div></div><span>${dependsOn.length} upstream • ${referencedBy.length} downstream</span></div>`
    ];
  }

  function renderQueryVisuals() {
    const rows = state.results.rows || [];
    if (state.results.visualKind !== 'query' || !state.results.columns.length) return [];
    const sampleRows = rows.slice(0, 100);
    const nullColumns = state.results.columns.map((column) => ({
      column,
      nulls: sampleRows.filter((row) => row?.[column] === null || row?.[column] === undefined || row?.[column] === '').length,
      kind: inferColumnKind(column, sampleRows)
    })).filter((item) => item.nulls > 0);
    const typeCounts = state.results.columns.reduce((counts, column) => {
      const kind = inferColumnKind(column, sampleRows);
      counts[kind] = (counts[kind] || 0) + 1;
      return counts;
    }, {});
    return [
      `<div class="artifact-card visual-helper-card"><strong>Result shape</strong><code>${state.results.totalRows} row${state.results.totalRows === 1 ? '' : 's'} • ${state.results.columns.length} column${state.results.columns.length === 1 ? '' : 's'}</code><span>${state.results.truncated ? 'Server row cap applied.' : 'Returned within current row cap.'}</span></div>`,
      `<div class="artifact-card visual-helper-card"><strong>Column types</strong><div class="visual-chip-row">${Object.entries(typeCounts).map(([kind, count]) => `<span class="visual-chip">${esc(kind)} ${count}</span>`).join('')}</div></div>`,
      `<div class="artifact-card visual-helper-card"><strong>Null scan</strong>${nullColumns.length ? `<div class="visual-list compact">${nullColumns.slice(0, 5).map((item) => `<div class="visual-row"><span>${esc(item.column)}</span><code>${item.nulls}</code></div>`).join('')}</div>` : '<span>No null or blank values in the visible sample.</span>'}</div>`
    ];
  }

  function renderAuditVisuals() {
    const rows = state.results.rows || [];
    if (state.results.visualKind !== 'audit' || !rows.length) return [];
    const counts = rows.reduce((accumulator, row) => {
      const outcome = row.outcome || 'unknown';
      accumulator[outcome] = (accumulator[outcome] || 0) + 1;
      return accumulator;
    }, {});
    return [
      `<div class="artifact-card visual-helper-card visual-helper-wide"><strong>Audit timeline</strong><div class="audit-timeline">${rows.slice(0, 8).map((row) => `<div class="audit-dot ${esc(row.outcome || 'neutral')}"><span>${esc(row.event || 'event')}</span><small>${esc(row.action || '')}</small></div>`).join('')}</div><div class="visual-chip-row">${Object.entries(counts).map(([outcome, count]) => `<span class="visual-chip">${esc(outcome)} ${count}</span>`).join('')}</div></div>`
    ];
  }

  function renderVisualArtifacts() {
    return [
      ...renderProfileVisuals(),
      ...renderDependencyVisuals(),
      ...renderQueryVisuals(),
      ...renderAuditVisuals()
    ];
  }

  function renderResultsArtifacts() {
    const artifacts = [];
    artifacts.push(...renderVisualArtifacts());
    if (state.results.returnValue !== null && state.results.returnValue !== undefined) {
      artifacts.push(`<div class="artifact-card"><strong>Return value</strong><code>${esc(state.results.returnValue)}</code></div>`);
    }
    Object.entries(state.results.output || {}).forEach(([key, value]) => {
      artifacts.push(`<div class="artifact-card"><strong>${esc(key)}</strong><code>${esc(value)}</code></div>`);
    });
    $('resultsArtifacts').innerHTML = artifacts.join('');
  }

  function bindResultColumnResizers(panel) {
    panel.querySelectorAll('[data-resize-column]').forEach((handle) => {
      handle.onpointerdown = null;
      handle.onpointermove = null;
      handle.onpointerup = null;
      handle.onpointercancel = null;
      handle.ondblclick = null;

      handle.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const column = handle.dataset.resizeColumn;
        const table = panel.querySelector('.results-table');
        const col = Array.from(panel.querySelectorAll('col[data-column-width]')).find((candidate) => candidate.dataset.columnWidth === column);
        if (!table || !col) {
          return;
        }

        const startX = event.clientX;
        const startWidth = Number(state.results.columnWidths[column]) || Math.round(col.getBoundingClientRect().width) || 180;
        handle.classList.add('is-dragging');
        handle.setPointerCapture?.(event.pointerId);
        document.body.style.cursor = 'col-resize';
        document.body.classList.add('panel-resize-dragging');

        handle.onpointermove = (moveEvent) => {
          const nextWidth = clamp(Math.round(startWidth + (moveEvent.clientX - startX)), 90, 1200);
          state.results.columnWidths[column] = nextWidth;
          col.style.width = `${nextWidth}px`;
          col.style.minWidth = `${nextWidth}px`;
        };

        const finish = () => {
          handle.classList.remove('is-dragging');
          handle.onpointermove = null;
          handle.onpointerup = null;
          handle.onpointercancel = null;
          document.body.style.cursor = '';
          document.body.classList.remove('panel-resize-dragging');
        };

        handle.onpointerup = finish;
        handle.onpointercancel = finish;
      };

      handle.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        delete state.results.columnWidths[handle.dataset.resizeColumn];
        renderResults();
      };
    });
  }

  function bindResultCellToggles(panel) {
    panel.querySelectorAll('[data-result-cell-toggle]').forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.resultCellToggle;
        state.results.expandedCells[key] = !state.results.expandedCells[key];
        if (!state.results.expandedCells[key]) {
          delete state.results.expandedCells[key];
        }
        renderResults();
      };
    });
  }

  function resultScrollMetrics() {
    const panel = $('resultsPanel');
    if (!panel) {
      return { panel: null, canScroll: false, atStart: true, atEnd: true };
    }
    const maxScrollLeft = Math.max(0, panel.scrollWidth - panel.clientWidth);
    const left = Math.max(0, panel.scrollLeft || 0);
    return {
      panel,
      canScroll: maxScrollLeft > 2,
      atStart: left <= 2,
      atEnd: left >= maxScrollLeft - 2,
      maxScrollLeft
    };
  }

  function updateResultScrollControls() {
    const { panel, canScroll, atStart, atEnd } = resultScrollMetrics();
    const leftButtons = [$('scrollResultsLeftBtn'), $('scrollResultsDockLeftBtn')].filter(Boolean);
    const rightButtons = [$('scrollResultsRightBtn'), $('scrollResultsDockRightBtn')].filter(Boolean);
    leftButtons.forEach((button) => { button.disabled = !canScroll || atStart; });
    rightButtons.forEach((button) => { button.disabled = !canScroll || atEnd; });
    const card = panel?.closest('.results-card');
    const dock = $('resultsScrollDock');
    if (card) {
      const rect = panel.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const visible = rect.bottom > 96 && rect.top < viewportHeight - 72;
      card.classList.toggle('results-scrollable-x', canScroll);
      card.classList.toggle('results-dock-visible', canScroll && visible);
      card.classList.toggle('results-scroll-at-start', !canScroll || atStart);
      card.classList.toggle('results-scroll-at-end', !canScroll || atEnd);

      if (dock && canScroll && visible) {
        const cardRect = card.getBoundingClientRect();
        const dockWidth = dock.offsetWidth || 188;
        const dockHeight = dock.offsetHeight || 52;
        const visibleTop = clamp(Math.max(rect.top, 88), 88, Math.max(88, viewportHeight - dockHeight - 24));
        const visibleBottom = clamp(Math.min(rect.bottom, viewportHeight - 24), visibleTop + dockHeight, viewportHeight - 24);
        const top = clamp(visibleBottom - dockHeight - 14, visibleTop + 10, viewportHeight - dockHeight - 24);
        const left = clamp(rect.right - dockWidth - 24, Math.max(16, rect.left + 16), viewportWidth - dockWidth - 16);
        dock.style.setProperty('--results-dock-top', `${Math.round(top - cardRect.top)}px`);
        dock.style.setProperty('--results-dock-left', `${Math.round(left - cardRect.left)}px`);
      }
    }
  }

  function scrollResultsHorizontal(direction) {
    const { panel, canScroll } = resultScrollMetrics();
    if (!panel || !canScroll) {
      return;
    }
    const amount = Math.max(220, Math.floor(panel.clientWidth * 0.72));
    panel.scrollBy({ left: direction * amount, behavior: 'smooth' });
    window.setTimeout(updateResultScrollControls, 180);
  }

  function bindResultsPanelScrollAssist(panel) {
    if (!panel) {
      return;
    }
    panel.onscroll = () => {
      updateResultScrollControls();
      persistWorkspaceState(state.workspace);
    };
    panel.onwheel = (event) => {
      if (!event.shiftKey) {
        return;
      }
      const { canScroll, atStart, atEnd } = resultScrollMetrics();
      if (!canScroll) {
        return;
      }
      const delta = event.deltaY || event.deltaX;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) {
        return;
      }
      event.preventDefault();
      panel.scrollBy({ left: delta, behavior: 'auto' });
      updateResultScrollControls();
    };
    window.requestAnimationFrame?.(updateResultScrollControls);
    window.setTimeout(updateResultScrollControls, 80);
  }

  function renderResults() {
    const panel = $('resultsPanel');
    const resultsCard = panel?.closest('.results-card');
    const rows = sortedRows();
    let resultsState = 'empty';
    const pageSize = state.results.pageSize;
    const totalPages = Math.max(1, Math.ceil((rows.length || 1) / pageSize));
    state.results.page = Math.min(state.results.page, totalPages);
    $('pageIndicator').textContent = `Page ${state.results.page}/${totalPages}`;
    $('prevPageBtn').disabled = state.results.page <= 1;
    $('nextPageBtn').disabled = state.results.page >= totalPages;
    renderResultsArtifacts();

    if (!state.results.columns.length && !state.results.rowsAffected && !Object.keys(state.results.output || {}).length && state.results.returnValue == null) {
      panel.innerHTML = '<div class="empty-state">Run a query or procedure to see results.</div>';
      $('resultsMeta').textContent = 'No results yet.';
      if (resultsCard) {
        resultsCard.dataset.resultsState = resultsState;
      }
      updateResultScrollControls();
      applyPanelLayout();
      return;
    }

    if (!rows.length) {
      resultsState = 'summary';
      panel.innerHTML = `<div class="empty-state">${state.results.rowsAffected ? `${state.results.rowsAffected} row${state.results.rowsAffected === 1 ? '' : 's'} affected.` : 'No rows returned.'}</div>`;
      $('resultsMeta').textContent = state.results.rowsAffected ? `${state.results.rowsAffected} row${state.results.rowsAffected === 1 ? '' : 's'} affected.` : 'No rows returned.';
      if (resultsCard) {
        resultsCard.dataset.resultsState = resultsState;
      }
      updateResultScrollControls();
      applyPanelLayout();
      return;
    }

    resultsState = 'table';
    if (resultsCard) {
      resultsCard.dataset.resultsState = resultsState;
    }
    applyPanelLayout();

    const start = (state.results.page - 1) * pageSize;
    const visibleRows = rows.slice(start, start + pageSize);
    $('resultsMeta').textContent = state.results.truncated ? `Showing ${rows.length} of ${state.results.totalRows} rows returned by the server cap.` : `Showing ${start + 1}-${Math.min(start + visibleRows.length, rows.length)} of ${rows.length} rows.`;

    const getColIcon = (column) => {
      for (const row of rows.slice(0, 50)) {
        const val = row[column];
        if (val == null || val === '') continue;
        if (typeof val === 'number') return ' <span style="color:var(--muted);font-size:0.85em;font-weight:normal" title="Numeric">#</span>';
        const str = String(val);
        if (/^-?\d+(\.\d+)?$/.test(str)) return ' <span style="color:var(--muted);font-size:0.85em;font-weight:normal" title="Numeric">#</span>';
        if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) return ' <span style="color:var(--muted);font-size:0.85em;font-weight:normal" title="JSON">{}</span>';
        if (!Number.isNaN(Date.parse(str)) && /[-/:T]/.test(str)) return ' <span style="color:var(--muted);font-size:0.85em;font-weight:normal" title="Date/Time">🗓</span>';
        return ' <span style="color:var(--muted);font-size:0.85em;font-weight:normal" title="String">Aa</span>';
      }
      return '';
    };

    panel.innerHTML = `<table class="results-table"><colgroup><col class="row-index-col" />${state.results.columns.map((column) => {
      const width = Number(state.results.columnWidths[column]);
      return `<col data-column-width="${esc(column)}"${width ? ` style="width:${width}px;min-width:${width}px"` : ''} />`;
    }).join('')}</colgroup><thead><tr><th class="row-index-head">#</th>${state.results.columns.map((column) => `<th><div class="results-header-cell"><button class="table-header-btn" data-sort="${esc(column)}" type="button">${esc(column)}${getColIcon(column)} ${state.results.sortColumn === column ? (state.results.sortDirection === 'asc' ? '↑' : '↓') : ''}</button><div class="column-resize-handle" data-resize-column="${esc(column)}" role="separator" aria-orientation="vertical" aria-label="Resize ${esc(column)} column"></div></div></th>`).join('')}</tr></thead><tbody>${visibleRows.map((row, index) => `<tr><td class="row-index">${start + index + 1}</td>${state.results.columns.map((column) => `<td title="${esc(row[column])}">${formatResultValue(row[column], start + index, column)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    panel.querySelectorAll('[data-sort]').forEach((button) => {
      button.onclick = () => {
        const column = button.dataset.sort;
        if (state.results.sortColumn === column) state.results.sortDirection = state.results.sortDirection === 'asc' ? 'desc' : 'asc';
        else {
          state.results.sortColumn = column;
          state.results.sortDirection = 'asc';
        }
        renderResults();
        persistWorkspaceState(state.workspace);
      };
    });
    bindResultColumnResizers(panel);
    bindResultCellToggles(panel);
    bindResultsPanelScrollAssist(panel);

    panel.querySelectorAll('tbody tr').forEach((tr, index) => {
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const clickedCell = e.target?.closest?.('td');
        const cellIndex = clickedCell ? clickedCell.cellIndex - 1 : -1;
        const column = cellIndex >= 0 ? state.results.columns[cellIndex] : '';
        const row = visibleRows[index];
        state.results.contextRow = row;
        state.results.contextCell = column ? {
          column,
          value: row?.[column],
          formattedJson: formatJsonPlain(row?.[column])
        } : null;
        const menu = $('resultsContextMenu');
        if (menu) {
          const copyCellBtn = $('contextCopyCellBtn');
          const copyFormattedJsonBtn = $('contextCopyFormattedJsonBtn');
          const copyColumnBtn = $('contextCopyColumnBtn');
          if (copyCellBtn) {
            copyCellBtn.disabled = !column;
            copyCellBtn.textContent = column ? `Copy ${column} value` : 'Copy cell value';
          }
          if (copyFormattedJsonBtn) {
            copyFormattedJsonBtn.disabled = !state.results.contextCell?.formattedJson;
          }
          if (copyColumnBtn) {
            copyColumnBtn.disabled = !column;
          }
          menu.classList.remove('hidden');
          const maxLeft = window.innerWidth - menu.offsetWidth - 10;
          const maxTop = window.innerHeight - menu.offsetHeight - 10;
          menu.style.left = `${Math.min(e.clientX, maxLeft)}px`;
          menu.style.top = `${Math.min(e.clientY, maxTop)}px`;
        }
      });
    });
  }

  function serializeCellValueForCopy(value) {
    if (value === null) {
      return 'NULL';
    }
    if (value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function copyText(text, message) {
    if (!text) {
      setStatus('error', 'Nothing to copy.');
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => setStatus('success', message)).catch(() => fallbackCopy(text, message));
      return;
    }
    fallbackCopy(text, message);
  }

  function fallbackCopy(text, message) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try {
      const ok = document.execCommand('copy');
      setStatus(ok ? 'success' : 'error', ok ? message : 'Could not copy text.');
    } catch {
      setStatus('error', 'Could not copy text.');
    }
    area.remove();
  }

  function copyResults() {
    if (!state.results.columns.length || !state.results.rows.length) {
      setStatus('error', 'No result rows to copy.');
      return;
    }
    const lines = [state.results.columns.join('\t'), ...sortedRows().map((row) => state.results.columns.map((column) => String(row[column] ?? '')).join('\t'))];
    copyText(lines.join('\n'), 'Result rows copied.');
  }

  function exportCsv() {
    if (!state.results.columns.length || !state.results.rows.length) {
      setStatus('error', 'No result rows to export.');
      return;
    }
    const csv = [state.results.columns.join(','), ...sortedRows().map((row) => state.results.columns.map((column) => {
      const text = String(row[column] ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query-results-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('success', 'CSV exported from the currently loaded result set.');
  }

  function loadTemplateIntoEditor(query, message) {
    setWorkspace('sql');
    setQuery(query);
    setStatus('success', message);
  }

  function createInsertSelectTemplate() {
    loadTemplateIntoEditor(buildInsertSelectTemplate(), 'INSERT SELECT template generated.');
  }

  function createUpdateJoinTemplate() {
    loadTemplateIntoEditor(buildUpdateJoinTemplate(), 'UPDATE JOIN template generated.');
  }

  function createMergePreviewTemplate() {
    loadTemplateIntoEditor(buildMergePreviewTemplate(), 'MERGE preview template generated. Execution remains blocked in this app.');
  }

  async function loadObjectProfile() {
    if (!ensureReadyConnection('profiling the object')) {
      return;
    }
    if (!state.activeObject) {
      setStatus('error', 'Select a table or view first.');
      return;
    }
    const sampleRows = Math.max(10, Math.min(1000, Number($('profileSampleRowsInput').value || 200)));
    setStatus('loading', `Profiling ${state.activeObject}...`);
    resetResultsForRun(`Profiling ${state.activeObject}...`);
    try {
      const payload = await api('/api/object-insights', {
        method: 'POST',
        data: requestConnection({
          action: 'profile',
          object: state.activeObject,
          selectedColumns: advancedTemplateColumns(),
          sampleRows
        })
      });
      setResults(payload.columns || [], payload.rows || [], {
        totalRows: Number(payload.totalRows ?? (payload.rows || []).length),
        output: payload.output || {},
        visualKind: 'profile',
        visualObject: payload.object || state.activeObject,
        tabTitle: `Profile ${payload.object || state.activeObject}`,
        tabKey: `profile:${payload.object || state.activeObject}`
      });
      setStatus('success', payload.message || `Profile loaded for ${state.activeObject}.`);
    } catch (error) {
      renderResultError(error, {
        title: 'Profile failed',
        operation: 'profile',
        object: state.activeObject
      });
    }
  }

  async function loadDependencyView() {
    if (!ensureReadyConnection('loading object dependencies')) {
      return;
    }
    if (!state.activeObject) {
      setStatus('error', 'Select a table or view first.');
      return;
    }
    setStatus('loading', `Loading dependencies for ${state.activeObject}...`);
    resetResultsForRun(`Loading dependencies for ${state.activeObject}...`);
    try {
      const payload = await api('/api/object-insights', {
        method: 'POST',
        data: requestConnection({
          action: 'dependencies',
          object: state.activeObject
        })
      });
      setResults(payload.columns || [], payload.rows || [], {
        totalRows: Number(payload.totalRows ?? (payload.rows || []).length),
        output: payload.output || {},
        visualKind: 'dependencies',
        visualObject: payload.object || state.activeObject,
        tabTitle: `Dependencies ${payload.object || state.activeObject}`,
        tabKey: `dependencies:${payload.object || state.activeObject}`
      });
      setStatus('success', payload.message || `Dependency view loaded for ${state.activeObject}.`);
    } catch (error) {
      renderResultError(error, {
        title: 'Dependency view failed',
        operation: 'dependencies',
        object: state.activeObject
      });
    }
  }

  async function loadRowCountInsight() {
    if (!ensureReadyConnection('loading row count')) return;
    if (!state.activeObject) {
      setStatus('error', 'Select a table or view first.');
      return;
    }
    setStatus('loading', `Loading row count for ${state.activeObject}...`);
    resetResultsForRun(`Loading row count for ${state.activeObject}...`);
    try {
      const payload = await api('/api/object-insights', {
        method: 'POST',
        data: requestConnection({ action: 'rowCount', object: state.activeObject })
      });
      setResults(payload.columns || [], payload.rows || [], {
        totalRows: Number(payload.totalRows ?? (payload.rows || []).length),
        output: payload.output || {},
        visualKind: 'query',
        visualObject: payload.object || state.activeObject,
        tabTitle: `Row count ${payload.object || state.activeObject}`,
        tabKey: `rowCount:${payload.object || state.activeObject}`
      });
      setStatus('success', payload.message || `Loaded row count for ${state.activeObject}.`);
    } catch (error) {
      renderResultError(error, { title: 'Row count failed', operation: 'row count', object: state.activeObject });
    }
  }

  async function loadTopValuesInsight() {
    if (!ensureReadyConnection('loading top values')) return;
    if (!state.activeObject) {
      setStatus('error', 'Select a table or view first.');
      return;
    }
    setStatus('loading', `Loading top values for ${state.activeObject}...`);
    resetResultsForRun(`Loading top values for ${state.activeObject}...`);
    try {
      const payload = await api('/api/object-insights', {
        method: 'POST',
        data: requestConnection({
          action: 'topValues',
          object: state.activeObject,
          selectedColumns: selectedColumns().slice(0, 8),
          topN: 10
        })
      });
      setResults(payload.columns || [], payload.rows || [], {
        totalRows: Number(payload.totalRows ?? (payload.rows || []).length),
        output: payload.output || {},
        visualKind: 'query',
        visualObject: payload.object || state.activeObject,
        tabTitle: `Top values ${payload.object || state.activeObject}`,
        tabKey: `topValues:${payload.object || state.activeObject}`
      });
      setStatus('success', payload.message || `Loaded top values for ${state.activeObject}.`);
    } catch (error) {
      renderResultError(error, { title: 'Top values failed', operation: 'top values', object: state.activeObject });
    }
  }

  async function loadResultShapeInsight() {
    if (!ensureReadyConnection('loading result shape')) return;
    const query = getQuery().trim() || (state.activeObject ? buildSelect() : '');
    if (!query) {
      setStatus('error', 'Enter a read query or select a table/view first.');
      return;
    }
    setStatus('loading', 'Loading result shape metadata...');
    resetResultsForRun('Loading result shape metadata...');
    try {
      const payload = await api('/api/object-insights', {
        method: 'POST',
        data: requestConnection({ action: 'resultShape', query })
      });
      setResults(payload.columns || [], payload.rows || [], {
        totalRows: Number(payload.totalRows ?? (payload.rows || []).length),
        output: payload.output || {},
        visualKind: 'query',
        tabTitle: 'Result shape',
        tabKey: `resultShape:${query.slice(0, 120)}`
      });
      setStatus('success', payload.message || 'Loaded result shape metadata.');
    } catch (error) {
      renderResultError(error, { title: 'Result shape failed', operation: 'result shape', query });
    }
  }

  async function loadEstimatedPlan() {
    if (!ensureReadyConnection('loading an estimated plan')) return;
    const query = getQuery().trim() || (state.activeObject ? buildSelect() : '');
    if (!query) {
      setStatus('error', 'Enter a read query or select a table/view first.');
      return;
    }
    setStatus('loading', 'Loading estimated execution plan...');
    resetResultsForRun('Loading estimated execution plan...');
    try {
      const payload = await api('/api/query-plan', {
        method: 'POST',
        data: requestConnection({ query })
      });
      setResults(payload.columns || [], payload.rows || [], {
        totalRows: Number(payload.totalRows ?? (payload.rows || []).length),
        output: { planXml: payload.planXml || '', mode: payload.mode || 'estimated' },
        visualKind: 'query',
        tabTitle: 'Estimated plan',
        tabKey: `plan:${query.slice(0, 120)}`
      });
      setStatus('success', payload.message || 'Loaded estimated plan. The query was not executed.');
    } catch (error) {
      renderResultError(error, { title: 'Estimated plan failed', operation: 'query plan', query });
    }
  }

  async function loadSchemaCompare() {
    if (!ensureReadyConnection('comparing schemas')) return;
    if (!state.activeObject) {
      setStatus('error', 'Select a table or view first.');
      return;
    }
    setStatus('loading', `Comparing ${state.activeObject}...`);
    resetResultsForRun(`Comparing ${state.activeObject}...`);
    try {
      const payload = await api('/api/schema-compare', {
        method: 'POST',
        data: {
          leftConnection: requestConnection(),
          rightConnection: requestConnection(),
          leftObject: state.activeObject,
          rightObject: $('advancedSourceObjectSelect')?.value || state.activeObject,
          objectType: state.activeObjectType || 'table'
        }
      });
      setResults(payload.columns || [], payload.rows || [], {
        totalRows: Number(payload.rows?.length || 0),
        output: payload.summary || {},
        visualKind: 'query',
        visualObject: state.activeObject,
        tabTitle: `Compare ${state.activeObject}`,
        tabKey: `schemaCompare:${state.activeObject}:${$('advancedSourceObjectSelect')?.value || state.activeObject}`
      });
      setStatus('success', `Schema compare found ${payload.differences?.length || 0} difference(s).`);
    } catch (error) {
      renderResultError(error, { title: 'Schema compare failed', operation: 'schema compare', object: state.activeObject });
    }
  }

  async function testConnection() {
    if (!ensureReadyConnection('testing the connection')) {
      return;
    }
    state.connectionTest = {
      state: 'loading',
      message: 'Trying the current source with the entered credentials.'
    };
    renderConnectionTestResult();
    $('testConnectionBtn').disabled = true;
    setStatus('loading', 'Testing connection...');
    try {
      const payload = await api('/api/test-connection', { method: 'POST', data: requestConnection() });
      persistActiveConnection();
      const details = [
        payload.data?.server_name || connection().server,
        payload.data?.database_name || connection().database
      ].filter(Boolean).join(' • ');
      state.connectionTest = {
        state: 'success',
        message: details ? `${payload.message} ${details}` : payload.message,
        data: payload.data || null
      };
      renderConnectionTestResult();
      setStatus('success', payload.message);
    } catch (error) {
      state.connectionTest = {
        state: 'error',
        message: error.message
      };
      renderConnectionTestResult();
      setStatus('error', error.message);
      throw error;
    } finally {
      $('testConnectionBtn').disabled = false;
    }
  }

  function openConfirm(config) {
    state.pendingAction = config;
    state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    $('modalTitle').textContent = config.title;
    $('modalMessage').textContent = config.message;
    $('modalMetrics').innerHTML = (config.metrics || []).map((metric) => `<div class="artifact-card"><strong>${esc(metric.label)}</strong><code>${esc(metric.value)}</code></div>`).join('');
    const review = $('modalReview');
    if (review && Array.isArray(config.review) && config.review.length) {
      review.innerHTML = `<h3>Review context</h3><div class="modal-review-grid">${config.review.map((item) => `<div><span>${esc(item.label)}</span><code>${esc(item.value ?? '')}</code></div>`).join('')}</div>`;
      review.classList.remove('hidden');
    } else if (review) {
      review.innerHTML = '';
      review.classList.add('hidden');
    }
    $('confirmModalBtn').textContent = config.confirmLabel;
    $('secondConfirmWrap').classList.add('hidden');
    $('secondConfirmHint').textContent = '';
    $('secondConfirmInput').value = '';
    $('confirmModal').classList.remove('hidden');
    $('confirmModal').setAttribute('aria-hidden', 'false');
    $('confirmModalBtn').focus();

    // TTL countdown — read from health endpoint, fall back to 5 minutes.
    if (state.confirmCountdownTimer) {
      clearInterval(state.confirmCountdownTimer);
      state.confirmCountdownTimer = null;
    }
    const ttlMs = Number(state.health?.confirmationTtlMs || 5 * 60 * 1000);
    const expiresAt = Date.now() + ttlMs;
    const countdown = $('modalCountdown');
    const tick = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      if (countdown) {
        countdown.textContent = remaining > 0
          ? `Expires in ${minutes}:${String(seconds).padStart(2, '0')}`
          : 'Confirmation expired.';
      }
      if (remaining <= 0) {
        clearInterval(state.confirmCountdownTimer);
        state.confirmCountdownTimer = null;
        closeConfirm();
        setStatus('error', 'Confirmation token expired. Resubmit the query to try again.');
      }
    };
    tick();
    state.confirmCountdownTimer = setInterval(tick, 1000);
  }

  function closeConfirm() {
    state.pendingAction = null;
    if (state.confirmCountdownTimer) {
      clearInterval(state.confirmCountdownTimer);
      state.confirmCountdownTimer = null;
    }
    const countdown = $('modalCountdown');
    if (countdown) {
      countdown.textContent = '';
    }
    $('confirmModal').classList.add('hidden');
    $('confirmModal').setAttribute('aria-hidden', 'true');
    const review = $('modalReview');
    if (review) {
      review.innerHTML = '';
      review.classList.add('hidden');
    }
    $('secondConfirmInput').value = '';
    if (state.lastFocusedElement?.focus) {
      state.lastFocusedElement.focus();
    }
    state.lastFocusedElement = null;
  }

  async function runQuery() {
    if (!ensureReadyConnection('running the query')) {
      return;
    }
    const query = getQuery().trim();
    if (!query) {
      setStatus('error', 'Enter a query first.');
      return;
    }
    setStatus('loading', 'Executing query...');
    resetResultsForRun('Executing query...');
    try {
      const payload = await api('/api/query', { method: 'POST', data: requestConnection({ query }) });
      if (payload.requiresConfirmation) {
        const actionSummary = currentActionSummary(query);
        const current = connection();
        setResults([], [], {
          rowsAffected: Number(payload.rowsAffected || 0),
          tabTitle: `${payload.action || 'Write'} review`,
          tabKey: ''
        });
        setStatus('success', payload.message);
        openConfirm({
          type: 'write',
          title: `Confirm ${payload.action}`,
          message: payload.message,
          confirmLabel: payload.action === 'DELETE' ? 'Execute delete' : 'Execute write',
          metrics: [{ label: 'Action', value: payload.action }, { label: 'Rows', value: payload.rowsAffected }],
          review: [
            { label: 'Server', value: current.server },
            { label: 'Database', value: current.database },
            { label: 'Detected risk', value: actionSummary.risk },
            { label: 'Active object', value: state.activeObject || 'not selected' },
            { label: 'SQL size', value: `${actionSummary.lines} lines / ${actionSummary.chars} chars` },
            { label: 'Execution path', value: '/api/query confirmation token' }
          ],
          request: { query, confirmToken: payload.confirmationToken }
        });
        return;
      }
      setResults(payload.columns || [], payload.rows || [], {
        rowsAffected: Number(payload.rowsAffected || 0),
        totalRows: Number(payload.totalRows ?? (payload.rows || []).length),
        truncated: Boolean(payload.truncated),
        visualKind: 'query',
        tabTitle: state.activeObject ? `Query ${state.activeObject}` : 'Query result',
        tabKey: ''
      });
      addQueryHistory(query);
      const rowCount = Array.isArray(payload.rows) ? payload.rows.length : 0;
      const affected = Number(payload.rowsAffected || 0);
      setStatus('success', rowCount ? `Returned ${rowCount} rows${payload.truncated ? ' (truncated in app)' : ''}.` : `Completed. ${affected ? `${affected} row${affected === 1 ? '' : 's'} affected.` : 'No rows returned.'}`);
    } catch (error) {
      renderQueryError(error, query);
    }
  }

  async function runProcedure() {
    if (!ensureReadyConnection('running the procedure')) {
      return;
    }
    if (!state.activeProcedure) {
      setStatus('error', 'Select a stored procedure first.');
      return;
    }
    setStatus('loading', 'Preparing procedure execution...');
    resetResultsForRun('Preparing procedure execution...');
    try {
      const payload = await api('/api/procedures', { method: 'POST', data: requestConnection({ procedure: state.activeProcedure, parameters: currentProcedureValues() }) });
      if (payload.requiresConfirmation) {
        const current = connection();
        setResults([], [], {
          tabTitle: `Prepare ${state.activeProcedure}`,
          tabKey: ''
        });
        setStatus('success', payload.message);
        openConfirm({
          type: 'procedure',
          title: 'Confirm procedure execution',
          message: payload.message,
          confirmLabel: 'Run procedure',
          metrics: [{ label: 'Procedure', value: payload.procedure }, { label: 'Parameters', value: payload.parameterCount }],
          review: [
            { label: 'Server', value: current.server },
            { label: 'Database', value: current.database },
            { label: 'Procedure', value: payload.procedure || state.activeProcedure },
            { label: 'Parameters', value: payload.parameterCount },
            { label: 'Execution path', value: '/api/procedures confirmation token' },
            { label: 'Audit', value: 'procedure execution is recorded separately' }
          ],
          request: { procedure: state.activeProcedure, parameters: currentProcedureValues(), confirmToken: payload.confirmationToken }
        });
        return;
      }
      renderResultError(new Error('Unexpected response from server.'), {
        title: 'Procedure failed',
        operation: 'procedure',
        object: state.activeProcedure
      });
    } catch (error) {
      renderResultError(error, {
        title: 'Procedure failed',
        operation: 'procedure',
        object: state.activeProcedure
      });
    }
  }

  async function confirmPendingAction() {
    if (!state.pendingAction) return;
    const isProcedure = state.pendingAction.type === 'procedure';
    setStatus('loading', isProcedure ? 'Executing stored procedure...' : 'Executing write...');
    resetResultsForRun(isProcedure ? 'Executing stored procedure...' : 'Executing write...');
    try {
      if (isProcedure) {
        const executedRequest = { ...state.pendingAction.request };
        const payload = await api('/api/procedures', { method: 'POST', data: requestConnection({ ...executedRequest }) });
        closeConfirm();
        setResults(payload.columns || [], payload.rows || [], {
          rowsAffected: Number(payload.rowsAffected || 0),
          totalRows: Number(payload.totalRows ?? (payload.rows || []).length),
          truncated: Boolean(payload.truncated),
          output: payload.output || {},
          returnValue: payload.returnValue,
          visualKind: 'procedure',
          visualObject: payload.procedure || state.activeProcedure,
          tabTitle: `Procedure ${payload.procedure || state.activeProcedure}`,
          tabKey: ''
        });
        addProcedureHistory(payload.procedure || executedRequest.procedure || state.activeProcedure, executedRequest.parameters || {});
        setStatus('success', payload.message);
        return;
      }

      const payload = await api('/api/query', { method: 'POST', data: requestConnection({ ...state.pendingAction.request }) });
      const executedQuery = state.pendingAction.request.query;
      closeConfirm();
      setResults([], [], {
        rowsAffected: Number(payload.rowsAffected || 0),
        tabTitle: `${payload.action || 'Write'} executed`,
        tabKey: ''
      });
      addQueryHistory(executedQuery);
      setStatus('success', `${payload.message} ${payload.rowsAffected} row${payload.rowsAffected === 1 ? '' : 's'} affected.`);
    } catch (error) {
      const failedAction = state.pendingAction;
      closeConfirm();
      renderResultError(error, {
        title: isProcedure ? 'Procedure execution failed' : 'Write execution failed',
        operation: isProcedure ? 'procedure execution' : 'write execution',
        query: failedAction?.request?.query || '',
        object: failedAction?.request?.procedure || ''
      });
    }
  }

  async function loadAudit() {
    setStatus('loading', 'Loading recent audit...');
    resetResultsForRun('Loading recent audit...');
    try {
      const filters = {
        event: $('auditEventFilter')?.value || '',
        outcome: $('auditOutcomeFilter')?.value || '',
        action: $('auditActionFilter')?.value || '',
        sourceType: $('auditSourceFilter')?.value || '',
        database: $('auditDatabaseFilter')?.value || '',
        search: $('auditSearchFilter')?.value || '',
        limit: $('auditLimitFilter')?.value || '50'
      };
      state.auditFilters = filters;
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (String(value || '').trim()) params.set(key, value);
      });
      const payload = await api(`/api/audit?${params.toString() || 'limit=50'}`);
      const rows = (payload.entries || []).map((entry) => ({
        timestamp: formatTimestamp(entry.timestamp || ''),
        sourceType: entry.sourceType || '',
        event: entry.event || '',
        outcome: entry.outcome || '',
        action: entry.action || '',
        database: entry.database || '',
        detail: entry.detail || ''
      }));
      setResults(['timestamp', 'sourceType', 'event', 'outcome', 'action', 'database', 'detail'], rows, {
        totalRows: rows.length,
        visualKind: 'audit',
        tabTitle: 'Audit log',
        tabKey: `audit:${JSON.stringify(filters)}`
      });
      $('auditFilterDialog')?.classList.add('hidden');
      setStatus('success', `Loaded ${rows.length} audit entries${payload.totalMatched != null ? ` (${payload.totalMatched} matched)` : ''}.`);
    } catch (error) {
      renderResultError(error, {
        title: 'Audit log failed',
        operation: 'audit'
      });
    }
  }

  function openAuditFilters() {
    const dialog = $('auditFilterDialog');
    if (!dialog) {
      loadAudit().catch((error) => setStatus('error', error.message));
      return;
    }
    dialog.classList.remove('hidden');
    dialog.setAttribute('aria-hidden', 'false');
    $('auditLimitFilter')?.focus();
  }

  function closeAuditFilters() {
    $('auditFilterDialog')?.classList.add('hidden');
    $('auditFilterDialog')?.setAttribute('aria-hidden', 'true');
  }

  function clearAuditFilters() {
    ['auditEventFilter', 'auditOutcomeFilter', 'auditActionFilter', 'auditSourceFilter', 'auditDatabaseFilter', 'auditSearchFilter'].forEach((id) => {
      if ($(id)) $(id).value = '';
    });
    if ($('auditLimitFilter')) $('auditLimitFilter').value = '50';
  }

  async function loadHealth() {
    try { state.health = await api('/api/health'); } catch { state.health = null; }
    renderConnectionSelectors();
    renderPolicy();
  }

  function bind() {
    const handleConnectionFieldChange = () => {
      persistActiveConnection();
      renderConnectionSummary();
      clearConnectionTestResult();
    };

    $('sourceTypeSelect').onchange = () => {
      renderAuthOptions();
      renderExplorerSummary();
      persistActiveConnection();
      clearConnectionTestResult();
    };
    $('authModeSelect').onchange = () => {
      syncAuthFields();
      persistActiveConnection();
      clearConnectionTestResult();
    };
    ['serverInput', 'portInput', 'databaseInput', 'usernameInput', 'passwordInput'].forEach((id) => { $(id).oninput = handleConnectionFieldChange; });
    $('trustServerCertificateInput').onchange = handleConnectionFieldChange;
    $('saveConnectionBtn').onclick = saveCurrentConnection;
    if ($('toggleControlRailBtn')) {
      $('toggleControlRailBtn').onclick = () => toggleSidePanel('controlRail');
    }
    if ($('toggleActivityPanelBtn')) {
      $('toggleActivityPanelBtn').onclick = () => toggleSidePanel('activity');
    }
    if ($('exitWorkbenchBtn')) {
      $('exitWorkbenchBtn').onclick = () => exitWorkbench();
    }
    $('testConnectionBtn').onclick = () => testConnection().catch((error) => setStatus('error', error.message));
    $('loadTablesBtn').onclick = () => loadCatalog().catch((error) => renderResultError(error, {
      title: 'Catalog load failed',
      operation: 'catalog'
    }));
    $('clearHistoryBtn').onclick = clearCurrentHistory;
    if ($('loadAuditBtn')) {
      $('loadAuditBtn').onclick = openAuditFilters;
    }
    if ($('openWorkbenchToolsBtn')) $('openWorkbenchToolsBtn').onclick = openWorkbenchTools;
    if ($('openSupportBtn')) $('openSupportBtn').onclick = openSupportDialog;
    if ($('closeWorkbenchToolsBtn')) $('closeWorkbenchToolsBtn').onclick = closeWorkbenchTools;
    if ($('closeSupportBtn')) $('closeSupportBtn').onclick = closeSupportDialog;
    if ($('saveScratchpadBtn')) $('saveScratchpadBtn').onclick = saveCurrentScratchpad;
    if ($('copyDiagnosticsBtn')) $('copyDiagnosticsBtn').onclick = copyDiagnostics;
    if ($('copySupportReportBtn')) $('copySupportReportBtn').onclick = copySupportReport;
    if ($('sendSupportReportBtn')) $('sendSupportReportBtn').onclick = sendSupportReport;
    if ($('commandSearchInput')) $('commandSearchInput').oninput = renderCommandPalette;
    if ($('supportScreenshotInput')) $('supportScreenshotInput').onchange = updateSupportScreenshotNote;
    if ($('closeAuditFiltersBtn')) $('closeAuditFiltersBtn').onclick = closeAuditFilters;
    if ($('clearAuditFiltersBtn')) $('clearAuditFiltersBtn').onclick = clearAuditFilters;
    if ($('applyAuditFiltersBtn')) $('applyAuditFiltersBtn').onclick = () => loadAudit().catch((error) => setStatus('error', error.message));
    $('runQueryBtn').onclick = () => runQuery().catch((error) => setStatus('error', error.message));
    $('decreaseEditorTextBtn').onclick = () => changeEditorTextSize(-0.05);
    $('increaseEditorTextBtn').onclick = () => changeEditorTextSize(0.05);
    $('formatQueryBtn').onclick = formatSql;
    $('copyQueryBtn').onclick = () => copyText(getQuery(), 'SQL copied to clipboard.');
    $('clearQueryBtn').onclick = () => setQuery('');
    $('generateQueryBtn').onclick = generateQuery;
    $('scriptCreateBtn').onclick = () => scriptActiveDefinition('create').catch((error) => setStatus('error', error.message));
    $('scriptAlterBtn').onclick = () => scriptActiveDefinition('alter').catch((error) => setStatus('error', error.message));
    if ($('insertSqlHelperBtn')) {
      $('insertSqlHelperBtn').onclick = () => insertSqlHelper();
    }
    if ($('wrapSqlHelperBtn')) {
      $('wrapSqlHelperBtn').onclick = () => insertSqlHelper({ wrapSelection: true });
    }
        $('toggleAdvancedOperationsBtn').onclick = () => {
      state.advancedOperationsVisible = !state.advancedOperationsVisible;
      saveAdvancedOperationsVisibility();
      renderAdvancedOperationsVisibility();
    };
    $('insertSelectTemplateBtn').onclick = createInsertSelectTemplate;
    $('updateJoinTemplateBtn').onclick = createUpdateJoinTemplate;
    $('mergePreviewBtn').onclick = createMergePreviewTemplate;
    $('profileObjectBtn').onclick = () => loadObjectProfile().catch((error) => setStatus('error', error.message));
    $('dependencyViewBtn').onclick = () => loadDependencyView().catch((error) => setStatus('error', error.message));
    $('rowCountInsightBtn').onclick = () => loadRowCountInsight().catch((error) => setStatus('error', error.message));
    $('topValuesInsightBtn').onclick = () => loadTopValuesInsight().catch((error) => setStatus('error', error.message));
    $('schemaCompareBtn').onclick = () => loadSchemaCompare().catch((error) => setStatus('error', error.message));
    $('resultShapeBtn').onclick = () => loadResultShapeInsight().catch((error) => setStatus('error', error.message));
    $('queryPlanBtn').onclick = () => loadEstimatedPlan().catch((error) => setStatus('error', error.message));
    $('previewRowsBtn').onclick = () => {
      setMode('select');
      $('topRowsInput').value = 100;
      generateQuery();
    };
    $('countRowsBtn').onclick = () => state.activeObject ? (setQuery(buildCount()), setStatus('success', 'COUNT query generated.')) : setStatus('error', 'Select a table or view first.');
    $('resetBuilderBtn').onclick = () => {
      state.selectedColumns.clear();
      $('filtersList').innerHTML = '<div class="empty-note">No filters yet. Add one when you want a WHERE clause.</div>';
      $('sortColumnSelect').value = '';
      $('sortDirectionSelect').value = 'ASC';
      $('topRowsInput').value = 100;
      $('distinctSelect').value = 'false';
      renderColumns();
      if (state.activeObject) generateQuery();
    };
    $('addFilterBtn').onclick = () => {
      const row = addFilter();
      if (row) setStatus('success', 'Filter added. Pick a column and value to build the WHERE clause.');
      persistWorkspaceState('sql');
    };
    $('selectAllColumnsBtn').onclick = () => {
      state.activeColumns.forEach((column) => state.selectedColumns.add(column.name));
      renderColumns();
      if (state.activeObject) generateQuery();
    };
    $('clearColumnsBtn').onclick = () => {
      state.selectedColumns.clear();
      renderColumns();
      if (state.activeObject) generateQuery();
    };
    $('insertWhereBtn').onclick = () => {
      const filters = getFilters();
      if (!filters.length) {
        addFilter();
        if (state.activeObject && ['select', 'update', 'delete'].includes(state.queryMode)) {
          generateQuery();
        }
        setStatus('success', 'Filter row added. Pick a column and value, then generate SQL.');
        return;
      }
      const clause = whereClause(filters);
      if (!clause) {
        setStatus('neutral', 'Finish the filter value before inserting a WHERE clause.');
        return;
      }
      if (state.activeObject && ['select', 'update', 'delete'].includes(state.queryMode)) {
        generateQuery();
        setStatus('success', `${state.queryMode.toUpperCase()} query rebuilt with the current WHERE clause.`);
        return;
      }
      insertAtCursor(clause);
      setStatus('success', 'WHERE clause inserted into SQL.');
    };
    $('insertOrderByBtn').onclick = () => insertAtCursor($('sortColumnSelect').value ? `\nORDER BY ${bid($('sortColumnSelect').value)} ${$('sortDirectionSelect').value || 'DESC'}` : '\nORDER BY ');
    $('insertJoinCommentBtn').onclick = () => insertAtCursor(`\n-- JOIN note: connect ${state.activeObject || 'dbo.YourTable'} to another object here\n-- Example: INNER JOIN dbo.OtherTable o ON o.Key = t.Key\n`);
    $('loadProcedureParamsBtn').onclick = () => refreshProcedureParameters().catch((error) => setStatus('error', error.message));
    $('scriptProcedureCreateBtn').onclick = () => scriptActiveDefinition('create').catch((error) => setStatus('error', error.message));
    $('scriptProcedureAlterBtn').onclick = () => scriptActiveDefinition('alter').catch((error) => setStatus('error', error.message));
    $('runProcedureBtn').onclick = () => runProcedure().catch((error) => setStatus('error', error.message));
    $('copyResultsBtn').onclick = copyResults;
    $('decreaseResultsTextBtn').onclick = () => changeResultsTextSize(-0.04);
    $('increaseResultsTextBtn').onclick = () => changeResultsTextSize(0.04);
    $('exportCsvBtn').onclick = exportCsv;
    if ($('scrollResultsLeftBtn')) {
      $('scrollResultsLeftBtn').onclick = () => scrollResultsHorizontal(-1);
    }
    if ($('scrollResultsRightBtn')) {
      $('scrollResultsRightBtn').onclick = () => scrollResultsHorizontal(1);
    }
    if ($('scrollResultsDockLeftBtn')) {
      $('scrollResultsDockLeftBtn').onclick = () => scrollResultsHorizontal(-1);
    }
    if ($('scrollResultsDockRightBtn')) {
      $('scrollResultsDockRightBtn').onclick = () => scrollResultsHorizontal(1);
    }
    $('prevPageBtn').onclick = () => {
      state.results.page = Math.max(1, state.results.page - 1);
      renderResults();
      persistWorkspaceState(state.workspace);
    };
    $('nextPageBtn').onclick = () => {
      state.results.page += 1;
      renderResults();
      persistWorkspaceState(state.workspace);
    };
    $('closeModalBtn').onclick = closeConfirm;
    $('cancelModalBtn').onclick = closeConfirm;
    $('confirmModalBtn').onclick = () => confirmPendingAction().catch((error) => setStatus('error', error.message));
    $('confirmModal').onclick = (event) => {
      if (event.target.id === 'confirmModal') closeConfirm();
    };
    if ($('workbenchToolsDialog')) {
      $('workbenchToolsDialog').onclick = (event) => {
        if (event.target.id === 'workbenchToolsDialog') closeWorkbenchTools();
      };
    }
    if ($('supportDialog')) {
      $('supportDialog').onclick = (event) => {
        if (event.target.id === 'supportDialog') closeSupportDialog();
      };
    }
    document.querySelectorAll('[data-snippet]').forEach((button) => {
      button.onclick = () => {
        setWorkspace('sql');
        setQuery(SNIPPETS[button.dataset.snippet] || DEFAULT_QUERY);
        setStatus('success', 'Snippet loaded.');
      };
    });
    document.querySelectorAll('#queryModeSegment .segment-btn').forEach((button) => {
      button.onclick = () => setMode(button.dataset.mode);
    });
    document.querySelectorAll('.workspace-segment').forEach((button) => {
      button.onclick = () => setWorkspace(button.dataset.workspace);
    });
    document.querySelectorAll('.explorer-segment').forEach((button) => {
      button.onclick = () => setExplorer(button.dataset.explorer);
    });
    ['sortColumnSelect', 'sortDirectionSelect', 'topRowsInput', 'distinctSelect'].forEach((id) => {
      $(id).onchange = () => {
        if (state.queryMode === 'select' && state.activeObject) generateQuery();
        else persistWorkspaceState('sql');
      };
    });
    $('advancedSourceObjectSelect').onchange = () => {
      updateAdvancedOperationsSummary();
      persistWorkspaceState('sql');
    };
    $('targetJoinColumnSelect').onchange = () => {
      if (!$('sourceJoinColumnInput').value.trim()) {
        $('sourceJoinColumnInput').value = $('targetJoinColumnSelect').value;
      }
      updateAdvancedOperationsSummary();
      persistWorkspaceState('sql');
    };
    $('sourceJoinColumnInput').oninput = () => {
      updateAdvancedOperationsSummary();
      persistWorkspaceState('sql');
    };
    $('profileSampleRowsInput').oninput = () => {
      updateAdvancedOperationsSummary();
      persistWorkspaceState('sql');
    };
    $('tableSearchInput').oninput = debounce(filterObjects, 120);
    $('procedureSearchInput').oninput = debounce(filterProcedures, 120);
    ['objectTypeFilter', 'objectSchemaFilter', 'pinnedOnlyObjectsToggle', 'recentOnlyObjectsToggle'].forEach((id) => {
      if ($(id)) $(id).onchange = filterObjects;
    });
    ['procedureSchemaFilter', 'pinnedOnlyProceduresToggle', 'recentOnlyProceduresToggle'].forEach((id) => {
      if ($(id)) $(id).onchange = filterProcedures;
    });
    if ($('queryHistorySearch')) {
      $('queryHistorySearch').oninput = debounce(() => {
        state.historyFilter = ($('queryHistorySearch').value || '').trim().toLowerCase();
        renderHistoryPanel();
      }, 150);
    }
    if ($('localResultsFilter')) {
      $('localResultsFilter').oninput = debounce(() => {
        state.results.localFilter = ($('localResultsFilter').value || '').trim();
        state.results.page = 1;
        renderResults();
        persistWorkspaceState(state.workspace);
      }, 150);
    }
    if (window.__dataWorkbenchResultsDockHandler) {
      window.removeEventListener('scroll', window.__dataWorkbenchResultsDockHandler, true);
      window.removeEventListener('resize', window.__dataWorkbenchResultsDockHandler);
    }
    window.__dataWorkbenchResultsDockHandler = debounce(updateResultScrollControls, 60);
    window.addEventListener('scroll', window.__dataWorkbenchResultsDockHandler, true);
    window.addEventListener('resize', window.__dataWorkbenchResultsDockHandler);

    initEditorAdapter();
    const editor = $('queryEditor');
    if (editor) {
      editor.oninput = () => {
        updateEditorStats();
        syncEditorBackdrop();
        persistWorkspaceState('sql');
      };
      editor.onscroll = () => {
        const backdrop = $('queryEditorBackdrop');
        if (backdrop) {
          backdrop.scrollTop = editor.scrollTop;
          backdrop.scrollLeft = editor.scrollLeft;
        }
      };
    }

    document.addEventListener('click', (e) => {
      const menu = $('resultsContextMenu');
      if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    if ($('contextCopyCellBtn')) {
      $('contextCopyCellBtn').onclick = () => {
        if (state.results.contextCell) {
          copyText(serializeCellValueForCopy(state.results.contextCell.value), 'Cell value copied.');
          $('resultsContextMenu')?.classList.add('hidden');
        }
      };
    }
    if ($('contextCopyFormattedJsonBtn')) {
      $('contextCopyFormattedJsonBtn').onclick = () => {
        const formattedJson = state.results.contextCell?.formattedJson;
        if (formattedJson) {
          copyText(formattedJson, 'Formatted JSON copied.');
          $('resultsContextMenu')?.classList.add('hidden');
        }
      };
    }
    if ($('contextCopyColumnBtn')) {
      $('contextCopyColumnBtn').onclick = () => {
        if (state.results.contextCell?.column) {
          copyText(state.results.contextCell.column, 'Column name copied.');
          $('resultsContextMenu')?.classList.add('hidden');
        }
      };
    }
    if ($('contextCopyJsonBtn')) {
      $('contextCopyJsonBtn').onclick = () => {
        if (state.results.contextRow) {
          copyText(JSON.stringify(state.results.contextRow, null, 2), 'Row copied as JSON.');
          $('resultsContextMenu')?.classList.add('hidden');
        }
      };
    }
    if ($('contextCopyCsvBtn')) {
      $('contextCopyCsvBtn').onclick = () => {
        if (state.results.contextRow) {
          const csv = state.results.columns.map(c => `"${String(state.results.contextRow[c] ?? '').replace(/"/g, '""')}"`).join(',');
          copyText(csv, 'Row copied as CSV.');
          $('resultsContextMenu')?.classList.add('hidden');
        }
      };
    }
    if (window.__dataWorkbenchKeydownHandler) {
      document.removeEventListener('keydown', window.__dataWorkbenchKeydownHandler);
    }
    window.__dataWorkbenchKeydownHandler = (event) => {
      if (event.key === 'Escape' && !$('confirmModal').classList.contains('hidden')) {
        closeConfirm();
        return;
      }
      if (event.key === 'Escape' && !$('workbenchToolsDialog')?.classList.contains('hidden')) {
        closeWorkbenchTools();
        return;
      }
      if (event.key === 'Escape' && !$('supportDialog')?.classList.contains('hidden')) {
        closeSupportDialog();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openWorkbenchTools();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (state.workspace === 'procedure') runProcedure().catch((error) => setStatus('error', error.message));
        else runQuery().catch((error) => setStatus('error', error.message));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        formatSql();
      }
    };
    document.addEventListener('keydown', window.__dataWorkbenchKeydownHandler);

    document.querySelectorAll('.workspace-mode-link').forEach((link) => {
      link.addEventListener('click', () => {
        persistWorkspaceState(state.workspace);
        persistCatalogState();
      });
    });

    if (window.__dataWorkbenchPagehideHandler) {
      window.removeEventListener('pagehide', window.__dataWorkbenchPagehideHandler);
      window.removeEventListener('beforeunload', window.__dataWorkbenchPagehideHandler);
    }
    window.__dataWorkbenchPagehideHandler = () => {
      persistWorkspaceState(state.workspace);
      persistCatalogState();
      sendLifecycleCloseBeacon();
    };
    window.addEventListener('pagehide', window.__dataWorkbenchPagehideHandler);
    window.addEventListener('beforeunload', window.__dataWorkbenchPagehideHandler);
  }

  async function init() {
    loadAdvancedOperationsVisibility();
    loadTextPreferences();
    loadSidePanelVisibility();
    loadPanelLayout();
    await loadHealth();
    startLifecycleHeartbeat();
    loadVersionInfo();
    restoreActiveConnection();
    const pageMode = currentPageMode();
    state.workspace = pageMode === 'procedures' ? 'procedure' : 'sql';
    state.explorer = pageMode === 'procedures' ? 'procedures' : 'objects';
    bind();
    setupResizablePanels();
    setupSidePanelAutoHide();
    applyTextPreferences();
    loadTheme();
    await loadConnectionHistory();
    loadQueryHistory();
    loadProcedureHistory();
    setWorkspace(state.workspace);
    setExplorer(state.explorer);
    const catalogRestored = restoreCatalogState();
    renderExplorerSummary();
    renderProcedureWorkspace();
    renderFilters();
    renderAdvancedOperationsVisibility();
    populateAdvancedObjectOptions();
    populateJoinColumnOptions();
    updateAdvancedOperationsSummary();
    renderResults();
    renderSaveConnectionResult();
    renderConnectionTestResult();
    modeWarning();
    const workspaceRestored = restoreWorkspaceState(state.workspace);
    if (!workspaceRestored && (!catalogRestored || !state.activeObject)) {
      setQuery(DEFAULT_QUERY);
    } else if (!workspaceRestored && state.workspace === 'sql') {
      generateQuery();
    }
    updateEditorStats();
    if (!catalogRestored && pageMode === 'procedures' && hasReadyConnection()) {
      await loadCatalog()
        .then(() => restoreWorkspaceState('procedure'))
        .catch((error) => setStatus('error', `Could not restore the procedure catalog: ${error.message}`));
    }
  }

  return { init };
};
