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
  const result = await pool.request()
    .input('schemaName', sql.NVarChar, parsed.schemaName)
    .input('objectName', sql.NVarChar, parsed.objectName)
    .query(`
      SELECT
        c.name AS column_name,
        typ.name AS data_type,
        c.max_length,
        c.precision AS precision_value,
        c.scale AS scale_value,
        c.is_nullable,
        c.is_identity,
        ic.seed_value,
        ic.increment_value,
        dc.definition AS default_definition,
        c.column_id
      FROM sys.tables tbl
      INNER JOIN sys.schemas sch
        ON tbl.schema_id = sch.schema_id
      INNER JOIN sys.columns c
        ON tbl.object_id = c.object_id
      INNER JOIN sys.types typ
        ON c.user_type_id = typ.user_type_id
      LEFT JOIN sys.identity_columns ic
        ON c.object_id = ic.object_id
        AND c.column_id = ic.column_id
      LEFT JOIN sys.default_constraints dc
        ON c.default_object_id = dc.object_id
      WHERE sch.name = @schemaName
        AND tbl.name = @objectName
      ORDER BY c.column_id;
    `);

  if (!result.recordset.length) {
    throw createNotFoundError('table', parsed.fullName);
  }

  const columnLines = result.recordset.map((column) => {
    const identity = column.is_identity
      ? ` IDENTITY(${Number(column.seed_value ?? 1)}, ${Number(column.increment_value ?? 1)})`
      : '';
    const defaultDefinition = column.default_definition ? ` DEFAULT ${column.default_definition}` : '';
    const nullability = column.is_nullable ? 'NULL' : 'NOT NULL';
    return `    ${quoteIdentifier(column.column_name)} ${renderColumnDataType(column)}${identity}${defaultDefinition} ${nullability}`;
  });

  const createScript = `CREATE TABLE ${quoteQualifiedObjectName(parsed.fullName)} (\n${columnLines.join(',\n')}\n);`;
  const definition = requestedMode === 'alter'
    ? `-- Full table definitions are generated as CREATE TABLE scripts.\n-- To change an existing table, edit this into explicit ALTER TABLE statements before running.\n${createScript}`
    : createScript;

  return {
    object: parsed.fullName,
    objectType: 'table',
    scriptMode: 'create',
    definition,
    generated: true,
    editable: true,
    definitionSource: 'generated_catalog_columns'
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
    definitionSource: 'sys_sql_modules'
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

  const result = await pool.request()
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

  return result.recordset || [];
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
