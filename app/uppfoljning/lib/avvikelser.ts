// Våning 2 — avvikelserader för uppföljningens detaljvy.
//
// PRINCIP: objektet jämförs mot MASKINENS EGEN historik — per-objekt-kvoter
// i ett rullande 90-dagarsfönster ur fakt_tid (samma tänk som kalibreringens
// kravprofil: maskinens egen historik är facit, ingen bransch-schablon).
//
// TRÖSKELN ÄR HÄRLEDD, INTE GISSAD: Tukeys övre staket (Q3 + 1,5×IQR) över
// referensobjektens kvoter — den etablerade outlier-regeln. Staketet följer
// alltså spridningen i maskinens egen data: jämn maskin får känsligt larm,
// spretig maskin får högt staket (hellre tyst än falsklarm).
//
// TYSTNADSREGLER (ärlighet före larm):
// - Färre än MIN_REF_OBJEKT jämförelseobjekt i fönstret → TYST (tunn grund
//   får aldrig larma — ny maskin / historik under uppbyggnad).
// - Objekt med mindre än MIN_G15_H på den maskinen → TYST (kvoter på några
//   timmars jobb är brus). Gäller både objektet och referensobjekten.
// - Objektets egna rader räknas ALDRIG in i sin referens.
// - Synk-luckan: saknad skördardata ger G15 = 0 → skördarens rader tystnar
//   automatiskt; skotarens diesel har egen volymgrund (fakt_lass).
// - Allt normalt → inga rader alls; zonen försvinner.

import { uppfoljningStatus } from '@/lib/uppfoljning/status';

export interface AvvikelseRad {
  id: string;
  text: string;
}

const MIN_G15_H = 8; // under ungefär en arbetsdags G15 är kvoterna bara brus
const MIN_REF_OBJEKT = 5; // färre jämförelseobjekt = för tunn grund → tyst
const INAKTIV_GRANS_DAGAR = 7; // samma gräns som statusens "kör"

// ── Statistik ──────────────────────────────────────────────────────────────
function kvartil(sorterade: number[], q: number): number {
  const pos = (sorterade.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorterade[lo] + (sorterade[hi] - sorterade[lo]) * (pos - lo);
}

function tukeyStaket(varden: number[]): { staket: number; median: number } | null {
  if (varden.length < MIN_REF_OBJEKT) return null;
  const s = [...varden].sort((a, b) => a - b);
  const q1 = kvartil(s, 0.25);
  const q3 = kvartil(s, 0.75);
  return { staket: q3 + 1.5 * (q3 - q1), median: kvartil(s, 0.5) };
}

// ── Referens: per-objekt-aggregat ur maskinens 90-dagarsfönster ────────────
interface RefObjekt {
  g15h: number;
  avbrottH: number;
  dieselL: number;
}

function grupperaRef(refTid: any[], maskinId: string, egnaObjektId: Set<string>): RefObjekt[] {
  const perObjekt = new Map<string, RefObjekt>();
  for (const r of refTid) {
    if (r.maskin_id !== maskinId || !r.objekt_id) continue;
    if (egnaObjektId.has(r.objekt_id)) continue; // aldrig sin egen referens
    const p = perObjekt.get(r.objekt_id) || { g15h: 0, avbrottH: 0, dieselL: 0 };
    p.g15h += ((r.processing_sek || 0) + (r.terrain_sek || 0)) / 3600;
    p.avbrottH += ((r.maintenance_sek || 0) + (r.disturbance_sek || 0) + (r.avbrott_sek || 0)) / 3600;
    p.dieselL += r.bransle_liter || 0;
    perObjekt.set(r.objekt_id, p);
  }
  return Array.from(perObjekt.values()).filter(p => p.g15h >= MIN_G15_H);
}

// Volym per objekt (fakt_produktion för skördare, fakt_lass för skotare) —
// hämtade SEPARAT och sammanförda här per objekt_id, aldrig joinade i SQL.
function volymPerObjekt(rader: any[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rader) {
    if (!r.objekt_id) continue;
    m.set(r.objekt_id, (m.get(r.objekt_id) || 0) + (r.volym_m3sub || 0));
  }
  return m;
}

// ── Formattering ───────────────────────────────────────────────────────────
const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function fmtDatum(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MANADER[d.getMonth()]}`;
}
const sv2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString('sv-SE');

// ── Huvudfunktion ──────────────────────────────────────────────────────────
export interface AvvikelseInput {
  // Objektets egna tal (samma fält som UppfoljningData — oavrundade timmar)
  skordareG15h: number;
  skordareAvbrott: number;
  skordareL_M3: number;
  skordareModell?: string | null;
  skotareG15h: number;
  skotareAvbrott: number;
  skotareL_M3: number;
  skotareModell?: string | null;
  skordat: number;
  skotat: number;
  status?: string;
  externSkotning?: boolean;
  skordareStart?: string | null;
  skordareSlut?: string | null;
  skordareLastDate?: string | null;
  skotareStart?: string | null;
  skotareSlut?: string | null;
  skotareLastDate?: string | null;
  // Referensdata (maskinens 90-dagarsfönster, hämtad i useObjektUppfoljning)
  refTid: any[];
  refProdVolym: any[]; // fakt_produktion för skördarmaskinen
  refLassVolym: any[]; // fakt_lass för skotarmaskinen
  skMaskinId?: string | null;
  stMaskinId?: string | null;
  egnaObjektId: string[];
}

export function byggAvvikelser(inp: AvvikelseInput): AvvikelseRad[] {
  const rader: AvvikelseRad[] = [];
  const egna = new Set(inp.egnaObjektId);

  // ── Kvot-avvikelser per maskin (avbrott % av G15, diesel L/m³) ──
  const maskiner: {
    slag: string;
    maskinId?: string | null;
    modell?: string | null;
    g15h: number;
    avbrottH: number;
    lm3: number;
    refVolym: Map<string, number>;
  }[] = [
    { slag: 'skordare', maskinId: inp.skMaskinId, modell: inp.skordareModell, g15h: inp.skordareG15h, avbrottH: inp.skordareAvbrott, lm3: inp.skordareL_M3, refVolym: volymPerObjekt(inp.refProdVolym) },
    { slag: 'skotare', maskinId: inp.stMaskinId, modell: inp.skotareModell, g15h: inp.skotareG15h, avbrottH: inp.skotareAvbrott, lm3: inp.skotareL_M3, refVolym: volymPerObjekt(inp.refLassVolym) },
  ];

  for (const m of maskiner) {
    if (!m.maskinId || m.g15h < MIN_G15_H) continue;
    const ref = grupperaRef(inp.refTid, m.maskinId, egna);
    const namn = m.modell || (m.slag === 'skordare' ? 'skördaren' : 'skotaren');

    // Avbrott % av G15
    const refAvbrottPct = ref.map(r => (100 * r.avbrottH) / r.g15h);
    const abStaket = tukeyStaket(refAvbrottPct);
    if (abStaket) {
      const egenPct = (100 * m.avbrottH) / m.g15h;
      if (egenPct > abStaket.staket) {
        rader.push({
          id: `avbrott-${m.slag}`,
          text: `Avbrott ${Math.round(egenPct)} % av G15 — mot ${Math.round(abStaket.median)} % normalt för ${namn}`,
        });
      }
    }

    // Diesel L/m³ — referensvolymen kommer ur maskinens egen volymkälla
    // (fakt_produktion resp. fakt_lass), aldrig joinad med fakt_tid.
    if (m.lm3 > 0) {
      const refLm3: number[] = [];
      for (const [objektId, volym] of m.refVolym) {
        if (egna.has(objektId) || volym <= 0) continue;
        const tid = grupperaRefEtt(inp.refTid, m.maskinId, objektId);
        if (!tid || tid.g15h < MIN_G15_H || tid.dieselL <= 0) continue;
        refLm3.push(tid.dieselL / volym);
      }
      const diStaket = tukeyStaket(refLm3);
      if (diStaket && m.lm3 > diStaket.staket) {
        rader.push({
          id: `diesel-${m.slag}`,
          text: `Diesel ${sv2(m.lm3)} L/m³ — mot ${sv2(diStaket.median)} normalt för ${namn}`,
        });
      }
    }
  }

  // ── Inaktiv / Oskotat — samma ärliga dagräkning som listan ──
  const s = uppfoljningStatus({ ...inp, skordat: inp.skordat, skotat: inp.skotat });
  const skotasExternt = !!(inp.externSkotning && inp.skordareSlut);

  if (s.k === 'pagaende' && !skotasExternt) {
    const senaste = [inp.skordareLastDate, inp.skotareLastDate].filter(Boolean).sort().reverse()[0] || null;
    if (senaste) {
      const d = Math.round((Date.now() - new Date(senaste).getTime()) / 864e5);
      if (d > INAKTIV_GRANS_DAGAR) {
        rader.push({ id: 'inaktiv', text: `Inaktiv ${d} dagar — senast ${fmtDatum(senaste)}` });
      }
    }
  }

  if (s.k === 'vantar' && inp.skordareSlut) {
    const d = Math.round((Date.now() - new Date(inp.skordareSlut).getTime()) / 864e5);
    if (d > 0) {
      rader.push({ id: 'oskotat', text: `Oskotat ${d} ${d === 1 ? 'dag' : 'dagar'} sedan färdigskördat ${fmtDatum(inp.skordareSlut)}` });
    }
  }

  return rader;
}

// Ett enskilt objekts tidsaggregat för maskinen (för diesel-referensen).
function grupperaRefEtt(refTid: any[], maskinId: string, objektId: string): RefObjekt | null {
  let g15h = 0, avbrottH = 0, dieselL = 0, traff = false;
  for (const r of refTid) {
    if (r.maskin_id !== maskinId || r.objekt_id !== objektId) continue;
    traff = true;
    g15h += ((r.processing_sek || 0) + (r.terrain_sek || 0)) / 3600;
    avbrottH += ((r.maintenance_sek || 0) + (r.disturbance_sek || 0) + (r.avbrott_sek || 0)) / 3600;
    dieselL += r.bransle_liter || 0;
  }
  return traff ? { g15h, avbrottH, dieselL } : null;
}
