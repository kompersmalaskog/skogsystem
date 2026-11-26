// Körvyns skyddslager — och förarens rätt att släcka dem (Martin 2026-11-23, Stefan i Giant på ett objekt som är helt vattenskydd).
//
// Förut tvingades de sju lagren synliga i körvyn oavsett förarens val (tre ställen i app/planering/page.tsx), men lagerknappen
// visades ändå — det blå täckte hela kartan och knappen gjorde ingenting. Nu:
//   1. Första gången en maskin kommer till ett objekt är lagren TÄNDA.
//   2. Förarens knapp fungerar. Släcker han ett lager på ett objekt förblir det släckt där, också efter omstart och nästa dag,
//      tills han tänder det igen. Valet sparas per maskin + objekt + lager, lokalt i maskinen (localStorage). Ingen databas.
//   3. Ett annat objekt startar alltid med lagren tända (valet hänger på objektet).
//   4. Varningarna i panelen och närhetsvarningarna (vattenskydd, fornlämning …) läser aldrig det här — de gäller även när
//      lagret är släckt. Det här styr bara om WMS-lagret RITAS.
//   5. Planeringsvyn rörs inte: den använder `overlays` som förut. Det här gäller bara körvyn.
//
// Fornlämningar står MEDVETET inte i listan (RAÄ:s lämnings-WMS är ~1,7 M punkter över hela landet → blanket brus): de har aldrig
// tvingats, så deras tänd/släck fungerar redan i körvyn via den vanliga lagerväxeln.

/** De sju kurerade skyddslagen (overlayId = wms-layer-<id> utan prefix). */
export const KORVY_SKYDDSLAGER: ReadonlySet<string> = new Set([
  'nyckelbiotoper', 'biotopskydd', 'vattenskydd', 'naturreservat', 'natura2000', 'sumpskog', 'kraftledningar',
]);

export const SKYDDSLAGER_NYCKEL = 'korvy_skyddslager_v1';

/** localStorage-nyckeln för en maskin + ett objekt. Okänd maskin (planerare utan maskinval) delar nyckeln 'ingen'. */
export function skyddslagerNyckel(maskinId: string | null | undefined, objektId: string | null | undefined): string | null {
  if (!objektId) return null;
  return `${SKYDDSLAGER_NYCKEL}:${maskinId || 'ingen'}:${objektId}`;
}

/** Tolka det sparade värdet: en lista med lager-id. Trasigt, fel form eller okända id:n ger bara de giltiga (aldrig ett kast). */
export function tolkaSlackta(raw: string | null | undefined): Set<string> {
  const ut = new Set<string>();
  if (!raw) return ut;
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) for (const id of p) if (typeof id === 'string' && KORVY_SKYDDSLAGER.has(id)) ut.add(id);
  } catch { /* trasig JSON → inget släckt (hellre tänt än tyst släckt) */ }
  return ut;
}

/** De lager föraren släckt på det här objektet. Tål blockerad eller saknad localStorage (då är allt tänt). */
export function hamtaSlackta(maskinId: string | null | undefined, objektId: string | null | undefined): Set<string> {
  const nyckel = skyddslagerNyckel(maskinId, objektId);
  if (!nyckel) return new Set();
  try {
    if (typeof localStorage === 'undefined') return new Set();
    return tolkaSlackta(localStorage.getItem(nyckel));
  } catch { return new Set(); }
}

/** Spara hela mängden. Tom mängd tar bort nyckeln (inga kvarglömda rader för objekt där allt är tänt). */
export function sparaSlackta(maskinId: string | null | undefined, objektId: string | null | undefined, slackta: ReadonlySet<string>): void {
  const nyckel = skyddslagerNyckel(maskinId, objektId);
  if (!nyckel) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const giltiga = Array.from(slackta).filter((id) => KORVY_SKYDDSLAGER.has(id)).sort();
    if (giltiga.length === 0) localStorage.removeItem(nyckel);
    else localStorage.setItem(nyckel, JSON.stringify(giltiga));
  } catch { /* blockerad localStorage: valet gäller medan sidan är öppen */ }
}

/** Mängden efter ett tryck på lagerknappen. Rör bara skyddslager; allt annat ger samma mängd tillbaka. */
export function vaxlaSlackt(slackta: ReadonlySet<string>, id: string): Set<string> {
  const ny = new Set(slackta);
  if (!KORVY_SKYDDSLAGER.has(id)) return ny;
  if (ny.has(id)) ny.delete(id); else ny.add(id);
  return ny;
}

/** Ska skyddslagret ritas i körvyn? Tänt om inte föraren släckt det (och bara skyddslagen har den här regeln). */
export function skyddslagerSynligt(id: string, slackta: ReadonlySet<string>): boolean {
  return !slackta.has(id);
}

/** Minsta kartan vi behöver (MapLibre-kartan uppfyller den). */
type KartaMedLager = { getLayer(id: string): unknown; setLayoutProperty(id: string, namn: string, varde: string): unknown };

/** Sätt synligheten på de sju lagren: tänt om inte föraren släckt det. EN funktion för lagereffekten och defer-effekten i körvyn. */
export function tillampaSkyddslager(karta: KartaMedLager, slackta: ReadonlySet<string>): void {
  for (const id of Array.from(KORVY_SKYDDSLAGER)) {
    try { if (karta.getLayer('wms-layer-' + id)) karta.setLayoutProperty('wms-layer-' + id, 'visibility', skyddslagerSynligt(id, slackta) ? 'visible' : 'none'); } catch { /* lagret finns inte än */ }
  }
}
