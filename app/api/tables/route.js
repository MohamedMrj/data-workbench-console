import { ensureInitialized, getTables } from '../../../lib/server/db-interface';
import { runHandler } from '../../../lib/server/next-handler';

export async function GET(req) {
  await ensureInitialized();
  return runHandler(getTables, req);
}

export async function POST(req) {
  await ensureInitialized();
  return runHandler(getTables, req);
}
