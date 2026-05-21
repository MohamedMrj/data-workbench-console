import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getAuthSecret, isAuthRequired, isEmailAllowed } from './lib/server/live-config';

function isApiRequest(pathname) {
  return pathname.startsWith('/api/');
}

function authResponse(req, status, message) {
  if (isApiRequest(req.nextUrl.pathname)) {
    return NextResponse.json({ success: false, error: message }, { status });
  }

  if (status === 401) {
    const signInUrl = new URL('/api/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.redirect(new URL('/access-denied', req.url));
}

export async function middleware(req) {
  if (!isAuthRequired()) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: getAuthSecret()
  });

  if (!token?.email) {
    return authResponse(req, 401, 'Authentication required.');
  }

  if (!isEmailAllowed(token.email)) {
    return authResponse(req, 403, 'This account is not allowed to access Data Workbench Console.');
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|access-denied|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|map)$).*)'
  ]
};
