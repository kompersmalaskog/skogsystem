// Gemensamma bitar för autospar som bara skriver det som ändrats (avlägg, brand, TMA i planeringsvyn).
//
// Mönstret (samma som objektinfo-autosparet, #681): laddningen minns vad "oförändrat" betyder som kolumnvärden (BASLINJE).
// Sparningen jämför formuläret mot baslinjen och skickar bara skillnaden. Öppna utan att röra något = tom skillnad = ingen
// skrivning. En misslyckad läsning ger ingen baslinje = ingen skrivning (och en synlig varning).
//
// Rena funktioner → enhetstestbara utan karta eller databas.
//
// Delas med lib/objektInfoSpar.ts (objektinfo-autosparet, #681), som återexporterar djupLika och kolumnerSomInteLandade härifrån.

/** Kolumn → värde. */
export type Kolumner = Record<string, unknown>;

/** Djup jämförelse: nyckelordning spelar ingen roll (jsonb ordnar om nycklar), `undefined` räknas som saknad nyckel. */
export function djupLika(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => djupLika(x, b[i]));
  const ka = Object.keys(a as object).filter((k) => (a as any)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as any)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && djupLika((a as any)[k], (b as any)[k]));
}

/** Kolumner där `nu` skiljer sig från baslinjen `bas`. */
export function andradeKolumner(bas: Kolumner, nu: Kolumner): Kolumner {
  const ut: Kolumner = {};
  for (const [kol, v] of Object.entries(nu)) if (!djupLika(bas[kol], v)) ut[kol] = v;
  return ut;
}

/** Efter en sparning: vilka av de skickade kolumnerna kom INTE tillbaka med samma värde? Radräkning bevisar bara att en rad
 *  rördes — inte att värdet landade. Tom lista = allt landade. */
export function kolumnerSomInteLandade(skickat: Kolumner, tillbaka: Record<string, unknown> | null | undefined): string[] {
  if (!tillbaka) return Object.keys(skickat);
  return Object.keys(skickat).filter((kol) => !djupLika(skickat[kol], tillbaka[kol]));
}

/** Identifierar de delar (avlägg/brand/TMA) som inte kunde läsas, för den synliga varningen. */
export type AutosparDel = 'avlagg' | 'brand' | 'tma';
const DELNAMN: Record<AutosparDel, string> = { avlagg: 'avlägg', brand: 'brand', tma: 'TMA' };

/** "avlägg", "avlägg och brand", "avlägg, brand och TMA" — i fast ordning. Tom lista → tom sträng. */
export function delarSomText(delar: Partial<Record<AutosparDel, boolean>>): string {
  const namn = (['avlagg', 'brand', 'tma'] as AutosparDel[]).filter((d) => delar[d]).map((d) => DELNAMN[d]);
  if (namn.length <= 1) return namn.join('');
  return namn.slice(0, -1).join(', ') + ' och ' + namn[namn.length - 1];
}
