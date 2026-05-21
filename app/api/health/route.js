import { ensureInitialized, getHealth } from '../../../lib/server/db-interface';
import { runHandler } from '../../../lib/server/next-handler';

export async function GET(req) {
  await ensureInitialized();
  return runHandler(getHealth, req);
}
