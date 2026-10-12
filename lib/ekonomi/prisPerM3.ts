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
  /**
   * Prislistans rad, oförändrad. Vyn ska kunna visa VAD AVTALET GER innan
   * tilläggen: "medelstam 0,57 → klass 0,55: 101 kr/m³fub — skördare 57 ·
   * skotare 44". Utan den ser korten 57,00 och 44,00 ut som tal appen hittat
   * på, i stället för en rad i avtalet.
   * Klassuppslaget är NÄRMASTE UNDER, inte närmaste — en tolkning som ska
   * synas, inte gömmas.
   */
  prislista: { medelstam: number; klass: number; total: number; skordare: number; skotare: number } | null;
  /** Tilläggen med sin mottagare, för vyn. Summerar till `ovrigt`. */
  tillaggsposter: Tillaggspost[];
};

/**
 * Fördelar tilläggen mellan skördar- och skotarraden.
 *
 * ⚠️ TILLÄGGET LÄGGS PÅ TOTALEN EN GÅNG. Det adderas INTE till båda rollerna.
 * Verifierat mot 30 Vida-fakturor 2026-09-25:
 *     pris(artikel 1) + pris(artikel 2) = pris_total(klass) + Σ tillägg
 *
 * VARJE POST HAR EN MOTTAGARE — det finns ingen pott att dela (Martins
 * uppdelning, 2026-09-29):
 *
 *     Krönt (kvalitetssäkring, ForestLink)   SKÖRDAREN
 *     Traktstorlek                           DELAS
 *     Terräng                                SKOTAREN
 *     Sortimentstillägg                      SKOTAREN
 *     Skotningsavstånd                       SKOTAREN (utanför krPerM3)
 *
 * Då står "Krönt +1,50" på skördarens kort och "Terräng +2,00" på skotarens,
 * i stället för "Andel av traktens tillägg" på båda. Bara traktstorleken
 * delas, och den delas hälften var avrundat NEDÅT till femtioöring med
 * överskottet till skotaren.
 *
 * REGELN TRÄFFAR INTE ALLTID, OCH DET ÄR INSKRIVET MED FLIT.
 * Prövad mot 14 fakturor med fullständig härledning: fyra träffar exakt på
 * BÅDA raderna, flera till på den ena. Bättre än hälftendelningen, men inte
 * hela vägen. Avvikelsen har ett läsbart mönster — skördaren får mer än
 * regeln säger när TERRÄNGEN ÄR STOR:
 *     medelstam 0,46, terräng 8 kr → regeln 61,50, fakturan 67,50
 *     medelstam 0,49, terräng 7 kr → regeln 61,50, fakturan 66,50
 *     medelstam 0,30, terräng 5 kr → regeln 71,50, fakturan 71,50  (träff)
 * Vid 2–3 kr stämmer regeln; vid 5–8 kr har Martin gett skördaren en del,
 * för blöt mark drabbar båda när den är riktigt svår.
 *
 * DET BYGGS INTE IN. Ett mönster i fjorton rader är ett stickprov, och vi
 * har grävt oss ur tre sådana. Fördelningen ändras i stället per trakt med
 * dim_objekt.acord_andel_skordare_manuell, som anger hur mycket av HELA
 * tillägget som ligger på skördaren.
 */
export type Tillaggspost = {
  etikett: string;
  belopp: number;
  /** Vem posten hör till. 'delas' = hälften var, nedåt till femtioöring. */
  mottagare: 'skordare' | 'skotare' | 'delas';
};

/** Hälften var av ett delat belopp, nedåt till femtioöring, resten till
 *  skotaren. Räknar i ÖRE som heltal: summan av flera halvkronor behöver
 *  inte vara exakt i flyttal, och en floor som slinter ett steg flyttar
 *  femtio öre per kubik. */
export function delaHalften(belopp: number): { skordare: number; skotare: number } {
  const ore = Math.round(belopp * 100);
  const halva = Math.floor(ore / 2);
  const skordareOre = Math.floor(halva / 50) * 50;
  return { skordare: skordareOre / 100, skotare: (ore - skordareOre) / 100 };
}

/** Fördelar posterna efter sin mottagare. Summan är alltid hela tillägget. */
export function fordelaTillagg(poster: Tillaggspost[]): {
  skordare: number; skotare: number; ovrigt: number;
} {
  let sk = 0, sko = 0, allt = 0;
  for (const post of poster) {
    allt += post.belopp;
    if (post.mottagare === 'skordare') sk += post.belopp;
    else if (post.mottagare === 'skotare') sko += post.belopp;
    else { const d = delaHalften(post.belopp); sk += d.skordare; sko += d.skotare; }
  }
  const ore = (n: number) => Math.round(n * 100);
  return { skordare: ore(sk) / 100, skotare: ore(sko) / 100, ovrigt: ore(allt) / 100 };
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

  // Varje post har en mottagare — se fordelaTillagg. Ingen pott.
  const poster: Tillaggspost[] = [
    { etikett: 'Krönt',      belopp: p.kvalitetKr, mottagare: 'skordare' },
    { etikett: 'Storlek',    belopp: p.traktKr,    mottagare: 'delas'    },
    { etikett: 'Terräng',    belopp: p.terrangKr,  mottagare: 'skotare'  },
    { etikett: 'Sortiment',  belopp: p.sortKr,     mottagare: 'skotare'  },
  ];
  const fordelat = fordelaTillagg(poster);
  const ovrigt = fordelat.ovrigt;
  const andel = { skordare: fordelat.skordare, skotare: fordelat.skotare };
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
    prislista: rad ? {
      medelstam: p.medelstam,
      klass: Number(rad.medelstam),
      total: Number(rad.pris_total) || 0,
      skordare: Number(rad.pris_skordare) || 0,
      skotare: Number(rad.pris_skotare) || 0,
    } : null,
    tillaggsposter: poster.filter(x => x.belopp !== 0),
  };
}
