/**
 * run-registry.js
 *
 * In-memory registry of running queries so a second request can cancel one.
 * Runs are keyed by session and a client-generated run id: a session can only ever
 * see or cancel its own runs.
 */

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ACTIVE_RUNS = 64;

// Next bundles each route separately, so a module-level Map would give /api/query and
// /api/query/cancel different registries. A global symbol makes them share one.
const REGISTRY_KEY = Symbol.for('dataWorkbench.runRegistry');
const runs = globalThis[REGISTRY_KEY] || (globalThis[REGISTRY_KEY] = new Map());

function httpError(message, httpStatus, code = null) {
  const error = new Error(message);
  error.httpStatus = httpStatus;
  if (code) error.code = code;
  return error;
}

export function cancelledError(message = 'The query was cancelled.') {
  return httpError(message, 409, 'CANCELLED');
}

/**
 * @param {unknown} value
 * @returns {string} the lowercased UUID v4, or '' when the value is not one
 */
export function normalizeRunId(value) {
  const text = String(value || '').trim();
  return RUN_ID_PATTERN.test(text) ? text.toLowerCase() : '';
}

/**
 * Register a run. The handle attaches each mssql Request the run starts, so a cancel
 * can reach whichever statement is executing.
 *
 * @param {{ runId: string, sessionId: string, kind?: string }} options
 */
export function registerRun({ runId, sessionId, kind = 'query' }) {
  const key = `${sessionId}:${runId}`;
  if (runs.has(key)) {
    throw httpError('A run with this id is already in progress.', 409);
  }
  if (runs.size >= MAX_ACTIVE_RUNS) {
    throw httpError('Too many queries are running. Wait for one to finish.', 429);
  }

  const entry = { kind, sessionId, phase: 'running', cancelRequested: false, request: null, startedAt: Date.now() };
  runs.set(key, entry);

  return {
    get cancelRequested() {
      return entry.cancelRequested;
    },
    attach(request) {
      entry.request = request;
    },
    // mssql resets a Request's cancel flag when its query starts, so a cancel that lands
    // before then would be lost. Callers check this between attach() and query().
    throwIfCancelled(message) {
      if (entry.cancelRequested) {
        throw cancelledError(message);
      }
    },
    setPhase(phase) {
      entry.phase = phase;
    },
    release() {
      if (runs.get(key) === entry) {
        runs.delete(key);
      }
    }
  };
}

/**
 * @param {{ runId: string, sessionId: string }} options
 * @returns {{ found: boolean, cancelled: boolean, phase: string }}
 */
export function cancelRun({ runId, sessionId }) {
  const entry = runs.get(`${sessionId}:${runId}`);
  if (!entry) {
    return { found: false, cancelled: false, phase: '' };
  }
  // Once COMMIT has been sent, cancelling cannot undo the write; refusing is honest,
  // where accepting would suggest a rollback that is not going to happen.
  if (entry.phase === 'committing') {
    return { found: true, cancelled: false, phase: entry.phase };
  }
  entry.cancelRequested = true;
  try {
    entry.request?.cancel?.();
  } catch {
    // A request that already finished has nothing to cancel.
  }
  return { found: true, cancelled: true, phase: entry.phase };
}

export function countActiveRuns({ sessionId, kind } = {}) {
  let count = 0;
  for (const entry of runs.values()) {
    if ((!sessionId || entry.sessionId === sessionId) && (!kind || entry.kind === kind)) {
      count += 1;
    }
  }
  return count;
}

/**
 * True when an error came from a cancel: the driver's ECANCEL, an EABORT wrapping one
 * (a transaction aborted by the cancel), or any failure after a cancel was requested.
 */
export function isCancelError(error, handle = null) {
  const code = error?.code;
  const originalCode = error?.originalError?.code || error?.originalError?.originalError?.code;
  return code === 'CANCELLED' || code === 'ECANCEL' || originalCode === 'ECANCEL' || Boolean(handle?.cancelRequested);
}

/**
 * A handle for callers that did not send a run id: attaching and phases are no-ops and
 * nothing is ever cancelled.
 */
export const NO_RUN = Object.freeze({
  cancelRequested: false,
  attach() {},
  throwIfCancelled() {},
  setPhase() {},
  release() {}
});
