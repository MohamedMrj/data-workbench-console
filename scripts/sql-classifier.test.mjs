/**
 * sql-classifier.test.mjs
 *
 * Unit tests for the safety-critical SQL tokeniser and classifier.
 * Run with:  node scripts/sql-classifier.test.mjs
 *
 * No test framework required — uses Node's built-in assert module.
 */

import assert from 'node:assert/strict';
import { analyzeSingleTableSelect, buildLimitedReadQuery, buildPreviewOutputQuery, classifyQuery, splitTrailingQueryHint, stripCommentsAndTrim, tokenizeSql, splitStatements } from '../lib/server/sql-classifier.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${error.message}`);
    failed += 1;
  }
}

// ─── tokenizeSql ─────────────────────────────────────────────────────────────

console.log('\ntokenizeSql');

test('basic SELECT', () => {
  const tokens = tokenizeSql('SELECT * FROM dbo.Users');
  // '*' and '.' are not word/identifier chars so they are discarded by pushCurrent
  assert.ok(tokens.includes('SELECT'));
  assert.ok(tokens.includes('FROM'));
  assert.ok(tokens.includes('USERS'));
  assert.ok(!tokens.includes('DROP'));
});

test('ignores single-line comments', () => {
  const tokens = tokenizeSql('-- drop everything\nSELECT 1');
  assert.ok(tokens.includes('SELECT'));
  assert.ok(!tokens.includes('DROP'));
});

test('ignores block comments', () => {
  const tokens = tokenizeSql('/* DROP TABLE Foo */ SELECT 1');
  assert.ok(tokens.includes('SELECT'));
  assert.ok(!tokens.includes('DROP'));
});

test('ignores string literal contents', () => {
  const tokens = tokenizeSql("SELECT 'DROP TABLE Foo' AS x");
  assert.ok(tokens.includes('SELECT'));
  assert.ok(!tokens.includes('DROP'));
});

test('ignores bracket-quoted identifiers', () => {
  const tokens = tokenizeSql('SELECT [DROP] FROM dbo.T');
  assert.ok(tokens.includes('SELECT'));
  assert.ok(!tokens.includes('DROP'));
});

test('handles escaped single quotes inside strings', () => {
  const tokens = tokenizeSql("SELECT 'it''s fine' AS x");
  assert.ok(tokens.includes('SELECT'));
  assert.ok(!tokens.includes('FINE'));
});

// ─── stripCommentsAndTrim ────────────────────────────────────────────────────

console.log('\nstripCommentsAndTrim');

test('strips line comments', () => {
  const result = stripCommentsAndTrim('SELECT 1 -- this is a comment\n');
  // The comment is replaced by a space, then the whole string is trimmed
  assert.equal(result, 'SELECT 1');
});

test('strips block comments', () => {
  const result = stripCommentsAndTrim('SELECT /* comment */ 1');
  // Block comment text is gone; surrounding spaces may vary
  assert.ok(result.includes('SELECT'));
  assert.ok(result.includes('1'));
  assert.ok(!result.includes('comment'));
});

test('preserves string literal contents', () => {
  const result = stripCommentsAndTrim("SELECT 'hello -- not a comment'");
  assert.equal(result, "SELECT 'hello -- not a comment'");
});

test('trims leading and trailing whitespace', () => {
  const result = stripCommentsAndTrim('   SELECT 1   ');
  assert.equal(result, 'SELECT 1');
});

// ─── splitStatements ─────────────────────────────────────────────────────────

console.log('\nsplitStatements');

test('single statement without semicolon', () => {
  const stmts = splitStatements('SELECT 1');
  assert.equal(stmts.length, 1);
  assert.equal(stmts[0], 'SELECT 1');
});

test('single statement with trailing semicolon', () => {
  const stmts = splitStatements('SELECT 1;');
  assert.equal(stmts.length, 1);
});

test('two statements split on semicolon', () => {
  const stmts = splitStatements('SELECT 1; SELECT 2');
  assert.equal(stmts.length, 2);
});

test('semicolon inside string is not a splitter', () => {
  const stmts = splitStatements("SELECT 'a;b' AS x");
  assert.equal(stmts.length, 1);
});

// ─── classifyQuery ───────────────────────────────────────────────────────────

console.log('\nclassifyQuery — reads');

test('empty query', () => {
  assert.equal(classifyQuery('').kind, 'empty');
});

test('whitespace-only query', () => {
  assert.equal(classifyQuery('   ').kind, 'empty');
});

test('comment-only query', () => {
  assert.equal(classifyQuery('-- just a comment').kind, 'empty');
});

test('plain SELECT', () => {
  const result = classifyQuery('SELECT * FROM dbo.Users');
  assert.equal(result.kind, 'read');
  assert.equal(result.action, 'SELECT');
});

test('SELECT with WHERE', () => {
  const result = classifyQuery('SELECT id FROM dbo.T WHERE id = 1');
  assert.equal(result.kind, 'read');
});

test('SELECT with comment prefix', () => {
  const result = classifyQuery('-- fetch rows\nSELECT TOP 10 * FROM dbo.T');
  assert.equal(result.kind, 'read');
});

test('CTE / WITH ... SELECT', () => {
  const result = classifyQuery(
    'WITH cte AS (SELECT id FROM dbo.T) SELECT * FROM cte'
  );
  assert.equal(result.kind, 'read');
  assert.equal(result.action, 'SELECT');
});

test('CTE with multiple definitions', () => {
  const result = classifyQuery(
    'WITH a AS (SELECT 1 AS n), b AS (SELECT n + 1 AS n FROM a) SELECT * FROM b'
  );
  assert.equal(result.kind, 'read');
});

test('mixed-case SELECT', () => {
  assert.equal(classifyQuery('select * from dbo.Foo').kind, 'read');
});

// ─── classifyQuery — direct-confirm writes ───────────────────────────────────

console.log('\nclassifyQuery — direct-confirm writes');

const hardBlocked = ['TRUNCATE', 'DROP', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];

for (const keyword of hardBlocked) {
  test(`${keyword} is classified as write with directConfirmOnly`, () => {
    const result = classifyQuery(`${keyword} TABLE dbo.Foo`);
    assert.equal(result.kind, 'write');
    assert.equal(result.action, keyword);
    assert.equal(result.directConfirmOnly, true);
    assert.equal(result.requiresAcknowledgement, true);
  });
}

test('EXEC is classified as directConfirmOnly write', () => {
  const result = classifyQuery('EXEC dbo.MyProc @p1 = 1');
  assert.equal(result.kind, 'write');
  assert.equal(result.directConfirmOnly, true);
  assert.equal(result.requiresAcknowledgement, true);
});

test('EXECUTE is classified as directConfirmOnly write', () => {
  const result = classifyQuery('EXECUTE dbo.MyProc');
  assert.equal(result.kind, 'write');
  assert.equal(result.directConfirmOnly, true);
  assert.equal(result.requiresAcknowledgement, true);
});

test('MERGE is classified as directConfirmOnly write', () => {
  const result = classifyQuery('MERGE dbo.Target AS tgt USING dbo.Source AS src ON tgt.id = src.id');
  assert.equal(result.kind, 'write');
  assert.equal(result.directConfirmOnly, true);
  assert.equal(result.requiresAcknowledgement, true);
});

test('INSERT ... EXEC escalates to typed acknowledgement (embedded high-risk)', () => {
  const result = classifyQuery('INSERT INTO dbo.Target EXEC dbo.MyProc @p = 1');
  assert.equal(result.kind, 'write');
  assert.equal(result.directConfirmOnly, true);
  assert.equal(result.requiresAcknowledgement, true);
});

test('plain INSERT does not require typed acknowledgement', () => {
  const result = classifyQuery("INSERT INTO dbo.Target (Id, Name) VALUES (1, 'ok')");
  assert.equal(result.kind, 'write');
  assert.equal(result.directConfirmOnly, false);
  assert.equal(result.requiresAcknowledgement, false);
});

test('SELECT referencing a high-risk word in a string stays a read', () => {
  const result = classifyQuery("SELECT 'please DROP this' AS note FROM dbo.T WHERE Id = 1");
  assert.equal(result.kind, 'read');
});

test('CREATE PROCEDURE body with internal semicolons is direct-confirm DDL', () => {
  const result = classifyQuery(`
CREATE PROCEDURE dbo.usp_Test
AS
BEGIN
  SELECT 1;
  SELECT 2;
END
`);
  assert.equal(result.kind, 'write');
  assert.equal(result.action, 'CREATE');
  assert.equal(result.directConfirmOnly, true);
  assert.equal(result.requiresAcknowledgement, true);
});

test('ALTER PROC body with internal semicolons is direct-confirm DDL', () => {
  const result = classifyQuery(`
ALTER PROC dbo.usp_Test
AS
BEGIN
  UPDATE dbo.T SET Value = 1 WHERE Id = 1;
END
`);
  assert.equal(result.kind, 'write');
  assert.equal(result.action, 'ALTER');
  assert.equal(result.directConfirmOnly, true);
  assert.equal(result.requiresAcknowledgement, true);
});

test('CREATE OR ALTER PROCEDURE body is direct-confirm DDL', () => {
  const result = classifyQuery(`
CREATE OR ALTER PROCEDURE dbo.usp_Test
AS
BEGIN
  SELECT 1;
END
`);
  assert.equal(result.kind, 'write');
  assert.equal(result.action, 'CREATE');
  assert.equal(result.directConfirmOnly, true);
  assert.equal(result.requiresAcknowledgement, true);
});

test('CREATE PROCEDURE script with GO separator is blocked', () => {
  const result = classifyQuery(`
CREATE PROCEDURE dbo.usp_Test
AS
BEGIN
  SELECT 1;
END
GO
`);
  assert.equal(result.kind, 'blocked');
  assert.match(result.reason, /GO batch separators/);
});

// ─── classifyQuery — conditional writes ──────────────────────────────────────

console.log('\nclassifyQuery — conditional writes');

test('INSERT is write', () => {
  const result = classifyQuery("INSERT INTO dbo.T (col) VALUES ('x')");
  assert.equal(result.kind, 'write');
  assert.equal(result.action, 'INSERT');
  assert.equal(result.directConfirmOnly, false);
});

test('UPDATE with WHERE — no warning', () => {
  const result = classifyQuery('UPDATE dbo.T SET col = 1 WHERE id = 5');
  assert.equal(result.kind, 'write');
  assert.equal(result.action, 'UPDATE');
  assert.equal(result.warnings.length, 0);
});

test('UPDATE without WHERE — warning present', () => {
  const result = classifyQuery('UPDATE dbo.T SET col = 1');
  assert.equal(result.kind, 'write');
  assert.ok(result.warnings.some((w) => w.includes('WHERE')));
  assert.equal(result.requiresAcknowledgement, true);
});

test('DELETE with WHERE — no warning', () => {
  const result = classifyQuery('DELETE FROM dbo.T WHERE id = 5');
  assert.equal(result.kind, 'write');
  assert.equal(result.warnings.length, 0);
});

test('DELETE without WHERE — warning present', () => {
  const result = classifyQuery('DELETE FROM dbo.T');
  assert.equal(result.kind, 'write');
  assert.ok(result.warnings.some((w) => w.includes('WHERE')));
  assert.equal(result.requiresAcknowledgement, true);
});

// ─── classifyQuery — multi-statement batches ──────────────────────────────────

console.log('\nclassifyQuery — multi-statement batches');

test('two statements separated by semicolon become a confirmed batch', () => {
  const result = classifyQuery('SELECT 1; SELECT 2');
  assert.equal(result.kind, 'write');
  assert.equal(result.action, 'BATCH');
  assert.equal(result.directConfirmOnly, true);
  assert.equal(result.requiresAcknowledgement, true);
  assert.equal(result.multiStatement, true);
  assert.equal(result.statementCount, 2);
});

test('DROP after SELECT in same batch is high-risk confirmed batch', () => {
  const result = classifyQuery('SELECT 1; DROP TABLE dbo.T');
  assert.equal(result.kind, 'write');
  assert.equal(result.action, 'BATCH');
  assert.ok(result.highRiskActions.includes('DROP'));
});

test('T-SQL IF block with internal semicolons is a confirmed batch', () => {
  const result = classifyQuery(`
IF NOT EXISTS (SELECT 1 FROM dbo.Tasks WHERE TaskID = 'x')
BEGIN
  INSERT INTO dbo.Tasks (TaskID) VALUES ('x');
END;
`);
  assert.equal(result.kind, 'write');
  assert.equal(result.action, 'BATCH');
  assert.equal(result.requiresAcknowledgement, true);
});

test('GO batch separators remain blocked', () => {
  const result = classifyQuery('SELECT 1;\nGO\nSELECT 2;');
  assert.equal(result.kind, 'blocked');
  assert.match(result.reason, /GO batch separators/);
});

// ─── classifyQuery — edge cases ──────────────────────────────────────────────

console.log('\nclassifyQuery — edge cases');

test('keyword inside string literal is not classified as that keyword', () => {
  const result = classifyQuery("SELECT 'DROP TABLE dbo.Foo' AS cmd");
  assert.equal(result.kind, 'read');
});

test('keyword inside bracket identifier is not classified as that keyword', () => {
  const result = classifyQuery('SELECT [TRUNCATE] FROM dbo.T');
  assert.equal(result.kind, 'read');
});

test('keyword inside block comment is not classified as that keyword', () => {
  const result = classifyQuery('/* DROP TABLE dbo.T */ SELECT 1');
  assert.equal(result.kind, 'read');
});

test('leading whitespace and newlines do not affect classification', () => {
  const result = classifyQuery('\n\n  SELECT * FROM dbo.T');
  assert.equal(result.kind, 'read');
});

test('trailing semicolon on SELECT does not cause multi-statement block', () => {
  const result = classifyQuery('SELECT * FROM dbo.T;');
  assert.equal(result.kind, 'read');
});

console.log('\nbuildLimitedReadQuery');

test('plain SELECT gets the row cap as TOP inside the statement', () => {
  const limited = buildLimitedReadQuery('SELECT * FROM dbo.T', 25);
  assert.equal(limited, 'SELECT TOP (25) * FROM dbo.T;');
});

// The old fallback wrapped reads in SELECT TOP (n) * FROM (<query>) AS __rowlimit_wrapper,
// which SQL Server rejects for unnamed columns (8155) and duplicate names (8156).
test('reads with unnamed or duplicate columns are never put in a derived table', () => {
  for (const [sql, expected] of [
    ['SELECT 1', 'SELECT TOP (25) 1;'],
    ['SELECT GETDATE()', 'SELECT TOP (25) GETDATE();'],
    ['SELECT a, a FROM dbo.T', 'SELECT TOP (25) a, a FROM dbo.T;']
  ]) {
    const limited = buildLimitedReadQuery(sql, 25);
    assert.equal(limited, expected);
    assert.ok(!limited.includes('__rowlimit_wrapper'));
  }
});

test('top-level ORDER BY uses OFFSET FETCH instead of invalid derived table wrapper', () => {
  const limited = buildLimitedReadQuery(`SELECT *
FROM dbo.TaskItems_TransformAndPersist
WHERE TargetItemID LIKE '%monthly%'
ORDER BY TaskID, TaskItemOrderInGroup, TargetItemID;`, 250);
  assert.ok(limited.includes('ORDER BY TaskID, TaskItemOrderInGroup, TargetItemID'));
  assert.ok(limited.endsWith('OFFSET 0 ROWS FETCH NEXT 250 ROWS ONLY;'));
  assert.ok(!limited.includes('__rowlimit_wrapper'));
});

test('top-level TOP with ORDER BY is left unchanged to avoid TOP plus OFFSET conflict', () => {
  const limited = buildLimitedReadQuery(`SELECT TOP 20
    TaskGroupID,
    Status,
    StartTimestampUTC,
    EndTimestampUTC,
    DATEDIFF(MINUTE, StartTimestampUTC, EndTimestampUTC) AS duration_minutes
FROM dbo.TaskGroupInstances
WHERE TaskGroupID = 'istadministration_mlv'
ORDER BY StartTimestampUTC DESC;`, 250);
  assert.ok(limited.includes('SELECT TOP 20'));
  assert.ok(limited.includes('ORDER BY StartTimestampUTC DESC'));
  assert.ok(!limited.includes('OFFSET'));
  assert.ok(!limited.includes('__rowlimit_wrapper'));
});

test('top-level ORDER BY with OFFSET but no FETCH gets a FETCH cap', () => {
  const limited = buildLimitedReadQuery('SELECT * FROM dbo.T ORDER BY Id OFFSET 10 ROWS', 25);
  assert.equal(limited, 'SELECT * FROM dbo.T ORDER BY Id OFFSET 10 ROWS\nFETCH NEXT 25 ROWS ONLY;');
});

test('CTE query with user TOP is not wrapped in an invalid derived table', () => {
  const limited = buildLimitedReadQuery(`WITH q AS (
  SELECT Id FROM dbo.T
)
SELECT TOP (100) *
FROM q
WHERE Id > 0;`, 25);
  assert.equal(limited, `WITH q AS (
  SELECT Id FROM dbo.T
)
SELECT TOP (100) *
FROM q
WHERE Id > 0;`);
  assert.ok(!limited.includes('__rowlimit_wrapper'));
});

test('CTE query without user TOP gets TOP on the final SELECT', () => {
  const limited = buildLimitedReadQuery(`WITH q AS (
  SELECT Id FROM dbo.T
)
SELECT *
FROM q`, 25);
  assert.equal(limited, `WITH q AS (
  SELECT Id FROM dbo.T
)
SELECT TOP (25) *
FROM q;`);
  assert.ok(!limited.includes('__rowlimit_wrapper'));
});

test('CTE with a top-level UNION ALL is not given an invalid inline TOP', () => {
  const sql = 'WITH q AS (SELECT 1 AS n) SELECT n FROM q UNION ALL SELECT 2 AS n';
  const limited = buildLimitedReadQuery(sql, 250);
  // `... UNION ALL TOP (250) SELECT ...` is rejected outright by SQL Server.
  assert.ok(!/UNION\s+ALL\s+TOP/i.test(limited));
  assert.equal(limited, `${sql};`);
});

test('CTE with a top-level set operator is left uncapped, not capped on one branch', () => {
  for (const operator of ['UNION', 'EXCEPT', 'INTERSECT']) {
    const sql = `WITH q AS (SELECT 1 AS n) SELECT n FROM q ${operator} SELECT 2 AS n`;
    const limited = buildLimitedReadQuery(sql, 250);
    assert.equal(limited, `${sql};`, `${operator} should not be rewritten`);
    assert.ok(!/TOP \(250\)/.test(limited), `${operator} must not cap only the first branch`);
  }
});

test('CTE with SELECT DISTINCT still receives the row cap after the modifier', () => {
  const limited = buildLimitedReadQuery('WITH q AS (SELECT 1 AS n) SELECT DISTINCT n FROM q', 25);
  assert.equal(limited, 'WITH q AS (SELECT 1 AS n) SELECT DISTINCT TOP (25) n FROM q;');
});

test('CTE with a set operator and top-level ORDER BY still gets an OFFSET/FETCH cap', () => {
  const limited = buildLimitedReadQuery(
    'WITH q AS (SELECT 1 AS n) SELECT n FROM q UNION ALL SELECT 2 AS n ORDER BY n',
    25
  );
  assert.ok(limited.endsWith('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY;'));
  assert.ok(!/UNION\s+ALL\s+TOP/i.test(limited));
});

test('a set operator inside a subquery does not disable the CTE row cap', () => {
  const limited = buildLimitedReadQuery(
    'WITH q AS (SELECT 1 AS n UNION ALL SELECT 2 AS n) SELECT n FROM q',
    25
  );
  assert.equal(limited, 'WITH q AS (SELECT 1 AS n UNION ALL SELECT 2 AS n) SELECT TOP (25) n FROM q;');
});

test('ORDER BY inside OVER does not trigger top-level ORDER BY handling', () => {
  const limited = buildLimitedReadQuery('SELECT ROW_NUMBER() OVER (ORDER BY Id) AS rn FROM dbo.T', 25);
  assert.equal(limited, 'SELECT TOP (25) ROW_NUMBER() OVER (ORDER BY Id) AS rn FROM dbo.T;');
});

test('ORDER BY inside a string does not trigger top-level ORDER BY handling', () => {
  const limited = buildLimitedReadQuery("SELECT 'ORDER BY Id' AS label FROM dbo.T", 25);
  assert.equal(limited, "SELECT TOP (25) 'ORDER BY Id' AS label FROM dbo.T;");
});

// ─── Trailing OPTION (...) query hints ──────────────────────────────────────
// T-SQL order is ORDER BY, OFFSET/FETCH, FOR, OPTION. Anything the cap adds goes in front of
// the hint; a cap after OPTION is a syntax error.

const RECURSIVE_MONTHS = `;WITH Months AS
(
    SELECT CAST('2025-01-01' AS date) AS MonthStart

    UNION ALL

    SELECT DATEADD(month, 1, MonthStart)
    FROM Months
    WHERE MonthStart < CAST('2026-07-01' AS date)
)
SELECT
    MonthStart
FROM Months
ORDER BY MonthStart
OPTION (MAXRECURSION 100);`;

test('CTE + ORDER BY + OPTION(MAXRECURSION): OFFSET/FETCH goes before the hint', () => {
  const limited = buildLimitedReadQuery(RECURSIVE_MONTHS, 251);
  assert.ok(limited.endsWith('ORDER BY MonthStart\nOFFSET 0 ROWS FETCH NEXT 251 ROWS ONLY\nOPTION (MAXRECURSION 100);'), limited);
  assert.ok(!/OPTION\s*\(MAXRECURSION 100\)\s*OFFSET/.test(limited), 'OFFSET/FETCH must not follow OPTION');
  assert.ok(limited.startsWith(';WITH Months AS'), 'the statement itself is not rewritten');
  assert.equal(classifyQuery(RECURSIVE_MONTHS).kind, 'read');
});

test('ORDER BY + OFFSET + OPTION: only FETCH is added, before the hint', () => {
  const limited = buildLimitedReadQuery('SELECT Id FROM dbo.T ORDER BY Id OFFSET 10 ROWS OPTION (RECOMPILE)', 25);
  assert.equal(limited, 'SELECT Id FROM dbo.T ORDER BY Id OFFSET 10 ROWS\nFETCH NEXT 25 ROWS ONLY\nOPTION (RECOMPILE);');
});

test('ORDER BY + OFFSET/FETCH + OPTION is left exactly as written', () => {
  const sql = 'SELECT Id FROM dbo.T ORDER BY Id OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY OPTION (RECOMPILE)';
  assert.equal(buildLimitedReadQuery(sql, 25), `${sql};`);
});

test('plain SELECT + OPTION(RECOMPILE) keeps the hint at statement level, not in a derived table', () => {
  const limited = buildLimitedReadQuery('SELECT a FROM dbo.T OPTION (RECOMPILE);', 25);
  assert.equal(limited, 'SELECT TOP (25) a FROM dbo.T\nOPTION (RECOMPILE);');
  assert.ok(!limited.includes('__rowlimit_wrapper'));
});

test('a hint with several options and nested parentheses is kept whole', () => {
  const limited = buildLimitedReadQuery("SELECT a FROM dbo.T WHERE b = @b ORDER BY a OPTION (OPTIMIZE FOR (@b = 1), MAXDOP 1)", 25);
  assert.ok(limited.endsWith('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY\nOPTION (OPTIMIZE FOR (@b = 1), MAXDOP 1);'), limited);
});

test('OPTION in a string, a comment or a subquery is not taken for the query hint', () => {
  for (const sql of [
    "SELECT 'OPTION (RECOMPILE)' AS t FROM dbo.T ORDER BY t",
    'SELECT a FROM dbo.T -- OPTION (RECOMPILE)\nORDER BY a',
    'SELECT a FROM dbo.T /* OPTION (RECOMPILE) */ ORDER BY a',
    'SELECT a FROM (SELECT a FROM dbo.T) AS s ORDER BY a',
    'SELECT [OPTION] FROM dbo.T ORDER BY [OPTION]'
  ]) {
    assert.deepEqual(splitTrailingQueryHint(sql), { body: sql, hint: '' }, sql);
    assert.ok(buildLimitedReadQuery(sql, 25).endsWith('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY;'), sql);
  }
});

test('an OPTION clause of unexpected shape leaves the statement unchanged', () => {
  for (const sql of [
    'SELECT a FROM dbo.T ORDER BY a OPTION (RECOMPILE) FOR XML PATH',
    'SELECT a FROM dbo.T ORDER BY a OPTION RECOMPILE',
    'SELECT a FROM dbo.T ORDER BY a OPTION (RECOMPILE) OPTION (MAXDOP 1)'
  ]) {
    assert.equal(splitTrailingQueryHint(sql), null, sql);
    assert.equal(buildLimitedReadQuery(sql, 25), `${sql};`, sql);
  }
});

test('a trailing comment after the hint does not stop the cap going in front of it', () => {
  const limited = buildLimitedReadQuery('SELECT a FROM dbo.T ORDER BY a OPTION (RECOMPILE) -- keep plan fresh', 25);
  assert.ok(limited.includes('OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY\nOPTION (RECOMPILE)'), limited);
});

test('a top-level set operator without ORDER BY is left unchanged, hint and all', () => {
  const sql = 'SELECT a FROM dbo.T UNION ALL SELECT a FROM dbo.U OPTION (RECOMPILE)';
  assert.equal(buildLimitedReadQuery(sql, 25), `${sql};`);
});

test('a leading-semicolon CTE without ORDER BY gets TOP on its final SELECT', () => {
  const limited = buildLimitedReadQuery(';WITH q AS (SELECT 1 AS n) SELECT n FROM q OPTION (MAXRECURSION 10)', 25);
  assert.equal(limited, ';WITH q AS (SELECT 1 AS n) SELECT TOP (25) n FROM q\nOPTION (MAXRECURSION 10);');
});

test('a read with no top-level SELECT is left unchanged rather than guessed at', () => {
  const sql = '(SELECT a FROM dbo.T)';
  assert.equal(buildLimitedReadQuery(sql, 25), `${sql};`);
});

// ─── analyzeSingleTableSelect — row-editability shape analysis ──────────────

console.log('\nanalyzeSingleTableSelect');

test('SELECT * FROM a bracketed table is editable with columns:null', () => {
  const result = analyzeSingleTableSelect('SELECT * FROM [dbo].[Alerts]');
  assert.equal(result.ok, true);
  assert.equal(result.schemaName, 'dbo');
  assert.equal(result.objectName, 'Alerts');
  assert.equal(result.columns, null);
});

test('a generated builder-style SELECT with TOP, WHERE, ORDER BY is editable', () => {
  const result = analyzeSingleTableSelect(
    'SELECT TOP (100)\n       [AlertId],\n       [Status]\nFROM [dbo].[Alerts]\nWHERE [Status] = \'x\'\nORDER BY [AlertId] DESC;'
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.columns, ['AlertId', 'Status']);
});

test('bare TOP n (no parens) is handled, including TOP n PERCENT', () => {
  assert.equal(analyzeSingleTableSelect('SELECT TOP 50 AlertId FROM dbo.Alerts').ok, true);
  assert.equal(analyzeSingleTableSelect('SELECT TOP 50 PERCENT AlertId FROM dbo.Alerts').ok, true);
});

test('SELECT ALL is editable like a plain SELECT', () => {
  assert.equal(analyzeSingleTableSelect('SELECT ALL AlertId FROM dbo.Alerts').ok, true);
});

test('a plain column name that itself contains a dot, fully inside one bracket, is editable', () => {
  const result = analyzeSingleTableSelect('SELECT [My.Column] FROM [sales].[My.Report]');
  assert.equal(result.ok, true);
  assert.equal(result.schemaName, 'sales');
  assert.equal(result.objectName, 'My.Report');
  assert.deepEqual(result.columns, ['My.Column']);
});

test('a table alias with or without AS is rejected', () => {
  assert.equal(analyzeSingleTableSelect('SELECT AlertId FROM [dbo].[Alerts] t').ok, false);
  assert.equal(analyzeSingleTableSelect('SELECT AlertId FROM dbo.Alerts AS t').ok, false);
});

test('JOIN, UNION, and GROUP BY are rejected', () => {
  assert.equal(analyzeSingleTableSelect('SELECT AlertId FROM dbo.Alerts JOIN dbo.Other o ON 1=1').ok, false);
  assert.equal(analyzeSingleTableSelect('SELECT * FROM dbo.A UNION SELECT * FROM dbo.B').ok, false);
  assert.equal(analyzeSingleTableSelect('SELECT AlertId FROM dbo.Alerts GROUP BY AlertId').ok, false);
});

test('SELECT DISTINCT and aggregate results are rejected', () => {
  assert.equal(analyzeSingleTableSelect('SELECT DISTINCT Status FROM dbo.Alerts').ok, false);
  assert.equal(analyzeSingleTableSelect('SELECT COUNT(*) AS n FROM dbo.Alerts').ok, false);
});

test('a column AS alias or expression disables editing for the whole query', () => {
  assert.equal(analyzeSingleTableSelect('SELECT AlertId, Status AS S FROM dbo.Alerts').ok, false);
  assert.equal(analyzeSingleTableSelect('SELECT AlertId + 1 FROM dbo.Alerts').ok, false);
});

test('two dot-separated bracket groups in the select list is a schema-qualified reference, not a plain column, and is rejected', () => {
  assert.equal(analyzeSingleTableSelect('SELECT [a].[b] FROM dbo.T').ok, false);
});

test('a leading CTE is rejected', () => {
  assert.equal(analyzeSingleTableSelect('WITH q AS (SELECT 1 AS n) SELECT n FROM q').ok, false);
});

test('a derived-table FROM subquery is rejected', () => {
  assert.equal(analyzeSingleTableSelect('SELECT * FROM (SELECT 1 AS n) x').ok, false);
});

test('a table-valued function call after FROM is rejected', () => {
  assert.equal(analyzeSingleTableSelect('SELECT * FROM dbo.fn_Something(1)').ok, false);
});

test('a write statement is rejected', () => {
  assert.equal(analyzeSingleTableSelect('UPDATE dbo.T SET a = 1').ok, false);
});

test('a trailing semicolon and a trailing OPTION query hint do not affect editability', () => {
  assert.equal(analyzeSingleTableSelect('SELECT AlertId FROM dbo.Alerts;').ok, true);
  assert.equal(analyzeSingleTableSelect('SELECT AlertId FROM dbo.Alerts OPTION (RECOMPILE)').ok, true);
});

// ─── lexer: quoted identifiers, ]] escapes, nested comments ─────────────────
//
// Each of these used to let a stray quote open a fake string literal that hid
// the real keywords after it from the classifier.

console.log('\nlexer hardening');

test('an EXEC after a nested block comment containing a quote is not hidden inside a single UPDATE', () => {
  const result = classifyQuery("UPDATE dbo.T SET /* /* */ ' */ a = 1 WHERE b = 'z'; EXEC dbo.p");
  assert.equal(result.kind, 'write');
  assert.equal(result.action, 'BATCH');
  assert.equal(result.statementCount, 2);
  assert.ok(result.highRiskActions.includes('EXEC'));
});

test('nested block comments are stripped as one comment', () => {
  assert.equal(stripCommentsAndTrim('SELECT /* a /* b */ DROP */ 1'), 'SELECT   1');
  assert.ok(!tokenizeSql('SELECT /* a /* b */ DROP */ 1').includes('DROP'));
});

test('a quote inside a double-quoted identifier does not open a string', () => {
  const tokens = tokenizeSql('SELECT 1 AS "it\'s" INTO dbo.New FROM dbo.T');
  assert.ok(tokens.includes('INTO'));
  assert.ok(tokens.includes('NEW'));
});

test('a quote after a ]] escape inside a bracket identifier does not open a string', () => {
  const tokens = tokenizeSql("SELECT 1 AS [a]]'b] INTO dbo.New FROM dbo.T WHERE c = 'x'");
  assert.ok(tokens.includes('INTO'));
});

test('INSERT ... EXEC with a quote in a double-quoted column still sees the EXEC', () => {
  const result = classifyQuery('INSERT INTO dbo.T ("it\'s") EXEC dbo.Proc \'x\'');
  assert.equal(result.kind, 'write');
  assert.equal(result.directConfirmOnly, true);
  assert.equal(result.requiresAcknowledgement, true);
});

test('semicolons inside bracket and double-quoted identifiers are not splitters', () => {
  assert.equal(splitStatements('SELECT [a;b] FROM t').length, 1);
  assert.equal(splitStatements('SELECT "a;b" FROM t').length, 1);
  assert.equal(classifyQuery('SELECT [a;b] FROM t').kind, 'read');
});

test('keywords inside quoted identifiers are not tokens', () => {
  assert.ok(!tokenizeSql('SELECT "DROP" FROM t').includes('DROP'));
  assert.equal(classifyQuery('SELECT "DROP" FROM t').kind, 'read');
});

for (const [label, query] of [
  ['string', "SELECT 'abc FROM t"],
  ['bracket identifier', 'SELECT [abc FROM t'],
  ['double-quoted identifier', 'SELECT "abc FROM t'],
  ['block comment', 'SELECT 1 /* never closed']
]) {
  test(`an unterminated ${label} fails closed to a confirmed write`, () => {
    const result = classifyQuery(query);
    assert.equal(result.kind, 'write');
    assert.equal(result.directConfirmOnly, true);
    assert.equal(result.requiresAcknowledgement, true);
  });
}

// ─── SELECT ... INTO ─────────────────────────────────────────────────────────

console.log('\nSELECT ... INTO');

for (const query of [
  'SELECT * INTO dbo.New FROM dbo.T',
  'SELECT * INTO dbo.New FROM dbo.T ORDER BY Id',
  'SELECT * INTO dbo.New FROM dbo.T WHERE Id > 5',
  'SELECT TOP (5) * INTO dbo.New FROM dbo.T',
  'SELECT DISTINCT a INTO dbo.New FROM dbo.T',
  'SELECT * INTO [dbo].[New] FROM dbo.T',
  'SELECT * INTO #tmp FROM dbo.T',
  'select *\n-- copy\ninto dbo.New from dbo.T',
  'SELECT a INTO dbo.N FROM dbo.T UNION SELECT a FROM dbo.U',
  'WITH x AS (SELECT 1 AS n) SELECT * INTO dbo.New FROM x',
  'SELECT 1 AS "it\'s" INTO dbo.New FROM dbo.T WHERE x = \'y\'',
  "SELECT 1 AS [a]]'b] INTO dbo.New FROM dbo.T WHERE c = 'x'",
  "SELECT /* /* */ ' */ * INTO dbo.N FROM dbo.T WHERE a = 'z'"
]) {
  test(`SELECT INTO is a confirmed high-risk write: ${query.replace(/\s+/g, ' ').slice(0, 60)}`, () => {
    const result = classifyQuery(query);
    assert.equal(result.kind, 'write');
    assert.equal(result.action, 'SELECT INTO');
    assert.equal(result.directConfirmOnly, true);
    assert.equal(result.requiresAcknowledgement, true);
    assert.deepEqual(result.highRiskActions, ['SELECT INTO']);
  });
}

for (const query of [
  "SELECT 'INTO' FROM t",
  'SELECT [INTO] FROM t',
  'SELECT "INTO" FROM t',
  '-- INTO x\nSELECT 1',
  "SELECT * FROM t FOR XML PATH('into')",
  'SELECT (SELECT 1 FOR XML PATH) AS x',
  'SELECT @v = a FROM t'
]) {
  test(`stays a read: ${query.replace(/\s+/g, ' ')}`, () => {
    assert.equal(classifyQuery(query).kind, 'read');
  });
}

test('a batch containing SELECT INTO lists it as a high-risk action', () => {
  const result = classifyQuery('SELECT 1; SELECT * INTO dbo.N FROM t');
  assert.equal(result.action, 'BATCH');
  assert.ok(result.highRiskActions.includes('SELECT INTO'));
});

test('SELECT INTO results are not editable', () => {
  assert.equal(analyzeSingleTableSelect('SELECT * INTO dbo.N FROM dbo.T').ok, false);
});

// ─── buildPreviewOutputQuery ─────────────────────────────────────────────────

console.log('\nbuildPreviewOutputQuery');

// The rewrite must only ever add the OUTPUT clause: stripping it back out has to give the
// original token stream, which proves it never landed inside a literal or identifier.
function assertOnlyOutputAdded(original, rewritten) {
  const withoutOutput = rewritten.replace(/\nOUTPUT (?:deleted\.\*, inserted\.\*|deleted\.\*|inserted\.\*)(?:\n|$)/, ' ');
  assert.deepEqual(tokenizeSql(withoutOutput), tokenizeSql(original.replace(/;+\s*$/, '')));
}

for (const [label, query, expected, mode] of [
  ['UPDATE with WHERE', 'UPDATE dbo.T SET a = 1 WHERE b = 2', 'UPDATE dbo.T SET a = 1\nOUTPUT deleted.*, inserted.*\nWHERE b = 2', 'update'],
  ['UPDATE with FROM join', 'UPDATE t SET a = u.a FROM dbo.T t JOIN dbo.U u ON u.id = t.id', 'UPDATE t SET a = u.a\nOUTPUT deleted.*, inserted.*\nFROM dbo.T t JOIN dbo.U u ON u.id = t.id', 'update'],
  ['UPDATE with a subquery in SET', 'UPDATE dbo.T SET a = (SELECT MAX(b) FROM dbo.U WHERE c = 1) WHERE d = 2', 'UPDATE dbo.T SET a = (SELECT MAX(b) FROM dbo.U WHERE c = 1)\nOUTPUT deleted.*, inserted.*\nWHERE d = 2', 'update'],
  ["UPDATE with 'WHERE' in a literal", "UPDATE dbo.T SET note = 'WHERE x' WHERE id = 1", "UPDATE dbo.T SET note = 'WHERE x'\nOUTPUT deleted.*, inserted.*\nWHERE id = 1", 'update'],
  ['UPDATE with a [Where] column', 'UPDATE dbo.T SET [Where] = 1 WHERE id = 1', 'UPDATE dbo.T SET [Where] = 1\nOUTPUT deleted.*, inserted.*\nWHERE id = 1', 'update'],
  ['UPDATE with OPTION and no WHERE', 'UPDATE dbo.T SET a = 1 OPTION (MAXDOP 1);', 'UPDATE dbo.T SET a = 1\nOUTPUT deleted.*, inserted.*\nOPTION (MAXDOP 1)', 'update'],
  ['UPDATE without WHERE', 'UPDATE dbo.T SET a = 1', 'UPDATE dbo.T SET a = 1\nOUTPUT deleted.*, inserted.*', 'update'],
  ['DELETE FROM with WHERE', 'DELETE FROM dbo.T WHERE id = 1', 'DELETE FROM dbo.T\nOUTPUT deleted.*\nWHERE id = 1', 'delete'],
  ['DELETE with a table hint', 'DELETE FROM dbo.T WITH (ROWLOCK) WHERE id = 1', 'DELETE FROM dbo.T WITH (ROWLOCK)\nOUTPUT deleted.*\nWHERE id = 1', 'delete'],
  ['DELETE alias FROM join', 'DELETE t FROM dbo.T t JOIN dbo.U u ON u.id = t.id', 'DELETE t\nOUTPUT deleted.*\nFROM dbo.T t JOIN dbo.U u ON u.id = t.id', 'delete'],
  ['DELETE without FROM keyword', 'DELETE dbo.T WHERE id = 1', 'DELETE dbo.T\nOUTPUT deleted.*\nWHERE id = 1', 'delete'],
  ['INSERT VALUES', 'INSERT INTO dbo.T (a, b) VALUES (1, 2)', 'INSERT INTO dbo.T (a, b)\nOUTPUT inserted.*\nVALUES (1, 2)', 'insert'],
  ['INSERT SELECT', 'INSERT INTO dbo.T (a) SELECT a FROM dbo.U WHERE b = 1', 'INSERT INTO dbo.T (a)\nOUTPUT inserted.*\nSELECT a FROM dbo.U WHERE b = 1', 'insert'],
  ['INSERT DEFAULT VALUES', 'INSERT dbo.T DEFAULT VALUES', 'INSERT dbo.T\nOUTPUT inserted.*\nDEFAULT VALUES', 'insert'],
  ['INSERT with a table hint', 'INSERT INTO dbo.T WITH (TABLOCK) (a) VALUES (1)', 'INSERT INTO dbo.T WITH (TABLOCK) (a)\nOUTPUT inserted.*\nVALUES (1)', 'insert']
]) {
  test(`OUTPUT placement: ${label}`, () => {
    const result = buildPreviewOutputQuery(query);
    assert.deepEqual(result, { text: expected, mode });
    assertOnlyOutputAdded(query, result.text);
  });
}

for (const [label, query] of [
  ['a read', 'SELECT * FROM dbo.T'],
  ['a CTE-led write', 'WITH x AS (SELECT 1 AS id) DELETE FROM dbo.T WHERE id IN (SELECT id FROM x)'],
  ['MERGE', 'MERGE dbo.T AS t USING dbo.U AS u ON t.id = u.id WHEN MATCHED THEN DELETE;'],
  ['UPDATE TOP', 'UPDATE TOP (5) dbo.T SET a = 1'],
  ['DELETE TOP', 'DELETE TOP (5) FROM dbo.T'],
  ['an existing OUTPUT', 'DELETE FROM dbo.T OUTPUT deleted.id WHERE id = 1'],
  ['INSERT ... EXEC', 'INSERT INTO dbo.T (a) EXEC dbo.p'],
  ['OPENQUERY target', "UPDATE OPENQUERY(linked, 'SELECT a FROM t') SET a = 1"],
  ['UPDATE STATISTICS', 'UPDATE STATISTICS dbo.T'],
  ['INSERT with a parenthesised SELECT only', 'INSERT INTO dbo.T (a) (SELECT 1)'],
  ['two statements', 'DELETE FROM dbo.T WHERE id = 1; DELETE FROM dbo.U WHERE id = 1'],
  ['unterminated text', "UPDATE dbo.T SET a = 'x WHERE id = 1"],
  ['empty', '']
]) {
  test(`no OUTPUT rewrite for ${label}`, () => {
    assert.equal(buildPreviewOutputQuery(query), null);
  });
}

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
