// Enhetens senast valda objekt — maskindatorn startar där varje gång (förarflödet, startobjektet).
//
// Minnet gäller TILLS: föraren väljer ett annat objekt i listan, objektet avslutas, eller GPS visar att maskinen står
// inne i ett annat objekt (då frågar bekräftelsekortet som förut). Lagras per enhet i localStorage och är knutet till
// enhetens maskin — byter enheten maskin ärver den aldrig den förra maskinens objekt.
//
// Det här är bara minnet. Vad starten GÖR med det avgörs i lib/maskindatorStart (avgorMaskindatorStart).

export const SENASTE_OBJEKT_KEY = 'enhet_senaste_objekt_v1';

export interface SenasteObjekt { maskinId: string; objektId: string; ts: number }

/** Strängen som sparas. Fast fältordning → samma indata ger samma sträng. */
export function skrivSenasteObjekt(maskinId: string, objektId: string, nu: number): string {
  return JSON.stringify({ maskinId, objektId, ts: nu });
}

/** Läser den sparade strängen. Trasigt, fel form eller en ANNAN maskins minne → null. */
export function tolkaSenasteObjekt(raw: string | null | undefined, maskinId: string): string | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && typeof p.objektId === 'string' && p.objektId.trim() && p.maskinId === maskinId) return p.objektId;
  } catch { /* trasig JSON → inget minne */ }
  return null;
}

/** Minnet för den här maskinen, eller null. Tål blockerad/saknad localStorage. */
export function hamtaSenasteObjekt(maskinId: string | null | undefined): string | null {
  if (!maskinId) return null;
  try {
    if (typeof localStorage === 'undefined') return null;
    return tolkaSenasteObjekt(localStorage.getItem(SENASTE_OBJEKT_KEY), maskinId);
  } catch { return null; }
}

/** Kom ihåg objektet. Tål blockerad localStorage. Skriver ingenting om samma objekt redan ligger där (inga onödiga skrivningar). */
export function sattSenasteObjekt(maskinId: string | null | undefined, objektId: string | null | undefined): void {
  if (!maskinId || !objektId) return;
  try {
    if (typeof localStorage === 'undefined') return;
    if (tolkaSenasteObjekt(localStorage.getItem(SENASTE_OBJEKT_KEY), maskinId) === objektId) return;
    localStorage.setItem(SENASTE_OBJEKT_KEY, skrivSenasteObjekt(maskinId, objektId, Date.now()));
  } catch { /* ignore */ }
}

/** Glöm minnet — objektet avslutades eller finns inte längre. Med `bara` rensas det endast om det är DET objektet. */
export function rensaSenasteObjekt(bara?: { maskinId: string | null | undefined; objektId: string }): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (bara) {
      if (!bara.maskinId || tolkaSenasteObjekt(localStorage.getItem(SENASTE_OBJEKT_KEY), bara.maskinId) !== bara.objektId) return;
    }
    localStorage.removeItem(SENASTE_OBJEKT_KEY);
  } catch { /* ignore */ }
}
