// SKOTNINGSAVSTÅNDET: lassen som bär det, ur BÅDA källorna.
//
// VARFÖR DEN FINNS (Martin 2026-11-16: "hur funkar skotningsavståndet för
// daniel har ju registrerat lassen i appen")
//
// Fakturan läste bara `fakt_lass` — Optis filer. Elefanten rapporterar lass i
// APPEN sedan 20 oktober, och de ligger i `skotar_lass` med GPS-spår per lass.
// De lassen var alltså osynliga för avståndstillägget. Uppmätt i prod
// 2026-11-16:
//
//   Skälviken   85 app-lass (1 553 m³, 90 % av trakten)  mot  2 Opti-lass (40 m³, 2 %)
//   Mölleryd    38 app-lass (779 m³)                     mot  8 Opti-lass
//   Arvidstorp  14 app-lass (280 m³)                     mot  0
//
// Skälvikens två Opti-lass (858 och 1 538 m enkel väg) är LÄNGRE än samtliga
// 85 app-lass (40–672 m, volymviktat 382 m). Tillägget går från 1 680 kr till
// 14 416 kr när appens lass räknas — och ett avstånd gissat ur de två
// Opti-lassen hade blivit fem gånger för högt.
//
// RÄTTAT 2026-11-18: app-lassens avstånd kom ur `skotar_lass.spar`, som saknar
// utturen (279 m per lass på Skälviken). Det kommer nu ur hyttspåret, se
// lib/faktura/lassCykel och lasAppLass. Talen ovan är de uppmätta FÖRE den
// rättningen och står kvar som historik — volymviktat är Skälviken 739 m, inte
// 382, när utturen räknas med.
//
// ─────────────────────────────────────────────────────────────────────────
// TVÅ REGLER, INGEN NY PRISMODELL
//
//   1. ALDRIG DUBBELT. Samma dags skotning kan finnas i båda källorna — det
//      är samma lass sett från två håll. Per maskin och svensk DAG vinner den
//      källa som har mest volym, aldrig summan. Exakt samma regel som
//      helikoptern använder för skotat (vyn `helikopter_lass`), så det finns
//      inte två sätt att väga Opti mot appen.
//
//   2. PRISET SÄTTS EN GÅNG PÅ TRAKTENS VOLYM (Martin 2026-11-25), ur det
//      volymviktade avståndet över lassen som har en mätt sträcka. Ett lass
//      utan mätt sträcka räknas INTE som 0 m — det räknas inte alls.
//
//      Förut summerades priset per lass på lassets egen volym och delades
//      sedan på hela trakten. Då drog varje omätt lass ner tillägget: Skälviken
//      blev 7,52 kr/m³fub i stället för 12, eftersom 15 av 85 lass saknade
//      cykel. Prislistan har ett avstånd per trakt och ett tillägg per trakt,
//      och det är så Martin har fakturerat — båda hans handsatta trakter
//      stämmer på öret med den här regeln, ingen av dem med den gamla.
//
// Appens volym är förarens egna m³, OSKALADE — `skotar_trakt_avslut`-faktorn
// (Färdigskotad) används med flit inte här: den finns för att stämma av
// traktens TOTALA volym, och ett avståndstillägg ska inte ändras av att någon
// trycker en knapp. Att lassen inte täcker hela trakten säger täckningsraden
// i "Vad behöver du kolla?" (lib/faktura/fattas).
// ─────────────────────────────────────────────────────────────────────────

import { skotAvstandKr, type AvstandConfig } from '@/lib/ekonomi/acord';
import { skotningsavstandM } from '@/lib/skotningsavstand';

export type Lasskalla = 'opti' | 'app';

/** Ett lass som kan bära avståndstillägg. `avstandM` är ENKEL VÄG. */
export type AvstandsLass = {
  /** Svensk dag — nyckeln som Opti och appen jämförs på. */
  datum: string;
  /** null = okänd maskin; ett sådant lass jämförs i sin egen grupp. */
  maskinId: string | null;
  /**
   * Skotningsavstånd enkel väg. null = lasset har ingen mätt sträcka och
   * bidrar därför med 0 kr — men räknas ändå när källorna vägs mot varandra.
   */
  avstandM: number | null;
  volym: number;
  kalla: Lasskalla;
};

// `sparAvstandM` låg här och räknade avståndet ur `skotar_lass.spar`. Den är
// BORTTAGEN 2026-11-18: spårkopian saknar utturen, så varje app-lass blev för
// kort (Skälviken 383 m i stället för 739). Avståndet kommer nu ur hyttspåret
// (lib/faktura/lassCykel). Bygg den inte tillbaka — vakten i
// lassCykel.vakter.test.ts larmar om spårkopian används för ett avstånd igen.

/** Gruppnyckeln: maskin + svensk dag. Okänd maskin får sin egen grupp. */
function nyckel(l: AvstandsLass): string {
  return `${l.maskinId ?? '(okänd)'}|${l.datum}`;
}

/**
 * Opti mot appen: per maskin och dag vinner källan med mest volym.
 *
 * Volymen räknas på ALLA lass i källan den dagen, också de utan mätt sträcka —
 * ett lass utan spår är fortfarande ett lass som kördes, och ska väga när man
 * avgör vilken källa som beskriver dagen bäst. Ur den vinnande källan går
 * sedan bara de lass vidare som har en sträcka; resten bidrar med 0 kr,
 * precis som ett Opti-lass utan korstracka alltid har gjort.
 *
 * LIKA VOLYM: Opti vinner. Det är maskinens egen mätning och den källa
 * historiken är byggd på — appens m³ är förarens uppskattning.
 */
export function valjLassKalla(lass: AvstandsLass[]): AvstandsLass[] {
  const grupper = new Map<string, AvstandsLass[]>();
  for (const l of lass) {
    const k = nyckel(l);
    const g = grupper.get(k);
    if (g) g.push(l); else grupper.set(k, [l]);
  }

  const valda: AvstandsLass[] = [];
  for (const g of Array.from(grupper.values())) {
    const volym = (k: Lasskalla) =>
      g.reduce((s, l) => s + (l.kalla === k ? l.volym : 0), 0);
    const harApp = g.some(l => l.kalla === 'app');
    const harOpti = g.some(l => l.kalla === 'opti');
    // Bara en källa den dagen: den gäller, oavsett volym.
    const vinnare: Lasskalla = !harApp ? 'opti'
      : !harOpti ? 'app'
      : volym('app') > volym('opti') ? 'app' : 'opti';
    for (const l of g) if (l.kalla === vinnare) valda.push(l);
  }
  return valda;
}

/** Vad som faktiskt bär tillägget: lassen ur den valda källan som HAR sträcka. */
export function lassMedStracka(valda: AvstandsLass[]): AvstandsLass[] {
  return valda.filter(l => (l.avstandM ?? 0) > 0);
}

/**
 * Vilka källor tillägget vilar på, för granskningen. Tom lista = inga lass.
 * Säger VAD talet bygger på utan att vyn behöver räkna om något.
 */
export function kallorIOrd(valda: AvstandsLass[]): Lasskalla[] {
  const k = new Set(lassMedStracka(valda).map(l => l.kalla));
  return (['app', 'opti'] as Lasskalla[]).filter(x => k.has(x));
}

// ─────────────────────────────────────────────────────────────────────────
// TILLÄGGET I KRONOR — EN funktion för fakturan och Ekonomi › Ackord.
//
// Fram till 2026-11-22 räknade Ackord-vyn (lib/ekonomi/objektJamforelse)
// avståndet själv, ur BARA Optis lass. Fakturan läste Opti och appen. På de
// trakter där Elefanten rapporterat i appen sa vyn därför 0 kr när fakturan
// sa 9 000: Arvidstorp 516 m kört, 0 kr i Ackord. Nu räknar båda här, så de
// kan inte glida isär igen (vakt: lassAvstand.test.ts "samma tal som fakturan").
//
// Reglerna:
//   - handsatt avstånd (`manuellM` ej null) går före lassen
//   - annars lassens volymviktade avstånd, ur den källa som vinner per maskin
//     och dag (`valjLassKalla`)
//   - och i båda fallen räknas priset EN gång, på traktens SKÖRDADE volym och
//     på avräkningsdagen
// ─────────────────────────────────────────────────────────────────────────


/** Optis lass → lass som kan bära tillägg. Noll körsträcka är ingen mätning. */
export function optiTillAvstandsLass(
  rader: { datum: unknown; maskin_id?: string | null; korstracka_m: unknown; volym_m3sub: unknown }[],
): AvstandsLass[] {
  return rader.map(l => ({
    datum: String(l.datum),
    maskinId: l.maskin_id ?? null,
    avstandM: (Number(l.korstracka_m) || 0) > 0 ? skotningsavstandM(Number(l.korstracka_m)) : null,
    volym: Number(l.volym_m3sub) || 0,
    kalla: 'opti' as const,
  }));
}

export type AvstandsTillagg = {
  /** Tillägget i kronor — det som står på fakturan. */
  kr: number;
  /** 'manuell' = handsatt avstånd, 'lass' = ur lassen, 'inga' = inget att räkna på. */
  grund: 'manuell' | 'lass' | 'inga';
  /** Lassen ur den vinnande källan (också de utan sträcka). */
  valda: AvstandsLass[];
  /** De lass som bär tillägget (har sträcka). */
  barande: AvstandsLass[];
  /**
   * ALLTID null sedan 2026-11-25: tillägget hör till TRAKTEN, inte till ett
   * enskilt lass, så det finns inga kronor per maskin att dela ut. Den som
   * delar upp det per skotare gör det på volym (`fordelaPaSkotare`).
   *
   * Fältet står kvar så `fordelaPaSkotare` behåller sin signatur och kan dela
   * upp ett tillägg som en framtida regel skulle lägga per maskin.
   */
  perMaskin: Map<string | null, number> | null;
  /** Volymviktat avstånd (enkel väg) över lassen som bär tillägget. */
  lassSnittM: number | null;
};

export function avstandsTillagg(p: {
  opti: AvstandsLass[];
  app: AvstandsLass[];
  /** dim_objekt.skotavstand_manuell (enkel väg). null = inte satt. */
  manuellM: number | null;
  /** Traktens skördade volym — det handsatta avståndet räknas på den. */
  skordadVolym: number;
  /** Avräkningsdagen, prisuppslaget för det handsatta avståndet. */
  uppslag: string;
  avstList: AvstandConfig[];
}): AvstandsTillagg {
  const valda = valjLassKalla([...p.opti, ...p.app]);
  const barande = lassMedStracka(valda);
  const vol = barande.reduce((s, l) => s + l.volym, 0);
  const lassSnittM = vol > 0 ? barande.reduce((s, l) => s + l.avstandM! * l.volym, 0) / vol : null;

  // EN sträcka, ETT pris, på traktens volym — handsatt eller mätt.
  const avstandM = p.manuellM ?? lassSnittM;
  const grund: AvstandsTillagg['grund'] =
    p.manuellM != null ? 'manuell' : avstandM != null ? 'lass' : 'inga';
  const kr = avstandM == null
    ? 0
    : skotAvstandKr(p.uppslag, avstandM, p.skordadVolym, p.avstList);

  return { kr, grund, valda, barande, perMaskin: null, lassSnittM };
}

/**
 * Tillägget per skotare, för Ekonomi › Ackord. Kronorna läggs på maskinen
 * som körde lassen. Det handsatta avståndet — och kronor från en maskin som
 * inte finns bland `skotare` — delas efter volym. Summan är alltid
 * `t.kr` när det finns minst en skotare med volym; finns ingen, tom karta.
 */
export function fordelaPaSkotare(
  t: Pick<AvstandsTillagg, 'kr' | 'perMaskin'>,
  skotare: { maskinId: string; volym: number }[],
): Map<string, number> {
  const ut = new Map<string, number>();
  const medVolym = skotare.filter(s => s.volym > 0);
  if (!medVolym.length) return ut;
  for (const s of medVolym) ut.set(s.maskinId, 0);
  let attDela = t.perMaskin == null ? t.kr : 0;
  if (t.perMaskin) {
    for (const [mid, kr] of Array.from(t.perMaskin.entries())) {
      if (mid != null && ut.has(mid)) ut.set(mid, ut.get(mid)! + kr); else attDela += kr;
    }
  }
  if (attDela !== 0) {
    const tot = medVolym.reduce((s, x) => s + x.volym, 0);
    for (const s of medVolym) ut.set(s.maskinId, ut.get(s.maskinId)! + attDela * s.volym / tot);
  }
  return ut;
}
