/**
 * BEDÖMNING I KALIBRERINGSVYN — allt som RÄKNAR ut en dom ur mätdata. Flyttat ur app/kalibrering/page.tsx (2026-10),
 * oförändrat: samma trösklar, samma avrundning, samma ordval. Vyn (components/kalibrering) färgar och ritar, den räknar inte.
 */
import type { AtgardEffekt, KravRow, MaskinInfo, ObjektStat, VariabelStat } from './typer';
import { fmtDagMan } from './datum';

// === Delad avvikelse-klassificering (mall: Trend-fliken) =====================
// EN källa för hur en diameter-/längd-avvikelse klassas i hela kalibreringsvyn.
// Returnerar SEMANTISK status — inte en färg. Vyn mappar status → ton → färg ur tokens.
//
// Trösklarna är EXAKT Trends valCls (rör inte Trend-komponenten):
//   diameter (mm): >6 röd · >4 orange · <−4 förLitet · annars ok   (tolerans ±4)
//   längd    (cm): >3 röd · >2 orange · <−2 förLitet · annars ok   (tolerans ±2)
//
// "För få kontroller"-skydd: om `antalKontroller` anges OCH understiger Trends
// tröskel (KONTROLL_TROSKEL = 10) → alltid 'ok', oavsett värde. Utelämnas
// `antalKontroller` (enskild kontroll, inte ett trend-aggregat) sker ingen
// dämpning — värdet klassas rent på tolerans.
export type AvvikelseStatus = 'ok' | 'förLitet' | 'orange' | 'röd';
export const KONTROLL_TROSKEL = 10; // = Trends TRADSLAG_TRESHOLD

export const avvikelseStatus = (opts: {
  värde: number;
  enhet: 'dia' | 'len';
  antalKontroller?: number;
}): AvvikelseStatus => {
  const { värde, enhet, antalKontroller } = opts;
  if (antalKontroller != null && antalKontroller < KONTROLL_TROSKEL) return 'ok';
  if (enhet === 'dia') {
    return värde > 6 ? 'röd' : värde > 4 ? 'orange' : värde < -4 ? 'förLitet' : 'ok';
  }
  return värde > 3 ? 'röd' : värde > 2 ? 'orange' : värde < -2 ? 'förLitet' : 'ok';
};

// Status → ton-token (det ENDA stället statusen blir en ton). Vyn äger färgen.
export type ToneToken = 'ok' | 'cold' | 'hi' | 'hot';
export const STATUS_TON: Record<AvvikelseStatus, ToneToken> = {
  ok: 'ok', förLitet: 'cold', orange: 'hi', röd: 'hot',
};
/** Bekvämlighet: värde → ton-token direkt. */
export const avvikelseTon = (
  värde: number, enhet: 'dia' | 'len', antalKontroller?: number,
): ToneToken => STATUS_TON[avvikelseStatus({ värde, enhet, antalKontroller })];
/** Rangordning när flera toner konkurrerar om en rad: värst vinner. */
export const TON_RANK: Record<ToneToken, number> = { ok: 0, cold: 1, hi: 2, hot: 3 };

// === Profilbedömning (VIDA / BIOMETRIA) ===
// Skild från avvikelseStatus ovan: den klassar ETT mått mot ±tolerans (per-
// mått-prickarnas divergerande skala, med blått för "för litet"). bedomProfil
// klassar ett AGGREGAT — träffprocent, systematik, std, grov andel — över
// 90-dagarsfönstret mot maskinens kravprofil. Sämsta metriken styr, "OK är tyst":
//   grå   = mål uppnått        (ok)
//   orange = godkänt men under mål (hi)   — bara VIDA (mål≠golv)
//   röd   = under golvet       (hot)
// Inget blått här — blått hör bara till enskilda mått.
//
// VIKTIGT: kolumnen `tolerans` i kravprofil betyder TVÅ saker beroende på metrik:
//   metrik='traffprocent'   → toleransfönster (andel INOM ±tolerans)
//   metrik='grov_avvikelse' → avvikelsegräns  (andel ÖVER tolerans)
// Läs därför alltid `metrik` först. API:t (bedomning/route.ts) räknar redan
// traffPct/grovPct utifrån detta; här läses bara färdiga värden.
export type ProfilStatus = 'ok' | 'orange' | 'röd';
export const PROFIL_TON: Record<ProfilStatus, ToneToken> = { ok: 'ok', orange: 'hi', röd: 'hot' };
export const PROFIL_RANK: Record<ProfilStatus, number> = { ok: 0, orange: 1, röd: 2 };

/** Ett mått mot en kravrad: ≥ mål är ok, under golvet är röd, däremellan orange (lag_bra spegelvänt). */
const statusMotKrav = (r: KravRow, v: number): ProfilStatus => {
  const mal = Number(r.mal), golv = Number(r.golv);
  return r.riktning === 'hog_bra'
    ? (v >= mal ? 'ok' : v < golv ? 'röd' : 'orange')
    : (v <= mal ? 'ok' : v > golv ? 'röd' : 'orange');
};

/** Värdet i en statistik som en kravrads metrik gäller. Systematiken som belopp (tecknet saknar betydelse mot kravet). */
const vardeForMetrik = (stat: VariabelStat, metrik: string): number | null => {
  switch (metrik) {
    case 'traffprocent': return stat.traffPct;
    case 'systematisk': return stat.systematisk == null ? null : Math.abs(stat.systematisk);
    case 'standardavv': return stat.standardavv;
    case 'grov_avvikelse': return stat.grovPct;
    default: return null;
  }
};

// Bedöm en variabel (diameter/längd) mot dess kravprofilrader.
// larmTyst = under min-underlag i perioden → grå (larma inte på tunt underlag).
export const bedomProfil = (
  stat: VariabelStat | null,
  variabel: 'diameter' | 'langd',
  trosklar: KravRow[],
): { status: ProfilStatus; larmTyst: boolean; detaljer: { metrik: string; status: ProfilStatus }[] } => {
  // LÄNGD bedöms ENBART på träffprocent (stocken kapas — givaren driver inte
  // gradvis som diametern). Ev. systematisk/standardavv-rader för längd (Biometria
  // har dem) ignoreras. Diameter behåller alla tre måtten.
  const rows = trosklar.filter((t) => t.variabel === variabel && (variabel === 'diameter' || t.metrik === 'traffprocent'));
  if (!stat || stat.n === 0 || rows.length === 0) return { status: 'ok', larmTyst: true, detaljer: [] };
  const traffRow = rows.find((r) => r.metrik === 'traffprocent');
  const larmMin = traffRow?.larm_min_matt ?? null;
  if (larmMin != null && stat.n < larmMin) return { status: 'ok', larmTyst: true, detaljer: [] };
  const detaljer: { metrik: string; status: ProfilStatus }[] = [];
  let värsta: ProfilStatus = 'ok';
  for (const r of rows) {
    const v = vardeForMetrik(stat, r.metrik);
    if (v == null) continue;
    const st = statusMotKrav(r, v);
    detaljer.push({ metrik: r.metrik, status: st });
    if (PROFIL_RANK[st] > PROFIL_RANK[värsta]) värsta = st;
  }
  return { status: värsta, larmTyst: false, detaljer };
};

/** Toleransbandet HÄMTAS ur maskinens kravprofil (inte hårdkodat 2/4) — annars driver band, skala och
 *  "utanför"-räkning isär nästa gång en tröskel ändras. */
export const tolFranProfil = (trosklar: KravRow[] | undefined, variabel: string, fallback: number): number => {
  const r = trosklar?.find(t => t.variabel === variabel && t.metrik === 'traffprocent');
  return r?.tolerans != null ? Number(r.tolerans) : fallback;
};

/** Trädslagsrapportens cell: träff% (huvudtal) bedömd mot kravprofilen (sämsta-styr, grind 30 här — inte larm-grindens 150).
 *  Under 30 mått: "för tunt underlag" (tunt = true), ingen status. */
export const TRADSLAG_GRIND = 30;
export const trCellBedom = (
  stat: VariabelStat, variabel: 'diameter' | 'langd', trosklar: KravRow[],
): { tunt: true } | { tunt: false; status: ProfilStatus } => {
  if (stat.n < TRADSLAG_GRIND) return { tunt: true };
  let worst: ProfilStatus = 'ok';
  for (const r of trosklar.filter(t => t.variabel === variabel && (variabel === 'diameter' || t.metrik === 'traffprocent'))) {
    const v = vardeForMetrik(stat, r.metrik);
    if (v == null) continue;
    const st = statusMotKrav(r, v);
    if (PROFIL_RANK[st] > PROFIL_RANK[worst]) worst = st;
  }
  return { tunt: false, status: worst };
};

// === "Hjälpte åtgärden?" — domen RÄKNAS UT ur mönstret (std × |syst|), gissas inte ===
// Oförändrad-trösklar: under dem är skillnaden brus, inte förändring.
export const ATG_TROSKEL_TRAFF = 2;   // procentenheter
export const ATG_TROSKEL_MM = 0.2;    // mm — systematisk (som |syst|) och standardavvikelse
export type AtgRiktning = 'battre' | 'samre' | 'oforandrad';
export type AtgRad = { fore: number | null; efter: number | null; delta: number | null; riktning: AtgRiktning };
export type AtgDom = { traff: AtgRad; syst: AtgRad; std: AtgRad; rubrik: string; tillagg: string[] };

// AVRUNDA FÖRST, diffa sedan — pilen ska gå att kontrollräkna mot de två talen
// som står bredvid (86 → 77 får inte visa "8"). decimaler: 0 för träff%, 1 för mm.
export const atgRad = (fore: number | null, efter: number | null, troskel: number, hogBra: boolean, decimaler: number, somAbs = false): AtgRad => {
  if (fore == null || efter == null) return { fore, efter, delta: null, riktning: 'oforandrad' };
  const rnd = (x: number) => Number(x.toFixed(decimaler));
  const fr = rnd(fore), er = rnd(efter);
  const f = somAbs ? Math.abs(fr) : fr;
  const e = somAbs ? Math.abs(er) : er;
  const delta = rnd(e - f);
  const riktning: AtgRiktning = Math.abs(delta) < troskel ? 'oforandrad' : (delta > 0) === hogBra ? 'battre' : 'samre';
  return { fore: fr, efter: er, delta, riktning };
};

export const atgardDom = (a: AtgardEffekt): AtgDom | null => {
  if (!a.fore || !a.efter) return null;
  const traff = atgRad(a.fore.traffPct, a.efter.traffPct, ATG_TROSKEL_TRAFF, true, 0);
  const syst = atgRad(a.fore.systematisk, a.efter.systematisk, ATG_TROSKEL_MM, false, 1, true);
  const std = atgRad(a.fore.standardavv, a.efter.standardavv, ATG_TROSKEL_MM, false, 1);
  const kalibrerad = a.kalibreringarEfter.length > 0;
  // Mönstertabellen. Med kurvjusteringar efter markören får rubriken INTE
  // tillskriva trycket något — bara beskriva vad som hände.
  let rubrik: string;
  let battre = false;
  if (std.riktning === 'samre' || syst.riktning === 'samre') {
    const vad = [std.riktning === 'samre' ? 'spridningen' : null, syst.riktning === 'samre' ? 'systematiken' : null]
      .filter(Boolean).join(' och ');
    rubrik = `Blev inte bättre — ${vad} försämrades.`;
  } else if (std.riktning === 'battre' && syst.riktning === 'oforandrad') {
    rubrik = kalibrerad ? 'Flaxandet gav sig.' : 'Flaxandet gav sig — trycket var rätt.'; battre = true;
  } else if (std.riktning === 'battre' && syst.riktning === 'battre') {
    rubrik = 'Både jämnare och rakare.'; battre = true;
  } else if (std.riktning === 'oforandrad' && syst.riktning === 'battre') {
    rubrik = 'Går rakare men flaxar lika mycket.'; battre = true;
  } else {
    rubrik = 'Ingen mätbar skillnad ännu.';
  }
  const tillagg: string[] = [];
  if (traff.riktning === 'battre') tillagg.push('Träffen följde efter.');
  else if (traff.riktning === 'samre') tillagg.push('Träffen sjönk.');
  if (kalibrerad) {
    const d = a.kalibreringarEfter.map(fmtDagMan).join(', ');
    tillagg.push(battre
      ? `Men kurvan kalibrerades också ${d} — det går inte att säga vad som hjälpte.`
      : `Kurvan kalibrerades också ${d}.`);
  }
  return { traff, syst, std, rubrik, tillagg };
};

// === Objekt-dom — via bedomProfil mot objektets MASKINPROFIL (VIDA/BIOMETRIA), inget
// hårdkodat 85/3,5. Mjuk underlagsgrind (beslutad när Objekt byggdes):
//   < 50 mätpunkter  → för tunt underlag, ingen dom
//   50–100           → dom, men märkt "bygger på få mätningar"
//   > 100            → full dom
// Profilens larm-grind (150, för maskinen som helhet) gäller inte ett objekt — den
// stryps bort innan bedömningen. "Under kravet" = under GOLVET (röd); orange = under
// målet men godkänt, samma betydelse som i Så ligger du till.
export const OBJEKT_GRIND_TUNT = 50;
export const OBJEKT_GRIND_FULL = 100;
export type ObjektGrupp = 'under' | 'godkand' | 'tunt';
export type ObjektBedomning = { grupp: ObjektGrupp; status: ProfilStatus | null; faMatningar: boolean; ingenProfil: boolean };

export const objektBedom = (o: ObjektStat, mask: MaskinInfo | undefined): ObjektBedomning => {
  const faMatningar = o.n >= OBJEKT_GRIND_TUNT && o.n <= OBJEKT_GRIND_FULL;
  if (o.n < OBJEKT_GRIND_TUNT) return { grupp: 'tunt', status: null, faMatningar: false, ingenProfil: false };
  const rows = (mask?.trosklar ?? []).filter(t => t.variabel === 'diameter');
  if (rows.length === 0) return { grupp: 'tunt', status: null, faMatningar, ingenProfil: true };
  const stat: VariabelStat = { n: o.n, traffPct: o.traffPct, systematisk: o.systematisk, standardavv: o.standardavv, grovPct: o.grovPct, tolerans: null, grovTolerans: null };
  const bed = bedomProfil(stat, 'diameter', rows.map(t => ({ ...t, larm_min_matt: null })));
  return { grupp: bed.status === 'röd' ? 'under' : 'godkand', status: bed.status, faMatningar, ingenProfil: false };
};

export type ObjektDom = { ton: ToneToken; rubrik: string; attribution: string | null; reservation: string | null; tunn: boolean };
export const objektDom = (o: ObjektStat, mask: MaskinInfo | undefined): ObjektDom => {
  const b = objektBedom(o, mask);
  if (b.grupp === 'tunt') {
    return b.ingenProfil
      ? { ton: 'ok', rubrik: `${o.object_name}: ingen kravprofil för maskinen`, attribution: 'Maskinen saknar kravprofil — ingen dom går att ställa.', reservation: null, tunn: true }
      : { ton: 'ok', rubrik: `${o.object_name}: för tunt underlag`, attribution: `Bara ${o.n} mätpunkter — för få för en dom.`, reservation: null, tunn: true };
  }
  const golv = mask?.golvDia ?? 75;
  let ton: ToneToken; let ord: string;
  if (b.status === 'röd') { ton = 'hot'; ord = 'höll inte måttet'; }
  else if (b.status === 'ok') { ton = 'ok'; ord = 'var mycket bra'; }
  else { ton = 'ok'; ord = 'var godkänd'; }
  let attribution: string | null = null;
  if (b.status === 'röd' && mask?.traffPctTotal != null) {
    attribution = mask.traffPctTotal < golv
      ? 'Maskinen låg under kravet totalt den perioden — det var maskinen, inte trakten.'
      : 'Maskinen mätte bra i övrigt — avvikelsen är knuten till den här trakten.';
  }
  const reservation = b.faMatningar ? `Bygger på få mätningar (${o.n}) — läs domen med reservation.` : null;
  return { ton, rubrik: `Mätningen på ${o.object_name} ${ord}`, attribution, reservation, tunn: false };
};

// Visning, inte data: ett objekt som bara heter "Förnamn Efternamn" saknar traktnamn.
// Exakt två ord, inledande versal + gemener (bindestreck ok), inga siffror/koder.
export const objektSaknarNamn = (namn: string): boolean =>
  /^[A-ZÅÄÖ][a-zåäöé]+(-[A-ZÅÄÖ][a-zåäöé]+)? [A-ZÅÄÖ][a-zåäöé]+(-[A-ZÅÄÖ][a-zåäöé]+)?$/.test(namn.trim());
