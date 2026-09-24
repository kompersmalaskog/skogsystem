// EN assemblering av ackordets à-pris per m³fub, DATUMSTYRD och UTAN FALLBACK.
// Delad av ekonomivyns dagvy (app/ekonomi/EkonomiClient), per-objekt-jämförelsen
// (lib/ekonomi/objektJamforelse) och fakturaunderlagets radbyggare.
//
// VARFÖR DEN FINNS: summeringen av prisdelarna var skriven två gånger, ord för
// ord, i EkonomiClient och objektJamforelse. Två kopior av samma uträkning
// divergerar tyst, och en tredje konsument (fakturan) hade gett ett tredje svar
// — den som går till kund.
//
// ─────────────────────────────────────────────────────────────────────────
// UPPSLAGSDATUM = AVRÄKNINGSDAGEN, och det är ANROPARENS ansvar att skicka
// rätt datum (lib/objekt/avrakning.avrakningsdatum). EkonomiClient slog förut
// upp på periodslut och objektJamforelse på avräkningsdagen — två definitioner
// av samma tidpunkt är samma felklass som två priser.
//
// INGEN FALLBACK. Saknas datumgiltig sats returneras 0 OCH komponenten listas i
// `saknas`. Den gamla ovrigtKrPerM3 föll tillbaka på första raden med rätt
// nyckel oavsett datum — den ljög tyst, och den dolde precis det som
// datummärkningen finns för att fånga. En sats som saknas är ett TILLSTÅND,
// inte ett tal som ser rimligt ut: radbyggaren mappar `saknas` till
// faktura_rad.fel_kod = 'pris_saknas', och spärren ligger på UNDERLAGET —
// en rad som inte kan prissättas gör att hela underlaget inte går att skicka.
//
// Borttagningen är verifierad som no-op mot prod 2026-09-24, mot KÄLLORNAS
// ytterkanter (2023-02-24 → 2026-09-24) och inklusive exkluderade objekt:
// 133 datum prövade, enda avvikelsen är sondens ytterkant 2023-02-24 där inget
// objekt finns. Taxorna täcker hela objektspannet efter backdateringen (#570).
// ─────────────────────────────────────────────────────────────────────────
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

import {
  isValidOn, lookupAcordPris, traktTillagg, sortimentTillagg,
  type AcordPris, type TraktBracket, type SortConfig, type OvrigtRad,
} from '@/lib/ekonomi/acord';

/** Giltighetsfönstret finns på de hämtade raderna även när typen inte säger det. */
type Giltighet = { giltig_fran?: string | null; giltig_till?: string | null };

export type Prisdel = {
  etikett: string;
  belopp: number;
  /** true = talet är ett viktat snitt, inte en sats. Måste synas i vyn. */
  ungefarlig?: boolean;
};

export type SaknadSats = 'grundpris' | 'kvalitet' | 'trakt' | 'sortiment';

export type PrisPerM3 = {
  /** Grundpris + tillägg per m³fub. INNEHÅLLER INTE avståndet — se huvudet. */
  krPerM3: number;
  /** Härledningen, i fakturans ordning. Avståndet ingår här när det är känt. */
  delar: Prisdel[];
  /** Prislistans klass som medelstammen slogs upp mot. null = ingen prisrad. */
  klass: number | null;
  /** Medelstammen som användes (override ?? mätt ?? antagen). */
  medelstam: number;
  /**
   * Komponenter utan datumgiltig sats. Tom lista = allt hittades.
   * INTE detsamma som att en sats är 0 — traktspannet 800–1500 ÄR 0 kr, och
   * artikel 8 på fakturan är 1 st à 0. "0 kr" och "sats saknas" får aldrig se
   * likadana ut, varken här eller i vyn.
   */
  saknas: SaknadSats[];
};

const tal = (n: number) => n.toFixed(2).replace(/0+$/, '').replace(/[.,]$/, '').replace('.', ',');

const giltiga = <T extends Giltighet>(rader: T[] | null | undefined, datum: string): T[] =>
  (rader || []).filter(r => isValidOn(datum, r.giltig_fran ?? null, r.giltig_till ?? null));

/**
 * Sätter ihop à-priset på ett givet datum. Listorna kommer OFILTRERADE in —
 * datumfiltret ligger här, på ett ställe, så att nästa prisgeneration inte kan
 * blandas in av en anropare som glömt filtrera.
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
  /** Avräkningsdagen. lib/objekt/avrakning.avrakningsdatum(objekt). */
  datum: string;
  acordList: (AcordPris & Giltighet)[];
  traktBrackets: (TraktBracket & Giltighet)[];
  sortConfList: (SortConfig & Giltighet)[];
  ovrigtList: OvrigtRad[];
  /** Antal sortimentgrupper (override ?? mätt). */
  sortimentgrupper: number;
  /** Objektets totala volym — traktstorlekens spann slås upp på den. */
  volymM3fub: number;
  /** dim_objekt.terrang_kr_manuell. Ett VAL i spannet 1–8, inte en taxa. */
  terrangKr: number;
  avstand?: { kr: number; volym: number; enhetligtSteg: boolean } | null;
}): PrisPerM3 {
  const saknas: SaknadSats[] = [];

  const acordGiltiga = giltiga(p.acordList, p.datum);
  const rad = acordGiltiga.length ? lookupAcordPris(p.medelstam, acordGiltiga) : null;
  if (!acordGiltiga.length) saknas.push('grundpris');
  const klass = rad ? Number(rad.medelstam) : null;
  const grundpris = rad
    ? Number(p.roll === 'skordare' ? rad.pris_skordare : rad.pris_skotare) || 0
    : 0;

  const traktGiltiga = giltiga(p.traktBrackets, p.datum);
  if (!traktGiltiga.length) saknas.push('trakt');
  const traktKr = traktTillagg(p.volymM3fub, traktGiltiga).krPerM3;

  const sortGiltig = giltiga(p.sortConfList, p.datum)[0] || null;
  if (!sortGiltig) saknas.push('sortiment');
  const sortKr = sortimentTillagg(p.sortimentgrupper, sortGiltig);

  // Ingen fallback: bara en rad som faktiskt gäller på datumet duger.
  const kvalitetRad = (p.ovrigtList || []).find(
    r => r.nyckel === 'kvalitetssakring' && isValidOn(p.datum, r.giltig_fran, r.giltig_till),
  );
  if (!kvalitetRad) saknas.push('kvalitet');
  const kvalitetKr = kvalitetRad ? Number(kvalitetRad.varde) || 0 : 0;

  // SUMMERINGSORDNINGEN ÄR DEN URSPRUNGLIGA, INTE DELARNAS ORDNING.
  // Flyttalsaddition är inte associativ: (a+b)+(c+d) kan skilja sig i sista
  // biten från a+b+c+d. Anroparna räknade
  //     grundpris + (sortKr + traktKr + (kvalitetKr + terrangKr))
  // och den grupperingen behålls exakt, så att införandet är ett bevisbart
  // no-op och inte "samma tal så när som på avrundning".
  const ovrigKr = kvalitetKr + p.terrangKr;
  const krPerM3 = grundpris + (sortKr + traktKr + ovrigKr);

  // Grundpriset bär prisuppslagets semantik i etiketten: prislistan slutar vid
  // 0,60 och avtalet säger ingenting däröver, så "närmaste klass" är en
  // TOLKNING utan avtalsstöd. Den ska synas på kortet, inte bara i koden.
  const grundEtikett = klass != null && Math.abs(klass - p.medelstam) > 0.0005
    ? `Grund (medelstam ${tal(p.medelstam)} → ${tal(klass)})`
    : `Grund (medelstam ${tal(p.medelstam)})`;

  const delar: Prisdel[] = [{ etikett: grundEtikett, belopp: grundpris }];
  if (kvalitetKr)   delar.push({ etikett: 'Krönt', belopp: kvalitetKr });
  if (traktKr)      delar.push({ etikett: 'Storlek', belopp: traktKr });
  if (p.terrangKr)  delar.push({ etikett: 'Terräng', belopp: p.terrangKr });
  if (sortKr)       delar.push({ etikett: 'Sortiment', belopp: sortKr });

  if (p.avstand && p.avstand.volym > 0 && p.avstand.kr !== 0) {
    delar.push({
      etikett: 'Avstånd',
      belopp: p.avstand.kr / p.avstand.volym,
      ungefarlig: !p.avstand.enhetligtSteg,
    });
  }

  return { krPerM3, delar, klass, medelstam: p.medelstam, saknas };
}
