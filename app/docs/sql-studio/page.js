import { DocsMiniSection, DocsSection, DocsShell } from '../doc-shell';

export const metadata = {
  title: 'SQL Studio - Guide',
  description: 'Kort guide for SQL Studio i Data Workbench Console.'
};

const sections = [
  { id: 'start', label: 'Kom igang' },
  { id: 'screen', label: 'Skarmen' },
  { id: 'queries', label: 'Fragar' },
  { id: 'safety', label: 'Sakerhet' },
  { id: 'troubleshooting', label: 'Felsokning' }
];

export default function SqlStudioDocsPage() {
  return (
    <DocsShell
      eyebrow="Guide"
      title="SQL Studio"
      description="For dig som vill ansluta, hitta tabeller, bygga SQL och granska resultat utan att behova leta runt i hela verktyget."
      sections={sections}
      steps={[
        'Valj source type och fyll i server/databas.',
        'Klicka Test connection.',
        'Klicka Load catalog.',
        'Valj tabell eller vy.',
        'Generera SQL eller skriv egen fraga.'
      ]}
    >
      <DocsSection id="start" title="Kom igang">
        <DocsMiniSection title="1. Anslut">
          <p>Valj <strong>Fabric SQL endpoint</strong>, <strong>Fabric Lakehouse SQL endpoint</strong> eller <strong>SQL Server</strong>. Fabric anvander service principal fran serverns miljovariabler.</p>
        </DocsMiniSection>
        <DocsMiniSection title="2. Testa">
          <p><strong>Test connection</strong> verifierar server, port, databas och autentisering. Om detta misslyckas ska du inte ga vidare till katalogen.</p>
        </DocsMiniSection>
        <DocsMiniSection title="3. Ladda katalog">
          <p><strong>Load catalog</strong> hamtar tabeller, vyer och, dar det stods, procedurer. Inget SQL kor automatiskt nar katalogen laddas.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="screen" title="Skarmen">
        <div className="docs-card-row">
          <div className="docs-card"><strong>Connection</strong><span>Valj kalla, testa anslutning och spara profiler.</span></div>
          <div className="docs-card"><strong>Object Explorer</strong><span>Sok och valj tabeller eller vyer.</span></div>
          <div className="docs-card"><strong>Query Builder</strong><span>Valj operation, kolumner, filter, sortering och radgrans.</span></div>
          <div className="docs-card"><strong>SQL Editor</strong><span>Redigera och kor slutlig SQL.</span></div>
          <div className="docs-card"><strong>Results</strong><span>Se resultat, filtrera, kopiera eller exportera CSV.</span></div>
          <div className="docs-card"><strong>Themes & History</strong><span>Byt tema och ateranvand senaste SQL lokalt i webblasaren.</span></div>
        </div>
      </DocsSection>

      <DocsSection id="queries" title="Fragar">
        <DocsMiniSection title="SELECT">
          <p>Det vanligaste laget. Valj objekt, kolumner och filter. Anvand <strong>Preview rows</strong> eller <strong>Count rows</strong> for snabb kontroll.</p>
        </DocsMiniSection>
        <DocsMiniSection title="INSERT, UPDATE, DELETE">
          <p>Appen skapar mallar, men andringar kor inte direkt. Du far forhandsgranskning och maste bekrafta innan exekvering.</p>
        </DocsMiniSection>
        <DocsMiniSection title="SQL helper">
          <p>Infogar vanliga uttryck som <code>CONCAT</code>, <code>TRY_CONVERT</code>, <code>COALESCE</code>, <code>CASE</code> och datumfunktioner.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Advanced">
          <p>Anvands for <strong>Insert SELECT</strong>, <strong>Update JOIN</strong>, <strong>MERGE preview</strong>, sample profile och dependency view. MERGE ar endast mall, inte exekvering.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="safety" title="Sakerhet">
        <ul className="docs-check-list">
          <li>SELECT-liknande fragor kor direkt.</li>
          <li>Writes forhandsgranskas i transaktion och rullas tillbaka.</li>
          <li>Bekraftelsen ar tidsbegransad och galler exakt samma query.</li>
          <li>Andrar du SQL efter preview maste du forhandsgranska igen.</li>
          <li>Stored procedures kors fran Procedure Runner, inte som fri EXEC i editorn.</li>
        </ul>
      </DocsSection>

      <DocsSection id="troubleshooting" title="Felsokning">
        <div className="docs-table">
          <div><strong>Certifikatfel</strong><span>Server-faltet innehaller ofta fel hostname eller flera hostnames ihopklistrade.</span></div>
          <div><strong>Login failed</strong><span>Kontrollera endpoint, databasnamn och service-principal-behorighet.</span></div>
          <div><strong>No objects loaded</strong><span>Fel databas, saknad rattighet eller kallen exponerar inte metadata.</span></div>
          <div><strong>Confirmation expired</strong><span>Kor preview igen och bekrafta inom tidsgransen.</span></div>
        </div>
      </DocsSection>
    </DocsShell>
  );
}
