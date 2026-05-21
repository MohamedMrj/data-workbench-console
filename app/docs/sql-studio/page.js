import { DocsMiniSection, DocsSection, DocsShell } from '../doc-shell';

export const metadata = {
  title: 'SQL Studio - Guide',
  description: 'Praktisk guide för SQL Studio i Data Workbench Console.'
};

const sections = [
  { id: 'workflow', label: 'Arbetsflöde' },
  { id: 'connection', label: 'Anslutning' },
  { id: 'explorer', label: 'Objekt' },
  { id: 'builder', label: 'Bygg SQL' },
  { id: 'editor', label: 'Kör SQL' },
  { id: 'results', label: 'Resultat' },
  { id: 'safety', label: 'Säkerhet' },
  { id: 'errors', label: 'Fel' }
];

export default function SqlStudioDocsPage() {
  return (
    <DocsShell
      eyebrow="Guide"
      title="SQL Studio"
      description="Använd SQL Studio när du vill hitta tabeller, bygga SELECT-frågor, granska data och köra kontrollerade ändringar med preview."
      sections={sections}
      steps={[
        'Välj källa och databas.',
        'Testa anslutningen.',
        'Ladda katalogen.',
        'Välj objekt och kolumner.',
        'Generera eller kör SQL.'
      ]}
    >
      <DocsSection id="workflow" title="När använder jag SQL Studio?">
        <DocsMiniSection title="Vanlig användning">
          <p>Du använder SQL Studio för att läsa data, undersöka tabeller/vyer, bygga SQL från metadata och exportera resultat.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Ändringar i data">
          <p>INSERT, UPDATE och DELETE går via preview och bekräftelse. Verktyget är byggt för att minska risken att fel query körs direkt.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Inte för stored procedures">
          <p>Stored procedures körs från <strong>Procedure Runner</strong>. Kör inte fri <code>EXEC</code> i SQL-editorn.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="connection" title="Anslutning">
        <div className="docs-card-row">
          <div className="docs-card"><strong>Source type</strong><span>Välj Fabric SQL endpoint, Fabric Lakehouse SQL endpoint eller SQL Server.</span></div>
          <div className="docs-card"><strong>Authentication</strong><span>Fabric använder service principal. SQL Server kan använda SQL login eller service principal.</span></div>
          <div className="docs-card"><strong>Server</strong><span>Klistra bara in hostnamnet, inte hela connection string och inte flera hostnames.</span></div>
          <div className="docs-card"><strong>Database</strong><span>Databasen/SQL endpoint-databasen som katalog och frågor ska köras mot.</span></div>
        </div>
        <div className="docs-callout">Rätt ordning: <strong>Test connection</strong> först, sedan <strong>Load catalog</strong>. Sparade profiler fyller bara i fält, de kör inget automatiskt.</div>
      </DocsSection>

      <DocsSection id="explorer" title="Object Explorer">
        <DocsMiniSection title="Vad visar den?">
          <p>Tabeller och vyer från aktiv anslutning. När du väljer ett objekt laddas kolumnerna och resten av SQL Studio använder det objektet.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Så använder du den">
          <p>Sök i listan, välj objekt, kontrollera kolumnlistan och använd sedan Query Builder eller skriv egen SQL.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Om listan är tom">
          <p>Kontrollera databasnamn, behörighet och att källan exponerar objekt via SQL endpointen.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="builder" title="Query Builder">
        <div className="docs-table">
          <div><strong>Select</strong><span>För läsning. Välj kolumner, filter, sortering, TOP och Distinct.</span></div>
          <div><strong>Insert</strong><span>Skapar INSERT-mall. Fyll i värden och granska innan körning.</span></div>
          <div><strong>Update</strong><span>Skapar UPDATE-mall. Använd alltid WHERE/filter så scope blir tydligt.</span></div>
          <div><strong>Delete</strong><span>Skapar DELETE-mall. Kör bara efter preview och tydligt filter.</span></div>
        </div>
        <div className="docs-callout"><strong>Advanced Operations</strong> skapar Insert SELECT, Update JOIN, MERGE preview, sample profile och dependency view. MERGE är endast mall, inte körning.</div>
      </DocsSection>

      <DocsSection id="editor" title="SQL Editor">
        <DocsMiniSection title="Vad gör knapparna?">
          <p><strong>Generate SQL</strong> skriver builder-frågan till editorn. <strong>Run query</strong> kör eller startar preview. <strong>Format</strong>, <strong>Copy</strong> och <strong>Clear</strong> hjälper med texten.</p>
        </DocsMiniSection>
        <DocsMiniSection title="SQL helper">
          <p>Infogar vanliga uttryck som <code>CONCAT</code>, <code>TRY_CONVERT</code>, <code>COALESCE</code>, <code>CASE</code>, datumfunktioner och nyckelmallar.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Kortkommandon">
          <p><span className="docs-kbd">Ctrl</span> + <span className="docs-kbd">Enter</span> kör frågan. <span className="docs-kbd">Ctrl</span> + <span className="docs-kbd">Shift</span> + <span className="docs-kbd">F</span> formaterar.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="results" title="Resultat och historik">
        <ul className="docs-check-list">
          <li><strong>Filter results</strong> filtrerar bara det som redan visas i webbläsaren.</li>
          <li><strong>Export CSV</strong> och <strong>Copy rows</strong> använder synliga resultat.</li>
          <li><strong>Audit log</strong> visar senaste auditposter om servern tillåter åtkomst.</li>
          <li><strong>Recent SQL</strong> sparas lokalt i webbläsaren och kan rensas.</li>
          <li><strong>Themes</strong> sparas lokalt och följer även dokumentationssidorna.</li>
        </ul>
      </DocsSection>

      <DocsSection id="safety" title="Säkerhetsflöde">
        <div className="docs-table">
          <div><strong>Read</strong><span>SELECT-liknande frågor körs direkt och resultatet begränsas av serverns row limit.</span></div>
          <div><strong>Preview</strong><span>Writes testas i transaktion och rullas tillbaka för att visa påverkan.</span></div>
          <div><strong>Confirm</strong><span>Bekräftelsen är tidsbegränsad och gäller exakt samma query, anslutning och session.</span></div>
          <div><strong>Execute</strong><span>Först efter bekräftelse körs ändringen på riktigt.</span></div>
        </div>
      </DocsSection>

      <DocsSection id="errors" title="Vanliga fel">
        <div className="docs-table">
          <div><strong>Certifikatfel</strong><span>Serverfältet innehåller fel hostname, flera hostnames eller en hel connection string.</span></div>
          <div><strong>Login failed</strong><span>Fel endpoint/databas eller service principal saknar behörighet.</span></div>
          <div><strong>No objects</strong><span>Katalogen är tom på grund av fel databas, metadata-behörighet eller källa.</span></div>
          <div><strong>Expired</strong><span>Preview eller bekräftelse tog för lång tid. Kör om preview.</span></div>
        </div>
      </DocsSection>
    </DocsShell>
  );
}
