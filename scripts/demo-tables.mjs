// Dev-only harness: launches a browser pointed at http://localhost:3000
// and mocks /api/tables, /api/columns, /api/procedures, /api/procedure-parameters
// so you can see the console layout with realistic sample tables.
//
// Usage:
//   1. Run the dev server in another terminal: npm run dev
//   2. node scripts/demo-tables.mjs
//
// The browser stays open so you can click around and resize panels.

import { chromium } from 'playwright';

const TARGET_URL = process.env.DEMO_URL || 'http://localhost:3000/';

const OBJECTS = [
  { fullName: 'dbo.Customers',            schema: 'dbo', name: 'Customers',            objectType: 'TABLE' },
  { fullName: 'dbo.Orders',               schema: 'dbo', name: 'Orders',               objectType: 'TABLE' },
  { fullName: 'dbo.OrderLines',           schema: 'dbo', name: 'OrderLines',           objectType: 'TABLE' },
  { fullName: 'dbo.Products',             schema: 'dbo', name: 'Products',             objectType: 'TABLE' },
  { fullName: 'dbo.ProductCategories',    schema: 'dbo', name: 'ProductCategories',    objectType: 'TABLE' },
  { fullName: 'dbo.Inventory',            schema: 'dbo', name: 'Inventory',            objectType: 'TABLE' },
  { fullName: 'dbo.Warehouses',           schema: 'dbo', name: 'Warehouses',           objectType: 'TABLE' },
  { fullName: 'dbo.Employees',            schema: 'dbo', name: 'Employees',            objectType: 'TABLE' },
  { fullName: 'dbo.Departments',          schema: 'dbo', name: 'Departments',          objectType: 'TABLE' },
  { fullName: 'dbo.Suppliers',            schema: 'dbo', name: 'Suppliers',            objectType: 'TABLE' },
  { fullName: 'dbo.Invoices',             schema: 'dbo', name: 'Invoices',             objectType: 'TABLE' },
  { fullName: 'dbo.Payments',             schema: 'dbo', name: 'Payments',             objectType: 'TABLE' },
  { fullName: 'dbo.Shipments',            schema: 'dbo', name: 'Shipments',            objectType: 'TABLE' },
  { fullName: 'dbo.AuditLog',             schema: 'dbo', name: 'AuditLog',             objectType: 'TABLE' },
  { fullName: 'reporting.vCustomerSales', schema: 'reporting', name: 'vCustomerSales', objectType: 'VIEW'  },
  { fullName: 'reporting.vMonthlyRevenue',schema: 'reporting', name: 'vMonthlyRevenue',objectType: 'VIEW'  },
];

const COLUMNS = {
  'dbo.Customers': [
    { name: 'CustomerID', dataType: 'int',          nullable: false, isIdentity: true,  isPrimaryKey: true  },
    { name: 'FirstName',  dataType: 'nvarchar(100)',nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'LastName',   dataType: 'nvarchar(100)',nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'Email',      dataType: 'nvarchar(200)',nullable: true,  isIdentity: false, isPrimaryKey: false },
    { name: 'Phone',      dataType: 'varchar(40)',  nullable: true,  isIdentity: false, isPrimaryKey: false },
    { name: 'Country',    dataType: 'varchar(2)',   nullable: true,  isIdentity: false, isPrimaryKey: false },
    { name: 'CreatedAt',  dataType: 'datetime2',    nullable: false, isIdentity: false, isPrimaryKey: false },
  ],
  'dbo.Orders': [
    { name: 'OrderID',    dataType: 'int',          nullable: false, isIdentity: true,  isPrimaryKey: true  },
    { name: 'CustomerID', dataType: 'int',          nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'OrderDate',  dataType: 'datetime2',    nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'Status',     dataType: 'varchar(30)',  nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'TotalAmount',dataType: 'decimal(18,2)',nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'Currency',   dataType: 'varchar(3)',   nullable: false, isIdentity: false, isPrimaryKey: false },
  ],
  'dbo.OrderLines': [
    { name: 'OrderLineID', dataType: 'bigint',         nullable: false, isIdentity: true,  isPrimaryKey: true  },
    { name: 'OrderID',     dataType: 'int',            nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'ProductID',   dataType: 'int',            nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'Quantity',    dataType: 'int',            nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'UnitPrice',   dataType: 'decimal(18,4)',  nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'Discount',    dataType: 'decimal(5,4)',   nullable: true,  isIdentity: false, isPrimaryKey: false },
  ],
  'dbo.Products': [
    { name: 'ProductID',   dataType: 'int',            nullable: false, isIdentity: true,  isPrimaryKey: true  },
    { name: 'SKU',         dataType: 'varchar(40)',    nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'ProductName', dataType: 'nvarchar(200)',  nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'CategoryID',  dataType: 'int',            nullable: true,  isIdentity: false, isPrimaryKey: false },
    { name: 'ListPrice',   dataType: 'decimal(18,2)',  nullable: false, isIdentity: false, isPrimaryKey: false },
    { name: 'IsActive',    dataType: 'bit',            nullable: false, isIdentity: false, isPrimaryKey: false },
  ],
};

const DEFAULT_COLUMNS = [
  { name: 'Id',         dataType: 'int',           nullable: false, isIdentity: true,  isPrimaryKey: true  },
  { name: 'Name',       dataType: 'nvarchar(200)', nullable: false, isIdentity: false, isPrimaryKey: false },
  { name: 'Description',dataType: 'nvarchar(max)', nullable: true,  isIdentity: false, isPrimaryKey: false },
  { name: 'CreatedAt',  dataType: 'datetime2',     nullable: false, isIdentity: false, isPrimaryKey: false },
  { name: 'ModifiedAt', dataType: 'datetime2',     nullable: true,  isIdentity: false, isPrimaryKey: false },
];

async function columnsFor(tableName) {
  return COLUMNS[tableName] || DEFAULT_COLUMNS;
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

await page.route('**/api/tables', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, objects: OBJECTS, tables: OBJECTS }),
  });
});

await page.route('**/api/columns**', async (route) => {
  const url = new URL(route.request().url());
  let table = url.searchParams.get('table') || url.searchParams.get('object') || '';
  if (!table) {
    try {
      const body = JSON.parse(route.request().postData() || '{}');
      table = body.table || body.object || '';
    } catch {}
  }
  const columns = await columnsFor(table);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, columns, object: table }),
  });
});

await page.route('**/api/procedures', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, procedures: [], note: 'Demo mode: no procedures provided.' }),
  });
});

await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

// Fill in a dummy connection so loadCatalog proceeds.
await page.fill('#serverInput',   'demo.example.com');
await page.fill('#databaseInput', 'DemoDB');
await page.selectOption('#sourceTypeSelect', 'sql-server').catch(() => {});
await page.selectOption('#authModeSelect',   'sqlLogin').catch(() => {});
await page.fill('#usernameInput', 'demo');
await page.fill('#passwordInput', 'demo');

await page.click('#loadTablesBtn');
await page.waitForSelector('#tableList button.table-item', { timeout: 5000 }).catch(() => {});

console.log(`Demo catalog loaded at ${TARGET_URL} with ${OBJECTS.length} test objects.`);
console.log('Browser is open — interact with it normally. Ctrl+C to close.');

await new Promise(() => {});
