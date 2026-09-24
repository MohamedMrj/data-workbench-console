# Data Workbench Console — Technical Documentation

Code-level reference for the Data Workbench Console. [README.md](README.md) documents *what
the app does* for users and operators; this document explains *how it is built*.

- **Version:** tracked in [package.json](package.json) (`1.4.24` at time of writing)
- **Runtime:** Node `>=20`, Next.js 15 (App Router), React 19
- **Language:** JavaScript only — ESM everywhere, no TypeScript, no build step beyond Next
- **Data access:** [`mssql`](https://www.npmjs.com/package/mssql) (Tedious) — no ORM
- **Persistence:** flat files on local disk (JSON + NDJSON). The app has no database of its own.
- **Deployment target:** a hidden local server bound to `127.0.0.1`, launched from a Windows
  Desktop shortcut, updated in place over Git.

---

## 1. Table of contents

1. [Design intent](#2-design-intent)
2. [Repository layout](#3-repository-layout)
3. [The client architecture (read this first)](#4-the-client-architecture-read-this-first)
4. [Request lifecycle](#5-request-lifecycle)
5. [`lib/server` module reference](#6-libserver-module-reference)
6. [SQL safety and classification](#7-sql-safety-and-classification)
7. [Confirmation token protocol](#8-confirmation-token-protocol)
8. [Connections, auth and pooling](#9-connections-auth-and-pooling)
9. [Metadata subsystem](#10-metadata-subsystem)
10. [Audit subsystem](#11-audit-subsystem)
11. [Settings subsystem (`.env`)](#12-settings-subsystem-env)
12. [Client state model](#13-client-state-model)
13. [Layout engine](#14-layout-engine)
14. [Theming and appearance](#15-theming-and-appearance)
15. [Desktop lifecycle](#16-desktop-lifecycle)
16. [Self-update](#17-self-update)
17. [Security model](#18-security-model)
18. [Testing and verification](#19-testing-and-verification)
19. [Extension recipes](#20-extension-recipes)
20. [Known issues and intentional oddities](#21-known-issues-and-intentional-oddities)

---

## 2. Design intent

Three constraints shaped nearly every decision in this codebase:

1. **Execution control beats convenience.** The app is a deliberately stricter SQL editor.
   Reads run directly; every write is classified, previewed inside a rolled-back transaction,
   and released only against a single-use confirmation token. High-impact statements demand a
   typed acknowledgement phrase. See [§7](#7-sql-safety-and-classification).

2. **It runs on one person's machine, not a server.** There is no user table, no login, no
   multi-tenancy. Authorization is *the database's* job — the app connects with whatever
   credentials the operator supplies. Local-only endpoints (settings, lifecycle, update) are
   gated on the request reaching a loopback host, and the production server binds
   `127.0.0.1` so nothing on the network can reach them at all.

3. **Non-technical users install and update it themselves.** Hence the WinForms launcher, the
   browser progress page, the guided `.env` editor, and Git-based self-update — all of which
   exist so a colleague never has to open a terminal after the first `npm install`.

---

## 3. Repository layout

```
app/                          Next.js App Router
  api/*/route.js              17 route handlers — thin adapters over lib/server
  components/
    workbench-shell.js        The entire DOM skeleton as static JSX (no state)
    console-app-boot.js       The only client component; boots the imperative app
  docs/                       Built-in user guides (/docs/sql-studio, /docs/procedure-runner)
    doc-shell.js              Presentational components for the guides
    docs-theme-boot.js        Applies the saved theme to docs pages
    docs.css
  procedures/page.js          Renders <WorkbenchShell pageMode="procedures" />
  page.js                     Renders <WorkbenchShell pageMode="sql" />
  layout.js                   Root layout, metadata, favicon, Google Fonts
  globals.css                 @imports theme.css + workbench.css
  theme.css                   Design tokens, 6 themes, shared control primitives
  workbench.css               Layout engine, all component styling (~4.2k lines)

lib/server/                   The real backend — all logic lives here
  db-interface.js             Route handler implementations
  sql-classifier.js           Safety-critical, pure, no I/O
  sql-metadata.js             Catalog reads, DDL generation, procedure binding
  source-config.js            Source/auth definitions, normalization, pool cache
  next-handler.js             Shared request middleware
  confirmation-store.js       Single-use write/procedure tokens
  audit-store.js              Append-oriented NDJSON audit log
  saved-connections-store.js  Connection profiles (never passwords)
  env-settings-store.js       Typed .env schema + safe read/write/sync
  lifecycle-store.js          Heartbeat sessions and shutdown watchdog
  rate-limit.js               Sliding-window limiter
  update-launcher.js          Updater command construction + spawn probe
  update-status-store.js      Read/write apply-update.ps1's success/failed outcome

public/
  console-core.js             The application (7060 lines, one closure)
  console-app.js              Bootstraps console-core
  launcher-ready.svg          Readiness probe target for the launcher page
  favicon.ico, *.png          Assets

scripts/
  sql-classifier.test.mjs     Pure unit tests (no server)
  sql-metadata.test.mjs       Pure unit tests (no server)
  server-unit.test.mjs        Store/middleware units against temp dirs
  route-contract.test.mjs     Boots `next start`, asserts HTTP contracts (no DB)
  smoke-test.mjs              Production-start smoke test
  ui-smoke.mjs                jsdom test of the real client against built HTML
  responsive-audit.mjs        Playwright layout audit + screenshots
  release-diagnostics.mjs     Release gate (file presence, lockfile, env drift)
  demo-tables.mjs             Dev-only: browser with mocked catalog
  apply-update.ps1            The self-updater
  live-smoke.mjs              Opt-in live test against a non-production source

launcher-loading.html         Browser startup screen with progress + auto-redirect
Start Data Workbench.ps1      WinForms launcher: build check, start, wait, open browser
Start Data Workbench.vbs      Hidden wrapper for the .ps1 (what the shortcut targets)
Create Desktop Shortcut.*     One-time shortcut installer
Run Data Workbench.bat        Visible-console fallback launcher
run-production.bat            Developer-facing production start
```

**Untracked at runtime** (see [.gitignore](.gitignore)): `.env`, `.data/` (logs, backups,
pending confirmations), `data/` (saved profiles), `audit-log*.ndjson`, `responsive-audit/`.
[release-diagnostics.mjs](scripts/release-diagnostics.mjs) fails the release gate if any of
these become tracked.

---

## 4. The client architecture (read this first)

**The UI is not a React application.** Understanding this is a prerequisite for changing
anything user-facing.

React's only job is to emit a static DOM skeleton exactly once:

- [app/components/workbench-shell.js](app/components/workbench-shell.js) — 873 lines of JSX
  containing every panel, dialog, button and input in the app, each with a stable `id`
  attribute. It holds **no state**, no handlers and no effects. `pageMode` (`'sql'` or
  `'procedures'`) only decides which sections start with the `hidden` class and which
  workspace/results arrangement is emitted.
- [app/components/console-app-boot.js](app/components/console-app-boot.js) — the only
  `'use client'` component. It polls for `window.initConsoleApp` and calls it with the current
  `pathname`, re-running on navigation.
- [public/console-app.js](public/console-app.js) — waits for `window.createConsoleApp` to
  exist (10s budget), then calls `app.init()` once per page key, memoized on
  `window.consoleAppReady`.
- [public/console-core.js](public/console-core.js) — **the application.** One closure
  (`window.createConsoleApp`) containing a single mutable `state` object and roughly 200
  functions that work through `document.getElementById`, `innerHTML` assignment and `onclick`
  properties.

Both scripts are loaded with `<Script strategy="afterInteractive">` at the end of the shell.

### Consequences you must design around

| Consequence | Detail |
| --- | --- |
| **`id` attributes are a public contract** | `console-core.js` and [ui-smoke.mjs](scripts/ui-smoke.mjs) both address the DOM by id. Renaming an id in the shell silently disables a feature. |
| **Handlers are assigned, not added** | `element.onclick = fn` is used almost everywhere, so re-running `bind()` replaces rather than duplicates handlers. Genuine `addEventListener` use is guarded by `window.__dataWorkbench*` flags to stay idempotent across route changes. |
| **Route changes rebuild in place** | Next swaps the shell markup; `ConsoleAppBoot` re-invokes `initConsoleApp(pathname)`, which re-runs `init()` against the new DOM. Cross-page continuity comes from sessionStorage snapshots, not React state. |
| **Everything is escaped by hand** | `esc()` at [console-core.js:422](public/console-core.js#L422) is applied to every interpolated value. There is no framework escaping. |
| **No client bundler for app logic** | `public/*.js` is served verbatim. No imports, no JSX, no transpilation — plain browser JS. |

### The SQL editor

A `<textarea>` layered over a `<div class="editor-backdrop">`. `highlightSql()` produces
tokenized HTML into the backdrop; the textarea renders transparent text with a visible caret,
and `syncEditorBackdrop()` mirrors scroll position on every `input`/`scroll`. An
`editorAdapter()` indirection exists so a Monaco instance can be adopted when
`window.monaco` is present — **the app never loads Monaco**; the adapter is forward-looking
only. The Procedure Runner has an independent copy of the same textarea+backdrop pair.

What **Run query / Ctrl+Enter** sends is decided by `queryRunTarget(scope)`: the selection if
there is one, otherwise the statement under the cursor when `sqlStatementRanges()` finds more
than one, otherwise the whole editor (`scope: 'all'` — **Run all**, Ctrl+Shift+Enter, and
`runProcedureScript` — always sends everything). `sqlRegions()` is a client copy of the
server's `scanSqlRegions` because `public/` cannot import `lib/`; it only chooses which text is
sent, and the server re-classifies whatever arrives, so a disagreement can pick the wrong
statement but never skip a confirmation. Statements split on top-level `;` only — **not blank
lines**, which could cut a `WHERE` off an `UPDATE`. `state.runHighlight` wraps the executed range
in a `.sql-run-range` span in the backdrop for 1.6 s; it has no padding or border so the
backdrop glyphs stay aligned with the transparent textarea on top.

**Autocomplete** (`updateSuggestions` / `buildSuggestions` / `acceptSuggestion`) uses only loaded
metadata: `state.objects` for tables/views, `state.objectColumnIndex` for columns, fetching a
missing object's columns once through `/api/columns`. Alias resolution scans the current
statement's `FROM/JOIN/UPDATE/INTO/APPLY` list; an unqualified name resolves only when exactly
one schema has it. The `#editorSuggest` listbox is positioned with a mirror-div caret
measurement and flips above the line near the bottom, because `.editor-container` clips
overflow. Items use `mousedown` (not `click`) so accepting does not blur the textarea first. It
is textarea-only and switched off by `APP_EDITOR_AUTOCOMPLETE_ENABLED=false`.

**Editor tabs** (`state.editorTabs`, up to 8) share the one textarea. The active tab's text is
copied back into its tab by `syncActiveEditorTab()` inside `currentBuilderSnapshot()`, which
runs on every persist, so tabs never fall behind the editor. `closeEditorTab` does not reuse
`activateEditorTab`, which would first copy the closed tab's text into the neighbour.

---

## 5. Request lifecycle

```
browser
  └─ api(url, {method, data})              console-core.js:1398 — fetch, same-origin,
                                            throws on !ok || payload.success === false
       └─ app/api/<name>/route.js          7–20 lines: ensureInitialized() then runHandler()
            └─ runHandler()                lib/server/next-handler.js
                 ├─ buildRequestContext    parse URL/query/headers/cookies, derive sessionId
                 ├─ same-origin check      non-GET only; 403 on mismatch
                 ├─ rate limit             non-GET only; key = clientIp:METHOD:pathname
                 ├─ handler(req, res)      lib/server/db-interface.js — Express-style shim
                 └─ finalizeResponse       no-store, nosniff, Set-Cookie on first request
```

`ensureInitialized()` awaits a module-level promise that loads the audit log, the confirmation
store and the saved-connections store from disk exactly once per process.

The `res` object is a four-method shim (`status`, `setHeader`, `json`, chainable) so handlers
read like Express handlers while actually producing a `NextResponse`. Handler exceptions are
caught centrally and mapped through `error.httpStatus` (default 500).

### Routes

| Route | Methods | Handler | Notes |
| --- | --- | --- | --- |
| `/api/health` | GET | `getHealth` | Limits, side-panel/appearance settings, source & auth catalogs, SP env validity |
| `/api/audit` | GET | `getAudit` | Gated by `AUDIT_ACCESS_MODE` (`loopback` \| `same-origin`) |
| `/api/test-connection` | POST | `postTestConnection` | `DB_NAME()`, `@@SERVERNAME`, `@@VERSION` |
| `/api/tables` | GET POST | `getTables` | Tables + views from `INFORMATION_SCHEMA.TABLES` |
| `/api/columns` | GET POST | `getColumns` | Columns for one object |
| `/api/procedures` | GET POST | `getProcedures` / `postProcedures` | POST dispatches on presence of `procedure` or `confirmToken` |
| `/api/procedure-parameters` | GET POST | `getProcedureParameters` | |
| `/api/object-insights` | POST | `postObjectInsight` | `profile` \| `dependencies` \| `rowcount` \| `topvalues` \| `resultshape` |
| `/api/object-definition` | POST | `postObjectDefinition` | CREATE/ALTER scripting |
| `/api/schema-compare` | POST | `postSchemaCompare` | Takes two full connection payloads; the client sends a saved profile as the right side; optional `includeRowCounts` |
| `/api/query-plan` | POST | `postQueryPlan` | Read queries only; blocked for Lakehouse |
| `/api/query` | POST | `postQuery` | The main execution path; optional `runId` makes the run cancellable |
| `/api/query/cancel` | POST | `postQueryCancel` | `{ runId }` → 202 cancelled, 404 unknown/other session, 409 committing |
| `/api/query/export` | POST | `postQueryExport` | Reads only; streams the full result as CSV/JSON up to `EXPORT_ROW_LIMIT` |
| `/api/saved-connections` | GET POST DELETE | `*SavedConnections` | |
| `/api/saved-queries` | GET POST DELETE | `*SavedQueries` | Query library in `data/saved-queries.json`; audit names queries, never their SQL |
| `/api/version` | GET | inline | Cached + de-duplicated git/remote check |
| `/api/env-settings` | GET POST | inline | Local-only; POST requires Origin/Referer |
| `/api/update` | POST | inline | Local-only; requires a Git checkout |
| `/api/update-status` | GET | inline | Local-only; reads `.data/update-status.json` |
| `/api/lifecycle/{heartbeat,status,exit}` | POST/GET/POST | inline | Local-only |

The last five groups **bypass `runHandler`** and implement their own `isLocalLifecycleRequest`
guard, because they control the host machine rather than a database.

---

## 6. `lib/server` module reference

### `db-interface.js` (1314 lines)

Every handler body. Responsibilities per handler: pull and normalize the connection from
body-or-query, `validateConnection()`, run work inside `withConnection()`, emit an audit
entry on both success and failure, and map errors to `error.httpStatus`. Also owns the
confirmation-record builders and the write preview/execute transaction helpers.

Notable internals:

- `previewWrite(pool, query)` — `begin()`, run, sum `rowsAffected`, **always `rollback()`**.
- `executeWrite(pool, query)` — `begin()`, run, `commit()`, and return any recordsets the
  batch produced alongside `rowsAffected`.
- `sanitizeConnectionForPersistence()` — strips `password` before a confirmation record is
  written to disk. The stored connection is never used at execute time; the request re-supplies
  it. See [§18](#18-security-model).
- `resolveWriteAcknowledgement()` (in `write-acknowledgement.js`) — derives the typed phrase
  (`RUN BATCH` for batches, `EXECUTE <ACTION>` otherwise, plus the row-count escalation). A
  previewed write's phrase is resolved **before** its confirmation record is created, because
  the confirm step only enforces what the record stores.
- `limitReadQuery()` re-classifies and refuses anything that is not a read, as a second guard
  behind routing.
- `canReadAudit(req)` — `same-origin` mode allows everything that passed the middleware;
  `loopback` mode additionally requires the request URL host to be a loopback name.

### `sql-classifier.js` (738 lines) — safety-critical

Pure functions, zero I/O, zero side effects, extracted specifically to be unit-testable.
Detailed in [§7](#7-sql-safety-and-classification).

### `sql-metadata.js` (1500 lines)

All catalog interaction and DDL synthesis. Detailed in [§10](#10-metadata-subsystem).

### `source-config.js` (333 lines)

- `SOURCE_DEFINITIONS`, `SOURCE_TYPE_ALIASES`, `AUTH_MODE_DEFINITIONS` — the source/auth matrix.
- `normalizeConnectionInput()` — coerces every field, applies aliases, splits `host,port` /
  `host:port`, forces `trustServerCertificate: false` for non-SQL-Server sources.
- `buildConnectionFingerprint()` — `sourceType|authMode|server|port|database|domain|username|trust`.
  Used as the pool cache key, the confirmation hash input, and (client-side, mirrored) the
  scope key for pins/recents and session snapshots. **Excludes the password by design.**
- `buildConfig()` — produces the `mssql` config, including the three authentication shapes.
- `withConnection(input, work)` — the pool accessor. Detailed in [§9](#9-connections-auth-and-pooling).

### `next-handler.js` (225 lines)

Shared middleware. Key detail: `validateSameOrigin` treats `localhost`, `127.0.0.1` and
`[::1]` as **one origin** when scheme and port match, because the server binds `127.0.0.1`
while Next may report `req.url`'s host as `localhost` — a mismatch that broke Settings writes
in 1.4.12. External origins and differing ports are still rejected.

`TRUST_PROXY_HEADERS` (default `false`) gates whether `X-Forwarded-For`/`X-Real-IP` influence
the rate-limit key; otherwise every request buckets as `local`, so a spoofed header cannot
grant a fresh quota.

### `run-registry.js` and `write-execution.js` — query cancel

`run-registry.js` keeps running queries in a `Map` keyed `sessionId:runId` (a client UUID v4),
stored on `globalThis[Symbol.for('dataWorkbench.runRegistry')]` because Next bundles each route
separately and `/api/query` and `/api/query/cancel` must share one registry. A session can only
see or cancel its own runs; unknown and foreign run ids both return 404.

`write-execution.js` holds `runRead`, `previewWrite` and `executeWrite` (moved out of
`db-interface.js` so fake pools can unit-test them). Each attaches its mssql `Request` to the run
handle and calls `throwIfCancelled()` **between attach and `query()`**: mssql resets a request's
cancel flag when its query starts, so a cancel that lands during `begin()` would otherwise be
lost. `executeWrite` checks again after the statement and before `COMMIT`, then sets the phase
to `committing`; from then on `cancelRun` refuses, because a cancel can no longer undo the
write. A TDS attention does not roll a transaction back, so every cancel path rolls back
explicitly and reports `rolledBack` (an `EABORT` from rollback counts as rolled back). The run
id is optional: without one a query simply cannot be cancelled.

### `query-export.js` — full streamed export

`postQueryExport` re-classifies the query (reads only), then `startQueryExport` runs it with
mssql `stream = true` + `arrayRowMode` and writes CSV or JSON into a `ReadableStream` in ~64 KB
chunks. Back-pressure is real: when the stream's queue is full the request is `pause()`d and the
stream's `pull()` resumes it, so memory stays flat. Three things are easy to break:

- **The pool must outlive the handler.** Next builds the response only after the handler
  returns, but `withConnection` releases the pool when its callback settles, so the callback
  awaits the export's `finished` promise while the handler returns as soon as `ready` resolves.
- **Errors before the first recordset** reject `ready`, so a bad query still gets a normal JSON
  error; errors mid-stream `controller.error()` the stream so the download fails visibly rather
  than saving a silently truncated file. In stream mode mssql reports failures through the
  `error` event and still resolves the query promise, so the events drive everything.
- **The row limit is enforced by counting**, not only in SQL: `buildLimitedReadQuery` leaves some
  shapes uncapped (a user `TOP` with `ORDER BY`, `FETCH`, `FOR XML`), so at `EXPORT_ROW_LIMIT`
  rows the request is cancelled and the JSON footer records `"truncated": true`.

`next-handler.js` `res.stream(body, { headers })` passes a stream through `finalizeResponse`
with the usual no-store/nosniff headers and session cookie; same-origin and rate-limit checks
still run first. The export registers in the run registry as kind `export` (at most two per
session), so the editor's Cancel stops it; the browser closing the download cancels the request
through the stream's `cancel()`.

The grid itself now fetches `RESPONSE_ROW_LIMIT + 1` rows: capping at exactly the limit made
"exactly 250 rows" and "250 of millions" indistinguishable, so `truncated` was never true. The
extra row is dropped by `mapRecordset`; when truncated, `totalRows` is only that probe count and
the client never displays it as a total.

### `confirmation-store.js` (215 lines)

`Map<token, record>` mirrored to `CONFIRMATION_STORE_FILE` through a serialized write queue,
using write-to-temp-then-rename with a Windows `EPERM`/`EACCES` retry loop (shared with the
saved-connections store through `atomic-file.js`).

`claimConfirmation(token)` is the security-relevant function: it performs `get` then `delete`
**with no `await` in between**, so Node runs the block to completion and only the first of two
concurrent confirmations can win. `getConfirmation` (non-consuming) is used for validation;
`claimConfirmation` is called immediately before execution.

`hashConfirmationParts()` — SHA-256 over `JSON.stringify(stableClone(parts))`, where
`stableClone` sorts object keys recursively so hashing is order-independent.

### `audit-store.js` (203 lines)

In-memory array capped at `AUDIT_LOG_LIMIT` is the **source of truth**; the NDJSON file is a
projection. Every `addAuditEntry` queues a *full rewrite from memory* rather than an append.
The comment at line 68 explains why: mixing per-entry appends with size-triggered full
rewrites could duplicate or drop the newest entries under concurrency, whereas a serialized
idempotent rewrite cannot.

`getAuditEntries(limit, filters)` supports exact match on `event`/`outcome`/`action`/`sourceType`,
substring match on `database`, and free-text `search` across a concatenated haystack.

### `saved-connections-store.js` (178 lines)

Profile CRUD against `${APP_DATA_DIR}/${SAVED_CONNECTIONS_FILE}`. `normalizeSavedConnectionInput`
runs the payload through `normalizeConnectionInput` and then **omits `password` from the
returned shape entirely** — so no code path can persist it. Writes are serialized through a
read-modify-write promise chain.

### `env-settings-store.js` (827 lines)

`ENV_SETTING_GROUPS` (8 groups) + `FIELD_DEFINITIONS` (~40 fields). Each field carries
`key`, `group`, `type` (`number` \| `boolean` \| `select` \| `text` \| `secret` \| `color`),
bounds/options, `defaultValue`, `label`, `description`, `appropriate` (guidance text) and
`restartRequired`. Detailed in [§12](#12-settings-subsystem-env).

### `lifecycle-store.js` (135 lines)

Heartbeat sessions in a `globalThis['__dataWorkbenchLifecycleStore']` map (surviving Next's
module re-evaluation), a watchdog timer, and `process.exit(0)` after
`APP_SHUTDOWN_DELAY_MS`. Never exits in `NODE_ENV=development`.

### `rate-limit.js` (58 lines)

Sliding-window hit lists per key, with the bucket `Map` capped at `RATE_LIMIT_MAX_BUCKETS`
and evicted LRU-style (re-inserting on touch, deleting from the front when over cap).

### `update-launcher.js` (71 lines)

Extracted from the update route purely for testability: `buildUpdaterLaunchCommand()`
composes the `start "" /min powershell -WindowStyle Hidden -File ...` argument string, and
`waitForUpdaterStart(child, timeoutMs)` resolves on `spawn` and — critically — **does not
reject if the process then exits quickly**, which was the 1.4.24 bug fix.

### `update-status-store.js` (23 lines)

`writeUpdateStatusPending()` / `readUpdateStatus()` around `.data/update-status.json`, the
`outcome`/`error`/`commitBefore`/`commitAfter`/`finishedAt` record `apply-update.ps1` writes
on its way out (see §17) so a git/npm/build failure inside the updater is distinguishable
from a genuine success once the server comes back up.

---

## 7. SQL safety and classification

### Tokenizer

Every scanner is built on one internal function, `scanSqlRegions(query)`, which splits the text
into code, `'strings'` (`''` escapes), `[bracketed]` identifiers (`]]` escapes),
`"double-quoted"` identifiers (`""` escapes), `--` line comments and `/* */` block comments,
which **nest** as they do in T-SQL. Until 1.4.29 each scanner was a separate loop that missed
double quotes, `]]` and nesting, so a stray `'` inside one of them opened a fake string that hid
real keywords (an `; EXEC` after a nested comment was classified as part of a single UPDATE).
Build any new scanning on `scanSqlRegions` rather than adding another loop.

`tokenizeSql(query)` emits the words of code regions uppercased; `(`, `)`, `,` and `;` are
emitted as their own tokens. This is what makes `SELECT 'please DROP this'` and
`SELECT [TRUNCATE] FROM t` correctly classify as reads. `stripCommentsAndTrim` replaces comments
with a space and keeps everything else (used for hashing and previews). `splitStatements` splits
on `;` in code regions only.

### `classifyQuery(query)` decision order

1. Empty/comment-only → `{ kind: 'empty' }`.
2. Contains a line matching `/^\s*GO(\s+\d+)?\s*$/im` → `{ kind: 'blocked' }`. **The only
   blocked construct.** `GO` is a client-tool separator, not something Tedious can execute.
   An unterminated string, quoted identifier or block comment **fails closed** to a
   `directConfirmOnly` write with typed acknowledgement: the classifier cannot know where the
   author meant it to end, and SQL Server rejects such text anyway.
3. `CREATE|ALTER [OR ALTER] PROC[EDURE]` → single module definition. Internal semicolons are
   *not* treated as a batch. Requires typed `EXECUTE CREATE`/`EXECUTE ALTER`.
4. More than one statement → `action: 'BATCH'`, `requiresAcknowledgement`, with `actions[]`
   and `highRiskActions[]` surfaced for the review dialog. Phrase: `RUN BATCH`.
5. Single statement → `statementInfo()` decides:
   - `SELECT` / `WITH` (after walking CTE definitions via `leadingKeywordFromTokens`) → read,
     **unless an `INTO` token appears anywhere**. `SELECT ... INTO` creates a table, so it
     becomes action `SELECT INTO` (high-risk, phrase `EXECUTE SELECT INTO`). No legal read
     contains `INTO` at any depth, so the check needs no nesting logic and fails closed.
   - Leading keyword in `HIGH_RISK_ACTIONS`, **or any high-risk keyword anywhere in a
     non-read statement** (`INSERT ... EXEC`), or an unrecognised leading keyword →
     `directConfirmOnly` + typed acknowledgement.
   - `UPDATE`/`DELETE` with no `WHERE` token → warning + typed acknowledgement.
   - Otherwise a plain write → preview then single-click confirm, **unless the preview touches
     more than `HEIGHTENED_CONFIRM_LIMIT` rows**; then `resolveWriteAcknowledgement`
     (`write-acknowledgement.js`) stores `EXECUTE <ACTION>` in the confirmation record.

`HIGH_RISK_ACTIONS = {SELECT INTO, MERGE, TRUNCATE, DROP, ALTER, CREATE, GRANT, REVOKE, EXEC, EXECUTE}`.

### Truth table

| Input | Path | Preview | Confirmation |
| --- | --- | --- | --- |
| `SELECT` / `WITH … SELECT` | read | — | none |
| `INSERT`, `UPDATE … WHERE`, `DELETE … WHERE` | write-preview | rollback txn | button |
| `UPDATE`/`DELETE` without `WHERE` | write-preview | rollback txn | type `EXECUTE UPDATE`/`EXECUTE DELETE` |
| `DROP/TRUNCATE/ALTER/CREATE/MERGE/GRANT/REVOKE/EXEC` | write-review | none | type `EXECUTE <ACTION>` |
| `INSERT … EXEC proc` | write-review | none | type `EXECUTE INSERT` |
| `CREATE/ALTER PROCEDURE …` | write-review | none | type `EXECUTE CREATE`/`EXECUTE ALTER` |
| `stmt; stmt` | write-review (`BATCH`) | none | type `RUN BATCH` |
| anything containing a bare `GO` line | **blocked** | — | — |

`directConfirmOnly` skips the preview because you cannot meaningfully "preview" a `DROP` in a
rolled-back transaction without paying its cost.

### `buildLimitedReadQuery(query, rowLimit)`

Applying the server row cap without breaking valid T-SQL requires five cases, because SQL
Server rejects `ORDER BY` inside a derived table unless paired with `TOP`, `OFFSET` or
`FOR XML/JSON`:

| Query shape | Result |
| --- | --- |
| top-level `ORDER BY` **and** user `TOP` | unchanged (avoids `TOP` + `OFFSET` conflict) |
| top-level `ORDER BY`, no `OFFSET`/`FETCH`/`FOR` | append `OFFSET 0 ROWS FETCH NEXT n ROWS ONLY` |
| top-level `ORDER BY` with `OFFSET`, no `FETCH` | append `FETCH NEXT n ROWS ONLY` |
| top-level `ORDER BY` with `FETCH` or `FOR` | unchanged |
| leading `WITH` (CTE) | inject `TOP (n)` into the final top-level `SELECT`, or leave alone if it already has `TOP` |
| everything else | `SELECT TOP (n) * FROM ( … ) AS __rowlimit_wrapper` |

"Top-level" is computed by `topLevelSqlWords()`, which tracks paren depth and skips strings,
brackets and comments — so `ORDER BY` inside `OVER (…)` or inside a string literal does not
trigger the ordered-read path.

---

## 8. Confirmation token protocol

```
1. POST /api/query { connection, query }
   ├─ classify → read?  execute immediately, return rows
   └─ write:
      ├─ directConfirmOnly?  skip preview
      └─ else                previewWrite() in a rolled-back transaction
      createConfirmation({
        type: 'write',
        ownerSessionId: req.sessionId,                  ← session cookie
        hash: sha256({ type, connectionFingerprint, strippedQuery }),
        payload: { connection (password removed), query, rowsAffected,
                   action, expectedText, statementCount, actions, warnings },
        ttlMs: CONFIRMATION_TTL_MS
      })
      → 200 { requiresConfirmation: true, confirmationToken, expectedText, … }

2. POST /api/query { connection, query, confirmToken, acknowledgement }
   ├─ getConfirmation(token)                             non-consuming lookup
   ├─ recompute expected hash from THIS request          query/connection must be identical
   ├─ verify type, ownerSessionId, expiresAt, hash       any mismatch → delete + 400
   ├─ verify acknowledgement (case-insensitive)          when expectedText is set
   ├─ claimConfirmation(token)                           atomic single-use claim
   └─ executeWrite(pool, claimed.payload.query)          committed transaction
```

Procedure execution follows the identical shape through `/api/procedures`, hashing
`{type, connectionFingerprint, procedureFullName, sortedParameters}` and requiring no typed
phrase (the parameter review *is* the safety surface).

Client side, `openConfirm()` renders metrics + a review grid, disables **Continue** until the
typed phrase matches, and runs a live countdown from `health.confirmationTtlMs` that
auto-closes the dialog on expiry. `Ctrl`+`Enter` while the dialog is open submits the pending
confirmation rather than starting a new request.

---

## 9. Connections, auth and pooling

### Source / auth matrix

| `sourceType` | Label | Auth modes | Procedures |
| --- | --- | --- | --- |
| `fabric-sql` | Fabric SQL endpoint | `servicePrincipal` | yes |
| `fabric-lakehouse` | Fabric Lakehouse SQL endpoint | `servicePrincipal` | **no** |
| `sql-server` | SQL Server | `sqlLogin`, `windowsNtlm`, `servicePrincipal` | yes |

Aliases normalized on input: `fabric`, `fabric-database`, `fabric-db`, `warehouse`,
`database` → `fabric-sql`; `lakehouse`, `lakehouse-sql`, `fabric-lakehouse-sql` →
`fabric-lakehouse`; `sqlserver`, `sql_server`, `mssql` → `sql-server`. Unknown values fall
back to `fabric-sql`; an auth mode not supported by the source falls back to the source's
first mode.

### Config shapes produced by `buildConfig`

```js
// servicePrincipal — credentials come from process.env, never from the request
authentication: { type: 'azure-active-directory-service-principal-secret',
                  options: { clientId, clientSecret, tenantId } }

// windowsNtlm — SQL Server only
authentication: { type: 'ntlm', options: { domain, userName, password } }

// sqlLogin
config.user = username; config.password = password;
```

`options.encrypt` is always `true`. `trustServerCertificate` is honoured only for
`sql-server` (default `true`) and forced `false` elsewhere. Pool `min` is `1` for service
principal (token acquisition is expensive) and `0` otherwise; `max` is `10`.

### Pool cache

`poolCache: Map<fingerprint, { pool, connectPromise, inUse, disposeTimer, connection }>`.

`withConnection()` acquires (creating and connecting on first use), increments `inUse`, runs
the work, then decrements and schedules disposal after `DB_POOL_CACHE_TTL_MS`. Disposal is
skipped while `inUse > 0`, and the entry is evicted immediately on a pool `error` event or a
failed initial connect. Because the fingerprint excludes the password, a credential change
alone reuses the existing pool — acceptable here because a wrong password fails at connect
time and evicts the entry.

---

## 10. Metadata subsystem

`sql-metadata.js` is where source heterogeneity is absorbed. Fabric Lakehouse SQL endpoints
expose a much smaller surface than SQL Server, so almost every function has a fallback.

### Identifier handling

`parseQualifiedObjectName(name)` splits on `.` **only outside `[brackets]`** and unquotes
each part (`]]` → `]`), so `[My.Table]` stays one identifier. `quoteIdentifier` escapes `]`
as `]]`; `quoteQualifiedObjectName` re-quotes both parts. Spark-flavoured variants
(`` `backtick` ``) exist for Lakehouse `SHOW CREATE TABLE`.

> See [§21](#21-known-issues-and-intentional-oddities) for the round-trip caveat.

### Catalog

- `loadObjects(pool)` — `INFORMATION_SCHEMA.TABLES`, base tables and views, excluding `sys`,
  `INFORMATION_SCHEMA` and `sysdiagrams`, tables ordered before views.
- `loadColumnsForObject(pool, name)` — `INFORMATION_SCHEMA.COLUMNS`, parameterized.
- `loadProcedureCatalog` / `loadProcedureParameters` — try `INFORMATION_SCHEMA.ROUTINES` /
  `.PARAMETERS` first, fall back to `sys.procedures` / `sys.parameters` when the view is
  unavailable. The `sys.parameters` path filters `parameter_id > 0` to exclude the
  return-value row.

### DDL reconstruction

`loadTableMetadataSnapshot()` issues **nine parallel queries** against `sys.tables`,
`sys.columns`, `sys.key_constraints`, `sys.check_constraints`, `sys.indexes`,
`sys.index_columns`, `sys.foreign_keys`, `sys.foreign_key_columns` and
`sys.dm_db_partition_stats`. `renderCreateTableFromSnapshot()` then emits a practical
`CREATE TABLE` plus separate `CREATE INDEX` and `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY`
statements.

Details worth preserving:
- `renderColumnDataType` halves `max_length` for `nchar`/`nvarchar`/`ntext` and maps `-1` to `MAX`.
- `renderIdentityArgument` passes integer seed/increment through **as text**, because
  `Number()` would corrupt `BIGINT` identities beyond 2^53.
- Disabled and untrusted check constraints are emitted with explanatory comments.
- The output is explicitly labelled as generated catalog metadata, not original source text.

`loadObjectDefinition` dispatch:

| Object type | Source | Strategy |
| --- | --- | --- |
| table | SQL Server / Fabric SQL | nine-query snapshot → generated DDL |
| table | Fabric Lakehouse | `SHOW CREATE TABLE` (Spark) first |
| table | DMVs unavailable | `INFORMATION_SCHEMA`-only column list, with a warning |
| view / procedure | any | `sys.sql_modules.definition` (exact source text) |
| view | Fabric Lakehouse | `SHOW CREATE TABLE`, then `DESCRIBE EXTENDED` "View Text" |

`scriptMode: 'alter'` rewrites a leading `CREATE` to `ALTER` via `rewriteCreateToAlter`, or
prepends a review comment when the definition does not start as expected.

### Read-only analysis

| Action | Implementation | Fallback |
| --- | --- | --- |
| `profile` | `SELECT TOP (n)` of chosen columns, then computes nulls / distinct / completeness / min / max **in Node** | — |
| `dependencies` | `sys.sql_expression_dependencies` both directions, returns rows + nodes + edges | empty graph + warning |
| `rowcount` | `sys.dm_db_partition_stats` (approximate) | `COUNT_BIG(*)` when `allowCountFallback` |
| `topvalues` | per-column `GROUP BY … ORDER BY COUNT_BIG(*) DESC`, max 8 columns, top ≤ 50 | — |
| `resultshape` | `sys.dm_exec_describe_first_result_set` (parameterized, non-executing) | active-object column metadata |
| schema compare | two `loadTableMetadataSnapshot` calls, column-by-column diff | `INFORMATION_SCHEMA` column-only compare |
| query plan | `SET SHOWPLAN_XML ON` inside a rolled-back transaction | 400 with a clear unsupported message |

Metadata row count is refused outright for `fabric-lakehouse` unless `allowCountFallback` is
set, and estimated plans are refused for Lakehouse entirely.

### Procedure execution

`resolveSqlType(metadata)` maps ~25 T-SQL type names to `mssql` type constructors.
`parseProcedureParameterValue` coerces and validates text input per type (integers, decimals,
dates, GUID regex, `0x…` hex to `Buffer`, `bit` truthiness, literal `NULL` → `null`, blank →
omitted). `bindProcedureParameters` **rejects any supplied name not present in the discovered
metadata**, registers outputs with `request.output()`, and then executes via
`request.execute(name)` so `output` and `returnValue` come back.

---

## 11. Audit subsystem

Emitted from `db-interface.js` on both success and failure of every meaningful operation:

`test_connection`, `load_objects`, `load_columns`, `load_procedures`,
`load_procedure_parameters`, `object_definition`, `object_profile`, `object_dependencies`,
`object_row_count`, `object_top_values`, `query_result_shape`, `query_plan`, `schema_compare`,
`query`, `write_prepare`, `write_preview`, `write_execute`, `procedure_prepare`,
`procedure_execute`, `saved_connection_upsert`, `saved_connection_delete`.

Entry shape:

```json
{ "timestamp": "ISO-8601", "event": "query", "outcome": "success|error|blocked",
  "action": "SELECT|INSERT|EXEC|READ_METADATA|BLOCKED|…", "sourceType": "sql-server",
  "server": "host", "database": "db", "rowCount": 42, "detail": "one-line preview" }
```

`detail` is produced by `compactQueryPreview` (comments stripped, whitespace collapsed,
truncated to 160 chars) or `compactProcedurePreview` (procedure name + **parameter names
only**, never values).

---

## 12. Settings subsystem (`.env`)

`GET /api/env-settings` returns the schema joined with current values. `POST` either writes
changed values or, with `{ action: 'syncMissing' }`, appends defaults for schema keys absent
from the file.

Guarantees implemented in `env-settings-store.js`:

- **Line-preserving writes.** `parseEnvText` keeps every raw line (including comments and
  blanks) plus a key→line index, so an update rewrites only that one line.
- **Unknown keys rejected** — `updateEnvSettings` throws on any key not in `FIELD_MAP`.
- **Per-type validation** — integer bounds, `true|false`, `select` membership, `#rgb`/`#rrggbb`
  colours (blank = follow theme), no line breaks and ≤ 4000 chars for text/secret.
- **Secrets never returned.** `fieldForClient` forces `value: ''` for `type: 'secret'` and
  exposes only `configured: boolean`. A blank submitted secret is skipped, so the existing
  value survives.
- **Sync backs up first** — `.data/backups/.env-YYYYMMDD-HHMMSS.bak` before appending.
- **Bootstrap from the example** — when no `.env` exists, reads are seeded from `.env.example`.

`getEnvSettings` also returns `envSync.missingKeys`, which drives the **Sync new settings**
button so a released feature's new keys can be added without hand-editing.

`server-unit.test.mjs` asserts that **every** `FIELD_DEFINITIONS` key appears in
`.env.example` — adding a setting without updating the example file fails the suite.

---

## 13. Client state model

One `state` object in `console-core.js`. Notable slices: `health`, `versionInfo`,
`envSettings`, `workspace` (`'sql'|'procedure'`), `explorer`, `objects`/`filteredObjects`,
`procedures`/`filteredProcedures`, `activeObject`/`activeColumns`/`selectedColumns` (a `Set`),
`activeProcedure`/`procedureParameters`/`procedureValues`, `pinnedItems`/`recentItems`,
`resultTabs` + `activeResultTabId`, `results`, `pendingAction`, `sidePanels`, `lifecycle`,
`editorTabs` + `activeEditorTabId`, `activeRun` (the one query allowed in flight: its run id,
abort controller and elapsed-time ticker), and `suggest` (the open autocomplete list).

The workspace snapshot gained `editorTabs`/`activeEditorTabId` and results gained `elapsedMs`
without a storage-key bump: both are optional with defaults, so an older snapshot still restores
and nothing is lost on upgrade.

### Persistence map

| Scope | Key | Contents |
| --- | --- | --- |
| localStorage | `dataWorkbenchConnectionsV2` | saved-profile mirror (server is authoritative) |
| localStorage | `dataWorkbenchQueryHistoryV3` | SQL history, 20 items, 14-day retention |
| localStorage | `dataWorkbenchProcedureHistoryV1` | procedure runs + parameter values |
| localStorage | `dataWorkbenchThemeV2` | theme id |
| localStorage | `dataWorkbenchEditorTextSizeV1` / `…ResultsTextSizeV1` | font scales |
| localStorage | `dataWorkbenchPanelLayoutV1` | six panel dimensions |
| localStorage | `dataWorkbenchSidePanelVisibilityV1` | manual collapse state only |
| localStorage | `dataWorkbenchAdvancedOperationsVisibleV1` | disclosure state |
| localStorage | `dataWorkbenchPinnedObjectsV1:<fingerprint>` | pins, scoped per connection |
| localStorage | `dataWorkbenchRecentObjectsV1:<fingerprint>` | recents, capped at 40 |
| localStorage | `dataWorkbenchScratchpadsV1` | legacy SQL drafts, imported once into the server query library and then left in place |
| localStorage | `dataWorkbenchScratchpadsImportedV1` | `1` once the scratchpads above were imported |
| sessionStorage | `dataWorkbenchActiveConnectionV1` | connection form **without password** |
| sessionStorage | `dataWorkbenchCatalogStateV1` | catalog + active selections, fingerprint-gated |
| sessionStorage | `dataWorkbenchWorkspaceStateV1` | per-mode snapshot: editor text, caret, scroll, editor tabs, filters, sort, result tabs, pagination |
| sessionStorage | `dataWorkbenchLifecycleSessionV1` | heartbeat session id |
| memory only | `window.__dataWorkbenchSessionPassword` | password for the tab's lifetime |

Every read goes through `safeGet`/`safeSessionGet`, which swallow storage exceptions (private
mode, disabled site data) and return `null`.

Snapshots are keyed on `connectionSignature()` — the client mirror of the server's
fingerprint — so switching database never restores another connection's catalog or results.

### Result tabs

Capped at `RESULT_TABS_MAX = 5`, scoped by workspace. Metadata actions pass a stable `tabKey`
(e.g. `profile:dbo.Alerts`) so repeating an action reuses its tab; query and procedure runs
pass an empty key and always create a new one. `syncActiveResultsToTab()` flushes live state
into the active tab before any switch or persist.

---

## 14. Layout engine

Layout is computed in **JavaScript** and expressed to CSS through data attributes. CSS never
decides the arrangement on its own at desktop widths.

`getLayoutMode()` measures the viewport (preferring `visualViewport`, so browser zoom is
handled), the shell, the workspace grid and the studio, then compares them against the
*actual saved panel widths* plus minimum-space constants (`MIN_STUDIO_SPACE_WITH_EXPLORER = 720`,
`MIN_STUDIO_SPACE_WITH_ACTIVITY = 620`) to produce:

| Attribute on `.app-shell` | Values |
| --- | --- |
| `data-layout-mode` | `split` \| `stacked` |
| `data-workspace-mode` | `wide` \| `compressed` \| `stacked` |
| `data-studio-mode` | `wide` \| `stacked` |
| `data-procedure-layout-mode` | `split` \| `stacked` |
| `data-viewport-scale` | rounded zoom factor |

Plus classes: `control-rail-collapsed`, `activity-panel-collapsed`,
`control-rail-auto-hiding`, `activity-panel-auto-hiding`, `builder-primary-split`,
`advanced-operations-expanded`, `procedure-script-expanded`, `panel-resize-disabled`.

Other state attributes: `.results-card[data-results-state]`
(`empty|loading|summary|table|error`), `.builder-panel-columns[data-columns-state]`
(`empty|loading|loaded`), and on `<html>`: `data-theme`, `data-ambient-motion`, `data-tooltips`.

Panel widths are CSS custom properties (`--control-rail-width`, `--explorer-width`,
`--activity-width`, `--procedure-panel-width`, `--results-height`, `--builder-primary-width`)
written by `applyPanelLayout()` and clamped by `PANEL_LIMITS` and `normalizePanelLayoutForViewport()`.

Resizing uses pointer capture on `[data-resize-handle]` elements; double-click resets to the
default; handles set `aria-hidden="true"` and stop responding when `resizeEnabled(name)` is
false. Because the JS-driven `data-workspace-mode="wide"` template must beat leftover
`@container` fallbacks in `workbench.css`, it is restated at higher specificity — the 1.4.22
fix, now guarded by an assertion in `responsive-audit.mjs`.

**Side-panel auto-hide** fades a panel after `APP_SIDE_PANEL_IDLE_MS` of no pointer/focus/input
activity and collapses it after `APP_SIDE_PANEL_FADE_MS` (0 under `prefers-reduced-motion`).
Automatic collapse deliberately does **not** write the visibility preference — only manual
toggling does.

---

## 15. Theming and appearance

Six themes — `midnight` (default), `harbor`, `forge`, `field`, `ink`, `paper` — defined as
custom-property overrides on `:root[data-theme='…']` in [app/theme.css](app/theme.css).
Most themes change only accents; `ink` and `paper` also change surfaces, and `paper` flips
`color-scheme` to light. `--results-cell-text` is elevated for dark themes.

The ambient background is two large blurred radial fields on `.shell-backdrop::before/::after`
travelling opposite diagonals, plus two drifting orbs and a faint grid. Controlled by:

- `--ambient-color` / `--ambient-color-2` — set by JS from `APP_AMBIENT_COLOR`; a second hue is
  derived by `shiftHue(colour, 38)`. Blank falls back to `var(--accent)` / `var(--accent-2)`.
- `--ambient-strength` — `APP_AMBIENT_INTENSITY / 100`, applied as opacity on the whole layer.
- `--ambient-motion-duration` and `html[data-ambient-motion]` — from `APP_AMBIENT_MOTION_*`.
- All animations are disabled under `prefers-reduced-motion: reduce`.

The Settings colour picker live-previews via `handleAmbientLivePreview` before saving.

**Tooltips** are app-controlled, not native. `setupTooltips()` installs delegated
`pointerover`/`focusin` listeners plus a `MutationObserver` that strips native `title`
attributes into `data-tooltip-title`. Text resolution order: `data-tooltip` →
`TOOLTIP_DESCRIPTIONS[element.id]` → contextual rule by class → absorbed `title` →
`aria-label` → generated field description; `isRedundantTooltip()` discards any candidate that
merely repeats the element's own visible text (the 1.4.18 fix).

---

## 16. Desktop lifecycle

### Startup chain

```
Desktop shortcut → Start Data Workbench.vbs        (WScript.Shell.Run, window style 0 = hidden)
                 → Start Data Workbench.ps1        (WinForms progress dialog)
                     ├─ Test-AppHealth             GET http://127.0.0.1:3000/
                     ├─ Test-BuildCurrent          .next/BUILD_ID mtime vs app/ lib/ public/
                     │                             scripts/ package*.json next.config.mjs
                     ├─ Stop-ProjectServer         only processes whose command line matches
                     │                             this project dir + next + start
                     ├─ Open-LauncherLoadingPage   launcher-loading.html with target/ready/
                     │                             eta/timeout/checks/mode query params
                     ├─ npm install                only when node_modules is absent
                     ├─ npm run build              only when the build is stale
                     ├─ npm run start              hidden, output → .data/logs/…-server.log
                     └─ poll readiness ≤ 60s
```

`launcher-loading.html` is a standalone page (opened as a `file://` URL) that polls
`http://127.0.0.1:3000/launcher-ready.svg` by `Image()` load — no fetch, no CORS — and
`location.replace(target)` on success. It renders phase-aware progress (`first-run` /
`build` / `start` sets), estimated time left and a "taking longer than expected" state, so a
cold first launch never looks hung.

### Shutdown

The browser POSTs `/api/lifecycle/heartbeat` every 10s (`LIFECYCLE_HEARTBEAT_MS`), skipping
hidden tabs, and sends a `navigator.sendBeacon` close event on `pagehide`/`beforeunload`.
`lifecycle-store.js` prunes sessions older than `APP_HEARTBEAT_GRACE_MS` (default 2h) and
`process.exit(0)` when none remain. `Exit Data Workbench` posts `/api/lifecycle/exit` for an
immediate shutdown, and the client shows a blocking overlay that disables every control.
Shutdown is skipped entirely when `NODE_ENV=development`.

---

## 17. Self-update

Available only when the app folder is a Git checkout and `APP_SELF_UPDATE_ENABLED` is not
`false`. Zip installs cannot self-update — they have no remote.

`GET /api/version` reports `package.json` version, branch, local `HEAD`,
`git ls-remote origin refs/heads/main`, `.next/BUILD_ID` + build time, and
`updateAvailable`. The whole payload is cached for `VERSION_CACHE_TTL_MS` (30s) and concurrent
computations are de-duplicated through a single in-flight promise, so polling cannot spawn
repeated subprocesses.

`POST /api/update` re-checks local vs remote, then spawns

```
cmd.exe /d /s /c  start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass
                  -WindowStyle Hidden -File scripts\apply-update.ps1
                  -ProjectDir … -Port … -OldPid …
```

detached, `stdio: 'ignore'`, `windowsHide: true`, and returns success once
`waitForUpdaterStart` sees the `spawn` event. The launcher exiting immediately afterwards is
expected and must not be treated as failure.

[scripts/apply-update.ps1](scripts/apply-update.ps1) then: stops the old server (by PID and
by port, matching only this project's command line) → `git fetch origin main` →
**`git reset --hard origin/main`** → `npm install` only if `package-lock.json`'s hash changed →
`npm run build` → relaunch hidden. On failure it still restarts a server so the user is not
left with nothing. Everything is logged to `.data/logs/data-workbench-update.log`.

`reset --hard` rather than `pull --ff-only` is deliberate: end-user installs are meant to
mirror `origin/main` exactly, and a fast-forward pull aborts on any local drift (CRLF churn,
a stray edit), which previously left the old build running with the Update button still
showing. Untracked `.env` and `.data/` are untouched by a hard reset;
[.gitattributes](.gitattributes) normalizes the repo to LF so the drift cannot recur.

The script's outer `try/catch` always restarts a server on the way out — on success that is
the newly built one, but on a caught failure (git auth/network, `npm install`, `npm run
build`) it is a fallback restart of whatever code is currently on disk, so the app is never
left down. Restarting looks identical from a bare TCP/health check either way, so the script
writes its outcome to `.data/update-status.json` (`{ outcome, error, commitBefore,
commitAfter, finishedAt }`) right before that restart — success or failed, never left as the
`pending` marker `POST /api/update` wrote before launching it. `GET /api/update-status`
(local-only, like every lifecycle endpoint) reads it back.

Client side, `waitForUpdateRestart()` polls `/api/health` until it has seen the server go
down and come back (or 20s elapse), then reads `/api/update-status` before doing anything
else: `outcome: 'failed'` shows the failed-update overlay with the captured error instead of
reloading, so a git/npm/build failure surfaces as a clear message rather than a silent reload
back onto the old version with the Update button still there and no explanation. Only then
does it reload. After ~180 attempts with no server response at all, it surfaces the log path
instead.

---

## 18. Security model

**Threat model:** a trusted operator on their own machine, connecting to real databases. The
app defends against *accidents* and *browser-borne cross-site requests*, not against a
malicious local user (who could simply run `sqlcmd`).

| Control | Implementation |
| --- | --- |
| Network exposure | `next start -H 127.0.0.1`; launcher targets `127.0.0.1` |
| CSRF | Origin/Referer validation on every non-GET, loopback names treated as one origin; `ALLOW_LOCAL_MISSING_ORIGIN` permits header-less loopback requests |
| Session binding | `httpOnly`, `sameSite: 'strict'` cookie; confirmation tokens are bound to `ownerSessionId` |
| Replay / double-execute | `claimConfirmation` is atomic and single-use |
| Tamper after preview | Confirmation hash covers connection fingerprint + comment-stripped SQL |
| Rate limiting | Per `clientIp:METHOD:pathname`; proxy headers ignored unless `TRUST_PROXY_HEADERS=true`; bucket map LRU-capped |
| Secret persistence | Passwords stripped from confirmation records; omitted from saved profiles; `AZURE_CLIENT_SECRET` write-only through Settings; never in audit details or diagnostics |
| SQL injection | Every metadata query is parameterized or built through `quoteIdentifier`/`quoteStringLiteral`. Operator-authored SQL is executed as written **by design** — that is the product |
| XSS | Manual `esc()` on every interpolated value in `console-core.js` |
| CSV formula injection | `csvCell()` prefixes `'` to cells starting `= + - @ \t \r` while leaving plain numbers intact, then quotes per RFC 4180 |
| Local-only endpoints | Settings / lifecycle / update require a loopback request URL **and** host header; Settings additionally requires an Origin or Referer |
| Response hygiene | `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` on all API responses |
| Audit access | `loopback` by default (`AUDIT_ACCESS_MODE`) |

**Known accepted limitation:** the connection fingerprint excludes the password, so pools are
shared across credential changes for the same identity. Also note `dotenv` loads `.env` at
import time — most settings therefore require a restart, which is why nearly every field
carries `restartRequired: true`.

---

## 19. Testing and verification

No test framework. Every suite is a plain Node script using `node:assert/strict`, logging a
success line and exiting non-zero on failure.

| Script | Needs a server? | Needs a DB? | Covers |
| --- | --- | --- | --- |
| `sql-classifier.test.mjs` | no | no | Tokenizer, statement splitting, full classification matrix, `buildLimitedReadQuery` cases |
| `sql-metadata.test.mjs` | no | no (fake pools) | Generated `CREATE TABLE` features, Lakehouse fallbacks, `parseQualifiedObjectName` edge cases |
| `server-unit.test.mjs` | no | no | Normalization, `buildConfig`, rate limit, audit filters, atomic claim, profile redaction, lifecycle, `.env` validation + sync + example drift, middleware same-origin matrix |
| `route-contract.test.mjs` | yes (`next start`, port 3120) | no | HTTP status/shape for validation-only requests, secret redaction, local-only guards, favicon |
| `smoke-test.mjs` | yes (port 3100) | no | Health, page render, batch confirmation contract, audit availability |
| `ui-smoke.mjs` | no (jsdom) | no | The real `console-core.js` against built HTML with mocked `fetch` — wiring, dialogs, templates, history restore, panel resize, tooltips, auto-hide |
| `responsive-audit.mjs` | yes (Playwright, port 3210) | no | 16 widths × 2 routes, 6 themes, hidden-panel and wide-rail scenarios, docs pages; asserts no offscreen elements, no own-overflow, no weak affordances, no layout regressions; writes screenshots + JSON |
| `release-diagnostics.mjs` | no | no | Node version, `package-lock` root version/deps match `package.json`, required files and routes exist, no tracked secrets, `.env.example` sanity, `verify:release` gate contents |
| `live-smoke.mjs` | no | **yes** | Opt-in; refuses to run without `DATA_WORKBENCH_LIVE_TESTS=true` + `LIVE_TEST_CONFIRM_NON_PRODUCTION=YES_I_UNDERSTAND`, and refuses hosts matching `/prod|prd|production|live/i` |

```bash
npm run verify          # clean, build, classifier, metadata, smoke, ui-smoke, responsive audit
npm run verify:release  # + server-unit, route-contract, npm ls, npm audit --omit=dev, diagnostics
npm run test:server     # fast: server-unit only
npm run test:routes     # fast: route-contract only
npm run responsive:audit
npm run verify:live     # opt-in, non-production sources only
```

`ui-smoke.mjs` reads from `.next/server/app/*.html`, so **it requires a fresh `npm run build`**
and will fail loudly if the build output is missing.

---

## 20. Extension recipes

### Add an API route

1. Implement `export async function postThing(req, res)` in `lib/server/db-interface.js`
   (or a new module) using `getConnectionFromBody` → `validateConnection` → `withConnection`.
2. Emit `addAuditEntry` on success **and** in the catch block.
3. Create `app/api/thing/route.js`:
   ```js
   import { ensureInitialized, postThing } from '../../../lib/server/db-interface';
   import { runHandler } from '../../../lib/server/next-handler';
   export async function POST(req) { await ensureInitialized(); return runHandler(postThing, req); }
   ```
4. Add a validation-only case to `route-contract.test.mjs`, and the path to
   `release-diagnostics.mjs`'s `routeFiles` if it is release-critical.

### Add a source type

Extend `SOURCE_DEFINITIONS` (and aliases) in `source-config.js`; teach `buildConfig` any new
auth shape; add capability fallbacks in `sql-metadata.js`; the client picks the new source up
automatically from `/api/health` (`FALLBACK_SOURCES` in `console-core.js` is only for a failed
health call, but keep it in sync). Extend the auth matrix assertions in
`route-contract.test.mjs` and `server-unit.test.mjs`.

### Add an `.env` setting

1. Append to `FIELD_DEFINITIONS` in `env-settings-store.js` with full metadata.
2. Add the key **and a comment** to `.env.example` — `server-unit.test.mjs` enforces this.
3. Read it where it is used (module scope for server settings; expose through
   `getHealth`'s `sidePanels`/`appearance` if the browser needs it).
4. Document it in `README.md` and, if user-visible, in the relevant `app/docs` page.
5. Existing installs get it through **Sync new settings**; no migration code is needed.

### Add a UI control

1. Add markup with a stable `id` to `workbench-shell.js`.
2. Wire it inside `bind()` in `console-core.js` using `if ($('id')) $('id').onclick = …`.
3. Add an entry to `TOOLTIP_DESCRIPTIONS` keyed by that id.
4. Add a wiring assertion to `ui-smoke.mjs`.
5. Run `npm run responsive:audit` — new controls must have a ≥1px border, ≥30px visual height,
   and must not overflow at 320px.

### Add a metadata action

Extend the action whitelist in `postObjectInsight`, implement the loader in `sql-metadata.js`
with an explicit fallback for sources lacking the DMV, return
`{ columns, rows, totalRows, output, warnings, message }`, and call it from the client through
`setResults(..., { visualKind, tabKey })` so it reuses its result tab.

---

## 21. Known issues and intentional oddities

### Intentional — do not "fix"

| Behaviour | Why |
| --- | --- |
| `GO` is blocked | It is a client-tool batch separator, not T-SQL. Tedious cannot execute it. |
| `git reset --hard` in the updater | End-user installs mirror `origin/main`; `pull --ff-only` aborts on any drift and silently relaunched the old build. |
| Audit log rewritten in full on every entry | Mixing appends with size-triggered rewrites could duplicate or drop the newest entries. |
| Updater "exited quickly" is success | The launcher is `cmd /c start`, which exits as soon as it hands off. This was the 1.4.24 bug. |
| Textarea + highlight backdrop instead of a real editor | Zero dependencies, no bundler, preserves native textarea behaviour. |
| Passwords excluded from the connection fingerprint | Fingerprints are used for pool reuse and client-side scoping, where a password would leak into storage keys. |
| `data-workspace-mode="wide"` restated at higher specificity | It must beat the older `@container` fallbacks below it (1.4.22). |
| Prod tags are matched by source/server/port/database, not by profile id or login | A prod tag has to follow the database, so signing in as another user or loading a copy of the profile cannot step around it. It is a guard against mistakes, not a security boundary: anyone using the app can retag a profile, and a server reached through a different host alias does not match. |
| The prod phrase names the profile, not the database | Database names here are often long generated ids (`meta_store-3ede0524-…`) nobody could type per write; the profile name is short and chosen by the user. |
| Write-preview samples are never persisted | They hold real row values. They go to the browser in the preview response only — not into `pending-confirmations.json` or the audit log — and the dialog clears them on close. |
| A small `INSERT` requires no typed phrase | It cannot destroy existing rows and the rollback preview shows the row count. Above `HEIGHTENED_CONFIRM_LIMIT` rows it needs `EXECUTE INSERT`, like any other large write. |

### Genuine issues

**None currently tracked.** The defects found in the 1.4.25/1.4.26 audit are fixed and
recorded in [CHANGELOG.md](CHANGELOG.md), which is the permanent history.

When a defect is found and not fixed immediately, record it in a `BUGS.md` at the repository
root — one entry per defect with a reproduction, root cause, suggested fix and the regression
test to add — and delete the entry once it is fixed. See
[AGENTS.md §10](AGENTS.md#10-known-issues) for the convention. Do not keep a duplicate list
here; this section is for the "Intentional" table above.
