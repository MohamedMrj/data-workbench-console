/**
 * error-details.js
 *
 * The SQL Server diagnostics an error response may carry. The browser uses them to tell a
 * T-SQL error (EREQUEST, with a message number) from a connection, login or timeout failure,
 * instead of guessing from words in the message, which quotes the user's SQL.
 *
 * Only these named fields are copied, and only as plain numbers or short strings: an mssql
 * error also carries the connection config, the request and the raw TDS token, none of which
 * may leave the server.
 */

const NUMERIC_FIELDS = ['number', 'lineNumber', 'state', 'class'];
const TEXT_FIELDS = ['serverName', 'procName'];

// mssql copies Tedious's fields onto its own error, but a wrapped error may only have them
// on originalError (or its info), so look in all three places.
function sourcesOf(error) {
  return [error, error?.originalError, error?.originalError?.info, error?.info].filter((source) => source && typeof source === 'object');
}

/**
 * @param {unknown} error
 * @returns {{ code: string | null, number?: number, lineNumber?: number, state?: number, class?: number, serverName?: string, procName?: string }}
 */
export function sqlErrorDetails(error) {
  const sources = sourcesOf(error);
  const pick = (field) => sources.map((source) => source[field]).find((value) => value !== undefined && value !== null && value !== '');
  const code = pick('code');
  const details = { code: typeof code === 'string' && /^[A-Z_]{2,40}$/.test(code) ? code : null };
  NUMERIC_FIELDS.forEach((field) => {
    const value = Number(pick(field));
    if (Number.isFinite(value) && pick(field) !== undefined) {
      details[field] = value;
    }
  });
  TEXT_FIELDS.forEach((field) => {
    const value = pick(field);
    if (typeof value === 'string' && value.trim()) {
      details[field] = value.trim().slice(0, 256);
    }
  });
  return details;
}
