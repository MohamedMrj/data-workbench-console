/**
 * sql-classifier.js
 *
 * Safety-critical SQL tokeniser and query classifier.
 * Extracted from db-interface.js so it can be independently tested.
 *
 * Nothing in this module performs I/O or has side effects.
 */

/**
 * Tokenise a SQL string into uppercase keyword/identifier tokens,
 * skipping string literals, bracket-quoted identifiers, and comments.
 *
 * @param {string} query
 * @returns {string[]}
 */
export function tokenizeSql(query) {
  const sql = String(query || '');
  const tokens = [];
  let current = '';

  const pushCurrent = () => {
    if (current) {
      tokens.push(current.toUpperCase());
      current = '';
    }
  };

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    // Single-quoted string literal — skip entire contents.
    if (char === "'") {
      pushCurrent();
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
          continue;
        }
        if (sql[index] === "'") {
          break;
        }
        index += 1;
      }
      continue;
    }

    // Bracket-quoted identifier — skip entire contents.
    if (char === '[') {
      pushCurrent();
      index += 1;
      while (index < sql.length && sql[index] !== ']') {
        index += 1;
      }
      continue;
    }

    // Line comment — skip to end of line.
    if (char === '-' && next === '-') {
      pushCurrent();
      index += 2;
      while (index < sql.length && sql[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    // Block comment — skip to closing marker.
    if (char === '/' && next === '*') {
      pushCurrent();
      index += 2;
      while (index < sql.length) {
        if (sql[index] === '*' && sql[index + 1] === '/') {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }

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
  return tokens;
}

/**
 * Remove SQL comments and trim whitespace from a query string,
 * preserving string literal contents.
 *
 * @param {string} query
 * @returns {string}
 */
export function stripCommentsAndTrim(query) {
  const sql = String(query || '');
  let output = '';

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (char === "'") {
      output += char;
      index += 1;
      while (index < sql.length) {
        output += sql[index];
        if (sql[index] === "'" && sql[index + 1] === "'") {
          output += sql[index + 1];
          index += 2;
          continue;
        }
        if (sql[index] === "'") {
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') {
        index += 1;
      }
      output += ' ';
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < sql.length) {
        if (sql[index] === '*' && sql[index + 1] === '/') {
          index += 1;
          break;
        }
        index += 1;
      }
      output += ' ';
      continue;
    }

    output += char;
  }

  return output.trim();
}

/**
 * Split a SQL string into individual statements on semicolons,
 * respecting string literals.
 *
 * @param {string} query
 * @returns {string[]}
 */
export function splitStatements(query) {
  const sql = stripCommentsAndTrim(query);
  const statements = [];
  let current = '';
  let inString = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    current += char;

    if (char === "'" && next === "'") {
      current += next;
      index += 1;
      continue;
    }

    if (char === "'") {
      inString = !inString;
      continue;
    }

    if (!inString && char === ';') {
      const trimmed = current.slice(0, -1).trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

const HIGH_RISK_ACTIONS = new Set([
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
  const keyword = leadingKeywordFromTokens(tokens) || 'QUERY';
  const warnings = [];

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
  const sql = String(query || '');
  const words = [];
  let depth = 0;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (char === "'") {
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
          continue;
        }
        if (sql[index] === "'") {
          break;
        }
        index += 1;
      }
      continue;
    }

    if (char === '[') {
      index += 1;
      while (index < sql.length && sql[index] !== ']') {
        index += 1;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      index += 2;
      while (index < sql.length && sql[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < sql.length) {
        if (sql[index] === '*' && sql[index + 1] === '/') {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

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
      while (index < sql.length && /[A-Za-z0-9_@#$]/.test(sql[index])) {
        word += sql[index];
        index += 1;
      }
      index -= 1;
      words.push({ word: word.toUpperCase(), index: start });
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

function addTopToTopLevelSelect(query, rowLimit) {
  const words = topLevelSqlWords(query);
  const selectEntry = words.find((entry) => entry.word === 'SELECT');
  if (!selectEntry) {
    return query;
  }

  const selectEnd = selectEntry.index + 'SELECT'.length;
  const modifier = words.find((entry) => (
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
    return hasUserTop
      ? `${trimmed};`
      : `${addTopToTopLevelSelect(trimmed, safeLimit)};`;
  }

  return `SELECT TOP (${safeLimit}) * FROM (\n${trimmed}\n) AS __rowlimit_wrapper;`;
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
