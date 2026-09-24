import { ensureInitialized, postQueryExport } from '../../../../lib/server/db-interface';
import { runHandler } from '../../../../lib/server/next-handler';

export const runtime = 'nodejs';

export async function POST(req) {
  await ensureInitialized();
  return runHandler(postQueryExport, req);
}
