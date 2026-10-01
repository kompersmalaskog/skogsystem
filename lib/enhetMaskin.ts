// Enhet→maskin-koppling: vilken maskin ÄR den här datorn? Lagras per enhet i localStorage
// (en maskindator = en maskin). Behövs för hela förarflödet steg 2 — maskindatorn vet annars
// inte sin maskin (serial-GPS bär inget maskin_id), och hyttspår-loggningen skrev tidigare
// maskin_id=null för skotare. Används av page.tsx: GPS-källa-kortets maskinval + hyttspår-ctx +
// (steg 2b) maskindator-starten (tilldelnings-kollen + skriv skotare_/skordare_maskin_id).

export const ENHET_MASKIN_KEY = 'enhet_maskin_id';

/** Den maskin den här datorn är bunden till, eller null. Tål blockerad/saknad localStorage. */
export function hamtaEnhetMaskin(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(ENHET_MASKIN_KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

/** Bind datorn till en maskin (eller rensa med null). Tål blockerad localStorage. */
export function sattEnhetMaskin(maskinId: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (maskinId && maskinId.trim()) localStorage.setItem(ENHET_MASKIN_KEY, maskinId);
    else localStorage.removeItem(ENHET_MASKIN_KEY);
  } catch {
    /* ignore */
  }
}

/** Vilket maskin_id ska en hyttspår-rad märkas med?
 *  Enhetsvalet är AUKTORITATIVT (datorn vet sin maskin, oavsett roll). Saknas enhetsval faller vi
 *  tillbaka på det gamla beteendet: skördarens objekt-maskin, och null för skotare (som förut). */
export function hyttsparMaskinId(
  enhetMaskin: string | null | undefined,
  roll: 'skordare' | 'skotare',
  objektMaskinId: string | null | undefined,
): string | null {
  if (enhetMaskin && enhetMaskin.trim()) return enhetMaskin;
  if (roll === 'skordare') return objektMaskinId ?? null;
  return null;
}
