import { DocsCardGrid, DocsExample, DocsMiniSection, DocsSection, DocsShell } from '../doc-shell';

export const metadata = {
  title: 'Procedure Runner Guide',
  description: 'Clear English guide for Procedure Runner in Data Workbench Console.'
};

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'connection', label: 'Connect' },
  { id: 'support', label: 'Support' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'execution', label: 'Run flow' },
  { id: 'results', label: 'Results' },
  { id: 'history', label: 'History' },
  { id: 'safety', label: 'Safety' },
  { id: 'troubleshooting', label: 'Troubleshooting' }
];

export default function ProcedureRunnerDocsPage() {
  return (
    <DocsShell
      eyebrow="Operator guide"
      title="Procedure Runner"
      description="Use Procedure Runner when work should happen through approved stored procedures, with parameter review, confirmation, result inspection, and audit visibility."
      sections={sections}
      highlights={[
        { label: 'Approved procedure workflow', tone: 'success' },
        { label: 'Parameter review', tone: 'info' },
        { label: 'Confirm before execution', tone: 'warning' }
      ]}
      steps={[
        'Choose a source and database.',
        'Load the catalog.',
        'Select a procedure.',
        'Review and fill parameters.',
        'Run, confirm, and inspect results.'
      ]}
    >
      <DocsSection id="overview" title="What Procedure Runner Is For" intro="Procedure Runner is the controlled path for operational jobs that already exist in the database as stored procedures.">
        <DocsCardGrid
          items={[
            { title: 'Run approved jobs', text: 'Use it for loading, validation, publishing, queue processing, maintenance, and other prepared database tasks.' },
            { title: 'Review parameters', text: 'See discovered parameters before execution, including data type, direction, and required values where metadata allows.' },
            { title: 'Confirm execution', text: 'Procedure calls are prepared first, then confirmed so the exact connection, procedure, and parameter set is visible.' },
            { title: 'Separate from SQL Studio', text: 'SQL history and procedure history stay separate, so table work and procedure work do not overwrite each other.' }
          ]}
        />
        <div className="docs-callout docs-callout-info">
          Use <strong>SQL Studio</strong> for table and view queries. Use <strong>Procedure Runner</strong> when the database exposes a stored procedure for the job.
        </div>
      </DocsSection>

      <DocsSection id="connection" title="Connect And Load Metadata" intro="Procedure Runner uses the same connection rail as SQL Studio. The selected source, server, database, and authentication mode decide which procedures can be discovered and executed.">
        <div className="docs-table">
          <div><strong>Source type</strong><span>Choose Fabric SQL endpoint or SQL Server when you need stored procedure support.</span></div>
          <div><strong>Authentication</strong><span>Fabric uses service principal settings from the server environment. SQL Server can use SQL login or service principal where supported.</span></div>
          <div><strong>Server</strong><span>Use the host name for the endpoint or SQL Server. Avoid full connection strings in the server field.</span></div>
          <div><strong>Port</strong><span>Use the default SQL port unless your SQL Server procedure connection requires a custom port.</span></div>
          <div><strong>Database</strong><span>The database where the procedure exists and where execution should happen.</span></div>
          <div><strong>SQL login fields</strong><span>Username and password appear only for SQL login mode. Passwords are not saved in connection profiles.</span></div>
          <div><strong>Trust certificate</strong><span>SQL Server can show a trust-server-certificate toggle when your environment needs it.</span></div>
          <div><strong>Test connection</strong><span>Confirms the app can authenticate before metadata or execution calls are made.</span></div>
          <div><strong>Load catalog</strong><span>Loads procedure names and related metadata where the source supports it.</span></div>
          <div><strong>Saved profiles</strong><span>Profiles restore source, auth mode, server, port, database, username, and trust settings without storing secrets.</span></div>
          <div><strong>Refresh params</strong><span>Reloads the selected procedure parameter list after database changes or permission updates.</span></div>
        </div>
        <DocsExample title="Good preparation flow">
          <ol>
            <li>Choose the same source and database that owns the procedure.</li>
            <li>Click <strong>Test connection</strong>.</li>
            <li>Click <strong>Load catalog</strong>.</li>
            <li>Select the procedure from <strong>Procedure Explorer</strong>.</li>
            <li>Review parameters before entering values.</li>
          </ol>
        </DocsExample>
      </DocsSection>

      <DocsSection id="support" title="Supported Sources" intro="Stored procedure support depends on the source. The UI hides or disables procedure actions when the selected source cannot expose procedures safely.">
        <div className="docs-card-row">
          <div className="docs-card docs-card-success"><strong>Fabric SQL endpoint</strong><span>Procedure catalog, parameters, execution, output values, and audit are supported when permissions allow them.</span></div>
          <div className="docs-card docs-card-success"><strong>SQL Server</strong><span>Supported when the login has metadata read access and execute permission for the target procedure.</span></div>
          <div className="docs-card docs-card-warning"><strong>Fabric Lakehouse</strong><span>Lakehouse SQL endpoints are available in SQL Studio for objects, but procedures are not exposed in this app.</span></div>
          <div className="docs-card docs-card-info"><strong>Permissions</strong><span>The user or service principal must be able to read procedure metadata and execute the selected procedure.</span></div>
        </div>
      </DocsSection>

      <DocsSection id="explorer" title="Procedure Explorer" intro="Procedure Explorer is the left-side list for stored procedures in the active catalog. Selecting one procedure makes it the active procedure for the workspace.">
        <DocsMiniSection title="Find a procedure">
          <p>Use the search box to narrow long catalogs by schema or procedure name. Filtering the list does not change the active procedure until you click a result.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Select a procedure">
          <p>Click a procedure to load its parameters, update the active workspace summary, and prepare the runner for that procedure.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Reload stale metadata">
          <p>Use <strong>Refresh params</strong> when a procedure was changed in the database or parameter details look incomplete.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="parameters" title="Parameter Entry" intro="The parameter panel shows the values that will be sent to the selected stored procedure. Treat this as the main review surface before execution.">
        <div className="docs-table">
          <div><strong>Blank field</strong><span>The parameter is omitted. If the procedure has a database default, the default can be used.</span></div>
          <div><strong>NULL</strong><span>Type <code>NULL</code> to send a real null value instead of an empty string.</span></div>
          <div><strong>Text</strong><span>Enter text without wrapping quotes unless the UI specifically asks for a quoted literal.</span></div>
          <div><strong>Numbers</strong><span>Use plain numeric values such as <code>42</code>, <code>0</code>, or <code>19.95</code>.</span></div>
          <div><strong>Dates</strong><span>Use clear ISO-style values such as <code>2026-06-05</code> or <code>2026-06-05T14:30:00</code>.</span></div>
          <div><strong>Boolean values</strong><span>Use values accepted by the procedure, commonly <code>1</code>/<code>0</code> or <code>true</code>/<code>false</code>.</span></div>
          <div><strong>Output parameters</strong><span>Output parameters are returned after execution. They usually do not need input values before the run.</span></div>
          <div><strong>Validation</strong><span>The app validates common types when metadata is available, but the procedure can still reject values with its own rules.</span></div>
        </div>
        <DocsExample title="Example parameter set">
          <pre>{`Procedure: [dbo].[spQueueJob]

@JobName        = RefreshCustomerSnapshot
@RequestedBy   = analyst@company.com
@DryRun        = 1
@CutoffDate    = 2026-06-05
@CustomerId    = NULL`}</pre>
        </DocsExample>
      </DocsSection>

      <DocsSection id="execution" title="Run And Confirm" intro="Procedure execution is a two-step flow. The first click prepares the exact request; confirmation performs the execution.">
        <div className="docs-flow">
          <div><strong>1. Prepare</strong><span>Click <strong>Run procedure</strong>. The app binds the selected procedure, parameter values, connection, and session into a short-lived request.</span></div>
          <div><strong>2. Review</strong><span>The confirmation dialog shows the procedure and values that will be sent. Check the database, schema, procedure name, and high-impact parameters.</span></div>
          <div><strong>3. Confirm</strong><span>Confirm only when the request matches the intended job. If you change a parameter afterward, prepare the run again.</span></div>
          <div><strong>4. Inspect</strong><span>After execution, review recordsets, rows affected, return value, output parameters, messages, and audit status.</span></div>
        </div>
        <div className="docs-callout docs-callout-warning">
          A prepared run can expire. If confirmation takes too long, click <strong>Run procedure</strong> again so the app can prepare a fresh request.
        </div>
      </DocsSection>

      <DocsSection id="results" title="Results And Audit" intro="Procedure results can include recordsets, rows affected, output parameters, return values, and messages. The exact shape depends on what the procedure returns.">
        <ul className="docs-check-list">
          <li><strong>Recordsets</strong> appear in the results grid when the procedure returns tabular data.</li>
          <li><strong>Rows affected</strong> shows the count reported by the database driver when available.</li>
          <li><strong>Output parameters</strong> are displayed after the confirmed execution finishes.</li>
          <li><strong>Return value</strong> is shown when the procedure returns one through the database driver.</li>
          <li><strong>Local filtering</strong> filters rows already returned to the browser. It does not execute the procedure again.</li>
          <li><strong>Copy rows</strong> and <strong>Export CSV</strong> work on visible tabular results.</li>
          <li><strong>Audit entries</strong> record prepare and execute activity with source, database, outcome, and details where audit access is available.</li>
        </ul>
      </DocsSection>

      <DocsSection id="history" title="Procedure History And Restore" intro="Procedure history is local to the browser and separate from SQL history. It is built to make repeat runs faster without losing context.">
        <div className="docs-table">
          <div><strong>Recent procedures</strong><span>Stores recent confirmed procedure runs with procedure name and parameter values.</span></div>
          <div><strong>Restore from history</strong><span>Click a history item to restore the procedure, refill parameter values, and switch the active procedure when it exists in the loaded catalog.</span></div>
          <div><strong>Current catalog required</strong><span>If the procedure is not in the loaded catalog, the app can restore values but cannot select the active procedure until metadata is loaded.</span></div>
          <div><strong>Separate history</strong><span>Procedure Runner only shows procedure history. SQL Studio only shows SQL history.</span></div>
          <div><strong>Mode switching</strong><span>Use the top workspace tabs to switch between Procedure Runner and SQL Studio without reopening the connection panel.</span></div>
          <div><strong>Session restore</strong><span>The selected procedure, parameters, result view, filters, pagination, and history are restored for the same browser tab where possible.</span></div>
          <div><strong>Panel layout</strong><span>Resizable panels, hidden side panels, result height, and layout choices are saved locally and adapt on narrower screens.</span></div>
        </div>
        <div className="docs-callout docs-callout-info">
          Example: if you run <code>dbo.spQueueJob</code>, open another procedure to inspect it, then click the earlier history item, the runner restores <code>dbo.spQueueJob</code> and makes it active again when the catalog contains it.
        </div>
      </DocsSection>

      <DocsSection id="safety" title="Before You Execute" intro="Stored procedures can perform powerful work. The UI makes the request visible, but responsibility still starts with confirming the right environment and inputs.">
        <ul className="docs-check-list">
          <li>Confirm the source type, server, and database before every production run.</li>
          <li>Confirm the schema and procedure name in the active workspace header and confirmation dialog.</li>
          <li>Review high-impact parameters such as date ranges, batch IDs, customer IDs, environment names, and dry-run flags.</li>
          <li>Use dry-run or preview parameters when the procedure supports them.</li>
          <li>Run only procedures you recognize and are authorized to use.</li>
          <li>Production execute permission should be granted separately from read-only metadata access.</li>
        </ul>
        <div className="docs-callout docs-callout-danger">
          Procedure Runner does not inspect the internal SQL inside a stored procedure. If a procedure updates, deletes, publishes, or triggers external work, the procedure owner must provide the operational guardrails.
        </div>
      </DocsSection>

      <DocsSection id="troubleshooting" title="Troubleshooting" intro="Most Procedure Runner issues are caused by unsupported sources, missing metadata permission, stale parameters, or expired confirmations.">
        <div className="docs-table">
          <div><strong>Procedures unavailable</strong><span>The selected source may not expose stored procedures. Fabric Lakehouse procedure execution is not supported in this app.</span></div>
          <div><strong>No procedures listed</strong><span>The database may have no procedures, the wrong database may be selected, or the login may lack metadata permission.</span></div>
          <div><strong>Parameter list is empty</strong><span>Click <strong>Refresh params</strong>. If it stays empty, check metadata permissions or whether the procedure actually has parameters.</span></div>
          <div><strong>Value rejected</strong><span>The value does not match the expected type or a procedure rule. Check number, date, GUID, boolean, and required-field formats.</span></div>
          <div><strong>Execute denied</strong><span>The login can see metadata but does not have execute permission for the selected procedure.</span></div>
          <div><strong>Confirmation expired</strong><span>Click <strong>Run procedure</strong> again and confirm the fresh request.</span></div>
          <div><strong>History did not switch procedure</strong><span>Load the current catalog first. History can only switch active procedure when the procedure exists in the loaded metadata.</span></div>
        </div>
      </DocsSection>
    </DocsShell>
  );
}
