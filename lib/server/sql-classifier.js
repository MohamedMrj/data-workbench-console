/**
 * sql-classifier.js
 *
 * Safety-critical SQL tokeniser and query classifier.
 * Extracted from db-interface.js so it can be independently tested.
 *
 * Nothing in this module performs I/O or has side effects.
 */

/**
 * Split a SQL string into contiguous regions: executable code, string literals,
 * bracket- or double-quoted identifiers, and comments.
 *
 * Every scanner in this module is built on this one function so they cannot
 * disagree about where a literal or comment ends. They used to be four separate
 * hand-rolled loops that each missed `"double-quoted"` identifiers, `]]` escapes
 * and nested block comments; a stray `'` inside any of those made the classifier
 * see a fake string that hid real keywords, e.g. a `; EXEC` placed after a nested
 * comment containing a quote was read as part of a single previewed UPDATE.
 *
 * `unterminated` is true when a literal, identifier or block comment never closes.
 * SQL Server rejects such text, and classifyQuery fails closed on it rather than
 * guessing where the author meant it to end.
 *
 * @param {string} query
 * @returns {{ sql: string, regions: { type: string, start: number, end: number }[], unterminated: boolean }}
 */
function scanSqlRegions(query) {
  const sql = String(query || '');
  const regions = [];
  let unterminated = false;
  let codeStart = 0;
  let index = 0;

  const pushRegion = (type, start, end) => {
    if (start > codeStart) {
      regions.push({ type: 'code', start: codeStart, end: start });
    }
    regions.push({ type, start, end });
    codeStart = end;
  };

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    // '…' string, [...] identifier and "..." identifier all escape their closing
    // character by doubling it.
    if (char === "'" || char === '[' || char === '"') {
      const close = char === '[' ? ']' : char;
      const start = index;
      let closed = false;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === close) {
          if (sql[index + 1] === close) {
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) {
        unterminated = true;
      }
      pushRegion(char === "'" ? 'string' : char === '[' ? 'bracket' : 'quoted', start, index);
      continue;
    }

    if (char === '-' && next === '-') {
      const start = index;
      while (index < sql.length && sql[index] !== '\n') {
        index += 1;
      }
      pushRegion('comment', start, index);
      continue;
    }

    // T-SQL block comments nest, so `/* a /* b */ c */` is one comment.
    if (char === '/' && next === '*') {
      const start = index;
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql[index] === '/' && sql[index + 1] === '*') {
          depth += 1;
          index += 2;
          continue;
        }
        if (sql[index] === '*' && sql[index + 1] === '/') {
          depth -= 1;
          index += 2;
          continue;
        }
        index += 1;
      }
      if (depth > 0) {
        unterminated = true;
      }
      pushRegion('comment', start, index);
      continue;
    }

    index += 1;
  }

  if (sql.length > codeStart) {
    regions.push({ type: 'code', start: codeStart, end: sql.length });
  }

  return { sql, regions, unterminated };
}

/**
 * True when a string literal, quoted identifier or block comment never closes.
 *
 * @param {string} query
 * @returns {boolean}
 */
export function hasUnterminatedSqlText(query) {
  return scanSqlRegions(query).unterminated;
}

/**
 * Tokenise a SQL string into uppercase keyword/identifier tokens,
 * skipping string literals, quoted identifiers, and comments.
 *
 * @param {string} query
 * @returns {string[]}
 */
export function tokenizeSql(query) {
  const { sql, regions } = scanSqlRegions(query);
  const tokens = [];

  for (const region of regions) {
    if (region.type !== 'code') {
      continue;
    }

    let current = '';
    const pushCurrent = () => {
      if (current) {
        tokens.push(current.toUpperCase());
        current = '';
      }
    };

    for (let index = region.start; index < region.end; index += 1) {
      const char = sql[index];

      if (/[(),;]/.test(char)) {
        pushCurrent();
        tokens.push(char);
        continue;
      }

      if (/[A-Za-z0-9_@#$]/.test(char)) {
        current += char;
        continue;
      }

      pushCurrent();
    }

    pushCurrent();
  }

  return tokens;
}

/**
 * Remove SQL comments and trim whitespace from a query string,
 * preserving string literal and quoted identifier contents.
 *
 * @param {string} query
 * @returns {string}
 */
export function stripCommentsAndTrim(query) {
  const { sql, regions } = scanSqlRegions(query);
  return regions
    .map((region) => (region.type === 'comment' ? ' ' : sql.slice(region.start, region.end)))
    .join('')
    .trim();
}

/**
 * Split a SQL string into individual statements on semicolons,
 * respecting string literals and quoted identifiers.
 *
 * @param {string} query
 * @returns {string[]}
 */
export function splitStatements(query) {
  const { sql, regions } = scanSqlRegions(stripCommentsAndTrim(query));
  const statements = [];
  let statementStart = 0;

  const pushStatement = (end) => {
    const trimmed = sql.slice(statementStart, end).trim();
    if (trimmed) {
      statements.push(trimmed);
    }
  };

  for (const region of regions) {
    if (region.type !== 'code') {
      continue;
    }
    for (let index = region.start; index < region.end; index += 1) {
      if (sql[index] === ';') {
        pushStatement(index);
        statementStart = index + 1;
      }
    }
  }

  pushStatement(sql.length);
  return statements;
}

const HIGH_RISK_ACTIONS = new Set([
  'SELECT INTO',
  'MERGE',
  'TRUNCATE',
  'DROP',
  'ALTER',
  'CREATE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE'
]);

const WRITE_ACTIONS = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  ...HIGH_RISK_ACTIONS
]);

function containsGoBatchSeparator(query) {
  return /^\s*GO(?:\s+\d+)?\s*$/im.test(stripCommentsAndTrim(query));
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function statementInfo(statement) {
  const tokens = tokenizeSql(statement);
  const leadingKeyword = leadingKeywordFromTokens(tokens) || 'QUERY';
  // SELECT ... INTO creates a table, so it must never take the read path. No legal read
  // contains INTO at any depth (INSERT/MERGE/OUTPUT INTO all lead with a write keyword,
  // and SELECT INTO is not allowed in a subquery or CTE), so matching any INTO token
  // fails closed without needing to track nesting.
  const keyword = (leadingKeyword === 'SELECT' || leadingKeyword === 'WITH') && tokens.includes('INTO')
    ? 'SELECT INTO'
    : leadingKeyword;
  const warnings = [];

  if (keyword === 'SELECT INTO') {
    warnings.push('SELECT ... INTO creates a new table.');
  }

  if (keyword === 'UPDATE' && !tokens.includes('WHERE')) {
    warnings.push('UPDATE does not include a WHERE clause.');
  }

  if (keyword === 'DELETE' && !tokens.includes('WHERE')) {
    warnings.push('DELETE does not include a WHERE clause.');
  }

  const isRead = keyword === 'SELECT' || keyword === 'WITH';
  const isKnownWrite = WRITE_ACTIONS.has(keyword);
  // A write can embed a high-risk operation behind a benign leading keyword,
  // e.g. INSERT ... EXEC proc, or a write that invokes MERGE. Treat any embedded
  // high-risk keyword as high-risk so it still requires the typed acknowledgement.
  // Reads route by leading keyword elsewhere, so this only escalates writes; the
  // tokenizer already strips string literals, bracketed identifiers, and comments.
  const embedsHighRisk = !isRead && tokens.some((token) => HIGH_RISK_ACTIONS.has(token));
  const highRisk = HIGH_RISK_ACTIONS.has(keyword) || embedsHighRisk || (!isRead && !isKnownWrite);

  return {
    statement,
    tokens,
    keyword,
    kind: isRead ? 'read' : 'write',
    warnings,
    highRisk,
    directConfirmOnly: highRisk
  };
}

function classifyProcedureDefinitionBatch(query) {
  const sanitized = stripCommentsAndTrim(query);
  const tokens = tokenizeSql(sanitized);
  if (!tokens.length) {
    return null;
  }

  if (containsGoBatchSeparator(sanitized)) {
    return {
      kind: 'blocked',
      reason: 'GO batch separators are not supported in Data Workbench. Run one CREATE/ALTER PROCEDURE definition without GO separators.'
    };
  }

  const first = tokens[0];
  const second = tokens[1];
  const third = tokens[2];
  const fourth = tokens[3];
  const isProcedureKeyword = (value) => value === 'PROCEDURE' || value === 'PROC';

  if ((first === 'CREATE' || first === 'ALTER') && isProcedureKeyword(second)) {
    return {
      statement: sanitized,
      keyword: first,
      tokens,
      moduleDefinition: 'procedure'
    };
  }

  if (first === 'CREATE' && second === 'OR' && third === 'ALTER' && isProcedureKeyword(fourth)) {
    return {
      statement: sanitized,
      keyword: 'CREATE',
      tokens,
      moduleDefinition: 'procedure'
    };
  }

  return null;
}

/**
 * Produce a single-line preview of a SQL query, truncated to maxLength.
 *
 * @param {string} query
 * @param {number} [maxLength=160]
 * @returns {string}
 */
export function compactQueryPreview(query, maxLength = 160) {
  const oneLine = stripCommentsAndTrim(query).replace(/\s+/g, ' ');
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 1)}…` : oneLine;
}

/**
 * Produce a compact display string for a stored procedure call.
 *
 * @param {string} procedureName
 * @param {Record<string, unknown>} parameters
 * @returns {string}
 */
export function compactProcedurePreview(procedureName, parameters) {
  const pairs = Object.entries(parameters || {})
    .filter(([, value]) => value !== undefined && String(value).trim() !== '')
    .map(([name]) => name);
  const suffix = pairs.length ? ` ${pairs.join(', ')}` : '';
  return compactQueryPreview(`EXEC ${procedureName}${suffix}`);
}

function topLevelSqlWords(query) {
  const { sql, regions } = scanSqlRegions(query);
  const words = [];
  let depth = 0;

  for (const region of regions) {
    if (region.type !== 'code') {
      continue;
    }

    for (let index = region.start; index < region.end; index += 1) {
      const char = sql[index];

      if (char === '(') {
        depth += 1;
        continue;
      }

      if (char === ')') {
        depth = Math.max(0, depth - 1);
        continue;
      }

      if (depth === 0 && /[A-Za-z_@#$]/.test(char)) {
        const start = index;
        let word = char;
        index += 1;
        while (index < region.end && /[A-Za-z0-9_@#$]/.test(sql[index])) {
          word += sql[index];
          index += 1;
        }
        index -= 1;
        words.push({ word: word.toUpperCase(), index: start });
      }
    }
  }

  return words;
}

function topLevelOrderByInfo(query) {
  const words = topLevelSqlWords(query);
  for (let index = 0; index < words.length - 1; index += 1) {
    if (words[index].word === 'ORDER' && words[index + 1].word === 'BY') {
      const afterOrder = words.slice(index + 2).map((entry) => entry.word);
      return {
        hasOrderBy: true,
        hasOffset: afterOrder.includes('OFFSET'),
        hasFetch: afterOrder.includes('FETCH'),
        hasForXmlOrJson: afterOrder.includes('FOR')
      };
    }
  }
  return {
    hasOrderBy: false,
    hasOffset: false,
    hasFetch: false,
    hasForXmlOrJson: false
  };
}

function hasTopLevelSelectTop(query) {
  const words = topLevelSqlWords(query);
  const selectIndex = words.findIndex((entry) => entry.word === 'SELECT');
  if (selectIndex < 0) {
    return false;
  }

  const fromIndex = words.findIndex((entry, index) => index > selectIndex && entry.word === 'FROM');
  const selectListWords = words
    .slice(selectIndex + 1, fromIndex >= 0 ? fromIndex : undefined)
    .map((entry) => entry.word);

  return selectListWords.includes('TOP');
}

function startsWithCte(query) {
  return tokenizeSql(query)[0] === 'WITH';
}

function hasTopLevelSetOperator(query) {
  return topLevelSqlWords(query).some((entry) => (
    ['UNION', 'EXCEPT', 'INTERSECT'].includes(entry.word)
  ));
}

function addTopToTopLevelSelect(query, rowLimit) {
  const words = topLevelSqlWords(query);
  const selectIndex = words.findIndex((entry) => entry.word === 'SELECT');
  if (selectIndex < 0) {
    return query;
  }

  // The ALL/DISTINCT lookup exists so the cap lands after the modifier
  // (`SELECT DISTINCT TOP (n)`), and it must stay inside the select list. An unbounded
  // search also matches the ALL of a later `UNION ALL` and would emit
  // `... UNION ALL TOP (n) SELECT ...`, which SQL Server rejects outright.
  const selectEnd = words[selectIndex].index + 'SELECT'.length;
  const fromIndex = words.findIndex((entry, index) => index > selectIndex && entry.word === 'FROM');
  const selectListWords = words.slice(selectIndex + 1, fromIndex >= 0 ? fromIndex : undefined);
  const modifier = selectListWords.find((entry) => (
    entry.index >= selectEnd && ['ALL', 'DISTINCT'].includes(entry.word)
  ));
  const insertAt = modifier ? modifier.index + modifier.word.length : selectEnd;
  return `${query.slice(0, insertAt)} TOP (${rowLimit})${query.slice(insertAt)}`;
}

/**
 * Apply the app's server-side read row cap without breaking valid user SELECTs.
 *
 * SQL Server/Fabric reject `ORDER BY` inside a derived table unless it is paired
 * with TOP, OFFSET, or XML/JSON output. For ordered reads, add an OFFSET/FETCH
 * cap directly to the user's statement instead of wrapping it.
 *
 * @param {string} query
 * @param {number} rowLimit
 * @returns {string}
 */
export function buildLimitedReadQuery(query, rowLimit) {
  const safeLimit = Math.max(1, Number(rowLimit || 1));
  const trimmed = String(query || '').trim().replace(/;+\s*$/, '');
  const orderInfo = topLevelOrderByInfo(trimmed);
  const hasUserTop = hasTopLevelSelectTop(trimmed);
  const cteLeadingQuery = startsWithCte(trimmed);

  if (orderInfo.hasOrderBy && hasUserTop) {
    return `${trimmed};`;
  }

  if (orderInfo.hasOrderBy && !orderInfo.hasOffset && !orderInfo.hasFetch && !orderInfo.hasForXmlOrJson) {
    return `${trimmed}\nOFFSET 0 ROWS FETCH NEXT ${safeLimit} ROWS ONLY;`;
  }

  if (orderInfo.hasOrderBy && orderInfo.hasOffset && !orderInfo.hasFetch) {
    return `${trimmed}\nFETCH NEXT ${safeLimit} ROWS ONLY;`;
  }

  if (orderInfo.hasOrderBy && (orderInfo.hasFetch || orderInfo.hasForXmlOrJson)) {
    return `${trimmed};`;
  }

  if (cteLeadingQuery) {
    // A CTE cannot be wrapped in a derived table (`SELECT * FROM (WITH ...)` is not legal
    // T-SQL), so the cap has to go inside the statement. With a top-level set operator there
    // is no single SELECT that governs the combined result, so leave the statement alone
    // rather than capping only its first branch; mapRecordset still slices the response to
    // RESPONSE_ROW_LIMIT and reports `truncated`.
    return hasUserTop || hasTopLevelSetOperator(trimmed)
      ? `${trimmed};`
      : `${addTopToTopLevelSelect(trimmed, safeLimit)};`;
  }

  return `SELECT TOP (${safeLimit}) * FROM (\n${trimmed}\n) AS __rowlimit_wrapper;`;
}

const PREVIEW_OUTPUT_CLAUSES = {
  INSERT: 'inserted.*',
  UPDATE: 'deleted.*, inserted.*',
  DELETE: 'deleted.*'
};
const REMOTE_ROWSET_FUNCTIONS = new Set(['OPENQUERY', 'OPENROWSET', 'OPENDATASOURCE']);

/**
 * Rewrite a single INSERT/UPDATE/DELETE so its rolled-back preview also returns the rows it
 * touches, by adding an OUTPUT clause at the one place T-SQL allows it:
 *   UPDATE t SET ... OUTPUT deleted.*, inserted.* [FROM ...] [WHERE ...] [OPTION ...]
 *   DELETE [FROM] t OUTPUT deleted.* [FROM ...] [WHERE ...] [OPTION ...]
 *   INSERT [INTO] t [(cols)] OUTPUT inserted.* VALUES | SELECT | DEFAULT VALUES
 *
 * Returns null whenever the shape is not certain (CTE-led, TOP, an existing OUTPUT, EXEC,
 * remote rowsets, UPDATE STATISTICS, several statements, unterminated text): the caller then
 * previews the original statement for a row count only. The rewrite only ever runs inside the
 * rolled-back preview; the statement that executes on confirm is always the user's text.
 *
 * @param {string} query
 * @returns {{ text: string, mode: 'insert' | 'update' | 'delete' } | null}
 */
export function buildPreviewOutputQuery(query) {
  const trimmed = String(query || '').trim().replace(/;+\s*$/, '');
  if (!trimmed || hasUnterminatedSqlText(trimmed) || splitStatements(trimmed).length !== 1) {
    return null;
  }

  const words = topLevelSqlWords(trimmed);
  const verb = words[0]?.word;
  const clause = PREVIEW_OUTPUT_CLAUSES[verb];
  if (!clause || words[1]?.word === 'TOP') {
    return null;
  }
  const upper = words.map((entry) => entry.word);
  if (upper.includes('OUTPUT') || upper.includes('EXEC') || upper.includes('EXECUTE')) {
    return null;
  }
  if (tokenizeSql(trimmed).some((token) => REMOTE_ROWSET_FUNCTIONS.has(token))) {
    return null;
  }

  const firstAfter = (fromIndex, targets) => words.find((entry, index) => index > fromIndex && targets.includes(entry.word));
  let insertAt = null;

  if (verb === 'UPDATE') {
    const setIndex = upper.indexOf('SET');
    if (setIndex < 1) {
      return null;
    }
    const boundary = firstAfter(setIndex, ['FROM', 'WHERE', 'OPTION']);
    insertAt = boundary ? boundary.index : trimmed.length;
  } else if (verb === 'DELETE') {
    const targetIndex = words[1]?.word === 'FROM' ? 1 : 0;
    const boundary = firstAfter(targetIndex, ['FROM', 'WHERE', 'OPTION']);
    insertAt = boundary ? boundary.index : trimmed.length;
  } else {
    const boundary = firstAfter(0, ['VALUES', 'SELECT', 'DEFAULT']);
    if (!boundary) {
      return null;
    }
    insertAt = boundary.index;
  }

  const before = trimmed.slice(0, insertAt).trimEnd();
  const after = trimmed.slice(insertAt).trimStart();
  return {
    text: `${before}\nOUTPUT ${clause}${after ? `\n${after}` : ''}`,
    mode: verb.toLowerCase()
  };
}

/**
 * Given a flat token list, locate the leading keyword after any leading CTEs.
 * Returns the keyword string (upper-case) or '' if it cannot be determined.
 *
 * @param {string[]} tokens
 * @returns {string}
 */
export function leadingKeywordFromTokens(tokens) {
  let index = 0;

  const nextToken = () => tokens[index];
  const readIdentifier = () => {
    const token = nextToken();
    if (/^[A-Z_@#$][A-Z0-9_@#$]*$/i.test(token || '')) {
      index += 1;
      return token;
    }
    return null;
  };

  const skipBalancedGroup = () => {
    if (nextToken() !== '(') {
      return false;
    }

    let depth = 0;
    while (index < tokens.length) {
      const token = tokens[index];
      index += 1;
      if (token === '(') depth += 1;
      if (token === ')') depth -= 1;
      if (depth === 0) {
        return true;
      }
    }
    return false;
  };

  // Skip any leading semicolons.
  while (tokens[index] === ';') {
    index += 1;
  }

  // If not a CTE, return the first token directly.
  if (tokens[index] !== 'WITH') {
    return tokens[index] || '';
  }

  // Walk through CTE definitions to find the real leading statement.
  index += 1;
  while (index < tokens.length) {
    if (!readIdentifier()) {
      return '';
    }

    if (nextToken() === '(' && !skipBalancedGroup()) {
      return '';
    }

    if (nextToken() !== 'AS') {
      return '';
    }
    index += 1;

    if (!skipBalancedGroup()) {
      return '';
    }

    if (nextToken() === ',') {
      index += 1;
      continue;
    }

    return tokens[index] || '';
  }

  return '';
}

/**
 * Classify the leading statement of a query.
 * Returns `{ kind: 'blocked', reason }` only for unsupported driver-level batch separators.
 *
 * @param {string} query
 * @returns {{ kind: string, statement?: string, keyword?: string, tokens?: string[], reason?: string }}
 */
export function classifyLeadingStatement(query) {
  if (containsGoBatchSeparator(query)) {
    return {
      kind: 'blocked',
      reason: 'GO batch separators are not supported in Data Workbench. Remove GO lines and run a driver-compatible batch.'
    };
  }

  const procedureDefinition = classifyProcedureDefinitionBatch(query);
  if (procedureDefinition) {
    return procedureDefinition;
  }

  const statements = splitStatements(query);
  const statement = statements[0] || '';
  const tokens = tokenizeSql(statement);
  return {
    statement,
    keyword: leadingKeywordFromTokens(tokens),
    tokens
  };
}

// ─── Row-editability analysis ───────────────────────────────────────────────
//
// Determines whether a read query is a "plain" single-table SELECT whose
// result rows can be safely mapped back to individual rows of one real table,
// for the results-grid inline editor (see analyzeSingleTableSelect below).
//
// This is advisory only: it decides whether the client shows an Edit button.
// The UPDATE statement inline editing produces is an ordinary write that goes
// through classifyQuery, a rollback preview, and confirmation exactly like any
// other write in this app — a wrong "editable" answer here can at worst show
// or hide a button; it can never bypass the write safety pipeline above.
// Because of that, this analysis is deliberately conservative rather than
// exhaustive: anything unusual is rejected (fails closed) instead of risking
// a misidentified table or row.

const DISALLOWED_ROW_EDIT_KEYWORDS = new Set([
  'JOIN', 'APPLY', 'UNION', 'EXCEPT', 'INTERSECT', 'GROUP', 'HAVING', 'INTO'
]);

const ROW_EDIT_AGGREGATE_FUNCTIONS = new Set([
  'COUNT', 'COUNT_BIG', 'SUM', 'AVG', 'MIN', 'MAX', 'STRING_AGG',
  'STDEV', 'STDEVP', 'VAR', 'VARP', 'GROUPING', 'GROUPING_ID',
  'CHECKSUM_AGG', 'APPROX_COUNT_DISTINCT'
]);

// Clause keywords that may legitimately follow the FROM target with no table
// alias present. Anything else found there (an identifier, a `(`) means a
// table alias or a table-valued function — neither is supported, so it is
// treated as an unrecognised shape rather than guessed at.
const FROM_CLAUSE_BOUNDARY_KEYWORDS = new Set(['WHERE', 'ORDER', 'OPTION', 'FOR']);

// Read one bracket-quoted (`[...]`, with `]]` escaping) or plain identifier
// starting at/after startIndex (leading whitespace is skipped). Returns null
// if no identifier starts there.
function readRawIdentifier(sql, startIndex) {
  let index = startIndex;
  while (index < sql.length && /\s/.test(sql[index])) {
    index += 1;
  }

  if (sql[index] === '[') {
    let value = '';
    index += 1;
    while (index < sql.length) {
      if (sql[index] === ']' && sql[index + 1] === ']') {
        value += ']';
        index += 2;
        continue;
      }
      if (sql[index] === ']') {
        index += 1;
        break;
      }
      value += sql[index];
      index += 1;
    }
    return { value, endIndex: index };
  }

  const start = index;
  while (index < sql.length && /[A-Za-z0-9_@#$]/.test(sql[index])) {
    index += 1;
  }
  if (index === start) {
    return null;
  }
  return { value: sql.slice(start, index), endIndex: index };
}

// Read a dot-separated identifier chain (e.g. `schema.object`), bracket-aware.
// Returns null if no identifier starts at startIndex.
function readRawQualifiedName(sql, startIndex) {
  let cursor = startIndex;
  const parts = [];

  while (true) {
    const part = readRawIdentifier(sql, cursor);
    if (!part) {
      break;
    }
    parts.push(part.value);
    cursor = part.endIndex;
    if (sql[cursor] === '.') {
      cursor += 1;
      continue;
    }
    break;
  }

  if (!parts.length) {
    return null;
  }
  return { parts, endIndex: cursor };
}

// Split a string on top-level commas, respecting string literals, bracketed
// identifiers, and parenthesised expressions. Comments are assumed already
// stripped by the caller.
function splitTopLevelByComma(text) {
  const segments = [];
  let current = '';
  let depth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "'") {
      current += char;
      index += 1;
      while (index < text.length) {
        current += text[index];
        if (text[index] === "'" && text[index + 1] === "'") {
          current += text[index + 1];
          index += 2;
          continue;
        }
        if (text[index] === "'") {
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === '[') {
      current += char;
      index += 1;
      while (index < text.length) {
        current += text[index];
        if (text[index] === ']' && text[index + 1] === ']') {
          current += text[index + 1];
          index += 2;
          continue;
        }
        if (text[index] === ']') {
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      segments.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  segments.push(current);
  return segments;
}

// Consume leading ALL / DISTINCT / TOP (n) / TOP n [PERCENT] modifiers right
// after the SELECT keyword, returning the raw index where the actual select
// list begins. `foundDistinct` is reported separately so the caller can
// reject it (DISTINCT can change which/how many rows come back).
//
// Driven entirely by raw character position rather than by walking
// selectListWords with a manually-tracked cursor: topLevelSqlWords only
// starts a word on a letter/`_`/`@`/`#`/`$` (see its word-start regex), so a
// bare numeric TOP argument such as `TOP 50` never produces a word entry at
// all — a first version of this function assumed it would and mislocated the
// column list for exactly that shape.
function consumeSelectModifiers(sanitized, selectListWords, selectKeywordEnd) {
  let rawCursor = selectKeywordEnd;
  let foundDistinct = false;

  const skipRawWhitespace = (fromIndex) => {
    let index = fromIndex;
    while (index < sanitized.length && /\s/.test(sanitized[index])) {
      index += 1;
    }
    return index;
  };

  while (true) {
    const atIndex = skipRawWhitespace(rawCursor);
    const word = selectListWords.find((entry) => entry.index === atIndex);
    if (!word) {
      break;
    }

    if (word.word === 'DISTINCT') {
      foundDistinct = true;
      rawCursor = word.index + word.word.length;
      continue;
    }

    if (word.word === 'ALL') {
      rawCursor = word.index + word.word.length;
      continue;
    }

    if (word.word === 'TOP') {
      const afterTop = skipRawWhitespace(word.index + word.word.length);
      if (sanitized[afterTop] === '(') {
        let depth = 0;
        let index = afterTop;
        for (; index < sanitized.length; index += 1) {
          if (sanitized[index] === '(') depth += 1;
          else if (sanitized[index] === ')') {
            depth -= 1;
            if (depth === 0) {
              index += 1;
              break;
            }
          }
        }
        rawCursor = index;
      } else {
        // Bare `TOP n` (no parens): scan the digit run directly, since it has
        // no word entry to look up, then check for an optional PERCENT.
        let index = afterTop;
        const digitsStart = index;
        while (index < sanitized.length && /[0-9]/.test(sanitized[index])) {
          index += 1;
        }
        rawCursor = index > digitsStart ? index : afterTop;
        if (index > digitsStart) {
          const afterNumber = skipRawWhitespace(rawCursor);
          if (/^percent\b/i.test(sanitized.slice(afterNumber))) {
            rawCursor = afterNumber + 'PERCENT'.length;
          }
        }
      }
      continue;
    }

    break;
  }

  return { columnListStart: rawCursor, foundDistinct };
}

/**
 * Determine whether a read query is a plain single-table SELECT: no JOIN,
 * set operator, GROUP BY/HAVING/DISTINCT, aggregate function, CTE, table
 * alias, or non-plain column reference (expression, function call, `AS`
 * alias). See the module-level comment above for why this is conservative
 * rather than exhaustive.
 *
 * The returned schema/object name parts are exactly as they appeared in the
 * query (not rejoined into a single dotted string), so a part that legitimately
 * contains a `.` or `]` cannot be re-ambiguated the way a naive `schema.object`
 * join would be — see composeQualifiedObjectName in sql-metadata.js for the
 * same concern on the read/response side.
 *
 * @param {string} query
 * @returns {{ ok: true, schemaName: string | null, objectName: string, columns: string[] | null } | { ok: false, reason: string }}
 */
export function analyzeSingleTableSelect(query) {
  const sanitized = stripCommentsAndTrim(query);
  const classification = classifyQuery(sanitized);
  if (classification.kind !== 'read') {
    return { ok: false, reason: 'Only read (SELECT) results can be edited.' };
  }
  if (startsWithCte(sanitized)) {
    return { ok: false, reason: 'Queries starting with a CTE (WITH ...) are not supported for editing yet.' };
  }

  const words = topLevelSqlWords(sanitized);
  if (words.some((entry) => DISALLOWED_ROW_EDIT_KEYWORDS.has(entry.word))) {
    return { ok: false, reason: 'Only a plain single-table SELECT can be edited (no JOIN, UNION, GROUP BY, or subquery source).' };
  }

  const selectIndex = words.findIndex((entry) => entry.word === 'SELECT');
  const fromIndex = words.findIndex((entry, index) => index > selectIndex && entry.word === 'FROM');
  if (selectIndex < 0 || fromIndex < 0) {
    return { ok: false, reason: 'Could not identify a single SELECT ... FROM shape.' };
  }

  const selectListWords = words.slice(selectIndex + 1, fromIndex);
  if (selectListWords.some((entry) => ROW_EDIT_AGGREGATE_FUNCTIONS.has(entry.word))) {
    return { ok: false, reason: 'Aggregate results cannot be edited.' };
  }

  const selectKeywordEnd = words[selectIndex].index + 'SELECT'.length;
  const { columnListStart, foundDistinct } = consumeSelectModifiers(sanitized, selectListWords, selectKeywordEnd);
  if (foundDistinct) {
    return { ok: false, reason: 'SELECT DISTINCT results cannot be safely mapped back to individual rows.' };
  }

  const fromKeywordStart = words[fromIndex].index;
  const columnListRaw = sanitized.slice(columnListStart, fromKeywordStart);
  const columnSegments = splitTopLevelByComma(columnListRaw);
  let columns = null;

  if (!(columnSegments.length === 1 && columnSegments[0].trim() === '*')) {
    columns = [];
    for (const segment of columnSegments) {
      const trimmedEnd = segment.replace(/\s+$/, '').length;
      const identifier = readRawQualifiedName(segment, 0);
      if (!identifier || identifier.parts.length !== 1 || identifier.endIndex !== trimmedEnd) {
        return { ok: false, reason: 'Only plain column names (or SELECT *) can be edited; expressions and aliases are not supported.' };
      }
      columns.push(identifier.parts[0]);
    }
  }

  const fromTargetStart = fromKeywordStart + 'FROM'.length;
  const target = readRawQualifiedName(sanitized, fromTargetStart);
  if (!target || target.parts.length < 1 || target.parts.length > 2) {
    return { ok: false, reason: 'Could not identify a single source table after FROM.' };
  }

  const next = words.find((entry) => entry.index >= target.endIndex);
  if (next && !FROM_CLAUSE_BOUNDARY_KEYWORDS.has(next.word)) {
    return { ok: false, reason: 'A table alias or table-valued function after FROM is not supported for editing.' };
  }
  if (sanitized[target.endIndex] === '(') {
    return { ok: false, reason: 'A table-valued function after FROM is not supported for editing.' };
  }

  return {
    ok: true,
    schemaName: target.parts.length === 2 ? target.parts[0] : null,
    objectName: target.parts.at(-1),
    columns
  };
}

/**
 * Classify a SQL query string for safe execution routing.
 *
 * Returns one of:
 *   { kind: 'empty' }
 *   { kind: 'blocked', reason }
 *   { kind: 'read', action: 'SELECT', sanitized }
 *   { kind: 'write', action, sanitized, warnings, directConfirmOnly, requiresAcknowledgement }
 *
 * @param {string} query
 * @returns {object}
 */
export function classifyQuery(query) {
  const sanitized = stripCommentsAndTrim(query);

  if (!sanitized) {
    return { kind: 'empty', sanitized };
  }

  if (containsGoBatchSeparator(sanitized)) {
    return {
      kind: 'blocked',
      reason: 'GO batch separators are not supported in Data Workbench. Remove GO lines and run a driver-compatible batch.'
    };
  }

  if (hasUnterminatedSqlText(query)) {
    return {
      kind: 'write',
      action: 'QUERY',
      sanitized,
      warnings: ['This SQL has an unterminated string, quoted identifier, or comment, so it could not be classified. Review it carefully before executing.'],
      directConfirmOnly: true,
      requiresAcknowledgement: true,
      statementCount: 1,
      actions: ['QUERY'],
      highRiskActions: ['QUERY']
    };
  }

  const leading = classifyLeadingStatement(sanitized);
  if (leading.kind === 'blocked') {
    return leading;
  }

  if (leading.moduleDefinition) {
    const keyword = leading.keyword;
    return {
      kind: 'write',
      action: keyword,
      sanitized,
      warnings: [],
      directConfirmOnly: true,
      requiresAcknowledgement: true,
      statementCount: 1,
      actions: [keyword],
      highRiskActions: [keyword]
    };
  }

  const statements = splitStatements(sanitized);
  const statementCount = statements.length;
  const infos = statements.map(statementInfo);

  if (statementCount > 1) {
    const actions = uniqueValues(infos.map((info) => info.keyword || 'QUERY'));
    const warnings = infos.flatMap((info) => info.warnings);
    const highRiskActions = uniqueValues(infos.filter((info) => info.highRisk).map((info) => info.keyword || 'QUERY'));
    return {
      kind: 'write',
      action: 'BATCH',
      sanitized,
      warnings: [
        `This batch contains ${statementCount} SQL statements. Review every statement before execution.`,
        ...warnings
      ],
      directConfirmOnly: true,
      requiresAcknowledgement: true,
      multiStatement: true,
      statementCount,
      actions,
      highRiskActions
    };
  }

  const info = infos[0] || statementInfo(sanitized);
  const keyword = info.keyword;

  if (WRITE_ACTIONS.has(keyword)) {
    return {
      kind: 'write',
      action: keyword,
      sanitized,
      warnings: info.warnings,
      directConfirmOnly: info.directConfirmOnly,
      requiresAcknowledgement: info.directConfirmOnly || info.warnings.length > 0,
      statementCount: 1,
      actions: [keyword],
      highRiskActions: info.highRisk ? [keyword] : []
    };
  }

  if (keyword === 'SELECT' || keyword === 'WITH') {
    return {
      kind: 'read',
      action: 'SELECT',
      sanitized,
      statementCount: 1,
      actions: ['SELECT'],
      highRiskActions: []
    };
  }

  return {
    kind: 'write',
    action: keyword || 'QUERY',
    sanitized,
    warnings: ['This statement could not be classified as a read. Review it carefully before executing.'],
    directConfirmOnly: true,
    requiresAcknowledgement: true,
    statementCount: 1,
    actions: [keyword || 'QUERY'],
    highRiskActions: [keyword || 'QUERY']
  };
}
