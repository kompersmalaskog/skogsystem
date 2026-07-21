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
// "GPS fungerar nu i skogen", inte commit-sprak. Generera ALDRIG från commit-meddelanden.

export interface ChangelogEntry {
  version: string    // t.ex. "0.9.4"
  date: string       // svensk läsbar, t.ex. "18 juli 2026"
  changes: string[]  // korta, icke-tekniska rader
}

// Senaste ÖVERST.
export const CHANGELOG: ChangelogEntry[] = [
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
