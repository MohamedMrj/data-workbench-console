# Changelog

All notable Data Workbench Console changes are tracked here.

The in-app version is read from `package.json` and exposed through `/api/version`
together with the current git commit and build information.

## 1.4.22 - 2026-07-02

Fix the themes/history panel disappearing when both side panels are open.

### Fixed

- Fixed the right themes/history panel not showing beside the workspace on wide
  screens when the left connection panel was also open. The JS layout correctly
  chose "wide" mode, but a leftover `@container (max-width: 1500px)` fallback
  (same specificity, later in the file) overrode the workspace grid and pushed
  the right panel into a full-width row far below the fold, so on a typical
  1920-wide window it was effectively invisible. The JS-driven
  `data-workspace-mode="wide"` template is now restated at higher specificity so
  it wins, and the right panel sits beside the studio again.
- Added a responsive-audit regression check that fails if the themes/history
  panel is not beside the studio while the workspace is in "wide" mode, so this
  cannot silently regress again (the previous jsdom check could not catch it
  because it does not evaluate CSS container queries).

### Notes

- On narrower screens (roughly below a ~1780px window with the left panel open)
  there still is not room for four side-by-side columns, so the themes/history
  panel stacks below by design. Collapsing the connection panel frees the space
  for it to sit beside the studio.

## 1.4.21 - 2026-07-02

Living ambient backdrop and a left-rail layout fix.

### Changed

- Brought the ambient backdrop to life. The two accent light orbs now slowly
  drift and gently pulse (previously only a near-invisible grid moved), with the
  two hues desynced so the glow feels organic. Motion stays gated by
  `APP_AMBIENT_MOTION_ENABLED` and is disabled under `prefers-reduced-motion`; the
  speed still follows `APP_AMBIENT_MOTION_DURATION_MS`.

### Fixed

- Fixed a large blank vertical gap in the left rail's `Safety Policy` section when
  the connection panel is widened. The heading collapsed and wrapped one letter
  per line because the section was omitted from the content-sizing rules the other
  rail sections already use; `Safety Policy` is now content-sized like
  `Connection` and `Saved Profiles`.

## 1.4.20 - 2026-07-02

Safe `.env` settings sync.

### Added

- Added missing-key detection for local `.env` settings based on the app's
  server-side settings schema.
- Added a `Sync new settings` action in the Settings dialog when an update
  introduces new `.env` keys that the user's local file does not have yet.
- Added server-side sync support that appends defaults for missing keys,
  preserves existing values, and creates a `.env` backup under `.data/backups/`
  before writing.
- Added `.env.example` drift coverage so tests fail if a schema setting is not
  represented in the example file.

### Changed

- Settings now marks fields that are missing from the real `.env`, making it
  clear which values will be added by sync.

### Verification

- Added server unit coverage for safe missing-key sync and UI smoke coverage for
  the Settings sync flow.

## 1.4.19 - 2026-07-02

Side-panel responsive layout fix.

### Fixed

- Fixed the themes/history panel disappearing from the visible desktop row when
  the connection panel was also open at common browser widths.
- Removed a viewport-only CSS rule that forced the right panel below the studio
  too early.
- Updated workspace layout calculation to use actual saved panel widths, so
  default panels keep the right panel visible while oversized saved panel
  layouts still compress safely.

### Verification

- Added UI smoke coverage for both side panels visible at desktop width.

## 1.4.18 - 2026-07-02

Tooltip quality refinement.

### Fixed

- Stopped the global tooltip system from falling back to raw visible labels,
  which caused useless hints like a button showing only its own name.
- Added contextual explanations for major workspace controls, explorer rows,
  result tabs, result cells, history rows, theme chips, resize handles, SQL
  actions, procedure actions, audit filters, support fields, and Settings
  controls.
- Lowered priority for converted native `title` text so generated UI elements
  do not show duplicate value-only tooltips when a real explanation is
  available.

### Verification

- Added UI smoke coverage that fails if representative tooltips repeat the
  hovered control label instead of explaining the action.

## 1.4.17 - 2026-07-02

Helpful tooltips and Settings polish.

### Added

- Added a global controlled tooltip system for workbench controls, fields, tabs,
  result actions, generated rows, and dense buttons.
- Added `APP_TOOLTIPS_ENABLED` and `APP_TOOLTIP_DELAY_MS` so users can keep
  hints enabled, slow them down, make them instant, or disable them from
  Settings.
- Exposed tooltip settings through `/api/health`, `/api/env-settings`,
  `.env.example`, README, and the built-in SQL Studio / Procedure Runner docs.

### Changed

- Converted key native browser `title` hints into the app-controlled tooltip
  behavior so hints are more consistent and less visually disruptive.
- Polished the Settings modal with clearer setting cards, smoother hover/focus
  states, and a stable action footer.

### Verification

- Added server, route-contract, UI smoke, and responsive-audit coverage for
  tooltip settings and rendering behavior.

## 1.4.16 - 2026-07-02

Route-contract hardening.

### Fixed

- Fixed `POST /api/procedures` so an explicitly empty procedure name is handled
  by the procedure execution path and returns a clear `400` validation response
  instead of being treated as a catalog-load request.
- Cleaned a misleading indentation issue in the stored procedure handler.

### Verification

- Expanded route-contract coverage for `/api/tables`, `/api/columns`,
  `/api/test-connection`, `/api/procedure-parameters`, and `/api/procedures`
  using validation-only requests that do not connect to a database.

## 1.4.15 - 2026-07-02

Release hardening and dependency refresh.

### Changed

- Refreshed in-range dependency lockfile versions for the release gate:
  Next.js `15.5.20`, `mssql` `12.6.0`, Playwright `1.61.1`, and `ws`
  `8.21.0`.

### Verification

- Re-ran the full release verification suite after the dependency refresh.
- Confirmed production and full dependency audits report zero vulnerabilities.

## 1.4.14 - 2026-07-02

Browser tab icon polish.

### Added

- Added the Data Workbench Console desktop shortcut icon as the app favicon so
  browser tabs show the product icon instead of the default browser/page icon.
- Added explicit Next metadata for the favicon.

### Verification

- Added route-contract coverage that verifies `/favicon.ico` is served as a
  non-empty icon response.

## 1.4.13 - 2026-07-01

Left-panel safety placement polish.

### Changed

- Moved the left-panel Safety Policy section above Connection so users see the
  active safety model before entering or loading connection details.
- Kept Saved Profiles below Connection and preserved the existing connection,
  save-profile, and policy rendering behavior.

### Fixed

- Added compact wrapping for Safety Policy text in the left rail so long policy
  summaries do not pressure the panel horizontally.

### Verification

- Added UI smoke coverage for the left-panel section order.

## 1.4.12 - 2026-07-01

Settings origin-check hotfix.

### Fixed

- Fixed Settings writes being blocked when the browser and Next request URL used
  different loopback hostnames, for example `127.0.0.1` versus `localhost`.
- The Settings route now uses the same loopback-origin equivalence as the rest
  of the local API: `localhost`, `127.0.0.1`, and `[::1]` are accepted as the
  same local app only when the protocol and port match.
- Missing-origin writes are still blocked, and non-local hosts are still blocked.

### Verification

- Added route-contract coverage for successful Settings writes across loopback
  host variants and continued blocking of requests without browser origin data.

## 1.4.11 - 2026-07-01

Configurable side-panel behavior and subtle ambient motion.

### Added

- Added appearance settings for slow background color movement:
  `APP_AMBIENT_MOTION_ENABLED` and `APP_AMBIENT_MOTION_DURATION_MS`.
- Exposed appearance settings through `/api/health`, the in-app Settings dialog,
  `.env.example`, README, and both documentation pages.
- Added a subtle, slow background/grid movement that respects
  `prefers-reduced-motion` and can be disabled from Settings.

### Changed

- Clarified Settings documentation so users can find side-panel auto-hide,
  side-panel timing, and ambient motion controls without editing files manually.

### Verification

- Extended route, server-unit, UI smoke, and responsive audit coverage for the
  new appearance settings and health payload.

## 1.4.10 - 2026-06-30

Local-only network hardening and a reliable self-update path.

### Security

- Bound the production server to the loopback interface (`127.0.0.1`) and pointed
  the desktop launcher at `127.0.0.1` instead of `localhost`, so the app is no
  longer reachable from other machines on the network and the Windows IPv6
  `localhost` resolution quirk cannot affect startup. This closes the only path
  by which a network peer could reach the local-only lifecycle, update, and
  settings endpoints. The same-origin guard now treats the loopback host
  variants (`localhost`, `127.0.0.1`, `[::1]`) on the same scheme and port as a
  single origin, so requests are accepted whichever loopback name the browser
  uses while external origins and other ports are still rejected.

### Fixed

- Made the in-app self-update reliable. The updater now hard-resets the working
  tree to the fetched `origin/main` instead of `git pull --ff-only`, which would
  abort whenever a local checkout had drifted (line-ending churn or a stray edit)
  and leave the app restarting the old build with the Update button still
  showing. Untracked files (`.env`, `.data`) are preserved.
- Added a `.gitattributes` that normalizes the repository to LF so a machine with
  a different `core.autocrlf` setting cannot commit CRLF and dirty other
  checkouts (the drift that broke fast-forward updates).

## 1.4.9 - 2026-06-30

Security and reliability hardening across the SQL safety, metadata, and result paths.

### Security

- Stopped persisting the database password in the pending-confirmation store on
  disk. The stored connection is never used at execution time (the request
  re-supplies it), so the secret is now stripped before the record is written.
- Made confirmation-token consumption atomic so a double-click or two concurrent
  confirmations can no longer execute the same write or procedure twice.
- Neutralized spreadsheet formula injection in CSV export and copy-as-CSV. Cells
  beginning with `= + - @` (or tab/CR) are escaped, while plain numbers are left
  intact, and the header row is now quoted/escaped per RFC 4180.
- Stopped trusting the client-supplied `X-Forwarded-For`/`X-Real-IP` headers for
  rate limiting unless `TRUST_PROXY_HEADERS=true`, and capped the rate-limit
  bucket map so it can no longer grow without bound.
- Cached and de-duplicated the `/api/version` git and remote checks so rapid
  polling can no longer spawn repeated subprocesses and network calls.
- Writes that embed a high-risk operation behind a benign leading keyword (for
  example `INSERT ... EXEC`) now require the typed acknowledgement instead of a
  plain button confirmation.

### Fixed

- Reworked qualified-object-name parsing so identifiers that legitimately contain
  `.` or `]` (for example `[My.Table]`) are no longer mangled, which previously
  pointed metadata actions at the wrong object.
- Removed an audit-log write race in which a size-triggered rewrite could
  duplicate or drop the newest entries under concurrent activity.
- Preserved `BIGINT` identity seed/increment precision in generated `CREATE`
  scripts instead of corrupting values beyond 2^53.
- Excluded the procedure return-value row from discovered parameters on the
  `sys.parameters` fallback path.
- Added a column-only table-definition fallback when the catalog DMVs are not
  available (for example a Fabric Lakehouse SQL endpoint), instead of surfacing a
  raw "not supported" error.
- Distinguished SQL `NULL` from an empty string in the result grid so the display
  matches copy/CSV output.
- Stopped `Ctrl`+`Enter` from starting a new request while a confirmation dialog
  is open; it now submits the open confirmation when it is ready.
- Cleared the local results filter box when a new result set loads, and escaped
  the query-history item id attribute.

### Verification

- Added regression tests for atomic confirmation-token claiming, bracketed and
  dotted identifier parsing, and typed-acknowledgement escalation for embedded
  high-risk writes (`INSERT ... EXEC`).

## 1.4.8 - 2026-06-30

Connection rail layout hardening.

### Fixed

- Fixed the left connection panel so `Connection` fields and `Saved Profiles`
  stay directly under their headings when the rail is resized wider or the title
  row wraps.
- Hardened the control rail section sizing so saved profiles, connection
  controls, and policy cards remain content-sized instead of stretching empty
  vertical space.
- Updated the advanced `MERGE` helper text to match the current confirmed
  execution behavior.

### Verification

- Extended the responsive audit with direct gap checks for the connection rail
  and a wide resized-rail scenario.

## 1.4.7 - 2026-06-30

Confirmed batch and high-risk SQL execution.

### Changed

- Replaced blanket blocking for `DROP`, `TRUNCATE`, `ALTER`, `CREATE`,
  `MERGE`, `EXEC`, `EXECUTE`, and unrestricted `UPDATE`/`DELETE` with direct
  confirmation and typed acknowledgement through the existing `/api/query`
  confirmation path.
- Added support for semicolon-separated multi-statement SQL batches. Batches are
  classified as `BATCH`, show detected operations in the review modal, and
  require typing `RUN BATCH` before execution.
- `GO` batch separators remain blocked with a clear explanation because they
  are client-side script separators, not SQL Server statements accepted by the
  Node SQL driver.
- Confirmed writes can now return result-set metadata when SQL Server returns
  recordsets from a confirmed batch.

### Verification

- Updated classifier, route contract, smoke, and UI smoke coverage for
  confirmed batches, typed acknowledgement, high-risk SQL review, and
  unsupported `GO` handling.

## 1.4.6 - 2026-06-30

Connection panel resize stability patch.

### Fixed

- Fixed a connection-panel layout edge case where dragging the left rail wider
  could create a large blank gap below the `Connection` heading.
- Locked the connection form rows to content-sized layout inside the resizable
  rail so restored widths, browser zoom, and breakpoint changes do not stretch
  the form vertically.

### Verification

- Added UI smoke coverage for the resized connection rail heading-to-field gap.

## 1.4.5 - 2026-06-30

Procedure script editor visual polish.

### Changed

- Procedure Runner script editor now uses the same highlighted SQL editor
  surface as SQL Studio instead of a plain textarea.
- Procedure script scroll/input behavior now synchronizes with a highlighted
  backdrop for theme-aware SQL keyword, string, number, and function coloring.

### Verification

- Added UI smoke coverage for procedure script syntax highlighting.

## 1.4.4 - 2026-06-30

Procedure script editor usability patch.

### Changed

- Procedure scripts now open in an expanded Procedure Runner editor workspace
  instead of staying trapped in the narrow runner column.
- Added an `Expand editor` / `Collapse editor` control for switching between
  large-script editing and the normal parameter/results layout.
- Increased the procedure script editor working height for long stored
  procedure definitions.

### Verification

- Added UI smoke coverage for automatic procedure script expansion and manual
  collapse/expand behavior.

## 1.4.3 - 2026-06-30

Stored procedure scripting workflow patch.

### Added

- Added an on-page Procedure Runner script editor for CREATE and ALTER/Edit
  procedure scripts.
- Added a `Run script` action for loaded procedure DDL that reuses the existing
  `/api/query` write confirmation path.
- Added classifier support for single `CREATE PROCEDURE`, `ALTER PROCEDURE`,
  and `CREATE OR ALTER PROCEDURE` definitions with internal semicolons.

### Changed

- Procedure script buttons now keep users on the Procedure Runner page instead
  of redirecting to SQL Studio.
- Confirmation review now labels the active procedure as the active target when
  running procedure DDL.
- `GO` batch separators remain blocked with a clear error because they are
  client-side batch separators, not executable T-SQL.

### Verification

- Added classifier and UI smoke coverage for procedure DDL scripts, internal
  semicolons, blocked `GO`, on-page script loading, and `/api/query`
  confirmation from Procedure Runner.

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
