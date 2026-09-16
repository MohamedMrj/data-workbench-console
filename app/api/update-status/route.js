import { NextResponse } from 'next/server';
import { isLocalLifecycleRequest } from '../../../lib/server/lifecycle-store';
import { readUpdateStatus } from '../../../lib/server/update-status-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!isLocalLifecycleRequest(req)) {
    return NextResponse.json({ success: false, error: 'Update status endpoint is local-only.' }, { status: 403 });
  }

  const status = await readUpdateStatus(process.cwd());

  return NextResponse.json({ success: true, status }, { headers: { 'Cache-Control': 'no-store' } });
}
