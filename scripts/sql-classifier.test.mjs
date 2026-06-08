/**
 * sql-classifier.test.mjs
 *
 * Unit tests for the safety-critical SQL tokeniser and classifier.
 * Run with:  node scripts/sql-classifier.test.mjs
 *
 * No test framework required — uses Node's built-in assert module.
 */

import assert from 'node:assert/strict';
import { buildLimitedReadQuery, classifyQuery, stripCommentsAndTrim, tokenizeSql, splitStatements } from '../lib/server/sql-classifier.js';

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

// ─── classifyQuery — blocked writes ──────────────────────────────────────────

console.log('\nclassifyQuery — blocked writes');

const hardBlocked = ['TRUNCATE', 'DROP', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];

for (const keyword of hardBlocked) {
  test(`${keyword} is classified as write with directConfirmOnly`, () => {
    const result = classifyQuery(`${keyword} TABLE dbo.Foo`);
    assert.equal(result.kind, 'write');
    assert.equal(result.action, keyword);
    assert.equal(result.directConfirmOnly, true);
  });
}

test('EXEC is classified as directConfirmOnly write', () => {
  const result = classifyQuery('EXEC dbo.MyProc @p1 = 1');
  assert.equal(result.kind, 'write');
  assert.equal(result.directConfirmOnly, true);
});

test('EXECUTE is classified as directConfirmOnly write', () => {
  const result = classifyQuery('EXECUTE dbo.MyProc');
  assert.equal(result.kind, 'write');
  assert.equal(result.directConfirmOnly, true);
});

test('MERGE is classified as directConfirmOnly write', () => {
  const result = classifyQuery('MERGE dbo.Target AS tgt USING dbo.Source AS src ON tgt.id = src.id');
  assert.equal(result.kind, 'write');
  assert.equal(result.directConfirmOnly, true);
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
});

// ─── classifyQuery — multi-statement blocking ─────────────────────────────────

console.log('\nclassifyQuery — multi-statement blocking');

test('two statements separated by semicolon are blocked', () => {
  const result = classifyQuery('SELECT 1; SELECT 2');
  assert.equal(result.kind, 'blocked');
});

test('DROP after SELECT in same batch is blocked', () => {
  const result = classifyQuery('SELECT 1; DROP TABLE dbo.T');
  assert.equal(result.kind, 'blocked');
});

test('T-SQL IF block with internal semicolons is blocked with batch guidance', () => {
  const result = classifyQuery(`
IF NOT EXISTS (SELECT 1 FROM dbo.Tasks WHERE TaskID = 'x')
BEGIN
  INSERT INTO dbo.Tasks (TaskID) VALUES ('x');
END;
`);
  assert.equal(result.kind, 'blocked');
  assert.ok(result.reason.includes('IF/BEGIN/END'));
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

test('plain SELECT is wrapped with server row cap', () => {
  const limited = buildLimitedReadQuery('SELECT * FROM dbo.T', 25);
  assert.equal(limited, 'SELECT TOP (25) * FROM (\nSELECT * FROM dbo.T\n) AS __rowlimit_wrapper;');
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

test('ORDER BY inside OVER does not trigger top-level ORDER BY handling', () => {
  const limited = buildLimitedReadQuery('SELECT ROW_NUMBER() OVER (ORDER BY Id) AS rn FROM dbo.T', 25);
  assert.ok(limited.startsWith('SELECT TOP (25) * FROM ('));
});

test('ORDER BY inside a string does not trigger top-level ORDER BY handling', () => {
  const limited = buildLimitedReadQuery("SELECT 'ORDER BY Id' AS label FROM dbo.T", 25);
  assert.ok(limited.startsWith('SELECT TOP (25) * FROM ('));
});

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
