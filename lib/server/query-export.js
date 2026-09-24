/**
 * query-export.js
 *
 * Streams a read query's full result to the browser as CSV or JSON, so an export is not
 * limited to the rows the grid loaded. Rows are written as they arrive and the database
 * request is paused while the browser catches up, so memory stays flat however large the
 * result is.
 */

import { NO_RUN } from './run-registry.js';

const CHUNK_BYTES = 64 * 1024;

function serializeExportValue(value) {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `0x${value.toString('hex').toUpperCase()}`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function jsonExportValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `0x${value.toString('hex').toUpperCase()}`;
  if (typeof value === 'bigint') return value.toString();
  return value === undefined ? null : value;
}

/**
 * Server copy of the client's csvCell (public/console-core.js).
 *
 * SQL NULL is written as NULL so it stays distinct from an empty string. A cell starting
 * with = + - @ tab or CR is prefixed with ' so a spreadsheet does not run it as a formula
 * (CSV injection), unless it is a plain number such as -5.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function csvCell(value) {
  let text = serializeExportValue(value);
  const startsDangerous = /^[=+\-@\t\r]/.test(text);
  const isPlainNumber = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text);
  if (startsDangerous && !isPlainNumber) {
    text = `'${text}`;
  }
  return /["\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Blank and repeated column names (`SELECT 1, 1`, joins with two `Id`s) would collide as
 * JSON keys and be ambiguous CSV headers, so they get a stable suffix.
 *
 * @param {string[]} names
 * @returns {string[]}
 */
export function dedupeColumnNames(names) {
  const seen = new Map();
  return (Array.isArray(names) ? names : []).map((raw, index) => {
    const base = String(raw || '').trim() || `column_${index + 1}`;
    const key = base.toLowerCase();
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

export function exportFileName(format, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `data-workbench-export-${stamp}.${format === 'json' ? 'json' : 'csv'}`;
}

/**
 * Start streaming `sql` through `pool`. Resolves once the first result metadata arrives
 * (so SQL and connection errors can still be answered as normal JSON), with a
 * ReadableStream of the file and a `finished` promise that settles when the database
 * request is done: `{ rowCount, truncated, cancelled, error }`.
 *
 * @param {object} options
 * @param {object} options.pool an mssql ConnectionPool (or a test double)
 * @param {string} options.sql the already row-capped read query
 * @param {'csv'|'json'} options.format
 * @param {number} options.rowLimit rows to write before stopping and marking `truncated`
 * @param {number} [options.timeoutMs]
 * @param {object} [options.runHandle]
 * @param {AbortSignal} [options.signal] the browser request's signal
 */
export function startQueryExport({ pool, sql, format, rowLimit, timeoutMs, runHandle = NO_RUN, signal }) {
  const encoder = new TextEncoder();
  const stats = { rowCount: 0, truncated: false, cancelled: false, error: null };
  const request = pool.request(Number.isFinite(timeoutMs) ? { requestTimeout: timeoutMs } : undefined);
  request.stream = true;
  request.arrayRowMode = true;

  let controller = null;
  // Set once the browser has closed the download; the controller rejects any further writes.
  let streamClosed = false;
  let buffer = '';
  let columns = [];
  let recordsetIndex = -1;
  let rowsInRecordset = 0;
  let started = false;
  let settled = false;
  let resolveReady;
  let rejectReady;
  let resolveFinished;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const finished = new Promise((resolve) => {
    resolveFinished = resolve;
  });

  const flush = (force = false) => {
    if (!controller || streamClosed || !buffer || (!force && buffer.length < CHUNK_BYTES)) return;
    controller.enqueue(encoder.encode(buffer));
    buffer = '';
    // Back-pressure: stop reading rows until the browser has taken what is queued.
    if (controller.desiredSize !== null && controller.desiredSize <= 0) {
      request.pause();
    }
  };

  const stop = () => {
    try {
      request.cancel();
    } catch {
      // Already finished.
    }
  };

  const finish = (error = null) => {
    if (settled) return;
    settled = true;
    if (error && !stats.truncated && !stats.cancelled) {
      stats.error = error;
    }
    if (!started) {
      started = true;
      rejectReady(error || new Error('The export returned no result.'));
      resolveFinished(stats);
      return;
    }
    if (stats.error) {
      // Erroring the stream makes the browser's download fail visibly instead of saving a
      // file that silently ends halfway through.
      if (!streamClosed) controller?.error(stats.error);
      resolveFinished(stats);
      return;
    }
    if (format === 'json') {
      // Closes the last recordset's rows and the recordsets array. `truncated` is written last
      // because it is only known once the stream has ended.
      buffer += `]}],"rowCount":${stats.rowCount},"truncated":${stats.truncated}}\n`;
    }
    flush(true);
    try {
      if (!streamClosed) controller?.close();
    } catch {
      // The browser already went away.
    }
    resolveFinished(stats);
  };

  const stream = new ReadableStream({
    start(streamController) {
      controller = streamController;
    },
    pull() {
      request.resume();
    },
    cancel() {
      // The browser closed the download (or the user cancelled it).
      streamClosed = true;
      stats.cancelled = true;
      stop();
    }
  }, { highWaterMark: 4 });

  const beginRecordset = (metadata) => {
    const names = dedupeColumnNames((Array.isArray(metadata) ? metadata : Object.values(metadata || {})).map((column) => column?.name));
    columns = names;
    recordsetIndex += 1;
    rowsInRecordset = 0;
    if (format === 'json') {
      buffer += `${recordsetIndex === 0 ? '{"recordsets":[' : ']},'}{"columns":${JSON.stringify(names)},"rows":[`;
    } else {
      buffer += `${recordsetIndex === 0 ? '' : '\r\n'}${names.map(csvCell).join(',')}\r\n`;
    }
    if (!started) {
      started = true;
      resolveReady({ stream, finished });
    }
  };

  request.on('recordset', beginRecordset);
  request.on('row', (row) => {
    if (settled) return;
    if (stats.rowCount >= rowLimit) {
      // The SQL was capped at rowLimit + 1, but some shapes (ORDER BY with a user TOP,
      // FETCH, FOR XML) cannot be capped in SQL, so the server enforces the limit itself.
      stats.truncated = true;
      stop();
      return;
    }
    const values = Array.isArray(row) ? row : columns.map((name) => row?.[name]);
    if (format === 'json') {
      const record = {};
      columns.forEach((name, index) => {
        record[name] = jsonExportValue(values[index]);
      });
      buffer += `${rowsInRecordset ? ',' : ''}${JSON.stringify(record)}`;
    } else {
      buffer += `${columns.map((_, index) => csvCell(values[index])).join(',')}\r\n`;
    }
    rowsInRecordset += 1;
    stats.rowCount += 1;
    flush();
  });
  request.on('error', (error) => {
    if (stats.truncated || stats.cancelled || runHandle.cancelRequested) {
      stats.cancelled = stats.cancelled || runHandle.cancelRequested;
      return;
    }
    finish(error);
  });
  request.on('done', () => {
    if (!started) {
      // A statement that returned no result set at all: still a valid (empty) file.
      beginRecordset([]);
    }
    stats.cancelled = stats.cancelled || (runHandle.cancelRequested && !stats.truncated);
    finish(null);
  });

  const onAbort = () => {
    stats.cancelled = true;
    stop();
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  runHandle.attach(request);
  try {
    runHandle.throwIfCancelled('The export was cancelled.');
    // In stream mode mssql reports failures through the 'error' event and still resolves
    // the promise, so the events above drive everything; this catch is only a backstop.
    Promise.resolve(request.query(String(sql))).catch((error) => finish(error));
  } catch (error) {
    finish(error);
  }

  finished.finally(() => signal?.removeEventListener?.('abort', onAbort));
  return { ready, finished, stats };
}
