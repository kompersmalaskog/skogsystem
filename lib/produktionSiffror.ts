// "Hur går det?" i Produktion (skördaren): maskinens egna filer, idag och den här veckan (måndag t.o.m. idag).
// Produktion och tid läses SEPARAT och slås ihop här (fakt_produktion och fakt_tid får aldrig joinas). G15 via lib/g15.
// Viktade snitt: m³/G15h = Σ volym / Σ G15h, l/m³ = Σ liter / Σ volym, medelstam = Σ volym / Σ stammar — aldrig snitt av snitt.
// Siffrorna är så färska som senaste filen ("Virke t.o.m. 15:22"), aldrig live.

import { g15Sek } from './g15';
import { raknasSomSkotat, totalM3 } from './skotarLass/lassModell';
import type { Lass } from './skotarLass/typer';


export interface ProdRad { datum: string; volym_m3sub?: number | null; stammar?: number | null; skapad_tid?: string | null }
export interface TidRad { datum: string; processing_sek?: number | null; terrain_sek?: number | null; other_work_sek?: number | null; bransle_liter?: number | null }

export interface Siffror {
  m3: number;
  stammar: number;
  /** m³ per stam, null utan stammar. */
  medelstam: number | null;
  g15h: number | null;
  /** null utan G15-tid (tiden kunde inte läsas eller ingen tid). */
  m3PerG15h: number | null;
  /** l/m³, null utan diesel i filerna. */
  dieselPerM3: number | null;
}

export function summera(prod: readonly ProdRad[], tid: readonly TidRad[] | null): Siffror {
  const m3 = prod.reduce((s, r) => s + (Number(r.volym_m3sub) || 0), 0);
  const stammar = prod.reduce((s, r) => s + (Number(r.stammar) || 0), 0);
  const g15 = tid ? tid.reduce((s, r) => s + g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek), 0) / 3600 : null;
  const liter = tid ? tid.reduce((s, r) => s + (Number(r.bransle_liter) || 0), 0) : 0;
  return {
    m3, stammar,
    medelstam: stammar > 0 ? m3 / stammar : null,
    g15h: g15,
    m3PerG15h: g15 != null && g15 > 0 && m3 > 0 ? m3 / g15 : null,
    dieselPerM3: liter > 0 && m3 > 0 ? liter / m3 : null,
  };
}

/** Måndagen i veckan för ett svenskt datum (ISO, yyyy-mm-dd). */
export function veckansMandag(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dag = (d.getUTCDay() + 6) % 7;   // mån = 0
  d.setUTCDate(d.getUTCDate() - dag);
  return d.toISOString().slice(0, 10);
}

const tal = (v: number, dec: number) => v.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export interface SiffraRad { id: string; titel: string; varde: string }

/** Raderna i "Hur går det?". Ett värde som saknas står inte alls (aldrig 0 för något som inte mätts). */
export function siffraRader(s: Siffror): SiffraRad[] {
  if (s.m3 <= 0 && s.stammar <= 0) return [];
  const r: SiffraRad[] = [
    { id: 'virke', titel: 'Virke', varde: `${tal(s.m3, 0)} m³` },
    { id: 'stammar', titel: 'Stammar', varde: tal(s.stammar, 0) },
  ];
  if (s.medelstam != null) r.push({ id: 'medelstam', titel: 'Medelstam', varde: `${tal(s.medelstam, 2)} m³` });
  if (s.m3PerG15h != null) r.push({ id: 'g15', titel: 'Per G15-timme', varde: `${tal(s.m3PerG15h, 1)} m³` });
  if (s.dieselPerM3 != null) r.push({ id: 'diesel', titel: 'Diesel', varde: `${tal(s.dieselPerM3, 1)} l/m³` });
  return r;
}

/** "Virke t.o.m. 15:22" ur senaste skapad_tid (svensk tid), idag bara klockslaget. null utan tid. */
export function farskText(prod: readonly ProdRad[]): string | null {
  const t = prod.map((r) => (r.skapad_tid ? Date.parse(r.skapad_tid) : NaN)).filter(Number.isFinite);
  if (!t.length) return null;
  const k = new Date(Math.max(...t)).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' });
  return `Ur maskinens filer · senaste ${k}`;
}

// ── Skotaren: ur appens lass (bara de som räknas: bekräftade, inte strukna, inte gamla automatiska) ──

/** "Hur går det?" för skotaren: lass, skotat och snittlass för en maskin, ett datumintervall (svenska dagar, båda inklusive). */
export function skotarSiffror(lass: readonly Lass[], maskinId: string, fran: string, till: string): SiffraRad[] {
  const mina = lass.filter((l) => l.maskinId === maskinId && raknasSomSkotat(l) && l.datum >= fran && l.datum <= till);
  if (!mina.length) return [];
  const m3 = mina.reduce((s, l) => s + l.delar.reduce((t, d) => t + totalM3(d.rader), 0), 0);
  return [
    { id: 'lass', titel: 'Lass', varde: tal(mina.length, 0) },
    { id: 'skotat', titel: 'Skotat', varde: `${tal(m3, 0)} m³` },
    { id: 'snittlass', titel: 'Snittlass', varde: `${tal(m3 / mina.length, 0)} m³` },
  ];
}
