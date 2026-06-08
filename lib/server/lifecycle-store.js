const DEFAULT_HEARTBEAT_GRACE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_SHUTDOWN_DELAY_MS = 2_500;

const HEARTBEAT_GRACE_MS = Number(process.env.APP_HEARTBEAT_GRACE_MS || DEFAULT_HEARTBEAT_GRACE_MS);
const SHUTDOWN_DELAY_MS = Number(process.env.APP_SHUTDOWN_DELAY_MS || DEFAULT_SHUTDOWN_DELAY_MS);
const SHUTDOWN_ENABLED = !/^false$/i.test(String(process.env.APP_LOCAL_SHUTDOWN_ENABLED || 'true'));

const globalKey = '__dataWorkbenchLifecycleStore';

function getStore() {
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = {
      sessions: new Map(),
      watchdogTimer: null,
      shutdownTimer: null,
      shutdownRequested: false,
      shutdownReason: ''
    };
  }
  return globalThis[globalKey];
}

function now() {
  return Date.now();
}

function normalizeSessionId(value = '') {
  const sessionId = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{12,80}$/.test(sessionId) ? sessionId : '';
}

function pruneExpiredSessions(store, timestamp = now()) {
  for (const [sessionId, session] of store.sessions.entries()) {
    if (session.closed || timestamp - session.lastSeenAt > HEARTBEAT_GRACE_MS) {
      store.sessions.delete(sessionId);
    }
  }
}

function activeSessionCount(store = getStore(), timestamp = now()) {
  pruneExpiredSessions(store, timestamp);
  return store.sessions.size;
}

function scheduleProcessExit(store, reason) {
  if (!SHUTDOWN_ENABLED || store.shutdownRequested || process.env.NODE_ENV === 'development') {
    return;
  }

  store.shutdownRequested = true;
  store.shutdownReason = reason;
  store.shutdownTimer = setTimeout(() => {
    process.exit(0);
  }, SHUTDOWN_DELAY_MS);
}

function scheduleWatchdog(store = getStore()) {
  if (store.watchdogTimer) {
    clearTimeout(store.watchdogTimer);
    store.watchdogTimer = null;
  }

  store.watchdogTimer = setTimeout(() => {
    if (activeSessionCount(store) === 0) {
      scheduleProcessExit(store, 'No active browser sessions.');
      return;
    }

    scheduleWatchdog(store);
  }, HEARTBEAT_GRACE_MS + 1_000);
}

export function isLocalLifecycleRequest(req) {
  const url = new URL(req.url);
  const hostHeader = req.headers.get('host') || '';
  const host = hostHeader.split(':')[0].toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  return localHosts.has(hostname) && (!host || localHosts.has(host));
}

export function recordHeartbeat(input = {}) {
  const store = getStore();
  const timestamp = now();
  const sessionId = normalizeSessionId(input.sessionId);

  if (!sessionId) {
    return {
      ok: false,
      error: 'Invalid lifecycle session id.'
    };
  }

  if (input.event === 'close') {
    store.sessions.delete(sessionId);
  } else {
    store.sessions.set(sessionId, {
      lastSeenAt: timestamp,
      userAgent: String(input.userAgent || '').slice(0, 300),
      closed: false
    });
  }

  if (!store.shutdownRequested) {
    scheduleWatchdog(store);
  }

  return {
    ok: true,
    sessionId,
    activeSessions: activeSessionCount(store, timestamp),
    graceMs: HEARTBEAT_GRACE_MS
  };
}

export function requestShutdown(reason = 'User requested shutdown.') {
  const store = getStore();
  store.sessions.clear();
  scheduleProcessExit(store, reason);
  return lifecycleStatus();
}

export function lifecycleStatus() {
  const store = getStore();
  const timestamp = now();
  return {
    activeSessions: activeSessionCount(store, timestamp),
    graceMs: HEARTBEAT_GRACE_MS,
    shutdownEnabled: SHUTDOWN_ENABLED,
    shutdownRequested: store.shutdownRequested,
    shutdownReason: store.shutdownReason,
    environment: process.env.NODE_ENV || '',
    pid: process.pid
  };
}
