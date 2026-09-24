import { deleteSavedQueries, ensureInitialized, getSavedQueries, postSavedQueries } from '../../../lib/server/db-interface';
import { runHandler } from '../../../lib/server/next-handler';

export async function GET(req) {
  await ensureInitialized();
  return runHandler(getSavedQueries, req);
}

export async function POST(req) {
  await ensureInitialized();
  return runHandler(postSavedQueries, req);
}

export async function DELETE(req) {
  await ensureInitialized();
  return runHandler(deleteSavedQueries, req);
}
