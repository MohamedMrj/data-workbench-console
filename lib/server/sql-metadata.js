import sql from 'mssql';

export function mapRecordset(result, responseRowLimit) {
  const rows = Array.isArray(result?.recordset) ? result.recordset : [];
  const metadataColumns = result?.recordset?.columns && typeof result.recordset.columns === 'object'
    ? Object.keys(result.recordset.columns)
    : [];
  const columns = rows.length > 0
    ? Object.keys(rows[0])
    : metadataColumns;
  return {
    columns,
    rows: rows.slice(0, responseRowLimit),
    totalRows: rows.length,
    truncated: rows.length > responseRowLimit
  };
}

export function sumRowsAffected(result) {
  return Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((sum, value) => sum + Number(value || 0), 0)
    : 0;
}

export function parseQualifiedObjectName(name) {
  const cleaned = String(name || '')
    .replace(/\[/g, '')
    .replace(/\]/g, '')
    .trim();

  const parts = cleaned
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);

  const objectName = parts.at(-1) || '';
  const schemaName = parts.length >= 2 ? parts.at(-2) : 'dbo';
  return { schemaName, objectName, fullName: objectName ? `${schemaName}.${objectName}` : '' };
}

export function quoteIdentifier(value) {
  return `[${String(value || '').replace(/]/g, ']]')}]`;
}

function quoteStringLiteral(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

export function quoteQualifiedObjectName(name) {
  const parsed = parseQualifiedObjectName(name);
  if (!parsed.objectName) {
    throw new Error('Object name is required.');
  }
  return `${quoteIdentifier(parsed.schemaName)}.${quoteIdentifier(parsed.objectName)}`;
}

function quoteSparkIdentifier(value) {
  return `\`${String(value || '').replace(/`/g, '``')}\``;
}

function quoteSparkQualifiedObjectName(name) {
  const parsed = parseQualifiedObjectName(name);
  if (!parsed.objectName) {
    throw new Error('Object name is required.');
  }
  return `${quoteSparkIdentifier(parsed.schemaName)}.${quoteSparkIdentifier(parsed.objectName)}`;
}

function isUnsupportedPartitionStatsError(error) {
  return /dm_db_partition_stats|Dynamic Management View|not supported/i.test(String(error?.message || ''));
}

function isUnsupportedDependenciesError(error) {
  return /sql_expression_dependencies|Dynamic Management View|not supported|Invalid object name/i.test(String(error?.message || ''));
}

function isUnsupportedTableMetadataError(error) {
  return /dm_db_partition_stats|sys\.indexes|sys\.foreign_keys|sys\.check_constraints|Dynamic Management View|not supported/i.test(String(error?.message || ''));
}

function createUnsupportedMetadataError(message, originalError) {
  const error = new Error(message);
  error.httpStatus = 400;
  error.code = originalError?.code || null;
  return error;
}

function normalizeScriptMode(scriptMode) {
  return /^create$/i.test(String(scriptMode || '').trim()) ? 'create' : 'alter';
}

function normalizeObjectDefinitionType(objectType) {
  const normalized = String(objectType || '').trim().toLowerCase();
  if (['table', 'view', 'procedure'].includes(normalized)) {
    return normalized;
  }
  const error = new Error('Object type must be table, view, or procedure.');
  error.httpStatus = 400;
  throw error;
}

function objectTypePredicate(objectType) {
  if (objectType === 'table') {
    return "obj.type = 'U'";
  }
  if (objectType === 'view') {
    return "obj.type = 'V'";
  }
  return "obj.type = 'P'";
}

function createNotFoundError(objectType, fullName) {
  const error = new Error(`${objectType[0].toUpperCase() + objectType.slice(1)} ${fullName} was not found.`);
  error.httpStatus = 404;
  return error;
}

export function normalizeProcedureName(procedure) {
  const parsed = parseQualifiedObjectName(procedure);
  return {
    schemaName: parsed.schemaName,
    procedureName: parsed.objectName,
    fullName: parsed.fullName
  };
}

export function normalizeParameterPayload(parameters = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(parameters || {})) {
    const cleanKey = String(key || '').replace(/^@/, '').trim();
    if (!cleanKey) {
      continue;
    }
    normalized[cleanKey] = value == null ? '' : String(value);
  }
  return normalized;
}

export async function loadObjects(pool) {
  const result = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      AND TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
      AND TABLE_NAME <> 'sysdiagrams'
    ORDER BY CASE WHEN TABLE_TYPE = 'BASE TABLE' THEN 0 ELSE 1 END, TABLE_SCHEMA, TABLE_NAME;
  `);

  return result.recordset.map((row) => ({
    schema: row.TABLE_SCHEMA,
    name: row.TABLE_NAME,
    objectType: row.TABLE_TYPE === 'VIEW' ? 'view' : 'table',
    fullName: `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
    table: row.TABLE_NAME
  }));
}

export async function loadColumnsForObject(pool, objectName) {
  const parsed = parseQualifiedObjectName(objectName);
  if (!parsed.objectName) {
    throw new Error('Object name is required.');
  }

  const result = await pool.request()
    .input('schemaName', sql.NVarChar, parsed.schemaName)
    .input('objectName', sql.NVarChar, parsed.objectName)
    .query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, ORDINAL_POSITION
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @objectName
      ORDER BY ORDINAL_POSITION;
    `);

  return result.recordset.map((row) => ({
    name: row.COLUMN_NAME,
    type: row.DATA_TYPE,
    nullable: row.IS_NULLABLE === 'YES'
  }));
}

function renderColumnDataType(column) {
  const dataType = String(column.data_type || '').toLowerCase();
  const maxLength = Number(column.max_length);
  const precision = Number(column.precision_value);
  const scale = Number(column.scale_value);
  const usesWideChars = dataType.startsWith('n');
  const normalizedLength = maxLength < 0
    ? -1
    : usesWideChars && maxLength > 0
      ? maxLength / 2
      : maxLength;

  if (['varchar', 'nvarchar', 'char', 'nchar', 'binary', 'varbinary'].includes(dataType)) {
    return `${dataType.toUpperCase()}(${normalizedLength < 0 ? 'MAX' : Math.max(1, normalizedLength || 1)})`;
  }
  if (['decimal', 'numeric'].includes(dataType)) {
    return `${dataType.toUpperCase()}(${Math.max(1, precision || 18)}, ${Math.max(0, scale || 0)})`;
  }
  if (['datetime2', 'datetimeoffset', 'time'].includes(dataType)) {
    return Number.isFinite(scale) ? `${dataType.toUpperCase()}(${scale})` : dataType.toUpperCase();
  }
  return dataType.toUpperCase();
}

function renderColumnDefinition(column) {
  if (column.is_computed) {
    const persisted = column.is_persisted ? ' PERSISTED' : '';
    const nullable = column.is_nullable ? ' NULL' : ' NOT NULL';
    return `    ${quoteIdentifier(column.column_name)} AS ${column.computed_definition || '(/* unavailable */)'}${persisted}${nullable}`;
  }
  const identity = column.is_identity
    ? ` IDENTITY(${Number(column.seed_value ?? 1)}, ${Number(column.increment_value ?? 1)})`
    : '';
  const defaultDefinition = column.default_definition ? ` DEFAULT ${column.default_definition}` : '';
  const nullability = column.is_nullable ? 'NULL' : 'NOT NULL';
  return `    ${quoteIdentifier(column.column_name)} ${renderColumnDataType(column)}${identity}${defaultDefinition} ${nullability}`;
}

function renderIndexColumns(indexColumns = [], includeColumns = false) {
  return indexColumns
    .filter((column) => Boolean(column.is_included_column) === includeColumns)
    .sort((left, right) => Number(left.key_ordinal || left.index_column_id || 0) - Number(right.key_ordinal || right.index_column_id || 0))
    .map((column) => `${quoteIdentifier(column.column_name)}${includeColumns ? '' : (column.is_descending_key ? ' DESC' : ' ASC')}`)
    .join(', ');
}

function renderConstraintLine(constraint, indexColumns) {
  const type = constraint.type === 'PK' ? 'PRIMARY KEY' : 'UNIQUE';
  const clustered = constraint.index_type === 1 ? 'CLUSTERED' : 'NONCLUSTERED';
  const columns = renderIndexColumns(indexColumns.filter((column) => column.index_id === constraint.unique_index_id));
  if (!columns) {
    return '';
  }
  return `    CONSTRAINT ${quoteIdentifier(constraint.name)} ${type} ${clustered} (${columns})`;
}

function renderIndexStatement(index, indexColumns, tableName) {
  const keyColumns = renderIndexColumns(indexColumns.filter((column) => column.index_id === index.index_id));
  if (!keyColumns) {
    return '';
  }
  const includeColumns = renderIndexColumns(indexColumns.filter((column) => column.index_id === index.index_id), true);
  const unique = index.is_unique ? 'UNIQUE ' : '';
  const type = index.type === 1 ? 'CLUSTERED' : index.type === 5 ? 'CLUSTERED COLUMNSTORE' : index.type === 6 ? 'NONCLUSTERED COLUMNSTORE' : 'NONCLUSTERED';
  const include = includeColumns ? `\nINCLUDE (${includeColumns})` : '';
  const filter = index.has_filter && index.filter_definition ? `\nWHERE ${index.filter_definition}` : '';
  return `CREATE ${unique}${type} INDEX ${quoteIdentifier(index.name)}\nON ${tableName} (${keyColumns})${include}${filter};`;
}

function renderForeignKeyStatement(foreignKey, columns, tableName) {
  const scoped = columns
    .filter((column) => column.constraint_object_id === foreignKey.object_id)
    .sort((left, right) => Number(left.constraint_column_id || 0) - Number(right.constraint_column_id || 0));
  const localColumns = scoped.map((column) => quoteIdentifier(column.parent_column_name)).join(', ');
  const referencedColumns = scoped.map((column) => quoteIdentifier(column.referenced_column_name)).join(', ');
  const referencedTable = `${quoteIdentifier(foreignKey.referenced_schema_name)}.${quoteIdentifier(foreignKey.referenced_table_name)}`;
  if (!localColumns || !referencedColumns) {
    return '';
  }
  const notTrusted = foreignKey.is_not_trusted ? ' WITH NOCHECK' : '';
  const deleteAction = foreignKey.delete_referential_action_desc && foreignKey.delete_referential_action_desc !== 'NO_ACTION'
    ? `\n    ON DELETE ${foreignKey.delete_referential_action_desc.replace(/_/g, ' ')}`
    : '';
  const updateAction = foreignKey.update_referential_action_desc && foreignKey.update_referential_action_desc !== 'NO_ACTION'
    ? `\n    ON UPDATE ${foreignKey.update_referential_action_desc.replace(/_/g, ' ')}`
    : '';
  return `ALTER TABLE ${tableName}${notTrusted}\nADD CONSTRAINT ${quoteIdentifier(foreignKey.name)} FOREIGN KEY (${localColumns})\n    REFERENCES ${referencedTable} (${referencedColumns})${deleteAction}${updateAction};`;
}

export async function loadTableMetadataSnapshot(pool, objectName) {
  const parsed = parseQualifiedObjectName(objectName);
  if (!parsed.objectName) {
    throw new Error('Object name is required.');
  }

  const request = () => pool.request()
    .input('schemaName', sql.NVarChar, parsed.schemaName)
    .input('objectName', sql.NVarChar, parsed.objectName);

  const [tableResult, columnsResult, constraintsResult, checksResult, indexesResult, indexColumnsResult, foreignKeysResult, foreignKeyColumnsResult, rowCountResult] = await Promise.all([
    request().query(`
      SELECT tbl.object_id, sch.name AS schema_name, tbl.name AS table_name, tbl.create_date, tbl.modify_date
      FROM sys.tables tbl
      INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
      WHERE sch.name = @schemaName AND tbl.name = @objectName;
    `),
    request().query(`
      SELECT
        c.name AS column_name,
        typ.name AS data_type,
        c.max_length,
        c.precision AS precision_value,
        c.scale AS scale_value,
        c.is_nullable,
        c.is_identity,
        c.is_computed,
        cc.definition AS computed_definition,
        cc.is_persisted,
        ic.seed_value,
        ic.increment_value,
        dc.name AS default_name,
        dc.definition AS default_definition,
        c.column_id
      FROM sys.tables tbl
      INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
      INNER JOIN sys.columns c ON tbl.object_id = c.object_id
      INNER JOIN sys.types typ ON c.user_type_id = typ.user_type_id
      LEFT JOIN sys.computed_columns cc ON c.object_id = cc.object_id AND c.column_id = cc.column_id
      LEFT JOIN sys.identity_columns ic ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
      WHERE sch.name = @schemaName AND tbl.name = @objectName
      ORDER BY c.column_id;
    `),
    request().query(`
      SELECT kc.name, kc.type, kc.unique_index_id, idx.type AS index_type
      FROM sys.key_constraints kc
      INNER JOIN sys.tables tbl ON kc.parent_object_id = tbl.object_id
      INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
      INNER JOIN sys.indexes idx ON kc.parent_object_id = idx.object_id AND kc.unique_index_id = idx.index_id
      WHERE sch.name = @schemaName AND tbl.name = @objectName
      ORDER BY CASE WHEN kc.type = 'PK' THEN 0 ELSE 1 END, kc.name;
    `),
    request().query(`
      SELECT chk.name, chk.definition, chk.is_disabled, chk.is_not_trusted
      FROM sys.check_constraints chk
      INNER JOIN sys.tables tbl ON chk.parent_object_id = tbl.object_id
      INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
      WHERE sch.name = @schemaName AND tbl.name = @objectName
      ORDER BY chk.name;
    `),
    request().query(`
      SELECT idx.index_id, idx.name, idx.type, idx.type_desc, idx.is_unique, idx.is_primary_key, idx.is_unique_constraint, idx.has_filter, idx.filter_definition
      FROM sys.indexes idx
      INNER JOIN sys.tables tbl ON idx.object_id = tbl.object_id
      INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
      WHERE sch.name = @schemaName
        AND tbl.name = @objectName
        AND idx.index_id > 0
        AND idx.is_hypothetical = 0
        AND idx.is_primary_key = 0
        AND idx.is_unique_constraint = 0
      ORDER BY idx.index_id;
    `),
    request().query(`
      SELECT idx.index_id, ic.index_column_id, ic.key_ordinal, ic.is_included_column, ic.is_descending_key, col.name AS column_name
      FROM sys.indexes idx
      INNER JOIN sys.index_columns ic ON idx.object_id = ic.object_id AND idx.index_id = ic.index_id
      INNER JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
      INNER JOIN sys.tables tbl ON idx.object_id = tbl.object_id
      INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
      WHERE sch.name = @schemaName AND tbl.name = @objectName
      ORDER BY idx.index_id, ic.key_ordinal, ic.index_column_id;
    `),
    request().query(`
      SELECT fk.object_id, fk.name, fk.is_disabled, fk.is_not_trusted,
        fk.delete_referential_action_desc, fk.update_referential_action_desc,
        referenced_schema.name AS referenced_schema_name,
        referenced_table.name AS referenced_table_name
      FROM sys.foreign_keys fk
      INNER JOIN sys.tables tbl ON fk.parent_object_id = tbl.object_id
      INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
      INNER JOIN sys.tables referenced_table ON fk.referenced_object_id = referenced_table.object_id
      INNER JOIN sys.schemas referenced_schema ON referenced_table.schema_id = referenced_schema.schema_id
      WHERE sch.name = @schemaName AND tbl.name = @objectName
      ORDER BY fk.name;
    `),
    request().query(`
      SELECT fk.object_id AS constraint_object_id, fkc.constraint_column_id,
        parent_column.name AS parent_column_name,
        referenced_column.name AS referenced_column_name
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns parent_column ON fkc.parent_object_id = parent_column.object_id AND fkc.parent_column_id = parent_column.column_id
      INNER JOIN sys.columns referenced_column ON fkc.referenced_object_id = referenced_column.object_id AND fkc.referenced_column_id = referenced_column.column_id
      INNER JOIN sys.tables tbl ON fk.parent_object_id = tbl.object_id
      INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
      WHERE sch.name = @schemaName AND tbl.name = @objectName
      ORDER BY fk.object_id, fkc.constraint_column_id;
    `),
    request().query(`
      SELECT SUM(ps.row_count) AS row_count
      FROM sys.tables tbl
      INNER JOIN sys.schemas sch ON tbl.schema_id = sch.schema_id
      INNER JOIN sys.dm_db_partition_stats ps ON tbl.object_id = ps.object_id
      WHERE sch.name = @schemaName AND tbl.name = @objectName AND ps.index_id IN (0, 1);
    `)
  ]);

  if (!tableResult.recordset.length) {
    throw createNotFoundError('table', parsed.fullName);
  }

  return {
    object: parsed.fullName,
    table: tableResult.recordset[0],
    columns: columnsResult.recordset || [],
    constraints: constraintsResult.recordset || [],
    checks: checksResult.recordset || [],
    indexes: indexesResult.recordset || [],
    indexColumns: indexColumnsResult.recordset || [],
    foreignKeys: foreignKeysResult.recordset || [],
    foreignKeyColumns: foreignKeyColumnsResult.recordset || [],
    rowCount: Number(rowCountResult.recordset?.[0]?.row_count ?? 0)
  };
}

export function renderCreateTableFromSnapshot(snapshot) {
  const tableName = quoteQualifiedObjectName(snapshot.object);
  const columnLines = snapshot.columns.map(renderColumnDefinition);
  const constraintLines = snapshot.constraints
    .map((constraint) => renderConstraintLine(constraint, snapshot.indexColumns))
    .filter(Boolean);
  const checkLines = snapshot.checks.map((check) => {
    const disabled = check.is_disabled ? ' -- disabled in source' : '';
    const notTrusted = check.is_not_trusted ? ' -- not trusted in source' : '';
    return `    CONSTRAINT ${quoteIdentifier(check.name)} CHECK ${check.definition}${disabled}${notTrusted}`;
  });
  const bodyLines = [...columnLines, ...constraintLines, ...checkLines];
  const sections = [
    `CREATE TABLE ${tableName} (\n${bodyLines.join(',\n')}\n);`
  ];
  const indexStatements = snapshot.indexes
    .map((index) => renderIndexStatement(index, snapshot.indexColumns, tableName))
    .filter(Boolean);
  if (indexStatements.length) {
    sections.push(indexStatements.join('\n\n'));
  }
  const foreignKeyStatements = snapshot.foreignKeys
    .map((foreignKey) => renderForeignKeyStatement(foreignKey, snapshot.foreignKeyColumns, tableName))
    .filter(Boolean);
  if (foreignKeyStatements.length) {
    sections.push(foreignKeyStatements.join('\n\n'));
  }
  return sections.join('\n\n');
}

function rewriteCreateToAlter(definition, objectType) {
  const keyword = objectType === 'procedure' ? '(?:PROC|PROCEDURE)' : objectType === 'table' ? 'TABLE' : 'VIEW';
  const pattern = new RegExp(`^(\\s*)CREATE\\s+(?:OR\\s+ALTER\\s+)?(${keyword})\\b`, 'i');
  if (pattern.test(definition)) {
    return definition.replace(pattern, '$1ALTER $2');
  }
  return `-- Definition did not start with CREATE ${objectType === 'procedure' ? 'PROCEDURE' : objectType === 'table' ? 'TABLE' : 'VIEW'}; review before executing.\n${definition}`;
}

function firstRecordValue(row) {
  if (!row || typeof row !== 'object') {
    return '';
  }
  const firstKey = Object.keys(row)[0];
  return firstKey ? String(row[firstKey] || '') : '';
}

async function tryLoadSparkShowCreateDefinition(pool, parsed, objectType, requestedMode) {
  try {
    const result = await pool.request().query(`SHOW CREATE TABLE ${quoteSparkQualifiedObjectName(parsed.fullName)};`);
    const definition = firstRecordValue(result.recordset?.[0]).trim();
    if (!definition) {
      return null;
    }
    return {
      object: parsed.fullName,
      objectType,
      scriptMode: requestedMode === 'alter' && objectType !== 'table' ? 'alter' : 'create',
      definition: requestedMode === 'alter' && objectType !== 'table'
        ? rewriteCreateToAlter(definition, objectType)
        : definition,
      generated: false,
      editable: true,
      definitionSource: 'spark_show_create_table'
    };
  } catch {
    return null;
  }
}

async function tryLoadSparkDescribeExtendedViewText(pool, parsed, requestedMode) {
  try {
    const result = await pool.request().query(`DESCRIBE EXTENDED ${quoteSparkQualifiedObjectName(parsed.fullName)};`);
    const row = (result.recordset || []).find((item) => {
      const colName = String(item.col_name ?? item.name ?? item[0] ?? '').trim();
      return /^view text$/i.test(colName);
    });
    const viewText = String(row?.data_type ?? row?.value ?? row?.comment ?? '').trim();
    if (!viewText) {
      return null;
    }
    const definition = /^\s*CREATE\s+/i.test(viewText)
      ? viewText
      : `CREATE VIEW ${quoteSparkQualifiedObjectName(parsed.fullName)} AS\n${viewText}`;
    return {
      object: parsed.fullName,
      objectType: 'view',
      scriptMode: requestedMode,
      definition: requestedMode === 'alter' ? rewriteCreateToAlter(definition, 'view') : definition,
      generated: false,
      editable: true,
      definitionSource: 'spark_describe_extended_view_text'
    };
  } catch {
    return null;
  }
}

async function loadTableDefinition(pool, parsed, requestedMode) {
  const snapshot = await loadTableMetadataSnapshot(pool, parsed.fullName);
  const createScript = renderCreateTableFromSnapshot(snapshot);
  const definition = requestedMode === 'alter'
    ? `-- Full table definitions are generated as CREATE TABLE scripts.\n-- To change an existing table, edit this into explicit ALTER TABLE statements before running.\n${createScript}`
    : createScript;
  const warnings = ['SQL Server/Fabric SQL table scripts are reconstructed from catalog metadata; original formatting, comments, and deployment-time batch settings are not available from the source catalog.'];

  return {
    object: parsed.fullName,
    objectType: 'table',
    scriptMode: 'create',
    definition,
    generated: true,
    editable: true,
    definitionSource: 'generated_catalog_metadata',
    completeness: {
      columns: snapshot.columns.length,
      constraints: snapshot.constraints.length,
      checks: snapshot.checks.length,
      indexes: snapshot.indexes.length,
      foreignKeys: snapshot.foreignKeys.length
    },
    warnings
  };
}

async function loadModuleDefinition(pool, parsed, objectType, requestedMode) {
  const result = await pool.request()
    .input('schemaName', sql.NVarChar, parsed.schemaName)
    .input('objectName', sql.NVarChar, parsed.objectName)
    .query(`
      SELECT mod.definition
      FROM sys.objects obj
      INNER JOIN sys.schemas sch
        ON obj.schema_id = sch.schema_id
      INNER JOIN sys.sql_modules mod
        ON obj.object_id = mod.object_id
      WHERE sch.name = @schemaName
        AND obj.name = @objectName
        AND ${objectTypePredicate(objectType)};
    `);

  const definition = result.recordset?.[0]?.definition;
  if (!definition) {
    throw createNotFoundError(objectType, parsed.fullName);
  }

  return {
    object: parsed.fullName,
    objectType,
    scriptMode: requestedMode,
    definition: requestedMode === 'alter' ? rewriteCreateToAlter(definition, objectType) : definition,
    generated: false,
    editable: true,
    definitionSource: 'exact_source_metadata'
  };
}

export async function loadObjectDefinition(pool, objectName, objectType, scriptMode = 'alter', options = {}) {
  const parsed = parseQualifiedObjectName(objectName);
  if (!parsed.objectName) {
    throw new Error('Object name is required.');
  }

  const normalizedType = normalizeObjectDefinitionType(objectType);
  const normalizedMode = normalizeScriptMode(scriptMode);
  const sourceType = String(options.sourceType || '').toLowerCase();

  if (sourceType === 'fabric-lakehouse') {
    const sparkShowCreate = await tryLoadSparkShowCreateDefinition(pool, parsed, normalizedType, normalizedMode);
    if (sparkShowCreate) {
      return sparkShowCreate;
    }
    if (normalizedType === 'view') {
      const viewTextDefinition = await tryLoadSparkDescribeExtendedViewText(pool, parsed, normalizedMode);
      if (viewTextDefinition) {
        return viewTextDefinition;
      }
    }
  }

  if (normalizedType === 'table') {
    return loadTableDefinition(pool, parsed, normalizedMode);
  }

  return loadModuleDefinition(pool, parsed, normalizedType, normalizedMode);
}

function normalizeProfileValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return `0x${value.toString('hex').slice(0, 32)}${value.length > 16 ? '…' : ''}`;
  }
  return String(value);
}

function profileValueSortKey(value) {
  if (value === null || value === undefined || value === '') {
    return { type: 'empty', value: null };
  }
  if (typeof value === 'number') {
    return { type: 'number', value };
  }
  if (value instanceof Date) {
    return { type: 'date', value: value.getTime() };
  }
  const text = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return { type: 'number', value: Number(text) };
  }
  const parsedDate = Date.parse(text);
  if (!Number.isNaN(parsedDate) && /[-/:T]/.test(text)) {
    return { type: 'date', value: parsedDate };
  }
  return { type: 'string', value: text.toLowerCase() };
}

export async function loadObjectSampleProfile(pool, objectName, selectedColumns = [], sampleRows = 200) {
  const parsed = parseQualifiedObjectName(objectName);
  if (!parsed.objectName) {
    throw new Error('Object name is required.');
  }

  const columns = await loadColumnsForObject(pool, parsed.fullName);
  const columnNames = new Set(columns.map((column) => column.name));
  const scopedColumns = Array.isArray(selectedColumns) && selectedColumns.length
    ? selectedColumns.filter((name) => columnNames.has(name))
    : columns.map((column) => column.name);
  const effectiveSampleRows = Math.max(10, Math.min(1000, Number(sampleRows || 200)));
  const selectColumns = scopedColumns.length ? scopedColumns : columns.map((column) => column.name);

  if (!selectColumns.length) {
    return { rows: [], sampleRows: 0, selectedColumns: [] };
  }

  const result = await pool.request().query(`
    SELECT TOP (${effectiveSampleRows})
      ${selectColumns.map((name) => quoteIdentifier(name)).join(',\n      ')}
    FROM ${quoteQualifiedObjectName(parsed.fullName)};
  `);

  const rows = result.recordset || [];
  const profileRows = selectColumns.map((columnName) => {
    const metadata = columns.find((column) => column.name === columnName) || { type: 'unknown', nullable: true };
    const values = rows.map((row) => row?.[columnName]);
    const nonNullValues = values.filter((value) => value !== null && value !== undefined && value !== '');
    let minValue = null;
    let maxValue = null;

    nonNullValues.forEach((value) => {
      const current = profileValueSortKey(value);
      if (minValue == null || current.value < profileValueSortKey(minValue).value) {
        minValue = value;
      }
      if (maxValue == null || current.value > profileValueSortKey(maxValue).value) {
        maxValue = value;
      }
    });

    return {
      column_name: columnName,
      data_type: metadata.type,
      nullable: metadata.nullable ? 'YES' : 'NO',
      sample_rows: rows.length,
      null_rows: values.length - nonNullValues.length,
      distinct_values: new Set(nonNullValues.map((value) => normalizeProfileValue(value))).size,
      completeness_pct: rows.length ? Number((((rows.length - (values.length - nonNullValues.length)) / rows.length) * 100).toFixed(1)) : 0,
      min_value: normalizeProfileValue(minValue),
      max_value: normalizeProfileValue(maxValue)
    };
  });

  return {
    rows: profileRows,
    sampleRows: rows.length,
    selectedColumns: selectColumns
  };
}

export async function loadObjectDependencies(pool, objectName) {
  const parsed = parseQualifiedObjectName(objectName);
  if (!parsed.objectName) {
    throw new Error('Object name is required.');
  }

  let result;
  try {
    result = await pool.request()
      .input('schemaName', sql.NVarChar, parsed.schemaName)
      .input('objectName', sql.NVarChar, parsed.objectName)
      .query(`
      DECLARE @objectId INT = OBJECT_ID(QUOTENAME(@schemaName) + '.' + QUOTENAME(@objectName));

      IF @objectId IS NULL
      BEGIN
        RAISERROR('Object not found for dependency analysis.', 16, 1);
        RETURN;
      END;

      WITH dependencies AS (
        SELECT
          'depends_on' AS dependency_direction,
          OBJECT_SCHEMA_NAME(sed.referencing_id) + '.' + OBJECT_NAME(sed.referencing_id) AS primary_object,
          COALESCE(sed.referenced_schema_name + '.', '') + sed.referenced_entity_name AS related_object,
          COALESCE(referenced_object.type_desc, sed.referenced_class_desc, 'EXTERNAL') AS related_type
        FROM sys.sql_expression_dependencies sed
        LEFT JOIN sys.objects referenced_object
          ON sed.referenced_id = referenced_object.object_id
        WHERE sed.referencing_id = @objectId

        UNION ALL

        SELECT
          'referenced_by' AS dependency_direction,
          COALESCE(sed.referenced_schema_name + '.', '') + sed.referenced_entity_name AS primary_object,
          OBJECT_SCHEMA_NAME(sed.referencing_id) + '.' + OBJECT_NAME(sed.referencing_id) AS related_object,
          COALESCE(referencing_object.type_desc, 'SQL_OBJECT') AS related_type
        FROM sys.sql_expression_dependencies sed
        LEFT JOIN sys.objects referencing_object
          ON sed.referencing_id = referencing_object.object_id
        WHERE sed.referenced_id = @objectId
          OR (
            sed.referenced_id IS NULL
            AND sed.referenced_entity_name = @objectName
            AND COALESCE(sed.referenced_schema_name, 'dbo') = @schemaName
          )
      )
      SELECT DISTINCT dependency_direction, primary_object, related_object, related_type
      FROM dependencies
      WHERE related_object IS NOT NULL
      ORDER BY dependency_direction, related_object;
    `);
  } catch (error) {
    if (!isUnsupportedDependenciesError(error)) {
      throw error;
    }
    return {
      rows: [],
      nodes: [{ id: parsed.fullName, label: parsed.fullName, role: 'selected', type: 'selected' }],
      edges: [],
      upstreamCount: 0,
      downstreamCount: 0,
      warnings: ['Dependency metadata is not supported by this source or permission set. No dependency rows were loaded.']
    };
  }

  const rows = result.recordset || [];
  const nodes = new Map();
  const edges = [];
  const selectedObject = parsed.fullName;
  nodes.set(selectedObject, { id: selectedObject, label: selectedObject, role: 'selected', type: 'selected' });
  rows.forEach((row, index) => {
    const direction = row.dependency_direction;
    const related = row.related_object || row.primary_object;
    if (!related) {
      return;
    }
    const role = direction === 'depends_on' ? 'upstream' : 'downstream';
    if (!nodes.has(related)) {
      nodes.set(related, {
        id: related,
        label: related,
        role,
        type: row.related_type || 'object'
      });
    }
    edges.push({
      id: `${direction}:${index}:${related}`,
      from: direction === 'depends_on' ? selectedObject : related,
      to: direction === 'depends_on' ? related : selectedObject,
      direction,
      type: row.related_type || 'object'
    });
  });

  return {
    rows,
    nodes: [...nodes.values()],
    edges,
    upstreamCount: rows.filter((row) => row.dependency_direction === 'depends_on').length,
    downstreamCount: rows.filter((row) => row.dependency_direction === 'referenced_by').length,
    warnings: ['Dependency metadata is catalog-derived and can be incomplete for dynamic SQL, temp objects, external references, or insufficient metadata permissions.']
  };
}

export async function loadObjectRowCount(pool, objectName, { allowCountFallback = false } = {}) {
  const parsed = parseQualifiedObjectName(objectName);
  if (!parsed.objectName) {
    throw new Error('Object name is required.');
  }

  try {
    const result = await pool.request()
      .input('schemaName', sql.NVarChar, parsed.schemaName)
      .input('objectName', sql.NVarChar, parsed.objectName)
      .query(`
        SELECT SUM(ps.row_count) AS row_count
        FROM sys.objects obj
        INNER JOIN sys.schemas sch ON obj.schema_id = sch.schema_id
        INNER JOIN sys.dm_db_partition_stats ps ON obj.object_id = ps.object_id
        WHERE sch.name = @schemaName AND obj.name = @objectName AND ps.index_id IN (0, 1);
      `);
    const rowCount = result.recordset?.[0]?.row_count;
    if (rowCount !== null && rowCount !== undefined) {
      return {
        object: parsed.fullName,
        rowCount: Number(rowCount),
        source: 'sys_dm_db_partition_stats',
        exact: false,
        warnings: ['Metadata row counts can be approximate while source maintenance operations are active.']
      };
    }
  } catch (error) {
    if (!allowCountFallback) {
      if (isUnsupportedPartitionStatsError(error)) {
        throw createUnsupportedMetadataError(
          'Metadata row count is not supported by this source because sys.dm_db_partition_stats is unavailable. Use Count rows or enable count fallback to run COUNT_BIG(*).',
          error
        );
      }
      throw error;
    }
  }

  if (!allowCountFallback) {
    const error = new Error('Metadata row count is unavailable for this object/source. Enable count fallback to run COUNT_BIG(*).');
    error.httpStatus = 400;
    throw error;
  }

  const countResult = await pool.request().query(`SELECT COUNT_BIG(*) AS row_count FROM ${quoteQualifiedObjectName(parsed.fullName)};`);
  return {
    object: parsed.fullName,
    rowCount: Number(countResult.recordset?.[0]?.row_count ?? 0),
    source: 'count_big',
    exact: true,
    warnings: ['COUNT_BIG(*) reads the object and can be expensive on large sources.']
  };
}

export async function loadObjectTopValues(pool, objectName, selectedColumns = [], topN = 10) {
  const parsed = parseQualifiedObjectName(objectName);
  const columns = await loadColumnsForObject(pool, parsed.fullName);
  const columnNames = new Set(columns.map((column) => column.name));
  const scopedColumns = (Array.isArray(selectedColumns) && selectedColumns.length ? selectedColumns : columns.map((column) => column.name))
    .filter((name) => columnNames.has(name))
    .slice(0, 8);
  const safeTop = Math.max(1, Math.min(50, Number(topN || 10)));
  const rows = [];

  for (const column of scopedColumns) {
    const result = await pool.request().query(`
      SELECT TOP (${safeTop})
        ${quoteStringLiteral(column)} AS column_name,
        CAST(${quoteIdentifier(column)} AS nvarchar(4000)) AS value,
        COUNT_BIG(*) AS value_count
      FROM ${quoteQualifiedObjectName(parsed.fullName)}
      GROUP BY ${quoteIdentifier(column)}
      ORDER BY COUNT_BIG(*) DESC;
    `);
    rows.push(...(result.recordset || []));
  }

  return {
    object: parsed.fullName,
    rows,
    selectedColumns: scopedColumns
  };
}

export async function describeQueryResultShape(pool, query) {
  const result = await pool.request()
    .input('queryText', sql.NVarChar(sql.MAX), String(query || ''))
    .query(`
      SELECT
        column_ordinal,
        name,
        system_type_name,
        is_nullable,
        error_number,
        error_message
      FROM sys.dm_exec_describe_first_result_set(@queryText, NULL, 0)
      ORDER BY column_ordinal;
    `);
  return result.recordset || [];
}

export async function loadEstimatedQueryPlan(pool, query) {
  const cleanQuery = String(query || '').replace(/;+\s*$/, '').trim();
  const transaction = new sql.Transaction(pool);
  let began = false;
  let showplanOn = false;

  try {
    await transaction.begin();
    began = true;
    await transaction.request().batch('SET SHOWPLAN_XML ON;');
    showplanOn = true;
    const result = await transaction.request().batch(`${cleanQuery};`);
    await transaction.request().batch('SET SHOWPLAN_XML OFF;');
    showplanOn = false;
    await transaction.rollback();
    began = false;
    const firstRow = result.recordset?.[0] || {};
    const firstKey = Object.keys(firstRow)[0];
    return {
      planXml: firstKey ? String(firstRow[firstKey] || '') : '',
      rows: result.recordset || []
    };
  } catch (error) {
    if (showplanOn) {
      try {
        await transaction.request().batch('SET SHOWPLAN_XML OFF;');
      } catch {
        // Ignore cleanup failures and surface the original SHOWPLAN error.
      }
    }
    if (began) {
      try {
        await transaction.rollback();
      } catch {
        // Ignore rollback failures and surface the original SHOWPLAN error.
      }
    }
    throw error;
  }
}

function normalizeColumnForCompare(column = {}) {
  return {
    name: column.column_name || column.name || '',
    ordinal: Number(column.column_id || column.ordinal || 0),
    type: renderColumnDataType(column),
    nullable: Boolean(column.is_nullable ?? column.nullable),
    identity: Boolean(column.is_identity),
    computed: Boolean(column.is_computed),
    computedDefinition: String(column.computed_definition || ''),
    defaultDefinition: String(column.default_definition || '')
  };
}

export async function loadSchemaCompare(poolLeft, poolRight, { leftObject, rightObject, objectType = 'table', leftSourceType = '', rightSourceType = '' }) {
  const normalizedType = String(objectType || 'table').toLowerCase() === 'view' ? 'view' : 'table';
  const columnOnlyCompare = normalizedType === 'view' || leftSourceType === 'fabric-lakehouse' || rightSourceType === 'fabric-lakehouse';
  if (columnOnlyCompare) {
    const [leftColumns, rightColumns] = await Promise.all([
      loadColumnsForObject(poolLeft, leftObject),
      loadColumnsForObject(poolRight, rightObject)
    ]);
    return compareColumnSets(leftObject, rightObject, leftColumns.map((column, index) => ({
      name: column.name,
      ordinal: index + 1,
      type: String(column.type || '').toUpperCase(),
      nullable: Boolean(column.nullable)
    })), rightColumns.map((column, index) => ({
      name: column.name,
      ordinal: index + 1,
      type: String(column.type || '').toUpperCase(),
      nullable: Boolean(column.nullable)
    })), {
      objectType: normalizedType,
      warnings: leftSourceType === 'fabric-lakehouse' || rightSourceType === 'fabric-lakehouse'
        ? ['Fabric Lakehouse SQL endpoint does not support SQL Server table DMVs used for rich table compare. This comparison uses INFORMATION_SCHEMA column metadata only.']
        : undefined
    });
  }

  let leftSnapshot;
  let rightSnapshot;
  try {
    [leftSnapshot, rightSnapshot] = await Promise.all([
      loadTableMetadataSnapshot(poolLeft, leftObject),
      loadTableMetadataSnapshot(poolRight, rightObject)
    ]);
  } catch (error) {
    if (!isUnsupportedTableMetadataError(error)) {
      throw error;
    }
    const [leftColumns, rightColumns] = await Promise.all([
      loadColumnsForObject(poolLeft, leftObject),
      loadColumnsForObject(poolRight, rightObject)
    ]);
    return compareColumnSets(leftObject, rightObject, leftColumns.map((column, index) => ({
      name: column.name,
      ordinal: index + 1,
      type: String(column.type || '').toUpperCase(),
      nullable: Boolean(column.nullable)
    })), rightColumns.map((column, index) => ({
      name: column.name,
      ordinal: index + 1,
      type: String(column.type || '').toUpperCase(),
      nullable: Boolean(column.nullable)
    })), {
      objectType: normalizedType,
      warnings: ['Rich table metadata is not supported by this source or permission set. Schema compare used INFORMATION_SCHEMA column metadata only.']
    });
  }
  return compareColumnSets(
    leftSnapshot.object,
    rightSnapshot.object,
    leftSnapshot.columns.map(normalizeColumnForCompare),
    rightSnapshot.columns.map(normalizeColumnForCompare),
    {
      objectType: normalizedType,
      leftCompleteness: {
        constraints: leftSnapshot.constraints.length,
        indexes: leftSnapshot.indexes.length,
        foreignKeys: leftSnapshot.foreignKeys.length
      },
      rightCompleteness: {
        constraints: rightSnapshot.constraints.length,
        indexes: rightSnapshot.indexes.length,
        foreignKeys: rightSnapshot.foreignKeys.length
      }
    }
  );
}

function compareColumnSets(leftObject, rightObject, leftColumns, rightColumns, extra = {}) {
  const leftByName = new Map(leftColumns.map((column) => [String(column.name).toLowerCase(), column]));
  const rightByName = new Map(rightColumns.map((column) => [String(column.name).toLowerCase(), column]));
  const allNames = [...new Set([...leftByName.keys(), ...rightByName.keys()])].sort();
  const differences = [];
  const rows = [];

  allNames.forEach((key) => {
    const left = leftByName.get(key);
    const right = rightByName.get(key);
    if (!left) {
      differences.push({ kind: 'missing_left', column: right.name, right });
      rows.push({ item: right.name, difference: 'missing_left', left: '', right: right.type || '' });
      return;
    }
    if (!right) {
      differences.push({ kind: 'missing_right', column: left.name, left });
      rows.push({ item: left.name, difference: 'missing_right', left: left.type || '', right: '' });
      return;
    }
    const checks = ['ordinal', 'type', 'nullable', 'identity', 'computed', 'computedDefinition', 'defaultDefinition'];
    checks.forEach((field) => {
      if (String(left[field] ?? '') !== String(right[field] ?? '')) {
        differences.push({ kind: 'changed', column: left.name, field, left: left[field], right: right[field] });
        rows.push({ item: left.name, difference: field, left: String(left[field] ?? ''), right: String(right[field] ?? '') });
      }
    });
  });

  return {
    success: true,
    leftObject,
    rightObject,
    objectType: extra.objectType || 'table',
    differences,
    rows,
    columns: ['item', 'difference', 'left', 'right'],
    summary: {
      leftColumns: leftColumns.length,
      rightColumns: rightColumns.length,
      differenceCount: differences.length,
      leftCompleteness: extra.leftCompleteness || null,
      rightCompleteness: extra.rightCompleteness || null
    },
    warnings: extra.warnings || ['Schema compare v1 focuses on columns and table metadata available through catalog views; source-specific physical options may not be represented.']
  };
}

export async function loadProcedureCatalog(pool) {
  try {
    const informationSchemaResult = await pool.request().query(`
      SELECT ROUTINE_SCHEMA, ROUTINE_NAME
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME;
    `);

    return informationSchemaResult.recordset.map((row) => ({
      schema: row.ROUTINE_SCHEMA,
      name: row.ROUTINE_NAME,
      fullName: `${row.ROUTINE_SCHEMA}.${row.ROUTINE_NAME}`
    }));
  } catch (error) {
    if (!/INFORMATION_SCHEMA|ROUTINES|Invalid object name/i.test(error.message)) {
      throw error;
    }
  }

  const fallbackResult = await pool.request().query(`
    SELECT schema_name(schema_id) AS routine_schema, name AS routine_name
    FROM sys.procedures
    ORDER BY schema_name(schema_id), name;
  `);

  return fallbackResult.recordset.map((row) => ({
    schema: row.routine_schema,
    name: row.routine_name,
    fullName: `${row.routine_schema}.${row.routine_name}`
  }));
}

export async function loadProcedureParameters(pool, procedureName) {
  const procedure = normalizeProcedureName(procedureName);
  if (!procedure.procedureName) {
    throw new Error('Procedure name is required.');
  }

  try {
    const informationSchemaResult = await pool.request()
      .input('schemaName', sql.NVarChar, procedure.schemaName)
      .input('procedureName', sql.NVarChar, procedure.procedureName)
      .query(`
        SELECT
          PARAMETER_NAME,
          ORDINAL_POSITION,
          PARAMETER_MODE,
          DATA_TYPE,
          CHARACTER_MAXIMUM_LENGTH,
          NUMERIC_PRECISION,
          NUMERIC_SCALE,
          DATETIME_PRECISION
        FROM INFORMATION_SCHEMA.PARAMETERS
        WHERE SPECIFIC_SCHEMA = @schemaName
          AND SPECIFIC_NAME = @procedureName
        ORDER BY ORDINAL_POSITION;
      `);

    return informationSchemaResult.recordset.map((row) => ({
      name: row.PARAMETER_NAME,
      cleanName: String(row.PARAMETER_NAME || '').replace(/^@/, ''),
      ordinalPosition: Number(row.ORDINAL_POSITION || 0),
      mode: String(row.PARAMETER_MODE || 'IN').toUpperCase(),
      dataType: row.DATA_TYPE,
      maxLength: row.CHARACTER_MAXIMUM_LENGTH,
      precision: row.NUMERIC_PRECISION,
      scale: row.NUMERIC_SCALE ?? row.DATETIME_PRECISION
    }));
  } catch (error) {
    if (!/INFORMATION_SCHEMA|PARAMETERS|Invalid object name/i.test(error.message)) {
      throw error;
    }
  }

  const fallbackResult = await pool.request()
    .input('schemaName', sql.NVarChar, procedure.schemaName)
    .input('procedureName', sql.NVarChar, procedure.procedureName)
    .query(`
      SELECT
        p.name AS parameter_name,
        p.parameter_id AS ordinal_position,
        CASE WHEN p.is_output = 1 THEN 'INOUT' ELSE 'IN' END AS parameter_mode,
        t.name AS data_type,
        p.max_length AS max_length,
        p.precision AS precision_value,
        p.scale AS scale_value
      FROM sys.parameters p
      INNER JOIN sys.procedures pr
        ON p.object_id = pr.object_id
      INNER JOIN sys.schemas s
        ON pr.schema_id = s.schema_id
      INNER JOIN sys.types t
        ON p.user_type_id = t.user_type_id
      WHERE s.name = @schemaName
        AND pr.name = @procedureName
      ORDER BY p.parameter_id;
    `);

  return fallbackResult.recordset.map((row) => {
    const lowerType = String(row.data_type || '').toLowerCase();
    const usesWideChars = lowerType.startsWith('n');
    const normalizedLength = Number(row.max_length) < 0
      ? -1
      : usesWideChars && Number(row.max_length) > 0
        ? Number(row.max_length) / 2
        : Number(row.max_length);

    return {
      name: row.parameter_name,
      cleanName: String(row.parameter_name || '').replace(/^@/, ''),
      ordinalPosition: Number(row.ordinal_position || 0),
      mode: String(row.parameter_mode || 'IN').toUpperCase(),
      dataType: row.data_type,
      maxLength: normalizedLength,
      precision: row.precision_value,
      scale: row.scale_value
    };
  });
}

export function resolveSqlType(metadata) {
  const dataType = String(metadata?.dataType || '').toLowerCase();
  const maxLength = Number(metadata?.maxLength);
  const precision = Number(metadata?.precision);
  const scale = Number(metadata?.scale);

  switch (dataType) {
    case 'varchar':
      return maxLength < 0 ? sql.VarChar(sql.MAX) : sql.VarChar(Math.max(1, maxLength || 1));
    case 'nvarchar':
    case 'sysname':
      return maxLength < 0 ? sql.NVarChar(sql.MAX) : sql.NVarChar(Math.max(1, maxLength || 1));
    case 'char':
      return sql.Char(Math.max(1, maxLength || 1));
    case 'nchar':
      return sql.NChar(Math.max(1, maxLength || 1));
    case 'text':
      return sql.Text;
    case 'ntext':
      return sql.NText;
    case 'bit':
      return sql.Bit;
    case 'tinyint':
      return sql.TinyInt;
    case 'smallint':
      return sql.SmallInt;
    case 'int':
      return sql.Int;
    case 'bigint':
      return sql.BigInt;
    case 'decimal':
    case 'numeric':
      return sql.Decimal(Math.max(1, precision || 18), Math.max(0, scale || 0));
    case 'float':
      return sql.Float;
    case 'real':
      return sql.Real;
    case 'money':
      return sql.Money;
    case 'smallmoney':
      return sql.SmallMoney;
    case 'date':
      return sql.Date;
    case 'datetime':
      return sql.DateTime;
    case 'datetime2':
      return Number.isFinite(scale) ? sql.DateTime2(scale) : sql.DateTime2;
    case 'smalldatetime':
      return sql.SmallDateTime;
    case 'time':
      return Number.isFinite(scale) ? sql.Time(scale) : sql.Time;
    case 'datetimeoffset':
      return Number.isFinite(scale) ? sql.DateTimeOffset(scale) : sql.DateTimeOffset;
    case 'uniqueidentifier':
      return sql.UniqueIdentifier;
    case 'binary':
      return sql.Binary(Math.max(1, maxLength || 1));
    case 'varbinary':
      return maxLength < 0 ? sql.VarBinary(sql.MAX) : sql.VarBinary(Math.max(1, maxLength || 1));
    case 'image':
      return sql.VarBinary(sql.MAX);
    case 'xml':
      return sql.Xml;
    default:
      return null;
  }
}

export function parseProcedureParameterValue(rawValue, metadata) {
  if (rawValue === undefined) {
    return undefined;
  }

  const dataType = String(metadata?.dataType || '').toLowerCase();
  const text = String(rawValue ?? '').trim();

  if (!text) {
    return undefined;
  }

  if (/^null$/i.test(text)) {
    return null;
  }

  switch (dataType) {
    case 'bit':
      if (/^(1|true|yes|y)$/i.test(text)) {
        return true;
      }
      if (/^(0|false|no|n)$/i.test(text)) {
        return false;
      }
      throw new Error(`Parameter ${metadata.name} expects a boolean value.`);
    case 'tinyint':
    case 'smallint':
    case 'int':
    case 'bigint':
      if (!/^-?\d+$/.test(text)) {
        throw new Error(`Parameter ${metadata.name} expects an integer value.`);
      }
      return Number(text);
    case 'decimal':
    case 'numeric':
    case 'float':
    case 'real':
    case 'money':
    case 'smallmoney':
      if (!/^-?\d+(\.\d+)?$/.test(text)) {
        throw new Error(`Parameter ${metadata.name} expects a numeric value.`);
      }
      return Number(text);
    case 'date':
    case 'datetime':
    case 'datetime2':
    case 'smalldatetime':
    case 'time':
    case 'datetimeoffset': {
      const parsedDate = new Date(text);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error(`Parameter ${metadata.name} expects a valid date/time value.`);
      }
      return parsedDate;
    }
    case 'uniqueidentifier':
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
        throw new Error(`Parameter ${metadata.name} expects a valid GUID value.`);
      }
      return text;
    case 'binary':
    case 'varbinary':
    case 'image':
      if (/^0x[0-9a-f]+$/i.test(text)) {
        return Buffer.from(text.slice(2), 'hex');
      }
      return Buffer.from(text, 'utf8');
    default:
      return text;
  }
}

export function bindProcedureParameters(request, metadataList, rawParameters) {
  const suppliedParameters = normalizeParameterPayload(rawParameters);
  const allowedNames = new Set(metadataList.map((parameter) => parameter.cleanName));

  for (const name of Object.keys(suppliedParameters)) {
    if (!allowedNames.has(name)) {
      throw new Error(`Unknown procedure parameter: ${name}`);
    }
  }

  for (const metadata of metadataList) {
    const parameterName = metadata.cleanName;
    const sqlType = resolveSqlType(metadata);
    const value = parseProcedureParameterValue(suppliedParameters[parameterName], metadata);
    const isOutput = /OUT/i.test(metadata.mode);
    const isInput = !isOutput || /IN/i.test(metadata.mode);

    if (isOutput) {
      if (sqlType) {
        request.output(parameterName, sqlType);
      } else {
        request.output(parameterName);
      }
    }

    if (!isInput || value === undefined) {
      continue;
    }

    if (sqlType) {
      request.input(parameterName, sqlType, value);
    } else {
      request.input(parameterName, value);
    }
  }
}

export async function executeStoredProcedure(pool, procedureName, parameters, metadataList, responseRowLimit) {
  const request = pool.request();
  bindProcedureParameters(request, metadataList, parameters);
  const result = await request.execute(procedureName);

  return {
    ...mapRecordset(result, responseRowLimit),
    rowsAffected: sumRowsAffected(result),
    output: result.output || {},
    returnValue: result.returnValue ?? null
  };
}
