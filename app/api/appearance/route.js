import { deleteAppearanceSettings, ensureInitialized, getAppearanceSettings, postAppearanceSettings } from '../../../lib/server/db-interface';
import { runHandler } from '../../../lib/server/next-handler';

export async function GET(req) {
  await ensureInitialized();
  return runHandler(getAppearanceSettings, req);
}

export async function POST(req) {
  await ensureInitialized();
  return runHandler(postAppearanceSettings, req);
}

export async function DELETE(req) {
  await ensureInitialized();
  return runHandler(deleteAppearanceSettings, req);
}
