import { spawn } from 'child_process';
import path from 'path';
import process from 'process';
import { setTimeout as delay } from 'timers/promises';
import { encode } from 'next-auth/jwt';

const port = 3101;
const cwd = process.cwd();
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
const secret = 'auth-smoke-test-secret-auth-smoke-test-secret';

function fail(message) {
  throw new Error(message);
}

async function waitFor(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 401 || response.status === 403 || response.ok) {
        return response;
      }
    } catch {
      // Wait for the Next server.
    }
    await delay(1000);
  }

  fail(`Timed out waiting for ${url}`);
}

async function sessionCookie(email) {
  const value = await encode({
    secret,
    token: {
      email,
      name: email
    },
    maxAge: 60 * 60
  });
  return `next-auth.session-token=${encodeURIComponent(value)}`;
}

const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
  cwd,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(port),
    AUTH_REQUIRED: 'true',
    AUTH_SECRET: secret,
    NEXTAUTH_SECRET: secret,
    ALLOWED_USER_EMAILS: 'allowed@example.com'
  }
});

try {
  const anonymous = await waitFor(`http://127.0.0.1:${port}/api/health`);
  if (anonymous.status !== 401) {
    fail(`Expected unauthenticated API request to return 401, received ${anonymous.status}.`);
  }

  const blocked = await fetch(`http://127.0.0.1:${port}/api/health`, {
    headers: {
      cookie: await sessionCookie('blocked@example.com')
    }
  });
  if (blocked.status !== 403) {
    fail(`Expected non-allowlisted API request to return 403, received ${blocked.status}.`);
  }

  const allowed = await fetch(`http://127.0.0.1:${port}/api/health`, {
    headers: {
      cookie: await sessionCookie('allowed@example.com')
    }
  });
  if (!allowed.ok) {
    fail(`Expected allowlisted API request to return 200, received ${allowed.status}.`);
  }

  console.log('Auth smoke test passed.');
} finally {
  child.kill();
}
