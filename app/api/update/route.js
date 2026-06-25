import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { NextResponse } from 'next/server';
import { isLocalLifecycleRequest } from '../../../lib/server/lifecycle-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const SELF_UPDATE_ENABLED = !/^false$/i.test(String(process.env.APP_SELF_UPDATE_ENABLED || 'true'));

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runGit(args, options = {}) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: options.timeout || 8000
    });
    return String(stdout || '').trim();
  } catch {
    return '';
  }
}

function shortCommit(commit = '') {
  return String(commit || '').slice(0, 7);
}

export async function POST(req) {
  if (!isLocalLifecycleRequest(req)) {
    return NextResponse.json({ success: false, error: 'Update endpoint is local-only.' }, { status: 403 });
  }

  if (!SELF_UPDATE_ENABLED) {
    return NextResponse.json({ success: false, error: 'Self-update is disabled by APP_SELF_UPDATE_ENABLED=false.' }, { status: 403 });
  }

  const projectDir = process.cwd();
  const gitDir = path.join(projectDir, '.git');
  const updaterPath = path.join(projectDir, 'scripts', 'apply-update.ps1');

  if (!(await pathExists(gitDir))) {
    return NextResponse.json({
      success: false,
      error: 'This folder is not a Git checkout. Self-update requires installing the app with git clone instead of a zip download.'
    }, { status: 409 });
  }

  if (!(await pathExists(updaterPath))) {
    return NextResponse.json({ success: false, error: 'Update script is missing.' }, { status: 500 });
  }

  const [localCommit, remoteCommit] = await Promise.all([
    runGit(['rev-parse', 'HEAD']),
    runGit(['ls-remote', 'origin', 'refs/heads/main'], { timeout: 10_000 })
  ]);
  const latestCommit = remoteCommit.split(/\s+/)[0] || '';

  if (!localCommit || !latestCommit) {
    return NextResponse.json({
      success: false,
      error: 'Could not check the remote Git version. Confirm the repository has an origin remote and network access.'
    }, { status: 409 });
  }

  if (localCommit === latestCommit) {
    return NextResponse.json({
      success: true,
      updateStarted: false,
      message: 'Data Workbench is already current.',
      localCommit,
      localCommitShort: shortCommit(localCommit),
      latestCommit,
      latestCommitShort: shortCommit(latestCommit)
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const port = String(process.env.PORT || '3000');
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    updaterPath,
    '-ProjectDir',
    projectDir,
    '-Port',
    port,
    '-OldPid',
    String(process.pid)
  ], {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  child.unref();

  return NextResponse.json({
    success: true,
    updateStarted: true,
    message: 'Update started. Data Workbench will restart and the browser will reload when it is ready.',
    localCommit,
    localCommitShort: shortCommit(localCommit),
    latestCommit,
    latestCommitShort: shortCommit(latestCommit)
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
