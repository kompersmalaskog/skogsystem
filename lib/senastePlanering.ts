// Planeringsvyns minne av senaste objekt, och objektet i adressen (/planering?objekt=<id>).
//
// MINNET ÄR PER ENHET (localStorage), knutet till den inloggade medarbetaren — inte per användare över enheter. Skälet: ett minne som följer
// användaren mellan enheter kräver en kolumn/tabell i databasen (migration + RLS) och det kördes inget mot produktion i det här arbetet. Två personer
// på samma enhet delar aldrig minne (nyckeln bär medarbetar-id); byter man enhet börjar man med listan, och en delad länk (?objekt=) hamnar rätt ändå.
//
// Maskindatorns minne (lib/senasteObjekt, enhet_senaste_objekt_v1) är en annan sak och rörs inte här.

export const SENASTE_PLANERING_KEY = 'planering_senaste_objekt_v1';
export const OBJEKT_PARAM = 'objekt';

export function skrivSenastePlanering(anvandarId: string, objektId: string, nu: number): string {
  return JSON.stringify({ anvandarId, objektId, ts: nu });
}

/** Läser den sparade strängen. Trasigt, fel form eller EN ANNAN användares minne → null. */
export function tolkaSenastePlanering(raw: string | null | undefined, anvandarId: string): string | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && typeof p.objektId === 'string' && p.objektId.trim() && p.anvandarId === anvandarId) return p.objektId;
  } catch { /* trasig JSON → inget minne */ }
  return null;
}

export function hamtaSenastePlanering(anvandarId: string | null | undefined): string | null {
  if (!anvandarId) return null;
  try {
    if (typeof localStorage === 'undefined') return null;
    return tolkaSenastePlanering(localStorage.getItem(SENASTE_PLANERING_KEY), anvandarId);
  } catch { return null; }
}

export function sattSenastePlanering(anvandarId: string | null | undefined, objektId: string | null | undefined): void {
  if (!anvandarId || !objektId) return;
  try {
    if (typeof localStorage === 'undefined') return;
    if (tolkaSenastePlanering(localStorage.getItem(SENASTE_PLANERING_KEY), anvandarId) === objektId) return;
    localStorage.setItem(SENASTE_PLANERING_KEY, skrivSenastePlanering(anvandarId, objektId, Date.now()));
  } catch { /* ignore */ }
}

/** Glöm minnet. Med `bara` rensas det endast om det är DET objektet (och den användaren). */
export function rensaSenastePlanering(anvandarId?: string | null, objektId?: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (anvandarId && objektId && tolkaSenastePlanering(localStorage.getItem(SENASTE_PLANERING_KEY), anvandarId) !== objektId) return;
    localStorage.removeItem(SENASTE_PLANERING_KEY);
  } catch { /* ignore */ }
}

/** ?objekt=<id> ur en query-sträng ("?objekt=abc&x=1"). Tomt, för långt eller med konstiga tecken → null. */
export function objektIdUrUrl(search: string | null | undefined): string | null {
  try {
    const v = new URLSearchParams(search ?? '').get(OBJEKT_PARAM);
    const id = (v ?? '').trim();
    return id && id.length <= 100 && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
  } catch { return null; }
}

/** Adressen med ?objekt= satt (eller borttaget med null). Övriga parametrar (t.ex. valjmaskin) behålls. */
export function planeringsUrl(pathname: string, search: string | null | undefined, objektId: string | null): string {
  const p = new URLSearchParams(search ?? '');
  if (objektId) p.set(OBJEKT_PARAM, objektId); else p.delete(OBJEKT_PARAM);
  const q = p.toString();
  return q ? `${pathname}?${q}` : pathname;
}
