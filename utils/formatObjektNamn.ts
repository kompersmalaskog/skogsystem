/**
 * Rensar objektnamn från filnamns-timestamps och formaterar
 * fastighetsbeteckningar enligt svensk konvention.
 *
 * Exempel:
 *   "Kättorp 2 2 RP 25-090426-072430 20260413 154110" → "Kättorp 2:2 RP 25"
 *   "Hössjömåla Gallring 25"                           → "Hössjömåla Gallring 25"
 *   "260414081755"                                      → "260414081755" (rörs ej)
 */
export function formatObjektNamn(namn: string | null | undefined): string {
  if (!namn) return '';
  let s = String(namn);

  // 1. Plocka bort timestamps i ordning från längsta mönster till kortaste
  s = s.replace(/\b\d{8}[\s-]\d{6}\b/g, '');   // YYYYMMDD HHMMSS / YYYYMMDD-HHMMSS
  s = s.replace(/\b\d{6}-\d{6}\b/g, '');       // YYMMDD-HHMMSS
  s = s.replace(/[\s-]+\d{6,}$/g, '');         // långa trailing sifferföljder (6+)

  // 2. Trimma skräpmellanslag/bindestreck i kanter
  s = s.replace(/[\s-]+$/g, '').replace(/^[\s-]+/g, '');

  // 3. Normalisera mellanrum
  s = s.replace(/\s+/g, ' ').trim();

  // 4. Fastighetsbeteckning: första "N N" med korta tal → "N:N"
  s = s.replace(/\b(\d{1,3}) (\d{1,3})\b/, '$1:$2');

  // Om rensningen lämnade tomt, returnera ursprunget (t.ex. "260414081755")
  return s || String(namn);
}
