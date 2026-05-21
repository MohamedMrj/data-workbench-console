import { DocsCardGrid, DocsSection, DocsShell } from '../doc-shell';

export const metadata = {
  title: 'Procedure Runner Documentation - Data Workbench Console',
  description: 'Användardokumentation för Procedure Runner i Data Workbench Console.'
};

const sections = [
  { id: 'overview', label: 'Översikt' },
  { id: 'source-support', label: 'Stöd per källa' },
  { id: 'connection', label: 'Anslutning' },
  { id: 'catalog', label: 'Procedurkatalog' },
  { id: 'parameters', label: 'Parametrar' },
  { id: 'execution', label: 'Körning' },
  { id: 'results', label: 'Resultat' },
  { id: 'audit', label: 'Audit' },
  { id: 'safety', label: 'Säkerhet' },
  { id: 'errors', label: 'Vanliga fel' }
];

export default function ProcedureRunnerDocsPage() {
  return (
    <DocsShell
      eyebrow="Användardokumentation"
      title="Procedure Runner"
      description="Procedure Runner är den dedikerade arbetsytan för att hitta, granska och köra stored procedures med parameterinspektion, tidsbegränsad bekräftelse och tydlig audit."
      sections={sections}
    >
      <DocsSection id="overview" title="Översikt">
        <p>
          Procedure Runner används när arbetet ska ske genom färdiga stored procedures i stället för fri SQL i editorn. Flödet är avsiktligt separat från SQL Studio för att göra exekvering, parametrar och audit tydligare.
        </p>
        <DocsCardGrid
          items={[
            { title: 'För nya användare', text: 'Anslut, ladda katalogen, välj en procedur, fyll i parametrar och kör först när du har granskat sammanfattningen.' },
            { title: 'För operatörer', text: 'Kontrollera alltid vald procedur, databas, parameterlista och eventuell output innan bekräftelse.' },
            { title: 'För utvecklare', text: 'Procedurmetadata läses från INFORMATION_SCHEMA eller sys-kataloger där källan stödjer det.' },
            { title: 'För administratörer', text: 'Säkerställ att endast rätt källor och roller får köra procedurer i hostad miljö.' }
          ]}
        />
      </DocsSection>

      <DocsSection id="source-support" title="Stöd per källa">
        <p>
          Alla anslutningstyper kan ladda objekt, men alla stödjer inte stored procedures i appen.
        </p>
        <ul>
          <li><strong>Fabric SQL endpoint:</strong> stödjer procedurkatalog, parameterläsning och procedurkörning.</li>
          <li><strong>Fabric Lakehouse SQL endpoint:</strong> procedurer är inte tillgängliga i den här appen. Lakehouse används via SQL endpoint för objekt/frågor i SQL Studio.</li>
          <li><strong>SQL Server:</strong> stödjer procedurkatalog, parameterläsning och procedurkörning när användaren har behörighet.</li>
        </ul>
        <div className="docs-callout">
          Om du väljer en källa som inte stödjer procedurer visas ett meddelande i Procedure Explorer i stället för en procedurlista.
        </div>
      </DocsSection>

      <DocsSection id="connection" title="Anslutning">
        <p>
          Procedure Runner använder samma anslutningspanel som SQL Studio. Välj rätt källtyp, autentisering, server, port och databas.
        </p>
        <ul>
          <li>Kör <strong>Test connection</strong> för att verifiera autentisering och nätverk.</li>
          <li>Kör <strong>Load catalog</strong> för att hämta både objekt- och procedurkatalog där det är möjligt.</li>
          <li>Sparade profiler kan användas för att fylla i återkommande anslutningar.</li>
          <li>Lösenord och secrets sparas inte i sparade profiler.</li>
        </ul>
        <h3>Service principal</h3>
        <p>
          Fabric-källor använder service principal från serverns miljövariabler: <code>AZURE_CLIENT_ID</code>, <code>AZURE_CLIENT_SECRET</code> och <code>AZURE_TENANT_ID</code>. Service principal måste ha åtkomst till aktuell Fabric workspace och SQL endpoint.
        </p>
      </DocsSection>

      <DocsSection id="catalog" title="Procedurkatalog">
        <p>
          Procedure Explorer visar procedurer som exponeras av den aktiva anslutningen. Listan laddas via <strong>Load catalog</strong>.
        </p>
        <ul>
          <li>Sökfältet filtrerar procedurlistan lokalt.</li>
          <li>När du väljer en procedur laddar appen parameterdefinitionerna.</li>
          <li>Vald procedur visas i toppytan och i procedure summary.</li>
          <li><strong>Refresh params</strong> laddar om parametrarna för vald procedur.</li>
        </ul>
      </DocsSection>

      <DocsSection id="parameters" title="Parametrar">
        <p>
          När en procedur väljs visas procedurens parametrar, datatyper och parameterläge.
        </p>
        <ul>
          <li><strong>IN-parametrar:</strong> fylls i av användaren innan körning.</li>
          <li><strong>OUT/INOUT-parametrar:</strong> registreras som output och visas efter körning om källan returnerar dem.</li>
          <li>Lämna ett fält tomt för att utelämna parametern.</li>
          <li>Skriv <code>NULL</code> för att skicka ett null-värde.</li>
          <li>Datum, nummer, boolean och GUID valideras mot datatyp där appen kan avgöra typen.</li>
        </ul>
        <div className="docs-callout">
          Om en procedur har defaultvärden i databasen kan tomma fält låta databasen använda dessa defaultvärden. Kontrollera procedurens implementation om beteendet är viktigt.
        </div>
      </DocsSection>

      <DocsSection id="execution" title="Körning">
        <p>
          Körning sker i två steg. Första klicket på <strong>Run procedure</strong> förbereder exekveringen och skapar en tidsbegränsad bekräftelse. Bekräftelsen är kopplad till sessionen, anslutningen, procedurnamnet och parametrarna.
        </p>
        <ol>
          <li>Välj procedur i Procedure Explorer.</li>
          <li>Granska procedurens namn och parametrar.</li>
          <li>Fyll i parameterfält.</li>
          <li>Klicka på <strong>Run procedure</strong>.</li>
          <li>Granska dialogen och bekräfta när allt stämmer.</li>
          <li>Resultat, rows affected, output values och return value visas i Results.</li>
        </ol>
        <p>
          Om parametrarna ändras efter förberedelsen måste du förbereda körningen igen. Det skyddar mot att en gammal bekräftelse används för nya indata.
        </p>
      </DocsSection>

      <DocsSection id="results" title="Resultat">
        <p>
          Resultatpanelen visar det första recordset som proceduren returnerar, kompletterat med metadata där det finns.
        </p>
        <ul>
          <li><strong>Rows:</strong> tabellresultat från proceduren.</li>
          <li><strong>Rows affected:</strong> antal rader som databasen rapporterar som påverkade.</li>
          <li><strong>Output:</strong> output-parametrar som returneras av proceduren.</li>
          <li><strong>Return value:</strong> procedurens return value om drivern returnerar den.</li>
          <li><strong>Export CSV / Copy rows:</strong> används på synliga resultat.</li>
          <li><strong>Filter results:</strong> filtrerar resultat lokalt i webbläsaren.</li>
        </ul>
        <div className="docs-callout">
          Resultat är begränsade av serverns radgräns. Om proceduren returnerar mycket data bör proceduren själv stödja parametrar för scope, datumintervall eller batchstorlek.
        </div>
      </DocsSection>

      <DocsSection id="audit" title="Audit">
        <p>
          Procedure Runner skriver auditposter för procedurkatalog, parameterladdning, förberedelse och exekvering.
        </p>
        <ul>
          <li><strong>procedure_prepare:</strong> skapas när en procedurkörning förbereds.</li>
          <li><strong>procedure_execute:</strong> skapas när en procedur faktiskt körs eller misslyckas.</li>
          <li>Auditposten innehåller källa, server, databas, händelse, utfall och en kompakt detaljtext.</li>
          <li>Audit kan laddas via <strong>Audit log</strong> om serverkonfigurationen tillåter det.</li>
        </ul>
      </DocsSection>

      <DocsSection id="safety" title="Säkerhet och ansvar">
        <p>
          Procedure Runner gör körningen tydlig, men procedurens innehåll styrs av databasen. En procedur kan läsa, skriva, radera eller starta andra processer beroende på hur den är byggd.
        </p>
        <ul>
          <li>Kör bara procedurer du känner igen och har mandat att använda.</li>
          <li>Kontrollera alltid att du är ansluten till rätt server och databas.</li>
          <li>Granska parametervärden, särskilt datumintervall, batch-id, kund-id, organisation eller miljö.</li>
          <li>Använd minsta möjliga behörighet för service principal eller SQL login.</li>
          <li>För produktionshosting bör procedurkörning kunna rollstyras separat från läsrättigheter.</li>
        </ul>
      </DocsSection>

      <DocsSection id="errors" title="Vanliga fel">
        <ul>
          <li><strong>Procedures unavailable for this source:</strong> källtypen stödjer inte procedurer i appen, vanligt för Fabric Lakehouse SQL endpoint.</li>
          <li><strong>No procedures loaded:</strong> databasen saknar procedurer, användaren saknar rättighet eller metadata exponeras inte av källan.</li>
          <li><strong>Procedure name is required:</strong> ingen procedur är vald.</li>
          <li><strong>Unknown procedure parameter:</strong> parameterlistan har ändrats eller klienten skickar ett namn som inte finns i metadata.</li>
          <li><strong>Parameter expects a numeric/date/boolean/GUID value:</strong> korrigera värdet enligt datatypen.</li>
          <li><strong>Procedure confirmation expired or not found:</strong> bekräftelsen tog för lång tid eller sessionen ändrades. Klicka <strong>Run procedure</strong> igen.</li>
          <li><strong>The procedure inputs changed or expired:</strong> parametrar eller anslutning ändrades efter förberedelsen. Förbered körningen igen.</li>
          <li><strong>Login failed:</strong> kontrollera server, databas, behörighet och service principal.</li>
        </ul>
      </DocsSection>
    </DocsShell>
  );
}
