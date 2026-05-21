import { ensureInitialized, getColumns } from '../../../lib/server/db-interface';
import { runHandler } from '../../../lib/server/next-handler';

export async function GET(req) {
  await ensureInitialized();
  return runHandler(getColumns, req);
}

export async function POST(req) {
  await ensureInitialized();
  return runHandler(getColumns, req);
}
