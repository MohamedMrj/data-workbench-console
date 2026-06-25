import assert from 'assert/strict';
import { loadSchemaCompare, renderCreateTableFromSnapshot } from '../lib/server/sql-metadata.js';

const snapshot = {
  object: 'dbo.Customer',
  columns: [
    {
      column_name: 'CustomerID',
      data_type: 'int',
      max_length: 4,
      precision_value: 10,
      scale_value: 0,
      is_nullable: false,
      is_identity: true,
      seed_value: 1,
      increment_value: 1,
      column_id: 1
    },
    {
      column_name: 'Code',
      data_type: 'nvarchar',
      max_length: 100,
      precision_value: 0,
      scale_value: 0,
      is_nullable: false,
      default_definition: "('UNKNOWN')",
      column_id: 2
    },
    {
      column_name: 'Amount',
      data_type: 'decimal',
      max_length: 9,
      precision_value: 18,
      scale_value: 2,
      is_nullable: true,
      column_id: 3
    },
    {
      column_name: 'ValidFrom',
      data_type: 'datetime2',
      max_length: 8,
      precision_value: 0,
      scale_value: 3,
      is_nullable: false,
      column_id: 4
    },
    {
      column_name: 'CodeUpper',
      is_computed: true,
      computed_definition: '(upper([Code]))',
      is_persisted: true,
      is_nullable: true,
      column_id: 5
    }
  ],
  constraints: [
    { name: 'PK_Customer', type: 'PK', unique_index_id: 1, index_type: 1 },
    { name: 'UQ_Customer_Code', type: 'UQ', unique_index_id: 2, index_type: 2 }
  ],
  checks: [
    { name: 'CK_Customer_Amount', definition: '([Amount]>=(0))', is_disabled: false, is_not_trusted: false }
  ],
  indexes: [
    { index_id: 3, name: 'IX_Customer_Amount', type: 2, is_unique: false, has_filter: true, filter_definition: '[Amount] IS NOT NULL' }
  ],
  indexColumns: [
    { index_id: 1, column_name: 'CustomerID', key_ordinal: 1, index_column_id: 1, is_descending_key: false, is_included_column: false },
    { index_id: 2, column_name: 'Code', key_ordinal: 1, index_column_id: 1, is_descending_key: false, is_included_column: false },
    { index_id: 3, column_name: 'Amount', key_ordinal: 1, index_column_id: 1, is_descending_key: true, is_included_column: false },
    { index_id: 3, column_name: 'Code', key_ordinal: 0, index_column_id: 2, is_descending_key: false, is_included_column: true }
  ],
  foreignKeys: [
    {
      object_id: 10,
      name: 'FK_Customer_Parent',
      referenced_schema_name: 'dbo',
      referenced_table_name: 'ParentCustomer',
      delete_referential_action_desc: 'NO_ACTION',
      update_referential_action_desc: 'CASCADE',
      is_not_trusted: false
    }
  ],
  foreignKeyColumns: [
    { constraint_object_id: 10, constraint_column_id: 1, parent_column_name: 'CustomerID', referenced_column_name: 'CustomerID' }
  ]
};

const ddl = renderCreateTableFromSnapshot(snapshot);

assert.match(ddl, /CREATE TABLE \[dbo\]\.\[Customer\]/);
assert.match(ddl, /\[CustomerID\] INT IDENTITY\(1, 1\) NOT NULL/);
assert.match(ddl, /\[Code\] NVARCHAR\(50\) DEFAULT \('UNKNOWN'\) NOT NULL/);
assert.match(ddl, /\[Amount\] DECIMAL\(18, 2\) NULL/);
assert.match(ddl, /\[ValidFrom\] DATETIME2\(3\) NOT NULL/);
assert.match(ddl, /\[CodeUpper\] AS \(upper\(\[Code\]\)\) PERSISTED NULL/);
assert.match(ddl, /CONSTRAINT \[PK_Customer\] PRIMARY KEY CLUSTERED \(\[CustomerID\] ASC\)/);
assert.match(ddl, /CONSTRAINT \[UQ_Customer_Code\] UNIQUE NONCLUSTERED \(\[Code\] ASC\)/);
assert.match(ddl, /CONSTRAINT \[CK_Customer_Amount\] CHECK \(\[Amount\]>=\(0\)\)/);
assert.match(ddl, /CREATE NONCLUSTERED INDEX \[IX_Customer_Amount\]/);
assert.match(ddl, /ON \[dbo\]\.\[Customer\] \(\[Amount\] DESC\)/);
assert.match(ddl, /INCLUDE \(\[Code\]\)/);
assert.match(ddl, /WHERE \[Amount\] IS NOT NULL/);
assert.match(ddl, /ALTER TABLE \[dbo\]\.\[Customer\]/);
assert.match(ddl, /FOREIGN KEY \(\[CustomerID\]\)/);
assert.match(ddl, /ON UPDATE CASCADE/);

function createColumnPool(columnsByObject, observedQueries = []) {
  return {
    request() {
      const inputs = {};
      return {
        input(name, _type, value) {
          inputs[name] = value;
          return this;
        },
        async query(queryText) {
          observedQueries.push(queryText);
          const key = `${inputs.schemaName}.${inputs.objectName}`;
          const columns = columnsByObject[key] || [];
          return {
            recordset: columns.map((column, index) => ({
              COLUMN_NAME: column.name,
              DATA_TYPE: column.type,
              IS_NULLABLE: column.nullable ? 'YES' : 'NO',
              ORDINAL_POSITION: index + 1
            }))
          };
        }
      };
    }
  };
}

const observedCompareQueries = [];
const compareResult = await loadSchemaCompare(
  createColumnPool({
    'dbo.LeftTable': [
      { name: 'Id', type: 'int', nullable: false },
      { name: 'Name', type: 'varchar', nullable: true }
    ]
  }, observedCompareQueries),
  createColumnPool({
    'dbo.RightTable': [
      { name: 'Id', type: 'int', nullable: false },
      { name: 'Name', type: 'nvarchar', nullable: true }
    ]
  }, observedCompareQueries),
  {
    leftObject: 'dbo.LeftTable',
    rightObject: 'dbo.RightTable',
    objectType: 'table',
    leftSourceType: 'fabric-lakehouse',
    rightSourceType: 'fabric-lakehouse'
  }
);

assert.equal(compareResult.success, true);
assert.equal(compareResult.objectType, 'table');
assert.equal(compareResult.differences.length, 1);
assert.equal(compareResult.differences[0].field, 'type');
assert.match(compareResult.warnings.join(' '), /INFORMATION_SCHEMA column metadata only/);
assert.equal(observedCompareQueries.some((query) => /dm_db_partition_stats/i.test(query)), false);

console.log('SQL metadata tests passed.');
