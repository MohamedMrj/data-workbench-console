import fs from 'fs/promises';
import path from 'path';

function statusFilePath(projectDir) {
  return path.join(projectDir, '.data', 'update-status.json');
}

// apply-update.ps1 stops the running server and only writes its own
// success/failed outcome once git/npm/build finish (or fail). Written here,
// before the updater is even launched, so the API and the client have a
// definite state to read instead of stale leftovers from a previous run.
export async function writeUpdateStatusPending(projectDir) {
  const filePath = statusFilePath(projectDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ outcome: 'pending', startedAt: Date.now() }), 'utf8');
}

export async function readUpdateStatus(projectDir) {
  try {
    const text = await fs.readFile(statusFilePath(projectDir), 'utf8');
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
