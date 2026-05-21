import { DocsMiniSection, DocsSection, DocsShell } from '../doc-shell';

export const metadata = {
  title: 'Procedure Runner - Guide',
  description: 'Kort guide for Procedure Runner i Data Workbench Console.'
};

const sections = [
  { id: 'start', label: 'Kom igang' },
  { id: 'support', label: 'Stod' },
  { id: 'parameters', label: 'Parametrar' },
  { id: 'run', label: 'Kora' },
  { id: 'troubleshooting', label: 'Felsokning' }
];

export default function ProcedureRunnerDocsPage() {
  return (
    <DocsShell
      eyebrow="Guide"
      title="Procedure Runner"
      description="For dig som ska hitta, granska och kora stored procedures med tydlig parameterkontroll och bekraftelse."
      sections={sections}
      steps={[
        'Anslut och ladda katalogen.',
        'Valj procedur i Procedure Explorer.',
        'Granska parametrarna.',
        'Fyll i varden.',
        'Klicka Run procedure och bekrafta.'
      ]}
    >
      <DocsSection id="start" title="Kom igang">
        <DocsMiniSection title="1. Anslut">
          <p>Anvand samma connection-panel som SQL Studio. Testa anslutningen innan du laddar katalogen.</p>
        </DocsMiniSection>
        <DocsMiniSection title="2. Valj procedur">
          <p><strong>Procedure Explorer</strong> visar procedurer for aktiv databas. Sok i listan och klicka pa proceduren du vill granska.</p>
        </DocsMiniSection>
        <DocsMiniSection title="3. Ladda om vid behov">
          <p><strong>Refresh params</strong> hamtar parameterlistan igen om proceduren har andrats.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="support" title="Stod per kalla">
        <div className="docs-card-row">
          <div className="docs-card"><strong>Fabric SQL endpoint</strong><span>Stodjer procedurkatalog, parametrar och korning.</span></div>
          <div className="docs-card"><strong>SQL Server</strong><span>Stodjer procedurer nar inloggningen har ratt behorighet.</span></div>
          <div className="docs-card"><strong>Fabric Lakehouse</strong><span>Procedurer ar inte tillgangliga i appen for Lakehouse SQL endpoint.</span></div>
        </div>
      </DocsSection>

      <DocsSection id="parameters" title="Parametrar">
        <ul className="docs-check-list">
          <li>Tomt falt betyder att parametern utelamnas.</li>
          <li>Skriv <code>NULL</code> for att skicka null.</li>
          <li>Output-parametrar fylls inte i, de visas efter korning.</li>
          <li>Datum, nummer, boolean och GUID valideras nar typen ar kand.</li>
        </ul>
      </DocsSection>

      <DocsSection id="run" title="Kora procedur">
        <DocsMiniSection title="Forbered">
          <p>Forsta klicket pa <strong>Run procedure</strong> skapar en tidsbegransad bekraftelse kopplad till anslutning, procedur och parametrar.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Bekrafta">
          <p>Granska dialogen. Om nagot ar fel, avbryt. Om parametrar andras efter forberedelse maste du starta om korningen.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Resultat">
          <p>Resultatpanelen visar recordset, rows affected, output-parametrar och return value nar databasen returnerar det.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="troubleshooting" title="Felsokning">
        <div className="docs-table">
          <div><strong>Procedures unavailable</strong><span>Kallan stodjer inte procedurer i appen, vanligt for Lakehouse.</span></div>
          <div><strong>No procedures loaded</strong><span>Databasen saknar procedurer eller anvandaren saknar metadata-rattighet.</span></div>
          <div><strong>Parameter expects...</strong><span>Vardet matchar inte datatypen. Kontrollera datum, nummer eller GUID.</span></div>
          <div><strong>Confirmation expired</strong><span>Klicka Run procedure igen och bekrafta inom tidsgransen.</span></div>
        </div>
      </DocsSection>
    </DocsShell>
  );
}
