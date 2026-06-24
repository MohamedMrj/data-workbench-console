import Link from 'next/link';
import Script from 'next/script';
import ConsoleAppBoot from './console-app-boot';

function SqlWorkspace({ hidden = false }) {
  return (
    <section id="sqlWorkspace" className={`surface studio-panel studio-panel-sql${hidden ? ' hidden' : ''}`}>
      <div className="studio-grid">
        <section className="builder-card">
          <div className="section-title-row">
            <div>
              <div className="eyebrow">Compose</div>
              <h2>Query Builder</h2>
              <p className="section-subtitle">Generate clean SQL from live metadata, then keep the final text fully editable.</p>
            </div>
            <div className="button-row wrap right">
              <button id="previewRowsBtn" className="ghost-btn small">Preview rows</button>
              <button id="countRowsBtn" className="ghost-btn small">Count rows</button>
              <button id="resetBuilderBtn" className="ghost-btn small">Reset</button>
            </div>
          </div>

          <div className="builder-grid builder-primary-grid">
            <div className="builder-panel builder-panel-operation">
              <h3>Operation</h3>
              <div className="segment-row query-mode-segment" id="queryModeSegment">
                <button className="segment-btn active" data-mode="select">Select</button>
                <button className="segment-btn" data-mode="insert">Insert</button>
                <button className="segment-btn" data-mode="update">Update</button>
                <button className="segment-btn danger-segment" data-mode="delete">Delete</button>
              </div>
              <div id="modeWarning" className="mode-warning hidden" />
              <section className="advanced-operations-panel advanced-operations-panel-inline">
                <div className="section-title-row">
                  <div>
                    <div className="eyebrow">Extend</div>
                    <h3>Advanced Operations</h3>
                    <p className="section-subtitle">Generate safer cross-object templates and run read-only object analysis against the current catalog.</p>
                  </div>
                  <button
                    id="toggleAdvancedOperationsBtn"
                    className="ghost-btn small"
                    type="button"
                    aria-expanded="false"
                    aria-controls="advancedOperationsContent"
                  >
                    Show advanced
                  </button>
                </div>

                <div id="advancedOperationsContent" className="builder-grid advanced-operations-grid hidden">
                  <div className="builder-panel advanced-panel-template">
                    <h3>Template Context</h3>
                    <div className="inline-fields two-cols">
                      <label className="field compact-field">
                        <span>Source object</span>
                        <select id="advancedSourceObjectSelect">
                          <option value="">Select loaded object</option>
                        </select>
                      </label>
                      <label className="field compact-field">
                        <span>Profile sample rows</span>
                        <input id="profileSampleRowsInput" type="number" min="10" max="1000" defaultValue="200" />
                      </label>
                    </div>
                    <div className="inline-fields two-cols">
                      <label className="field compact-field">
                        <span>Target key</span>
                        <select id="targetJoinColumnSelect">
                          <option value="">Select target key</option>
                        </select>
                      </label>
                      <label className="field compact-field">
                        <span>Source key</span>
                        <input id="sourceJoinColumnInput" type="text" placeholder="Match target key by name" />
                      </label>
                    </div>
                    <div id="advancedOperationsSummary" className="summary-text">
                      Choose a companion object to generate `INSERT SELECT`, `UPDATE JOIN`, and `MERGE` preview templates.
                    </div>
                  </div>

                  <div className="builder-panel advanced-panel-safe">
                    <h3>Safe Templates</h3>
                    <div className="button-row wrap">
                      <button id="insertSelectTemplateBtn" className="ghost-btn">Insert SELECT</button>
                      <button id="updateJoinTemplateBtn" className="ghost-btn">Update JOIN</button>
                      <button id="mergePreviewBtn" className="ghost-btn">MERGE preview</button>
                    </div>
                    <div className="summary-text">
                      `MERGE` stays blocked for execution in this app. The template is generated for review only.
                    </div>
                  </div>

                  <div className="builder-panel advanced-panel-analysis">
                    <h3>Object Analysis</h3>
                    <div className="button-row wrap">
                      <button id="profileObjectBtn" className="ghost-btn">Sample profile</button>
                      <button id="dependencyViewBtn" className="ghost-btn">Dependency view</button>
                      <button id="rowCountInsightBtn" className="ghost-btn">Row count</button>
                      <button id="topValuesInsightBtn" className="ghost-btn">Top values</button>
                      <button id="schemaCompareBtn" className="ghost-btn">Schema compare</button>
                      <button id="resultShapeBtn" className="ghost-btn">Result shape</button>
                      <button id="queryPlanBtn" className="ghost-btn">Estimated plan</button>
                    </div>
                    <div className="summary-text">
                      These actions are read-only and load the result grid without changing your saved SQL history.
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <button
              className="panel-resize-handle panel-resize-handle-vertical"
              data-resize-handle="builder"
              type="button"
              aria-label="Resize operation and columns panels"
              aria-hidden="false"
            />

            <div className="builder-panel builder-panel-columns">
              <div className="section-title-row tight">
                <h3>Columns</h3>
                <div className="button-row wrap right compact-actions">
                  <button id="selectAllColumnsBtn" className="text-btn">All</button>
                  <button id="clearColumnsBtn" className="text-btn">Clear</button>
                </div>
              </div>
              <div id="selectedColumnsSummary" className="summary-text">All columns will be used.</div>
              <div id="columnsPanel" className="columns-panel empty-state compact">Load a table or view to see columns.</div>
            </div>

          </div>
        </section>

        <section className="editor-card">
          <div className="section-title-row">
            <div>
              <div className="eyebrow">Execute</div>
              <h2>SQL Editor</h2>
              <p className="section-subtitle">Run generated SQL or edit it manually. Reads are fast, writes are always previewed first.</p>
            </div>
            <div className="button-row wrap right">
              <button id="decreaseEditorTextBtn" className="ghost-btn small" type="button">A-</button>
              <button id="increaseEditorTextBtn" className="ghost-btn small" type="button">A+</button>
              <button id="formatQueryBtn" className="ghost-btn small">Format</button>
              <button id="copyQueryBtn" className="ghost-btn small">Copy</button>
              <button id="clearQueryBtn" className="ghost-btn small">Clear</button>
              <button id="runQueryBtn" className="primary-btn">Run query</button>
            </div>
          </div>
          <div className="editor-controls-grid" style={{ gridTemplateColumns: '1.65fr 1fr' }}>
            <div className="builder-panel">
              <div className="section-title-row tight">
                <h3>Filters</h3>
                <button id="addFilterBtn" className="ghost-btn small" style={{ color: 'var(--accent)', borderColor: 'var(--accent)', fontWeight: 600 }}>+ Add filter</button>
              </div>
              <div id="filtersList" className="filters-list" />
            </div>

            <div className="builder-panel">
              <h3>Sort and limit</h3>
              <div className="inline-fields two-cols">
                <label className="field compact-field">
                  <span>Sort column</span>
                  <select id="sortColumnSelect" />
                </label>
                <label className="field compact-field">
                  <span>Direction</span>
                  <select id="sortDirectionSelect">
                    <option value="ASC">ASC</option>
                    <option value="DESC">DESC</option>
                  </select>
                </label>
              </div>
              <div className="inline-fields two-cols">
                <label className="field compact-field">
                  <span>Top rows</span>
                  <input id="topRowsInput" type="number" min="1" max="5000" defaultValue="100" />
                </label>
                <label className="field compact-field">
                  <span>Distinct</span>
                  <select id="distinctSelect" defaultValue="false">
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
          <div className="button-row wrap builder-actions">
            <button id="generateQueryBtn" className="ghost-btn" type="button" title="Rebuild the editor SQL from the current builder selections.">Refresh SQL</button>
            <button id="scriptCreateBtn" className="ghost-btn" type="button">Script CREATE</button>
            <button id="scriptAlterBtn" className="ghost-btn" type="button">Script ALTER/Edit</button>
            <button id="insertWhereBtn" className="ghost-btn">Insert WHERE</button>
            <button id="insertOrderByBtn" className="ghost-btn">Insert ORDER BY</button>
            <button id="insertJoinCommentBtn" className="ghost-btn">Join note</button>
          </div>
          <div className="sql-helper-bar">
            <label className="field compact-field sql-helper-select">
              <span>SQL helper</span>
              <select id="sqlHelperSelect">
                <option value="concat">CONCAT</option>
                <option value="replace">REPLACE</option>
                <option value="trim">TRIM</option>
                <option value="cast">CAST</option>
                <option value="tryConvert">TRY_CONVERT</option>
                <option value="coalesce">COALESCE</option>
                <option value="nullif">NULLIF blank</option>
                <option value="caseWhen">CASE</option>
                <option value="dateadd">DATEADD</option>
                <option value="datediff">DATEDIFF</option>
                <option value="sha2Key">SHA2 key</option>
              </select>
            </label>
            <button id="insertSqlHelperBtn" className="ghost-btn" type="button">Insert helper</button>
            <button id="wrapSqlHelperBtn" className="ghost-btn" type="button">Wrap selection</button>
          </div>
          <div id="editorContainer" className="editor-container">
            <div id="queryEditorBackdrop" className="editor-backdrop" aria-hidden="true"></div>
            <textarea id="queryEditor" spellCheck="false" />
          </div>
          <div className="helper-row">
            <span id="editorHint">Shortcuts: Ctrl+Enter to run, Ctrl+Shift+F to format. Stored procedures run from the dedicated page.</span>
            <span id="editorStats">0 lines • 0 chars</span>
            <span id="queryModeHint">Mode: Select</span>
          </div>
        </section>
      </div>
    </section>
  );
}

function ProcedureWorkspace({ hidden = false }) {
  return (
    <section id="procedureWorkspace" className={`surface studio-panel studio-panel-procedure${hidden ? ' hidden' : ''}`}>
      <div className="section-title-row">
        <div>
          <div className="eyebrow">Operate</div>
          <h2>Stored Procedure Runner</h2>
          <p className="section-subtitle">Parameters are discovered from the current source and execution stays behind a simple review-and-run confirmation.</p>
        </div>
        <div className="button-row wrap right">
          <button id="loadProcedureParamsBtn" className="ghost-btn small">Refresh params</button>
          <button id="scriptProcedureCreateBtn" className="ghost-btn small" type="button">Script CREATE</button>
          <button id="scriptProcedureAlterBtn" className="ghost-btn small" type="button">Script ALTER/Edit</button>
          <button id="runProcedureBtn" className="primary-btn">Run procedure</button>
        </div>
      </div>
      <div id="procedureSummary" className="procedure-summary empty-state">Select a stored procedure from the explorer to inspect its parameters.</div>
      <div id="procedureParametersPanel" className="procedure-parameters empty-state">Procedure parameters will appear here.</div>
    </section>
  );
}

function ResultsCard() {
  return (
    <section className="results-card surface">
      <div className="section-title-row">
        <div>
          <div className="eyebrow">Inspect</div>
          <h2>Results</h2>
          <div id="statusText" className="status-text">Ready.</div>
        </div>
        <div className="button-row wrap right">
          <button id="decreaseResultsTextBtn" className="ghost-btn small" type="button">A-</button>
          <button id="increaseResultsTextBtn" className="ghost-btn small" type="button">A+</button>
          <input id="localResultsFilter" type="text" placeholder="Filter results..." className="ghost-btn small local-filter-input" autoComplete="off" />
          <button id="loadAuditBtn" className="ghost-btn small">Audit log</button>
          <button id="copyResultsBtn" className="ghost-btn small">Copy rows</button>
          <button id="exportCsvBtn" className="ghost-btn small">Export CSV</button>
          <button id="scrollResultsLeftBtn" className="ghost-btn small result-scroll-btn" type="button" title="Scroll result columns left" aria-label="Scroll result columns left">← Columns</button>
          <button id="scrollResultsRightBtn" className="ghost-btn small result-scroll-btn" type="button" title="Scroll result columns right" aria-label="Scroll result columns right">Columns →</button>
          <button id="prevPageBtn" className="ghost-btn small">Prev</button>
          <div id="pageIndicator" className="page-indicator">Page 1/1</div>
          <button id="nextPageBtn" className="ghost-btn small">Next</button>
          <div id="statusBadge" className="status-badge neutral">Idle</div>
        </div>
      </div>
      <div id="resultTabs" className="result-tabs" aria-label="Result tabs" />
      <div id="resultsMeta" className="results-meta">No results yet.</div>
      <div id="resultsArtifacts" className="results-artifacts" />
      <div id="resultsPanel" className="results-panel empty-state">Run a query or procedure to see results.</div>
      <div id="resultsScrollDock" className="results-scroll-dock" aria-label="Result column navigation">
        <span>Columns</span>
        <button id="scrollResultsDockLeftBtn" className="result-scroll-dock-btn" type="button" title="Scroll result columns left" aria-label="Scroll result columns left">←</button>
        <button id="scrollResultsDockRightBtn" className="result-scroll-dock-btn" type="button" title="Scroll result columns right" aria-label="Scroll result columns right">→</button>
      </div>
    </section>
  );
}

export default function WorkbenchShell({ pageMode = 'sql' }) {
  const isProceduresPage = pageMode === 'procedures';

  return (
    <>
      <ConsoleAppBoot />
      <div className="shell-backdrop" aria-hidden="true">
        <div className="shell-orbit shell-orbit-a" />
        <div className="shell-orbit shell-orbit-b" />
        <div className="shell-grid" />
      </div>
      <div className="app-shell" data-page-mode={pageMode}>
        <aside className="control-rail surface">
          <section className="brand-panel panel-section">
            <div className="eyebrow">Multi-source data workbench</div>
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div>
                <h1>Operator Console</h1>
                <p>One production-safe workspace for Fabric SQL, Lakehouse SQL endpoints, and SQL Server operations.</p>
              </div>
            </div>
            <Link
              href={isProceduresPage ? '/docs/procedure-runner' : '/docs/sql-studio'}
              className="page-link docs-link-button"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open documentation
            </Link>
            <div className="brand-highlights">
              <div className="info-chip emphasis-chip">
                <strong>Safety-first</strong>
                <span>Write previews, button-based confirmation, and catalog-aware execution paths.</span>
              </div>
            </div>
            <div id="connectionSummary" className="info-stack">
              <div className="info-chip">
                <strong>Session</strong>
                <span>No active connection yet.</span>
              </div>
            </div>
            <div id="appVersionStatus" className="app-version-status" aria-live="polite">
              <span id="appVersionText">Version checking...</span>
              <span id="appUpdateText" className="app-update-text hidden" />
            </div>
          </section>

          <section className="panel-section connection-section">
            <div className="section-title-row">
              <div>
                <div className="eyebrow">Data Source</div>
                <h2>Connection</h2>
              </div>
            </div>

            <div className="conn-field-group">
              <label className="field compact-field">
                <span>Source type</span>
                <select id="sourceTypeSelect" autoComplete="off" />
              </label>
              <label className="field compact-field">
                <span>Authentication</span>
                <select id="authModeSelect" autoComplete="off" />
              </label>
            </div>

            <div className="conn-field-group two-col">
              <label className="field compact-field">
                <span>Server</span>
                <input id="serverInput" type="text" placeholder="workspace.datawarehouse.fabric.microsoft.com" autoComplete="off" />
              </label>
              <label className="field compact-field conn-port">
                <span>Port</span>
                <input id="portInput" type="number" min="1" max="65535" placeholder="1433" autoComplete="off" />
              </label>
            </div>

            <label className="field compact-field">
              <span>Database</span>
              <input id="databaseInput" type="text" placeholder="my_database" autoComplete="off" />
            </label>

            <div id="authFields" className="conn-field-group two-col hidden">
              <label id="usernameField" className="field compact-field">
                <span>Username</span>
                <input id="usernameInput" type="text" placeholder="sql_login" autoComplete="username" />
              </label>
              <label id="passwordField" className="field compact-field">
                <span>Password</span>
                <input id="passwordInput" type="password" placeholder="••••••••" autoComplete="current-password" />
              </label>
            </div>

            <label id="trustServerCertificateField" className="toggle-field hidden">
              <input id="trustServerCertificateInput" type="checkbox" defaultChecked />
              <span>Trust SQL Server certificate</span>
            </label>

            <div className="conn-actions">
              <div className="conn-actions-primary">
                <button id="testConnectionBtn" className="secondary-btn">Test connection</button>
                <button id="loadTablesBtn" className="primary-btn">Load catalog</button>
              </div>
              <div className="conn-save-row">
                <label className="field compact-field conn-profile-name">
                  <span>Profile name <em className="tiny-note">(optional)</em></span>
                  <input id="profileNameInput" type="text" placeholder="e.g. Production Gold" autoComplete="off" />
                </label>
                <button id="saveConnectionBtn" className="save-conn-btn" type="button" title="Save this connection profile to the server">
                  <span className="save-conn-icon" aria-hidden="true">💾</span>
                  Save profile
                </button>
              </div>
            </div>

            <div id="saveConnectionResult" className="connection-test-panel empty-note">
              Save persists this profile in the app database so it is available after restarts. Passwords are never saved.
            </div>

            <div id="testConnectionResult" className="connection-test-panel empty-note">
              Run a connection test to verify the current server, database, and authentication settings.
            </div>
          </section>

          <section className="panel-section grow-section">
            <div className="section-title-row">
              <div>
                <div className="eyebrow">Quick Connect</div>
                <h2>Saved Profiles</h2>
              </div>
              <span className="tiny-note">Passwords never stored</span>
            </div>
            <div id="savedConnections" className="saved-connections" />
          </section>

          <section className="panel-section">
            <div className="section-title-row">
              <h2>Safety Policy</h2>
            </div>
            <div id="policySummary" className="policy-summary" />
          </section>
        </aside>

        <div
          className="panel-resize-handle panel-resize-handle-vertical app-shell-resizer"
          data-resize-handle="controlRail"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize connection panel"
        />

        <main className="workspace-shell">
          <header className="hero-panel surface">
            <div className="hero-copy">
              <nav className="workspace-mode-nav" aria-label="Workbench mode">
                <Link href="/" className={`workspace-mode-link page-link${!isProceduresPage ? ' active' : ''}`}>SQL Studio</Link>
                <Link href="/procedures" className={`workspace-mode-link page-link${isProceduresPage ? ' active' : ''}`}>Procedure Runner</Link>
              </nav>
              <div className="eyebrow">{isProceduresPage ? 'Procedure execution' : 'SQL execution'}</div>
              <div id="activeTarget" className="active-target">No object or procedure selected</div>
              <div id="activeMeta" className="active-meta">
                {isProceduresPage
                  ? 'Connect to a source and load procedures to execute routines with clear parameter inspection and one-click confirmation.'
                  : 'Connect to a source and load a catalog to build, inspect, and run SQL with stronger guardrails.'}
              </div>
            </div>
              <div className="hero-actions" aria-label="Workbench actions">
                <div className="hero-action-group">
                  <Link
                    href={isProceduresPage ? '/docs/procedure-runner' : '/docs/sql-studio'}
                    className="ghost-btn small docs-link-button"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Documentation
                  </Link>
                  <button id="openWorkbenchToolsBtn" className="ghost-btn small" type="button">
                    Tools
                  </button>
                  <button id="openSupportBtn" className="ghost-btn small" type="button">
                    Support
                  </button>
                </div>
                <div className="hero-action-group panel-toggle-group" aria-label="Panel visibility">
                  <button id="toggleControlRailBtn" className="ghost-btn small" type="button" aria-pressed="false">
                    Hide connection panel
                  </button>
                  <button id="toggleActivityPanelBtn" className="ghost-btn small" type="button" aria-pressed="false">
                    Hide themes & history
                  </button>
                </div>
                <div className="hero-action-group">
                  <button id="exitWorkbenchBtn" className="ghost-btn small exit-workbench-btn" type="button">
                    Exit Data Workbench
                  </button>
                </div>
              </div>
          </header>

          <div className="workspace-grid">
            <section className="explorer-panel surface">
              <div className="section-title-row">
                <div>
                  <div className="eyebrow">Discover</div>
                  <h2>{isProceduresPage ? 'Procedure Explorer' : 'Object Explorer'}</h2>
                  <p className="section-subtitle">
                    {isProceduresPage
                      ? 'Browse the stored procedures exposed by the current connection.'
                      : 'Browse tables and views available on the current connection.'}
                  </p>
                </div>
              </div>

              <div id="explorerSummary" className="summary-text">Load a catalog to browse available objects and procedures.</div>

              <div id="objectsExplorer" className={`explorer-pane${isProceduresPage ? ' hidden' : ''}`}>
                <label className="field compact-field">
                  <span>Search objects</span>
                  <input id="tableSearchInput" type="text" placeholder="dbo.TaskGroupInstances" />
                </label>
                <div className="explorer-filter-grid">
                  <label className="field compact-field">
                    <span>Type</span>
                    <select id="objectTypeFilter">
                      <option value="">All</option>
                      <option value="table">Tables</option>
                      <option value="view">Views</option>
                    </select>
                  </label>
                  <label className="field compact-field">
                    <span>Schema</span>
                    <select id="objectSchemaFilter">
                      <option value="">All schemas</option>
                    </select>
                  </label>
                  <label className="toggle-field compact-toggle">
                    <input id="pinnedOnlyObjectsToggle" type="checkbox" />
                    <span>Pinned only</span>
                  </label>
                  <label className="toggle-field compact-toggle">
                    <input id="recentOnlyObjectsToggle" type="checkbox" />
                    <span>Recent only</span>
                  </label>
                </div>
                <div id="tableList" className="explorer-list" />
              </div>

              <div id="procedureExplorer" className={`explorer-pane${isProceduresPage ? '' : ' hidden'}`}>
                <label className="field compact-field">
                  <span>Search procedures</span>
                  <input id="procedureSearchInput" type="text" placeholder="dbo.usp_ProcessTaskGroup" />
                </label>
                <div className="explorer-filter-grid">
                  <label className="field compact-field">
                    <span>Schema</span>
                    <select id="procedureSchemaFilter">
                      <option value="">All schemas</option>
                    </select>
                  </label>
                  <label className="toggle-field compact-toggle">
                    <input id="pinnedOnlyProceduresToggle" type="checkbox" />
                    <span>Pinned only</span>
                  </label>
                  <label className="toggle-field compact-toggle">
                    <input id="recentOnlyProceduresToggle" type="checkbox" />
                    <span>Recent only</span>
                  </label>
                </div>
                <div id="procedureList" className="explorer-list" />
              </div>
            </section>

            <div
              className="panel-resize-handle panel-resize-handle-vertical workspace-resizer"
              data-resize-handle="explorer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize explorer panel"
            />

            <section className="studio-stack">
              {isProceduresPage ? (
                <>
                  <SqlWorkspace hidden={true} />
                  <div className="procedure-studio-grid">
                    <ProcedureWorkspace hidden={false} />
                    <div
                      className="panel-resize-handle panel-resize-handle-vertical"
                      data-resize-handle="procedure"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize stored procedure runner panel"
                    />
                    <ResultsCard />
                  </div>
                </>
              ) : (
                <>
                  <SqlWorkspace hidden={false} />
                  <ProcedureWorkspace hidden={true} />
                </>
              )}
            </section>

            <div
              className="panel-resize-handle panel-resize-handle-vertical workspace-resizer"
              data-resize-handle="activity"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize activity panel"
            />

            <aside className="activity-panel surface">
              <section className="panel-section">
                <div className="section-title-row">
                  <div>
                    <div className="eyebrow">Personalize</div>
                    <h2>Themes</h2>
                  </div>
                  <span className="tiny-note">Saved locally</span>
                </div>
                <div id="themeList" className="theme-list" />
              </section>

              <section className="panel-section grow-section">
                <div className="section-title-row">
                  <div>
                    <div className="eyebrow">Recall</div>
                    <h2 id="historyPanelTitle">{isProceduresPage ? 'Procedure History' : 'Recent SQL'}</h2>
                  </div>
                  <button id="clearHistoryBtn" className="ghost-btn small">Clear</button>
                </div>
                <label className="field compact-field">
                  <span>Search history</span>
                  <input id="queryHistorySearch" type="text" placeholder={isProceduresPage ? 'Filter procedure runs…' : 'Filter recent queries…'} autoComplete="off" />
                </label>
                <div id="queryHistory" className="query-history" />
              </section>
            </aside>
          </div>

          {!isProceduresPage ? (
            <>
              <div
                className="panel-resize-handle panel-resize-handle-horizontal results-resizer"
                data-resize-handle="results"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize results panel"
              />
              <ResultsCard />
            </>
          ) : null}
        </main>
      </div>

      <div id="confirmModal" className="modal-backdrop hidden" aria-hidden="true">
        <div className="modal-card">
          <div className="modal-header">
            <h2 id="modalTitle">Confirm action</h2>
            <button id="closeModalBtn" className="icon-btn" type="button" aria-label="Close">×</button>
          </div>
          <p id="modalMessage" className="modal-message" />
          <div id="modalMetrics" className="modal-metrics" />
          <div id="modalReview" className="modal-review hidden" />
          <div id="secondConfirmWrap" className="field hidden">
            <span>Review the action details below, then continue when you are ready</span>
            <input id="secondConfirmInput" type="text" autoComplete="off" />
            <small id="secondConfirmHint" className="tiny-note" />
          </div>
          <div className="button-row wrap right modal-actions">
            <span id="modalCountdown" className="tiny-note modal-countdown" aria-live="polite" />
            <button id="cancelModalBtn" className="ghost-btn" type="button">Cancel</button>
            <button id="confirmModalBtn" className="primary-btn" type="button">Continue</button>
          </div>
        </div>
      </div>

      <div id="shutdownOverlay" className="shutdown-overlay hidden" aria-hidden="true">
        <div className="shutdown-card">
          <div className="shutdown-spinner" aria-hidden="true" />
          <div>
            <h2 id="shutdownTitle">Stopping Data Workbench</h2>
            <p id="shutdownMessage">The local server is shutting down. You can close this browser tab.</p>
          </div>
        </div>
      </div>

      <div id="resultsContextMenu" className="context-menu hidden" role="menu">
        <button id="contextCopyCellBtn" className="context-menu-item" role="menuitem">Copy cell value</button>
        <button id="contextCopyFormattedJsonBtn" className="context-menu-item" role="menuitem">Copy formatted JSON</button>
        <button id="contextCopyColumnBtn" className="context-menu-item" role="menuitem">Copy column name</button>
        <button id="contextCopyJsonBtn" className="context-menu-item" role="menuitem">Copy row as JSON</button>
        <button id="contextCopyCsvBtn" className="context-menu-item" role="menuitem">Copy row as CSV</button>
      </div>

      <div id="auditFilterDialog" className="modal-backdrop hidden" aria-hidden="true">
        <div className="modal-card audit-filter-card">
          <div className="modal-header">
            <h2>Audit filters</h2>
            <button id="closeAuditFiltersBtn" className="icon-btn" type="button" aria-label="Close">×</button>
          </div>
          <div className="editor-controls-grid">
            <label className="field compact-field"><span>Event</span><input id="auditEventFilter" type="text" placeholder="query" /></label>
            <label className="field compact-field"><span>Outcome</span><input id="auditOutcomeFilter" type="text" placeholder="success" /></label>
            <label className="field compact-field"><span>Action</span><input id="auditActionFilter" type="text" placeholder="SELECT" /></label>
            <label className="field compact-field"><span>Source type</span><input id="auditSourceFilter" type="text" placeholder="fabric-sql" /></label>
            <label className="field compact-field"><span>Database</span><input id="auditDatabaseFilter" type="text" placeholder="meta_store" /></label>
            <label className="field compact-field"><span>Search</span><input id="auditSearchFilter" type="text" placeholder="free text" /></label>
            <label className="field compact-field"><span>Limit</span><input id="auditLimitFilter" type="number" min="1" max="200" defaultValue="50" /></label>
          </div>
          <div className="button-row wrap right modal-actions">
            <button id="clearAuditFiltersBtn" className="ghost-btn" type="button">Clear</button>
            <button id="applyAuditFiltersBtn" className="primary-btn" type="button">Load audit</button>
          </div>
        </div>
      </div>

      <div id="supportDialog" className="modal-backdrop hidden" aria-hidden="true">
        <div className="modal-card support-card">
          <div className="modal-header">
            <h2>Contact support</h2>
            <button id="closeSupportBtn" className="icon-btn" type="button" aria-label="Close">×</button>
          </div>
          <p className="modal-message support-intro">
            Send a bug report to Mohamed. The app prepares an email draft and copies the report text so you can review it before sending.
          </p>
          <div className="support-form-grid">
            <label className="field compact-field"><span>Your name</span><input id="supportNameInput" type="text" placeholder="optional" autoComplete="name" /></label>
            <label className="field compact-field"><span>Your email</span><input id="supportEmailInput" type="email" placeholder="optional" autoComplete="email" /></label>
            <label className="field compact-field support-wide"><span>Short title</span><input id="supportTitleInput" type="text" placeholder="What went wrong?" maxLength="120" /></label>
            <label className="field compact-field"><span>Area</span><select id="supportAreaSelect">
              <option value="SQL Studio">SQL Studio</option>
              <option value="Procedure Runner">Procedure Runner</option>
              <option value="Connections">Connections</option>
              <option value="Object Explorer">Object Explorer</option>
              <option value="Results">Results</option>
              <option value="Launcher">Launcher</option>
              <option value="Other">Other</option>
            </select></label>
            <label className="field compact-field"><span>Severity</span><select id="supportSeveritySelect">
              <option value="Bug">Bug</option>
              <option value="Blocking">Blocking</option>
              <option value="Confusing UX">Confusing UX</option>
              <option value="Feature request">Feature request</option>
              <option value="Question">Question</option>
            </select></label>
            <label className="field compact-field support-wide"><span>What happened?</span><textarea id="supportDescriptionInput" rows="5" placeholder="Describe the bug or problem..." /></label>
            <label className="field compact-field support-wide"><span>Steps to reproduce</span><textarea id="supportStepsInput" rows="4" placeholder="1. Open...&#10;2. Click...&#10;3. Expected... but got..." /></label>
            <label className="field compact-field support-wide"><span>Screenshot</span><input id="supportScreenshotInput" type="file" accept="image/*" /><small id="supportScreenshotNote" className="tiny-note">Optional. The email draft will remind you to attach the selected screenshot.</small></label>
            <label className="toggle-field compact-toggle support-wide">
              <input id="supportDiagnosticsInput" type="checkbox" defaultChecked />
              <span>Include safe app diagnostics</span>
            </label>
          </div>
          <div className="button-row wrap right modal-actions">
            <button id="copySupportReportBtn" className="ghost-btn" type="button">Copy report</button>
            <button id="sendSupportReportBtn" className="primary-btn" type="button">Open email draft</button>
          </div>
        </div>
      </div>

      <div id="workbenchToolsDialog" className="modal-backdrop hidden" aria-hidden="true">
        <div className="modal-card workbench-tools-card">
          <div className="modal-header">
            <h2>Workbench tools</h2>
            <button id="closeWorkbenchToolsBtn" className="icon-btn" type="button" aria-label="Close">×</button>
          </div>
          <div className="tools-layout">
            <section className="tools-panel">
              <div className="section-title-row tight">
                <div>
                  <div className="eyebrow">Command</div>
                  <h3>Quick actions</h3>
                </div>
              </div>
              <input id="commandSearchInput" className="local-filter-input tools-search" type="text" placeholder="Search actions..." autoComplete="off" />
              <div id="commandPaletteList" className="tools-command-list" />
            </section>

            <section className="tools-panel">
              <div className="section-title-row tight">
                <div>
                  <div className="eyebrow">Safety</div>
                  <h3>Current SQL</h3>
                </div>
              </div>
              <div id="sqlExplainPanel" className="tools-info-grid" />
              <div id="capabilityPanel" className="visual-chip-row" />
            </section>

            <section className="tools-panel">
              <div className="section-title-row tight">
                <div>
                  <div className="eyebrow">Workspace</div>
                  <h3>Scratchpads</h3>
                </div>
                <button id="saveScratchpadBtn" className="ghost-btn small" type="button">Save SQL</button>
              </div>
              <div id="scratchpadList" className="tools-list" />
            </section>

            <section className="tools-panel">
              <div className="section-title-row tight">
                <div>
                  <div className="eyebrow">Release</div>
                  <h3>Diagnostics</h3>
                </div>
                <button id="copyDiagnosticsBtn" className="ghost-btn small" type="button">Copy</button>
              </div>
              <div id="diagnosticsPanel" className="tools-info-grid" />
            </section>
          </div>
        </div>
      </div>

      <Script src="/console-core.js" strategy="afterInteractive" />
      <Script src="/console-app.js" strategy="afterInteractive" />
    </>
  );
}
