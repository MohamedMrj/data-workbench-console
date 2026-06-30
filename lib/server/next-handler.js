import crypto from 'crypto';
import { NextResponse } from 'next/server.js';
import { checkRateLimit } from './rate-limit.js';

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'dwb_session';
const SESSION_COOKIE_TTL_SECONDS = Number(process.env.SESSION_COOKIE_TTL_SECONDS || 60 * 60 * 8);
const ALLOW_LOCAL_MISSING_ORIGIN = !/^false$/i.test(String(process.env.ALLOW_LOCAL_MISSING_ORIGIN || 'true'));
// X-Forwarded-For / X-Real-IP are client-controlled. Only honor them when this
// app is deliberately deployed behind a trusted reverse proxy; otherwise a
// spoofed header would let each request land in a fresh rate-limit bucket
// (defeating the limit and growing the bucket map without bound).
const TRUST_PROXY_HEADERS = /^true$/i.test(String(process.env.TRUST_PROXY_HEADERS || 'false'));
const POST_RATE_LIMIT_MAX = Number(process.env.POST_RATE_LIMIT_MAX || 90);
const POST_RATE_LIMIT_WINDOW_MS = Number(process.env.POST_RATE_LIMIT_WINDOW_MS || 60_000);

function parseCookies(headerValue = '') {
  return String(headerValue)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) {
        return acc;
      }
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function isLoopbackHostname(hostname = '') {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(hostname || '').toLowerCase());
}

function buildRequestContext(req) {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const headers = Object.fromEntries(req.headers.entries());
  const cookies = parseCookies(req.headers.get('cookie') || '');
  const forwardedFor = TRUST_PROXY_HEADERS ? (req.headers.get('x-forwarded-for') || '') : '';
  const clientIp = (TRUST_PROXY_HEADERS
    && (forwardedFor.split(',')[0]?.trim() || req.headers.get('x-real-ip')))
    || 'local';
  const existingSessionId = /^[a-f0-9-]{16,}$/i.test(cookies[SESSION_COOKIE_NAME] || '')
    ? cookies[SESSION_COOKIE_NAME]
    : '';
  const sessionId = existingSessionId || crypto.randomUUID();
  const sameOriginInfo = validateSameOrigin(req, url);

  return {
    url,
    query,
    headers,
    cookies,
    clientIp,
    sessionId,
    newSessionIssued: !existingSessionId,
    sameOriginInfo
  };
}

function validateSameOrigin(req, url) {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const expectedOrigin = url.origin;
  const loopback = isLoopbackHostname(url.hostname);

  const compareOrigin = (candidate) => {
    if (!candidate) {
      return false;
    }
    try {
      return new URL(candidate).origin === expectedOrigin;
    } catch {
      return false;
    }
  };

  if (origin) {
    return {
      allowed: compareOrigin(origin),
      reason: compareOrigin(origin) ? '' : 'Origin mismatch.'
    };
  }

  if (referer) {
    return {
      allowed: compareOrigin(referer),
      reason: compareOrigin(referer) ? '' : 'Referer mismatch.'
    };
  }

  if (loopback && ALLOW_LOCAL_MISSING_ORIGIN) {
    return { allowed: true, reason: '' };
  }

  return {
    allowed: false,
    reason: 'Missing origin or referer header for non-local write request.'
  };
}

async function parseBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return {};
  }
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function runHandler(handler, req, { params } = {}) {
  const context = buildRequestContext(req);
  const body = await parseBody(req);

  if (!['GET', 'HEAD'].includes(req.method)) {
    if (!context.sameOriginInfo.allowed) {
      return finalizeResponse({ success: false, error: context.sameOriginInfo.reason || 'Cross-site request blocked.' }, 403, context, {
        'Cache-Control': 'no-store'
      });
    }

    const rateKey = `${context.clientIp}:${req.method}:${context.url.pathname}`;
    const rateLimit = checkRateLimit(rateKey, {
      maxRequests: POST_RATE_LIMIT_MAX,
      windowMs: POST_RATE_LIMIT_WINDOW_MS
    });
    if (!rateLimit.allowed) {
      return finalizeResponse({ success: false, error: 'Too many requests. Try again shortly.' }, 429, context, {
        'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        'Cache-Control': 'no-store'
      });
    }
  }

  let statusCode = 200;
  let payload = null;
  let extraHeaders = {};

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      extraHeaders[name] = value;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    }
  };

  try {
    await handler({
      query: context.query,
      body,
      params,
      method: req.method,
      url: req.url,
      headers: context.headers,
      cookies: context.cookies,
      sessionId: context.sessionId,
      clientIp: context.clientIp
    }, res);
    return finalizeResponse(payload ?? {}, statusCode, context, extraHeaders);
  } catch (error) {
    const status = Number(error?.httpStatus || 500);
    return finalizeResponse({
      success: false,
      error: error?.message || 'Unexpected server error.',
      code: error?.code || null
    }, status, context, {
      ...extraHeaders,
      'Cache-Control': 'no-store'
    });
  }
}

function finalizeResponse(payload, statusCode, context, extraHeaders = {}) {
  const response = NextResponse.json(payload ?? {}, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });

  if (context?.newSessionIssued) {
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: context.sessionId,
      httpOnly: true,
      sameSite: 'strict',
      secure: context.url.protocol === 'https:',
      maxAge: SESSION_COOKIE_TTL_SECONDS,
      path: '/'
    });
  }

  return response;
}

export function isLoopbackRequestUrl(urlString) {
  return isLoopbackHostname(new URL(urlString).hostname);
}
