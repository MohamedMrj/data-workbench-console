# Changelog

All notable Data Workbench Console changes are tracked here.

The in-app version is read from `package.json` and exposed through `/api/version`
together with the current git commit and build information.

## 1.4.2 - 2026-06-29

SQL Server authentication expansion patch.

### Added

- Added SQL Server Windows authentication through Tedious NTLM using explicit
  domain, Windows username, and password fields.
- Added Windows authentication as a SQL Server-only auth option in the
  connection rail while keeping SQL login and Azure service principal unchanged.
- Saved profiles now preserve the Windows domain and username, but still never
  persist passwords.

### Changed

- Saved SQL Server profiles that use SQL login or Windows authentication now
  auto-load the catalog only when the password is still available in the
  browser session; otherwise the app asks the user to enter the password first.
- Documentation now explains SQL Server Windows authentication and the saved
  profile password behavior.

### Verification

- Added server, route-contract, and UI smoke coverage for Windows
  authentication mode selection, validation, saved profile normalization, and
  password redaction.

## 1.4.1 - 2026-06-25

Production usability patch for configurable side-panel behavior.

### Added

- Added `.env` settings for side-panel auto-hide behavior:
  `APP_SIDE_PANEL_AUTO_HIDE_ENABLED`, `APP_SIDE_PANEL_IDLE_MS`, and
  `APP_SIDE_PANEL_FADE_MS`.
- Exposed side-panel auto-hide configuration through `/api/health` so the
  browser uses server/runtime settings instead of hardcoded timing.
- Added the side-panel auto-hide settings to the in-app Settings editor with
  validation, descriptions, and restart guidance.

### Changed

- The default side-panel behavior remains unchanged: auto-hide enabled, 10
  second idle delay, and 800 ms fade duration.
- Documentation now explains that panel auto-hide can be adjusted or disabled
  from Settings.

### Verification

- `npm run build`
- `node scripts/server-unit.test.mjs`
- `node scripts/route-contract.test.mjs`
- `node scripts/ui-smoke.mjs`

## 1.4.0 - 2026-06-25

Workbench usability, support, documentation, and Lakehouse metadata hardening release.

### Added

- Added a local-only `Update` button that appears when the current Git checkout
  is behind `origin/main`, starts a background update, preserves `.env` and
  `.data`, rebuilds, restarts the local server, and reloads the browser.
- Added `POST /api/update` and `scripts/apply-update.ps1` for Git-based
  desktop self-updates.
- Added a local-only Settings interface and `/api/env-settings` route for
  editing known `.env` values through typed controls with descriptions,
  validation, secret redaction, and restart guidance.
- Added Workbench Tools in the workspace header with quick actions, current SQL
  safety summary, capability notes, local scratchpads, and copyable diagnostics.
- Added a Support form that prepares an email draft to
  `mohamed.al-mefrej@hotmail.com`, copies the report text, includes safe
  diagnostics, and supports selecting a screenshot for manual attachment.
- Added richer in-app documentation for shared workspace controls, Support,
  Workbench Tools, Query Builder buttons, SQL helper buttons, Advanced
  Operations, Object Analysis actions, result controls, and Procedure Runner
  actions.
- Added regression coverage for Support modal wiring, Lakehouse-safe schema
  compare fallback, dependency metadata fallback, result-shape fallback, and
  row-count fallback behavior.

### Changed

- Grouped the connection-panel and themes/history show-hide buttons together so
  header actions read as distinct control groups.
- Widened and cleaned up the Workbench Tools modal to avoid horizontal scrolling
  and cramped cards on narrow viewports.
- `Row count` now enables exact `COUNT_BIG(*)` fallback when metadata row-count
  DMVs are unavailable.
- `Schema compare` now falls back to column-only `INFORMATION_SCHEMA` comparison
  when rich SQL Server table metadata is not supported by the source.
- `Result shape` now falls back to active-object column metadata when the
  result-shape DMV is unavailable and an active object is selected.
- `Dependency view` now returns an empty graph with a clear warning when
  dependency metadata is unavailable.
- `Estimated plan` now returns a clear unsupported-source/permission message
  when SHOWPLAN metadata is unavailable.
- Support and diagnostics payloads avoid passwords and client secrets.

### Fixed

- Fixed Support button doing nothing by wiring the open/close/copy/email actions.
- Fixed Object Analysis raw Lakehouse DMV errors such as
  `dm_db_partition_stats is not supported`.
- Fixed Result Shape requiring an object name even though it is query based.
- Fixed estimated plan requests being sent as an invalid single SHOWPLAN batch.
- Fixed Workbench Tools modal overflow and cramped two-column layout on smaller
  screens.

### Verification

- `npm run build`
- `node scripts/sql-metadata.test.mjs`
- `node scripts/route-contract.test.mjs`
- `node scripts/ui-smoke.mjs`
- Browser checks for docs pages, Support modal, Workbench Tools modal, and
  header action grouping.

## 1.3.0 - 2026-06-17

Metadata, explorer, results, editor, audit, and regression coverage release.

### Added

- Added richer generated SQL Server/Fabric SQL table scripts with keys,
  constraints, checks, indexes, computed columns, identity, defaults, and
  foreign keys where catalog metadata exposes them.
- Added dependency graph response metadata with nodes, edges, upstream counts,
  downstream counts, and source limitation warnings.
- Added pinned/recent object and procedure explorer behavior scoped to the
  active connection.
- Added explorer filters for object type, schema, pinned items, recent items,
  and loaded column-name search.
- Added `POST /api/schema-compare` for read-only table/view schema comparison.
- Added `POST /api/query-plan` for estimated read-query plans only.
- Added row count, top values, and result shape metadata helpers through
  `/api/object-insights`.
- Added capped result tabs so query/procedure/metadata outputs can be compared
  without replacing every previous result.
- Added a SQL editor compatibility adapter that preserves current textarea
  behavior and can adopt a client-side Monaco instance when present.
- Added audit filtering by event, outcome, action, source type, database, search
  text, and limit.
- Added metadata and UI smoke regression coverage for the new metadata,
  explorer, audit, and result-tab behavior.
- Added an immediate browser startup screen for the Windows desktop launcher
  with live progress, estimated time remaining, and automatic redirect when the
  local server is ready.

### Changed

- `npm run verify` now includes SQL classifier tests, SQL metadata tests,
  smoke tests, UI smoke tests, build, and responsive audit.
- SQL Server/Fabric SQL table DDL is explicitly labeled as generated catalog
  metadata instead of exact original source text.
- Metadata actions continue to load result grids and audit reads without adding
  any new write execution path.

## 1.2.0 - 2026-06-17

Production-facing update after the initial `1.1.0` metadata version.

### Added

- Added object definition scripting for tables, views, and stored procedures.
- Added `Script CREATE` and `Script ALTER/Edit` actions next to `Generate SQL`.
- Added Fabric Lakehouse/Fabric database exact definition lookup using source
  metadata where available, including `SHOW CREATE TABLE` and view text fallback.
- Added `definitionSource` to object definition responses so the UI can show
  whether a script came from exact metadata or generated catalog metadata.
- Added JSON formatting for JSON-like result cells, including formatted JSON
  blocks in the results table.
- Added context-menu actions for the exact clicked result cell:
  copy cell value, copy column name, copy row as JSON, copy row as CSV, and
  copy formatted JSON when valid.
- Added a reusable Playwright responsive audit and wired it into `npm run verify`.
- Added local lifecycle shutdown support, browser heartbeat handling, and an
  in-app `Exit Data Workbench` action.
- Added Windows production launchers with hidden server startup, stale build
  detection, rebuild handling, readiness waiting, and progress feedback.
- Added full in-app documentation pages for SQL Studio and Procedure Runner.
- Added history context restore so SQL and procedure history can restore the
  relevant selected object/procedure and parameter values.

### Changed

- Improved Query Builder responsiveness, including Object Explorer resizing,
  workspace width detection, and container-aware builder placement.
- Kept Advanced Operations in a single-column builder layout when expanded so
  controls and explanatory text do not collapse into a narrow side rail.
- Improved result rendering by clearing stale results immediately when a new
  query starts and by showing visible error cards for failed queries.
- Reworked profile insights into a compact result strip instead of large cards.
- Improved documentation layout for predictable reading width and mobile behavior.
- Extended the inactivity shutdown timeout to two hours.
- Updated app verification so build, smoke tests, UI smoke tests, and responsive
  layout checks run through one command.

### Fixed

- Fixed result-table right-click behavior so it targets the clicked cell instead
  of only offering whole-row copy actions.
- Fixed Query Builder layout regressions around split-screen, narrow screens,
  expanded Advanced Operations, and long object names.
- Fixed SQL history restore so switching back from history also restores the
  matching object context where possible.
- Fixed procedure history restore coverage for selected procedure and parameter
  values.
- Fixed query execution display so failed queries do not leave stale or hanging
  `Working...` UI.
- Fixed T-SQL classifier messaging for unsupported `IF ... BEGIN ... END`
  multi-statement scripts.
- Fixed `SELECT TOP ... ORDER BY` handling so pagination wrapping does not add
  invalid `OFFSET/FETCH` syntax.
- Fixed production route bootstrap races and local shutdown fetch timing.

### Verification

- `npm run verify` now includes the responsive audit.
- Responsive audit covers populated SQL Studio and Procedure Runner states from
  small mobile widths through wide desktop layouts.

## 1.1.0 - 2026-05-21

Initial versioned internal production baseline.

### Added

- Added the main SQL Studio experience for browsing metadata, generating SQL,
  running read queries, previewing writes, inspecting results, and exporting CSV.
- Added the Procedure Runner for stored procedure selection, parameter handling,
  confirmation, execution, and result inspection.
- Added source support for Microsoft Fabric SQL endpoints, Fabric Lakehouse SQL
  endpoints, and SQL Server.
- Added connection profiles without storing passwords or client secrets.
- Added audit coverage for connection tests, catalog loads, query execution,
  write previews, procedure execution, and profile changes.
- Added proprietary license and ownership documentation.

### Changed

- Set project package metadata to `UNLICENSED`.
- Documented mode switching, workspace restore, SQL history, procedure history,
  and procedure parameter restore behavior.
