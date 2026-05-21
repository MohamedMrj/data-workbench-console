# Data Workbench Console - Project Memory & Architecture

## Overview
Data Workbench Console is a production-safe, web-based database operations tool built for safely querying and executing procedures against Microsoft Fabric SQL endpoints, Fabric Lakehouse endpoints, and traditional SQL Server instances.

It is built with a hybrid architecture:
1. **Next.js 15 (App Router)** for the backend server and API routing.
2. **Vanilla JavaScript** (`console-core.js`) for the complex client-side UI and state management, bypassing React's virtual DOM for performance in the core workspace while utilizing React only for the static shell structure.

The primary design principle is **Safety-First**: the app strictly segregates read-only operations from modifying operations, requiring explicit user confirmations via temporary tokens (TTL) for any write operations (INSERT, UPDATE, DELETE).

---

## Directory Structure & File Map

### 1. Frontend Shell (React / Next.js)
The `app/` directory houses the Next.js App Router structure. It defines the layout and the initial HTML shell.
*   **`app/page.js`**: The default entry point (SQL Studio page).
*   **`app/procedures/page.js`**: The Procedure Runner page dedicated to executing stored procedures.
*   **`app/layout.js`**: Global layout, injects root metadata and CSS.
*   **`app/components/workbench-shell.js`**: The main React component that renders the structural HTML grid (Control Rail, Explorer, SQL/Procedure Workspaces, Activity Panel).
*   **`app/components/console-app-boot.js`**: A Next.js client component that loads the vanilla JS application (`console-app.js` and `console-core.js`) after the React shell mounts.
*   **`app/theme.css`, `app/workbench.css`, `app/globals.css`**: The core styling system using raw CSS variables, CSS grid layouts, and custom theme data attributes.

### 2. Client-Side Core (Vanilla JS)
The frontend interactivity is deliberately decoupled from React to maximize DOM manipulation performance for large results and complex layouts.
*   **`public/console-core.js`**: The massive central brain of the client. It handles:
    *   State management (`state` object).
    *   DOM binding and event listeners (`bind()`).
    *   Dynamic panel resizing (`setupResizablePanels`).
    *   Query generation (`generateQuery()`).
    *   API communication (`api()` helper function).
    *   Execution workflows (including the confirmation token flow for write queries).
*   **`public/console-app.js`**: The bootstrap script that initializes `window.dataWorkbenchConsole`.

### 3. Backend API Routes (Next.js)
The `app/api/` directory exposes the REST API endpoints consumed by `console-core.js`. They act as thin wrappers that delegate to `lib/server/db-interface.js`.
*   **`api/query/route.js`**: Executes raw SQL queries.
*   **`api/procedures/route.js`**: Executes stored procedures.
*   **`api/tables/route.js`, `api/columns/route.js`**: Retrieves schema/catalog metadata.
*   **`api/object-insights/route.js`**: Profiles table data and generates dependencies.
*   **`api/procedure-parameters/route.js`**: Gets input/output parameters for procedures.
*   **`api/test-connection/route.js`**: Validates credentials.
*   **`api/saved-connections/route.js`**: CRUD operations for connection profiles.
*   **`api/audit/route.js`**: Retrieves the local audit log.
*   **`api/health/route.js`**: Returns server capabilities, supported modes, and confirmation TTL settings.

### 4. Backend Logic & Services (Node.js)
The `lib/server/` directory contains all database connectivity, safety validation, and persistence logic.
*   **`db-interface.js`**: The core API controller. It orchestrates connections (via `mssql`), handles token confirmation validation, and executes the actual SQL queries. It also performs startup environment validation for required Azure credentials.
*   **`sql-classifier.js`**: A rigorous, regex-based SQL parser that inspects queries before execution. It strips comments, ignores string literals, detects CTEs (`WITH`), and flags the operation type (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE`, etc.). It blocks destructive keywords like `DROP`, `TRUNCATE`, and `ALTER`.
*   **`sql-metadata.js`**: Contains the complex system queries (using `sys.tables`, `sys.views`, `sys.parameters`) required to extract catalog information from SQL Server/Fabric.
*   **`source-config.js`**: Defines the supported database types (`fabric-sql`, `fabric-lakehouse`, `sql-server`) and their allowed authentication modes (`servicePrincipal`, `sqlLogin`).
*   **`confirmation-store.js`**: Implements the server-side TTL (Time-To-Live) token system for write operations. Tokens are stored in `.data/pending-confirmations.json`.
*   **`saved-connections-store.js`**: Persists saved connection profiles to `data/saved-connections.json`.
*   **`audit-store.js`**: Appends audit events (queries executed, connections established) to a local NDJSON log file (`audit-log.ndjson`).
*   **`rate-limit.js`**: Provides basic API rate limiting.

### 5. Utilities & Scripts
*   **`scripts/sql-classifier.test.mjs`**: Contains 44 exhaustive unit tests verifying the safety gates of `sql-classifier.js`.
*   **`scripts/smoke-test.mjs`, `scripts/ui-smoke.mjs`, `scripts/demo-tables.mjs`**: Integration and setup scripts.
*   **`run-production.bat`**: A Windows batch script that builds the Next.js app and starts the production server.

---

## Core Workflows & Architecture Patterns

### 1. Authentication
The application supports Azure Service Principals (default for Fabric) and standard SQL Login (for traditional SQL Server). Azure credentials (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`) are read from the `.env` file upon startup.

### 2. The Execution & Safety Pipeline
When a user clicks "Run query", the following happens:
1.  **Client-Side Check**: `console-core.js` does a basic regex check. If it detects a modifying query, it transitions the UI to a "Preview/Confirm" state instead of executing immediately.
2.  **API Execution Request**: The query is sent to `POST /api/query`.
3.  **Server Classification**: `db-interface.js` passes the query to `sql-classifier.js`.
4.  **Confirmation Requirement**: If `sql-classifier.js` marks it as a write operation (`INSERT`, `UPDATE`, `DELETE`), and no valid confirmation token was provided, the server returns a `428 Precondition Required` response alongside a short-lived `confirmationToken`.
5.  **User Confirmation**: The client UI displays the "Execution Pending" modal with a countdown timer.
6.  **Final Execution**: The user clicks "Confirm Execution". The client re-sends the exact same request, but this time includes the `confirmationToken`. The server validates the token against `confirmation-store.js` and executes the query.

### 3. Connection Management
Connection parameters are entered in the left-hand Control Rail. 
*   **Testing**: Validates credentials via `POST /api/test-connection`.
*   **Saving**: Profiles can be saved via `POST /api/saved-connections`, persisting them to `data/saved-connections.json`.
*   **Loading Catalog**: Connecting populates the "Object Explorer" or "Procedure Explorer" by querying system catalog views via `sql-metadata.js`.

### 4. Layout & UI
The application uses a heavily customized CSS Grid (`workspace-grid` and `studio-grid`). 
It features:
*   Resizable panels (implemented in vanilla JS inside `console-core.js` via drag event listeners).
*   Responsive breakpoints that gracefully transition the layout from a wide, multi-column dashboard into a stacked single-column view on smaller screens (handled inside `workbench.css`).

---
*Generated by Antigravity*

---

## Internal Hosting Readiness Checklist

Treat this application as a privileged internal database operations console, not as a harmless static viewer. It can connect to Fabric/SQL Server sources, load metadata, run read queries, preview/execute writes, and execute stored procedures for source types that support them.

### Access Control
* Put the app behind SSO, ideally Microsoft Entra ID / Azure AD.
* Restrict access to a small operator group.
* Do not rely on the current `dwb_session` cookie as authentication. It is only a session/confirmation mechanism, not a login system.
* Consider app-level roles if more than one team uses it:
    * `viewer`: catalog and read-only queries.
    * `operator`: write preview/execution.
    * `admin`: saved connections, audit, and configuration.

### Network
* Host only on an internal network, VPN, private endpoint, or authenticated reverse proxy.
* Avoid public internet exposure unless strong identity enforcement is in front of the app.
* Use HTTPS only.
* Allow outbound TCP `1433` to Fabric and SQL Server endpoints.
* Set `ALLOW_LOCAL_MISSING_ORIGIN=false` for production/internal hosting.

### Secrets
* Rotate any exposed Azure client secret before hosting.
* Store secrets in the hosting platform's secret store or Azure Key Vault, not in a committed `.env` file.
* Required Fabric service-principal variables:
    * `AZURE_CLIENT_ID`
    * `AZURE_CLIENT_SECRET`
    * `AZURE_TENANT_ID`
* Never commit `.env`, `audit-log.ndjson`, `.data/pending-confirmations.json`, or `data/saved-connections.json`.

### Fabric Permissions
* Use a dedicated service principal for this app.
* Grant access only to the Fabric workspaces, Lakehouses, Warehouses, or SQL endpoints the app needs.
* Avoid workspace Admin unless required.
* Prefer read-only permissions if the hosted app is mostly for inspection.
* Test each target source with:
    * Connection test.
    * Catalog load.
    * Sample `SELECT`.
    * Write preview, if writes are allowed.
    * Procedure runner, only for source types that support procedures.

### Query Safety
* Decide before hosting whether writes should be available at all.
* Current behavior is preview-first for writes, but confirmed writes can still execute.
* Consider adding production kill switches if needed:
    * `READ_ONLY_MODE=true`
    * `ALLOW_WRITES=false`
    * `ALLOW_PROCEDURES=false`
* Consider stricter blocking or role-gating for:
    * `DROP`
    * `TRUNCATE`
    * `ALTER`
    * `CREATE`
    * `GRANT`
    * `REVOKE`
    * unrestricted `DELETE` / `UPDATE`

### Audit
* Current audit persistence is local NDJSON via `AUDIT_LOG_FILE`.
* For hosted use, place audit logs on persistent private storage.
* Review and tune:
    * `AUDIT_LOG_LIMIT`
    * `AUDIT_LOG_MAX_BYTES`
* Decide who can view audit remotely.
* For hosted audit viewing, likely set:

```env
AUDIT_LOCAL_ONLY=false
AUDIT_ACCESS_MODE=same-origin
```

* Long term, move audit events to a database/table and include the authenticated user identity in every audit entry.

### Saved Connections
* Saved profiles intentionally do not persist passwords or service-principal secrets.
* Saved profiles still expose server/database names, so store them privately.
* Put `data/saved-connections.json` on persistent private storage.
* If multiple teams use the app, make saved connections per-user or per-group instead of global.

### Deployment Runtime
* Use Node.js `>=20`.
* Verify before deployment:

```bash
npm ci
npm run verify
npm run build
npm run start
```

* Set production environment:

```env
NODE_ENV=production
PORT=3000
```

* Configure health checks against `/api/health`.
* Put process logs somewhere searchable.

### Operational Limits
Review these values before hosting:

```env
RESPONSE_ROW_LIMIT=250
MAX_QUERY_LENGTH=50000
DB_REQUEST_TIMEOUT_MS=120000
WRITE_PREVIEW_LIMIT=10
CONFIRMATION_TTL_MS=300000
POST_RATE_LIMIT_MAX=90
POST_RATE_LIMIT_WINDOW_MS=60000
```

Lower limits if many users will share the app.

### Flexibility Guidance
* For a small internal team, keep it simple: SSO/VPN, one dedicated service principal, shared saved connections, and persistent file-backed audit.
* For multiple teams, add real user identity, per-team saved connections, role-based write permissions, and centralized audit.
* For more source types, extend `SOURCE_DEFINITIONS` in `lib/server/source-config.js` instead of scattering source-specific conditions.
* For team-specific credentials, move from one global service principal to named credential profiles backed by Key Vault.
* For compliance-sensitive usage, move audit and confirmation records to durable append-only storage.

### Minimum Before Internal Hosting
1. Rotate exposed Azure client secrets.
2. Put the app behind Entra ID SSO, VPN, or an authenticated reverse proxy.
3. Add or confirm a real authentication layer.
4. Use a dedicated least-privilege service principal.
5. Move `.env` secrets to platform secrets.
6. Put audit and saved-connection files on persistent private storage.
7. Decide whether writes and procedures should be enabled online.
8. Run `npm run verify` before deployment.
