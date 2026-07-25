// Acordmotorn — EN sanning för ackord- och timpengberäkning.
// Delas av /ekonomi (dagvyn), /ekonomi/per-objekt och uppföljningens
// ekonomisektion. Prisformlerna bor HÄR — vyerna får aggregera rader
// men aldrig räkna pris själva.
//
// Ingår medvetet INTE ännu: acord_terrang, objekt_prisscenario, acord_ovrigt.
// Vyer som visar resultatet ska ha fotnot om det.

import { g15Sek } from '@/lib/g15';

export type AcordPris = {
  medelstam: number;
  pris_total: number;
  pris_skordare: number;
  pris_skotare: number;
  giltig_fran: string | null;
  giltig_till: string | null;
};
export type MaskinTimpris = {
  maskin_id: string;
  maskin_namn: string | null;
  timpris: number;
  giltig_fran: string | null;
  giltig_till: string | null;
};
export type AvstandConfig = {
  grundavstand_m: number;
  kr_per_100m: number;
  giltig_fran: string | null;
  giltig_till: string | null;
};
export type TraktBracket = {
  fran_m3fub: number;
  till_m3fub: number | null;
  tillagg_kr_per_m3fub: number;
};
export type SortConfig = { grundantal: number; kr_per_extra_sortiment: number };

// Skotaren saknar egen medelstam — ärver objektets (skördarens). Saknas även
// den antas detta värde. Vyer som visar ett pris byggt på antagandet MÅSTE
// säga det i klartext ("medelstam saknas — antagen 0,35"), aldrig tyst.
export const ANTAGEN_MEDELSTAM = 0.35;

export function isValidOn(d: string, giltig_fran: string | null, giltig_till: string | null): boolean {
  if (giltig_fran && d < giltig_fran) return false;
  if (giltig_till && d > giltig_till) return false;
  return true;
}

// Närmaste medelstamsklass — acordprislistans semantik (INTE StanForD
// lower-threshold som dim_sortiment_pris).
export function lookupAcordPris(medelstam: number, acord: AcordPris[]): AcordPris | null {
  if (!acord.length) return null;
  let best = acord[0];
  let bestDiff = Math.abs(acord[0].medelstam - medelstam);
  for (const p of acord) {
    const d = Math.abs(p.medelstam - medelstam);
    if (d < bestDiff) { bestDiff = d; best = p; }
  }
  return best;
}

// Traktstorlekstillägg: bracket på objektets TOTALA skördarvolym (m³fub).
export function traktTillagg(volymM3fub: number, brackets: TraktBracket[]): { krPerM3: number; bracket: string } {
  const br = brackets.find(b =>
    Number(b.fran_m3fub) <= volymM3fub && (b.till_m3fub == null || Number(b.till_m3fub) > volymM3fub)
  );
  return {
    krPerM3: br ? Number(br.tillagg_kr_per_m3fub) : 0,
    bracket: br ? `${br.fran_m3fub}–${br.till_m3fub ?? '∞'}` : '—',
  };
}

// Sortimentstillägg: kr/m³ för sortimentgrupper utöver grundantalet.
export function sortimentTillagg(antalGrupper: number, conf: SortConfig | null): number {
  if (!conf) return 0;
  return Math.max(0, antalGrupper - conf.grundantal) * conf.kr_per_extra_sortiment;
}

// Skotningsavståndstillägg för ETT lass: hela påbörjade 100 m över
// grundavståndet × kr/100m × lassvolym.
export function skotAvstandKr(datum: string, korstrackaM: number, volymM3: number, avstandList: AvstandConfig[]): number {
  const cfg = avstandList.find(c => isValidOn(datum, c.giltig_fran, c.giltig_till));
  if (!cfg) return 0;
  const step = Math.max(0, Math.ceil((korstrackaM - cfg.grundavstand_m) / 100));
  return step * cfg.kr_per_100m * volymM3;
}

// G15-timmar + timpeng för en maskins fakt_tid-rader. Timpriset slås upp
// datumgiltigt per rad. timpeng === null betyder "ingen prisrad alls för
// maskinen" (RLS-tomt eller tom prislista) — skilj det från 0 kr i vyn.
// timmarUtanPris: G15-timmar som saknade datumgiltig prisrad (ingår ej i
// timpeng) — visas som varning om > 0.
export function timpengForTidRows(
  rows: { datum: string; maskin_id: string; processing_sek: number | null; terrain_sek: number | null; other_work_sek: number | null }[],
  timprisList: MaskinTimpris[],
): { timmar: number; timpeng: number | null; timmarUtanPris: number } {
  let timmar = 0;
  let timpeng = 0;
  let timmarUtanPris = 0;
  let harPrisrad = false;
  for (const r of rows) {
    const t = g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek) / 3600;
    timmar += t;
    const tp = timprisList.find(p => p.maskin_id === r.maskin_id && isValidOn(r.datum, p.giltig_fran, p.giltig_till));
    if (tp) { harPrisrad = true; timpeng += t * tp.timpris; }
    else if (timprisList.some(p => p.maskin_id === r.maskin_id)) { timmarUtanPris += t; harPrisrad = true; }
    else timmarUtanPris += t;
  }
  return { timmar, timpeng: harPrisrad ? timpeng : null, timmarUtanPris: harPrisrad ? timmarUtanPris : timmar };
}

// Brytpunkt: över detta m³/G15h ger ackordet mer än timpeng.
// vol × pris > h × timpris  ⟺  vol/h > timpris/pris.
export function brytpunktM3PerG15h(timpris: number, effektivtPrisPerM3: number): number | null {
  if (effektivtPrisPerM3 <= 0) return null;
  return timpris / effektivtPrisPerM3;
}

// Timpeng-undantag på ackordobjekt (dim_objekt.timpeng_undantag_*):
// en del av objektet körs på timpeng, med OBEROENDE timmar per maskin
// (skördaren 5,5 h, skotaren 3 h) och EN undantagsvolym som dras från
// respektive maskins ackordsvolym enligt dra-flaggorna.
// Anropas EN gång per maskin med den maskinens timmar, flagga och timpris:
//   maskinens ackord = volymEfterUndantag × pris + undantagKr
// Tomma/nollade fält -> ingen effekt (rent ackord för den maskinen).
// Volymavdraget klampas till [0, ackordVolym].
export function tillampaTimpengUndantag(
  ackordVolym: number,
  undantagTimmar: number | null | undefined,
  draVolym: boolean,
  undantagVolym: number | null | undefined,
  timpris: number | null | undefined,
): { volymEfterUndantag: number; undantagKr: number; aktivt: boolean } {
  const timmar = Number(undantagTimmar) || 0;
  const volym = draVolym ? (Number(undantagVolym) || 0) : 0;
  if (timmar <= 0 && volym <= 0) {
    return { volymEfterUndantag: ackordVolym, undantagKr: 0, aktivt: false };
  }
  return {
    volymEfterUndantag: Math.max(0, ackordVolym - Math.min(volym, ackordVolym)),
    undantagKr: timmar * (Number(timpris) || 0),
    aktivt: true,
  };
}

// ── Skotad volym med manuell korrigering ──
//
// FPR-lassen läcker: 24 avräknade objekt har dim_objekt.skotad_volym_manuell
// satt för att laga volymen (t.ex. Jeppshoka: lass 486 m³, verklig 2763).
// MOM-tiden (fakt_tid) är däremot komplett — därför fördelas den manuella
// volymen per (datum, maskin) proportionellt mot skotarens G15-sekunder på
// objektet. Finns ingen tid alls faller vi tillbaka på lass-proportion;
// finns ingetdera kan volymen inte fördelas (anroparen ska då INTE gissa —
// visa objektet som ej jämförbart/ej periodiserbart).
//
// Fördelningen kräver objektets HELA historik (alla lass- och tidrader,
// inget datumfilter) — annars dubbelräknas volymen mellan perioder.
// Periodvyer filtrerar de returnerade delarna på datum EFTERÅT.
//
// Skotningsavståndstillägget räknas fortsatt enbart ur faktiska lass —
// för korrigerade objekt är det underskattat (dämpad not i vyn, aldrig tyst).
// Etta (/ekonomi) och tvåa (/ekonomi/mot-ackord) MÅSTE båda gå via denna —
// samma objekt får aldrig visa olika skotarvolym i olika vyer.

export type SkotadVolymDel = { datum: string; maskin_id: string; volym: number };

export function fordelaSkotadVolym(
  manuellVolym: number | null | undefined,
  lassRader: { datum: string; maskin_id: string; volym_m3sub: number | null }[],
  skotarTidRader: { datum: string; maskin_id: string; processing_sek: number | null; terrain_sek: number | null; other_work_sek?: number | null }[],
): { delar: SkotadVolymDel[]; anvandeManuell: boolean; kundeInteFordela: boolean } {
  const manuell = Number(manuellVolym);
  const lassAgg = new Map<string, SkotadVolymDel>();
  let lassSum = 0;
  for (const r of lassRader) {
    const v = Number(r.volym_m3sub) || 0;
    lassSum += v;
    const key = `${r.datum}|${r.maskin_id}`;
    const d = lassAgg.get(key) || { datum: r.datum, maskin_id: r.maskin_id, volym: 0 };
    d.volym += v;
    lassAgg.set(key, d);
  }

  if (!(manuell > 0)) {
    return { delar: Array.from(lassAgg.values()), anvandeManuell: false, kundeInteFordela: false };
  }

  const tidAgg = new Map<string, { datum: string; maskin_id: string; sek: number }>();
  let tidSum = 0;
  for (const r of skotarTidRader) {
    const s = g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek);
    if (s <= 0) continue;
    tidSum += s;
    const key = `${r.datum}|${r.maskin_id}`;
    const d = tidAgg.get(key) || { datum: r.datum, maskin_id: r.maskin_id, sek: 0 };
    d.sek += s;
    tidAgg.set(key, d);
  }

  if (tidSum > 0) {
    return {
      delar: Array.from(tidAgg.values()).map(d => ({ datum: d.datum, maskin_id: d.maskin_id, volym: manuell * (d.sek / tidSum) })),
      anvandeManuell: true,
      kundeInteFordela: false,
    };
  }
  if (lassSum > 0) {
    return {
      delar: Array.from(lassAgg.values()).map(d => ({ ...d, volym: manuell * (d.volym / lassSum) })),
      anvandeManuell: true,
      kundeInteFordela: false,
    };
  }
  return { delar: [], anvandeManuell: true, kundeInteFordela: true };
}
