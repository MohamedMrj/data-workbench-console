import { ensureInitialized, postQueryPlan } from '../../../lib/server/db-interface';
import { runHandler } from '../../../lib/server/next-handler';

export async function POST(req) {
  await ensureInitialized();
  return runHandler(postQueryPlan, req);
}
