import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function runGit(args, options = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: options.timeout || 5000
    });
    return String(stdout || '').trim();
  } catch {
    return '';
  }
}

function shortCommit(commit = '') {
  return String(commit || '').slice(0, 7);
}

async function getBuildInfo() {
  const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
  try {
    const [buildId, stat] = await Promise.all([
      fs.readFile(buildIdPath, 'utf8'),
      fs.stat(buildIdPath)
    ]);
    return {
      id: buildId.trim(),
      builtAt: stat.mtime.toISOString()
    };
  } catch {
    return {
      id: '',
      builtAt: ''
    };
  }
}

// Computing this spawns several git child processes plus a network `ls-remote`.
// Cache the result for a short window and de-duplicate concurrent computations so
// rapid polling cannot turn this unauthenticated GET into a process/connection
// exhaustion vector.
const VERSION_CACHE_TTL_MS = Math.max(0, Number(process.env.VERSION_CACHE_TTL_MS || 30_000));
let versionCache = { expiresAt: 0, payload: null };
let versionInFlight = null;

async function computeVersionPayload() {
  const packageJson = await readJson(path.join(process.cwd(), 'package.json'));
  const [localCommit, branch, remoteCommit, build] = await Promise.all([
    runGit(['rev-parse', 'HEAD']),
    runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(['ls-remote', 'origin', 'refs/heads/main'], { timeout: 8000 }),
    getBuildInfo()
  ]);

  const latestCommit = remoteCommit.split(/\s+/)[0] || '';
  const updateAvailable = Boolean(localCommit && latestCommit && localCommit !== latestCommit);

  return {
    success: true,
    version: packageJson.version || '0.0.0',
    branch,
    localCommit,
    localCommitShort: shortCommit(localCommit),
    latestCommit,
    latestCommitShort: shortCommit(latestCommit),
    updateAvailable,
    updateCheckAvailable: Boolean(latestCommit),
    build
  };
}

export async function GET() {
  const now = Date.now();

  if (!(versionCache.payload && versionCache.expiresAt > now)) {
    if (!versionInFlight) {
      versionInFlight = computeVersionPayload()
        .then((payload) => {
          versionCache = { expiresAt: Date.now() + VERSION_CACHE_TTL_MS, payload };
          return payload;
        })
        .finally(() => {
          versionInFlight = null;
        });
    }
    await versionInFlight;
  }

  return NextResponse.json(versionCache.payload, {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
