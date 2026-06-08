import { NextResponse } from 'next/server';
import { isLocalLifecycleRequest, lifecycleStatus } from '../../../../lib/server/lifecycle-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!isLocalLifecycleRequest(req)) {
    return NextResponse.json({ success: false, error: 'Lifecycle endpoint is local-only.' }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    lifecycle: lifecycleStatus()
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
