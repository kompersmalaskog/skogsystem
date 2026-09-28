// Paletten för fakturaunderlaget, ur Martins skiss.
//
// ⚠️ AVVIKER FRÅN lib/design/tokens.ts, OCH DET ÄR ETT MEDVETET VAL SOM
// BEHÖVER ETT BESLUT.
//
// Tokens har en neutral iOS-mörk (#000 / #1c1c1e / #8e8e93 / #30d158).
// Skissen är en grön-tonad mörk (#0B0D0C / #171A18 / #8F9994 / #6FBF9B) med
// IBM Plex i stället för Geist, och den är godkänd för den här vyn.
//
// Två vägar framåt, och någon måste väljas innan fler vyer byggs så här:
//   a) tokens får den här paletten och resten av appen följer efter, eller
//   b) den här vyn konverteras till tokens och skissen tolkas om.
// Tills dess bor avvikelsen på ETT ställe — här — i stället för att spridas
// som lösa hexvärden genom komponenten. Det är skälet till att filen finns.

export const F = {
  bg:        '#0B0D0C',
  kort:      '#171A18',
  navbg:     '#101312',
  linje:     '#242926',
  text:      '#F2F4F2',
  dampad:    '#8F9994',
  svagast:   '#6E7874',
  accent:    '#6FBF9B',
  accentMork:'#08110D',
  varning:   '#E0A23C',
} as const;

export const SANS = "'IBM Plex Sans', -apple-system, 'Segoe UI', system-ui, sans-serif";
export const MONO = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";

/** Siffror ska stå rakt i kolumn — annars hoppar de mellan raderna. */
export const TAL = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' } as const;

export const nr = (n: number, dec = 0) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const kr2 = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
