# Data Workbench Production Release Checklist

Use this checklist before a major production release.

## Automated Gate

- Run `npm run verify:release`.
- Confirm `npm audit --omit=dev` reports zero vulnerabilities.
- Confirm responsive audit screenshots in `responsive-audit/` do not show clipped controls, unreadable text, or unclear clickable/editable areas.
- Confirm no local runtime files are committed: `.env`, audit logs, `.data/`, `data/`, saved connection stores, or pending confirmation stores.

## Manual Non-Production Live Gate

- Start the app through the production launcher.
- Validate a Fabric SQL endpoint profile:
  - test connection
  - load catalog
  - select a table and view
  - preview rows
  - load CREATE and ALTER/Edit scripts
  - run a safe `SELECT`
  - confirm write preview modal appears for CREATE/ALTER or write SQL
- Validate a Fabric Lakehouse SQL endpoint profile:
  - test connection
  - load catalog
  - load table/view scripts where supported
  - run a safe `SELECT`
- Validate a SQL Server profile:
  - SQL login mode
  - service principal mode if used in the environment
  - trust certificate toggle behavior
  - saved profile create/delete without saving passwords
- Validate Procedure Runner against a non-production stored procedure:
  - load procedure catalog
  - load parameters
  - run with confirmation
  - inspect output rows, output parameters, return value, and audit entries
- Validate operational behavior:
  - audit viewer filters
  - result tabs cap and restore behavior
  - JSON result formatting
  - context menu copy value/row actions
  - side panels auto-hide and manual show/hide
  - `Exit Data Workbench` shuts down the local server in the packaged local workflow

## Optional Live Smoke

`npm run verify:live` is opt-in and must only target non-production sources.

Required environment variables:

- `DATA_WORKBENCH_LIVE_TESTS=true`
- `LIVE_TEST_CONFIRM_NON_PRODUCTION=YES_I_UNDERSTAND`
- `LIVE_TEST_SOURCE_TYPE`
- `LIVE_TEST_AUTH_MODE`
- `LIVE_TEST_SERVER`
- `LIVE_TEST_DATABASE`
- SQL login only: `LIVE_TEST_USERNAME`, `LIVE_TEST_PASSWORD`
- service principal only: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
