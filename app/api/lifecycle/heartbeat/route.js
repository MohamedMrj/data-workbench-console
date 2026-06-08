import { NextResponse } from 'next/server';
import { isLocalLifecycleRequest, recordHeartbeat } from '../../../../lib/server/lifecycle-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readPayload(req) {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return req.json();
  }

  const text = await req.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

export async function POST(req) {
  if (!isLocalLifecycleRequest(req)) {
    return NextResponse.json({ success: false, error: 'Lifecycle endpoint is local-only.' }, { status: 403 });
  }

  const payload = await readPayload(req);
  const result = recordHeartbeat({
    ...payload,
    userAgent: req.headers.get('user-agent') || ''
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...result }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
