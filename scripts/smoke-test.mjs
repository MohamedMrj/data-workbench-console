import { spawn } from 'child_process';
import path from 'path';
import process from 'process';
import { setTimeout as delay } from 'timers/promises';

const port = 3100;
const cwd = process.cwd();
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');

function fail(message) {
  throw new Error(message);
}

async function waitFor(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // Wait for the Next server to become available.
    }
    await delay(1000);
  }

  fail(`Timed out waiting for ${url}`);
}

const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
  cwd,
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) }
});

try {
  const healthResponse = await waitFor(`http://127.0.0.1:${port}/api/health`);
  const health = await healthResponse.json();
  if (!health.ok) {
    fail('Health endpoint did not return ok=true.');
  }

  const pageResponse = await fetch(`http://127.0.0.1:${port}/`);
  if (!pageResponse.ok) {
    fail(`Page request failed with status ${pageResponse.status}.`);
  }

  const blockedResponse = await fetch(`http://127.0.0.1:${port}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      server: 'demo',
      database: 'meta_store',
      query: 'SELECT 1; SELECT 2'
    })
  });
  const blockedPayload = await blockedResponse.json();
  if (blockedResponse.status !== 400) {
    fail(`Expected blocked query status 400, received ${blockedResponse.status}.`);
  }
  if (!/blocked|only one/i.test(blockedPayload.error || '')) {
    fail(`Blocked query did not return the expected error message. Received: ${blockedPayload.error}`);
  }

  const auditResponse = await fetch(`http://127.0.0.1:${port}/api/audit?limit=5`);
  const audit = await auditResponse.json();
  if (!Array.isArray(audit.entries)) {
    fail('Audit endpoint did not return an entries array.');
  }
  if (!audit.entries.some((entry) => entry?.event === 'query' && entry?.outcome === 'blocked')) {
    fail('Audit endpoint did not include the blocked query event.');
  }

  console.log('Smoke test passed.');
} finally {
  child.kill();
}
