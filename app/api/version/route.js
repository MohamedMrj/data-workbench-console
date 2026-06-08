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

export async function GET() {
  const packageJson = await readJson(path.join(process.cwd(), 'package.json'));
  const [localCommit, branch, remoteCommit, build] = await Promise.all([
    runGit(['rev-parse', 'HEAD']),
    runGit(['rev-parse', '--abbrev-ref', 'HEAD']),
    runGit(['ls-remote', 'origin', 'refs/heads/main'], { timeout: 8000 }),
    getBuildInfo()
  ]);

  const latestCommit = remoteCommit.split(/\s+/)[0] || '';
  const updateAvailable = Boolean(localCommit && latestCommit && localCommit !== latestCommit);

  return NextResponse.json({
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
  }, {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
