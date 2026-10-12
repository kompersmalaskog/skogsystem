// Korta, UNIKA etiketter för maskinens sortimentsnamn i listan "Sågbar dimension".
//
// Maskinen namnger sortiment som "Timmer: Vislanda Tall_V3", "Timmer: Vislanda_195_1-2_V3", "Talltimmer: Vislanda kort V3",
// "Kubb: Alvesta275_V3" och "Kubb: Alvesta305_V3". Förut kortades de till "Grupp Ort" ("Timmer Vislanda", "Kubb Alvesta"), och då
// fick två olika sortiment SAMMA rad. Nu tas det som skiljer dem med: det som står efter orten, utan versionsmärket (_V3).
//
// Bara text — ingen volym och inget gränsvärde räknas här.

export type SortimentNamn = { namn: string; grupp: string };

const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Delar maskinens namn i grupp-prefix, ort och det som skiljer sortimentet från andra på samma ort. */
function delar(so: SortimentNamn) {
  const [fore, efter] = so.namn.includes(':') ? so.namn.split(/:\s*/, 2) : [so.grupp, so.namn];
  const prefix = stor(fore.replace(/\s+/g, '').toLowerCase());
  const ort = (efter.match(/^[A-Za-zÅÄÖåäö]+/) ?? [efter.split('_')[0]])[0];
  const rest = efter.slice(ort.length)
    .replace(/[_ ]?V\d+\s*$/i, '')          // versionsmärket sist ("_V3", " V3") är inte en skillnad man ska läsa
    .replace(/_/g, ' ')
    .trim();
  return { prefix, ort, rest };
}

/** Etiketterna för en lista sortiment, i samma ordning. Garanterat unika: två sortiment får aldrig samma rad. */
export function sortimentEtiketter(lista: SortimentNamn[]): string[] {
  const d = lista.map(delar);
  const ut = d.map(x => [x.prefix, x.ort, x.rest].filter(Boolean).join(' '));
  // Fortfarande lika (samma namn efter städningen): lägg till ordningsnummer så raderna går att skilja åt.
  const sett = new Map<string, number>();
  const antal = new Map<string, number>();
  for (const e of ut) antal.set(e, (antal.get(e) ?? 0) + 1);
  return ut.map(e => {
    if ((antal.get(e) ?? 0) <= 1) return e;
    const n = (sett.get(e) ?? 0) + 1;
    sett.set(e, n);
    return `${e} (${n})`;
  });
}

/** En etikett — för skärmar som visar ett enda sortiment. Samma regel som listan, så raden och dess skärm heter likadant. */
export function sortimentEtikett(so: SortimentNamn, alla: SortimentNamn[]): string {
  const i = alla.findIndex(x => x.namn === so.namn);
  return sortimentEtiketter(alla)[i < 0 ? 0 : i] ?? sortimentEtiketter([so])[0];
}
