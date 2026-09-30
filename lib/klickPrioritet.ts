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
//   2. yta-nr  — ytans nummer: öppnar ALLTID ytkortet, även när högar täcker ytan
//   3. punkt   — högar (timmer + GROT), markörer/pilar, Vidas tilläggspunkter
//   4. linje   — stickvägar, basvägar, kraftledningar, RAÄ-linjer, områdesgräns-linjer
//   5. yta     — minsta ytan (gräns-fyllning, zoner, Vidas hänsyns-/traktdels-ytor)

export type KlickKategori = 'larm' | 'yta-nr' | 'punkt' | 'linje' | 'yta';

// Kategori → dess kart-lager. Ett lager får bara stå i EN kategori.
export const KLICK_LAGER: { kategori: KlickKategori; lager: string[] }[] = [
  { kategori: 'larm',   lager: ['larm-pin-hit'] },
  { kategori: 'yta-nr', lager: ['yta-nr-hit'] },
  {
    kategori: 'punkt',
    lager: ['hogar-hit', 'hogar-cluster', 'grot-circle', 'markers-hit', 'arrows-hit', 'trakt-punkt-circle', 'trakt-raa-point'],
  },
  {
    kategori: 'linje',
    lager: ['line-hitbox', 'trakt-basvag-line', 'trakt-kraftledning-line', 'trakt-raa-line'],
  },
  {
    kategori: 'yta',
    lager: ['grans-fill', 'zone-fill', 'trakt-hansyn-fill', 'trakt-nb-fill', 'trakt-raa-fill', 'trakt-gr-fill'],
  },
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
