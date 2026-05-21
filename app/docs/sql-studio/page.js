import { DocsCardGrid, DocsSection, DocsShell } from '../doc-shell';

export const metadata = {
  title: 'SQL Studio Documentation - Data Workbench Console',
  description: 'Användardokumentation för SQL Studio i Data Workbench Console.'
};

const sections = [
  { id: 'overview', label: 'Översikt' },
  { id: 'connection', label: 'Anslutning' },
  { id: 'profiles', label: 'Sparade profiler' },
  { id: 'explorer', label: 'Object Explorer' },
  { id: 'builder', label: 'Query Builder' },
  { id: 'editor', label: 'SQL Editor' },
  { id: 'advanced', label: 'Advanced Operations' },
  { id: 'results', label: 'Resultat' },
  { id: 'audit-history', label: 'Audit och historik' },
  { id: 'safety', label: 'Säkerhet' },
  { id: 'errors', label: 'Vanliga fel' }
];

export default function SqlStudioDocsPage() {
  return (
    <DocsShell
      eyebrow="Användardokumentation"
      title="SQL Studio"
      description="SQL Studio är arbetsytan för att ansluta till Fabric SQL endpoints, Fabric Lakehouse SQL endpoints och SQL Server, läsa metadata, bygga SQL, köra frågor och granska resultat med tydliga skydd för ändrande kommandon."
      sections={sections}
    >
      <DocsSection id="overview" title="Översikt">
        <p>
          SQL Studio är byggt för operativt arbete där användaren behöver se objekt, skapa SQL från metadata och köra kontrollerade frågor. Verktyget är inte en fri SQL-klient utan har inbyggda skydd, auditlogg och separata flöden för läsningar och ändringar.
        </p>
        <DocsCardGrid
          items={[
            { title: 'För nya användare', text: 'Börja med anslutningspanelen till vänster, testa anslutningen och ladda katalogen innan du skriver SQL.' },
            { title: 'För analytiker', text: 'Använd Object Explorer, kolumnval, filter, sortering och SQL helper för att snabbt skapa SELECT-frågor.' },
            { title: 'För operatörer', text: 'Använd preview-flödet för INSERT, UPDATE och DELETE. Verifiera alltid scope och rows affected innan bekräftelse.' },
            { title: 'För administratörer', text: 'Granska auditlogg, sparade profiler, behörigheter och produktionsinställningar innan verktyget används brett.' }
          ]}
        />
      </DocsSection>

      <DocsSection id="connection" title="Anslutning">
        <p>
          Anslutningen styr vilken datakälla SQL Studio arbetar mot. Välj först källtyp och autentisering, fyll sedan i server, port och databas.
        </p>
        <ul>
          <li><strong>Fabric SQL endpoint:</strong> används för Fabric Warehouse/SQL endpoint och stödjer objekt samt procedurer i appen.</li>
          <li><strong>Fabric Lakehouse SQL endpoint:</strong> används för Lakehouse via SQL endpoint. Stödjer objekt och SELECT-liknande frågor, men procedurer är avstängda i appen.</li>
          <li><strong>SQL Server:</strong> stödjer SQL login och service principal beroende på miljö.</li>
        </ul>
        <h3>Fält</h3>
        <ul>
          <li><strong>Source type:</strong> vilken typ av källa du ansluter till.</li>
          <li><strong>Authentication:</strong> service principal för Fabric, SQL login eller service principal för SQL Server.</li>
          <li><strong>Server:</strong> endast servernamnet, till exempel <code>workspace.datawarehouse.fabric.microsoft.com</code>. Klistra inte in flera hostnames eller hela connection strings.</li>
          <li><strong>Port:</strong> normalt <code>1433</code>.</li>
          <li><strong>Database:</strong> databasen eller SQL endpoint-databasen du vill arbeta mot.</li>
          <li><strong>Trust SQL Server certificate:</strong> visas för SQL Server. Används normalt inte för Fabric.</li>
        </ul>
        <div className="docs-callout">
          Kör alltid <strong>Test connection</strong> innan <strong>Load catalog</strong>. Testet verifierar server, databas och autentisering utan att ladda hela objektlistan.
        </div>
      </DocsSection>

      <DocsSection id="profiles" title="Sparade profiler">
        <p>
          Sparade profiler gör att återkommande anslutningar kan laddas snabbare. Profilen sparar anslutningsdetaljer som källtyp, server, databas, port, användarnamn och certifikatval.
        </p>
        <ul>
          <li>Lösenord och service-principal secrets sparas inte i profilen.</li>
          <li>Att ladda en profil öppnar inte automatiskt en databasanslutning och kör ingen SQL.</li>
          <li>Använd <strong>Save profile</strong> efter att anslutningsfälten är korrekta.</li>
          <li>Ta bort gamla profiler om servernamn eller databaser inte längre ska användas.</li>
        </ul>
      </DocsSection>

      <DocsSection id="explorer" title="Object Explorer">
        <p>
          Object Explorer visar tabeller och vyer från den aktiva anslutningen. Listan laddas via <strong>Load catalog</strong>.
        </p>
        <ul>
          <li>Sökfältet filtrerar objektlistan lokalt.</li>
          <li>När du väljer ett objekt laddas kolumnerna för objektet.</li>
          <li>Det valda objektet används av Query Builder, SQL helper och avancerade mallar.</li>
          <li>Om listan är tom kan källan sakna åtkomst, ha fel databasnamn eller inte exponera tabeller/vyer via SQL endpointen.</li>
        </ul>
      </DocsSection>

      <DocsSection id="builder" title="Query Builder">
        <p>
          Query Builder skapar SQL utifrån valt objekt och valda kolumner. SQL-texten är alltid redigerbar efter generering.
        </p>
        <h3>Operationer</h3>
        <ul>
          <li><strong>Select:</strong> skapar en läsfråga med valda kolumner, filter, sortering och TOP-gräns.</li>
          <li><strong>Insert:</strong> skapar en INSERT-mall för valt objekt.</li>
          <li><strong>Update:</strong> skapar en UPDATE-mall. Lägg alltid till säkra filter.</li>
          <li><strong>Delete:</strong> skapar en DELETE-mall. Använd endast med tydliga filter och granska preview.</li>
        </ul>
        <h3>Kolumner, filter och sortering</h3>
        <ul>
          <li><strong>All</strong> väljer alla kolumner och <strong>Clear</strong> nollställer kolumnvalet.</li>
          <li><strong>+ Add filter</strong> lägger till filterrader som används när SQL genereras.</li>
          <li><strong>Sort column</strong>, <strong>Direction</strong>, <strong>Top rows</strong> och <strong>Distinct</strong> påverkar SELECT-frågor.</li>
          <li><strong>Preview rows</strong> och <strong>Count rows</strong> är snabba kontroller mot valt objekt.</li>
        </ul>
      </DocsSection>

      <DocsSection id="editor" title="SQL Editor">
        <p>
          SQL Editor är den slutliga ytan där frågan körs. Du kan använda genererad SQL, klistra in egen SQL eller kombinera båda.
        </p>
        <ul>
          <li><strong>Generate SQL:</strong> skriver aktuell Query Builder-fråga till editorn.</li>
          <li><strong>Run query:</strong> kör frågan eller startar preview-/bekräftelseflöde om frågan ändrar data.</li>
          <li><strong>Format:</strong> formaterar SQL-texten för läsbarhet.</li>
          <li><strong>Copy:</strong> kopierar SQL-texten.</li>
          <li><strong>Clear:</strong> tömmer editorn.</li>
          <li><strong>A-/A+:</strong> ändrar textstorlek i editorn.</li>
        </ul>
        <p>
          Kortkommandon: <span className="docs-kbd">Ctrl</span> + <span className="docs-kbd">Enter</span> kör frågan och <span className="docs-kbd">Ctrl</span> + <span className="docs-kbd">Shift</span> + <span className="docs-kbd">F</span> formaterar SQL.
        </p>
        <h3>SQL helper</h3>
        <p>
          SQL helper infogar vanliga uttryck som <code>CONCAT</code>, <code>REPLACE</code>, <code>TRIM</code>, <code>CAST</code>, <code>TRY_CONVERT</code>, <code>COALESCE</code>, <code>NULLIF</code>, <code>CASE</code>, datumfunktioner och SHA2-nyckelmallar.
        </p>
      </DocsSection>

      <DocsSection id="advanced" title="Advanced Operations">
        <p>
          Advanced Operations ger mallar och analyser för mer erfarna användare. De bygger på valt objekt och en extra käll-/målkontext.
        </p>
        <ul>
          <li><strong>Insert SELECT:</strong> skapar mall för att infoga från ett annat objekt.</li>
          <li><strong>Update JOIN:</strong> skapar mall för uppdatering med join mellan mål och källa.</li>
          <li><strong>MERGE preview:</strong> skapar en MERGE-mall för granskning. Exekvering av MERGE är blockerad i appen.</li>
          <li><strong>Sample profile:</strong> läser ett urval och visar kolumnprofil, null-förekomst och enklare kvalitetsmått.</li>
          <li><strong>Dependency view:</strong> försöker visa beroenden via SQL metadata där källan stödjer det.</li>
        </ul>
      </DocsSection>

      <DocsSection id="results" title="Resultat">
        <p>
          Resultatpanelen visar rows, metadata, profilkort och auditresultat beroende på vad som kördes.
        </p>
        <ul>
          <li><strong>Filter results:</strong> filtrerar synliga resultat lokalt i webbläsaren.</li>
          <li><strong>Copy rows:</strong> kopierar resultat.</li>
          <li><strong>Export CSV:</strong> exporterar synliga resultat till CSV.</li>
          <li><strong>Prev/Next:</strong> bläddrar mellan resultatsidor i klienten.</li>
          <li><strong>Columns left/right:</strong> hjälper vid breda tabeller.</li>
          <li><strong>A-/A+:</strong> ändrar textstorlek i resultatpanelen.</li>
        </ul>
        <div className="docs-callout">
          Servern har en radgräns för svar. Om resultatet är trunkerat, begränsa frågan med filter, TOP eller mer specifika kolumner.
        </div>
      </DocsSection>

      <DocsSection id="audit-history" title="Audit och historik">
        <p>
          Verktyget skriver auditposter för viktiga händelser som anslutningstest, katalogladdning, frågor, write preview, write execution, procedurhändelser och sparade profiler.
        </p>
        <ul>
          <li><strong>Audit log:</strong> laddar senaste auditposter till resultatpanelen om auditåtkomst är tillåten.</li>
          <li><strong>Recent SQL:</strong> visar senaste SQL-frågor lokalt i webbläsaren.</li>
          <li><strong>Search history:</strong> filtrerar frågehistoriken.</li>
          <li><strong>Clear:</strong> rensar lokal SQL-historik.</li>
          <li><strong>Themes:</strong> byter tema och sparas lokalt i webbläsaren.</li>
        </ul>
      </DocsSection>

      <DocsSection id="safety" title="Säkerhet och bekräftelser">
        <p>
          SQL Studio skiljer på läsningar och ändrande kommandon. SELECT-liknande frågor körs direkt. INSERT, UPDATE och DELETE går genom preview och kräver knappbekräftelse innan exekvering.
        </p>
        <ul>
          <li>Write preview körs i transaktion och rullas tillbaka för att visa ungefärlig påverkan.</li>
          <li>Bekräftelsetoken är tidsbegränsad och knuten till session, anslutning och exakt query.</li>
          <li>Om SQL-texten ändras efter preview måste du förhandsgranska igen.</li>
          <li>Farliga kommandon kan blockeras eller kräva striktare hantering beroende på klassificering.</li>
          <li>Stored procedures ska köras från Procedure Runner, inte som fri <code>EXEC</code> i SQL Editor.</li>
        </ul>
      </DocsSection>

      <DocsSection id="errors" title="Vanliga fel">
        <ul>
          <li><strong>Hostname/IP does not match certificate:</strong> serverfältet innehåller ofta fel hostname, flera hostnames ihopklistrade eller en hel connection string.</li>
          <li><strong>Cannot open server requested by the login:</strong> fel endpoint, fel databas eller service principal saknar åtkomst.</li>
          <li><strong>Missing Azure environment variable:</strong> servern saknar <code>AZURE_CLIENT_ID</code>, <code>AZURE_CLIENT_SECRET</code> eller <code>AZURE_TENANT_ID</code>.</li>
          <li><strong>No objects loaded:</strong> kontrollera rätt databas, behörighet och att källan exponerar objekt via SQL metadata.</li>
          <li><strong>Write confirmation expired:</strong> kör preview igen och bekräfta inom tidsgränsen.</li>
          <li><strong>Audit endpoint not available:</strong> auditåtkomst är begränsad av serverkonfigurationen.</li>
        </ul>
      </DocsSection>
    </DocsShell>
  );
}
