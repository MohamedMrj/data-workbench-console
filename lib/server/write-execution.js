/**
 * write-execution.js
 *
 * Runs reads, rolled-back write previews and committed writes against an mssql pool.
 * Kept apart from db-interface.js so the transaction handling can be unit-tested with
 * fake pools, without a database.
 */

import { mapRecordset, sumRowsAffected } from './sql-metadata.js';
import { NO_RUN } from './run-registry.js';

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

export async function previewWrite(pool, query, { runHandle = NO_RUN } = {}) {
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
