# Changelog

All notable Data Workbench Console changes are tracked here.

The in-app version is read from `package.json` and exposed through `/api/version`
together with the current git commit and build information.

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
