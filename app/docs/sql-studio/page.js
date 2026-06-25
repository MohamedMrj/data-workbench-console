import { DocsCardGrid, DocsExample, DocsMiniSection, DocsSection, DocsShell } from '../doc-shell';

export const metadata = {
  title: 'SQL Studio Guide',
  description: 'Clear English guide for SQL Studio in Data Workbench Console.'
};

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'workspace-controls', label: 'Workspace controls' },
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
            { title: 'Build SQL automatically', text: 'Selecting objects and changing builder controls updates editable SELECT, INSERT, UPDATE, and DELETE templates.' },
            { title: 'Inspect metadata', text: 'Script objects, profile columns, inspect dependencies, compare schemas, review result shape, row counts, top values, and estimated read-query plans.' },
            { title: 'Inspect results', text: 'Use capped result tabs, filter visible rows, sort columns, copy rows, export CSV, and inspect null, JSON, or long values.' },
            { title: 'Stay controlled', text: 'Writes are previewed and confirmed. Stored procedures are intentionally handled in Procedure Runner.' }
          ]}
        />
        <div className="docs-callout docs-callout-info">
          SQL Studio is best for table and view workflows. Use <strong>Procedure Runner</strong> when the work must happen through a stored procedure.
        </div>
      </DocsSection>

      <DocsSection id="workspace-controls" title="Workspace Controls And Support" intro="The top workspace buttons are shared across SQL Studio and Procedure Runner. They control documentation, support, tools, panels, and the local desktop server.">
        <div className="docs-table">
          <div><strong>Documentation</strong><span>Opens this guide in a new tab. Use it when you need button behavior, requirements, source support, or troubleshooting details.</span></div>
          <div><strong>Tools</strong><span>Opens Workbench Tools. Use it for quick actions, SQL safety summary, capability checks, scratchpads, and diagnostics.</span></div>
          <div><strong>Support</strong><span>Opens a bug-report form. Fill in title, area, severity, description, reproduction steps, and optional screenshot, then open an email draft to support.</span></div>
          <div><strong>Update</strong><span>Appears only when the local Git checkout is behind the configured remote. It pulls the latest app code, preserves local <code>.env</code> and <code>.data</code>, rebuilds, restarts the local server, and reloads the browser.</span></div>
          <div><strong>Hide / Show connection panel</strong><span>Collapses or restores the left connection rail. Use it when you need more space for query building or result inspection.</span></div>
          <div><strong>Hide / Show themes & history</strong><span>Collapses or restores the right activity panel. Use it when history and themes are not needed for the current task.</span></div>
          <div><strong>Exit Data Workbench</strong><span>Requests shutdown of the local desktop server. Use it when you are done with the app, not just when you want to close a tab.</span></div>
        </div>
        <DocsMiniSection title="Workbench Tools">
          <p><strong>Quick actions</strong> can load catalog, run the current query, format SQL, save a scratchpad, open audit filters, profile the active object, load dependencies, or script ALTER/Edit for the active object.</p>
          <p><strong>Current SQL</strong> summarizes detected action, risk, builder mode, target object, selected columns, filters, and editor size. Use it before running copied or generated SQL.</p>
          <p><strong>Scratchpads</strong> save temporary SQL locally for quick restore. Use them for drafts that are not ready for query history or source control.</p>
          <p><strong>Diagnostics</strong> shows safe app/session context and can copy a diagnostic payload for support. It does not include passwords or client secrets.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Support reports">
          <p>The Support form prepares an email to <code>mohamed.al-mefrej@hotmail.com</code> and copies the report text. Browser email drafts cannot attach screenshots automatically, so attach the selected screenshot manually before sending.</p>
        </DocsMiniSection>
        <DocsMiniSection title="App updates">
          <p>The Update button requires the app to be installed with <code>git clone</code>. Zip-folder installs cannot self-update because they have no remote repository metadata. Update logs are written to <code>.data/logs/data-workbench-update.log</code>.</p>
        </DocsMiniSection>
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
          <div><strong>Load catalog</strong><span>Loads tables, views, and procedures when the selected source supports them. Required before object selection, scripting, profiling, dependency view, pins/recent filtering, and most advanced operations.</span></div>
          <div><strong>Saved profiles</strong><span>Save reusable source, auth mode, server, port, database, username, and trust settings. Secrets are not stored. Clicking a saved profile loads its catalog automatically when the profile has enough connection information.</span></div>
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
        <DocsMiniSection title="Searching and filtering">
          <p>Use search, type, schema, pinned-only, and recent-only filters to narrow long catalogs. After an object has loaded columns, the search can also match loaded column names. Filtering does not change the active object until you click a result.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Pins and recent objects">
          <p>Pin important objects from the explorer. Pinned and recent objects are scoped to the current connection, so production and test databases do not share pin state.</p>
        </DocsMiniSection>
        <DocsMiniSection title="When an object has no columns">
          <p>Check metadata permissions, the database name, and whether the selected source exposes that object through the SQL endpoint.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="builder" title="Query Builder" intro="The builder turns the selected object and columns into editable SQL. Generated SQL is a starting point, not a locked query.">
        <div className="docs-table">
          <div><strong>Preview rows</strong><span>Switches to Select mode, sets TOP rows to 100, and regenerates a read query. Requires an active table or view.</span></div>
          <div><strong>Count rows</strong><span>Loads a <code>COUNT_BIG(*)</code> query into the editor for the active object. Requires an active table or view.</span></div>
          <div><strong>Reset</strong><span>Clears selected columns, filters, sort, TOP, and DISTINCT back to defaults. Use it when builder state no longer matches the query you want.</span></div>
          <div><strong>Select</strong><span>Builds a read query with selected columns, filters, sort, TOP rows, and DISTINCT.</span></div>
          <div><strong>Insert</strong><span>Creates an INSERT template. Review values before running.</span></div>
          <div><strong>Update</strong><span>Creates an UPDATE template. A WHERE clause is required before execution.</span></div>
          <div><strong>Delete</strong><span>Creates a DELETE template. A WHERE clause is required before execution.</span></div>
          <div><strong>All / Clear columns</strong><span>Selects all loaded columns or clears explicit column choices. Clear means the generated SELECT returns the default/all column set.</span></div>
          <div><strong>Filters</strong><span>Add one or more conditions. Supported operators include comparisons, LIKE, IS NULL, and IS NOT NULL.</span></div>
          <div><strong>Add filter</strong><span>Adds a filter row. Pick a column, operator, and value before generating or inserting a usable WHERE clause.</span></div>
          <div><strong>Sort and limit</strong><span>Choose sort column, direction, TOP rows, and DISTINCT for generated reads.</span></div>
          <div><strong>Refresh SQL</strong><span>Rebuilds the editor text from the current builder selections when you want to discard manual edits and return to the generated template.</span></div>
          <div><strong>Script CREATE</strong><span>Loads a CREATE script for the active table, view, or procedure into the SQL editor for review.</span></div>
          <div><strong>Script ALTER/Edit</strong><span>Loads an editable ALTER-style script where the source supports it. The script is not executed automatically.</span></div>
          <div><strong>Insert WHERE</strong><span>Inserts or rebuilds a WHERE clause from completed filter rows. Requires at least one complete filter.</span></div>
          <div><strong>Insert ORDER BY</strong><span>Inserts an ORDER BY clause from the selected sort column and direction. If no sort column is selected, it inserts a placeholder.</span></div>
          <div><strong>Join note</strong><span>Inserts a comment template for documenting an intended join. Use it as a reminder before manually writing joins.</span></div>
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
        <div className="docs-callout docs-callout-info">
          SQL Server and Fabric SQL table scripts are reconstructed from catalog metadata. They can include columns, identity, defaults, computed columns, keys, checks, indexes, and foreign keys, but they are not the exact original deployment text.
        </div>
      </DocsSection>

      <DocsSection id="editor" title="SQL Editor" intro="The editor is where generated or manually written SQL is reviewed and executed. You can always edit generated SQL before running it.">
        <DocsCardGrid
          items={[
            { title: 'Run query', text: 'Runs SELECT queries directly or starts write preview for INSERT, UPDATE, and DELETE.' },
            { title: 'Review scripts', text: 'Object CREATE and ALTER/Edit scripts load into the editor and still use the normal confirmation path if executed.' },
            { title: 'Format', text: 'Reflows common SQL clauses into a clearer layout.' },
            { title: 'Copy and Clear', text: 'Copy the current SQL or clear the editor when switching tasks.' },
            { title: 'Text size', text: 'Use A- and A+ to tune editor readability. The editor adapter preserves textarea behavior and can use Monaco when available.' }
          ]}
        />
        <div className="docs-table">
          <div><strong>A- / A+</strong><span>Decrease or increase SQL editor font size. Use it for long review sessions or projected screens.</span></div>
          <div><strong>Format</strong><span>Formats common SQL clauses. Use it before review, especially after loading scripts or helper snippets.</span></div>
          <div><strong>Copy</strong><span>Copies the full editor SQL to the clipboard.</span></div>
          <div><strong>Clear</strong><span>Clears the editor. It does not clear builder state, history, or result tabs.</span></div>
          <div><strong>Run query</strong><span>Runs the current editor text through the existing query API. Writes still require preview and confirmation.</span></div>
        </div>
        <DocsMiniSection title="SQL helper">
          <p>The helper inserts common expressions such as <code>CONCAT</code>, <code>REPLACE</code>, <code>TRY_CONVERT</code>, <code>COALESCE</code>, <code>CASE</code>, <code>DATEADD</code>, and <code>HASHBYTES</code> templates.</p>
          <p><strong>Insert helper</strong> inserts the selected expression at the cursor. <strong>Wrap selection</strong> wraps selected text or the preferred active column with the helper expression.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Keyboard shortcuts">
          <p><span className="docs-kbd">Ctrl</span> + <span className="docs-kbd">Enter</span> runs the current query. <span className="docs-kbd">Ctrl</span> + <span className="docs-kbd">Shift</span> + <span className="docs-kbd">F</span> formats SQL.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="advanced" title="Advanced Operations And Object Analysis" intro="Advanced Operations create cross-object SQL templates. Object Analysis runs read-only metadata or profiling requests against the current connection.">
        <DocsMiniSection title="Template context requirements">
          <p>Advanced templates require an active target object from Object Explorer. For cross-object templates, load the catalog, choose a source object in Template Context, choose a target key, and confirm or edit the source key. Profile sample rows controls how many rows read-only profiling should sample.</p>
        </DocsMiniSection>
        <div className="docs-table">
          <div><strong>Hide / Show advanced</strong><span>Collapses or expands the Advanced Operations panel. The preference is saved locally.</span></div>
          <div><strong>Source object</strong><span>The companion object used by Insert SELECT, Update JOIN, MERGE preview, and Schema compare. Requires catalog metadata.</span></div>
          <div><strong>Profile sample rows</strong><span>Maximum sample size used by Sample profile. Use smaller values for large or sensitive tables.</span></div>
          <div><strong>Target key</strong><span>Column on the active object used as the join key in generated cross-object templates.</span></div>
          <div><strong>Source key</strong><span>Column or expression on the source object. Defaults to the target key name when possible, but should always be reviewed.</span></div>
          <div><strong>Insert SELECT</strong><span>Creates an INSERT...SELECT review template for loading the active target object from a source object. Requires active target, source object, and column metadata.</span></div>
          <div><strong>Update JOIN</strong><span>Creates an UPDATE...FROM JOIN review template. Requires target key/source key and should be scoped before execution.</span></div>
          <div><strong>MERGE preview</strong><span>Creates a MERGE review template only. MERGE execution is blocked by the app; use it for design review or copy into a controlled deployment process.</span></div>
          <div><strong>Sample profile</strong><span>Runs a read-only profile for the active object, using the sample-row setting. Use it to inspect nulls, completeness, and simple column characteristics before writing SQL.</span></div>
          <div><strong>Dependency view</strong><span>Loads dependency rows plus graph-friendly upstream/downstream metadata where the source exposes dependencies. Best for views/procedures and SQL Server/Fabric SQL metadata.</span></div>
          <div><strong>Row count</strong><span>Loads metadata row counts where available. If the source does not expose row-count metadata, the button falls back to an exact <code>COUNT_BIG(*)</code>, which can read the object.</span></div>
          <div><strong>Top values</strong><span>Groups selected or relevant columns and returns common values, null counts, and blanks where supported. Use it to understand categorical fields.</span></div>
          <div><strong>Schema compare</strong><span>Compares columns and supported constraints/index metadata between active and source objects. Use it before copying data or creating migration SQL.</span></div>
          <div><strong>Result shape</strong><span>Describes read-query output columns without executing the full query where supported. Requires a readable SQL statement in the editor.</span></div>
          <div><strong>Estimated plan</strong><span>Requests a non-executing estimated plan for read statements. Requires source support and SHOWPLAN-style permission.</span></div>
        </div>
        <DocsExample title="Example UPDATE JOIN template">
          <pre>{`UPDATE tgt
SET tgt.[Status] = src.[Status]
FROM [dbo].[Alerts] AS tgt
INNER JOIN [staging].[AlertUpdates] AS src
    ON tgt.[AlertId] = src.[AlertId]
WHERE <review scope before execution>;`}</pre>
        </DocsExample>
        <div className="docs-callout docs-callout-warning">
          Advanced templates are loaded into the SQL editor only. They do not execute automatically, and all execution still goes through the normal query classifier, preview, and confirmation path.
        </div>
      </DocsSection>

      <DocsSection id="results" title="Results Panel" intro="Results are designed for inspection first: read the shape, filter locally, inspect long values, then copy or export what you need.">
        <ul className="docs-check-list">
          <li><strong>Result tabs</strong> keep up to five query, procedure, and metadata results available for quick comparison.</li>
          <li><strong>A- / A+</strong> changes result text size for dense data or screen sharing.</li>
          <li><strong>Local filter</strong> filters rows already returned to the browser. It does not run a new database query.</li>
          <li><strong>Sorting</strong> sorts visible result rows by a column.</li>
          <li><strong>Pagination</strong> keeps large returned sets easier to scan.</li>
          <li><strong>Prev / Next</strong> moves through local result pages without re-running the query.</li>
          <li><strong>Columns arrows</strong> scroll wide result tables horizontally without using the browser scrollbar.</li>
          <li><strong>Column resizing</strong> lets you widen important columns and reset by double-clicking handles.</li>
          <li><strong>NULL values</strong> appear as a visible pill so blanks are easier to distinguish from missing data.</li>
          <li><strong>Long JSON/text</strong> is collapsed with Show more / Show less, while copy/export still uses the full value.</li>
          <li><strong>Cell context menu</strong> can copy the clicked cell value, column name, formatted JSON, or the whole row as JSON/CSV.</li>
          <li><strong>Copy rows</strong> and <strong>Export CSV</strong> use the current result data.</li>
          <li><strong>Audit log</strong> opens filters for event, outcome, action, source type, database, search text, and limit. Use it to review metadata reads, query previews, confirmations, executions, and errors.</li>
        </ul>
      </DocsSection>

      <DocsSection id="history" title="History, State, And Themes" intro="The app keeps useful context locally so switching tasks does not erase your work.">
        <div className="docs-table">
          <div><strong>Recent SQL</strong><span>Stores recent SQL locally. Clicking an item restores the SQL and switches the active object when the object is found in the loaded catalog.</span></div>
          <div><strong>Pinned objects</strong><span>Stores pinned objects and procedures locally, scoped to the current connection fingerprint.</span></div>
          <div><strong>Result tabs</strong><span>Restores active result-tab state for the same browser session when the result payload is small enough for session storage.</span></div>
          <div><strong>Mode switching</strong><span>Use the top workspace tabs to move between SQL Studio and Procedure Runner, even when the left connection rail is hidden.</span></div>
          <div><strong>Workspace restore</strong><span>Editor text, cursor position, filters, sort, result tabs, pagination, and active object are restored for the same browser tab and connection.</span></div>
          <div><strong>Saved profiles</strong><span>Server/database profile details can be saved. Passwords and service principal secrets are not saved.</span></div>
          <div><strong>Themes</strong><span>Choose a theme in the activity panel. The selected theme is saved locally and also applies to documentation pages.</span></div>
          <div><strong>Clear history</strong><span>Clears the current workspace history list. SQL history and procedure history are separate.</span></div>
          <div><strong>Panel layout</strong><span>Resize the connection rail, explorer, activity panel, and results height on wide layouts. Hide/show state and sizes are saved locally.</span></div>
          <div><strong>Panel auto-hide</strong><span>When side panels are visible but unused, they fade and collapse after the idle delay. Interacting with a panel resets its timer.</span></div>
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
          Blocked or heightened operations include <code>DROP</code>, <code>TRUNCATE</code>, <code>ALTER</code>, <code>CREATE</code>, <code>MERGE</code>, <code>EXEC</code>, unrestricted <code>UPDATE</code>, unrestricted <code>DELETE</code>, and multiple statements. CREATE and ALTER can only proceed through the existing direct confirmation flow.
        </div>
      </DocsSection>

      <DocsSection id="troubleshooting" title="Troubleshooting" intro="Most issues come from connection details, metadata permissions, or stale context after changing connections.">
        <div className="docs-table">
          <div><strong>Connection failed</strong><span>Check server host, database name, auth mode, credentials, and network access to TCP 1433.</span></div>
          <div><strong>Certificate error</strong><span>Make sure the server field is a single host name, not a full connection string or comma-separated list.</span></div>
          <div><strong>No objects loaded</strong><span>The database may be wrong, metadata permissions may be missing, or the endpoint may not expose tables/views.</span></div>
          <div><strong>Query blocked</strong><span>Review the safety message. Writes usually need WHERE scope and confirmation. Dangerous commands are intentionally blocked.</span></div>
          <div><strong>Estimated plan unavailable</strong><span>The source may not support estimated plans or the current account may lack SHOWPLAN-style permission.</span></div>
          <div><strong>Generated table script differs from source file</strong><span>SQL Server does not store original CREATE TABLE text. The app reconstructs a practical script from catalog metadata.</span></div>
          <div><strong>History did not switch object</strong><span>Load the current catalog first. Older history items can only switch objects when the table name exists in the loaded catalog.</span></div>
          <div><strong>Confirmation expired</strong><span>Run the preview again. Confirmation tokens are time-limited by design.</span></div>
        </div>
      </DocsSection>
    </DocsShell>
  );
}
