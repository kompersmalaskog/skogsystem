'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { KontrollResponse, StockRow, StamRow } from "@/app/api/kalibrering/kontroll/route";
import PageContainer from '@/components/PageContainer';
import { MATT, AVVIKELSE, maskinNamn, maskinKortNamn } from '@/lib/kalibrering/ordlista';
import { dec, fmtAvvikelse, fmtTal, fmtKrav, fmtSig1, fmtAbs1, fmtAntal } from '@/lib/kalibrering/format';

// === TYPES (matching actual Supabase tables) ===
interface FaktKalibrering {
  id: number;
  datum: string;
  maskin_id: string;
  operator_id: string | null;
  tradslag: string;
  antal_kontrollstammar: number;
  antal_kontrollstockar: number;
  langd_avvikelse_snitt_cm: number;
  langd_avvikelse_min_cm: number;
  langd_avvikelse_max_cm: number;
  dia_avvikelse_snitt_mm: number;
  dia_avvikelse_min_mm: number;
  dia_avvikelse_max_mm: number;
  status: string;
  filnamn: string;
  skapad_tid: string;
  object_name?: string | null;
}

interface DetaljKontrollStock {
  id: number;
  maskin_id: string;
  kontroll_datum: string;
  stam_nummer: number;
  stock_nummer: number;
  maskin_langd_cm: number;
  maskin_toppdia_mm: number;
  operator_langd_cm: number;
  operator_toppdia_mm: number;
  langd_avvikelse_cm: number;
  dia_avvikelse_mm: number;
  filnamn: string;
  skapad_tid: string;
  maskin_volym_sub: number | null;
  operator_volym_sub: number | null;
  volym_avvikelse: number | null;
  latitude: number | null;
  longitude: number | null;
  objekt_id: string | null;
  // Mätpunkter längs stocken (ControlLogDiameter). Toppdiametern ovan är
  // EN punkt vid kapsnittet — dessa är de övriga, och alla ingår i
  // diameterstatistiken (lib/kalibrering/diameterpunkter).
  matpunkter?: { position_cm: number; diameter_maskin_mm: number | null; diameter_operator_mm: number | null }[] | null;
}

// Senaste-kortets stockar: hela raden + mätpunkterna längs stocken, så
// stock-modalen kan visa att toppen bara är ETT av flera diametermått.
const STOCK_SELECT =
  '*, matpunkter:detalj_kontroll_stock_matpunkt(position_cm,diameter_maskin_mm,diameter_operator_mm)';

interface KalibHistorik {
  id: number;
  datum: string;
  maskin_id: string;
  operator_id: string | null;
  tradslag: string;
  orsak: string;
  beskrivning: string;
  langd_justering_mm: number | null;
  dia_justering_mm: number | null;
  position_cm: number | null;
  filnamn: string;
  skapad_tid: string;
  typ: string;
}

const MSym = ({ name, size = 18, color }: { name: string; size?: number; color?: string }) => (
  <span
    className="material-symbols-outlined"
    aria-hidden="true"
    style={{ fontSize: size, lineHeight: 1, color, fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
  >
    {name}
  </span>
);

const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

// Talformat (komma som decimaltecken) bor i lib/kalibrering/format — en källa.

// Pluralis: 1 = singular, 2+ = plural. "1 stock" / "2 stockar".
const antalText = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;
const stockText = (n: number) => antalText(n, 'stock', 'stockar');
const stamText = (n: number) => antalText(n, 'stam', 'stammar');

// === Delad avvikelse-klassificering (mall: Trend-fliken) =====================
// EN källa för hur en diameter-/längd-avvikelse klassas i hela kalibreringsvyn.
// Returnerar SEMANTISK status — inte en färg. Temat mappar status → ton-token,
// och CSS mappar ton-token → hex (på ett ställe per element).
//
// Trösklarna är EXAKT Trends valCls (rör inte Trend-komponenten):
//   diameter (mm): >6 röd · >4 orange · <−4 förLitet · annars ok   (tolerans ±4)
//   längd    (cm): >3 röd · >2 orange · <−2 förLitet · annars ok   (tolerans ±2)
//
// "För få kontroller"-skydd: om `antalKontroller` anges OCH understiger Trends
// tröskel (KONTROLL_TROSKEL = 10) → alltid 'ok', oavsett värde. Utelämnas
// `antalKontroller` (enskild kontroll, inte ett trend-aggregat) sker ingen
// dämpning — värdet klassas rent på tolerans.
type AvvikelseStatus = 'ok' | 'förLitet' | 'orange' | 'röd';
const KONTROLL_TROSKEL = 10; // = Trends TRADSLAG_TRESHOLD

const avvikelseStatus = (opts: {
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

// Status → befintlig ton-token (det ENDA stället statusen blir en tema-token).
// CSS-klasserna .tone-ok/.cold/.hi/.hot äger själva hex-värdet.
type ToneToken = 'ok' | 'cold' | 'hi' | 'hot';
const STATUS_TON: Record<AvvikelseStatus, ToneToken> = {
  ok: 'ok', förLitet: 'cold', orange: 'hi', röd: 'hot',
};
// Bekvämlighet för className-bruk: värde → ton-token direkt.
const avvikelseTon = (
  värde: number, enhet: 'dia' | 'len', antalKontroller?: number,
): ToneToken => STATUS_TON[avvikelseStatus({ värde, enhet, antalKontroller })];

// === Profilbedömning (VIDA / BIOMETRIA) ===
// Skild från avvikelseStatus ovan: den klassar ETT mått mot ±tolerans (per-
// mått-prickarnas divergerande skala, med blått för "för litet"). bedomProfil
// klassar ett AGGREGAT — träffprocent, systematik, std, grov andel — över
// 90-dagarsfönstret mot maskinens kravprofil. Sämsta metriken styr, "OK är tyst":
//   grå   = mål uppnått        (tone-ok)
//   orange = godkänt men under mål (tone-hi)   — bara VIDA (mål≠golv)
//   röd   = under golvet       (tone-hot)
// Inget blått här — blått hör bara till enskilda mått.
//
// VIKTIGT: kolumnen `tolerans` i kravprofil betyder TVÅ saker beroende på metrik:
//   metrik='traffprocent'   → toleransfönster (andel INOM ±tolerans)
//   metrik='grov_avvikelse' → avvikelsegräns  (andel ÖVER tolerans)
// Läs därför alltid `metrik` först. API:t (bedomning/route.ts) räknar redan
// traffPct/grovPct utifrån detta; här läses bara färdiga värden.
type ProfilStatus = 'ok' | 'orange' | 'röd';
const PROFIL_TON: Record<ProfilStatus, ToneToken> = { ok: 'ok', orange: 'hi', röd: 'hot' };
const PROFIL_RANK: Record<ProfilStatus, number> = { ok: 0, orange: 1, röd: 2 };

type KravRow = {
  variabel: string; metrik: string; riktning: string;
  tolerans: number | null; mal: number; golv: number; enhet: string; larm_min_matt: number | null;
};
type VariabelStat = {
  n: number; traffPct: number | null; systematisk: number | null;
  standardavv: number | null; grovPct: number | null; tolerans: number | null; grovTolerans: number | null;
};
// "Hjälpte åtgärden?" — före/efter senaste förar-markören (speglar AtgardEffekt i
// bedomning/route.ts). fore/efter är null under grinden (30 mått per sida).
type AtgardEffekt = {
  datum: string; text: string;
  fore: VariabelStat | null; efter: VariabelStat | null;
  forTidigt: boolean; nFore: number; nEfter: number;
  kalibreringarEfter: string[];
};
type BedomningResp = {
  ok: true; maskin_id: string; profil: string | null;
  fonster: { fran: string; till: string; dagar: number } | null;
  diameter: VariabelStat | null; langd: VariabelStat | null; trosklar: KravRow[];
  atgard?: AtgardEffekt | null;
};

// Bedöm en variabel (diameter/längd) mot dess kravprofilrader.
// larmTyst = under min-underlag i perioden → grå (larma inte på tunt underlag).
const bedomProfil = (
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
  const värdeFor = (metrik: string): number | null => {
    switch (metrik) {
      case 'traffprocent': return stat.traffPct;
      case 'systematisk': return stat.systematisk == null ? null : Math.abs(stat.systematisk);
      case 'standardavv': return stat.standardavv;
      case 'grov_avvikelse': return stat.grovPct;
      default: return null;
    }
  };
  const detaljer: { metrik: string; status: ProfilStatus }[] = [];
  let värsta: ProfilStatus = 'ok';
  for (const r of rows) {
    const v = värdeFor(r.metrik);
    if (v == null) continue;
    const mal = Number(r.mal), golv = Number(r.golv);
    const st: ProfilStatus = r.riktning === 'hog_bra'
      ? (v >= mal ? 'ok' : v < golv ? 'röd' : 'orange')
      : (v <= mal ? 'ok' : v > golv ? 'röd' : 'orange');
    detaljer.push({ metrik: r.metrik, status: st });
    if (PROFIL_RANK[st] > PROFIL_RANK[värsta]) värsta = st;
  }
  return { status: värsta, larmTyst: false, detaljer };
};

// === "Hjälpte åtgärden?" — domen RÄKNAS UT ur mönstret (std × |syst|), gissas inte ===
// Oförändrad-trösklar: under dem är skillnaden brus, inte förändring.
const ATG_TROSKEL_TRAFF = 2;   // procentenheter
const ATG_TROSKEL_MM = 0.2;    // mm — systematisk (som |syst|) och standardavvikelse
type AtgRiktning = 'battre' | 'samre' | 'oforandrad';
type AtgRad = { fore: number | null; efter: number | null; delta: number | null; riktning: AtgRiktning };
type AtgDom = { traff: AtgRad; syst: AtgRad; std: AtgRad; rubrik: string; tillagg: string[] };

// AVRUNDA FÖRST, diffa sedan — pilen ska gå att kontrollräkna mot de två talen
// som står bredvid (86 → 77 får inte visa "8"). decimaler: 0 för träff%, 1 för mm.
const atgRad = (fore: number | null, efter: number | null, troskel: number, hogBra: boolean, decimaler: number, somAbs = false): AtgRad => {
  if (fore == null || efter == null) return { fore, efter, delta: null, riktning: 'oforandrad' };
  const rnd = (x: number) => Number(x.toFixed(decimaler));
  const fr = rnd(fore), er = rnd(efter);
  const f = somAbs ? Math.abs(fr) : fr;
  const e = somAbs ? Math.abs(er) : er;
  const delta = rnd(e - f);
  const riktning: AtgRiktning = Math.abs(delta) < troskel ? 'oforandrad' : (delta > 0) === hogBra ? 'battre' : 'samre';
  return { fore: fr, efter: er, delta, riktning };
};
const fmtDagMan = (iso: string): string =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '');

const atgardDom = (a: AtgardEffekt): AtgDom | null => {
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

// === Diagnos-motorn: rådata (per diameterklass) → ETT av tre fel + åtgärdstext ===
// Skild från bedomProfil (som ger profil-verdikt per variabel). diagnos() svarar
// på "vad ska föraren göra", inte "hur bra mäter maskinen".
//
// PRINCIP: diagnos ställs BARA på klasser som underpresterar (träff% under
// profilens golv). En klass över golvet är bra oavsett vad tecknen gör — appen
// ska vara tyst när den inte har något att säga.
//   Kurva:   underpresterande klass, systematik KONSEKVENT (samma tecken) → kontakta tekniker
//   Tryck:   underpresterande klass, systematik VÄXLAR TECKEN → höj matartrycket
//   Slitage: tryck-signatur MEN planområden sjönk inte efter en förar-markör → verkstad
type DiagKlass = {
  klass: string; min: number; max: number; n: number;
  traffPct: number | null;
  standardavv: number | null; // spridning i 90-dagarsfönstret ("Flaxar den?")
  systMonthly: { manad: string; systematik: number; n: number }[];
  plateauShare: number | null; plateauN: number;
  // Trend "Läget" — hela historiken per månad.
  traffMonthly: { manad: string; traffPct: number; n: number }[];
  plateauMonthly: { manad: string; share: number; n: number }[];
  // "Flaxar den?" — RÅA summor per månad; std aggregeras exakt per period
  // (std är inte viktbart som träff%: √(Σsumsq/Σn − (Σsum/Σn)²)).
  spridMonthly: { manad: string; n: number; sum: number; sumsq: number }[];
};
type DiagMarkor = { datum: string; kalla: 'reparation' | 'kalibrering' | 'atgard'; text: string };
type DiagnosResp = {
  ok: true; maskin_id: string; profil: string | null; golvDia: number | null;
  fonster: { fran: string; till: string; dagar: number } | null;
  klasser: DiagKlass[];
  plateauMonthly: { manad: string; share: number; n: number }[];
  markorer: DiagMarkor[];
};
type DiagFel = 'kurva' | 'tryck' | 'slitage';
type DiagnosVerdikt = {
  status: 'bra' | 'tendens' | 'diagnos';
  fel: DiagFel | null;
  klass: DiagKlass | null;
  bandZon: number | null; // 0 = rot/grov … 4 = topp/klen. null = inget band.
  mening1: string; mening2: string; mening3?: string; // mening3 = dämpad avvägning
};

const GRIND_MIN = 30;      // < 30 mätpunkter i en klass → ingen bedömning alls
const GRIND_ATGARD = 100;  // ≥ 100 → åtgärd; 30–100 → tendens utan åtgärd
const BAND_ORDNING = ['300+', '250-299', '200-249', '150-199', '<150']; // rot → topp

// Tidssteg för Trend "Läget" — grova klasser (25-55 mått/månad) blir brus per
// månad men signal per kvartal (300+ Q1 = 386 mått). Default kvartal så grova
// kan visas solida. Aggregeringen är VIKTAD på n (= sann period-träffprocent).
type LagetSteg = 'manad' | 'kvartal' | 'ar';
const periodKey = (manad: string, steg: LagetSteg): string => {
  const y = manad.slice(0, 4);
  const m = Number(manad.slice(5, 7));
  if (steg === 'ar') return y;
  if (steg === 'kvartal') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return manad;
};
const fmtPeriod = (key: string, steg: LagetSteg): string => {
  if (steg === 'ar') return key;
  if (steg === 'kvartal') { const [y, q] = key.split('-'); return `${q} ’${y.slice(2)}`; }
  return `${key.slice(5, 7)}/${key.slice(2, 4)}`;
};
const aggregeraSteg = (
  monthly: { manad: string; v: number; n: number }[],
  steg: LagetSteg,
): Map<string, { v: number; n: number }> => {
  const b = new Map<string, { vs: number; n: number }>();
  for (const m of monthly) {
    const k = periodKey(m.manad, steg);
    const cur = b.get(k) ?? { vs: 0, n: 0 };
    cur.vs += m.v * m.n; cur.n += m.n; b.set(k, cur);
  }
  return new Map(Array.from(b, ([k, c]) => [k, { v: c.n > 0 ? c.vs / c.n : 0, n: c.n }]));
};

// Spridning (std) per period — aggregeras EXAKT ur råa summor. std är INTE
// viktbart som träffprocent; att medelvärda månads-std vore fel.
//   std = √(Σsumsq/Σn − (Σsum/Σn)²)
const aggregeraSprid = (
  monthly: { manad: string; n: number; sum: number; sumsq: number }[],
  steg: LagetSteg,
): Map<string, { v: number; n: number }> => {
  const b = new Map<string, { n: number; sum: number; sumsq: number }>();
  for (const m of monthly) {
    const k = periodKey(m.manad, steg);
    const cur = b.get(k) ?? { n: 0, sum: 0, sumsq: 0 };
    cur.n += m.n; cur.sum += m.sum; cur.sumsq += m.sumsq; b.set(k, cur);
  }
  return new Map(Array.from(b, ([k, c]) => {
    const mean = c.n > 0 ? c.sum / c.n : 0;
    const varians = c.n > 0 ? Math.max(0, c.sumsq / c.n - mean * mean) : 0;
    return [k, { v: Math.sqrt(varians), n: c.n }];
  }));
};

const klassGrovlek = (klass: string): string =>
  klass === '300+' ? 'grova bitar' : klass === '<150' ? 'klena bitar' : `${klass} mm-bitar`;

const diagnos = (resp: DiagnosResp | null): DiagnosVerdikt => {
  const bra: DiagnosVerdikt = { status: 'bra', fel: null, klass: null, bandZon: null, mening1: 'Maskinen mäter bra.', mening2: 'Inget att åtgärda.' };
  if (!resp || resp.golvDia == null || resp.klasser.length === 0) return bra;
  const golv = resp.golvDia;
  // Underpresterande klasser med tillräckligt underlag (grind: <30 = tyst).
  const under = resp.klasser.filter(k => k.traffPct != null && k.traffPct < golv && k.n >= GRIND_MIN);
  if (under.length === 0) return bra;
  const värsta = under.reduce((a, b) => ((b.traffPct as number) < (a.traffPct as number) ? b : a));
  const zon = BAND_ORDNING.indexOf(värsta.klass);
  const bandZon = zon >= 0 ? zon : null;
  // 30–100 mätpunkter → tendens, ingen åtgärd (en felskruvning gör maskinen sämre).
  if (värsta.n < GRIND_ATGARD) {
    return { status: 'tendens', fel: null, klass: värsta, bandZon,
      mening1: `Ser ut att brista på ${klassGrovlek(värsta.klass)}.`,
      mening2: 'Ta fler kontrollstammar på grova träd innan du justerar.' };
  }
  // Teckenanalys — bara månader med n ≥ 20 (glesa månader är brus).
  const mån = värsta.systMonthly.filter(m => m.n >= 20);
  const tecken = new Set(mån.filter(m => Math.abs(m.systematik) >= 0.05).map(m => Math.sign(m.systematik)));
  const konsekvent = tecken.size <= 1;
  let fel: DiagFel = konsekvent ? 'kurva' : 'tryck';
  // Slitage-eskalering: tryck + en förar-markör + planområden sjönk INTE efter den.
  if (fel === 'tryck') {
    const atg = resp.markorer.filter(m => m.kalla === 'atgard').sort((a, b) => a.datum.localeCompare(b.datum)).pop();
    if (atg) {
      const mn = atg.datum.slice(0, 7);
      const snitt = (arr: { share: number }[]) => (arr.length ? arr.reduce((s, x) => s + x.share, 0) / arr.length : null);
      const fore = snitt(resp.plateauMonthly.filter(p => p.manad < mn));
      const efter = snitt(resp.plateauMonthly.filter(p => p.manad >= mn));
      if (fore != null && efter != null && efter >= fore - 5) fel = 'slitage';
    }
  }
  const g = klassGrovlek(värsta.klass);
  // Tryck är en AVVÄGNING, inte en gratis fix — mening3 dämpar. Appen ger
  // underlaget, föraren fattar beslutet.
  const copy: Record<DiagFel, { m1: string; m2: string; m3?: string }> = {
    tryck: {
      m1: `Maskinen mäter ostadigt på ${g}.`,
      m2: 'Greppet räcker inte — höj trycket på knivar eller matarhjul.',
      m3: 'Men känn efter: går det för trögt kostar det bränsle och produktion.',
    },
    kurva: { m1: `Maskinen mäter fel storlek på ${g}.`, m2: 'Diameterkurvan behöver ses över — kontakta tekniker.' },
    slitage: { m1: 'Greppet brister trots höjt tryck.', m2: 'Byt matarvalsar/slitdelar — verkstad.' },
  };
  return { status: 'diagnos', fel, klass: värsta, bandZon, mening1: copy[fel].m1, mening2: copy[fel].m2, mening3: copy[fel].m3 };
};

// === "Flaxar den?" — slutsatsen RÄKNAS UT, gissas inte (håller efter fälttest) ===
//   std ökar med grovleken            → höj trycket
//   ungefär lika överallt / ökar över tid → kontrollera givare/bussningar
//   rak linje (lågt syst) men taggig  → tillägg: det är inte kalibrering
const FLAX_GRADIENT = 1.0; // mm skillnad klenaste→grövsta klass = "värst på grova"
const FLAX_TREND = 0.5;    // mm ökning första→sista halvan = "ökar över tid"
type FlaxSlutsats = { status: 'tyst' | 'jamn' | 'flaxar'; rubrik: string; atgard: string | null; tillagg: string | null };

// Systematik i fönstret per klass — n-viktat medel av systMonthly (systematik ÄR viktbart).
const systWin = (k: DiagKlass): number | null => {
  const tot = k.systMonthly.reduce((a, m) => a + m.n, 0);
  if (!tot) return null;
  return k.systMonthly.reduce((a, m) => a + m.systematik * m.n, 0) / tot;
};
// Stiger spridningen över tid? Jämför std första halvan mot sista halvan av månaderna.
const spridStiger = (k: DiagKlass): boolean => {
  const mm = k.spridMonthly.filter(m => m.n >= GRIND_MIN);
  if (mm.length < 2) return false;
  const halv = Math.floor(mm.length / 2);
  const std = (arr: typeof mm) => {
    const n = arr.reduce((a, m) => a + m.n, 0);
    if (!n) return null;
    const mean = arr.reduce((a, m) => a + m.sum, 0) / n;
    return Math.sqrt(Math.max(0, arr.reduce((a, m) => a + m.sumsq, 0) / n - mean * mean));
  };
  const f = std(mm.slice(0, halv)), s = std(mm.slice(halv));
  return f != null && s != null && s - f >= FLAX_TREND;
};

const flaxSlutsats = (klasser: DiagKlass[], stdGolv: number | null, systMal: number | null): FlaxSlutsats => {
  const med = klasser.filter(k => k.n >= GRIND_MIN && k.standardavv != null);
  if (med.length === 0 || stdGolv == null) {
    return { status: 'tyst', rubrik: 'För tunt underlag för en bedömning.', atgard: null, tillagg: null };
  }
  const over = med.filter(k => (k.standardavv as number) > stdGolv);
  if (over.length === 0) {
    return { status: 'jamn', rubrik: 'Maskinen mäter jämnt.', atgard: 'Inget att åtgärda.', tillagg: null };
  }
  const ordn = ['<150', '150-199', '200-249', '250-299', '300+'];
  const sorted = med.slice().sort((a, b) => ordn.indexOf(a.klass) - ordn.indexOf(b.klass));
  const varsta = over.reduce((a, b) => ((b.standardavv as number) > (a.standardavv as number) ? b : a));

  // Rak men taggig → kalibrering är inte svaret (oberoende av grovlek).
  let tillagg: string | null = null;
  const sw = systWin(varsta);
  if (sw != null && systMal != null && Math.abs(sw) < systMal) {
    tillagg = 'Linjen är rak men taggig — det är inte kalibrering. Kalibrering rätar inte en taggig linje.';
  }

  // Finns GROVA klasser med underlag? En gallringsmaskin saknar dem helt. Utan
  // grova går grovt-mot-klent-jämförelsen inte att göra — då får vi INTE gissa
  // "lika överallt → givare" på två klena klasser. Säg bara vad som finns.
  const harGrova = med.some(k => k.min >= 250);
  if (!harGrova) {
    const n = over.map(k => klassGrovlek(k.klass));
    const namn = n.length <= 1 ? n[0] : `${n.slice(0, -1).join(', ')} och ${n[n.length - 1]}`;
    return {
      status: 'flaxar',
      rubrik: `Spridningen ligger över kravet på ${namn}.`,
      atgard: 'Underlaget saknar grova stammar — utan dem går tryck inte att skilja från givarfel.',
      tillagg,
    };
  }

  const klenast = sorted[0].standardavv as number;
  const grovast = sorted[sorted.length - 1].standardavv as number;
  let rubrik: string, atgard: string;
  if (grovast - klenast >= FLAX_GRADIENT) {
    rubrik = `Flaxar värst på ${klassGrovlek(sorted[sorted.length - 1].klass)} — spridningen växer med grovleken.`;
    atgard = 'Greppet räcker inte — höj trycket på knivar eller matarhjul. Men känn efter: går det för trögt kostar det bränsle och produktion.';
  } else {
    const stiger = spridStiger(varsta);
    rubrik = stiger ? 'Flaxar ungefär lika överallt, och spridningen ökar över tid.' : 'Flaxar ungefär lika överallt.';
    atgard = 'Kontrollera givare och bussningar.';
  }
  return { status: 'flaxar', rubrik, atgard, tillagg };
};

// iOS-mönster: dra ner på modalen för att stänga. Hela modalen är dragbar
// från övre 200px (handle + header). Resten behåller scroll. Hooken returnerar
// refs och touch-handlers att fästa på overlay + modal-element.
function useSwipeDownToClose(onClose: () => void) {
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touchY = e.touches[0].clientY;
    // Endast övre 200px av modalen triggar swipe — resten är scrollyta
    if (touchY - rect.top > 200) return;
    startYRef.current = touchY;
    startTimeRef.current = Date.now();
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current == null) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (deltaY <= 0) return;
    if (modalRef.current) {
      modalRef.current.style.transition = 'none';
      modalRef.current.style.transform = `translateY(${deltaY}px)`;
    }
    if (overlayRef.current) {
      const opacity = Math.max(0.3, 1 - deltaY / 400);
      overlayRef.current.style.opacity = String(opacity);
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current == null) return;
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - startYRef.current;
    const duration = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = deltaY / duration;
    startYRef.current = null;

    const modal = modalRef.current;
    const overlay = overlayRef.current;

    if (deltaY > 100 || velocity > 0.5) {
      // Stäng — animera först ut, sedan unmount via state
      if (modal) {
        modal.style.transition = 'transform 0.25s cubic-bezier(0.2,0.8,0.2,1)';
        modal.style.transform = 'translateY(100%)';
      }
      if (overlay) {
        overlay.style.transition = 'opacity 0.25s';
        overlay.style.opacity = '0';
      }
      setTimeout(() => {
        onClose();
        if (modal) { modal.style.transform = ''; modal.style.transition = ''; }
        if (overlay) { overlay.style.opacity = ''; overlay.style.transition = ''; }
      }, 250);
    } else {
      // Snap tillbaka — låt CSS-transition fortsätta
      if (modal) {
        modal.style.transition = 'transform 0.2s cubic-bezier(0.2,0.8,0.2,1)';
        modal.style.transform = '';
        setTimeout(() => { if (modal) modal.style.transition = ''; }, 200);
      }
      if (overlay) {
        overlay.style.transition = 'opacity 0.2s';
        overlay.style.opacity = '';
        setTimeout(() => { if (overlay) overlay.style.transition = ''; }, 200);
      }
    }
  };

  return { modalRef, overlayRef, onTouchStart, onTouchMove, onTouchEnd };
}

// === Kalender-types som matchar /api/kalibrering/kalender response ===
type CalDagstatus = 'komplett' | 'saknas' | 'varning' | 'inaktiv';
type CalKontroll = { id: number; tradslag: string | null; status: string; filnamn: string | null };
type CalMaskin = {
  maskin_id: string;
  tillverkare: string | null;
  modell: string | null;
  status: CalDagstatus;
  volym_m3sub: number;
  huvudtyp: string | null;
  huvudtyp_okand: boolean;
  trosklar: { min_volym_m3sub: number };
  kontroller: CalKontroll[];
};

// maskinNamn / maskinKortNamn bor i lib/kalibrering/ordlista — id:t visas aldrig.
type CalDag = { datum: string; veckodag: number; status: CalDagstatus; maskiner: CalMaskin[] };
type CalSammanfattning = { produktionsdagar: number; kompletta: number; saknas: number; varningar: number; okand_huvudtyp_dagar: number };
type CalResponse = { manad: string; dagar: CalDag[]; sammanfattning: CalSammanfattning };

const padNum = (n: number) => String(n).padStart(2, '0');
const idagManad = () => { const d = new Date(); return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}`; };
const idagStr = () => { const d = new Date(); return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}`; };
const manadNamn = (manad: string) => {
  const [y, m] = manad.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const stegManad = (manad: string, delta: number) => {
  const [y, m] = manad.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}`;
};
const dagrubrik = (datum: string) => {
  const d = new Date(datum + 'T00:00:00');
  const s = d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dagstatusText = (s: CalDagstatus): string => {
  if (s === 'komplett') return 'Inom tolerans';
  if (s === 'saknas') return 'Saknad kontrollstam';
  if (s === 'varning') return 'Varning från kontroll';
  return 'Inaktiv';
};
const maskinStatusText = (s: CalDagstatus): string => {
  if (s === 'komplett') return 'Kontroll lämnad';
  if (s === 'saknas') return 'Saknas';
  if (s === 'varning') return 'Varning';
  return 'Inaktiv';
};
const kontrollStatusText = (s: string) => {
  if (s === 'OK') return 'OK';
  if (s === 'VARNING') return 'Varning';
  if (s === 'FEL') return 'Fel';
  return s;
};

export default function KalibreringPage() {
  const [activeTab, setActiveTab] = useState<'today' | 'trend' | 'objekt' | 'calendar' | 'report'>('today');
  type ModalEntry = { title: string; subtitle: string; body: React.ReactNode; parentLabel?: string };
  const [modalStack, setModalStack] = useState<ModalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const pushModal = (entry: Omit<ModalEntry, 'parentLabel'>) => {
    setModalStack(prev => prev.length === 0
      ? [entry]
      : [...prev, { ...entry, parentLabel: prev[prev.length - 1].title }]
    );
  };
  const popModal = () => setModalStack(prev => prev.slice(0, -1));
  const closeModal = () => setModalStack([]);

  const swipeMain = useSwipeDownToClose(closeModal);

  const [allKalib, setAllKalib] = useState<FaktKalibrering[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, DetaljKontrollStock[]>>({});
  const [historik, setHistorik] = useState<KalibHistorik[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  // Apple-kontrollmodal: filnamn som hämtas just nu, eller null
  const [laddarKontroll, setLaddarKontroll] = useState<string | null>(null);

  // === Kalender-fliken: egen state + lazy fetch på tab-byte/manad-byte ===
  const [calManad, setCalManad] = useState<string>(idagManad);
  const [calData, setCalData] = useState<CalResponse | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);


  // Globalt maskinfilter — persistent över flikar
  const [selectedMaskinId, setSelectedMaskinId] = useState<string | 'all'>('all');
  const [alleMaskiner, setAlleMaskiner] = useState<{ maskin_id: string; tillverkare: string | null; modell: string | null; aktiv_till: string | null }[]>([]);
  const [maskinSheetOpen, setMaskinSheetOpen] = useState(false);
  const [maskinSearchQ, setMaskinSearchQ] = useState('');

  // Profilbedömning per maskin (90-dagarsfönster) — cachas per maskin_id.
  const [bedomningMap, setBedomningMap] = useState<Record<string, BedomningResp>>({});
  // Diagnos-underlag per maskin (klasser, planområden, markörer).
  const [diagnosMap, setDiagnosMap] = useState<Record<string, DiagnosResp>>({});
  const [visaSiffror, setVisaSiffror] = useState(false); // Senaste-fliken: förarvy ↔ siffror
  // Objekt-fliken (maskinoberoende)
  type ObjektStat = { object_name: string; maskin_id: string | null; n: number; traffPct: number; systematisk: number; standardavv: number; grovPct: number | null; fran: string; till: string };
  type MaskinInfo = { profil: string | null; golvDia: number | null; traffPctTotal: number | null; n: number; trosklar: KravRow[] };
  const [objektData, setObjektData] = useState<{ objekt: ObjektStat[]; maskiner: Record<string, MaskinInfo> } | null>(null);
  const [objektQ, setObjektQ] = useState('');
  const [valtObjekt, setValtObjekt] = useState<string | null>(null);
  // Listans hopfällningar: "För tunt underlag" stängd som standard, "Visa äldre" per grupp.
  const [objektVisaTunt, setObjektVisaTunt] = useState(false);
  const [objektVisaAldre, setObjektVisaAldre] = useState<Record<string, boolean>>({});
  const [hjalpOpen, setHjalpOpen] = useState(false); // "?"-hjälptexten
  const [lagetSteg, setLagetSteg] = useState<LagetSteg>('kvartal'); // Läget: tidssteg (default kvartal → grova solida)
  // Rapport per-trädslag (per maskin, all-time) — träff%/syst/std mot maskinens profil.
  type TradslagStat = { tradslag: string; diameter: VariabelStat; langd: VariabelStat };
  const [tradslagMap, setTradslagMap] = useState<Record<string, { profil: string | null; trosklar: KravRow[]; tradslag: TradslagStat[] }>>({});
  const [nyMarkorDatum, setNyMarkorDatum] = useState('');
  const [nyMarkorText, setNyMarkorText] = useState('');
  const [markorSparar, setMarkorSparar] = useState(false);
  const swipeSheet = useSwipeDownToClose(() => setMaskinSheetOpen(false));

  // Hämta alla skördare (även sålda) en gång vid mount — listan i sheet:n
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('dim_maskin')
      .select('maskin_id, tillverkare, modell, aktiv_till')
      .eq('maskin_typ', 'Harvester')
      .order('aktiv_till', { ascending: false, nullsFirst: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setAlleMaskiner(data as any);
      });
    return () => { cancelled = true; };
  }, []);

  // Faller tillbaka till 'all' om vald maskin inte längre finns
  const effectiveSelected: string | 'all' = selectedMaskinId === 'all' || alleMaskiner.some(m => m.maskin_id === selectedMaskinId)
    ? selectedMaskinId
    : 'all';

  const filterLabel = useMemo(() => {
    if (effectiveSelected === 'all') return 'Alla maskiner';
    const m = alleMaskiner.find(x => x.maskin_id === effectiveSelected);
    return maskinNamn(m ?? { maskin_id: effectiveSelected });
  }, [effectiveSelected, alleMaskiner]);
  // Namn för ett id var som helst i vyn — aldrig råa id:n i UI:t.
  const maskinNamnFor = (id: string | null | undefined): string =>
    id ? maskinNamn(alleMaskiner.find(x => x.maskin_id === id) ?? { maskin_id: id }) : '—';
  const maskinKortNamnFor = (id: string | null | undefined): string =>
    id ? maskinKortNamn(alleMaskiner.find(x => x.maskin_id === id) ?? { maskin_id: id }) : '—';

  // Aktiva maskiner: sålda (aktiv_till i det förflutna) döljs från väljare + 'alla'-aggregat.
  // Historiken finns kvar i DB; den bara filtreras bort ur vyn.
  const aktivaMaskinIds = useMemo(
    () => alleMaskiner.filter(m => !(m.aktiv_till && m.aktiv_till < idagStr())).map(m => m.maskin_id),
    [alleMaskiner],
  );
  const arAktiv = useCallback(
    (mid: string) => aktivaMaskinIds.length === 0 || aktivaMaskinIds.includes(mid),
    [aktivaMaskinIds],
  );
  // Senaste-fliken bedöms alltid per maskin. 'all' → senaste kontrollen från en
  // AKTIV maskin; annars den valda maskinen. (allKalib är sorterad datum desc.)
  const heroMaskin = useMemo<string | null>(
    () => effectiveSelected !== 'all'
      ? effectiveSelected
      : (allKalib.find(k => arAktiv(k.maskin_id))?.maskin_id ?? null),
    [effectiveSelected, allKalib, arAktiv],
  );
  const heroFilnamn = useMemo<string | null>(
    () => heroMaskin ? (allKalib.find(k => k.maskin_id === heroMaskin)?.filnamn ?? null) : (allKalib[0]?.filnamn ?? null),
    [heroMaskin, allKalib],
  );
  const bedomning = heroMaskin ? (bedomningMap[heroMaskin] ?? null) : null;
  const diagnosData = heroMaskin ? (diagnosMap[heroMaskin] ?? null) : null;
  const verdikt = diagnos(diagnosData);

  // === Objekt-dom — via bedomProfil mot objektets MASKINPROFIL (VIDA/BIOMETRIA), inget
  // hårdkodat 85/3,5. Mjuk underlagsgrind (beslutad när Objekt byggdes, nu gjord):
  //   < 50 mätpunkter  → för tunt underlag, ingen dom
  //   50–100           → dom, men märkt "bygger på få mätningar"
  //   > 100            → full dom
  // Profilens larm-grind (150, för maskinen som helhet) gäller inte ett objekt — den
  // stryps bort innan bedömningen. "Under kravet" = under GOLVET (röd); orange = under
  // målet men godkänt, samma betydelse som i Så ligger du till.
  const OBJEKT_GRIND_TUNT = 50;
  const OBJEKT_GRIND_FULL = 100;
  type ObjektGrupp = 'under' | 'godkand' | 'tunt';
  const objektBedom = (o: ObjektStat, mask: MaskinInfo | undefined): { grupp: ObjektGrupp; status: ProfilStatus | null; faMatningar: boolean; ingenProfil: boolean } => {
    const faMatningar = o.n >= OBJEKT_GRIND_TUNT && o.n <= OBJEKT_GRIND_FULL;
    if (o.n < OBJEKT_GRIND_TUNT) return { grupp: 'tunt', status: null, faMatningar: false, ingenProfil: false };
    const rows = (mask?.trosklar ?? []).filter(t => t.variabel === 'diameter');
    if (rows.length === 0) return { grupp: 'tunt', status: null, faMatningar, ingenProfil: true };
    const stat: VariabelStat = { n: o.n, traffPct: o.traffPct, systematisk: o.systematisk, standardavv: o.standardavv, grovPct: o.grovPct, tolerans: null, grovTolerans: null };
    const bed = bedomProfil(stat, 'diameter', rows.map(t => ({ ...t, larm_min_matt: null })));
    return { grupp: bed.status === 'röd' ? 'under' : 'godkand', status: bed.status, faMatningar, ingenProfil: false };
  };
  const objektDom = (o: ObjektStat, mask: MaskinInfo | undefined): { ton: ToneToken; rubrik: string; attribution: string | null; reservation: string | null; tunn: boolean } => {
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
  const objektSaknarNamn = (namn: string): boolean =>
    /^[A-ZÅÄÖ][a-zåäöé]+(-[A-ZÅÄÖ][a-zåäöé]+)? [A-ZÅÄÖ][a-zåäöé]+(-[A-ZÅÄÖ][a-zåäöé]+)?$/.test(namn.trim());

  // Rapport per-trädslag-cell: träff% (huvudtal) färgad via kravprofilen (sämsta-styr,
  // grind 30 här — inte larm-grindens 150). Diameter: syst/std stödtal. LÄNGD: bara
  // träffprocent styr domen; stödtalet visar tolerans + n (inget snitt/systematisk).
  const renderTrCell = (stat: VariabelStat, variabel: 'diameter' | 'langd', enhet: 'mm' | 'cm', trosklar: KravRow[]) => {
    if (stat.n < 30) return <div className="kalib-tr-cellinner"><div className="kalib-tr-tunt">för tunt underlag</div><div className="kalib-tr-stod">n {stat.n}</div></div>;
    let worst: ProfilStatus = 'ok';
    for (const r of trosklar.filter(t => t.variabel === variabel && (variabel === 'diameter' || t.metrik === 'traffprocent'))) {
      const v = r.metrik === 'traffprocent' ? stat.traffPct
        : r.metrik === 'systematisk' ? (stat.systematisk != null ? Math.abs(stat.systematisk) : null)
          : r.metrik === 'standardavv' ? stat.standardavv
            : r.metrik === 'grov_avvikelse' ? stat.grovPct : null;
      if (v == null) continue;
      const mal = Number(r.mal), golv = Number(r.golv);
      const st: ProfilStatus = r.riktning === 'hog_bra' ? (v >= mal ? 'ok' : v < golv ? 'röd' : 'orange') : (v <= mal ? 'ok' : v > golv ? 'röd' : 'orange');
      if (PROFIL_RANK[st] > PROFIL_RANK[worst]) worst = st;
    }
    return (
      <div className="kalib-tr-cellinner">
        <div className={`kalib-tr-traff tone-${PROFIL_TON[worst]}`}>{stat.traffPct != null ? `${Math.round(stat.traffPct)}%` : '–'}</div>
        <div className="kalib-tr-stod">
          {variabel === 'langd'
            ? `inom ±${fmtKrav(stat.tolerans)} cm · n ${stat.n}`
            : `${MATT.systematisk.fraga} ${fmtSig1(stat.systematisk)} ${enhet} · ${MATT.standardavv.fraga} ${fmtAbs1(stat.standardavv)} ${enhet} · n ${stat.n}`}
        </div>
      </div>
    );
  };

  const heroMaskinObj = heroMaskin ? alleMaskiner.find(m => m.maskin_id === heroMaskin) : undefined;
  const heroNamn = heroMaskin ? maskinNamn(heroMaskinObj ?? { maskin_id: heroMaskin }) : '';

  // Hämta diagnos-underlag (klasser, planområden, markörer) för vald maskin.
  const laddaDiagnos = useCallback((maskin: string, force = false) => {
    if (!maskin) return;
    if (!force && diagnosMap[maskin]) return;
    fetch(`/api/kalibrering/diagnos?key=skogsystem-debug&maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: DiagnosResp & { ok?: boolean }) => {
        if (!data?.ok) return;
        setDiagnosMap(prev => ({ ...prev, [maskin]: data }));
      })
      .catch(() => { /* tyst — förarvyn faller tillbaka på "läser diagnos" */ });
  }, [diagnosMap]);

  // Spara en åtgärdsmarkör (förare: "höjde trycket till 400 mm").
  const sparaMarkor = useCallback(async () => {
    if (!heroMaskin || !nyMarkorDatum || !nyMarkorText.trim()) return;
    setMarkorSparar(true);
    const { error } = await supabase.from('kalibrering_atgard').insert({
      maskin_id: heroMaskin, datum: nyMarkorDatum, text: nyMarkorText.trim(),
    });
    setMarkorSparar(false);
    if (!error) {
      setNyMarkorText(''); setNyMarkorDatum('');
      laddaDiagnos(heroMaskin, true); // ladda om så markören syns direkt
    }
  }, [heroMaskin, nyMarkorDatum, nyMarkorText, laddaDiagnos]);

  // Tidsserie-graf (Trend "Läget"): en linje per grovlek + valfri kravlinje + markörer.
  const KLASS_FARG: Record<string, string> = {
    '<150': '#0A84FF', '150-199': '#5AC8FA', '200-249': '#FFD60A', '250-299': '#FF9F0A', '300+': '#FF453A',
  };
  // Underlagsgrind i kurvan: n<30 ritas inte (slumpen får inte se ut som trend),
  // 30–100 streckad+nedtonad (tunt underlag), ≥100 solid. Per SEGMENT — 300+ har
  // aldrig ≥100/månad, så hela dess linje blir streckad; ingen falsk april-spik.
  const renderTidsChart = (
    manader: string[],
    series: { klass: string; punkter: Map<string, { v: number; n: number }> }[],
    opts: { yMax: number; kravLinje?: { v: number; label: string }; kravBand?: { till: number; label: string }; riktning?: string; markorer: DiagMarkor[]; fmtX?: (m: string) => string; markorKey?: (datum: string) => string },
  ) => {
    if (manader.length === 0) return <div className="kalib-lugn-rad"><MSym name="info" size={16} color="#8E8E93" /><span>Inget underlag ännu.</span></div>;
    const fmtX = opts.fmtX ?? ((m: string) => m.slice(2).replace('-', '/'));
    const markorKey = opts.markorKey ?? ((d: string) => d.slice(0, 7));
    const W = 320, H = 150, padL = 28, padR = 10, padT = 10, padB = 22;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const xFor = (mi: number) => padL + (manader.length === 1 ? plotW / 2 : (mi / (manader.length - 1)) * plotW);
    const yFor = (v: number) => padT + (1 - Math.max(0, Math.min(opts.yMax, v)) / opts.yMax) * plotH;
    const monIdx = new Map(manader.map((m, i) => [m, i]));
    const step = Math.max(1, Math.ceil(manader.length / 6));
    let nagotTunt = false;
    return (
      <div className="kalib-grid-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="kalib-tidschart">
          {/* Kravband: ljus zon 0→golv = det tillåtna. Linje ovanför = flaxar för mycket. */}
          {opts.kravBand && (
            <>
              <rect x={padL} y={yFor(opts.kravBand.till)} width={W - padL - padR} height={Math.max(0, yFor(0) - yFor(opts.kravBand.till))} className="kalib-tc-band" />
              <line x1={padL} y1={yFor(opts.kravBand.till)} x2={W - padR} y2={yFor(opts.kravBand.till)} className="kalib-tc-krav" />
              <text x={W - padR} y={yFor(opts.kravBand.till) - 3} className="kalib-tc-kravlabel" textAnchor="end">{opts.kravBand.label}</text>
            </>
          )}
          {[0, opts.yMax / 2, opts.yMax].map(v => (
            <g key={v}>
              <line x1={padL} y1={yFor(v)} x2={W - padR} y2={yFor(v)} className="kalib-tc-grid" />
              <text x={padL - 4} y={yFor(v) + 3} className="kalib-tc-ylabel" textAnchor="end">{Math.round(v)}</text>
            </g>
          ))}
          {opts.kravLinje && (
            <>
              <line x1={padL} y1={yFor(opts.kravLinje.v)} x2={W - padR} y2={yFor(opts.kravLinje.v)} className="kalib-tc-krav" />
              <text x={W - padR} y={yFor(opts.kravLinje.v) - 3} className="kalib-tc-kravlabel" textAnchor="end">{opts.kravLinje.label}</text>
            </>
          )}
          {opts.markorer.map((mk, i) => {
            const mi = monIdx.get(markorKey(mk.datum));
            if (mi == null) return null;
            return <line key={`mk${i}`} x1={xFor(mi)} y1={padT} x2={xFor(mi)} y2={padT + plotH} className={`kalib-tc-markor ${mk.kalla}`} />;
          })}
          {series.map(s => {
            const el: JSX.Element[] = [];
            for (let i = 0; i + 1 < manader.length; i++) {
              const a = s.punkter.get(manader[i]), b = s.punkter.get(manader[i + 1]);
              if (!a || !b || a.n < GRIND_MIN || b.n < GRIND_MIN) continue; // n<30 → ingen linje
              const solid = a.n >= GRIND_ATGARD && b.n >= GRIND_ATGARD;
              if (!solid) nagotTunt = true;
              el.push(<line key={`seg${i}`} x1={xFor(i)} y1={yFor(a.v)} x2={xFor(i + 1)} y2={yFor(b.v)}
                stroke={KLASS_FARG[s.klass]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinecap="round"
                strokeOpacity={solid ? 1 : 0.4} strokeDasharray={solid ? undefined : '3 3'} />);
            }
            manader.forEach((m, i) => {
              const p = s.punkter.get(m);
              if (!p || p.n < GRIND_MIN) return; // n<30 → ingen punkt
              const solid = p.n >= GRIND_ATGARD;
              if (!solid) nagotTunt = true;
              el.push(<circle key={`dot${i}`} cx={xFor(i)} cy={yFor(p.v)} r={solid ? 2 : 1.6} fill={KLASS_FARG[s.klass]} fillOpacity={solid ? 1 : 0.5} />);
            });
            return <g key={s.klass}>{el}</g>;
          })}
          {manader.map((m, i) => (i % step === 0 || i === manader.length - 1
            ? <text key={m} x={xFor(i)} y={H - 6} className="kalib-tc-xlabel" textAnchor="middle">{fmtX(m)}</text>
            : null))}
        </svg>
        <div className="kalib-tc-legend">
          {opts.riktning && <span className="kalib-tc-riktning">{opts.riktning}</span>}
          {series.map(s => <span key={s.klass} className="kalib-tc-leg"><i style={{ background: KLASS_FARG[s.klass] }} />{s.klass}</span>)}
        </div>
        {nagotTunt && <div className="kalib-tc-tunt">Streckad/nedtonad = tunt underlag (30–100 mått i perioden). Under 30 ritas inte — slumpen ska inte se ut som en trend.</div>}
      </div>
    );
  };

  // Hjälte-block för en variabel: TRÄFFPROCENTEN som hjälte-tal, färgad via
  // profilbedömningen (sämsta-styr). Period + systematik/std som stödtal.
  // "OK är tyst" → grå. Under min-underlag → grå + "för få mått".
  const renderHeroVar = (
    label: string, enhet: 'cm' | 'mm', stat: VariabelStat | null, variabel: 'diameter' | 'langd',
  ) => {
    const bed = bedomning ? bedomProfil(stat, variabel, bedomning.trosklar) : null;
    const ton: ToneToken = bed && !bed.larmTyst ? PROFIL_TON[bed.status] : 'ok';
    if (!stat || stat.traffPct == null) {
      return (
        <div className="kalib-hero-metric">
          <div className="kalib-hero-metric-value tone-ok">–</div>
          <div className="kalib-hero-metric-label">{label}</div>
          <div className="kalib-hero-metric-hint">inget underlag</div>
        </div>
      );
    }
    const tolText = stat.tolerans != null ? `inom ±${fmtTal(stat.tolerans, enhet)} ${enhet}` : '';
    // Stödtalen visas alltid med 1 decimal — std/systematik ligger ofta precis
    // vid tröskeln (t.ex. 4,6 mot taket 4,5); heltal skulle dölja marginalen.
    return (
      <div className="kalib-hero-metric">
        <div className={`kalib-hero-metric-value tone-${ton}`}>{Math.round(stat.traffPct)}%</div>
        <div className="kalib-hero-metric-label">{label} · {tolText}</div>
        <div className="kalib-hero-metric-hint">
          {bed?.larmTyst
            ? `för få mått i perioden (${stat.n})`
            : variabel === 'langd'
              ? `n=${stat.n} · klaven mäter hela cm`
              : `${MATT.systematisk.fraga} ${fmtSig1(stat.systematisk)} ${enhet} · ${MATT.standardavv.fraga} ${fmtAbs1(stat.standardavv)} ${enhet} · n ${stat.n}`}
        </div>
      </div>
    );
  };

  const aggregeraDagFiltrerat = (dag: CalDag, valdMaskinId: string | 'all'): CalDagstatus => {
    if (valdMaskinId === 'all') return dag.status;
    const m = dag.maskiner.find(x => x.maskin_id === valdMaskinId);
    if (!m) return 'inaktiv';
    return m.status;
  };

  // Sammanfattning omberäknad efter filter
  const filteredSammanfattning = useMemo<CalSammanfattning | null>(() => {
    if (!calData) return null;
    if (effectiveSelected === 'all') return calData.sammanfattning;
    const rader = calData.dagar.map(d => {
      const status = aggregeraDagFiltrerat(d, effectiveSelected);
      const m = d.maskiner.find(x => x.maskin_id === effectiveSelected);
      return { status, huvudtyp_okand: !!m?.huvudtyp_okand };
    });
    return {
      produktionsdagar: rader.filter(r => r.status !== 'inaktiv').length,
      kompletta: rader.filter(r => r.status === 'komplett').length,
      saknas: rader.filter(r => r.status === 'saknas').length,
      varningar: rader.filter(r => r.status === 'varning').length,
      okand_huvudtyp_dagar: rader.filter(r => r.huvudtyp_okand).length,
    };
  }, [calData, effectiveSelected]);

  // Öppna kalendern på månaden för senaste kontrollen (inte innevarande, som
  // ofta är tom). Körs en gång när data laddats; överskrivs inte om användaren
  // sen bläddrar bort.
  const calInitRef = useRef(false);
  useEffect(() => {
    if (calInitRef.current || allKalib.length === 0) return;
    calInitRef.current = true;
    setCalManad(allKalib[0].datum.slice(0, 7)); // "YYYY-MM"
  }, [allKalib]);

  useEffect(() => {
    if (activeTab !== 'calendar') return;
    if (calData?.manad === calManad && !calError) return; // har redan datan
    let cancelled = false;
    setCalLoading(true);
    setCalError(null);
    fetch(`/api/kalibrering/kalender?manad=${calManad}&key=skogsystem-debug`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: CalResponse) => { if (!cancelled) { setCalData(data); setCalLoading(false); } })
      .catch(err => { if (!cancelled) { setCalError(err?.message || 'Kunde inte ladda kalendern'); setCalLoading(false); } });
    return () => { cancelled = true; };
  }, [activeTab, calManad, calData, calError]);

  // === Objekt-fliken: lazy fetch (maskinoberoende, en gång)
  useEffect(() => {
    if (activeTab !== 'objekt' || objektData) return;
    let cancelled = false;
    fetch('/api/kalibrering/objekt?key=skogsystem-debug', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { ok?: boolean; objekt: ObjektStat[]; maskiner: Record<string, MaskinInfo> }) => {
        if (cancelled || !data?.ok) return;
        setObjektData({ objekt: data.objekt, maskiner: data.maskiner });
      })
      .catch(() => { /* tyst — objekt-fliken visar "kunde inte ladda" */ });
    return () => { cancelled = true; };
  }, [activeTab, objektData]);

  // === Rapport per-trädslag: lazy fetch per maskin (bara när EN maskin är vald)
  useEffect(() => {
    if (activeTab !== 'report' || effectiveSelected === 'all' || tradslagMap[effectiveSelected]) return;
    const maskin = effectiveSelected;
    let cancelled = false;
    // dagar=90 → samma rullande fönster som hjälten/bedomning. Ett fönster i hela rapporten.
    fetch(`/api/kalibrering/tradslag?key=skogsystem-debug&maskin_id=${encodeURIComponent(maskin)}&dagar=90`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { ok?: boolean; profil: string | null; trosklar: KravRow[]; tradslag: TradslagStat[] }) => {
        if (cancelled || !data?.ok) return;
        setTradslagMap(prev => ({ ...prev, [maskin]: { profil: data.profil, trosklar: data.trosklar, tradslag: data.tradslag } }));
      })
      .catch(() => { /* tyst — tabellen faller tillbaka på snitt */ });
    return () => { cancelled = true; };
  }, [activeTab, effectiveSelected, tradslagMap]);


  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setPartialError(null);
    try {
      const { data: kalibRows, error: kalibErr } = await supabase
        .from('fakt_kalibrering')
        .select('*')
        .order('datum', { ascending: false });

      if (kalibErr) {
        console.error('fakt_kalibrering error:', kalibErr);
        setFetchError('Kunde inte ladda kontrolldata. Dra ner för att uppdatera.');
        setLoading(false);
        return;
      }
      if (!kalibRows || kalibRows.length === 0) { setLoading(false); return; }

      setAllKalib(kalibRows);

      // stockMap används BARA för Senaste-kortet (latestStockar). Hämta därför
      // bara senaste kontrollens stockar via filnamn — komplett och billigt.
      // (Tidigare hämtades ALLA rader utan pagination → PostgREST kapade vid
      //  1000 av 4160 → senaste kontrollen undercountades.)
      const latestFilnamn = kalibRows[0].filnamn;
      const { data: stockRows, error: stockErr } = await supabase
        .from('detalj_kontroll_stock')
        .select(STOCK_SELECT)
        .eq('filnamn', latestFilnamn)
        .order('stock_nummer', { ascending: true });

      if (stockErr) {
        console.error('detalj_kontroll_stock error:', stockErr);
        setPartialError('Vissa data kunde inte laddas');
      }

      const sMap: Record<string, DetaljKontrollStock[]> = {};
      (stockRows || []).forEach((s: DetaljKontrollStock) => {
        if (!sMap[s.filnamn]) sMap[s.filnamn] = [];
        sMap[s.filnamn].push(s);
      });
      setStockMap(sMap);

      const { data: histRows, error: histErr } = await supabase
        .from('fakt_kalibrering_historik')
        .select('*')
        .order('datum', { ascending: false });

      if (histErr) {
        console.error('fakt_kalibrering_historik error:', histErr);
        setPartialError('Vissa data kunde inte laddas');
      }
      setHistorik(histRows || []);
    } catch (err) {
      console.error('Fetch error:', err);
      setFetchError('Kunde inte ladda kontrolldata. Dra ner för att uppdatera.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Hämta profilbedömning (90-dagarsfönster) för den maskin Senaste-fliken visar.
  useEffect(() => {
    if (!heroMaskin || bedomningMap[heroMaskin]) return;
    let cancelled = false;
    fetch(`/api/kalibrering/bedomning?key=skogsystem-debug&maskin_id=${encodeURIComponent(heroMaskin)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: BedomningResp & { ok?: boolean }) => {
        if (cancelled || !data?.ok) return;
        setBedomningMap(prev => (prev[heroMaskin] ? prev : { ...prev, [heroMaskin]: data }));
      })
      .catch(() => { /* tyst — hjälten faller tillbaka på "inget underlag" */ });
    return () => { cancelled = true; };
  }, [heroMaskin, bedomningMap]);

  useEffect(() => { if (heroMaskin) laddaDiagnos(heroMaskin); }, [heroMaskin, laddaDiagnos]);

  // Senaste kontrollens stockar för vald maskin (kan skilja sig från globalt
  // senaste när man filtrerar per maskin — stockMap laddar annars bara den globala).
  useEffect(() => {
    if (!heroFilnamn || stockMap[heroFilnamn]) return;
    let cancelled = false;
    supabase
      .from('detalj_kontroll_stock')
      .select(STOCK_SELECT)
      .eq('filnamn', heroFilnamn)
      .order('stock_nummer', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setStockMap(prev => (prev[heroFilnamn] ? prev : { ...prev, [heroFilnamn]: data as DetaljKontrollStock[] }));
      });
    return () => { cancelled = true; };
  }, [heroFilnamn, stockMap]);

  // === Apple-kontrollmodal — datalager (fetch-then-push) ===
  const fetchKontroll = useCallback(
    async (filnamn: string): Promise<KontrollResponse | null> => {
      try {
        const res = await fetch(
          `/api/kalibrering/kontroll?filnamn=${encodeURIComponent(filnamn)}&key=skogsystem-debug`
        );
        if (!res.ok) {
          console.error(`fetchKontroll: HTTP ${res.status}`);
          return null;
        }
        return await res.json() as KontrollResponse;
      } catch (e) {
        console.error('fetchKontroll fel:', e);
        return null;
      }
    },
    []
  );

  const openKontrollFull = useCallback(
    async (filnamn: string) => {
      if (laddarKontroll) return;
      setLaddarKontroll(filnamn);
      const data = await fetchKontroll(filnamn);
      setLaddarKontroll(null);
      if (!data) {
        pushModal({
          title: 'Kunde inte ladda kontroll',
          subtitle: filnamn,
          body: (
            <div className="kalib-card" style={{ color: '#FF3B30' }}>
              Kontrolldata kunde inte hämtas. Försök igen.
            </div>
          ),
        });
        return;
      }
      // === Helpers för översiktsmodalen ===
      const k = data.kontroll;
      const datumStr = new Date(k.datum).toLocaleDateString('sv-SE', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
      const diaSnitt = k.dia_avvikelse_snitt_mm ?? 0;

      // Toleransband HÄMTAS ur maskinens kravprofil (inte hårdkodat 2/4) — annars
      // driver band, skala och "utanför"-räkning isär nästa gång en tröskel ändras.
      const tolProfil = (variabel: string, fallback: number) => {
        const r = bedomning?.trosklar.find(t => t.variabel === variabel && t.metrik === 'traffprocent');
        return r?.tolerans != null ? Number(r.tolerans) : fallback;
      };
      const tolDia = tolProfil('diameter', 4);
      const tolLen = tolProfil('langd', 2);

      // Per-stock distribution — delas av svärmen (visuellt) och big-tonen.
      // sDia tar max-absolut över mätpunkter + toppen (samma logik som
      // stocklistan längre ner — utan den missar man fel som bara dyker
      // upp i ett enskilt mätställe på en annars samlad stock).
      type StockSwarmEntry = { id: number; stam_nummer: number; stock_nummer: number; sLen: number; sDia: number; lenKl: boolean; diaKl: boolean };
      const stockDist: StockSwarmEntry[] = data.stockar.map((s) => {
        // "Klavad" = operatören har mätt. Oklavade stockar har ingen avvikelse
        // (NULL i DB) och får INTE räknas som "inom tolerans".
        const lenKl = s.operator_langd_cm != null && s.operator_langd_cm !== 0;
        const mpA = s.matpunkter
          .filter((m) => m.diameter_maskin_mm != null && m.diameter_operator_mm != null)
          .map((m) => (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number));
        const diaKl = mpA.length > 0 || (s.operator_toppdia_mm != null && s.operator_toppdia_mm !== 0);
        const sLen = lenKl ? (s.langd_avvikelse_cm ?? 0) : 0;
        const sDia = diaKl ? [...mpA, s.dia_avvikelse_mm ?? 0].reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0) : 0;
        return { id: s.id, stam_nummer: s.stam_nummer, stock_nummer: s.stock_nummer, sLen, sDia, lenKl, diaKl };
      });

      // Svärmens prickar + per-mått-talet färgas via delade avvikelseTon/
      // avvikelseStatus (se modulnivå). Prickarna: per stock. Talet: på SNITTET
      // (se nedan) — inte värsta stocken, så ett lugnt snitt förblir grått.

      // Status-raden räknar enskilda stockar utanför tolerans — snittet
      // kan se OK ut även när flera stockar är dåliga.
      // Räkna BARA på klavade stockar — oklavade har ingen dom.
      const lenKlavade = stockDist.filter((e) => e.lenKl);
      const diaKlavade = stockDist.filter((e) => e.diaKl);
      const utanforLen = lenKlavade.filter((e) => Math.abs(e.sLen) > tolLen).length;
      const utanforDia = diaKlavade.filter((e) => Math.abs(e.sDia) > tolDia).length;
      const ejKlavadeLen = stockDist.length - lenKlavade.length;
      const ejKlavadeDia = stockDist.length - diaKlavade.length;
      const lenStatusTone: 'ok' | 'bad' = utanforLen === 0 ? 'ok' : 'bad';
      const diaStatusTone: 'ok' | 'bad' = utanforDia === 0 ? 'ok' : 'bad';
      // Längd visar TRÄFFPROCENT (andel klavade inom ±tol) — stocken kapas.
      const lenTraff = lenKlavade.length > 0 ? Math.round((100 * (lenKlavade.length - utanforLen)) / lenKlavade.length) : null;
      const statusLabel = (klavade: number, utanfor: number, ejKlavade: number, total: number): string => {
        if (klavade === 0) return `${total} ej klavade`;
        const bas = utanfor === 0 ? `Alla ${klavade} inom tolerans` : `${utanfor} av ${klavade} utanför`;
        return ejKlavade > 0 ? `${bas} · ${ejKlavade} ej klavade` : bas;
      };
      const lenLabel = statusLabel(lenKlavade.length, utanforLen, ejKlavadeLen, stockDist.length);
      const diaLabel = statusLabel(diaKlavade.length, utanforDia, ejKlavadeDia, stockDist.length);

      // Svärm-position: avvikelse → procent. Clipp till [4,96] så dotter
      // aldrig sitter på kanten även vid extrema värden.
      const swarmX = (val: number, max: number) => {
        const clipped = Math.max(-max, Math.min(max, val));
        const pct = ((clipped + max) / (max * 2)) * 100;
        return Math.max(4, Math.min(96, pct));
      };
      // Deterministisk vertikal jitter — hash på (stam·100+stock) så samma
      // stock alltid hamnar på samma höjd även vid omrender.
      const swarmY = (e: StockSwarmEntry) => {
        const h = (e.stam_nummer * 100 + e.stock_nummer) * 37;
        return 24 + (h % 52);
      };

      // Stem-val + mätare (tas från första stocken — enhetlig per fil i praktiken)
      const fs = data.stockar[0];
      const selText =
        fs?.stem_selection === 'Randomly selected stem' ? 'Slumpvald stam'
        : fs?.stem_selection === 'Manually by operator selected stem' ? 'Vald av operatör'
        : fs?.stem_selection ?? null;
      const measurer = fs?.measurer_name ?? null;

      const w = k.weather_at_harvest;
      const showSnow = (w?.snowfall_cm ?? 0) > 0;

      // === Detaljmodal för enskild stock — pushas ovanpå översikten ===
      const openStockDetalj = (s: StockRow, _stammar: StamRow[]) => {
        const sLen = s.langd_avvikelse_cm ?? 0;
        const sLenCls2: 'good' | 'bad' = Math.abs(sLen) > tolLen ? 'bad' : 'good';

        // Mätpunkter med båda värdena, sorterade på position
        const mpAvvik = s.matpunkter
          .filter((m) => m.diameter_maskin_mm != null && m.diameter_operator_mm != null)
          .map((m) => ({
            position_cm: m.position_cm,
            avvikelse: (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number),
            mVal: m.diameter_maskin_mm as number,
            oVal: m.diameter_operator_mm as number,
          }))
          .sort((a, b) => a.position_cm - b.position_cm);
        const hasMp = mpAvvik.length > 0;
        const topAvvik = s.dia_avvikelse_mm ?? 0;
        // Klavad = operatören har mätt. Utan det: ingen avvikelse, ingen dom.
        const lenKlavad = s.operator_langd_cm != null && s.operator_langd_cm !== 0;
        const diaKlavad = hasMp || (s.operator_toppdia_mm != null && s.operator_toppdia_mm !== 0);

        // Max-avvikelse (med tecken) över mätpunkter + topp
        type DiaEntry = { avvik: number; pos: number | null };
        const allEntries: DiaEntry[] = hasMp
          ? [
              ...mpAvvik.map((p) => ({
                avvik: p.avvikelse,
                pos: p.position_cm as number | null,
              })),
              { avvik: topAvvik, pos: null },
            ]
          : [{ avvik: topAvvik, pos: null }];
        const maxEntry = allEntries.reduce((a, b) =>
          Math.abs(b.avvik) > Math.abs(a.avvik) ? b : a
        );
        const maxAvvik = maxEntry.avvik;
        const maxAvvikPos = maxEntry.pos;
        const maxCls: 'good' | 'warn' | 'bad' =
          Math.abs(maxAvvik) > 4 ? 'bad' : Math.abs(maxAvvik) > 3 ? 'warn' : 'good';

        // Subtitle-delar
        const sortText = s.sortiment_namn ?? '–';
        const lenM =
          s.maskin_langd_cm != null ? `${dec(s.maskin_langd_cm / 100, 1)} m` : '–';
        const mpCount = s.matpunkter.length;
        const mpText = mpCount === 1 ? '1 mätpunkt' : `${mpCount} mätpunkter`;

        // Lollipop X-skala: 10-90% mellan första och sista mätpunktens position_cm
        const minPos = hasMp ? mpAvvik[0].position_cm : 0;
        const maxPos = hasMp ? mpAvvik[mpAvvik.length - 1].position_cm : 1;
        const range = maxPos - minPos || 1;
        const xPctFor = (pos: number) =>
          mpAvvik.length === 1 ? 50 : 15 + ((pos - minPos) / range) * 70;
        // Y-skala: ±8 mm avvikelse → ±40% från mitten = 10-90% av container.
        // Clampa till 8-92% så markörens ring + label får plats vid kanten.
        const yPctFor = (avvik: number) => {
          const clamped = Math.max(-8, Math.min(8, avvik));
          const raw = 50 - (clamped / 8) * 40;
          return Math.max(8, Math.min(92, raw));
        };
        // Per mätpunkt-klassning via delade avvikelseTon (diameter, mm) — visar
        // riktning (för litet/för stort) i den gemensamma skalan.

        // Diagnos baserad på riktnings-konsensus. En mening, mänskligt språk.
        // Outlier = |avvikelse| > 4 mm (Skogforsks branschstandard).
        type DiagnosTone = 'ok' | 'warn' | 'bad';
        type Diagnos = { tone: DiagnosTone; text: string } | null;
        const buildDiagnos = (): Diagnos => {
          if (!hasMp) return null;
          const outliers = mpAvvik.filter((p) => Math.abs(p.avvikelse) > 4);
          if (outliers.length === 0) {
            return { tone: 'ok', text: 'Mätningen är samlad, inom tolerans.' };
          }
          if (outliers.length === 1) {
            const o = outliers[0];
            return {
              tone: 'warn',
              text:
                `Punkten ${fmtAvvikelse(o.avvikelse, 'mm')} mm vid ${o.position_cm} cm sticker ut. ` +
                `Annars samlat. Kontrollera anliggning vid den grovleken.`,
            };
          }
          const signs = outliers.map((o) => Math.sign(o.avvikelse));
          const allSame = signs.every((s) => s === signs[0]);
          if (allSame) {
            const avg = outliers.reduce((a, o) => a + o.avvikelse, 0) / outliers.length;
            const dir = avg > 0 ? 'grovt' : 'smalt';
            return {
              tone: 'bad',
              text:
                `Drar systematiskt åt ${dir} — ${Math.round(Math.abs(avg))} mm i snitt på ` +
                `${outliers.length} av ${mpAvvik.length} punkter. Tyder på kalibreringsfel — ` +
                `men bekräfta med fler stammar innan du justerar.`,
            };
          }
          return {
            tone: 'bad',
            text:
              `Spretigt — ${outliers.length} av ${mpAvvik.length} punkter pekar olika håll. ` +
              `Tyder på mekaniskt problem (givare/mäthjul/anliggning). ` +
              `Kalibrering hjälper inte mot spridning.`,
          };
        };
        const diagnos = buildDiagnos();

        pushModal({
          title: `Stock ${s.stock_nummer}`,
          subtitle: `${sortText} · ${lenM} · ${mpText}`,
          body: (
            <>
              {s.stock_nummer === 1 && (
                <div className="kalib-stock-tag-row">
                  <span className="kalib-stock-tag">ROTSTOCK</span>
                </div>
              )}

              <div className="kalib-card">
                <div className="kalib-tol-header">
                  <div className="kalib-tol-label">Längd</div>
                  <div className={`kalib-tol-value ${lenKlavad && sLenCls2 === 'bad' ? 'bad' : ''}`}>
                    {lenKlavad ? `${fmtAvvikelse(sLen, 'cm')} cm` : 'Ej klavad'}
                  </div>
                </div>
                <div className="kalib-stock-mo-line">
                  Maskin {s.maskin_langd_cm ?? '–'} cm · {lenKlavad ? `Operatör ${s.operator_langd_cm} cm` : 'ej klavad av operatör'}
                </div>
              </div>

              <div className="kalib-card">
                <div className="kalib-tol-header">
                  <div className="kalib-tol-label">Diameter</div>
                  <div className={`kalib-tol-value ${diaKlavad && diagnos?.tone === 'bad' ? 'bad' : diaKlavad && diagnos?.tone === 'warn' ? 'warn' : ''}`}>
                    {!diaKlavad
                      ? 'Ej klavad'
                      : hasMp && maxAvvikPos !== null
                        ? `störst fel: ${fmtAvvikelse(maxAvvik, 'mm')} mm vid ${maxAvvikPos} cm`
                        : `${fmtAvvikelse(maxAvvik, 'mm')} mm`}
                  </div>
                </div>

                {hasMp ? (
                  <>
                    <div className="kalib-lollipop">
                      <div className="kalib-lollipop-tol-band" />
                      <div className="kalib-lollipop-zero-line" />
                      {mpAvvik.flatMap((p, i) => {
                        const xP = xPctFor(p.position_cm);
                        const yP = yPctFor(p.avvikelse);
                        const cls = avvikelseTon(p.avvikelse, 'dia');
                        const above = p.avvikelse >= 0;
                        return [
                          <div
                            key={`stem-${i}`}
                            className="kalib-lollipop-stem"
                            style={{
                              left: `${xP}%`,
                              top: `${Math.min(50, yP)}%`,
                              height: `${Math.abs(yP - 50)}%`,
                            }}
                          />,
                          <div
                            key={`marker-${i}`}
                            className={`kalib-lollipop-marker ${cls}`}
                            style={{ left: `${xP}%`, top: `${yP}%` }}
                          />,
                          <div
                            key={`label-${i}`}
                            className={`kalib-lollipop-label ${cls}`}
                            style={{
                              left: `${xP}%`,
                              top: above
                                ? `calc(${yP}% - 18px)`
                                : `calc(${yP}% + 12px)`,
                            }}
                          >
                            {fmtAvvikelse(p.avvikelse, 'mm')}
                          </div>,
                        ];
                      })}
                    </div>
                    <div className="kalib-lollipop-axis">
                      <span>{minPos} cm</span>
                      <span>{maxPos} cm</span>
                    </div>
                    {diagnos && (
                      <div className={`kalib-stock-diagnos ${diagnos.tone}`}>
                        {diagnos.text}
                      </div>
                    )}
                  </>
                ) : diaKlavad ? (
                  <div className="kalib-stock-mo-line">
                    Endast toppmätning · Maskin {s.maskin_toppdia_mm ?? '–'} mm · Operatör{' '}
                    {s.operator_toppdia_mm} mm
                  </div>
                ) : (
                  <div className="kalib-stock-mo-line">Ej klavad av operatör</div>
                )}
              </div>

              {hasMp && (
                <>
                  <div className="kalib-modal-section-header">
                    <div className="kalib-modal-section-title">Per mätpunkt</div>
                  </div>
                  <div className="kalib-mp-list">
                    {mpAvvik.map((p, i) => {
                      const cls = avvikelseTon(p.avvikelse, 'dia');
                      return (
                        <div key={i} className="kalib-mp-row">
                          <div className="kalib-mp-pos">{p.position_cm} cm</div>
                          <div className="kalib-mp-vals">
                            Maskin {p.mVal} · Operatör {p.oVal}
                          </div>
                          <div className={`kalib-mp-diff ${cls}`}>
                            {fmtAvvikelse(p.avvikelse, 'mm')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ),
        });
      };

      // === Nivå 2 — stammen som den ligger, stockar rot→topp ===
      // Mellan översikten och detaljmodalen. Tryck på stock → nivå 3.
      const openStamVy = (stamNummer: number) => {
        const stamStockar = data.stockar
          .filter((st) => st.stam_nummer === stamNummer)
          .sort((a, b) => a.stock_nummer - b.stock_nummer);
        if (stamStockar.length === 0) return;

        // Alla stam-nummer i kontrollen (för pillarna)
        const alleStammar = Array.from(
          new Set(data.stockar.map((st) => st.stam_nummer)),
        ).sort((a, b) => a - b);

        // Sortimentsmix + total längd för subtitle
        const sortimentSet = new Set(
          stamStockar.map((st) => st.sortiment_namn).filter((x): x is string => !!x),
        );
        const sortimentText = Array.from(sortimentSet).join(' · ') || '–';
        const totalCm = stamStockar.reduce((a, st) => a + (st.maskin_langd_cm ?? 0), 0);
        const totalM = dec(totalCm / 100, 1);

        // Skala för stock-storlek — relativ inom stammen så förhållandena
        // syns men inga absoluta px-värden tappar sig i extrema fall.
        const maxLangd = Math.max(...stamStockar.map((st) => st.maskin_langd_cm ?? 0), 1);
        const maxDia = Math.max(...stamStockar.map((st) => st.maskin_toppdia_mm ?? 0), 1);

        // Per-stock klassning via delade avvikelseTon (diameter). 'null' =
        // saknad mätning (streckad kontur), annars gemensamma ton-skalan.
        const stockDivCls = (
          avvik: number | null,
        ): ToneToken | 'null' => (avvik == null ? 'null' : avvikelseTon(avvik, 'dia'));

        // === Stamhållning — planområden i den täta diameterprofilen ===
        // Profil finns bara för kontrollstammar (758 i prod). Hela sektionen
        // göms när profilen saknas (ingen tom ruta).
        const stamData = data.stammar.find((st) => st.stam_nummer === stamNummer);
        const profile = (stamData?.stem_diameter_profile ?? [])
          .slice()
          .sort((a, b) => a.position_cm - b.position_cm);
        const hasProfile = profile.length > 1;

        type Plan = { startCm: number; endCm: number; lengthCm: number; diameterMm: number };
        // Algoritm (Skogforsks grunddefinition): icke-minskande sträcka ≥ 30 cm.
        // För varje punkt i — j går framåt så länge dia[j] >= dia[j-1].
        // Sträckan [i, j-1] är planområde om endCm - startCm >= 30.
        const findPlanomraden = (): Plan[] => {
          if (!hasProfile) return [];
          const out: Plan[] = [];
          let i = 0;
          while (i < profile.length - 1) {
            let j = i + 1;
            while (j < profile.length && profile[j].diameter_mm >= profile[j - 1].diameter_mm) {
              j++;
            }
            const startCm = profile[i].position_cm;
            const endCm = profile[j - 1].position_cm;
            const length = endCm - startCm;
            if (length >= 30) {
              out.push({
                startCm,
                endCm,
                lengthCm: length,
                diameterMm: profile[i].diameter_mm,
              });
            }
            i = j;
          }
          return out;
        };
        const planer = findPlanomraden();

        // Mappa planområden till stockar — planet börjar/slutar vid pos på STAMMEN,
        // stockarna har egen kumulativ längd. Ett plan kan sträcka sig över flera
        // stockar; varje stock samlar de segment som faller inom sina gränser.
        type PlanSegment = {
          startInStockCm: number;
          endInStockCm: number;
          diameterMm: number;
          lengthCm: number;
        };
        const stockGränser: number[] = [0];
        for (const st of stamStockar) {
          stockGränser.push(stockGränser[stockGränser.length - 1] + (st.maskin_langd_cm ?? 0));
        }
        const planerPerStock: PlanSegment[][] = stamStockar.map(() => []);
        for (const p of planer) {
          let i = 0;
          while (i < stamStockar.length && stockGränser[i + 1] <= p.startCm) i++;
          while (i < stamStockar.length && stockGränser[i] < p.endCm) {
            const sStart = stockGränser[i];
            const sEnd = stockGränser[i + 1];
            planerPerStock[i].push({
              startInStockCm: Math.max(0, p.startCm - sStart),
              endInStockCm: Math.min(sEnd - sStart, p.endCm - sStart),
              diameterMm: p.diameterMm,
              lengthCm: p.lengthCm,
            });
            i++;
          }
        }

        pushModal({
          title: `Stam ${stamNummer}`,
          subtitle: `${stockText(stamStockar.length)} · ${sortimentText} · ${totalM} m`,
          body: (
            <>
              {alleStammar.length > 1 && (
                <div className="kalib-stam-vaxlare">
                  {alleStammar.map((n) => (
                    <button
                      key={n}
                      className={`kalib-stam-pill ${n === stamNummer ? 'active' : ''}`}
                      onClick={() => {
                        if (n !== stamNummer) {
                          popModal();
                          openStamVy(n);
                        }
                      }}
                    >
                      Stam {n}
                    </button>
                  ))}
                </div>
              )}

              {planer.length > 0 && (
                <div className="kalib-stam-explain">
                  Stockens färg = hur mycket den drar. Streckade fält = där
                  mätorganen tappar kontakt och diametern fastnar.
                </div>
              )}

              <div className="kalib-stam-virket">
                {stamStockar.map((st, idx) => {
                  // Form-färg = stockens egen diameteravvikelse, samma diverging-
                  // skala som svärmen i nivå 1 och lollipop i nivå 3. sDia =
                  // max abs över mätpunkter + topp (en mätpunkt som sticker ut
                  // ska kunna färga stocken röd även om toppen är mild).
                  const mpA = st.matpunkter
                    .filter((m) => m.diameter_maskin_mm != null && m.diameter_operator_mm != null)
                    .map((m) => (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number));
                  const hasAvvikData = mpA.length > 0 || st.dia_avvikelse_mm != null;
                  const sDia = [...mpA, st.dia_avvikelse_mm ?? 0].reduce(
                    (a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0
                  );
                  const formCls = hasAvvikData ? stockDivCls(sDia) : stockDivCls(null);

                  // Äkta proportioner: bredd = längd relativt längsta stocken
                  // (längsta = 100 %, halva längden = 50 %). Hela raden är
                  // tryckyta, så tunna staplar skadar inte träffbarheten.
                  const widthPct = ((st.maskin_langd_cm ?? maxLangd) / maxLangd) * 100;
                  const heightPx = 16 + ((st.maskin_toppdia_mm ?? maxDia) / maxDia) * 18;
                  const lenM = st.maskin_langd_cm != null
                    ? dec(st.maskin_langd_cm / 100, 1)
                    : '–';
                  const avvikText = hasAvvikData
                    ? `${fmtAvvikelse(sDia, 'mm')} mm`
                    : 'mätning saknas';
                  const stockLenCm = st.maskin_langd_cm ?? 0;
                  const segments = planerPerStock[idx] ?? [];
                  return (
                    <div
                      key={st.id}
                      className="kalib-stam-stock-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => openStockDetalj(st, data.stammar)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openStockDetalj(st, data.stammar);
                        }
                      }}
                    >
                      <div
                        className={`kalib-stam-stock-form ${formCls}`}
                        style={{
                          width: `${widthPct}%`,
                          height: `${heightPx}px`,
                          borderRadius: `${heightPx / 2}px`,
                        }}
                      >
                        {stockLenCm > 0 && segments.map((seg, j) => (
                          <div
                            key={j}
                            className="kalib-stam-stock-plan-overlay"
                            style={{
                              left: `${(seg.startInStockCm / stockLenCm) * 100}%`,
                              width: `${((seg.endInStockCm - seg.startInStockCm) / stockLenCm) * 100}%`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="kalib-stam-stock-label">
                        Stock {st.stock_nummer} · {st.sortiment_namn ?? '–'} · {lenM} m · {avvikText}
                      </div>
                    </div>
                  );
                })}
              </div>

              {planer.length > 0 && (
                <div className="kalib-card kalib-stamhallning-detalj">
                  <div className="kalib-stamhallning-list">
                    <div className="kalib-stamhallning-row kalib-stamhallning-head">
                      <span className="kalib-stamhallning-pos">Läge på stammen</span>
                      <span className="kalib-stamhallning-len">Längd</span>
                      <span className="kalib-stamhallning-dia">Diameter</span>
                    </div>
                    {planer.map((p, idx) => {
                      const startM = dec(p.startCm / 100, 1);
                      const endM = dec(p.endCm / 100, 1);
                      return (
                        <div key={idx} className="kalib-stamhallning-row">
                          <span className="kalib-stamhallning-pos">{startM} – {endM} m</span>
                          <span className="kalib-stamhallning-len">{p.lengthCm} cm</span>
                          <span className="kalib-stamhallning-dia">{p.diameterMm} mm</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ),
        });
      };

      pushModal({
        title: 'Kontroll',
        subtitle: `${datumStr} · ${cap(k.tradslag ?? '')} · ${stockText(k.antal_kontrollstockar ?? data.stockar.length)}`,
        body: (
          <>
            {(selText || measurer) && (
              <div className="kalib-pill-row">
                {selText && <span className="kalib-pill-tag">{selText}</span>}
                {measurer && <span className="kalib-pill-meta">{measurer}</span>}
              </div>
            )}

            {w && (
              <div className="kalib-weather-strip">
                {w.temperature_c != null && (
                  <div className="kalib-weather-item">
                    <MSym name="thermostat" size={18} color="#8E8E93" />
                    <span className={`kalib-weather-val ${w.is_freezing ? 'cold' : ''}`}>
                      {Math.round(w.temperature_c)}°
                    </span>
                  </div>
                )}
                {(() => {
                  const snow = w.snowfall_cm ?? 0;
                  const rain = w.precipitation_mm ?? 0;
                  const hasSnow = snow > 0;
                  const hasRain = !hasSnow && rain > 0;
                  const iconName = hasSnow ? 'weather_snowy' : 'water_drop';
                  const text = hasSnow ? `${dec(snow, 1)} cm snö`
                    : hasRain ? `${dec(rain, 1)} mm`
                    : 'Uppehåll';
                  return (
                    <div className="kalib-weather-item">
                      <MSym name={iconName} size={18} color="#8E8E93" />
                      <span className="kalib-weather-val">{text}</span>
                    </div>
                  );
                })()}
                {w.wind_speed_ms != null && (
                  <div className="kalib-weather-item">
                    <MSym name="air" size={18} color="#8E8E93" />
                    <span className="kalib-weather-val">{dec(w.wind_speed_ms, 1)} m/s</span>
                  </div>
                )}
              </div>
            )}

            <div className="kalib-card">
              <div className="kalib-tol-header">
                <div className="kalib-tol-label">Längd · {MATT.traffprocent.term}</div>
                <div className={`kalib-tol-value tone-${lenStatusTone === 'bad' ? 'hot' : 'ok'}`}>
                  {lenKlavade.length === 0 ? 'Ej klavad' : lenTraff != null ? `${lenTraff}%` : '–'}
                </div>
              </div>
              <div className="kalib-swarm" aria-label="Stockfördelning längd">
                <div className="kalib-swarm-tol" />
                <div className="kalib-swarm-zero" />
                {stockDist.filter((e) => e.lenKl).map((e) => (
                  <div
                    key={e.id}
                    className={`kalib-swarm-dot tone-${avvikelseTon(e.sLen, 'len')}`}
                    style={{ left: `${swarmX(e.sLen, 2 * tolLen)}%`, top: `${swarmY(e)}%` }}
                    title={`Stam ${e.stam_nummer}·${e.stock_nummer}: ${fmtAvvikelse(e.sLen, 'cm')} cm`}
                  />
                ))}
                {/* Ingen snitt-markör för längd — längd bedöms på träffprocent, inte snitt.
                    Oklavade stockar ritas inte — de har ingen avvikelse. */}
              </div>
              <div className="kalib-swarm-scale">
                <span>−{fmtKrav(2 * tolLen)}</span><span>±{fmtKrav(tolLen)} tolerans</span><span>+{fmtKrav(2 * tolLen)} cm</span>
              </div>
              <div className={`kalib-tol-status tone-${lenStatusTone}`}>
                <span className="kalib-tol-status-dot" />
                {lenLabel}
              </div>
            </div>

            <div className="kalib-card">
              <div className="kalib-tol-header">
                <div className="kalib-tol-label">Diameter</div>
                <div className={`kalib-tol-value tone-${diaKlavade.length === 0 ? 'ok' : avvikelseTon(diaSnitt, 'dia')}`}>
                  {diaKlavade.length === 0 ? 'Ej klavad' : `${fmtAvvikelse(diaSnitt, 'mm')} mm`}
                </div>
              </div>
              <div className="kalib-swarm" aria-label="Stockfördelning diameter">
                <div className="kalib-swarm-tol" />
                <div className="kalib-swarm-zero" />
                {stockDist.filter((e) => e.diaKl).map((e) => (
                  <div
                    key={e.id}
                    className={`kalib-swarm-dot tone-${avvikelseTon(e.sDia, 'dia')}`}
                    style={{ left: `${swarmX(e.sDia, 2 * tolDia)}%`, top: `${swarmY(e)}%` }}
                    title={`Stam ${e.stam_nummer}·${e.stock_nummer}: ${fmtAvvikelse(e.sDia, 'mm')} mm`}
                  />
                ))}
                {diaKlavade.length > 0 && (
                  <div
                    className="kalib-swarm-snitt"
                    style={{ left: `${swarmX(diaSnitt, 2 * tolDia)}%` }}
                    title={`Snitt: ${fmtAvvikelse(diaSnitt, 'mm')} mm`}
                  />
                )}
              </div>
              <div className="kalib-swarm-scale">
                <span>−{fmtKrav(2 * tolDia)}</span><span>±{fmtKrav(tolDia)} tolerans</span><span>+{fmtKrav(2 * tolDia)} mm</span>
              </div>
              <div className={`kalib-tol-status tone-${diaStatusTone}`}>
                <span className="kalib-tol-status-dot" />
                {diaLabel}
              </div>
            </div>

            <div className="kalib-modal-section-header">
              <div className="kalib-modal-section-title">Stockar</div>
              <div className="kalib-modal-section-subtitle">
                {data.stockar.length} kontrollerade
              </div>
            </div>
            <div className="kalib-stockar-list">
              {data.stockar.map((s) => {
                // Klavad = operatören har faktiskt mätt. Oklavat värde (0/NULL)
                // får aldrig visas som avvikelse — samma regel som resten av vyn.
                const lenKl = s.operator_langd_cm != null && s.operator_langd_cm !== 0;
                const sLen = s.langd_avvikelse_cm ?? 0;
                const sLenTon = lenKl ? avvikelseTon(sLen, 'len') : 'ok';

                // Max diameter-avvikelse över alla mätpunkter + toppen,
                // med tecknet på det värdet som har störst absolut värde.
                const mpAvvik = s.matpunkter
                  .filter(m => m.diameter_maskin_mm != null
                            && m.diameter_operator_mm != null)
                  .map(m => (m.diameter_maskin_mm as number)
                          - (m.diameter_operator_mm as number));
                const diaKl = mpAvvik.length > 0
                  || (s.operator_toppdia_mm != null && s.operator_toppdia_mm !== 0);
                const allaDiaAvvik = [...mpAvvik, s.dia_avvikelse_mm ?? 0];
                const sDia = allaDiaAvvik.reduce(
                  (a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0
                );
                const sDiaTon = diaKl ? avvikelseTon(sDia, 'dia') : 'ok';

                // Raden bär varningen: dess ton = värsta måttet (delad skala).
                const tonRank: Record<ToneToken, number> = { ok: 0, cold: 1, hi: 2, hot: 3 };
                const worstTon: ToneToken =
                  tonRank[sDiaTon] >= tonRank[sLenTon] ? sDiaTon : sLenTon;
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openStamVy(s.stam_nummer)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openStamVy(s.stam_nummer);
                      }
                    }}
                    className={`kalib-stock-row tone-${worstTon}`}
                  >
                    <div className="kalib-stock-row-num">{s.stam_nummer}·{s.stock_nummer}</div>
                    <div className="kalib-stock-row-info">
                      <div className="kalib-stock-row-title">
                        {s.sortiment_namn ?? '–'}
                      </div>
                      <div className="kalib-stock-row-meta">
                        {s.maskin_langd_cm != null ? `${s.maskin_langd_cm} cm` : '–'}
                        {' · '}
                        {s.maskin_toppdia_mm != null ? `⌀ ${s.maskin_toppdia_mm} mm` : '–'}
                      </div>
                    </div>
                    <div className="kalib-stock-row-diff">
                      <span className={`kalib-stock-row-len tone-${sLenTon}`}>
                        {lenKl ? `${fmtAvvikelse(sLen, 'cm')} cm` : 'ej klavad'}
                      </span>
                      <span className={`kalib-stock-row-dia tone-${sDiaTon}`}>
                        {diaKl ? `${fmtAvvikelse(sDia, 'mm')} mm` : 'ej klavad'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ),
      });
    },
    // pushModal är inte useCallback-stabil men det är OK — vi tar omräkning
    // av denna callback varje render hellre än att svälja exhaustive-deps.
    [laddarKontroll, fetchKontroll, pushModal, bedomning]
  );

  // === Derived data ===
  // Senaste-fliken använder ALLTID hela datasetet (oberoende av filter)
  const latestKalib = heroFilnamn ? (allKalib.find(k => k.filnamn === heroFilnamn) ?? null) : (allKalib[0] ?? null);
  const latestStockar = latestKalib ? (stockMap[latestKalib.filnamn] || []).sort((a, b) => a.stock_nummer - b.stock_nummer) : [];
  const totalLatestLen = latestStockar.reduce((a, s) => a + s.maskin_langd_cm, 0);
  // Antal stockar utanför tolerans (delad skala: dia ±4 mm, längd ±2 cm).
  // Bär den lågmälda summeringen på Senaste — hero-talet färgas separat på snittet.
  const latestUtanfor = latestStockar.filter(
    (s) => avvikelseTon(s.dia_avvikelse_mm ?? 0, 'dia') !== 'ok'
        || avvikelseTon(s.langd_avvikelse_cm ?? 0, 'len') !== 'ok'
  ).length;

  // Filtrerade datakällor — Historik och Rapport räknar på dessa
  const filteredKalib = effectiveSelected === 'all' ? allKalib.filter(k => arAktiv(k.maskin_id)) : allKalib.filter(k => k.maskin_id === effectiveSelected);

  // Per-species stats (weighted by antal_kontrollstockar) — Historik bars + Rapport tabell
  const speciesData: Record<string, { count: number; totalStockar: number; lenDiff: number; diaDiff: number }> = {};
  filteredKalib.forEach(k => {
    const key = k.tradslag.toLowerCase();
    if (!speciesData[key]) speciesData[key] = { count: 0, totalStockar: 0, lenDiff: 0, diaDiff: 0 };
    speciesData[key].count++;
    speciesData[key].totalStockar += k.antal_kontrollstockar;
    speciesData[key].lenDiff += k.langd_avvikelse_snitt_cm * k.antal_kontrollstockar;
    speciesData[key].diaDiff += k.dia_avvikelse_snitt_mm * k.antal_kontrollstockar;
  });
  Object.values(speciesData).forEach(v => {
    if (v.totalStockar > 0) {
      v.lenDiff = Math.round(v.lenDiff / v.totalStockar * 10) / 10;
      v.diaDiff = Math.round(v.diaDiff / v.totalStockar * 10) / 10;
    }
  });

  // Report averages (weighted) — Rapport
  const totalStockar = filteredKalib.reduce((a, k) => a + k.antal_kontrollstockar, 0);
  const avgLenReport = totalStockar > 0 ? Math.round(filteredKalib.reduce((a, k) => a + k.langd_avvikelse_snitt_cm * k.antal_kontrollstockar, 0) / totalStockar * 10) / 10 : 0;
  const avgDiaReport = totalStockar > 0 ? Math.round(filteredKalib.reduce((a, k) => a + k.dia_avvikelse_snitt_mm * k.antal_kontrollstockar, 0) / totalStockar * 10) / 10 : 0;

  // Avvikelsefärg kommer ENBART från delade avvikelseStatus/avvikelseTon
  // (modulnivå). De gamla lenOut/diaOut/stockLenCls/stockDiaCls är borttagna.

  // === Modals ===
  const openStockModal = (stock: DetaljKontrollStock) => {
    const lenDiff = stock.langd_avvikelse_cm;
    const diaDiff = stock.dia_avvikelse_mm;
    // "Klavad" = operatören har mätt. Utan operatörsvärde finns ingen avvikelse
    // och ingen dom — säg "Ej klavad", inte "Inom" (avvikelseTon(NULL) → 'ok').
    const lenKlavad = stock.operator_langd_cm != null && stock.operator_langd_cm !== 0;
    const diaKlavad = stock.operator_toppdia_mm != null && stock.operator_toppdia_mm !== 0;
    const opLen = lenKlavad ? `${stock.operator_langd_cm} cm` : '–';
    const opDia = diaKlavad ? `${stock.operator_toppdia_mm} mm` : '–';
    const lenTon = lenKlavad ? avvikelseTon(lenDiff, 'len') : 'ok';
    const diaTon = diaKlavad ? avvikelseTon(diaDiff, 'dia') : 'ok';
    const badgeText = (t: ToneToken) => (t === 'ok' ? 'Inom' : t === 'cold' ? 'Under' : 'Utanför');
    const maskinW = Math.max(180, stock.maskin_langd_cm * 0.7);
    const maskinH = Math.max(28, stock.maskin_toppdia_mm * 0.22);
    const operatorW = Math.max(180, stock.operator_langd_cm * 0.7);
    const operatorH = Math.max(28, stock.operator_toppdia_mm * 0.22);
    const stockBorderClass = diaTon === 'ok' ? '' : `stock-ton-${diaTon}`;

    pushModal({
      title: `Stock ${stock.stock_nummer}`,
      subtitle: `Stam ${stock.stam_nummer} • ${stock.kontroll_datum}`,
      body: (
        <>
          <div className="kalib-stock-compare">
            <div className="kalib-stock-compare-row">
              <div className="kalib-stock-compare-label">Maskin</div>
              <div className={`kalib-log-body ${stockBorderClass}`} style={{ width: maskinW, height: maskinH }}>
                <span className="kalib-log-num">{stock.maskin_langd_cm} cm</span>
              </div>
            </div>
            <div className="kalib-stock-compare-row">
              <div className="kalib-stock-compare-label">Operatör</div>
              <div className="kalib-log-body" style={{ width: operatorW, height: operatorH }}>
                <span className="kalib-log-num">{opLen}</span>
              </div>
            </div>
          </div>
          <div className="kalib-total-summary">
            <div className="kalib-total-title">Mätjämförelse</div>
            <div className="kalib-total-grid two-col">
              <div className="kalib-total-item">
                <div className="kalib-total-label">Längd maskin</div>
                <div className="kalib-total-value">{stock.maskin_langd_cm}<span className="kalib-total-unit"> cm</span></div>
              </div>
              <div className="kalib-total-item">
                <div className="kalib-total-label">Längd operatör</div>
                <div className="kalib-total-value">{lenKlavad ? <>{stock.operator_langd_cm}<span className="kalib-total-unit"> cm</span></> : '–'}</div>
              </div>
            </div>
          </div>
          <div className="kalib-summary-row" style={{ marginTop: 16 }}>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">{AVVIKELSE.langd}</div>
              <div className={`kalib-summary-value tone-${lenTon}`}>{lenKlavad ? `${fmtAvvikelse(lenDiff, 'cm')} cm` : '–'}</div>
              <div className={`kalib-diff-badge tone-${lenTon}`}>{lenKlavad ? badgeText(lenTon) : 'Ej klavad'}</div>
            </div>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">Topp ⌀ maskin</div>
              <div className="kalib-summary-value">{stock.maskin_toppdia_mm} mm</div>
              <div className="kalib-summary-hint">op: {opDia}</div>
            </div>
            <div className="kalib-summary-item">
              <div className="kalib-summary-label">{AVVIKELSE.topp}</div>
              <div className={`kalib-summary-value tone-${diaTon}`}>{diaKlavad ? `${fmtAvvikelse(diaDiff, 'mm')} mm` : '–'}</div>
              <div className={`kalib-diff-badge tone-${diaTon}`}>{diaKlavad ? badgeText(diaTon) : 'Ej klavad'}</div>
            </div>
          </div>
          {(() => {
            // Toppdiametern ovan är EN diameterpunkt (vid kapsnittet). Maskinen
            // mäter dessutom längs stocken — de punkterna ingår i statistiken
            // precis som toppen, så modalen får inte se ut som om toppen vore
            // hela sanningen. Klavad-gating som resten av vyn.
            const mps = (stock.matpunkter ?? [])
              .filter((m) => m.diameter_maskin_mm != null)
              .sort((a, b) => a.position_cm - b.position_cm);
            if (mps.length === 0) return null;
            const totalt = mps.length + (diaKlavad ? 1 : 0);
            return (
              <>
                <div className="kalib-modal-section-header">
                  <div className="kalib-modal-section-title">Mätpunkter längs stocken</div>
                  <div className="kalib-modal-section-subtitle">
                    {diaKlavad
                      ? `Toppen ovan är 1 av ${totalt} diametermått — alla ingår i statistiken`
                      : `${mps.length} diametermått på stocken — alla ingår i statistiken`}
                  </div>
                </div>
                <div className="kalib-mp-list">
                  {mps.map((m) => {
                    const kl = m.diameter_operator_mm != null && m.diameter_operator_mm !== 0;
                    const d = kl ? (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number) : null;
                    const ton = d != null ? avvikelseTon(d, 'dia') : 'ok';
                    return (
                      <div key={m.position_cm} className="kalib-mp-row">
                        <div className="kalib-mp-pos">{m.position_cm} cm</div>
                        <div className="kalib-mp-meta">
                          Maskin {m.diameter_maskin_mm} mm
                          {kl ? ` · Operatör ${m.diameter_operator_mm} mm` : ' · ej klavad av operatör'}
                        </div>
                        <div className={`kalib-mp-diff tone-${ton}`}>
                          {d != null ? `${fmtAvvikelse(d, 'mm')} mm` : 'ej klavad'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
          {stock.maskin_volym_sub != null && (() => {
            // Operatörsvolym kräver att operatören klavat BÅDE längd och diameter.
            // Utan det kan volymen (och diffen) inte finnas — visa "–", ingen diff.
            const volKlavad = lenKlavad && diaKlavad && stock.operator_volym_sub != null;
            return (
              <div className="kalib-info-box neutral" style={{ marginTop: 16 }}>
                <span className="kalib-info-icon"><MSym name="inventory_2" size={20} color="#fff" /></span>
                <div className="kalib-info-content">
                  <div className="kalib-info-title">Volym (m³fub)</div>
                  <div className="kalib-info-text">
                    Maskin: {dec(stock.maskin_volym_sub, 4)} • Operatör: {volKlavad ? dec(stock.operator_volym_sub!, 4) : '–'}
                    {volKlavad && stock.volym_avvikelse != null ? ` • Diff: ${dec(stock.volym_avvikelse, 4)}` : ''}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )
    });
  };


  const openSpeciesDetail = (species: string) => {
    const data = speciesData[species];
    if (!data) return;
    const name = species === 'gran' ? 'Gran' : species === 'tall' ? 'Tall' : species.charAt(0).toUpperCase() + species.slice(1);
    const speciesKalibs = filteredKalib.filter(k => k.tradslag.toLowerCase() === species).slice(0, 20);

    pushModal({
      title: name,
      subtitle: `${data.count} kontroller`,
      body: (
        <>
          <div className="kalib-total-summary">
            <div className="kalib-total-title">Snitt för {name.toLowerCase()}</div>
            <div className="kalib-total-grid two-col">
              <div className="kalib-total-item"><div className="kalib-total-label">{AVVIKELSE.langd}</div><div className={`kalib-total-value tone-${avvikelseTon(data.lenDiff, 'len', data.count)}`}>{fmtAvvikelse(data.lenDiff, 'cm')}<span className="kalib-total-unit"> cm</span></div></div>
              <div className="kalib-total-item"><div className="kalib-total-label">{AVVIKELSE.dia}</div><div className={`kalib-total-value tone-${avvikelseTon(data.diaDiff, 'dia', data.count)}`}>{fmtAvvikelse(data.diaDiff, 'mm')}<span className="kalib-total-unit"> mm</span></div></div>
            </div>
          </div>
          <div className="kalib-modal-section-header"><div className="kalib-modal-section-title">Senaste kontroller</div></div>
          <div className="kalib-overview-grid">
            {speciesKalibs.map(k => {
              const d = new Date(k.datum);
              const cls = avvikelseTon(k.dia_avvikelse_snitt_mm, 'dia');
              return (
                <div key={k.id} className="kalib-overview-log" onClick={() => openKontrollFull(k.filnamn)}>
                  <div className="kalib-overview-num">{d.getDate()}</div>
                  <div className="kalib-overview-info">
                    <div className="kalib-overview-title">{d.toLocaleDateString('sv-SE')}</div>
                    <div className="kalib-overview-meta">{stockText(k.antal_kontrollstockar)} • {k.status === 'VARNING' ? 'Varning' : 'Inom'}</div>
                  </div>
                  <div className={`kalib-diff-badge tone-${cls}`}>{fmtAvvikelse(k.dia_avvikelse_snitt_mm, 'mm')} mm</div>
                </div>
              );
            })}
          </div>
          <div className="kalib-info-box neutral">
            <span className="kalib-info-icon"><MSym name="bar_chart" size={20} color="#fff" /></span>
            <div className="kalib-info-content">
              <div className="kalib-info-title">Tillräckligt underlag?</div>
              <div className="kalib-info-text">{data.count >= 5 ? `Ja, ${data.count} kontroller ger ett bra underlag.` : 'Fler kontroller behövs för att dra säkra slutsatser.'}</div>
            </div>
          </div>
        </>
      )
    });
  };

  const openCalendarDayModal = (dag: CalDag) => {
    pushModal({
      title: dagrubrik(dag.datum),
      subtitle: dagstatusText(dag.status),
      body: (
        <>
          {dag.maskiner.map(m => {
            const namn = maskinNamn(m);
            return (
            <div key={m.maskin_id} className={`kalib-day-maskin ${m.status === 'inaktiv' ? 'inaktiv' : ''}`}>
              <div className="kalib-day-maskin-header">
                <div>
                  <div className="kalib-day-maskin-namn">{namn}</div>
                </div>
                <span className={`kalib-status-badge ${m.status}`}>{maskinStatusText(m.status)}</span>
              </div>
              <div className="kalib-day-maskin-meta">
                {dec(m.volym_m3sub, 2)} m³fub{m.status === 'inaktiv' ? ' · Inaktiv' : m.huvudtyp ? ` · ${m.huvudtyp}` : ''}
              </div>
              {m.huvudtyp_okand && (
                <div className="kalib-day-maskin-info">
                  <MSym name="info" size={14} color="#8E8E93" />
                  <span>Objekttyp ej angiven</span>
                </div>
              )}
              {m.kontroller.length > 0 && (
                <div className="kalib-day-maskin-kontroller">
                  {m.kontroller.map(k => {
                    const full = allKalib.find(x => x.id === k.id);
                    return (
                      <div
                        key={k.id}
                        className="kalib-day-maskin-kontroll"
                        onClick={full ? () => openKontrollFull(full.filnamn) : undefined}
                        style={full ? { cursor: 'pointer' } : undefined}
                      >
                        {cap(k.tradslag ?? '')} · {kontrollStatusText(k.status)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            );
          })}
        </>
      ),
    });
  };

  if (loading) {
    return (
      <>
        <style jsx global>{`
          .kalib-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',sans-serif;color:#8E8E93;background:#000}
          .kalib-spinner{width:32px;height:32px;border:3px solid rgba(255,255,255,0.08);border-top-color:#fff;border-radius:50%;animation:kalibSpin 0.8s linear infinite;margin-bottom:16px}
          @keyframes kalibSpin{to{transform:rotate(360deg)}}
        `}</style>
        <div className="kalib-loading"><div className="kalib-spinner" /><div>Laddar kontrolldata…</div></div>
      </>
    );
  }

  if (fetchError && allKalib.length === 0) {
    return (
      <>
        <style jsx global>{`
          .kalib-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',sans-serif;color:#8E8E93;text-align:center;padding:40px;background:#000}
          .kalib-empty-icon{margin-bottom:16px;color:#8E8E93}
          .kalib-empty-icon .material-symbols-outlined{font-size:64px}
          .kalib-empty-icon.error .material-symbols-outlined{font-size:24px;color:#FF3B30}
          .kalib-empty-title{font-size:22px;font-weight:600;color:#fff;margin-bottom:8px}
          .kalib-empty-text{font-size:15px;max-width:320px;color:#8E8E93}
          .kalib-empty-retry{margin-top:24px;height:44px;padding:0 24px;background:rgba(255,255,255,0.08);border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:500;font-family:inherit;cursor:pointer}
          .kalib-empty-retry:active{background:rgba(255,255,255,0.12)}
        `}</style>
        <div className="kalib-empty">
          <div className="kalib-empty-icon error"><span className="material-symbols-outlined">error_outline</span></div>
          <div className="kalib-empty-title">Kunde inte ladda kontrolldata</div>
          <div className="kalib-empty-text">{fetchError}</div>
          <button className="kalib-empty-retry" onClick={fetchData}>Försök igen</button>
        </div>
      </>
    );
  }

  if (allKalib.length === 0) {
    return (
      <>
        <style jsx global>{`
          .kalib-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',sans-serif;color:#8E8E93;text-align:center;padding:40px;background:#000}
          .kalib-empty-icon{margin-bottom:16px;color:#8E8E93}
          .kalib-empty-icon .material-symbols-outlined{font-size:64px}
          .kalib-empty-title{font-size:22px;font-weight:600;color:#fff;margin-bottom:8px}
          .kalib-empty-text{font-size:15px;max-width:320px;color:#8E8E93}
        `}</style>
        <div className="kalib-empty">
          <div className="kalib-empty-icon"><span className="material-symbols-outlined">straighten</span></div>
          <div className="kalib-empty-title">Inga kontrollmätningar</div>
          <div className="kalib-empty-text">När HQC-filer importeras visas kontrolldata här med jämförelser och statistik.</div>
        </div>
      </>
    );
  }

  const reportDate = new Date(allKalib[0].datum).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  // Rapport-headline bedöms mot profilen när EN maskin är vald. Aggregatet 'alla'
  // har ingen enskild profil → faller tillbaka på snitt-toleransen som förr.
  const reportBed = effectiveSelected !== 'all' && bedomning && bedomning.maskin_id === effectiveSelected ? bedomning : null;
  const trData = effectiveSelected !== 'all' ? (tradslagMap[effectiveSelected] ?? null) : null;
  // Rader utan underlag (båda cellerna under grind 30) göms — "Björk · n 0" sa inget.
  const trRader = trData ? trData.tradslag.filter(t => t.diameter.n >= 30 || t.langd.n >= 30) : [];
  // Sidfotens "sedan …" = första kontrollen i urvalet.
  const forstaDatum = filteredKalib.reduce<string | null>((m, k) => (m == null || k.datum < m ? k.datum : m), null);
  const reportSedan = forstaDatum ? new Date(forstaDatum).toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }) : '–';
  const reportDiaBed = reportBed ? bedomProfil(reportBed.diameter, 'diameter', reportBed.trosklar) : null;
  const reportLenBed = reportBed ? bedomProfil(reportBed.langd, 'langd', reportBed.trosklar) : null;
  const verdictWithinTolerance = reportBed
    ? [reportDiaBed, reportLenBed].filter((b): b is NonNullable<typeof b> => !!b && !b.larmTyst).every(b => b.status === 'ok')
    : avvikelseStatus({ värde: avgLenReport, enhet: 'len' }) === 'ok'
      && avvikelseStatus({ värde: avgDiaReport, enhet: 'dia' }) === 'ok';

  const partialBanner = partialError ? (
    <div className="kalib-info-box warn" style={{ marginBottom: 16 }}>
      <span className="kalib-info-icon"><MSym name="warning" size={20} color="#FF3B30" /></span>
      <div className="kalib-info-content">
        <div className="kalib-info-title">{partialError}</div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <style jsx global>{`
        .kalib-page{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',sans-serif;background:#000;color:#fff;line-height:1.45;min-height:100vh;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
        .kalib-page *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}

        .kalib-nav{display:flex;justify-content:center;gap:8px;padding:12px 20px;background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);position:sticky;top:calc(56px + env(safe-area-inset-top));z-index:100;border-bottom:0.5px solid #2C2C2E}
        .kalib-pill{height:44px;padding:0 18px;border-radius:999px;font-size:14px;font-weight:500;color:#8E8E93;background:transparent;border:none;cursor:pointer;font-family:inherit;transition:background 0.15s,color 0.15s}
        .kalib-pill.active{background:#fff;color:#000;font-weight:600}

        /* Läsbredd 880 centrerad (som tidigare PageContainer bred). ≥1000px får
           de breda vyerna (Trend/Rapport/Kalender, klass .wide) mer bredd —
           Senaste stannar 880. Under 1000px är .wide oförändrad (880). */
        .kalib-container{width:100%;max-width:880px;margin-inline:auto;padding:24px clamp(16px,4vw,24px) 32px;box-sizing:border-box}
        @media(min-width:1000px){
          .kalib-container.wide{max-width:1320px}
        }

        .kalib-page-header{margin:0 0 24px}
        .kalib-page-title{font-size:28px;font-weight:600;letter-spacing:-0.02em;line-height:1.15;margin:0 0 6px;color:#fff}
        .kalib-page-subtitle{font-size:15px;color:#8E8E93;margin:0}

        .kalib-card{background:#1C1C1E;border-radius:14px;padding:20px;margin-bottom:12px;border:1px solid rgba(255,255,255,0.06)}
        .kalib-section-title{font-size:17px;font-weight:600;margin:0 0 4px;color:#fff}
        .kalib-section-subtitle{font-size:13px;color:#8E8E93;margin:0 0 18px}

        .kalib-hero-metrics{display:flex;gap:12px;margin-bottom:16px}
        .kalib-hero-metric{flex:1;text-align:center;padding:20px 12px;background:rgba(255,255,255,0.04);border-radius:12px}
        .kalib-hero-metric-value{font-size:36px;font-weight:700;line-height:1;margin-bottom:6px;letter-spacing:-0.02em;color:#8E8E93}
        /* Hero = TRÄFFPROCENT, färgad via profilbedömningen (sämsta-styr).
           grå = mål uppnått (tyst) · orange = under mål · röd = under golv. */
        .kalib-hero-metric-value.tone-ok{color:#8E8E93}
        .kalib-hero-metric-value.tone-cold{color:#0A84FF}
        .kalib-hero-metric-value.tone-hi{color:#FF9F0A}
        .kalib-hero-metric-value.tone-hot{color:#FF453A}
        /* Lågmäld summeringsrad på Senaste — ersätter gröna/röda info-rutan. */
        .kalib-lugn-rad{display:flex;align-items:center;gap:8px;margin-top:16px;font-size:13px;color:#8E8E93;line-height:1.4}
        .kalib-hero-metric-label{font-size:14px;color:#8E8E93;font-weight:500}
        .kalib-hero-metric-hint{font-size:13px;color:#8E8E93;margin-top:4px}
        /* Profil-chip + periodrad på hjälte-kortet. */
        .kalib-hero-topline{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
        .kalib-profil-chip{font-size:11px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;color:#0A84FF;background:rgba(10,132,255,0.12);padding:4px 9px;border-radius:999px;white-space:nowrap}
        .kalib-profil-chip.muted{color:#8E8E93;background:rgba(255,255,255,0.06)}
        .kalib-hero-period{font-size:12px;color:#8E8E93;margin-bottom:14px}
        /* === Förarvyn (diagnos): en stam, ett band, två meningar === */
        .kalib-forarvy{display:flex;flex-direction:column;align-items:center;text-align:center;padding:28px 20px 22px}
        .kalib-diag-stem{width:100%;max-width:320px;height:auto}
        .kalib-diag-stem-body{fill:#48484A}
        .kalib-forarvy-bra .kalib-diag-stem-body{fill:#3A3A3C}
        .kalib-diag-band.diag{fill:#FF453A;fill-opacity:0.85}
        .kalib-diag-band.tendens{fill:#FF9F0A;fill-opacity:0.8}
        .kalib-diag-stemlabels{display:flex;justify-content:space-between;width:100%;max-width:320px;font-size:12px;color:#8E8E93;margin:2px 6px 0}
        .kalib-forarvy-etikett{font-size:13px;color:#8E8E93;margin:0 0 18px}
        .kalib-diag-text{margin:24px 0 4px}
        .kalib-diag-m1{font-size:28px;font-weight:600;letter-spacing:-0.02em;color:#fff;line-height:1.2}
        .kalib-diag-m1.laddar{color:#8E8E93;font-weight:500}
        .kalib-diag-m2{font-size:17px;color:#8E8E93;margin-top:8px}
        .kalib-forarvy-diagnos .kalib-diag-m2{color:#EBEBF5;font-weight:500}
        .kalib-diag-m3{font-size:14px;color:#8E8E93;margin-top:10px;max-width:340px;line-height:1.4}
        .kalib-diag-tal{font-size:14px;color:#8E8E93;margin-top:12px;font-variant-numeric:tabular-nums}
        .kalib-visa-siffror{margin-top:22px;background:none;border:none;color:#8E8E93;font-size:15px;display:inline-flex;align-items:center;gap:2px;cursor:pointer;padding:8px 12px;min-height:44px}
        .kalib-tillbaka{background:none;border:none;color:#0A84FF;font-size:16px;display:inline-flex;align-items:center;gap:2px;cursor:pointer;padding:8px 4px;min-height:44px;margin-bottom:4px}
        /* Stabilitetsrutnät */
        .kalib-grid-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
        .kalib-stab-grid{border-collapse:collapse;font-size:13px;width:100%;margin-top:8px}
        .kalib-stab-grid th{color:#8E8E93;font-weight:500;padding:4px 8px;text-align:center;font-variant-numeric:tabular-nums}
        .kalib-stab-klass{color:#EBEBF5;font-weight:500;padding:6px 10px 6px 0;white-space:nowrap;text-align:left}
        .kalib-stab-cell{padding:6px 8px;text-align:center;font-variant-numeric:tabular-nums;border-radius:6px;color:#8E8E93}
        .kalib-stab-cell.hi{color:#FF9F0A;background:rgba(255,159,10,0.10)}
        .kalib-stab-cell.hot{color:#FF453A;background:rgba(255,69,58,0.12)}
        .kalib-stab-cell.tunn{color:#48484A}
        .kalib-stab-cell.empty{color:#3A3A3C}
        /* Planområden + träff-per-klass staplar */
        .kalib-plat-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
        .kalib-plat-row{display:flex;align-items:center;gap:10px}
        .kalib-plat-klass{width:62px;font-size:13px;color:#EBEBF5;flex-shrink:0;font-variant-numeric:tabular-nums}
        .kalib-plat-bar{flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden}
        .kalib-plat-fill{display:block;height:100%;background:#636366;border-radius:4px}
        .kalib-plat-fill.under{background:#FF453A}
        .kalib-plat-val{width:70px;text-align:right;font-size:13px;color:#8E8E93;font-variant-numeric:tabular-nums}
        .kalib-plat-n{color:#48484A;font-size:11px}
        /* Åtgärdsmarkörer */
        .kalib-markor-list{display:flex;flex-direction:column;gap:8px;margin:12px 0}
        .kalib-markor-row{display:flex;align-items:center;gap:8px;font-size:14px}
        .kalib-markor-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;background:#636366}
        .kalib-markor-dot.reparation{background:#FF9F0A}
        .kalib-markor-dot.atgard{background:#0A84FF}
        .kalib-markor-datum{color:#8E8E93;font-variant-numeric:tabular-nums;flex-shrink:0}
        .kalib-markor-text{color:#EBEBF5}
        .kalib-markor-form{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
        .kalib-markor-date{background:rgba(255,255,255,0.06);border:none;border-radius:8px;color:#fff;padding:10px;font-size:14px;min-height:44px}
        .kalib-markor-input{flex:1;min-width:140px;background:rgba(255,255,255,0.06);border:none;border-radius:8px;color:#fff;padding:10px;font-size:14px;min-height:44px}
        .kalib-markor-save{background:#0A84FF;border:none;border-radius:8px;color:#fff;font-weight:600;padding:0 18px;min-height:44px;cursor:pointer}
        .kalib-markor-save:disabled{opacity:0.4}
        /* === Objekt-fliken === */
        .kalib-objdom{border-left:3px solid transparent}
        .kalib-objdom.tone-border-hot{border-left-color:#FF453A}
        .kalib-objdom.tone-border-ok{border-left-color:#8E8E93}
        .kalib-objdom-rubrik{font-size:20px;font-weight:600;line-height:1.25}
        .kalib-objdom-rubrik.tone-ok{color:#fff}
        .kalib-objdom-rubrik.tone-hot{color:#FF453A}
        .kalib-objdom-tal{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;font-size:14px;color:#EBEBF5}
        .kalib-objdom-tal b{font-size:17px}
        .kalib-objdom-meta{margin-top:10px;font-size:12px;color:#8E8E93;font-variant-numeric:tabular-nums}
        .kalib-objdom-attr{margin-top:12px;font-size:14px;color:#EBEBF5;line-height:1.4}
        .kalib-obj-list{display:flex;flex-direction:column;margin-top:8px}
        .kalib-obj-row{display:flex;align-items:center;gap:12px;padding:12px 8px;min-height:44px;background:none;border:none;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;text-align:left;width:100%}
        .kalib-obj-row.vald{background:rgba(255,255,255,0.05)}
        .kalib-obj-namn{flex:1;color:#fff;font-size:15px}
        .kalib-obj-traff{width:52px;text-align:right;font-size:15px;font-weight:600;color:#8E8E93;font-variant-numeric:tabular-nums}
        .kalib-obj-traff.tone-hot{color:#FF453A}
        .kalib-obj-traff.tunn{font-weight:400;font-size:12px}
        .kalib-obj-maskin{width:64px;text-align:right;font-size:11px;color:#8E8E93;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        /* Grupperad lista — rubriken bär ordet ("Under kravet"), raden bär bara talet */
        .kalib-obj-grupp{margin-top:18px}
        .kalib-obj-grupp:first-child{margin-top:10px}
        .kalib-obj-grupp-rubrik{display:flex;align-items:center;justify-content:space-between;width:100%;padding:0 8px 8px;font-size:13px;font-weight:600;letter-spacing:.02em;color:#8E8E93;background:none;border:none;border-bottom:1px solid rgba(255,255,255,0.10);font-family:inherit;text-align:left}
        .kalib-obj-grupp-rubrik.under{color:#FF453A}
        .kalib-obj-grupp-rubrik.godkand{color:#EBEBF5}
        .kalib-obj-grupp-rubrik.toggle{min-height:44px;padding:10px 8px;cursor:pointer}
        .kalib-obj-namn-sub{display:block;font-size:12px;color:#8E8E93;font-weight:400}
        .kalib-obj-toggle{width:100%;min-height:44px;padding:10px 8px;background:none;border:none;color:#0A84FF;font-size:14px;font-family:inherit;text-align:left;cursor:pointer}
        /* === Tidsserie-graf (Trend Läget) === */
        .kalib-tidschart{width:100%;max-width:520px;height:auto;display:block}
        .kalib-tc-grid{stroke:rgba(255,255,255,0.08);stroke-width:1;vector-effect:non-scaling-stroke}
        .kalib-tc-ylabel{fill:#8E8E93;font-size:8px}
        .kalib-tc-xlabel{fill:#8E8E93;font-size:8px}
        .kalib-tc-krav{stroke:#8E8E93;stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
        .kalib-tc-kravlabel{fill:#8E8E93;font-size:8px}
        .kalib-tc-markor{stroke-width:1;vector-effect:non-scaling-stroke}
        .kalib-tc-markor.reparation{stroke:#FF9F0A;stroke-dasharray:2 2}
        .kalib-tc-markor.atgard{stroke:#0A84FF;stroke-dasharray:2 2}
        .kalib-tc-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}
        .kalib-tc-leg{display:flex;align-items:center;gap:5px;font-size:12px;color:#8E8E93;font-variant-numeric:tabular-nums}
        .kalib-tc-leg i{width:12px;height:3px;border-radius:2px;display:inline-block}
        .kalib-tc-tunt{font-size:11px;color:#8E8E93;margin-top:6px;line-height:1.4;opacity:0.85}
        /* === "Flaxar den?" — spridningen === */
        .kalib-tc-band{fill:rgba(255,255,255,0.05)}
        .kalib-tc-riktning{font-size:11px;color:#8E8E93;margin-right:4px;white-space:nowrap}
        .kalib-fackterm{font-size:12px;font-weight:400;color:#8E8E93;margin-left:8px}
        .kalib-flax-larn{display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)}
        .kalib-flax-ex{display:flex;align-items:center;gap:8px;font-size:12px;color:#8E8E93}
        .kalib-flax-spark{width:64px;height:18px;flex-shrink:0}
        .kalib-flax-slutsats{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)}
        .kalib-flax-rubrik{font-size:17px;font-weight:600;line-height:1.3;color:#8E8E93}
        .kalib-flax-slutsats.flaxar .kalib-flax-rubrik{color:#fff}
        .kalib-flax-atgard{font-size:15px;color:#8E8E93;margin-top:6px;line-height:1.4}
        .kalib-flax-slutsats.flaxar .kalib-flax-atgard{color:#EBEBF5}
        .kalib-flax-tillagg{font-size:13px;color:#8E8E93;margin-top:8px;line-height:1.4;font-style:italic}
        /* === "Så ligger du till" — de tre Vida-talen + hjälpte åtgärden? === */
        .kalib-lage-rader{display:flex;flex-direction:column;margin-top:-6px}
        .kalib-lage-rad{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,0.06)}
        .kalib-lage-rad:first-child{border-top:none}
        .kalib-lage-left{min-width:0}
        .kalib-lage-fraga{font-size:17px;font-weight:600;color:#fff;line-height:1.2}
        .kalib-lage-term{font-size:12px;color:#8E8E93;margin-top:2px}
        .kalib-lage-right{text-align:right;flex-shrink:0}
        .kalib-lage-varde{font-size:28px;font-weight:700;letter-spacing:-0.5px;line-height:1.1;font-variant-numeric:tabular-nums;color:#8E8E93}
        .kalib-lage-varde.tone-hi{color:#FF9F0A}
        .kalib-lage-varde.tone-hot{color:#FF453A}
        .kalib-lage-krav{font-size:12px;color:#8E8E93;margin-top:2px}
        .kalib-lage-atgard{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)}
        .kalib-lage-atgard-rubrik{font-size:17px;font-weight:600;color:#fff}
        .kalib-lage-atgard-markor{font-size:13px;color:#8E8E93;margin-top:2px}
        .kalib-lage-fe-head{font-size:11px;color:#8E8E93;text-transform:uppercase;letter-spacing:0.4px;margin-top:10px}
        .kalib-lage-fe-rad{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(255,255,255,0.04)}
        .kalib-lage-fe-fraga{font-size:14px;color:#EBEBF5}
        .kalib-lage-fe-right{text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}
        .kalib-lage-fe-tal{font-size:15px;color:#8E8E93}
        .kalib-lage-fe-tal b{color:#fff;font-weight:600}
        .kalib-lage-delta{font-size:12px;margin-top:2px;color:#8E8E93}
        .kalib-lage-delta.battre{color:#30D158}
        .kalib-lage-delta.samre{color:#FF453A}
        .kalib-lage-dom{font-size:17px;font-weight:600;color:#fff;margin-top:12px;line-height:1.3}
        .kalib-lage-tillagg{font-size:13px;color:#8E8E93;margin-top:6px;line-height:1.4}
        .kalib-lage-fortidigt{font-size:15px;color:#8E8E93;margin-top:8px;line-height:1.4}
        .kalib-lage-n{font-size:12px;color:#8E8E93}
        /* === Hjälptext "?" === */
        .kalib-hjalp-btn{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:#8E8E93;font-size:15px;font-weight:600;cursor:pointer;flex-shrink:0}
        .kalib-hjalp-body{padding:4px 4px 8px}
        .kalib-hjalp-sekt{margin-bottom:20px}
        .kalib-hjalp-fraga{font-size:18px;font-weight:600;color:#fff;margin-bottom:6px}
        .kalib-hjalp-term{font-size:13px;font-weight:400;color:#8E8E93;margin-left:6px}
        .kalib-hjalp-body p{font-size:15px;color:#EBEBF5;line-height:1.45;margin:0}
        .kalib-hjalp-slutord{font-size:15px;color:#fff;font-weight:500;line-height:1.45;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08)}
        .kalib-hjalp-note{margin-top:14px;font-size:13px;color:#8E8E93}

        .kalib-info-box{display:flex;gap:12px;padding:14px 16px;border-radius:12px;align-items:center}
        .kalib-info-box.ok{background:rgba(52,199,89,0.1);border:1px solid rgba(52,199,89,0.2)}
        .kalib-info-box.warn{background:rgba(255,59,48,0.1);border:1px solid rgba(255,59,48,0.2)}
        .kalib-info-box.neutral{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)}
        .kalib-info-icon{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:28px;height:28px}
        .kalib-info-content{flex:1}
        .kalib-info-title{font-size:14px;font-weight:600;margin-bottom:2px;color:#fff}
        .kalib-info-box.warn .kalib-info-title{color:#FF3B30}
        .kalib-info-text{font-size:13px;color:#8E8E93;line-height:1.4}

        /* Stem-viz fyller kolumnen (ingen horisontell scroll) — blocken flex-
           delar bredden proportionellt mot längd (inline flex-grow per stock). */
        .kalib-stem-viz{padding:8px 0 16px}
        .kalib-stem-viz-inner{display:flex;align-items:flex-end;gap:6px;width:100%}
        .kalib-stem-label{font-size:11px;color:#8E8E93;padding:0 2px;align-self:center;flex:0 0 auto}
        .kalib-log-block{display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:transform 0.15s;min-width:0}
        .kalib-log-block:active{transform:scale(0.96)}
        .kalib-log-body{width:100%;min-width:4px;background:#2C2C2E;border-radius:6px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.06);overflow:hidden}
        .kalib-log-body.warn-stock{border:1.5px solid #8E8E93}
        .kalib-log-body.bad-stock{border:1.5px solid #FF3B30}
        /* Senaste stem-block via delade skalan (ok = ingen kant, tyst) */
        .kalib-log-body.stock-ton-cold{border:1.5px solid #0A84FF}
        .kalib-log-body.stock-ton-hi{border:1.5px solid #FF9F0A}
        .kalib-log-body.stock-ton-hot{border:1.5px solid #FF453A}
        .kalib-log-num{color:#fff;font-size:14px;font-weight:600}
        .kalib-log-info{text-align:center;min-width:0;max-width:100%}
        .kalib-log-length{font-size:12px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .kalib-log-product{font-size:10px;color:#8E8E93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        .kalib-btn-stem{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:56px;padding:0 20px;margin-top:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;font-size:15px;font-weight:500;color:#fff;cursor:pointer;font-family:inherit}
        .kalib-btn-stem-arrow{color:#8E8E93;display:flex;align-items:center}

        .kalib-bars{display:flex;flex-direction:column;gap:18px}
        .kalib-bar-group{display:flex;align-items:flex-start;gap:10px;cursor:pointer}
        .kalib-bar-content{flex:1;min-width:0}
        .kalib-bar-chev{flex-shrink:0;display:flex;align-items:center;padding-top:2px}
        .kalib-bar-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}
        .kalib-bar-species{font-size:15px;font-weight:600;color:#fff}
        .kalib-bar-count{font-size:12px;color:#8E8E93}
        .kalib-bar-row{display:flex;align-items:center;gap:12px;margin-bottom:6px}
        .kalib-bar-label{width:64px;font-size:12px;color:#8E8E93}
        .kalib-bar-track{flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;position:relative;overflow:hidden}
        .kalib-bar-zero{position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.15)}
        .kalib-bar-fill{position:absolute;top:0;bottom:0;border-radius:3px;background:#fff}
        .kalib-bar-fill.bad{background:#FF3B30}
        .kalib-bar-fill.neg{right:50%}
        .kalib-bar-fill.pos{left:50%}
        .kalib-bar-value{width:64px;text-align:right;font-size:13px;font-weight:600;color:#fff}
        .kalib-bar-value.bad{color:#FF3B30}

        .kalib-list{}
        .kalib-list-item{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 0;border-bottom:0.5px solid #2C2C2E;cursor:pointer}
        .kalib-list-item:last-child{border-bottom:none}
        .kalib-list-date{width:48px;text-align:center;flex-shrink:0;white-space:nowrap;font-size:13px;color:#fff}
        .kalib-list-day{font-weight:600}
        .kalib-list-month{color:#8E8E93;margin-left:4px}
        .kalib-list-info{width:88px;flex-shrink:0}
        .kalib-list-species{display:block;font-size:14px;font-weight:500;color:#fff}
        .kalib-list-stem{font-size:12px;color:#8E8E93}
        .kalib-list-bar-container{flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;position:relative}
        .kalib-list-bar{height:100%;border-radius:3px;background:#fff}
        .kalib-list-bar.bad{background:#FF3B30}
        .kalib-list-value{width:70px;text-align:right;font-size:14px;font-weight:600;color:#fff;flex-shrink:0;white-space:nowrap}
        .kalib-list-value.bad{color:#FF3B30}

        /* === Kalender-fliken === */
        /* === Trend-fliken — kurva + tidsfilter + auto-mening === */

        /* iOS-segmenterad kontroll: enhetväxling (Dia/Längd) och fönsterbredd */
        .kalib-trend-seg{display:flex;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.06);border-radius:9px;padding:2px;margin:0 0 10px;width:100%}
        .kalib-trend-seg-btn{flex:1;min-height:44px;padding:0 4px;border-radius:7px;border:none;background:transparent;color:#8E8E93;font-size:13px;font-weight:500;cursor:pointer;transition:background 0.12s,color 0.12s;display:flex;align-items:center;justify-content:center}
        .kalib-trend-seg-btn:hover{color:#fff}
        .kalib-trend-seg-btn.active{background:#3A3A3C;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.4)}

        /* Bläddringsrad: pilar + fönsteretikett. Som månads-navigatorn i Kalendern. */


        /* Trendkurvan: SVG-polyline + HTML-punkter ovanpå för klick/tooltip.
           Plot-rutan är egen container så att xPctFor/yPct mappar 1:1 mot
           både SVG:ns viewBox (0..100) och HTML-positionerna (left/top:%). */



        /* === Kontroll-lista under kurvan: dag-grupperade kort, Apple-rent === */
        /* Topprad: lugn orientering, ingen rubrik-stor stil. */

        /* Tom-stat: bara text, ingen tom låda. */

        /* Dag-grupp: mjuk rubrik + ett kort som rymmer alla dagens rader. */

        /* Rad: knapp som tar hela bredden, 12px gap, 12/14 padding, separerad
           med 0.5px botten-border utom på sista. */

        /* Färgprick 8×8 — diverging-skala, samma värden som nivå 1/2/3. */

        /* Mittenkolumn: objektnamn + meta staplade, ellipsis vid truncate. */
        /* Namn tar bara sin naturliga bredd (växer inte) → värdet sitter intill
           namnet i stället för ytterst höger; chevron skjuts ut med margin-auto. */

        /* Värde: grå inom tolerans, annars samma färg som pricken. */

        .kalib-cal-header{display:flex;align-items:center;justify-content:space-between;padding:10px 0;margin-bottom:14px}
        .kalib-cal-nav{width:44px;height:44px;border-radius:22px;background:#1C1C1E;border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-family:inherit}
        .kalib-cal-nav:active{background:#2A2A2C}
        .kalib-cal-title{font-size:18px;font-weight:600;color:#fff;letter-spacing:-0.01em}

        .kalib-cal-summary{padding:20px}
        .kalib-cal-summary.skeleton .kalib-cal-summary-big,
        .kalib-cal-summary.skeleton .kalib-cal-summary-sub{background:rgba(255,255,255,0.04);border-radius:6px;color:transparent}
        .kalib-cal-summary-big{font-size:24px;font-weight:600;color:#fff;letter-spacing:-0.01em;line-height:1.2}
        .kalib-cal-summary-sub{font-size:13px;color:#8E8E93;margin-top:4px}
        .kalib-cal-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}
        .kalib-cal-summary-grid.two{grid-template-columns:repeat(2,1fr)}
        .kalib-cal-summary-item{text-align:center;padding:12px 8px;background:rgba(255,255,255,0.04);border-radius:10px}
        .kalib-cal-summary-num{font-size:22px;font-weight:700;line-height:1;letter-spacing:-0.02em;color:#fff}
        .kalib-cal-summary-lbl{font-size:11px;color:#8E8E93;margin-top:6px}

        /* === Globalt maskinfilter — knappband + bottom-sheet === */
        .kalib-filter-row{position:sticky;top:calc(118px + env(safe-area-inset-top));z-index:90;background:rgba(0,0,0,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);padding:8px 20px;border-bottom:0.5px solid #2C2C2E}
        .kalib-filter-btn{display:flex;align-items:center;gap:10px;width:100%;height:44px;padding:0 16px;background:#1C1C1E;border:1px solid rgba(255,255,255,0.06);border-radius:12px;font-family:inherit;font-size:14px;font-weight:500;color:#fff;cursor:pointer}
        .kalib-filter-btn:active{background:#2A2A2C}
        .kalib-filter-label{flex:1;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

        .kalib-sheet-search{width:100%;height:44px;padding:0 14px;margin-bottom:12px;background:#2C2C2E;border:none;border-radius:10px;color:#fff;font-size:15px;outline:none;font-family:inherit}
        .kalib-sheet-search::placeholder{color:#8E8E93}
        .kalib-sheet-list{display:flex;flex-direction:column}
        .kalib-sheet-row{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:0 8px;background:transparent;border:none;border-bottom:0.5px solid #2C2C2E;text-align:left;cursor:pointer;font-family:inherit}
        .kalib-sheet-row:last-child{border-bottom:none}
        .kalib-sheet-row:active{background:rgba(255,255,255,0.04)}
        .kalib-sheet-check{display:flex;align-items:center;justify-content:center;width:24px;flex-shrink:0}
        .kalib-sheet-label{flex:1;font-size:15px;color:#fff;font-weight:500}
        .kalib-sheet-sold{color:#8E8E93;font-weight:400}

        /* Rutnätet cappas vid 7×64 + gap → cellerna blir max 64px och rutnätet
           centreras. Telefon (smalare) fyller bredden; iPad slutar blåsa upp. */
        .kalib-cal-weekdays{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;max-width:484px;margin:0 auto 8px;text-align:center;font-size:11px;color:#8E8E93;font-weight:500}
        .kalib-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;max-width:484px;margin-inline:auto}
        .kalib-cal-cell{aspect-ratio:1;min-height:44px;display:flex;align-items:center;justify-content:center;border-radius:12px;position:relative;padding:8px;font-family:inherit}
        .kalib-cal-cell.empty{visibility:hidden}
        .kalib-cal-cell.clickable{cursor:pointer;min-height:56px}
        .kalib-cal-num{font-size:14px;font-weight:500;color:#fff}
        .kalib-cal-cell.komplett{background:rgba(52,199,89,0.15)}
        .kalib-cal-cell.saknas{background:rgba(255,59,48,0.15)}
        .kalib-cal-cell.saknas .kalib-cal-num{color:#FF3B30}
        .kalib-cal-cell.varning{background:rgba(255,59,48,0.15);border:1.5px solid #FF3B30}
        .kalib-cal-cell.varning .kalib-cal-num{color:#FF3B30}
        .kalib-cal-cell.inaktiv{background:transparent}
        .kalib-cal-cell.inaktiv .kalib-cal-num{color:#8E8E93}
        .kalib-cal-cell.today{box-shadow:inset 0 0 0 1.5px #fff}
        .kalib-cal-cell.skeleton{background:rgba(255,255,255,0.04)}

        .kalib-cal-legend{display:flex;flex-direction:column;gap:6px;margin-top:16px;font-size:11px;color:#8E8E93;align-items:flex-start}
        .kalib-cal-legend-row{display:flex;align-items:center;gap:8px}
        .kalib-cal-legend-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0}
        .kalib-cal-legend-dot.green{background:#34C759}
        .kalib-cal-legend-dot.red{background:#FF3B30}
        .kalib-cal-legend-dot.red-ring{background:#FF3B30;box-shadow:0 0 0 2px rgba(255,59,48,0.3)}

        .kalib-status-badge{font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;white-space:nowrap;flex-shrink:0}
        .kalib-status-badge.komplett{color:#34C759;background:rgba(52,199,89,0.15)}
        .kalib-status-badge.saknas{color:#FF3B30;background:rgba(255,59,48,0.12)}
        .kalib-status-badge.varning{color:#FF3B30;background:rgba(255,59,48,0.12)}
        .kalib-status-badge.inaktiv{color:#8E8E93;background:rgba(255,255,255,0.04)}

        .kalib-day-maskin{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:8px}
        .kalib-day-maskin.inaktiv{opacity:0.5}
        .kalib-day-maskin-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
        .kalib-day-maskin-namn{font-size:15px;font-weight:600;color:#fff}
        .kalib-day-maskin-id{font-size:12px;color:#8E8E93;margin-top:2px}
        .kalib-day-maskin-meta{font-size:13px;color:#fff}
        .kalib-day-maskin-info{display:flex;align-items:center;gap:6px;font-size:12px;color:#8E8E93;margin-top:4px}
        .kalib-day-maskin-kontroller{display:flex;flex-direction:column;gap:4px;margin-top:10px;padding-top:10px;border-top:0.5px solid #2C2C2E}
        .kalib-day-maskin-kontroll{font-size:13px;color:#8E8E93}

        .kalib-report{background:#1C1C1E;border-radius:14px;padding:24px 20px;border:1px solid rgba(255,255,255,0.06)}
        .kalib-report-header{display:flex;align-items:center;gap:14px;padding-bottom:18px;border-bottom:0.5px solid #2C2C2E;margin-bottom:20px}
        .kalib-report-title-block{flex:1}
        .kalib-report-title{font-size:18px;font-weight:600;color:#fff}
        .kalib-report-date{font-size:12px;color:#8E8E93;text-align:right}
        .kalib-report-section{margin-bottom:22px}
        .kalib-report-section-title{font-size:13px;font-weight:600;color:#fff;margin:0 0 4px}
        /* Rapport per-trädslag: träff% (huvudtal) + syst/std stödtal, per maskins profil */
        .kalib-tr-table{border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);margin-top:8px}
        .kalib-tr-head{display:grid;grid-template-columns:1.1fr 1fr 1fr;padding:9px 14px;font-size:12px;color:#8E8E93;background:rgba(255,255,255,0.03)}
        .kalib-tr-row{display:grid;grid-template-columns:1.1fr 1fr 1fr;padding:12px 14px;border-top:0.5px solid #2C2C2E;cursor:pointer;align-items:start;gap:8px}
        .kalib-tr-namn{color:#fff;font-size:15px;font-weight:500;display:flex;align-items:center;gap:2px}
        .kalib-tr-cellinner{min-width:0}
        .kalib-tr-traff{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}
        .kalib-tr-traff.tone-ok{color:#8E8E93}
        .kalib-tr-traff.tone-hi{color:#FF9F0A}
        .kalib-tr-traff.tone-hot{color:#FF453A}
        .kalib-tr-stod{font-size:11px;color:#8E8E93;margin-top:4px;line-height:1.35}
        .kalib-tr-tunt{font-size:13px;color:#8E8E93}
        .kalib-tr-not{font-size:12px;color:#8E8E93;margin-top:8px;line-height:1.4}
        .kalib-report-results{display:flex;flex-direction:column;gap:14px;margin-bottom:18px}
        .kalib-report-result{display:flex;align-items:center;gap:14px}
        .kalib-report-result-label{width:72px;font-size:13px;color:#8E8E93}
        .kalib-report-result-value{width:72px;text-align:right;font-size:14px;font-weight:600;color:#fff}
        .kalib-report-result-value.bad{color:#FF3B30}
        /* Reglaget borttaget → talet är huvudsignalen, färgat via delade skalan */
        /* Värdet sitter intill etiketten (inget flex:1 som slänger det längst ut) */
        .kalib-report-result-value.big{width:auto;text-align:left;font-size:20px;letter-spacing:-0.01em}
        .kalib-report-result-value.tone-ok{color:#8E8E93}
        .kalib-report-result-value.tone-cold{color:#0A84FF}
        .kalib-report-result-value.tone-hi{color:#FF9F0A}
        .kalib-report-result-value.tone-hot{color:#FF453A}
        .kalib-species-table{border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.06)}
        .kalib-table-header{display:grid;grid-template-columns:1fr 60px 70px 80px 24px;padding:10px 14px;background:rgba(255,255,255,0.04);font-size:11px;color:#8E8E93;font-weight:500}
        .kalib-table-row{display:grid;grid-template-columns:1fr 60px 70px 80px 24px;padding:14px;border-top:0.5px solid #2C2C2E;font-size:13px;cursor:pointer;color:#fff;align-items:center}
        .kalib-table-chev{display:flex;align-items:center;justify-content:flex-end}
        .kalib-table-row > span.bad{color:#FF3B30;font-weight:600}
        /* Tabellceller via delade skalan (ok = grått; Björk <10 kontroller → grått) */
        .kalib-table-row > span.tone-ok{color:#8E8E93}
        .kalib-table-row > span.tone-cold{color:#0A84FF;font-weight:600}
        .kalib-table-row > span.tone-hi{color:#FF9F0A;font-weight:600}
        .kalib-table-row > span.tone-hot{color:#FF453A;font-weight:600}
        .kalib-report-footer{display:flex;justify-content:flex-end;padding-top:18px;border-top:0.5px solid #2C2C2E;margin-top:22px}
        .kalib-report-machine{text-align:right;font-size:13px;color:#fff}
        .kalib-report-machine-sub{font-size:11px;color:#8E8E93;margin-top:2px}

        .kalib-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:200;display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.25s}
        .kalib-modal-overlay.open{opacity:1;pointer-events:auto}
        .kalib-modal{background:#1C1C1E;width:100%;max-width:560px;max-height:88vh;border-radius:20px 20px 0 0;padding:10px 20px 28px;border:1px solid rgba(255,255,255,0.06);border-bottom:none;transform:translateY(100%);transition:transform 0.3s cubic-bezier(0.2,0.8,0.2,1);overflow-y:auto}
        .kalib-modal-overlay.open .kalib-modal{transform:translateY(0)}
        .kalib-modal-handle{width:36px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 14px;touch-action:pan-y}
        .kalib-modal-header{touch-action:pan-y}
        .kalib-modal-back{display:inline-flex;align-items:center;gap:2px;background:none;border:none;color:#fff;font-size:15px;font-weight:400;font-family:inherit;cursor:pointer;padding:6px 0;margin:0 0 8px}

        .kalib-stock-compare{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
        .kalib-stock-compare-label{font-size:12px;color:#8E8E93;margin-bottom:4px}
        .kalib-modal-header{text-align:center;margin-bottom:18px}
        .kalib-modal-title{font-size:20px;font-weight:600;color:#fff}
        .kalib-modal-subtitle{font-size:13px;color:#8E8E93;margin-top:2px}
        .kalib-modal-close{display:block;width:100%;min-height:56px;padding:0 14px;margin-top:16px;background:#2A2A2C;border:1px solid rgba(255,255,255,0.06);border-radius:12px;font-size:15px;font-weight:500;color:#fff;cursor:pointer;font-family:inherit}
        .kalib-modal-section-header{margin:22px 0 10px}
        .kalib-modal-section-title{font-size:14px;font-weight:600;color:#fff}
        .kalib-modal-section-subtitle{font-size:12px;color:#8E8E93;margin-top:2px}

        .kalib-summary-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px;background:rgba(255,255,255,0.04);border-radius:12px}
        .kalib-summary-item{text-align:center}
        .kalib-summary-label{font-size:11px;color:#8E8E93;margin-bottom:4px}
        .kalib-summary-value{font-size:17px;font-weight:600;color:#fff}
        .kalib-summary-value.bad{color:#FF3B30}
        .kalib-summary-value.tone-ok{color:#fff}
        .kalib-summary-value.tone-cold{color:#0A84FF}
        .kalib-summary-value.tone-hi{color:#FF9F0A}
        .kalib-summary-value.tone-hot{color:#FF453A}
        .kalib-summary-hint{font-size:10px;color:#8E8E93;margin-top:2px}

        .kalib-diff-badge{font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;display:inline-block;margin-top:4px}
        .kalib-diff-badge.good{color:#fff;background:rgba(255,255,255,0.08)}
        .kalib-diff-badge.warn{color:#8E8E93;background:rgba(255,255,255,0.04)}
        .kalib-diff-badge.bad{color:#FF3B30;background:rgba(255,59,48,0.12)}
        /* Badge via delade skalan (ok = neutral grå) */
        .kalib-diff-badge.tone-ok{color:#8E8E93;background:rgba(255,255,255,0.06)}
        .kalib-diff-badge.tone-cold{color:#0A84FF;background:rgba(10,132,255,0.12)}
        .kalib-diff-badge.tone-hi{color:#FF9F0A;background:rgba(255,159,10,0.12)}
        .kalib-diff-badge.tone-hot{color:#FF453A;background:rgba(255,69,58,0.12)}

        .kalib-total-summary{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px}
        .kalib-total-title{font-size:12px;font-weight:600;color:#8E8E93;margin-bottom:14px}
        .kalib-total-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .kalib-total-grid.two-col{grid-template-columns:repeat(2,1fr)}
        .kalib-total-item{text-align:center}
        .kalib-total-label{font-size:11px;color:#8E8E93;margin-bottom:4px}
        .kalib-total-value{font-size:24px;font-weight:600;color:#fff;letter-spacing:-0.01em}
        .kalib-total-value.bad{color:#FF3B30}
        .kalib-total-value.tone-ok{color:#fff}
        .kalib-total-value.tone-cold{color:#0A84FF}
        .kalib-total-value.tone-hi{color:#FF9F0A}
        .kalib-total-value.tone-hot{color:#FF453A}
        .kalib-total-value.small{font-size:18px}
        .kalib-total-unit{font-size:13px;font-weight:400;color:#8E8E93}

        .kalib-overview-grid{display:flex;flex-direction:column;gap:6px}
        .kalib-overview-log{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;cursor:pointer}
        .kalib-overview-num{width:32px;height:32px;background:rgba(255,255,255,0.06);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#fff;flex-shrink:0}
        .kalib-overview-info{flex:1;min-width:0}
        .kalib-overview-title{font-size:14px;font-weight:500;color:#fff}
        .kalib-overview-meta{font-size:12px;color:#8E8E93;margin-top:2px}

        /* === Översiktsmodal: pill, väderstrip, toleransband, stockar-lista === */
        .kalib-pill-row{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:0 4px}
        .kalib-pill-tag{background:rgba(255,255,255,0.08);color:#fff;font-size:12px;font-weight:500;padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.06)}
        .kalib-pill-meta{font-size:13px;color:#8E8E93}

        .kalib-weather-strip{display:flex;align-items:center;gap:18px;padding:12px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;margin:0 0 16px;flex-wrap:wrap}
        .kalib-weather-item{display:flex;align-items:center;gap:6px}
        .kalib-weather-val{font-size:14px;font-weight:600;color:#fff}
        .kalib-weather-val.cold{color:#64D2FF}

        .kalib-tol-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
        .kalib-tol-label{font-size:14px;color:#8E8E93;font-weight:500}
        .kalib-tol-value{font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.01em}
        /* Legacy binär-klasser (kvar för stocklistan i samma modal) */
        .kalib-tol-value.warn{color:#FF9500}
        .kalib-tol-value.bad{color:#FF3B30}
        /* Diverging tone-* — samma språk som lollipop i nivå 3 */
        .kalib-tol-value.tone-ok{color:#fff}
        .kalib-tol-value.tone-cold{color:#0A84FF}
        .kalib-tol-value.tone-hi{color:#FF9F0A}
        .kalib-tol-value.tone-hot{color:#FF453A}

        /* === Stock-svärm: en dot per stock, färg per diverging-skala === */
        .kalib-swarm{position:relative;height:64px;border-radius:8px;background:rgba(255,255,255,0.025);margin:8px 0 6px;overflow:visible}
        .kalib-swarm-tol{position:absolute;top:0;bottom:0;left:25%;right:25%;background:rgba(255,255,255,0.04);border-left:1px dashed rgba(255,255,255,0.14);border-right:1px dashed rgba(255,255,255,0.14)}
        .kalib-swarm-zero{position:absolute;top:4px;bottom:4px;left:50%;width:1px;background:rgba(255,255,255,0.35);transform:translateX(-0.5px)}
        .kalib-swarm-dot{position:absolute;width:10px;height:10px;border-radius:50%;transform:translate(-50%,-50%);background:#8E8E93;box-shadow:0 0 0 2px rgba(0,0,0,0.55)}
        .kalib-swarm-dot.tone-ok{background:#8E8E93}
        .kalib-swarm-dot.tone-cold{background:#0A84FF}
        .kalib-swarm-dot.tone-hi{background:#FF9F0A}
        .kalib-swarm-dot.tone-hot{background:#FF453A}
        .kalib-swarm-snitt{position:absolute;bottom:0;width:2px;height:14px;background:rgba(255,255,255,0.85);transform:translateX(-50%);border-radius:1px;pointer-events:none}
        .kalib-swarm-snitt::after{content:'';position:absolute;bottom:14px;left:50%;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:4px solid rgba(255,255,255,0.85);transform:translateX(-50%)}
        .kalib-swarm-scale{display:flex;justify-content:space-between;font-size:11px;color:#8E8E93;margin:2px 0 12px;padding:0 2px;font-variant-numeric:tabular-nums}
        .kalib-swarm-scale span:nth-child(2){opacity:0.7}

        .kalib-tol-status{font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px}
        .kalib-tol-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        /* Status: grå = ok (ingen onödig grön), röd = utanför */
        .kalib-tol-status.tone-ok{color:#8E8E93}
        .kalib-tol-status.tone-ok .kalib-tol-status-dot{background:#8E8E93}
        .kalib-tol-status.tone-bad{color:#FF3B30}
        .kalib-tol-status.tone-bad .kalib-tol-status-dot{background:#FF3B30}

        .kalib-stockar-list{display:flex;flex-direction:column;gap:6px}
        /* Mätpunkter längs stocken i stock-modalen — STATISK lista (ingen
           cursor:pointer; raden går inte att trycka på, till skillnad från
           .kalib-stock-row). Toppen visas ovanför; dessa är de övriga. */
        .kalib-mp-list{display:flex;flex-direction:column;gap:6px}
        .kalib-mp-row{display:flex;align-items:center;gap:12px;min-height:44px;padding:8px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:10px}
        .kalib-mp-pos{width:56px;flex-shrink:0;font-size:12px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums}
        .kalib-mp-meta{flex:1;min-width:0;font-size:12px;color:#8E8E93}
        .kalib-mp-diff{flex-shrink:0;min-width:70px;text-align:right;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:#8E8E93}
        .kalib-mp-diff.tone-cold{color:#0A84FF}
        .kalib-mp-diff.tone-hi{color:#FF9F0A}
        .kalib-mp-diff.tone-hot{color:#FF453A}
        .kalib-stock-row{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;cursor:pointer;transition:background 0.12s,border-color 0.12s,transform 0.12s}
        .kalib-stock-row:hover{background:rgba(255,255,255,0.07)}
        .kalib-stock-row:active{transform:scale(0.99)}
        /* Raden bär varningen — kant/bakgrund via delade ton-skalan (ok = tyst) */
        .kalib-stock-row.tone-cold{border-color:rgba(10,132,255,0.35)}
        .kalib-stock-row.tone-hi{border-color:rgba(255,159,10,0.40)}
        .kalib-stock-row.tone-hot{border-color:rgba(255,69,58,0.40);background:rgba(255,69,58,0.06)}
        .kalib-stock-row.tone-hot:hover{background:rgba(255,69,58,0.10)}
        .kalib-stock-row-num{width:44px;height:36px;background:rgba(255,255,255,0.06);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;flex-shrink:0;font-variant-numeric:tabular-nums}
        .kalib-stock-row-info{flex:1;min-width:0}
        .kalib-stock-row-title{font-size:14px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .kalib-stock-row-meta{font-size:12px;color:#8E8E93;margin-top:2px}
        .kalib-stock-row-diff{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;min-width:70px;text-align:right}
        .kalib-stock-row-len,.kalib-stock-row-dia{font-size:12px;font-weight:600;color:#fff}
        /* Stockvärdena i delade skalan: ok = grått (tyst), annars ton-färg */
        .kalib-stock-row-len.tone-ok,.kalib-stock-row-dia.tone-ok{color:#8E8E93}
        .kalib-stock-row-len.tone-cold,.kalib-stock-row-dia.tone-cold{color:#0A84FF}
        .kalib-stock-row-len.tone-hi,.kalib-stock-row-dia.tone-hi{color:#FF9F0A}
        .kalib-stock-row-len.tone-hot,.kalib-stock-row-dia.tone-hot{color:#FF453A}

        /* === Detaljmodal: rotstock-tagg, lollipop-graf, mätpunkter-lista === */
        .kalib-stock-tag-row{display:flex;justify-content:flex-end;margin:0 0 12px}
        .kalib-stock-tag{font-size:10px;font-weight:700;letter-spacing:0.5px;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,0.08);color:#8E8E93}

        .kalib-stock-mo-line{font-size:13px;color:#8E8E93;margin-top:6px}

        .kalib-lollipop{position:relative;height:150px;margin:14px 0 4px;background:rgba(255,255,255,0.02);border-radius:8px}
        .kalib-lollipop-tol-band{position:absolute;left:0;right:0;top:30%;height:40%;background:rgba(255,255,255,0.035);border-top:1px dashed rgba(255,255,255,0.20);border-bottom:1px dashed rgba(255,255,255,0.20)}
        .kalib-lollipop-zero-line{position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,0.32)}
        .kalib-lollipop-stem{position:absolute;width:2px;background:rgba(255,255,255,0.4);transform:translateX(-1px)}
        .kalib-lollipop-marker{position:absolute;width:14px;height:14px;border-radius:50%;background:#8E8E93;transform:translate(-50%,-50%);box-shadow:0 0 0 2px #1C1C1E,0 0 0 3px rgba(255,255,255,0.3);transition:left 0.3s,top 0.3s}
        .kalib-lollipop-marker.ok{background:#8E8E93}
        .kalib-lollipop-marker.cold{background:#0A84FF}
        .kalib-lollipop-marker.hi{background:#FF9F0A}
        .kalib-lollipop-marker.hot{background:#FF453A}
        .kalib-lollipop-label{position:absolute;transform:translateX(-50%);font-size:11px;font-weight:600;color:#fff;white-space:nowrap;font-variant-numeric:tabular-nums;pointer-events:none}
        .kalib-lollipop-label.ok{color:#8E8E93}
        .kalib-lollipop-label.cold{color:#0A84FF}
        .kalib-lollipop-label.hi{color:#FF9F0A}
        .kalib-lollipop-label.hot{color:#FF453A}

        .kalib-lollipop-axis{display:flex;justify-content:space-between;margin-top:6px;padding:0 16px;font-size:11px;color:#8E8E93}

        .kalib-mp-list{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden;font-variant-numeric:tabular-nums}
        .kalib-mp-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:0.5px solid rgba(255,255,255,0.08)}
        .kalib-mp-row:last-child{border-bottom:none}
        .kalib-mp-pos{width:60px;font-size:13px;color:#8E8E93;flex-shrink:0}
        .kalib-mp-vals{flex:1;font-size:13px;color:#fff}
        .kalib-mp-diff{font-size:13px;font-weight:600;color:#fff;flex-shrink:0;min-width:44px;text-align:right}
        .kalib-mp-diff.ok{color:#8E8E93}
        .kalib-mp-diff.cold{color:#0A84FF}
        .kalib-mp-diff.hi{color:#FF9F0A}
        .kalib-mp-diff.hot{color:#FF453A}

        /* === Nivå 2: stammen som den ligger, stockar rot→topp === */
        .kalib-stam-vaxlare{display:flex;gap:6px;margin:0 0 14px;justify-content:center;flex-wrap:wrap}
        .kalib-stam-pill{height:32px;padding:0 14px;border-radius:16px;background:rgba(255,255,255,0.06);color:#8E8E93;border:none;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:background 0.12s,color 0.12s}
        .kalib-stam-pill.active{background:#fff;color:#000;font-weight:600}

        .kalib-stam-virket{display:flex;flex-direction:column;gap:18px;padding:8px 0 4px}
        .kalib-stam-stock-row{display:flex;flex-direction:column;align-items:center;cursor:pointer;transition:transform 0.12s,opacity 0.12s}
        .kalib-stam-stock-row:hover{opacity:0.92}
        .kalib-stam-stock-row:active{transform:scale(0.97)}
        .kalib-stam-stock-form{position:relative;overflow:hidden;background:#8E8E93;border:1px solid rgba(255,255,255,0.10);transition:background 0.15s;box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -1px 0 rgba(0,0,0,0.15)}
        .kalib-stam-stock-form.ok{background:#8E8E93}
        .kalib-stam-stock-form.cold{background:#0A84FF}
        .kalib-stam-stock-form.hi{background:#FF9F0A}
        .kalib-stam-stock-form.hot{background:#FF453A}
        .kalib-stam-stock-form.null{background:transparent;border:1.5px dashed rgba(255,255,255,0.25);box-shadow:none}
        .kalib-stam-stock-label{font-size:12px;color:#8E8E93;margin-top:8px;font-variant-numeric:tabular-nums;text-align:center;line-height:1.3}

        /* Stamhållning — planområden markerade som röda fält på stockarna */
        .kalib-stam-explain{font-size:13px;line-height:1.5;color:#8E8E93;padding:12px 14px;background:rgba(255,255,255,0.04);border-radius:10px;margin:0 0 14px;border:1px solid rgba(255,255,255,0.06)}
        /* Planområde-overlay: mörk diagonalskraffering + mörka sidokanter.
           Syns mot vilken stockfärg som helst (grå/blå/orange/röd) utan att
           förväxlas med stockens egen avvikelsefärg. */
        .kalib-stam-stock-plan-overlay{position:absolute;top:0;bottom:0;pointer-events:none;background-image:repeating-linear-gradient(-45deg,rgba(0,0,0,0.55) 0 3px,transparent 3px 7px);border-left:1.5px solid rgba(0,0,0,0.75);border-right:1.5px solid rgba(0,0,0,0.75)}
        .kalib-stamhallning-detalj{margin-top:14px;padding:14px 16px}
        .kalib-stamhallning-list{display:flex;flex-direction:column;gap:1px;border-radius:10px;overflow:hidden}
        .kalib-stamhallning-row{display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(255,255,255,0.04);font-size:13px;font-variant-numeric:tabular-nums}
        /* Kolumnrubriker: liten grå versal-rad, ingen tabular-siffra */
        .kalib-stamhallning-head{background:transparent;padding:2px 12px 4px;font-size:11px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase}
        .kalib-stamhallning-head .kalib-stamhallning-pos,
        .kalib-stamhallning-head .kalib-stamhallning-len,
        .kalib-stamhallning-head .kalib-stamhallning-dia{color:#8E8E93}
        .kalib-stamhallning-pos{flex:1;color:#fff}
        .kalib-stamhallning-len{color:#8E8E93;min-width:54px;text-align:right}
        .kalib-stamhallning-dia{color:#8E8E93;min-width:60px;text-align:right}

        /* Diagnos-mening under lollipop — en mening, mänskligt språk, färgton matchar allvar */
        .kalib-stock-diagnos{font-size:13px;line-height:1.5;padding:12px 14px;border-radius:10px;margin:14px 0 4px}
        .kalib-stock-diagnos.ok{background:rgba(255,255,255,0.04);color:#fff;border:1px solid rgba(255,255,255,0.06)}
        .kalib-stock-diagnos.warn{background:rgba(255,159,10,0.10);color:#fff;border:1px solid rgba(255,159,10,0.28)}
        .kalib-stock-diagnos.bad{background:rgba(255,69,58,0.10);color:#fff;border:1px solid rgba(255,69,58,0.32)}

        /* === DEL 2: selektiv bredd-layout ============================= */
        /* Legend-dubbletten i kalendern är dold tills ≥1000px (inline visas). */
        .kalib-cal-legend--side{display:none}

        @media(min-width:1000px){
          /* TREND — kontroller+kurva sticky vänster (~55%), lista höger (~45%).
             top klarar de två sticky-barerna (nav + filter). */

          /* RAPPORT — per-trädslag-tabellen fördelar kolumnerna jämnt så varje
             värde sitter under sin rubrik (löser högerklumpen). */
          .kalib-table-header,.kalib-table-row{grid-template-columns:2fr 1fr 1fr 1fr 40px}

          /* KALENDER — rutnät vänster, sammanfattning+legend höger sidopanel. */
          .kalib-cal-layout{display:flex;gap:24px;align-items:flex-start}
          .kalib-cal-layout .kalib-cal-gridcard{order:1;flex:1 1 0;min-width:0}
          .kalib-cal-layout .kalib-cal-summary{order:2;flex:0 0 300px;align-self:flex-start}
          .kalib-cal-legend--inline{display:none}
          .kalib-cal-legend--side{display:block;margin-top:16px;border-top:0.5px solid #2C2C2E;padding-top:14px}
        }

        @media(max-width:480px){
          .kalib-page-title{font-size:28px}
          .kalib-hero-metric-value{font-size:32px}
          .kalib-container{padding-top:20px}
        }
      `}</style>

      <div className="kalib-page">
        <nav className="kalib-nav">
          <button className={`kalib-pill ${activeTab === 'today' ? 'active' : ''}`} onClick={() => setActiveTab('today')}>Senaste</button>
          <button className={`kalib-pill ${activeTab === 'trend' ? 'active' : ''}`} onClick={() => setActiveTab('trend')}>Trend</button>
          <button className={`kalib-pill ${activeTab === 'objekt' ? 'active' : ''}`} onClick={() => setActiveTab('objekt')}>Objekt</button>
          <button className={`kalib-pill ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>Kalender</button>
          <button className={`kalib-pill ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>Rapport</button>
        </nav>

        {/* Maskin-filtret på alla flikar UTOM Objekt (som är maskinoberoende — filtret är objektet). */}
        {activeTab !== 'objekt' && (
          <div className="kalib-filter-row">
            <button className="kalib-filter-btn" onClick={() => { closeModal(); setMaskinSearchQ(''); setMaskinSheetOpen(true); }}>
              <MSym name="tune" size={16} color="#fff" />
              <span className="kalib-filter-label">{filterLabel}</span>
              <MSym name="expand_more" size={16} color="#8E8E93" />
            </button>
          </div>
        )}

        <PageContainer width="full">
        <div className={`kalib-container ${activeTab !== 'today' ? 'wide' : ''}`}>
          {activeTab === 'today' && latestKalib && (
            <>
              {!visaSiffror ? (
                /* ===== FÖRARVYN — tyst och tydlig: en stam, ett band, två meningar ===== */
                <>
                  {partialBanner}

                  {/* Maskinen står redan i filterchipet — här bara en liten etikett.
                      Skärmens största text är DOMEN, inte maskinnamnet. */}
                  <div className={`kalib-forarvy kalib-forarvy-${verdikt.status}`}>
                    <div className="kalib-forarvy-etikett">
                      {diagnosData?.fonster ? `Senaste ${diagnosData.fonster.dagar} dagarna` : 'Kalibrering'}{diagnosData?.profil ? ` · ${diagnosData.profil}` : ''}
                    </div>
                    <svg viewBox="0 0 320 92" className="kalib-diag-stem" role="img" aria-label="Stamdiagram med felläge">
                      <defs><clipPath id="kalibstemclip"><polygon points="12,14 308,40 308,52 12,78" /></clipPath></defs>
                      <polygon points="12,14 308,40 308,52 12,78" className="kalib-diag-stem-body" />
                      {verdikt.bandZon != null && (
                        <rect x={12 + verdikt.bandZon * ((308 - 12) / 5)} y={0} width={(308 - 12) / 5} height={92}
                          clipPath="url(#kalibstemclip)"
                          className={`kalib-diag-band ${verdikt.status === 'diagnos' ? 'diag' : 'tendens'}`} />
                      )}
                    </svg>
                    <div className="kalib-diag-stemlabels"><span>Rot</span><span>Topp</span></div>

                    {!diagnosData ? (
                      <div className="kalib-diag-text"><div className="kalib-diag-m1 laddar">Läser diagnos…</div></div>
                    ) : (
                      <div className="kalib-diag-text">
                        <div className={`kalib-diag-m1 ${verdikt.status === 'diagnos' ? 'larm' : ''}`}>{verdikt.mening1}</div>
                        <div className="kalib-diag-m2">{verdikt.mening2}</div>
                        {verdikt.mening3 && <div className="kalib-diag-m3">{verdikt.mening3}</div>}
                        {/* Lugnt läge: ETT tal, inte noll — träffprocenten ur samma 90-dagarsfönster som hjälten. */}
                        {verdikt.status === 'bra' && bedomning?.diameter?.traffPct != null && (
                          <div className="kalib-diag-tal">
                            {Math.round(bedomning.diameter.traffPct)} % {MATT.traffprocent.term}{bedomning.fonster ? ` · senaste ${bedomning.fonster.dagar} dagarna` : ''}
                          </div>
                        )}
                      </div>
                    )}

                    <button className="kalib-visa-siffror" onClick={() => setVisaSiffror(true)}>
                      Visa siffrorna <MSym name="chevron_right" size={16} color="#8E8E93" />
                    </button>
                  </div>
                </>
              ) : (
                /* ===== SIFFRORNA — för den som felsöker ===== */
                <>
                  <button className="kalib-tillbaka" onClick={() => setVisaSiffror(false)}>
                    <MSym name="chevron_left" size={18} color="#0A84FF" /> Förarvy
                  </button>

                  {/* Profil-hjälten (träff%/std) — flyttad hit bakom "Visa siffrorna" */}
                  <div className="kalib-card">
                    <div className="kalib-hero-topline">
                      <div className="kalib-section-title">Mätnoggrannhet</div>
                      {bedomning?.profil
                        ? <span className="kalib-profil-chip">Bedöms mot {bedomning.profil}</span>
                        : <span className="kalib-profil-chip muted">Ingen kravprofil</span>}
                    </div>
                    {bedomning?.fonster && (
                      <div className="kalib-hero-period">Rullande {bedomning.fonster.dagar} dagar · {bedomning.fonster.fran} → {bedomning.fonster.till}</div>
                    )}
                    <div className="kalib-hero-metrics">
                      {renderHeroVar('Diameter', 'mm', bedomning?.diameter ?? null, 'diameter')}
                      {renderHeroVar('Längd', 'cm', bedomning?.langd ?? null, 'langd')}
                    </div>
                  </div>

                  {/* a) Stabilitetsrutnät — kurva vs tryck */}
                  {diagnosData && diagnosData.klasser.some(k => k.systMonthly.length > 0) && (
                    <div className="kalib-card">
                      <div className="kalib-section-title">Stabilitet</div>
                      <div className="kalib-section-subtitle">Systematisk avvikelse (mm) per grovlek och månad. Svajar tecknet = tryck · ligger still = kurva.</div>
                      {(() => {
                        const man = Array.from(new Set(diagnosData.klasser.flatMap(k => k.systMonthly.map(m => m.manad)))).sort();
                        return (
                          <div className="kalib-grid-scroll">
                            <table className="kalib-stab-grid">
                              <thead><tr><th></th>{man.map(mo => <th key={mo}>{mo.slice(2).replace('-', '/')}</th>)}</tr></thead>
                              <tbody>
                                {diagnosData.klasser.map(k => {
                                  const byMan = new Map(k.systMonthly.map(m => [m.manad, m]));
                                  return (
                                    <tr key={k.klass}>
                                      <td className="kalib-stab-klass">{k.klass}</td>
                                      {man.map(mo => {
                                        const c = byMan.get(mo);
                                        if (!c) return <td key={mo} className="kalib-stab-cell empty">·</td>;
                                        const mag = Math.abs(c.systematik);
                                        const cls = c.n < 20 ? 'tunn' : mag >= 4 ? 'hot' : mag >= 2 ? 'hi' : 'ok';
                                        return <td key={mo} className={`kalib-stab-cell ${cls}`} title={`n=${c.n}`}>{fmtSig1(c.systematik)}</td>;
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* b) Planområden — tryckmätaren */}
                  {diagnosData && (
                    <div className="kalib-card">
                      <div className="kalib-section-title">Planområden — tryckmätaren</div>
                      <div className="kalib-section-subtitle">Andel mätpunkter där diametern inte sjunker (position &gt;130 cm). Stiger med greppfel; rör sig först vid en tryckhöjning.</div>
                      <div className="kalib-plat-list">
                        {diagnosData.klasser.map(k => (
                          <div key={k.klass} className="kalib-plat-row">
                            <span className="kalib-plat-klass">{k.klass}</span>
                            <span className="kalib-plat-bar"><span className="kalib-plat-fill" style={{ width: `${k.plateauShare ?? 0}%` }} /></span>
                            <span className="kalib-plat-val">{k.plateauShare != null ? `${Math.round(k.plateauShare)}%` : '–'}</span>
                          </div>
                        ))}
                      </div>
                      <div className="kalib-section-subtitle" style={{ marginTop: 14 }}>Över tid</div>
                      <div className="kalib-plat-list">
                        {diagnosData.plateauMonthly.map(p => (
                          <div key={p.manad} className="kalib-plat-row">
                            <span className="kalib-plat-klass">{p.manad.slice(2).replace('-', '/')}</span>
                            <span className="kalib-plat-bar"><span className="kalib-plat-fill" style={{ width: `${p.share}%` }} /></span>
                            <span className="kalib-plat-val">{Math.round(p.share)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* c) Träffprocent per grovlek */}
                  {diagnosData && (
                    <div className="kalib-card">
                      <div className="kalib-section-title">Träffprocent per grovlek</div>
                      <div className="kalib-section-subtitle">Inom ±4 mm · rullande {diagnosData.fonster?.dagar ?? 90} dagar{diagnosData.golvDia != null ? ` · golv ${diagnosData.golvDia}%` : ''}</div>
                      <div className="kalib-plat-list">
                        {diagnosData.klasser.map(k => {
                          const under = k.traffPct != null && diagnosData.golvDia != null && k.traffPct < diagnosData.golvDia && k.n >= GRIND_MIN;
                          return (
                            <div key={k.klass} className="kalib-plat-row">
                              <span className="kalib-plat-klass">{k.klass}</span>
                              <span className="kalib-plat-bar"><span className={`kalib-plat-fill ${under ? 'under' : ''}`} style={{ width: `${k.traffPct ?? 0}%` }} /></span>
                              <span className={`kalib-plat-val ${under ? 'tone-hot' : ''}`}>{k.traffPct != null ? `${Math.round(k.traffPct)}%` : '–'}<span className="kalib-plat-n"> n{k.n}</span></span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Stockar — den enskilda kontrollen */}
                  {latestStockar.length > 0 && (
                    <div className="kalib-card">
                      <div className="kalib-section-title">Stockar</div>
                      <div className="kalib-section-subtitle">{cap(latestKalib.tradslag)} • {stockText(latestStockar.length)} • {dec(totalLatestLen / 100, 1)} meter{latestUtanfor > 0 ? ` • ${latestUtanfor} utanför tolerans` : ''}</div>
                      <div className="kalib-stem-viz">
                        <div className="kalib-stem-viz-inner">
                          <span className="kalib-stem-label">Rot</span>
                          {latestStockar.map(stock => {
                            const lenUnit = Math.max(1, stock.maskin_langd_cm || 1);
                            const baseH = Math.max(18, stock.maskin_toppdia_mm * 0.18);
                            const ton = avvikelseTon(stock.dia_avvikelse_mm ?? 0, 'dia');
                            const borderCls = ton === 'ok' ? '' : `stock-ton-${ton}`;
                            return (
                              <div key={stock.id} className="kalib-log-block" style={{ flex: `${lenUnit} 1 0` }} onClick={() => openStockModal(stock)}>
                                <div className={`kalib-log-body ${borderCls}`} style={{ height: baseH }}>
                                  <span className="kalib-log-num">{stock.stock_nummer}</span>
                                </div>
                                <div className="kalib-log-info">
                                  <div className="kalib-log-length">{stock.maskin_langd_cm} cm</div>
                                  <div className="kalib-log-product">⌀{stock.maskin_toppdia_mm}</div>
                                </div>
                              </div>
                            );
                          })}
                          <span className="kalib-stem-label">Topp</span>
                        </div>
                      </div>
                      {latestStockar.length > 1 && (
                        <button
                          className="kalib-btn-stem"
                          onClick={() => openKontrollFull(latestKalib.filnamn)}
                          disabled={laddarKontroll === latestKalib.filnamn}
                          style={laddarKontroll === latestKalib.filnamn ? { opacity: 0.6 } : undefined}
                        >
                          <span>{laddarKontroll === latestKalib.filnamn ? 'Laddar…' : 'Visa alla stockar'}</span>
                          <span className="kalib-btn-stem-arrow"><MSym name="chevron_right" size={20} color="#8E8E93" /></span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Åtgärder & händelser — markörer */}
                  {diagnosData && (
                    <div className="kalib-card">
                      <div className="kalib-section-title">Åtgärder &amp; händelser</div>
                      <div className="kalib-section-subtitle">Markera vad du gjort — se vilken siffra som svarade.</div>
                      {diagnosData.markorer.length > 0 ? (
                        <div className="kalib-markor-list">
                          {diagnosData.markorer.map((m, i) => (
                            <div key={i} className="kalib-markor-row">
                              <span className={`kalib-markor-dot ${m.kalla}`} />
                              <span className="kalib-markor-datum">{m.datum}</span>
                              <span className="kalib-markor-text">{m.text}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="kalib-lugn-rad"><MSym name="info" size={16} color="#8E8E93" /><span>Inga markörer ännu.</span></div>
                      )}
                      <div className="kalib-markor-form">
                        <input type="date" className="kalib-markor-date" value={nyMarkorDatum} onChange={e => setNyMarkorDatum(e.target.value)} />
                        <input type="text" className="kalib-markor-input" placeholder="t.ex. höjde trycket till 400 mm" value={nyMarkorText} onChange={e => setNyMarkorText(e.target.value)} />
                        <button className="kalib-markor-save" onClick={sparaMarkor} disabled={markorSparar || !nyMarkorDatum || !nyMarkorText.trim()}>{markorSparar ? 'Sparar…' : 'Spara'}</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === 'trend' && (
            <>
              {partialBanner}

              {/* ===== AVSNITT 0: SÅ LIGGER DU TILL — de tre Vida-talen + hjälpte åtgärden? ===== */}
              {(() => {
                if (!bedomning) {
                  return (
                    <div className="kalib-card">
                      <div className="kalib-section-title">Så ligger du till</div>
                      <div className="kalib-lugn-rad"><MSym name="hourglass_empty" size={16} color="#8E8E93" /><span>Läser läget…</span></div>
                    </div>
                  );
                }
                const stat = bedomning.diameter;
                const tr = bedomning.trosklar;
                const bed = bedomProfil(stat, 'diameter', tr);
                const golvFor = (metrik: string): number | null => {
                  const r = tr.find(t => t.variabel === 'diameter' && t.metrik === metrik);
                  return r ? Number(r.golv) : null;
                };
                const tonFor = (metrik: string): ToneToken => {
                  if (bed.larmTyst) return 'ok';
                  const d = bed.detaljer.find(x => x.metrik === metrik);
                  return d ? PROFIL_TON[d.status] : 'ok';
                };
                // Samma format som hjälten (1 decimal, tecken på systematiken) — ett tal, ett utseende.
                const gT = golvFor('traffprocent'), gS = golvFor('systematisk'), gStd = golvFor('standardavv');
                const rader = [
                  { key: 'traffprocent', fraga: MATT.traffprocent.fraga, term: MATT.traffprocent.term,
                    varde: stat?.traffPct == null ? '–' : `${Math.round(stat.traffPct)} %`, krav: gT != null ? `krav ≥ ${fmtKrav(gT)} %` : '' },
                  { key: 'systematisk', fraga: MATT.systematisk.fraga, term: MATT.systematisk.term,
                    varde: stat?.systematisk == null ? '–' : `${fmtSig1(stat.systematisk)} mm`, krav: gS != null ? `krav ≤ ${fmtKrav(gS)} mm` : '' },
                  { key: 'standardavv', fraga: MATT.standardavv.fraga, term: MATT.standardavv.term,
                    varde: stat?.standardavv == null ? '–' : `${fmtAbs1(stat.standardavv)} mm`, krav: gStd != null ? `krav ≤ ${fmtKrav(gStd)} mm` : '' },
                ];
                const a = bedomning.atgard ?? null;
                const dom = a ? atgardDom(a) : null;
                const feRader = dom ? [
                  { key: 'traff', fraga: MATT.traffprocent.fraga, r: dom.traff, fmt: (v: number) => `${Math.round(v)} %`,
                    dTxt: `${Math.abs(Math.round(dom.traff.delta ?? 0))}`,
                    ord: dom.traff.riktning === 'battre' ? 'bättre' : dom.traff.riktning === 'samre' ? 'sämre' : 'oförändrad' },
                  { key: 'syst', fraga: MATT.systematisk.fraga, r: dom.syst, fmt: (v: number) => `${fmtSig1(v)} mm`,
                    dTxt: `${fmtAbs1(Math.abs(dom.syst.delta ?? 0))} mm`,
                    ord: dom.syst.riktning === 'battre' ? 'rakare' : dom.syst.riktning === 'samre' ? ((dom.syst.efter ?? 0) > 0 ? 'drar grövre' : 'drar klenare') : 'oförändrad' },
                  { key: 'std', fraga: MATT.standardavv.fraga, r: dom.std, fmt: (v: number) => `${fmtAbs1(v)} mm`,
                    dTxt: `${fmtAbs1(Math.abs(dom.std.delta ?? 0))} mm`,
                    ord: dom.std.riktning === 'battre' ? 'lugnare' : dom.std.riktning === 'samre' ? 'flaxar mer' : 'oförändrad' },
                ] : [];
                return (
                  <div className="kalib-card">
                    <div className="kalib-hero-topline">
                      <div className="kalib-section-title">Så ligger du till · {heroNamn}</div>
                    </div>
                    <div className="kalib-section-subtitle">
                      {bedomning.fonster ? `Rullande ${bedomning.fonster.dagar} dagar · ${stat?.n ?? 0} mått` : 'Inga kontroller ännu'}
                      {bed.larmTyst && stat && stat.n > 0 ? ' · för få mått för en dom' : ''}
                    </div>
                    <div className="kalib-lage-rader">
                      {rader.map(r => (
                        <div key={r.key} className="kalib-lage-rad">
                          <div className="kalib-lage-left">
                            <div className="kalib-lage-fraga">{r.fraga}</div>
                            <div className="kalib-lage-term">{r.term}</div>
                          </div>
                          <div className="kalib-lage-right">
                            <div className={`kalib-lage-varde tone-${tonFor(r.key)}`}>{r.varde}</div>
                            {r.krav && <div className="kalib-lage-krav">{r.krav}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {a && (
                      <div className="kalib-lage-atgard">
                        <div className="kalib-lage-atgard-rubrik">Hjälpte åtgärden?</div>
                        <div className="kalib-lage-atgard-markor">{a.text} · {fmtDagMan(a.datum)}</div>
                        {(a.forTidigt || !dom) ? (
                          <div className="kalib-lage-fortidigt">
                            För tidigt att säga — kom tillbaka när fler kontroller gjorts efter {fmtDagMan(a.datum)}.
                            <span className="kalib-lage-n"> {a.nFore} mått före · {a.nEfter} efter · behöver 30 på varje sida.</span>
                          </div>
                        ) : (
                          <>
                            <div className="kalib-lage-fe-head">90 dagar före · mot allt efter</div>
                            {feRader.map(f => (
                              <div key={f.key} className="kalib-lage-fe-rad">
                                <div className="kalib-lage-fe-fraga">{f.fraga}</div>
                                <div className="kalib-lage-fe-right">
                                  <div className="kalib-lage-fe-tal">{f.r.fore == null ? '–' : f.fmt(f.r.fore)} → <b>{f.r.efter == null ? '–' : f.fmt(f.r.efter)}</b></div>
                                  <div className={`kalib-lage-delta ${f.r.riktning}`}>
                                    {f.r.riktning === 'oforandrad' ? '→' : (f.r.delta ?? 0) > 0 ? '↑' : '↓'}{f.r.riktning === 'oforandrad' ? '' : ` ${f.dTxt}`} · {f.ord}
                                  </div>
                                </div>
                              </div>
                            ))}
                            <div className="kalib-lage-dom">{dom.rubrik}</div>
                            {dom.tillagg.map((t, i) => <div key={i} className="kalib-lage-tillagg">{t}</div>)}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ===== AVSNITT 1: LÄGET — träff & planområden per grovlek över tid ===== */}
              {(() => {
                if (!diagnosData || !diagnosData.klasser.some(k => k.traffMonthly.length)) {
                  return (
                    <div className="kalib-card">
                      <div className="kalib-section-title">Läget</div>
                      <div className="kalib-lugn-rad"><MSym name="hourglass_empty" size={16} color="#8E8E93" /><span>Läser läget…</span></div>
                    </div>
                  );
                }
                const kl = diagnosData.klasser;
                // Aggregera per valt tidssteg (default kvartal → grova når underlag och
                // kan visas solida). Grind + tonning sköts i renderTidsChart per punkt.
                const traffSeries = kl.map(k => ({ klass: k.klass, punkter: aggregeraSteg(k.traffMonthly.map(m => ({ manad: m.manad, v: m.traffPct, n: m.n })), lagetSteg) }));
                const platSeries = kl.map(k => ({ klass: k.klass, punkter: aggregeraSteg(k.plateauMonthly.map(m => ({ manad: m.manad, v: m.share, n: m.n })), lagetSteg) }));
                const perioderAv = (series: { punkter: Map<string, { v: number; n: number }> }[]) =>
                  Array.from(new Set(series.flatMap(s => Array.from(s.punkter).filter(([, p]) => p.n >= GRIND_MIN).map(([kk]) => kk)))).sort();
                const traffMan = perioderAv(traffSeries);
                const platMan = perioderAv(platSeries);
                const chartOpts = { fmtX: (m: string) => fmtPeriod(m, lagetSteg), markorKey: (d: string) => periodKey(d.slice(0, 7), lagetSteg) };
                return (
                  <>
                    <div className="kalib-card">
                      <div className="kalib-hero-topline">
                        <div className="kalib-section-title">Läget · {heroNamn}</div>
                        <button className="kalib-hjalp-btn" onClick={() => setHjalpOpen(true)} aria-label="Vad betyder talen?">?</button>
                      </div>
                      <div className="kalib-section-subtitle">Träffprocent per grovlek över tid. Klena träffar bra; grova släpar — en enda kurva döljer det.{diagnosData.golvDia != null ? ` Kravlinjen är ${diagnosData.profil}s golv.` : ''}</div>
                      <div className="kalib-trend-seg" style={{ margin: '10px 0' }}>
                        {(['manad', 'kvartal', 'ar'] as LagetSteg[]).map(s => (
                          <button key={s} className={`kalib-trend-seg-btn ${lagetSteg === s ? 'active' : ''}`} onClick={() => setLagetSteg(s)}>
                            {s === 'manad' ? 'Månad' : s === 'kvartal' ? 'Kvartal' : 'År'}
                          </button>
                        ))}
                      </div>
                      {renderTidsChart(traffMan, traffSeries, { yMax: 100, kravLinje: diagnosData.golvDia != null ? { v: diagnosData.golvDia, label: `golv ${diagnosData.golvDia}%` } : undefined, markorer: diagnosData.markorer, ...chartOpts })}
                    </div>
                    <div className="kalib-card">
                      <div className="kalib-section-title">Planområden per grovlek — tryckmätaren</div>
                      <div className="kalib-section-subtitle">Andel där diametern inte sjunker. Ska sjunka först när trycket höjs.</div>
                      {renderTidsChart(platMan, platSeries, { yMax: 80, markorer: diagnosData.markorer, ...chartOpts })}
                      <div className="kalib-markor-form">
                        <input type="date" className="kalib-markor-date" value={nyMarkorDatum} onChange={e => setNyMarkorDatum(e.target.value)} />
                        <input type="text" className="kalib-markor-input" placeholder="t.ex. höjde trycket på knivarna" value={nyMarkorText} onChange={e => setNyMarkorText(e.target.value)} />
                        <button className="kalib-markor-save" onClick={sparaMarkor} disabled={markorSparar || !nyMarkorDatum || !nyMarkorText.trim()}>{markorSparar ? 'Sparar…' : 'Markera'}</button>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ===== AVSNITT 3: FLAXAR DEN? — spridningen får en egen plats ===== */}
              {(() => {
                if (!diagnosData || !diagnosData.klasser.some(k => k.spridMonthly.length)) return null;
                const stdRow = bedomning?.trosklar.find(t => t.variabel === 'diameter' && t.metrik === 'standardavv');
                const systRow = bedomning?.trosklar.find(t => t.variabel === 'diameter' && t.metrik === 'systematisk');
                const stdGolv = stdRow ? Number(stdRow.golv) : null;
                const systMal = systRow ? Number(systRow.mal) : null;
                const kl = diagnosData.klasser;
                const spridSeries = kl.map(k => ({ klass: k.klass, punkter: aggregeraSprid(k.spridMonthly, lagetSteg) }));
                const spridMan = Array.from(new Set(spridSeries.flatMap(s => Array.from(s.punkter).filter(([, p]) => p.n >= GRIND_MIN).map(([kk]) => kk)))).sort();
                const slutsats = flaxSlutsats(kl, stdGolv, systMal);
                const yMax = Math.max(8, Math.ceil(((stdGolv ?? 5) * 1.6) / 2) * 2);
                return (
                  <>
                    <div className="kalib-section-title" style={{ margin: '18px 4px 8px' }}>
                      {MATT.standardavv.fraga} <span className="kalib-fackterm">{MATT.standardavv.term}</span>
                    </div>
                    <div className="kalib-card">
                      <div className="kalib-section-subtitle">Hoppar maskinen fram och tillbaka, eller mäter den jämnt?{stdGolv != null ? ` ${diagnosData.profil} vill att spridningen håller sig under ${fmtKrav(stdGolv)} mm.` : ''}</div>
                      {renderTidsChart(spridMan, spridSeries, {
                        yMax,
                        kravBand: stdGolv != null ? { till: stdGolv, label: `krav ≤${fmtKrav(stdGolv)} mm` } : undefined,
                        riktning: '↓ lägre = bättre',
                        markorer: diagnosData.markorer,
                        fmtX: (m: string) => fmtPeriod(m, lagetSteg),
                        markorKey: (d: string) => periodKey(d.slice(0, 7), lagetSteg),
                      })}

                      {/* Lär dig läsa kurvan — syntetisk jämförelse, inte data */}
                      <div className="kalib-flax-larn">
                        <div className="kalib-flax-ex">
                          <svg viewBox="0 0 90 26" className="kalib-flax-spark" aria-hidden="true">
                            <polyline points="2,13 12,12 22,14 32,13 42,12 52,14 62,13 72,12 82,13" fill="none" stroke="#8E8E93" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                          </svg>
                          <span>jämn — mäter lika varje gång</span>
                        </div>
                        <div className="kalib-flax-ex">
                          <svg viewBox="0 0 90 26" className="kalib-flax-spark" aria-hidden="true">
                            <polyline points="2,4 12,22 22,6 32,20 42,3 52,23 62,7 72,21 82,5" fill="none" stroke="#FF453A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                          </svg>
                          <span>flaxar — hoppar fram och tillbaka</span>
                        </div>
                      </div>

                      {/* Slutsats — uträknad ur datan, inte gissad */}
                      <div className={`kalib-flax-slutsats ${slutsats.status}`}>
                        <div className="kalib-flax-rubrik">{slutsats.rubrik}</div>
                        {slutsats.atgard && <div className="kalib-flax-atgard">{slutsats.atgard}</div>}
                        {slutsats.tillagg && <div className="kalib-flax-tillagg">{slutsats.tillagg}</div>}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {activeTab === 'objekt' && (
            <>
              <header className="kalib-page-header">
                <h1 className="kalib-page-title">Objekt</h1>
                <p className="kalib-page-subtitle">Slå upp en trakt när en kund undrar över mätningen.</p>
              </header>
              {!objektData ? (
                <div className="kalib-lugn-rad"><MSym name="hourglass_empty" size={16} color="#8E8E93" /><span>Laddar objekt…</span></div>
              ) : (
                <>
                  <input type="text" className="kalib-sheet-search" placeholder="Sök objekt" value={objektQ} onChange={e => setObjektQ(e.target.value)} />
                  {valtObjekt && (() => {
                    const o = objektData.objekt.find(x => x.object_name === valtObjekt);
                    if (!o) return null;
                    const mask = o.maskin_id ? objektData.maskiner[o.maskin_id] : undefined;
                    const dom = objektDom(o, mask);
                    return (
                      <div className={`kalib-card kalib-objdom tone-border-${dom.ton}`}>
                        <div className={`kalib-objdom-rubrik tone-${dom.ton}`}>{dom.rubrik}</div>
                        {!dom.tunn && (
                          <div className="kalib-objdom-tal">
                            <span><b>{Math.round(o.traffPct)}%</b> inom ±4 mm</span>
                            <span>{MATT.systematisk.fraga} {fmtSig1(o.systematisk)} mm</span>
                            <span>{MATT.standardavv.fraga} {fmtAbs1(o.standardavv)} mm</span>
                            <span>n {o.n}</span>
                          </div>
                        )}
                        <div className="kalib-objdom-meta">{maskinNamnFor(o.maskin_id)}{mask?.profil ? ` · ${mask.profil}` : ''} · {o.fran} → {o.till}</div>
                        {dom.attribution && <div className="kalib-objdom-attr">{dom.attribution}</div>}
                        {dom.reservation && <div className="kalib-objdom-meta">{dom.reservation}</div>}
                      </div>
                    );
                  })()}
                  {(() => {
                    // Tre grupper med rubrik — rubriken bär ordet, så procenten i raden
                    // slipper vara en röd prick. Senaste först; äldre än 6 månader bakom
                    // "Visa äldre". Sökning visar allt som matchar, oavsett hopfällning.
                    const q = objektQ.trim().toLowerCase();
                    const soker = q.length > 0;
                    const sexManSedan = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);
                    type Rad = { o: ObjektStat; b: ReturnType<typeof objektBedom>; gammal: boolean };
                    const rader: Rad[] = objektData.objekt
                      .filter(o => !soker || o.object_name.toLowerCase().includes(q))
                      .map(o => { const b = objektBedom(o, o.maskin_id ? objektData.maskiner[o.maskin_id] : undefined); return { o, b, gammal: o.till < sexManSedan }; })
                      .sort((a, b) => b.o.till.localeCompare(a.o.till));
                    const grupper: { key: ObjektGrupp; rubrik: string; hopfalld: boolean }[] = [
                      { key: 'under', rubrik: 'Under kravet', hopfalld: false },
                      { key: 'godkand', rubrik: 'Godkända', hopfalld: false },
                      { key: 'tunt', rubrik: 'För tunt underlag', hopfalld: !objektVisaTunt && !soker },
                    ];
                    const rad = (r: Rad) => {
                      const saknarNamn = objektSaknarNamn(r.o.object_name);
                      const hint = r.b.ingenProfil ? 'ingen kravprofil' : r.b.faMatningar ? 'få mätningar' : null;
                      return (
                        <button key={r.o.object_name} className={`kalib-obj-row ${valtObjekt === r.o.object_name ? 'vald' : ''}`} onClick={() => setValtObjekt(r.o.object_name)}>
                          <span className="kalib-obj-namn">
                            {saknarNamn ? <>Namn saknas<span className="kalib-obj-namn-sub">registrerat som {r.o.object_name}</span></> : r.o.object_name}
                            {hint && <span className="kalib-obj-namn-sub">{hint}</span>}
                          </span>
                          <span className={`kalib-obj-traff ${r.b.grupp === 'tunt' ? 'tunn' : ''}`}>{r.b.grupp === 'tunt' ? `n ${r.o.n}` : `${Math.round(r.o.traffPct)}%`}</span>
                          <span className="kalib-obj-maskin">{maskinKortNamnFor(r.o.maskin_id)}</span>
                        </button>
                      );
                    };
                    return (
                      <div className="kalib-obj-list">
                        {grupper.map(g => {
                          const alla = rader.filter(r => r.b.grupp === g.key);
                          if (alla.length === 0) return null;
                          const nya = alla.filter(r => !r.gammal);
                          const gamla = alla.filter(r => r.gammal);
                          const visaAldre = soker || !!objektVisaAldre[g.key];
                          return (
                            <div key={g.key} className="kalib-obj-grupp">
                              {g.key === 'tunt' ? (
                                <button className="kalib-obj-grupp-rubrik toggle" onClick={() => setObjektVisaTunt(v => !v)} aria-expanded={!g.hopfalld}>
                                  <span>{g.rubrik} · {alla.length}</span>
                                  <MSym name={g.hopfalld ? 'expand_more' : 'expand_less'} size={18} color="#8E8E93" />
                                </button>
                              ) : (
                                <div className={`kalib-obj-grupp-rubrik ${g.key}`}>{g.rubrik} ({alla.length})</div>
                              )}
                              {!g.hopfalld && (
                                <>
                                  {nya.map(rad)}
                                  {visaAldre && gamla.map(rad)}
                                  {gamla.length > 0 && !soker && (
                                    <button className="kalib-obj-toggle" onClick={() => setObjektVisaAldre(v => ({ ...v, [g.key]: !v[g.key] }))}>
                                      {visaAldre ? 'Dölj äldre' : `Visa äldre (${gamla.length})`}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                        {rader.length === 0 && (
                          <div className="kalib-lugn-rad"><MSym name="info" size={16} color="#8E8E93" /><span>{soker ? 'Inget objekt matchar sökningen.' : 'Inga objekt med kontrollmätningar ännu.'}</span></div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          )}

          {activeTab === 'calendar' && (
            <>
              {partialBanner}
              <div className="kalib-cal-header">
                <button className="kalib-cal-nav" onClick={() => setCalManad(stegManad(calManad, -1))} aria-label="Föregående månad">
                  <MSym name="chevron_left" size={24} color="#fff" />
                </button>
                <div className="kalib-cal-title">{manadNamn(calManad)}</div>
                <button className="kalib-cal-nav" onClick={() => setCalManad(stegManad(calManad, 1))} aria-label="Nästa månad">
                  <MSym name="chevron_right" size={24} color="#fff" />
                </button>
              </div>

              {calError && !calLoading && (
                <div className="kalib-info-box neutral" style={{ marginBottom: 12 }}>
                  <span className="kalib-info-icon"><MSym name="error" size={20} color="#8E8E93" /></span>
                  <div className="kalib-info-content">
                    <div className="kalib-info-title">Kunde inte ladda kalendern</div>
                    <div className="kalib-info-text">{calError}</div>
                  </div>
                </div>
              )}

              {calLoading && (
                <>
                  <div className="kalib-card kalib-cal-summary skeleton">
                    <div className="kalib-cal-summary-big">&nbsp;</div>
                    <div className="kalib-cal-summary-sub">&nbsp;</div>
                  </div>
                  <div className="kalib-card">
                    <div className="kalib-cal-weekdays"><span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span></div>
                    <div className="kalib-cal-grid">
                      {Array.from({ length: 35 }).map((_, i) => (
                        <div key={i} className="kalib-cal-cell skeleton" />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {!calLoading && calData && filteredSammanfattning && (() => {
                const sf = filteredSammanfattning;
                const subManad = manadNamn(calManad).toLowerCase();
                const todayStr = idagStr();
                const leadingEmpty = calData.dagar.length > 0 ? calData.dagar[0].veckodag - 1 : 0;
                const totalCells = leadingEmpty + calData.dagar.length;
                const trailingEmpty = (7 - (totalCells % 7)) % 7;
                // Legenden visar bara de färger som faktiskt finns i rutnätet den här månaden.
                const statusIManaden = new Set(calData.dagar.map(d => aggregeraDagFiltrerat(d, effectiveSelected)));
                const legendRader = ([
                  { st: 'komplett', cls: 'green', text: 'Kontroll lämnad' },
                  { st: 'saknas', cls: 'red', text: 'Saknas' },
                  { st: 'varning', cls: 'red-ring', text: 'Varning' },
                ] as { st: CalDagstatus; cls: string; text: string }[]).filter(r => statusIManaden.has(r.st));
                const legend = (variant: string) => legendRader.length === 0 ? null : (
                  <div className={`kalib-cal-legend ${variant}`}>
                    {legendRader.map(r => <div key={r.st} className="kalib-cal-legend-row"><span className={`kalib-cal-legend-dot ${r.cls}`} />{r.text}</div>)}
                  </div>
                );
                return (
                  <>
                    <div className="kalib-cal-layout">
                    <div className="kalib-card kalib-cal-summary">
                      {sf.produktionsdagar === 0 ? (
                        <>
                          <div className="kalib-cal-summary-big">Inga kontroller den här månaden</div>
                          <div className="kalib-cal-summary-sub">Bläddra ‹ › till en månad med produktion.</div>
                        </>
                      ) : (
                        <>
                          <div className="kalib-cal-summary-big">{sf.kompletta} av {sf.produktionsdagar} dagar kompletta</div>
                          <div className="kalib-cal-summary-sub">i {subManad}</div>
                          {sf.saknas === 0 && sf.varningar === 0 ? (
                            /* Allt grönt: två nollor är brus — en dämpad rad räcker. Rutorna
                               kommer tillbaka (röda, med tal) först när ett tal är > 0. */
                            <div className="kalib-lugn-rad"><MSym name="check" size={16} color="#8E8E93" /><span>Inga luckor</span></div>
                          ) : (
                            <div className="kalib-cal-summary-grid two">
                              <div className="kalib-cal-summary-item">
                                <div className="kalib-cal-summary-num" style={{ color: sf.saknas > 0 ? '#FF3B30' : '#8E8E93' }}>{sf.saknas}</div>
                                <div className="kalib-cal-summary-lbl">Saknas</div>
                              </div>
                              <div className="kalib-cal-summary-item">
                                <div className="kalib-cal-summary-num" style={{ color: sf.varningar > 0 ? '#FF3B30' : '#8E8E93' }}>{sf.varningar}</div>
                                <div className="kalib-cal-summary-lbl">Varningar</div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {/* Legend i sidopanelen — bara ≥1000px (togglas mot inline nedan) */}
                      {legend('kalib-cal-legend--side')}
                    </div>

                    <div className="kalib-card kalib-cal-gridcard">
                      <div className="kalib-cal-weekdays"><span>M</span><span>T</span><span>O</span><span>T</span><span>F</span><span>L</span><span>S</span></div>
                      <div className="kalib-cal-grid">
                        {Array.from({ length: leadingEmpty }).map((_, i) => (
                          <div key={`l${i}`} className="kalib-cal-cell empty" />
                        ))}
                        {calData.dagar.map(dag => {
                          const day = parseInt(dag.datum.slice(-2), 10);
                          const isToday = dag.datum === todayStr;
                          const cellStatus = aggregeraDagFiltrerat(dag, effectiveSelected);
                          const isClickable = cellStatus !== 'inaktiv';
                          const cls = `kalib-cal-cell ${cellStatus} ${isToday ? 'today' : ''} ${isClickable ? 'clickable' : ''}`.trim();
                          return (
                            <div
                              key={dag.datum}
                              className={cls}
                              onClick={isClickable ? () => openCalendarDayModal(dag) : undefined}
                            >
                              <span className="kalib-cal-num">{day}</span>
                            </div>
                          );
                        })}
                        {Array.from({ length: trailingEmpty }).map((_, i) => (
                          <div key={`t${i}`} className="kalib-cal-cell empty" />
                        ))}
                      </div>
                      {legend('kalib-cal-legend--inline')}
                    </div>
                    </div>{/* /kalib-cal-layout */}
                  </>
                );
              })()}
            </>
          )}

          {activeTab === 'report' && (
            <>
            {partialBanner}
            <div className="kalib-report">
              <div className="kalib-report-header">
                <div className="kalib-report-title-block">
                  <div className="kalib-report-title">Kvalitetsrapport</div>
                </div>
                <div className="kalib-report-date">{reportDate}</div>
              </div>

              <div className="kalib-report-section">
                <div className="kalib-report-section-title">
                  {reportBed ? `Träffprocent · rullande ${reportBed.fonster?.dagar ?? 90} dagar` : 'Avvikelse'}
                  {reportBed?.profil && <span className="kalib-profil-chip" style={{ marginLeft: 8 }}>{reportBed.profil}</span>}
                </div>
                <div className="kalib-report-results">
                  <div className="kalib-report-result">
                    <div className="kalib-report-result-label">Längd</div>
                    {reportBed
                      ? <div className={`kalib-report-result-value big tone-${reportLenBed && !reportLenBed.larmTyst ? PROFIL_TON[reportLenBed.status] : 'ok'}`}>{reportBed.langd?.traffPct != null ? `${Math.round(reportBed.langd.traffPct)} %` : '–'}</div>
                      : <div className={`kalib-report-result-value big tone-${avvikelseTon(avgLenReport, 'len')}`}>{fmtAvvikelse(avgLenReport, 'cm')} cm</div>}
                  </div>
                  <div className="kalib-report-result">
                    <div className="kalib-report-result-label">Diameter</div>
                    {reportBed
                      ? <div className={`kalib-report-result-value big tone-${reportDiaBed && !reportDiaBed.larmTyst ? PROFIL_TON[reportDiaBed.status] : 'ok'}`}>{reportBed.diameter?.traffPct != null ? `${Math.round(reportBed.diameter.traffPct)} %` : '–'}</div>
                      : <div className={`kalib-report-result-value big tone-${avvikelseTon(avgDiaReport, 'dia')}`}>{fmtAvvikelse(avgDiaReport, 'mm')} mm</div>}
                  </div>
                </div>
                {verdictWithinTolerance ? (
                  <div className="kalib-lugn-rad">
                    <MSym name="check" size={16} color="#8E8E93" />
                    <span>{reportBed ? `Inom ${reportBed.profil ? `${reportBed.profil}s` : 'profilens'} krav.` : 'Inom tolerans.'}</span>
                  </div>
                ) : (
                  <div className="kalib-lugn-rad">
                    <MSym name="info" size={16} color="#8E8E93" />
                    <span>{reportBed ? 'Under profilens krav — se per trädslag nedan.' : 'Utanför tolerans — se avvikelserna ovan.'}</span>
                  </div>
                )}
              </div>

              <div className="kalib-report-section">
                <div className="kalib-report-section-title">Träffprocent per trädslag{trData?.profil ? ` · ${trData.profil}` : ''}</div>
                {effectiveSelected === 'all' ? (
                  <div className="kalib-lugn-rad"><MSym name="info" size={16} color="#8E8E93" /><span>Välj en maskin — Gran bedöms mot olika krav på olika maskiner och kan inte slås ihop.</span></div>
                ) : !trData ? (
                  <div className="kalib-lugn-rad"><MSym name="hourglass_empty" size={16} color="#8E8E93" /><span>Laddar per-trädslag…</span></div>
                ) : trRader.length === 0 ? (
                  <div className="kalib-lugn-rad"><MSym name="info" size={16} color="#8E8E93" /><span>Inga trädslag med underlag.</span></div>
                ) : (
                  <div className="kalib-tr-table">
                    <div className="kalib-tr-head"><span>Trädslag</span><span>Diameter</span><span>Längd</span></div>
                    {trRader.map(t => (
                      <div key={t.tradslag} className="kalib-tr-row" onClick={() => openSpeciesDetail(t.tradslag.toLowerCase())}>
                        <div className="kalib-tr-namn">{cap(t.tradslag)}<MSym name="chevron_right" size={16} color="#8E8E93" /></div>
                        {renderTrCell(t.diameter, 'diameter', 'mm', trData.trosklar)}
                        {renderTrCell(t.langd, 'langd', 'cm', trData.trosklar)}
                      </div>
                    ))}
                  </div>
                )}
                {trRader.length > 0 && (
                  <div className="kalib-tr-not">Längd bedöms bara på träffprocent — stocken kapas, den driver inte gradvis. ±2 cm: klaven mäter hela cm.</div>
                )}
              </div>

              {filteredKalib.length > 0 && (
                <div className="kalib-report-footer">
                  <div className="kalib-report-machine">
                    <div>{maskinNamnFor(filteredKalib[0].maskin_id)}</div>
                    <div className="kalib-report-machine-sub">{fmtAntal(filteredKalib.length)} kontroller · {fmtAntal(totalStockar)} stockar · sedan {reportSedan}</div>
                  </div>
                </div>
              )}
            </div>
            </>
          )}
        </div>
        </PageContainer>

        {(() => {
          const top = modalStack[modalStack.length - 1];
          const isOpen = modalStack.length > 0;
          return (
            <div ref={swipeMain.overlayRef} className={`kalib-modal-overlay ${isOpen ? 'open' : ''}`} onClick={closeModal}>
              <div
                ref={swipeMain.modalRef}
                className="kalib-modal"
                onClick={e => e.stopPropagation()}
                onTouchStart={swipeMain.onTouchStart}
                onTouchMove={swipeMain.onTouchMove}
                onTouchEnd={swipeMain.onTouchEnd}
              >
                <div className="kalib-modal-handle" />
                {top?.parentLabel && (
                  <button className="kalib-modal-back" onClick={popModal}>
                    <MSym name="arrow_back_ios" size={20} color="#fff" />
                    <span>{top.parentLabel}</span>
                  </button>
                )}
                <div className="kalib-modal-header">
                  <div className="kalib-modal-title">{top?.title}</div>
                  <div className="kalib-modal-subtitle">{top?.subtitle}</div>
                </div>
                <div>{top?.body}</div>
                <button className="kalib-modal-close" onClick={closeModal}>Stäng</button>
              </div>
            </div>
          );
        })()}

        {/* === Hjälptext bakom "?" — vardagsfråga stor, fackterm dämpad, tal per profil === */}
        {hjalpOpen && (
          <div className="kalib-modal-overlay open" onClick={() => setHjalpOpen(false)}>
            <div className="kalib-modal" onClick={e => e.stopPropagation()}>
              <div className="kalib-modal-handle" />
              <div className="kalib-modal-header"><div className="kalib-modal-title">Vad betyder talen?</div></div>
              <div className="kalib-hjalp-body">
                {(() => {
                  const tr = bedomning?.trosklar ?? [];
                  const g = (metrik: string) => tr.find(t => t.variabel === 'diameter' && t.metrik === metrik);
                  const traff = g('traffprocent'), syst = g('systematisk'), std = g('standardavv');
                  const profil = bedomning?.profil ?? 'Profilen';
                  const tol = traff?.tolerans != null ? Number(traff.tolerans) : 4;
                  return (
                    <>
                      <div className="kalib-hjalp-sekt">
                        <div className="kalib-hjalp-fraga">{MATT.traffprocent.fraga} <span className="kalib-hjalp-term">{MATT.traffprocent.term}</span></div>
                        <p>Av alla mätningar — hur många hamnar inom {fmtKrav(tol)} mm från det du klavat? {profil} vill att minst {traff ? Math.round(Number(traff.golv)) : '–'} % ska träffa.</p>
                      </div>
                      <div className="kalib-hjalp-sekt">
                        <div className="kalib-hjalp-fraga">{MATT.systematisk.fraga} <span className="kalib-hjalp-term">{MATT.systematisk.term}</span></div>
                        <p>Mäter den för stort hela tiden? Då sitter kurvan snett — det går att justera. {profil} vill att den drar mindre än {syst ? fmtKrav(Number(syst.mal)) : '–'} mm.</p>
                      </div>
                      <div className="kalib-hjalp-sekt">
                        <div className="kalib-hjalp-fraga">{MATT.standardavv.fraga} <span className="kalib-hjalp-term">{MATT.standardavv.term}</span></div>
                        <p>Ger den samma svar varje gång, eller hoppar den? Hoppar den är det greppet. {profil} vill att hoppen håller sig under {std ? fmtKrav(Number(std.mal)) : '–'} mm.</p>
                      </div>
                      <div className="kalib-hjalp-slutord">Alla tre måste stämma. Det räcker inte att träffa rätt om svaren hoppar.</div>
                      {!bedomning?.profil && <div className="kalib-hjalp-note">Välj en maskin för att se dess exakta krav (Biometria har egna tal).</div>}
                    </>
                  );
                })()}
              </div>
              <button className="kalib-modal-close" onClick={() => setHjalpOpen(false)}>Stäng</button>
            </div>
          </div>
        )}

        {/* === Maskin-filter sheet === */}
        <div ref={swipeSheet.overlayRef} className={`kalib-modal-overlay ${maskinSheetOpen ? 'open' : ''}`} onClick={() => setMaskinSheetOpen(false)}>
          <div
            ref={swipeSheet.modalRef}
            className="kalib-modal"
            onClick={e => e.stopPropagation()}
            onTouchStart={swipeSheet.onTouchStart}
            onTouchMove={swipeSheet.onTouchMove}
            onTouchEnd={swipeSheet.onTouchEnd}
          >
            <div className="kalib-modal-handle" />
            <div className="kalib-modal-header">
              <div className="kalib-modal-title">Maskin</div>
            </div>
            {alleMaskiner.length > 10 && (
              <input
                type="text"
                className="kalib-sheet-search"
                placeholder="Sök maskin"
                value={maskinSearchQ}
                onChange={e => setMaskinSearchQ(e.target.value)}
              />
            )}
            <div className="kalib-sheet-list">
              <button
                className="kalib-sheet-row"
                onClick={() => { setSelectedMaskinId('all'); setMaskinSheetOpen(false); }}
              >
                <span className="kalib-sheet-check">{selectedMaskinId === 'all' && <MSym name="check" size={20} color="#fff" />}</span>
                <span className="kalib-sheet-label">Alla maskiner</span>
              </button>
              {alleMaskiner
                // Sålda maskiner döljs från väljaren (historiken finns kvar i DB).
                .filter(m => arAktiv(m.maskin_id))
                .filter(m => {
                  if (!maskinSearchQ.trim()) return true;
                  return maskinNamn(m).toLowerCase().includes(maskinSearchQ.trim().toLowerCase());
                })
                .map(m => {
                  const namn = maskinNamn(m);
                  return (
                    <button
                      key={m.maskin_id}
                      className="kalib-sheet-row"
                      onClick={() => { setSelectedMaskinId(m.maskin_id); setMaskinSheetOpen(false); }}
                    >
                      <span className="kalib-sheet-check">{effectiveSelected === m.maskin_id && <MSym name="check" size={20} color="#fff" />}</span>
                      <span className="kalib-sheet-label">{namn}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
