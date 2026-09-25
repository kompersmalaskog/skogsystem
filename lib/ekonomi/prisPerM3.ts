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
// ⚠️ TILLÄGGEN DELAS MELLAN ROLLERNA — DE ADDERAS INTE TILL BÅDA.
// krPerM3 är ROLLENS pris: rollens grundpris plus rollens andel av tilläggen.
// Summan av de två rollernas krPerM3 är pris_total(klass) + tilläggen, EN
// gång. Se fordelaOvrigt för regeln och beviset.
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
  /** ROLLENS à-pris per m³fub: rollens grundpris + rollens ANDEL av övrigt.
   *  INNEHÅLLER INTE avståndet — se huvudet. */
  krPerM3: number;
  /** Härledningen, i fakturans ordning. Avståndet ingår här när det är känt.
   *  Delarna bär HELA tillägget ("Krönt +1,5kr"), inte rollens andel — det är
   *  så Vida ser dem på fakturan, och det är totalen som härleds. */
  delar: Prisdel[];
  /** Prislistans klass som medelstammen slogs upp mot. null = ingen prisrad. */
  klass: number | null;
  /** Medelstammen som användes (override ?? mätt ?? antagen). */
  medelstam: number;
  /** Tilläggen som DELAS mellan rollerna: krönt + storlek + terräng + sortiment. */
  ovrigt: number;
  /** Fördelningen av `ovrigt`. Summerar alltid till `ovrigt`. */
  andelSkordare: number;
  andelSkotare: number;
  /** pris_total(klass) + ovrigt. Summan av båda rollernas à-pris, utan avstånd. */
  total: number;
};

/**
 * Fördelar tilläggen mellan skördar- och skotarraden.
 *
 * ⚠️ TILLÄGGET LÄGGS PÅ TOTALEN EN GÅNG. Det adderas INTE till båda rollerna.
 * Verifierat mot 30 Vida-fakturor 2026-09-25:
 *     pris(artikel 1) + pris(artikel 2) = pris_total(klass) + Σ tillägg
 * Den gamla koden la hela tillägget på VARJE roll och gav pris_total + 2×
 * tillägg — 3,48 kr/m³ för mycket i snitt, 73 066 kr över 40 avräknade objekt.
 *
 * REGELN: hälften var, avrundat NEDÅT till närmaste femtioöring, med
 * överskottet till skotaren.
 *     5,50 → 2,50 / 3,00     (halva 2,75)
 *     3,50 → 1,50 / 2,00     (halva 1,75)
 * Mönstret återkommer på minst åtta fakturor; ingen faktura har 2,75.
 *
 * Detta är ett FÖRSLAG, inte en formel. Flera fakturor avviker (7,50 delat
 * 2,50/5,00; 6,50 delat 4,00/2,50) — det är Martins bedömning per objekt,
 * som terrängposten. Överskrivningen bor på fakturaraden, inte här.
 *
 * Räknar i ÖRE som heltal: 2.75/0.5 är exakt i binärt, men summan av flera
 * halvkronor behöver inte vara det, och en flyttalsfloor som slinter ett steg
 * flyttar femtio öre per kubik.
 */
export function fordelaOvrigt(ovrigt: number): { skordare: number; skotare: number } {
  const ore = Math.round(ovrigt * 100);
  const halva = Math.floor(ore / 2);              // heltalsdivision, nedåt
  const skordareOre = Math.floor(halva / 50) * 50; // ned till hel femtioöring
  return { skordare: skordareOre / 100, skotare: (ore - skordareOre) / 100 };
}

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

  // Tilläggen summeras EN gång och fördelas — se fordelaOvrigt.
  const ovrigt = p.sortKr + p.traktKr + p.kvalitetKr + p.terrangKr;
  const andel = fordelaOvrigt(ovrigt);
  const krPerM3 = grundpris + (p.roll === 'skordare' ? andel.skordare : andel.skotare);

  // Totalen är prislistans pris_total, inte summan av de två rollpriserna:
  // pris_skordare + pris_skotare = pris_total i varje rad i acord_priser
  // (verifierat på alla nio klasser), men pris_total är det avtalet anger och
  // det talet Martin skriver i härledningen ("Medel 0,57=101").
  const total = (rad ? Number(rad.pris_total) || 0 : 0) + ovrigt;

  // Grundpriset bär prisuppslagets semantik i etiketten: prislistan spänner
  // 0,20–0,60 och avtalet säger ingenting utanför, så klampningen i båda
  // ändarna är en TOLKNING utan avtalsstöd. Den ska synas på kortet, inte
  // bara i koden.
  const grundEtikett = klass != null && Math.abs(klass - p.medelstam) > 0.0005
    ? `Grund (medelstam ${tal(p.medelstam)} → ${tal(klass)})`
    : `Grund (medelstam ${tal(p.medelstam)})`;

  // Grunddelen bär TOTALPRISET, inte rollens del. Härledningen beskriver
  // objektets pris — Martin skriver det så för hand: "Medel 0,57=101".
  const delar: Prisdel[] = [
    { etikett: grundEtikett, belopp: rad ? Number(rad.pris_total) || 0 : 0 },
  ];
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

  return {
    krPerM3, delar, klass, medelstam: p.medelstam,
    ovrigt, andelSkordare: andel.skordare, andelSkotare: andel.skotare, total,
  };
}
