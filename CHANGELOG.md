# Changelog

All notable Data Workbench Console changes are tracked here.

The in-app version is read from `package.json` and exposed through `/api/version`
together with the current git commit and build information.

## 1.5.1 - 2026-09-24

Results you can trust: the grid now says when a result was cut off, and a full result can be
exported from the server instead of only the rows the grid loaded.

### Added

- **Export all as CSV / JSON.** A banner on a cut-off result offers to re-run the same read query
  on the server and stream every row into a file, up to the new `EXPORT_ROW_LIMIT` (default
  100,000). Rows are streamed with back-pressure, so a large export does not build up in memory,
  and the database request is held open only for the download. Only plain reads qualify: writes,
  `SELECT ... INTO` and batches are refused. The editor's `Cancel` stops an export, closing the
  tab stops the query on the server, and the audit log records each export's exact row count as
  a new `query_export` event. `EXPORT_REQUEST_TIMEOUT_MS` (default 10 minutes) bounds the whole
  export, because the normal 2-minute request timeout keeps running while a slow download has the
  query paused.
- **Export JSON** of the loaded rows, next to `Export CSV`.
- **Copy as INSERT and Markdown** from the results context menu: one row or all loaded rows as
  `INSERT ... VALUES` statements (batched at SQL Server's 1000-row limit), or all loaded rows as a
  Markdown table. INSERT targets the table when the result is editable, otherwise a
  `[target_table]` placeholder. It starts from the real cell values, so SQL NULL becomes `NULL`
  while the string `'null'` stays a string, and it leaves out `timestamp`/`rowversion` columns.

### Fixed

- Fixed a result that hit the row limit never saying so. The read was capped in SQL at exactly
  `RESPONSE_ROW_LIMIT` rows, so "exactly 250 rows" and "250 of several million" looked the same and
  the `truncated` flag could never become true; exporting such a result silently wrote only the
  first 250 rows. The read now fetches one extra row to detect more data, the grid shows a banner
  ("showing the first N rows; more rows exist"), and the loaded count is never presented as a
  total. The toolbar's CSV/JSON export says when it wrote only the loaded rows.

### Verification

- `server-unit.test.mjs` covers the export's CSV formula escaping, NULL and binary encoding,
  column de-duplication, multi-recordset output, the server-side row limit cancelling the
  database request, errors before the first row, the browser closing the download, and
  `runHandler` passing a streamed body through with the security headers.
- `route-contract.test.mjs` asserts the export route refuses writes, `SELECT ... INTO` and unknown
  formats before touching a database.
- `ui-smoke.mjs` covers the truncation banner and meta text, Export all posting the query with a
  run id and saving the server's file under its name, Export JSON, and copy as INSERT/Markdown.

## 1.5.0 - 2026-09-24

A faster SQL editor for daily work: run one statement at a time, cancel long queries, get
table and column suggestions, and keep several queries open in tabs.

### Added

- **Run the statement under the cursor.** `Run query` and `Ctrl+Enter` now send the selected
  text, or — when the editor holds several `;`-separated statements — only the statement under
  the cursor, and briefly highlight what ran. Before, the whole editor was always sent, so keeping
  a handful of queries in one buffer turned every run into a confirmed `RUN BATCH`. `Run all`
  (`Ctrl+Shift+Enter`) keeps the old whole-editor behaviour. Statements split only on `;`, never
  on blank lines, so an `UPDATE` is never sent without a `WHERE` that sits in the next paragraph.
  The server still classifies and confirms whatever text arrives.
- **Cancel a running query.** A `Cancel` button and a live elapsed time appear while a query
  runs; results show how long they took. A read or preview stops straight away. While a
  confirmed write runs, the dialog button becomes `Cancel write`: the server rolls the write back
  and says so, and once a write has started committing it refuses to cancel instead of implying a
  rollback that cannot happen. Runs are tracked per browser session through a new
  `/api/query/cancel` route (`lib/server/run-registry.js`), so a session can only cancel its own
  queries. Only one query runs at a time; a second `Ctrl+Enter` while one is running no longer
  races it for the results grid.
- **Autocomplete in the SQL editor** from the loaded catalog: tables and views after
  `FROM`/`JOIN`/`UPDATE`/`INTO`, columns after an alias or table name, and SQL keywords.
  `Ctrl+Space` opens it on demand; `Tab`/`Enter` accept and `Esc` dismisses. It stays quiet inside
  strings and comments, fetches a table's columns once when you type an alias for a table you
  have not opened, and can be turned off with the new `APP_EDITOR_AUTOCOMPLETE_ENABLED` setting.
- **Editor tabs.** Keep up to eight SQL buffers, each with its own text, cursor and scroll
  position, restored with the rest of the workspace. Double-click a tab to rename it;
  `Ctrl+Alt+N`/`W` open and close tabs and `Ctrl+Alt+PageDown`/`PageUp` switch between them.
- **Keyboard shortcut overlay.** Press `?` (outside a text field) or `Ctrl+/` to see every
  shortcut; `/` jumps to the explorer search.

### Changed

- `previewWrite`/`executeWrite` moved from `db-interface.js` to `lib/server/write-execution.js`
  so their transaction handling is unit-testable with fake pools. Behaviour is unchanged apart
  from cancellation.

### Verification

- `server-unit.test.mjs` covers run-registry session isolation, a cancel that lands before the
  statement starts (mssql would otherwise drop it), refusal once a write is committing, and that
  a cancelled write rolls back and never commits.
- `route-contract.test.mjs` covers the cancel route's 400/404 answers, invalid run ids on
  `/api/query`, and that a run id is released again after a request.
- `ui-smoke.mjs` covers running one statement of several, running a selection, `Ctrl+Enter`,
  `Run all` as a batch, cancelling a read and a confirmed write, autocomplete for objects and
  alias columns (and not inside strings), editor tabs with persistence, and the shortcut overlay.
- `responsive-audit.mjs` passes with the new tab strip; each tab control carries its own border
  and 30px height to meet the audit's affordance rule.

## 1.4.29 - 2026-09-23

Closes three ways SQL could reach the database with less confirmation than it needed, and shows
which data source you are working against at all times.

### Security

- Fixed the SQL classifier missing statements hidden behind `"double-quoted"` identifiers, `]]`
  escapes inside `[brackets]`, and nested `/* /* */ */` comments. Each of the four scanners
  (`tokenizeSql`, `stripCommentsAndTrim`, `splitStatements`, `topLevelSqlWords`) was a separate
  hand-rolled loop that handled only `'strings'`, plain `[brackets]` and flat comments, so a stray
  `'` inside one of those constructs opened a fake string literal that hid every keyword after it.
  For example, `UPDATE dbo.T SET /* /* */ ' */ a = 1 WHERE b = 'z'; EXEC dbo.p` was classified as
  a single previewed UPDATE: the `EXEC` ran inside the preview and again on a one-click confirm.
  All four now share one region scanner that understands every T-SQL quoting and comment form,
  and SQL whose string, quoted identifier or comment never closes now fails closed to a typed
  `EXECUTE QUERY` confirmation instead of being guessed at.
- Fixed `SELECT ... INTO` being classified as a read. It creates a table, and for ordered or
  CTE-led queries the row-capped read path runs the statement as written, so the table was
  created with no confirmation at all. It is now a high-risk write that needs `EXECUTE SELECT
  INTO`, and the read path re-checks the classification before running anything as a second
  guard. `Estimated plan` and `Result shape` now refuse `SELECT ... INTO` like other writes.
- Fixed the Safety panel's "Typed ack above N row(s)" promise not being enforced.
  `HEIGHTENED_CONFIRM_LIMIT` only changed the review wording, so a previewed `UPDATE` or `DELETE`
  with a `WHERE` clause went through on a single click however many rows it touched. The phrase
  is now resolved from the preview's row count *before* the confirmation record is created (the
  confirm step only enforces what the record stores), so a write above the limit needs
  `EXECUTE <ACTION>`. Live results editor saves of a single row are unaffected unless the data
  changed underneath and the row now matches more rows than the limit.
- Updated `next` 15.5.20 → 15.5.26 and raised the `postcss` override 8.5.10 → 8.5.28, and added a
  `sharp` 0.35.4 override. Advisories published since 1.4.28 made `npm audit --omit=dev` fail the
  release gate, including a critical Next.js "unauthenticated remote code execution on
  Windows-hosted servers" (GHSA-p293-qw3h-jr36), which applies directly to this app. All are
  patch-level updates within the existing ranges; no new runtime dependency was added.
- Fixed `package-lock.json` still reporting version 1.4.27 after the 1.4.28 release.

### Fixed

- Fixed saving a connection profile adding a duplicate every time. The client never sent the
  profile's id, so the server always created a new row. The client now sends the id of the
  matching profile, and the server also matches an id-less save against existing profiles by
  connection details.
- Fixed the saved-connections file being written in place. A crash mid-write left torn JSON,
  which reads back as an empty list and silently lost every profile. It now uses the same
  write-to-temp-then-rename (with the Windows lock retry) as the confirmation store, shared
  through a new `lib/server/atomic-file.js`.

The workspace header now always shows which data source you are working against.

### Added

- Added an active-source line to the top workspace header, directly above the selected object or
  procedure name. When the connection fields match a saved profile it shows that profile's name
  (with source, server and database on hover); otherwise it shows the source type, server and
  database (for example `Fabric SQL endpoint • myserver • mydb`). Before this, the only place to
  see the current connection was the connection panel, so hiding that panel for more space left
  no way to tell which server or database a query would run against. The profile is recognised by
  matching the connection fields, not by remembering the last click, so it survives a reload and
  switches back to raw details as soon as a field is edited away from the saved values. The line
  shows `No data source configured` until both server and database are set.

### Fixed

- Fixed a large empty space opening under the `Connection` heading when the connection panel was
  dragged wider than about 370px. The rail is always under the 760px container query that stacks
  section title rows as columns, and the generic `flex: 1 1 260px` title basis then becomes a
  260px *height*; a narrower 340px query reset it, which is why the gap only appeared past that
  width. The Saved Profiles and Safety Policy title rows were already switched to a grid for this
  reason; the Connection title row now is too.

### Verification

- `sql-classifier.test.mjs` gains 33 cases: each lexer bypass, unterminated input of every kind,
  `SELECT ... INTO` in every shape (ORDER BY, TOP, DISTINCT, `#tmp`, bracketed target, UNION,
  CTE-led, and behind each bypass), and the look-alikes that must stay reads (`'INTO'`, `[INTO]`,
  `"INTO"`, a commented INTO, `FOR XML PATH('into')`). 25 of them fail against 1.4.28.
- `server-unit.test.mjs` covers the typed-phrase threshold, saved-profile dedupe, and that parallel
  profile saves leave no temp files behind. `route-contract.test.mjs` asserts `SELECT ... INTO`
  comes back as a typed-confirmation review. `ui-smoke.mjs` asserts a write above the row limit
  keeps Continue disabled until the phrase is typed.
- `ui-smoke.mjs` asserts the header source line follows the server and database fields, shows the
  saved profile name once the connection is saved, and falls back to raw details when a field is
  edited.
- `responsive-audit.mjs` now drags the real connection-rail handle to its maximum on both routes
  (setting `--control-rail-width` directly is reset by the layout engine, so the existing 420px
  case never actually widened the rail) and flags an over-tall Connection title row, since the
  old gap check measured from the title's bottom edge and could not see space inside it. Confirmed
  the new case fails without the fix (`titleHeight: 260`) and passes with it.

## 1.4.28 - 2026-09-15

Self-update reliability and a friendlier first-run experience for machines without Node.js.

### Fixed

- Fixed the `Update` button silently doing nothing when the updater itself failed partway
  through (a `git fetch`/network problem, or an `npm install`/`npm run build` error).
  `scripts/apply-update.ps1`'s outer `try/catch` always restarts *a* server on its way out so
  the app is never left down — on success that's the freshly built update, but on a caught
  failure it's a fallback restart of whatever code is currently on disk. Both looked identical
  to the client: the server goes down, comes back up, and the page reloads, so a real failure
  was indistinguishable from a real success and the user was left thinking `Update` just did
  nothing (still on the old version, no error, `Update available` still showing on reload).
  The updater now writes its outcome to `.data/update-status.json`
  (`{ outcome, error, commitBefore, commitAfter, finishedAt }`) right before that restart,
  reset to `pending` by `POST /api/update` before the updater is even launched. A new
  local-only `GET /api/update-status` exposes it, and `waitForUpdateRestart()` in
  `public/console-core.js` reads it once the server answers again: `outcome: 'failed'` now
  shows a clear `Update failed` message with the captured error instead of reloading, so a
  broken update surfaces instead of hiding.

### Added

- `Start Data Workbench.ps1` now checks for Node.js before doing any install/build/start work.
  If Node.js is missing, it shows a clear explanation that Node.js is required and offers to
  open the Node.js download page. Applies to first-time installs and any launch that can't
  reuse an already-running server. `Run Data Workbench.bat` (the visible-console fallback
  launcher) got the same check and prompt.

### Verification

- New `scripts/server-unit.test.mjs` coverage for `lib/server/update-status-store.js`
  (pending/failed round-trip through a temp project directory).
- New `scripts/route-contract.test.mjs` coverage asserting `GET /api/update-status` is
  local-only and returns `status: null` before any update has run.

## 1.4.27 - 2026-09-02

A live editor for query results: modify, delete, and insert rows directly in the results
grid, then save through the normal write-confirmation pipeline.

### Added

- `Edit results` button above a result set, shown only when it can actually be saved: a
  plain single-table `SELECT` (no `JOIN`, `UNION`, `GROUP BY`, subquery source, or aggregate)
  against an object with a discoverable primary or unique key. New server-side detection in
  `lib/server/sql-classifier.js` (`analyzeSingleTableSelect`) and `lib/server/sql-metadata.js`
  (`loadObjectKeyColumns`, `loadObjectKind`, `isInlineEditableColumnType`), exposed through a
  new `editability` action on `POST /api/object-insights`.
- Full row CRUD in edit mode: edit any supported-type cell in place, including key columns
  (a "key" badge marks them as a hint, not a lock — see Fixed below); mark rows for deletion
  with a red per-row `Delete`/`Restore` button; add new rows with `+ New row` (leave a field
  blank to use the column's default or identity value). A pending-changes bar shows a live
  modified/deleted/new breakdown and gates `Save changes` / `Discard edits`.
- `Save changes` builds one `DELETE`/`UPDATE`/`INSERT` per changed row and runs it through the
  exact same classify → preview → confirm → execute pipeline as every other write — no new
  execution path, no change to the confirmation or typed-acknowledgement rules. On success the
  grid re-runs the original query and reloads in place, still in edit mode, instead of
  replacing the grid with a generic write-result view.
- A small, self-dismissing toast notification (`showToast`, top-level `#appToastContainer`)
  confirms a successful save with the row count, then fades out after five seconds. Falls back
  to the persistent status bar if the container is somehow missing.
- Fabric Lakehouse is deliberately excluded: its SQL analytics endpoint is read-only per
  Microsoft's documentation, so the button never appears for that source.
- Fallback row matching for tables with no declared primary key or unique constraint — common
  on Fabric Warehouse, which doesn't enforce them. Instead of hiding the button outright, the
  app matches a row by every visible, comparable column's original value; every column
  (including the ones used for matching) stays editable, since matching always uses the
  pre-edit value. A note above the grid explains when this fallback is in effect. Because two
  distinct rows could in principle hold identical values in every comparable column, each
  changed row is re-checked — one batched `SELECT COUNT(*)` per save, not one round trip per
  row — right before writing anything, to confirm it still matches exactly one row in the
  table; the whole save is refused, with the staged edits kept, if any row now matches zero
  (changed elsewhere since the grid loaded) or more than one (indistinguishable duplicate
  content). `POST /api/object-insights` (`editability` action) now returns `matchColumns` and
  `keyType` alongside the existing `keyColumns`.

### Fixed

- The generated `UPDATE`/`DELETE` `WHERE` clause encoded a `NULL` key value as `col = NULL`,
  which never matches in SQL (`IS NULL` is required). Unreachable for a real primary key
  (never `NULL` by definition) but live for a `NULL`-able unique-constraint column, and now
  also for the all-columns fallback above. Fixed with a shared `buildMatchClause()` helper
  used everywhere a row is matched: the real statements and the new uniqueness check alike.

- Key columns rendered read-only with no way to change their value. That was unnecessarily
  strict: the generated `UPDATE` always matches a row by its key's *original* value in the
  `WHERE` clause and writes the new value in the `SET` clause — the two are independent, so
  renaming a key column can never lose the row. Key columns are now editable like any other
  supported-type column, keeping only the "key" badge as a hint about what identifies the row.
  `editableColumns` from `POST /api/object-insights` (`editability` action) now includes key
  columns instead of excluding them.
- The per-row `Delete` button used the same neutral styling as every other button, making a
  destructive, if easily-undoable, action easy to miss. It's now styled red (a new
  `.row-delete-btn` class); the `Restore` button a deleted row switches to stays neutral.

- The unsaved-edits confirmation guard (before running a new query, switching, or closing a
  result tab) counted only staged cell edits, so a pending row deletion or a pending new row
  with no accompanying cell edit could be silently discarded without asking. It now uses the
  same modified/deleted/new total the Save button and pending-edits bar already agree on.

### Verification

- 15 new tests in `scripts/sql-classifier.test.mjs` for `analyzeSingleTableSelect` (bracketed
  and aliased identifiers, `TOP`/`DISTINCT`/aggregates, CTEs, derived tables, table-valued
  functions, joins/unions/group-by, write statements, query hints).
- New tests in `scripts/sql-metadata.test.mjs` for key-column and object-kind discovery.
- New `scripts/ui-smoke.mjs` coverage in an isolated window: the JOIN-rejection guard, a
  single-cell edit through the single-click confirm path, and a combined delete+modify+insert
  save through the typed `RUN BATCH` path, including the discard button clearing all three
  kinds of pending change and the post-save toast and in-place grid refresh.
- `npm run responsive:audit` stays green with the new row-actions column, new-row form, and
  toast container in place.
- New `scripts/ui-smoke.mjs` coverage in a second isolated window for a keyless table: every
  column renders editable with no read-only key marker, the fallback note is shown, a
  uniquely-identifiable row saves normally, and an edit to a row with duplicate content across
  every column is refused before the confirmation modal ever opens, with the staged edit kept.
- The `editable: true` success path in `postObjectInsight`'s `editability` action (both the
  real-key and the new all-columns-fallback branch) is exercised only through the client-facing
  contract asserted by the `ui-smoke.mjs` mocks above, not against a live database — this repo's
  automated suites have no real SQL Server/Fabric connection to test against
  (`scripts/route-contract.test.mjs` only reaches the validation paths that return before
  `withConnection()`). Worth a manual check with `npm run verify:live` or by hand against a real
  keyless table before relying on this in production.

## 1.4.26 - 2026-09-02

The layout engine is now the single authority for the two-column studio.

### Fixed

- Fixed the two-column Query Builder / SQL Editor layout being unreachable while the
  themes/history panel was visible. A `@media (max-width: 2200px)` rule applied
  `grid-template-columns: 1fr !important`, overriding the `data-studio-mode` decision the
  layout engine had already made. The two disagreed in a narrow band just under 2200px with
  the connection rail collapsed — for example a 2180px window, where `getLayoutMode()`
  computed `wide` but the breakpoint still forced a single column.

### Changed

- `.studio-grid` and `.editor-controls-grid` are now single-column by default and opt into the
  wide template through `.app-shell[data-studio-mode="wide"]`. `data-studio-mode` is written
  client-side after the shell paints, so a wide default would flash two columns and then
  collapse; narrow-by-default keeps the first paint and the engine's `stacked` state in
  agreement.
- Removed the unreachable `@media (min-width: 1180px)` studio rule and the whole
  `@media (max-width: 2200px)` block. Every rule in that block is already covered by the base
  rules and the existing `[data-studio-mode="stacked"]` rules.

### Verification

- The responsive audit now asserts `.studio-grid`'s computed column count agrees with
  `data-studio-mode` at every audited viewport, so a viewport breakpoint can no longer
  silently override the layout engine. jsdom cannot catch this class of bug because it does
  not evaluate media or container queries.
- Added audit scenarios that collapse only the connection rail: 2400px pins that wide mode
  renders two columns, and 2180/2100px sweep the band under the old breakpoint.
- Narrowed the audit's `own-overflow` heuristic so a single-line input holding a value longer
  than its box is no longer reported — that is native field scrolling, consistent with the
  existing `#queryEditor` exemption. An input that overflows while empty is still reported.

## 1.4.25 - 2026-09-02

Correctness fixes found by an audit of the read row-cap, identifier handling, result export,
audit filtering and rate limiting.

### Fixed

- Fixed CTE reads containing a top-level `UNION ALL` producing invalid T-SQL. The row cap
  inserted `TOP (n)` after the `ALL` of the `UNION ALL` — emitting
  `... UNION ALL TOP (250) SELECT ...` — because the `SELECT DISTINCT`/`ALL` modifier lookup
  was not bounded to the select list. Any `WITH ... SELECT ... UNION ALL SELECT ...` query
  failed with a syntax error.
- Fixed CTE reads containing a top-level `UNION`, `EXCEPT` or `INTERSECT` applying the row cap
  to the first branch only, so the combined result was not capped. A CTE cannot be wrapped in
  a derived table, so these statements are now left unmodified and the response cap in
  `mapRecordset` bounds the result instead.
- Fixed the left-panel `Safety Policy` section always showing its fallback text.
  `/api/health` reports the policy as `safety`, but the browser read the non-existent
  `safetyPolicy`/`policy`, so the real values were never displayed. The panel now shows the
  active policy plus the response row cap, write preview limit, typed-acknowledgement
  threshold and confirmation lifetime.
- Fixed object names containing a `.` being corrupted after the first request. Parsing
  `[My.Table]` was correct, but the composed `fullName` (`dbo.My.Table`) re-parsed as schema
  `My`, object `Table`, so every follow-up request — column load, profile, row count,
  scripting, schema compare — targeted the wrong object. `fullName` is now bracket-quoted when
  a part contains a delimiter, and the object and procedure catalogs compose names the same
  way so the client and server agree.
- Fixed an unrecognised `Source type` audit filter returning Fabric SQL rows instead of no
  rows, because the filter value was normalized with the same fallback used for connections.
- Fixed `POST_RATE_LIMIT_WINDOW_MS` values above 60 seconds being silently ignored. Bucket
  pruning used the separate `RATE_LIMIT_WINDOW_MS` default, capping the effective window at
  60 seconds however the setting was configured.
- Fixed `AUDIT_LOG_MAX_BYTES` having no effect. It is now enforced when the audit file is
  written, dropping the oldest entries to stay within the limit while never emptying the file.

### Changed

- `Copy rows` and `Export CSV` now render SQL `NULL` as `NULL` instead of an empty field, so
  missing data is distinguishable from blank data and all three copy/export surfaces agree
  with the result grid. Spreadsheet formula escaping and RFC 4180 quoting are unchanged.

### Removed

- Removed the unreachable `SNIPPETS` / `[data-snippet]` client code path. No markup emitted
  `data-snippet`, and the `|| DEFAULT_QUERY` fallback made it look functional.

### Verification

- Added SQL classifier coverage for CTE reads with `UNION ALL`, `UNION`, `EXCEPT`,
  `INTERSECT`, a set operator combined with `ORDER BY`, a set operator inside a subquery, and
  `SELECT DISTINCT`.
- Added `parseQualifiedObjectName` round-trip coverage for dotted and bracketed identifiers.
- Added server-unit coverage for the audit byte cap, unknown source-type filters and
  rate-limit pruning across a window wider than the module default.
- Added UI smoke coverage for the Safety Policy payload and for `NULL` versus empty-string
  fidelity in `Copy rows`.

## 1.4.24 - 2026-07-08

Self-update launcher reliability fix.

### Fixed

- Fixed the Update button showing `Could not launch updater: Updater exited
  before it could start work (exit 0)` even when the Windows process launch
  succeeded.
- Changed the update endpoint to start a detached Windows `cmd /c start`
  launcher that opens the PowerShell updater hidden, then returns success once
  the launcher process has actually spawned.
- Moved updater launch command construction and launch probing into
  `lib/server/update-launcher.js` so it can be tested outside the Next route.

### Verification

- Added server-unit coverage for fast-exiting updater launchers and for the
  generated hidden PowerShell launch command.

## 1.4.23 - 2026-07-02

Living ambient color wave with a live color picker and intensity control.

### Added

- Users can customize the ambient background color from Settings with a live RGB
  color picker (`APP_AMBIENT_COLOR`). The moving background updates immediately as
  the color is picked. Leave it on "Follow theme color" to track the theme accent,
  or choose any custom color.
- Added an ambient intensity control (`APP_AMBIENT_INTENSITY`, 0-100) for exactly
  how strongly the ambient color shows — 0 hides it, 55 is the visible default,
  100 is boldest. It previews live alongside the color picker.

### Changed

- Replaced the barely-visible ambient backdrop with a clearly visible colour wave:
  two large, soft colour fields now travel across the whole app in opposite
  diagonals (a second hue is derived from the chosen colour), giving a living,
  breathing feel. Motion is still gated by `APP_AMBIENT_MOTION_ENABLED` and
  disabled under `prefers-reduced-motion`, and the whole layer is scaled by the
  new intensity setting.

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
