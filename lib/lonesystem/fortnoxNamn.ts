// Fortnox-namnen för de löneartskoder appen använder (kod → namn i Fortnox). Ett FÖRSLAG i formuläret Lön → Lönearter: skriver du
// en känd kod fylls namnet i, och du kan ändra det. Tabellen avgör aldrig vilken löneart som får vilken kod (det gör
// lonesystem_artikelmappning) och exporten och beräkningen läser den inte (vakt: fortnoxNamn.test.ts).
//
// Källa: 147, 1461 och 1462 är namnen Martin läst i Fortnox 2026-10-17. De övriga sju är namnen som står i produktionens
// lonesystem_artikelmappning (beskrivning) — inte läst direkt ur Fortnox, kontrollera mot Fortnox vid tillfälle.
// En ny kod läggs till här när en ny löneart tas i bruk.
export const FORTNOX_LONEARTSNAMN: Readonly<Record<string, string>> = {
  "11": "Timlön",
  "136": "Vältlappar mm",
  "147": "OB tillägg natt",
  "821": "Körersättning skattefri",
  "1354": "Premielön skotare",
  "1355": "Premielön skördare",
  "1435": "Övertid skördare",
  "1436": "Övertid skotare",
  "1461": "Helglön, timmar",
  "1462": "Helglön, timmar 2",
};

/** Namnet i Fortnox för en kod, eller "" för en kod vi inte känner (aldrig en gissning). */
export function fortnoxNamnForKod(kod: string | null | undefined): string {
  const k = String(kod ?? "").trim();
  return Object.prototype.hasOwnProperty.call(FORTNOX_LONEARTSNAMN, k) ? FORTNOX_LONEARTSNAMN[k] : "";
}
