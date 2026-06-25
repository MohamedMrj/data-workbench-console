import assert from 'assert/strict';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const failures = [];

async function exists(relativePath) {
  try {
    await fs.access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  failures.push(message);
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

async function gitLsFiles(patterns = []) {
  try {
    const { stdout } = await execFileAsync('git', ['ls-files', ...patterns], {
      cwd: root,
      windowsHide: true,
      timeout: 10_000
    });
    return stdout.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

const packageJson = await readJson('package.json');
const packageLock = await readJson('package-lock.json');

const nodeMajor = Number(process.versions.node.split('.')[0]);
const requiredMajor = Number(String(packageJson.engines?.node || '>=20').match(/\d+/)?.[0] || 20);
if (!Number.isFinite(nodeMajor) || nodeMajor < requiredMajor) {
  fail(`Node ${packageJson.engines?.node || '>=20'} is required; current is ${process.version}.`);
}

if (packageLock.packages?.['']?.version !== packageJson.version) {
  fail('package-lock root version does not match package.json version.');
}

for (const [name, range] of Object.entries(packageJson.dependencies || {})) {
  if (packageLock.packages?.['']?.dependencies?.[name] !== range) {
    fail(`package-lock root dependency mismatch for ${name}.`);
  }
}

const requiredFiles = [
  'package.json',
  'package-lock.json',
  'next.config.mjs',
  'Start Data Workbench.ps1',
  'Start Data Workbench.vbs',
  'launcher-loading.html',
  'app/page.js',
  'app/procedures/page.js',
  'scripts/apply-update.ps1',
  'public/launcher-ready.svg',
  'public/console-core.js',
  'public/console-app.js',
  'lib/server/db-interface.js',
  'scripts/smoke-test.mjs',
  'scripts/ui-smoke.mjs',
  'scripts/responsive-audit.mjs',
  'RELEASE_CHECKLIST.md'
];

for (const file of requiredFiles) {
  if (!await exists(file)) {
    fail(`Required release file is missing: ${file}`);
  }
}

const routeFiles = [
  'app/api/health/route.js',
  'app/api/env-settings/route.js',
  'app/api/version/route.js',
  'app/api/update/route.js',
  'app/api/query/route.js',
  'app/api/audit/route.js',
  'app/api/object-definition/route.js',
  'app/api/object-insights/route.js',
  'app/api/query-plan/route.js',
  'app/api/schema-compare/route.js',
  'app/api/saved-connections/route.js',
  'app/api/lifecycle/heartbeat/route.js',
  'app/api/lifecycle/status/route.js',
  'app/api/lifecycle/exit/route.js'
];

for (const file of routeFiles) {
  if (!await exists(file)) {
    fail(`Required API route is missing: ${file}`);
  }
}

const trackedSensitive = await gitLsFiles([
  '.env',
  '.env.local',
  'audit-log.ndjson',
  'data',
  '.data',
  'saved-connections.json',
  'pending-confirmations.json'
]);
if (trackedSensitive.length) {
  fail(`Release-sensitive local files are tracked by git: ${trackedSensitive.join(', ')}`);
}

const exampleEnv = await fs.readFile(path.join(root, '.env.example'), 'utf8');
assert.match(exampleEnv, /AZURE_CLIENT_ID=/);
assert.match(exampleEnv, /AUDIT_LOCAL_ONLY=true/);
if (/AZURE_CLIENT_SECRET=.+/i.test(exampleEnv)) {
  fail('.env.example appears to contain a populated AZURE_CLIENT_SECRET value.');
}

const verifyScript = packageJson.scripts?.['verify:release'] || '';
for (const expected of [
  'npm run clean',
  'npm run build',
  'scripts/server-unit.test.mjs',
  'scripts/route-contract.test.mjs',
  'scripts/ui-smoke.mjs',
  'responsive:audit',
  'npm audit --omit=dev'
]) {
  if (!verifyScript.includes(expected)) {
    fail(`verify:release is missing expected gate: ${expected}`);
  }
}

if (failures.length) {
  console.error(failures.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('Release diagnostics passed.');
