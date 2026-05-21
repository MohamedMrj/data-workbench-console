import { DocsMiniSection, DocsSection, DocsShell } from '../doc-shell';

export const metadata = {
  title: 'Procedure Runner - Guide',
  description: 'Praktisk guide för Procedure Runner i Data Workbench Console.'
};

const sections = [
  { id: 'workflow', label: 'Arbetsflöde' },
  { id: 'switching', label: 'Växla läge' },
  { id: 'support', label: 'Stöd' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'parameters', label: 'Parametrar' },
  { id: 'execution', label: 'Körning' },
  { id: 'results', label: 'Resultat' },
  { id: 'safety', label: 'Ansvar' },
  { id: 'errors', label: 'Fel' }
];

export default function ProcedureRunnerDocsPage() {
  return (
    <DocsShell
      eyebrow="Guide"
      title="Procedure Runner"
      description="Använd Procedure Runner när arbetet ska ske genom färdiga stored procedures med parameterkontroll och bekräftelse."
      sections={sections}
      steps={[
        'Anslut och ladda katalog.',
        'Välj procedur.',
        'Granska parametrar.',
        'Fyll i värden.',
        'Kör och bekräfta.'
      ]}
    >
      <DocsSection id="workflow" title="När använder jag Procedure Runner?">
        <DocsMiniSection title="Rätt användning">
          <p>När databasen redan har en godkänd stored procedure för ett jobb, till exempel laddning, validering, publicering eller underhåll.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Varför separat sida?">
          <p>Procedurer har parametrar, output och annan riskprofil än fri SQL. Därför finns ett eget flöde med tydlig granskning.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Inte Lakehouse">
          <p>Fabric Lakehouse SQL endpoint visar objekt i SQL Studio, men procedurer är inte tillgängliga i appen.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="switching" title="Växla mellan lägen">
        <DocsMiniSection title="Toppswitchen">
          <p>SQL Studio och Procedure Runner växlas från toppytan, inte från vänsterpanelen. Det gör att du kan byta läge även när connection-panelen är dold.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Vad återställs?">
          <p>När du kommer tillbaka till Procedure Runner återställs vald procedur, parameterfält, procedure-resultat, resultatsida, lokalt resultatfilter och procedure history för samma browserflik.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Separat historik">
          <p>Procedure Runner visar bara procedure history. SQL Studio visar bara SQL history. Historikerna blandas inte.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Inloggat konto">
          <p>Sparade profiler och audit visas per inloggad användare i live-versionen. Secrets och lösenord sparas inte i profilerna.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="support" title="Stöd per källa">
        <div className="docs-card-row">
          <div className="docs-card"><strong>Fabric SQL endpoint</strong><span>Procedurkatalog, parametrar och körning stöds.</span></div>
          <div className="docs-card"><strong>SQL Server</strong><span>Stöds när inloggningen har rätt behörigheter.</span></div>
          <div className="docs-card"><strong>Fabric Lakehouse</strong><span>Procedurer är avstängda/inte exponerade i appen.</span></div>
          <div className="docs-card"><strong>Behörighet</strong><span>Användaren eller service principal måste kunna läsa metadata och köra proceduren.</span></div>
        </div>
      </DocsSection>

      <DocsSection id="explorer" title="Procedure Explorer">
        <DocsMiniSection title="Ladda lista">
          <p>Klicka <strong>Load catalog</strong>. Om källan stödjer procedurer visas de i Procedure Explorer.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Välj procedur">
          <p>När du klickar på en procedur laddas parameterlistan och proceduren blir aktiv i toppytan.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Refresh params">
          <p>Använd när proceduren ändrats i databasen eller om parameterlistan ser gammal ut.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="parameters" title="Parametrar">
        <div className="docs-table">
          <div><strong>Tomt fält</strong><span>Parametern utelämnas. Databasens default kan användas om proceduren har ett.</span></div>
          <div><strong>NULL</strong><span>Skriv <code>NULL</code> för att skicka ett riktigt null-värde.</span></div>
          <div><strong>Output</strong><span>Output-parametrar fylls inte i före körning. De visas efteråt.</span></div>
          <div><strong>Validering</strong><span>Nummer, datum, boolean och GUID kontrolleras när datatypen är känd.</span></div>
          <div><strong>History restore</strong><span>Klicka på en tidigare procedure run för att välja proceduren igen och fylla tillbaka samma parametervärden.</span></div>
        </div>
      </DocsSection>

      <DocsSection id="execution" title="Körning">
        <DocsMiniSection title="Första klicket">
          <p><strong>Run procedure</strong> förbereder körningen och skapar en tidsbegränsad bekräftelse. Den är knuten till procedur, parametrar, anslutning och session.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Bekräfta">
          <p>Dialogen visar vad som ska köras. Om du ändrar parametrar efter detta måste du förbereda körningen igen.</p>
        </DocsMiniSection>
        <DocsMiniSection title="Efter körning">
          <p>Resultat, rows affected, output-parametrar och return value visas i Results där databasen returnerar dem.</p>
        </DocsMiniSection>
      </DocsSection>

      <DocsSection id="results" title="Resultat och audit">
        <ul className="docs-check-list">
          <li>Första recordset visas som tabell.</li>
          <li>Rows affected visar databasens rapporterade påverkan.</li>
          <li>Output-parametrar visas efter körning.</li>
          <li>Audit sparar prepare och execute med källa, databas, utfall och detalj.</li>
          <li>Procedure history sparar procedurnamn och parametervärden efter bekräftad körning.</li>
          <li>Export och copy fungerar på synliga rader i resultatpanelen.</li>
        </ul>
      </DocsSection>

      <DocsSection id="safety" title="Ansvar före körning">
        <ul className="docs-check-list">
          <li>Kontrollera att server och databas är rätt.</li>
          <li>Kontrollera procedurnamnet innan bekräftelse.</li>
          <li>Granska särskilt datumintervall, batch-id, kund-id och miljö.</li>
          <li>Kör bara procedurer du känner igen och har mandat att använda.</li>
          <li>I produktion bör procedurkörning rollstyras separat från läsning.</li>
        </ul>
      </DocsSection>

      <DocsSection id="errors" title="Vanliga fel">
        <div className="docs-table">
          <div><strong>Unavailable</strong><span>Källan stödjer inte procedurer i appen, vanligt för Lakehouse.</span></div>
          <div><strong>No procedures</strong><span>Databasen saknar procedurer eller användaren saknar metadata-rättighet.</span></div>
          <div><strong>Parameter expects</strong><span>Värdet matchar inte datatypen. Kontrollera formatet.</span></div>
          <div><strong>Expired</strong><span>Bekräftelsen tog för lång tid. Klicka Run procedure igen.</span></div>
        </div>
      </DocsSection>
    </DocsShell>
  );
}
