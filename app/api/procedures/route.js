import { ensureInitialized, getProcedures, postProcedures } from '../../../lib/server/db-interface';
import { runHandler } from '../../../lib/server/next-handler';

async function postDispatcher(req, res) {
  if (Object.hasOwn(req.body || {}, 'procedure') || req.body?.confirmToken) {
    return postProcedures(req, res);
  }
  return getProcedures(req, res);
}

export async function GET(req) {
  await ensureInitialized();
  return runHandler(getProcedures, req);
}

export async function POST(req) {
  await ensureInitialized();
  return runHandler(postDispatcher, req);
}
