// Prioritetsordning för tryck på planeringskartan. EXAKT en sak öppnas per tryck.
//
// Bakgrund: kartan har många överlappande klick-lager (produktionshögar, markörer,
// linjer, Vidas traktdelar, egna områdens gräns-fyllning, ytnummer). Tidigare fyrade
// varje lagers egen click-handler oberoende → t.ex. tryck på en hög inne i ett eget
// område öppnade FÖRST traktinfo-kortet (grans-fyllningen fångade klicket) och sedan
// högens popup. Regeln nedan avgör vilken KATEGORI som vinner givet vilka lager som
// ligger vid tryckpunkten, så varje handler kan avstå när den inte är vinnaren.
//
// Ordning (högst först):
//   1. larm    — larmkoordinaten (akut, får aldrig döljas)
//   2. kommentar — en pratbubbla på en linje, yta eller traktdel (Martin 2026-11-26: varje bubbla ska öppna sin kommentar med ETT tryck). Bubblan står ofta utanför det
//                den hör till (ovanför ytans namn), så den har en egen träffyta och slår allt under sig: ett tryck på bubblan öppnar bubblans markering, aldrig traktdelen under.
//   3. symbol  — det någon SATT UT: symboler, pilar, fällträd, kör upp-pilar. Före ytnumret (2026-11-11): numrets 44 px träffyta
//                slog annars en symbol som stod nära siffran — man tryckte på högstubben och fick "Område 2".
//   4. yta-nr  — ytans nummer: öppnar ALLTID ytkortet, även när högar täcker ytan
//   5. punkt   — högar (timmer + GROT), Vidas tilläggspunkter, RAÄ-punkter
//   6. linje   — stickvägar, basvägar, kraftledningar, RAÄ-linjer, områdesgräns-linjer
//   7. fastighet — fastighetsgränsen (rågången): ett tryck på gränsen öppnar "X mot Y" före traktdelens yta, så att man kan trycka på en rågång som ligger på traktgränsen
//   8. yta     — det MINSTA och mest specifika: hänsyn, egna zoner, nyckelbiotop, fornlämning/kultur, Övrigt
//   9. traktyta — traktdelen och egna områdens fyllning, SIST (Martin 2026-11-23: tryck på en hänsyn öppnade traktens kort).
//                Körspåren och högarnas bakgrund deltar inte alls: de tar aldrig emot tryck.
//
// VARFÖR 'traktyta' är en egen kategori: Vidas traktdel och hänsyn bär ingen areal i datan (AREA_HA/SHAPE.STAr saknas), så "minsta ytan" kan inte avgöras på storlek —
// då vinner översta lagret. Sedan lagerordningen (#1008, 2026-10-26) ligger traktgräns-lagren (trakt-gr-*, grans-*) över ytorna, och traktdelen slog hänsynen.
// Ordningen mellan ytorna avgörs därför av KATEGORIN, aldrig av hur lagren råkar ligga.
// Väg-⚠ (lib/vagRisk) är markörer på vägen och tar emot sitt eget tryck (en DOM-knapp över kartan) — de deltar inte i den här prioriteringen. Förut låg en 30 px bred osynlig träfflinje på traktgränsen
// (kategorin 'tma'); den är borta tillsammans med den pulserande gränsmarkeringen.

export type KlickKategori = 'larm' | 'kommentar' | 'symbol' | 'yta-nr' | 'punkt' | 'linje' | 'fastighet' | 'yta' | 'traktyta';

// Kategori → dess kart-lager. Ett lager får bara stå i EN kategori.
export const KLICK_LAGER: { kategori: KlickKategori; lager: string[] }[] = [
  { kategori: 'larm',   lager: ['larm-pin-hit'] },
  { kategori: 'kommentar', lager: ['markers-kommentar-traff', 'markers-kommentar-traff-ovan'] },
  { kategori: 'symbol', lager: ['markers-avvikelse', 'markers-hit', 'arrows-hit', 'line-fall-trad', 'line-korupp-traff'] },
  { kategori: 'yta-nr', lager: ['yta-nr-hit'] },
  {
    kategori: 'punkt',
    lager: ['hogar-hit', 'hogar-cluster', 'grot-circle', 'trakt-punkt-circle', 'trakt-raa-point'],
  },
  {
    kategori: 'linje',
    lager: ['line-hitbox', 'trakt-linje-hit', 'trakt-raa-line'],   // träffytor (44 px) för egna och Vidas linjer; RAÄ-linjer som förut
  },
  { kategori: 'fastighet', lager: ['trakt-ragang-hit'] },
  { kategori: 'yta',      lager: ['zone-fill', 'trakt-hansyn-fill', 'trakt-ovrigt-fill', 'trakt-nb-fill', 'trakt-raa-fill'] },
  { kategori: 'traktyta', lager: ['grans-fill', 'trakt-gr-fill'] },
];

// Alla lager som deltar i prioriteringen — mata queryRenderedFeatures med denna.
export const ALLA_KLICK_LAGER: string[] = KLICK_LAGER.flatMap((k) => k.lager);

const PRIORITET: KlickKategori[] = KLICK_LAGER.map((k) => k.kategori);

// Vilken kategori ett enskilt lager tillhör (null om det inte deltar).
export function kategoriForLager(lager: string): KlickKategori | null {
  for (const k of KLICK_LAGER) if (k.lager.includes(lager)) return k.kategori;
  return null;
}

// Vinnande kategori givet lager-id:n som ligger vid tryckpunkten. null = inget träffat.
export function valjKlickKategori(lagerVidPunkt: Iterable<string>): KlickKategori | null {
  const set = new Set(lagerVidPunkt);
  for (const { kategori, lager } of KLICK_LAGER) {
    if (lager.some((l) => set.has(l))) return kategori;
  }
  return null;
}

// Är `minKategori` den vinnande (dvs får min handler agera)? Bekvämlighet för handlers.
export function arVinnare(lagerVidPunkt: Iterable<string>, minKategori: KlickKategori): boolean {
  return valjKlickKategori(lagerVidPunkt) === minKategori;
}

// Rangordning (lägre = högre prioritet) för att jämföra två kategorier.
export function prioritetsRang(kategori: KlickKategori): number {
  const i = PRIORITET.indexOf(kategori);
  return i < 0 ? 999 : i;
}

// Av flera träffade features: bara de i den VINNANDE kategorin (högst prioritet). Ordningen i resultatet är bevarad. Används när flera lager på samma sida (t.ex. hänsyn och
// traktdel) ligger under trycket och storleken inte går att läsa ur datan — kategorin avgör, inte lagerordningen.
export function bastaKategoriFeatures<T>(feats: T[]): T[] {
  const lagerId = (f: T): string => (f as any)?.layer?.id ?? '';
  let basta = 999;
  for (const f of feats) { const k = kategoriForLager(lagerId(f)); if (k) basta = Math.min(basta, prioritetsRang(k)); }
  if (basta === 999) return feats;
  return feats.filter((f) => { const k = kategoriForLager(lagerId(f)); return k != null && prioritetsRang(k) === basta; });
}
