import { NextResponse } from 'next/server';
import { isLocalLifecycleRequest, requestShutdown } from '../../../../lib/server/lifecycle-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!isLocalLifecycleRequest(req)) {
    return NextResponse.json({ success: false, error: 'Lifecycle endpoint is local-only.' }, { status: 403 });
  }

  const status = requestShutdown('Exit Data Workbench requested from browser.');
  return NextResponse.json({
    success: true,
    message: 'Data Workbench server is shutting down.',
    lifecycle: status
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
