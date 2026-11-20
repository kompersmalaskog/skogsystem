// ── Ändringslogg + versionsnummer (EN källa) ───────────────────────
// Versionen sätts MANUELLT här. Den ÖVERSTA posten är den aktuella versionen och visas
// både i TopBar (version-taggen) och i vyn "Om appen" (/om). Ingen automatik, ett ställe.
//
// Versionspolicy (Martins beslut):
//   • Fram till skarp start:            0.9.x
//   • 1 augusti 2026 (skarp start):     1.0.0
//   • Därefter:  +0.0.1 vid buggfix,  +0.1.0 vid ny funktion
//
// För att släppa en ny version: lägg en NY post ÖVERST med höjt versionsnummer, dagens
// datum och korta rader om vad som ändrats. Skriv för FÖRAREN, inte teknikern — t.ex.
// "GPS fungerar nu i skogen", inte commit-sprak.
//
// Kopplat till deploy-gaten (2026-09-29): `node scripts/release-material.mjs` drar PR-titlar +
// brödtext för det som ligger i main men inte i production, som UNDERLAG. Regeln: skriv ett
// UTKAST ur PR-titlarna, skriv om det för föraren, GODKÄNN MANUELLT. Publicera aldrig
// commit-språk oredigerat — den mänskliga grinden är hela poängen.

export interface ChangelogEntry {
  version: string    // t.ex. "0.9.4"
  date: string       // svensk läsbar, t.ex. "18 juli 2026"
  changes: string[]  // korta, icke-tekniska rader
}

// Senaste ÖVERST.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '29 september 2026',
    changes: [
      'Ytkortet: skriv en bildtext under varje foto och ljud, som alla ser.',
      'Rita om ett eget område genom att dra i hörnen — lägg till, flytta eller ta bort ett hörn.',
      'Raderar du ett eget område försvinner nu även dess foton och anteckningar.',
      'Band-uppgifterna på trakten sparas korrekt.',
      'Inloggningen fastnar inte längre på "Laddar".',
      'Operatörer kopplas automatiskt till rätt konto, och hemadresser geokodas för restidsberäkning.',
    ],
  },
  {
    version: '0.9.5',
    date: '21 juli 2026',
    changes: [
      'Ny vy: Om appen med versionshistorik.',
    ],
  },
  {
    version: '0.9.4',
    date: '18 juli 2026',
    changes: [
      'GPS fungerar nu i körvyn ute i skogen.',
      'Fornlämningar kontrolleras igen i traktanalysen.',
      'Skyddad natur öppnas direkt på rätt område med föreskrifter.',
    ],
  },
  {
    version: '0.9.3',
    date: '17 juli 2026',
    changes: [
      'Ny räknare för miljöhänsyn — naturvårdsträd och högstubbar mot målet.',
      'Brandrisken visar aldrig en gissad siffra längre.',
    ],
  },
]

// Aktuell version = översta posten. Faller tillbaka på '0.0.0' om listan skulle vara tom.
export const CURRENT_VERSION: string = CHANGELOG[0]?.version ?? '0.0.0'
