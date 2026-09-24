/**
 * write-acknowledgement.js
 *
 * Decides the typed confirmation phrase a write or procedure must be acknowledged with.
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

// The profile name is what the user typed when tagging the profile, so it is short and
// recognisable; database names here are often long generated ids nobody could type per write.
function prodSuffix(profileName) {
  const name = String(profileName || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return name ? ` ON PROD ${name}` : ' ON PROD';
}

/**
 * The phrase a write must be confirmed with, including the row-count escalation.
 *
 * A previewed write that touches more than `heightenedLimit` rows needs the typed
 * phrase too. The Safety panel has always promised "typed ack above N rows"; before
 * this the limit only changed the review wording, so a 10,000-row UPDATE with a
 * WHERE clause went through on a single click.
 *
 * On a profile tagged prod every write needs a phrase that names the profile, whatever
 * its size, so a click on the wrong tab cannot change production.
 *
 * @param {{ classification?: object, rowsAffected?: number | null, heightenedLimit?: number, environment?: string, profileName?: string }} options
 * @returns {{ expectedText: string, heightened: boolean }}
 */
export function resolveWriteAcknowledgement({ classification = {}, rowsAffected = null, heightenedLimit = 3, environment = '', profileName = '' } = {}) {
  const rows = rowsAffected === null || rowsAffected === undefined ? NaN : Number(rowsAffected);
  const heightened = Number.isFinite(rows) && rows > Number(heightenedLimit);
  let expectedText = acknowledgementForClassification(classification);

  if (!expectedText && (heightened || environment === 'prod')) {
    expectedText = `EXECUTE ${String(classification.action || 'QUERY').toUpperCase()}`;
  }
  if (environment === 'prod') {
    expectedText += prodSuffix(profileName);
  }

  return { expectedText, heightened: heightened || environment === 'prod' };
}

/**
 * Procedures need a typed phrase only on prod: elsewhere the prepare-then-confirm button
 * flow is the documented contract.
 *
 * @param {{ environment?: string, profileName?: string }} options
 * @returns {string}
 */
export function resolveProcedureAcknowledgement({ environment = '', profileName = '' } = {}) {
  return environment === 'prod' ? `EXECUTE PROCEDURE${prodSuffix(profileName)}` : '';
}

/**
 * Throws a 400 unless the typed acknowledgement matches the phrase stored in the
 * confirmation record. Checked before the token is claimed, so a typo does not burn it.
 *
 * @param {string} expectedText
 * @param {unknown} acknowledgement
 */
export function assertAcknowledgement(expectedText, acknowledgement) {
  const expected = String(expectedText || '').trim();
  if (!expected) return;
  if (String(acknowledgement || '').trim().toUpperCase() !== expected.toUpperCase()) {
    const error = new Error(`Type the confirmation phrase exactly before executing this operation: ${expected}`);
    error.httpStatus = 400;
    throw error;
  }
}
