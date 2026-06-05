import { DocsCardGrid, DocsExample, DocsMiniSection, DocsSection, DocsShell } from '../doc-shell';

export const metadata = {
  title: 'SQL Studio Guide',
  description: 'Clear English guide for SQL Studio in Data Workbench Console.'
};

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'connection', label: 'Connect' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'builder', label: 'Build SQL' },
  { id: 'editor', label: 'Editor' },
  { id: 'advanced', label: 'Advanced tools' },
  { id: 'results', label: 'Results' },
  { id: 'history', label: 'History' },
  { id: 'safety', label: 'Safety' },
  { id: 'troubleshooting', label: 'Troubleshooting' }
];

export default function SqlStudioDocsPage() {
  return (
    <DocsShell
      eyebrow="Operator guide"
      title="SQL Studio"
      description="Use SQL Studio to connect to a supported SQL source, browse tables and views, build safe SQL, inspect results, export data, and run controlled write previews."
      sections={sections}
      highlights={[
        { label: 'Read-first workflow', tone: 'success' },
        { label: 'Preview before writes', tone: 'warning' },
        { label: 'Local history restore', tone: 'info' }
      ]}
      steps={[
        'Choose a source and database.',
        'Test the connection.',
        'Load the catalog.',
        'Select a table or view.',
        'Build, review, and run SQL.'
      ]}
    >
      <DocsSection id="overview" title="What SQL Studio Is For" intro="SQL Studio is the main workspace for table and view work. It is designed for operators who need speed, visibility, and guardrails.">
        <DocsCardGrid
          items={[
            { title: 'Browse live metadata', text: 'Load tables and views from the active source, then select an object to load its columns.' },
            { title: 'Generate SQL', text: 'Use the builder to create SELECT, INSERT, UPDATE, and DELETE templates from the selected object.' },
            { title: 'Inspect results', text: 'Run reads, filter visible rows, sort columns, copy rows, export CSV, and inspect null or long values.' },
            { title: 'Stay controlled', text: 'Writes are previewed and confirmed. Stored procedures are intentionally handled in Procedure Runner.' }
          ]}
        />
        <div className="docs-callout docs-callout-info">
          SQL Studio is best for table and view workflows. Use <strong>Procedure Runner</strong> when the work must happen through a stored procedure.
        </div>
      </DocsSection>

      <DocsSection id="connection" title="Connect To A Source" intro="The connection rail defines where catalog loads and queries run. Saved profiles fill in fields, but they do not automatically connect or execute anything.">
        <div className="docs-table">
          <div><strong>Source type</strong><span>Choose Fabric SQL endpoint, Fabric Lakehouse SQL endpoint, or SQL Server.</span></div>
          <div><strong>Authentication</strong><span>Fabric uses Azure service principal settings from the server environment. SQL Server can use SQL login or service principal where supported.</span></div>
          <div><strong>Server</strong><span>Use only the host name, for example <code>workspace.datawarehouse.fabric.microsoft.com</code>. Do not paste a full connection string.</span></div>
          <div><strong>Port</strong><span>Use the default SQL port unless your SQL Server connection requires a custom port.</span></div>
          <div><strong>Database</strong><span>The database or SQL endpoint database where catalog metadata and SQL execution should happen.</span></div>
          <div><strong>SQL login fields</strong><span>Username and password appear only for SQL login mode. Passwords are used for the current session and are not saved in profiles.</span></div>
          <div><strong>Trust certificate</strong><span>SQL Server can show a trust-server-certificate toggle when that environment requires it.</span></div>
          <div><strong>Test connection</strong><span>Verifies server, database, authentication mode, and credentials before you load metadata.</span></div>
          <div><strong>Load catalog</strong><span>Loads tables, views, and procedures when the selected source supports them.</span></div>
          <div><strong>Saved profiles</strong><span>Save reusable source, auth mode, server, port, database, username, and trust settings. Secrets are not stored.</span></div>
        </div>
        <DocsExample title="Good connection flow">
          <ol>
            <li>Choose <strong>Fabric SQL endpoint</strong>.</li>
            <li>Enter server and database.</li>
            <li>Click <strong>Test connection</strong>.</li>
            <li>Click <strong>Load catalog</strong> only after the test succeeds.</li>
          </ol>
        </DocsExample>
      </DocsSection>

      <DocsSection id="explorer" title="Object Explorer" intro="The explorer shows the current catalog. Selecting an object makes it the active object for the builder, editor helpers, active summary, and SQL history context.">
        <DocsMiniSection title="Selecting an object">
          <p>Click a table or view to load its columns. The active object appears in the top workspace header and is highlighted in the explorer.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Searching">
          <p>Use the search box to filter long catalogs. The search does not change the active object until you click a result.</p>
        </DocsMiniSection>
        <DocsMiniSection title="When an object has no columns">
          <p>Check metadata permissions, the database name, and whether the selected source exposes that object through the SQL endpoint.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="builder" title="Query Builder" intro="The builder turns the selected object and columns into editable SQL. Generated SQL is a starting point, not a locked query.">
        <div className="docs-table">
          <div><strong>Select</strong><span>Builds a read query with selected columns, filters, sort, TOP rows, and DISTINCT.</span></div>
          <div><strong>Insert</strong><span>Creates an INSERT template. Review values before running.</span></div>
          <div><strong>Update</strong><span>Creates an UPDATE template. A WHERE clause is required before execution.</span></div>
          <div><strong>Delete</strong><span>Creates a DELETE template. A WHERE clause is required before execution.</span></div>
          <div><strong>Filters</strong><span>Add one or more conditions. Supported operators include comparisons, LIKE, IS NULL, and IS NOT NULL.</span></div>
          <div><strong>Sort and limit</strong><span>Choose sort column, direction, TOP rows, and DISTINCT for generated reads.</span></div>
        </div>
        <DocsExample title="Example generated read">
          <pre>{`SELECT TOP (100)
       [AlertId],
       [Status],
       [CreatedUtc]
FROM [dbo].[Alerts]
WHERE [Status] LIKE '%FAIL%'
ORDER BY [CreatedUtc] DESC;`}</pre>
        </DocsExample>
        <div className="docs-callout docs-callout-warning">
          Generated UPDATE and DELETE statements still go through server-side safety checks. The app blocks unrestricted UPDATE and DELETE operations.
        </div>
      </DocsSection>

      <DocsSection id="editor" title="SQL Editor" intro="The editor is where generated or manually written SQL is reviewed and executed. You can always edit generated SQL before running it.">
        <DocsCardGrid
          items={[
            { title: 'Run query', text: 'Runs SELECT queries directly or starts write preview for INSERT, UPDATE, and DELETE.' },
            { title: 'Format', text: 'Reflows common SQL clauses into a clearer layout.' },
            { title: 'Copy and Clear', text: 'Copy the current SQL or clear the editor when switching tasks.' },
            { title: 'Text size', text: 'Use A- and A+ to tune editor readability for your screen.' }
          ]}
        />
        <DocsMiniSection title="SQL helper">
          <p>The helper inserts common expressions such as <code>CONCAT</code>, <code>REPLACE</code>, <code>TRY_CONVERT</code>, <code>COALESCE</code>, <code>CASE</code>, <code>DATEADD</code>, and <code>HASHBYTES</code> templates.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Keyboard shortcuts">
          <p><span className="docs-kbd">Ctrl</span> + <span className="docs-kbd">Enter</span> runs the current query. <span className="docs-kbd">Ctrl</span> + <span className="docs-kbd">Shift</span> + <span className="docs-kbd">F</span> formats SQL.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="advanced" title="Advanced Tools" intro="Advanced tools help create cross-object templates and run read-only object analysis without leaving SQL Studio.">
        <div className="docs-table">
          <div><strong>INSERT SELECT</strong><span>Creates a review template for loading one object from another object.</span></div>
          <div><strong>UPDATE JOIN</strong><span>Creates a review template for joining source and target objects by key.</span></div>
          <div><strong>MERGE preview</strong><span>Creates a MERGE review template only. MERGE execution is blocked by the app.</span></div>
          <div><strong>Sample profile</strong><span>Runs a read-only sample profile and shows completeness, nulls, and simple column characteristics.</span></div>
          <div><strong>Dependency view</strong><span>Loads read-only dependency information where the source supports it.</span></div>
        </div>
        <DocsExample title="Example UPDATE JOIN template">
          <pre>{`UPDATE tgt
SET tgt.[Status] = src.[Status]
FROM [dbo].[Alerts] AS tgt
INNER JOIN [staging].[AlertUpdates] AS src
    ON tgt.[AlertId] = src.[AlertId]
WHERE <review scope before execution>;`}</pre>
        </DocsExample>
      </DocsSection>

      <DocsSection id="results" title="Results Panel" intro="Results are designed for inspection first: read the shape, filter locally, inspect long values, then copy or export what you need.">
        <ul className="docs-check-list">
          <li><strong>Local filter</strong> filters rows already returned to the browser. It does not run a new database query.</li>
          <li><strong>Sorting</strong> sorts visible result rows by a column.</li>
          <li><strong>Pagination</strong> keeps large returned sets easier to scan.</li>
          <li><strong>Column resizing</strong> lets you widen important columns and reset by double-clicking handles.</li>
          <li><strong>NULL values</strong> appear as a visible pill so blanks are easier to distinguish from missing data.</li>
          <li><strong>Long JSON/text</strong> is collapsed with Show more / Show less, while copy/export still uses the full value.</li>
          <li><strong>Copy rows</strong> and <strong>Export CSV</strong> use the current result data.</li>
          <li><strong>Audit log</strong> loads recent audit entries into the same result grid when access is allowed.</li>
        </ul>
      </DocsSection>

      <DocsSection id="history" title="History, State, And Themes" intro="The app keeps useful context locally so switching tasks does not erase your work.">
        <div className="docs-table">
          <div><strong>Recent SQL</strong><span>Stores recent SQL locally. Clicking an item restores the SQL and switches the active object when the object is found in the loaded catalog.</span></div>
          <div><strong>Mode switching</strong><span>Use the top workspace tabs to move between SQL Studio and Procedure Runner, even when the left connection rail is hidden.</span></div>
          <div><strong>Workspace restore</strong><span>Editor text, cursor position, filters, sort, results, pagination, and active object are restored for the same browser tab and connection.</span></div>
          <div><strong>Saved profiles</strong><span>Server/database profile details can be saved. Passwords and service principal secrets are not saved.</span></div>
          <div><strong>Themes</strong><span>Choose a theme in the activity panel. The selected theme is saved locally and also applies to documentation pages.</span></div>
          <div><strong>Panel layout</strong><span>Resize the connection rail, explorer, activity panel, and results height on wide layouts. Hide/show state and sizes are saved locally.</span></div>
        </div>
      </DocsSection>

      <DocsSection id="safety" title="Execution Safety" intro="The backend validates every query. Client-side UI choices are helpful, but server-side checks are the real safety gate.">
        <div className="docs-flow">
          <div><strong>1. Classify</strong><span>The server identifies SELECT, INSERT, UPDATE, DELETE, and blocked operations.</span></div>
          <div><strong>2. Preview</strong><span>Writes are previewed in a rollback transaction before real execution.</span></div>
          <div><strong>3. Confirm</strong><span>Writes require a short-lived confirmation token. Larger writes can require typed confirmation.</span></div>
          <div><strong>4. Execute</strong><span>The server executes only after the exact reviewed request is confirmed.</span></div>
        </div>
        <div className="docs-callout docs-callout-danger">
          Blocked operations include <code>DROP</code>, <code>TRUNCATE</code>, <code>ALTER</code>, <code>CREATE</code>, <code>MERGE</code>, <code>EXEC</code>, unrestricted <code>UPDATE</code>, unrestricted <code>DELETE</code>, and multiple statements.
        </div>
      </DocsSection>

      <DocsSection id="troubleshooting" title="Troubleshooting" intro="Most issues come from connection details, metadata permissions, or stale context after changing connections.">
        <div className="docs-table">
          <div><strong>Connection failed</strong><span>Check server host, database name, auth mode, credentials, and network access to TCP 1433.</span></div>
          <div><strong>Certificate error</strong><span>Make sure the server field is a single host name, not a full connection string or comma-separated list.</span></div>
          <div><strong>No objects loaded</strong><span>The database may be wrong, metadata permissions may be missing, or the endpoint may not expose tables/views.</span></div>
          <div><strong>Query blocked</strong><span>Review the safety message. Writes usually need WHERE scope and confirmation. Dangerous commands are intentionally blocked.</span></div>
          <div><strong>History did not switch object</strong><span>Load the current catalog first. Older history items can only switch objects when the table name exists in the loaded catalog.</span></div>
          <div><strong>Confirmation expired</strong><span>Run the preview again. Confirmation tokens are time-limited by design.</span></div>
        </div>
      </DocsSection>
    </DocsShell>
  );
}
