import { NextResponse } from 'next/server';
import { getEnvSettings, updateEnvSettings } from '../../../lib/server/env-settings-store';
import { isLocalLifecycleRequest } from '../../../lib/server/lifecycle-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameOriginLocalWriteAllowed(req) {
  if (!isLocalLifecycleRequest(req)) {
    return { allowed: false, status: 403, error: 'Environment settings are local-only.' };
  }

  const url = new URL(req.url);
  const expectedOrigin = url.origin;
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  const matchesOrigin = (candidate) => {
    if (!candidate) {
      return false;
    }
    try {
      return new URL(candidate).origin === expectedOrigin;
    } catch {
      return false;
    }
  };

  if (origin || referer) {
    if (matchesOrigin(origin) || matchesOrigin(referer)) {
      return { allowed: true };
    }
    return { allowed: false, status: 403, error: 'Environment settings write blocked by origin check.' };
  }

  return { allowed: false, status: 403, error: 'Environment settings write requires a same-origin browser request.' };
}

export async function GET(req) {
  if (!isLocalLifecycleRequest(req)) {
    return NextResponse.json({ success: false, error: 'Environment settings are local-only.' }, { status: 403 });
  }

  try {
    return NextResponse.json({
      success: true,
      ...(await getEnvSettings())
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message || 'Could not read environment settings.' }, { status: 500 });
  }
}

export async function POST(req) {
  const guard = sameOriginLocalWriteAllowed(req);
  if (!guard.allowed) {
    return NextResponse.json({ success: false, error: guard.error }, { status: guard.status });
  }

  try {
    const body = await req.json();
    return NextResponse.json({
      success: true,
      ...(await updateEnvSettings(body))
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message || 'Could not update environment settings.' }, { status: 400 });
  }
}
