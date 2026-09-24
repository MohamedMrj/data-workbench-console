/**
 * write-execution.js
 *
 * Runs reads, rolled-back write previews and committed writes against an mssql pool.
 * Kept apart from db-interface.js so the transaction handling can be unit-tested with
 * fake pools, without a database.
 */

import { mapRecordset, sumRowsAffected } from './sql-metadata.js';
import { NO_RUN, isCancelError } from './run-registry.js';
import { buildPreviewOutputQuery } from './sql-classifier.js';
import { dedupeColumnNames, jsonExportValue } from './query-export.js';

async function rollbackQuietly(transaction) {
  try {
    await transaction.rollback();
    return true;
  } catch (error) {
    // EABORT means SQL Server already rolled the transaction back (for example after
    // a cancel), which is the outcome we wanted.
    return error?.code === 'EABORT';
  }
}

async function runAttached(request, sql, runHandle, cancelMessage) {
  runHandle.attach(request);
  runHandle.throwIfCancelled(cancelMessage);
  return request.query(String(sql));
}

export async function runRead(pool, sql, { runHandle = NO_RUN } = {}) {
  const result = await runAttached(pool.request(), sql, runHandle, 'The query was cancelled.');
  runHandle.setPhase('done');
  return result;
}

async function previewRowCount(pool, query, runHandle) {
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const result = await runAttached(transaction.request(), query, runHandle, 'The preview was cancelled.');
    const rowsAffected = sumRowsAffected(result);
    await transaction.rollback();
    return { rowsAffected };
  } catch (error) {
    const rolledBack = await rollbackQuietly(transaction);
    error.rolledBack = rolledBack;
    throw error;
  }
}

// Streams the OUTPUT rows, keeping only the first `sampleLimit`: a preview of an UPDATE that
// touches a million rows must not pull a million rows into memory just to show ten.
function streamOutputSample(request, sql, sampleLimit) {
  return new Promise((resolve, reject) => {
    request.stream = true;
    request.arrayRowMode = true;
    let columns = [];
    const rows = [];
    let outputRows = 0;
    let rowsAffected = 0;
    let failure = null;
    request.on('recordset', (metadata) => {
      columns = (Array.isArray(metadata) ? metadata : Object.values(metadata || {})).map((column) => column?.name);
    });
    request.on('row', (row) => {
      outputRows += 1;
      if (rows.length < sampleLimit) {
        rows.push(Array.isArray(row) ? row : columns.map((name) => row?.[name]));
      }
    });
    request.on('rowsaffected', (count) => {
      rowsAffected += Number(count || 0);
    });
    request.on('error', (error) => {
      failure = failure || error;
    });
    request.on('done', () => (failure ? reject(failure) : resolve({ columns, rows, outputRows, rowsAffected })));
    Promise.resolve(request.query(String(sql))).catch((error) => reject(failure || error));
  });
}

function shapeSample(mode, sample, sampleLimit) {
  const names = dedupeColumnNames(sample.columns);
  const toRecord = (keys, values) => keys.reduce((record, key, index) => {
    record[key] = jsonExportValue(values[index]);
    return record;
  }, {});
  if (mode === 'update') {
    // OUTPUT deleted.*, inserted.* returns the table's columns twice, before then after.
    const half = Math.floor(sample.columns.length / 2);
    const baseNames = dedupeColumnNames(sample.columns.slice(0, half));
    return {
      mode,
      columns: baseNames,
      rows: sample.rows.map((values) => ({
        before: toRecord(baseNames, values.slice(0, half)),
        after: toRecord(baseNames, values.slice(half))
      })),
      totalRows: sample.outputRows,
      truncated: sample.outputRows > sampleLimit
    };
  }
  return {
    mode,
    columns: names,
    rows: sample.rows.map((values) => toRecord(names, values)),
    totalRows: sample.outputRows,
    truncated: sample.outputRows > sampleLimit
  };
}

/**
 * Preview a write inside a transaction that is always rolled back.
 *
 * When the source supports it, the statement is first run with an OUTPUT clause added (see
 * buildPreviewOutputQuery) so the preview can show sample before/after rows. That can fail for
 * reasons unrelated to the write itself — a table with triggers rejects OUTPUT without INTO,
 * text/ntext columns cannot be output, OUTPUT needs SELECT permission — so on any such failure
 * the original statement is previewed again for its row count alone. Cancels and timeouts are
 * not retried. The sample is only ever returned to the browser; it is never stored.
 *
 * @returns {Promise<{ rowsAffected: number, sample?: object | null, sampleUnavailable?: string }>}
 */
export async function previewWrite(pool, query, { runHandle = NO_RUN, sampleLimit = 0, outputPreview = false } = {}) {
  const rewrite = outputPreview && sampleLimit > 0 ? buildPreviewOutputQuery(query) : null;
  if (!rewrite) {
    return previewRowCount(pool, query, runHandle);
  }

  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const request = transaction.request();
    runHandle.attach(request);
    runHandle.throwIfCancelled('The preview was cancelled.');
    const sample = await streamOutputSample(request, rewrite.text, sampleLimit);
    await transaction.rollback();
    return {
      // Never undercount: this number decides whether a typed phrase is required.
      rowsAffected: Math.max(sample.rowsAffected, sample.outputRows),
      sample: shapeSample(rewrite.mode, sample, sampleLimit)
    };
  } catch (error) {
    const rolledBack = await rollbackQuietly(transaction);
    if (!rolledBack || isCancelError(error, runHandle) || error?.code === 'ETIMEOUT') {
      error.rolledBack = rolledBack;
      throw error;
    }
    const counted = await previewRowCount(pool, query, runHandle);
    return { ...counted, sample: null, sampleUnavailable: 'Sample rows are not available for this statement; the row count comes from a normal preview.' };
  }
}

export async function executeWrite(pool, query, { rowLimit = 250, runHandle = NO_RUN } = {}) {
  const transaction = pool.transaction();
  let committed = false;
  await transaction.begin();
  try {
    const result = await runAttached(transaction.request(), query, runHandle, 'The write was cancelled before it ran.');
    // A cancel can arrive after the statement finished but before COMMIT. Honour it: the
    // user asked for the write not to happen, and nothing is permanent until the commit.
    runHandle.throwIfCancelled('The write was cancelled and rolled back.');
    const rowsAffected = sumRowsAffected(result);
    runHandle.setPhase('committing');
    await transaction.commit();
    committed = true;
    return {
      ...mapRecordset(result, rowLimit),
      rowsAffected
    };
  } catch (error) {
    if (!committed) {
      error.rolledBack = await rollbackQuietly(transaction);
    }
    throw error;
  }
}
