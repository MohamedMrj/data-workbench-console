import { deleteSavedConnections, ensureInitialized, getSavedConnections, postSavedConnections } from '../../../lib/server/db-interface';
import { runHandler } from '../../../lib/server/next-handler';

export async function GET(req) {
  await ensureInitialized();
  return runHandler(getSavedConnections, req);
}

export async function POST(req) {
  await ensureInitialized();
  return runHandler(postSavedConnections, req);
}

export async function DELETE(req) {
  await ensureInitialized();
  return runHandler(deleteSavedConnections, req);
}
