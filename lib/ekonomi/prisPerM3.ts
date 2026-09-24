// EN assemblering av ackordets à-pris per m³fub. Delad av ekonomivyns dagvy
// (app/ekonomi/EkonomiClient), per-objekt-jämförelsen (lib/ekonomi/objektJamforelse)
// och — när den byggs — fakturaunderlagets radbyggare.
//
// VARFÖR DEN FINNS: summeringen av prisdelarna var skriven två gånger, ord för
// ord, i EkonomiClient och objektJamforelse. Två kopior av samma uträkning
// divergerar tyst — och gjorde det redan: den ena slår upp kvalitetssäkringen
// på periodslut, den andra på avräkningsdagen, vilket ger 0 mot 1,50 kr/m³ på
// 24 objekt. En tredje konsument (fakturan) hade gett ett tredje svar, och den
// är den som går till kund.
//
// Prisdelarna kommer FÄRDIGA in. Den här funktionen slår bara upp grundpriset
// och sätter ihop delarna — uppslagen (sortimentTillagg, traktTillagg,
// ovrigtKrPerM3) ligger kvar hos anroparna, som äger sina datumval. Det gör
// införandet till en ren kodflytt utan beteendeändring; datumstyrningen är ett
// eget steg efter att taxornas giltig_fran är backdaterad (PR #570).
//
// ⚠️ AVSTÅNDET INGÅR INTE I krPerM3, OCH DET ÄR AVSIKTLIGT.
// Skotningsavståndstillägget är KRONOR som summeras per lass, inte en sats per
// m³. Anroparna räknar
//     volymEfterUndantag × krPerM3 + skotKr + undantagKr
// och skalar alltså INTE avståndet med timpeng-undantaget. Vecklas avståndet in
// i krPerM3 och multipliceras med volymEfterUndantag ändras beloppet så fort ett
// undantag finns. Avståndet finns därför i `delar` (för härledningen, som
// fakturan visar det: "Avstånd +16kr") men aldrig i `krPerM3`.
//
// `delar` ÄR fakturaradens harledning-jsonb. Vida får delarna som egna
// nollrader i dokumentet, så de måste vara en lista — inte en hopslagen sträng.

import { lookupAcordPris, type AcordPris } from '@/lib/ekonomi/acord';

export type Prisdel = {
  etikett: string;
  belopp: number;
  /** true = talet är ett viktat snitt, inte en sats. Måste synas i vyn. */
  ungefarlig?: boolean;
};

export type PrisPerM3 = {
  /** Grundpris + tillägg per m³fub. INNEHÅLLER INTE avståndet — se huvudet. */
  krPerM3: number;
  /** Härledningen, i fakturans ordning. Avståndet ingår här när det är känt. */
  delar: Prisdel[];
  /** Prislistans klass som medelstammen slogs upp mot. null = ingen prisrad. */
  klass: number | null;
  /** Medelstammen som användes (override ?? mätt ?? antagen). */
  medelstam: number;
};

const tal = (n: number) => n.toFixed(2).replace(/0+$/, '').replace(/[.,]$/, '').replace('.', ',');

/**
 * Sätter ihop à-priset. Alla tillägg kommer färdiguträknade in — den här
 * funktionen äger bara grundprisuppslaget och hopsättningen.
 *
 * `avstand` är skotarens avståndstillägg i KRONOR plus volymen det avser, så
 * härledningen kan visa det som kr/m³ utan att det hamnar i krPerM3.
 * `enhetligtSteg=false` betyder att lassen inte delade trappsteg — då är
 * kr/m³-talet ett viktat snitt och märks `ungefarlig`. På augustidata hade
 * inget objekt enhetligt steg (4–11 steg per objekt), så det är normalfallet.
 */
export function prisPerM3(p: {
  roll: 'skordare' | 'skotare';
  medelstam: number;
  acordList: AcordPris[];
  sortKr: number;
  traktKr: number;
  kvalitetKr: number;
  terrangKr: number;
  avstand?: { kr: number; volym: number; enhetligtSteg: boolean } | null;
}): PrisPerM3 {
  const rad = lookupAcordPris(p.medelstam, p.acordList);
  const klass = rad ? Number(rad.medelstam) : null;
  const grundpris = rad
    ? Number(p.roll === 'skordare' ? rad.pris_skordare : rad.pris_skotare) || 0
    : 0;

  // SUMMERINGSORDNINGEN ÄR DAGENS, INTE DELARNAS ORDNING.
  // Flyttalsaddition är inte associativ: (a+b)+(c+d) kan skilja sig i sista
  // biten från a+b+c+d. Anroparna räknade
  //     grundpris + (sortKr + traktKr + (kvalitetKr + terrangKr))
  // och den grupperingen behålls exakt, så att införandet är ett bevisbart
  // no-op och inte "samma tal så när som på avrundning". Ändras ordningen
  // måste no-op-testet i prisPerM3.test.ts räknas om först.
  const ovrigKr = p.kvalitetKr + p.terrangKr;
  const krPerM3 = grundpris + (p.sortKr + p.traktKr + ovrigKr);

  // Grundpriset bär prisuppslagets semantik i etiketten: prislistan slutar vid
  // 0,60 och avtalet säger ingenting däröver, så "närmaste klass" är en
  // TOLKNING utan avtalsstöd. Den ska synas på kortet, inte bara i koden.
  const grundEtikett = klass != null && Math.abs(klass - p.medelstam) > 0.0005
    ? `Grund (medelstam ${tal(p.medelstam)} → ${tal(klass)})`
    : `Grund (medelstam ${tal(p.medelstam)})`;

  const delar: Prisdel[] = [{ etikett: grundEtikett, belopp: grundpris }];
  if (p.kvalitetKr) delar.push({ etikett: 'Krönt', belopp: p.kvalitetKr });
  if (p.traktKr)    delar.push({ etikett: 'Storlek', belopp: p.traktKr });
  if (p.terrangKr)  delar.push({ etikett: 'Terräng', belopp: p.terrangKr });
  if (p.sortKr)     delar.push({ etikett: 'Sortiment', belopp: p.sortKr });

  if (p.avstand && p.avstand.volym > 0 && p.avstand.kr !== 0) {
    delar.push({
      etikett: 'Avstånd',
      belopp: p.avstand.kr / p.avstand.volym,
      ungefarlig: !p.avstand.enhetligtSteg,
    });
  }

  return { krPerM3, delar, klass, medelstam: p.medelstam };
}
