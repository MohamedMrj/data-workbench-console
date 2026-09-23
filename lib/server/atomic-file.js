import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export async function safeReplaceFile(tmpPath, finalPath) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rename(tmpPath, finalPath);
      return;
    } catch (error) {
      const isWindowsLockIssue =
        process.platform === 'win32' &&
        ['EPERM', 'EACCES'].includes(error?.code);

      const isMissingTmp =
        error?.code === 'ENOENT';

      if (isMissingTmp) {
        throw error;
      }

      if (isWindowsLockIssue && attempt < maxAttempts) {
        try {
          await fs.rm(finalPath, { force: true });
        } catch {
          // ignore
        }

        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
        continue;
      }

      throw error;
    }
  }
}

// Write-to-temp then rename, so a crash or a concurrent reader never sees a half-written
// file. A torn JSON store reads back as empty, which for saved profiles silently loses them.
export async function writeFileAtomic(finalPath, text) {
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpPath, text, 'utf8');
    await safeReplaceFile(tmpPath, finalPath);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
}
