/**
 * write-acknowledgement.js
 *
 * Decides the typed confirmation phrase a write must be acknowledged with.
 * Pure: no I/O, so the thresholds can be unit-tested without a database.
 */

/**
 * The phrase implied by the statement itself: batches, high-risk statements and
 * UPDATE/DELETE without WHERE.
 *
 * @param {object} classification
 * @returns {string}
 */
export function acknowledgementForClassification(classification = {}) {
  if (!classification.requiresAcknowledgement) {
    return '';
  }
  if (classification.multiStatement || classification.action === 'BATCH') {
    return 'RUN BATCH';
  }
  return `EXECUTE ${String(classification.action || 'QUERY').toUpperCase()}`;
}

/**
 * The phrase a write must be confirmed with, including the row-count escalation.
 *
 * A previewed write that touches more than `heightenedLimit` rows needs the typed
 * phrase too. The Safety panel has always promised "typed ack above N rows"; before
 * this the limit only changed the review wording, so a 10,000-row UPDATE with a
 * WHERE clause went through on a single click.
 *
 * @param {{ classification?: object, rowsAffected?: number | null, heightenedLimit?: number }} options
 * @returns {{ expectedText: string, heightened: boolean }}
 */
export function resolveWriteAcknowledgement({ classification = {}, rowsAffected = null, heightenedLimit = 3 } = {}) {
  const rows = rowsAffected === null || rowsAffected === undefined ? NaN : Number(rowsAffected);
  const heightened = Number.isFinite(rows) && rows > Number(heightenedLimit);
  let expectedText = acknowledgementForClassification(classification);

  if (!expectedText && heightened) {
    expectedText = `EXECUTE ${String(classification.action || 'QUERY').toUpperCase()}`;
  }

  return { expectedText, heightened };
}
