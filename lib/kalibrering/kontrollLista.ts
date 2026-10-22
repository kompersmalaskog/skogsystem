/**
 * KONTROLLER — "Vad mättes?" Raden i listan och kontrollens huvud: när den mättes (svensk tid), hur många stammar, hur stammen valdes och vädret.
 * Allt som står på raden är synligt utan att trycka.
 *
 * TIDEN är operatörens mätning (`operator_measurement_date`), inte filens datum: en HQC-fil är kumulativ och kan bära en stam som mättes dagen
 * före. Tiderna i detalj_kontroll_stock är Opti-tider med radens egen `tid_ar_utc`; de läses ALDRIG rått utan går genom lib/optiTid.
 */
import { optiLokalDag, optiLokalKlockslag, optiTidUtcMs } from '@/lib/optiTid';
import { dec } from './format';
import { fmtDagMan } from './datum';
import { antalText, cap, stockText } from './text';
import type { FaktKalibrering, KontrollTid, VaderJson } from './typer';

const MINUS = '−';

// === Mättid ===
type MatRad = { operator_measurement_date: string | null; tid_ar_utc?: boolean | null };
type Tidpunkt = { dag: string; klockslag: string };

/** Första och sista operatörsmätningen i en kontroll, i svensk tid. Rader utan tid (eller med otolkbar tid) räknas inte. */
export const mattTid = (rader: MatRad[]): Pick<KontrollTid, 'forsta' | 'sista'> => {
  const med = rader
    .map(r => ({ ms: optiTidUtcMs(r.operator_measurement_date, r.tid_ar_utc), r }))
    .filter((x): x is { ms: number; r: MatRad } => x.ms != null)
    .sort((a, b) => a.ms - b.ms);
  if (med.length === 0) return { forsta: null, sista: null };
  const till = (x: { r: MatRad }): Tidpunkt | null => {
    const dag = optiLokalDag(x.r.operator_measurement_date, x.r.tid_ar_utc);
    const klockslag = optiLokalKlockslag(x.r.operator_measurement_date, x.r.tid_ar_utc);
    return dag && klockslag ? { dag, klockslag } : null;
  };
  return { forsta: till(med[0]), sista: till(med[med.length - 1]) };
};

// === Hur stammen valdes ===
const URVAL_SLUMP = 'Randomly selected stem';
const URVAL_FORVALD = 'Manually by operator selected stem';

/** "Slumpstam", "Förvald" eller "Slump och förvald". null när filen inte säger (eller säger något vi inte känner igen). */
export const urvalText = (urval: string[]): string | null => {
  const slump = urval.includes(URVAL_SLUMP), forvald = urval.includes(URVAL_FORVALD);
  if (slump && forvald) return 'Slump och förvald';
  if (slump) return 'Slumpstam';
  if (forvald) return 'Förvald';
  return null;
};

// === Väder ===
/** −3 °C med riktigt minustecken, avrundat till heltal. */
const grader = (c: number): string => { const r = Math.round(c); return `${r < 0 ? MINUS : ''}${Math.abs(r)} °C`; };

/**
 * Vädret kort: "−3 °C, frost", "8 °C, uppehåll", "1 °C, 2,0 cm snö". Frost nämns när databasen säger det; snö går före regn; ingen nederbörd = uppehåll.
 * Saknas vädret helt (SMHI gav inget) är det null — vi säger aldrig "uppehåll" om vi inte vet.
 */
export const vaderKort = (w: VaderJson | undefined): string | null => {
  if (!w) return null;
  const delar: string[] = [];
  if (w.temperature_c != null) delar.push(grader(w.temperature_c));
  if (w.is_freezing) delar.push('frost');
  const snow = w.snowfall_cm ?? 0, rain = w.precipitation_mm ?? 0;
  if (snow > 0) delar.push(`${dec(snow, 1)} cm snö`);
  else if (rain > 0) delar.push(`${dec(rain, 1)} mm regn`);
  else if (w.temperature_c != null || w.precipitation_mm != null || w.snowfall_cm != null) delar.push('uppehåll');
  return delar.length > 0 ? delar.join(', ') : null;
};

// === Dag och klockslag ===
/** "ons 21 okt" */
export const dagMedVeckodag = (dag: string): string => {
  const veckodag = new Date(`${dag}T00:00:00`).toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '');
  return `${veckodag} ${fmtDagMan(dag)}`;
};

// === Raden i listan ===
export type KontrollRad = {
  filnamn: string;
  /** "ons 21 okt · 14:13" — mättiden; saknas den faller raden tillbaka på filens datum utan klockslag. */
  rubrik: string;
  /** "Gran · 1 stam · 5 stockar · Förvald" */
  rad1: string;
  /** Vädret kort, eller "Väder saknas". */
  vader: string;
  vaderSaknas: boolean;
  /** Sorteringsnyckel: mättiden (svensk väggklocka) eller filens datum — nyast först. */
  sort: string;
  dag: string;
};

/** En kontrollrad. `tid` kommer från /api/kalibrering/kontroller (kan saknas medan den läses eller om den föll — raden visas ändå). */
export const kontrollRad = (k: FaktKalibrering, tid: KontrollTid | undefined): KontrollRad => {
  const sista = tid?.sista ?? null;
  const dag = sista?.dag ?? k.datum.slice(0, 10);
  const flera = tid?.forsta && sista && tid.forsta.dag !== sista.dag;
  const stammar = antalText(k.antal_kontrollstammar, 'stam', 'stammar');
  const urval = urvalText(tid?.urval ?? []);
  const vader = vaderKort(k.weather_at_harvest);
  return {
    filnamn: k.filnamn,
    rubrik: `${dagMedVeckodag(dag)}${sista ? ` · ${sista.klockslag}` : ''}`,
    rad1: [
      cap(k.tradslag ?? ''),
      flera && tid?.forsta ? `${stammar} (mätta ${fmtDagMan(tid.forsta.dag)}–${fmtDagMan(dag)})` : stammar,
      stockText(k.antal_kontrollstockar),
      urval,
    ].filter((x): x is string => !!x).join(' · '),
    vader: vader ?? 'Väder saknas',
    vaderSaknas: vader == null,
    sort: sista ? `${sista.dag}T${sista.klockslag}` : `${dag}T00:00`,
    dag,
  };
};

/** Månadens kontroller, nyast först. `manad` = "2026-10" (kalenderns månad). */
export const kontrollRader = (alla: FaktKalibrering[], tider: Record<string, KontrollTid> | null, manad: string): KontrollRad[] =>
  alla
    .filter(k => k.datum.slice(0, 7) === manad)
    .map(k => kontrollRad(k, tider?.[k.filnamn]))
    .sort((a, b) => b.sort.localeCompare(a.sort) || a.filnamn.localeCompare(b.filnamn));

// === Tiderna för en hel maskins kontroller (rutten /api/kalibrering/kontroller) ===
export type StockTidRad = { filnamn: string; stem_selection: string | null; operator_measurement_date: string | null; tid_ar_utc: boolean | null };

/** Mättid och urval per fil, ur stockraderna. Filer utan en enda tolkbar tid får ändå en post (urvalet kan finnas); filer utan stockar finns inte. */
export const kontrollTider = (rader: StockTidRad[]): Record<string, KontrollTid> => {
  const perFil = new Map<string, StockTidRad[]>();
  for (const r of rader) perFil.set(r.filnamn, [...(perFil.get(r.filnamn) ?? []), r]);
  const ut: Record<string, KontrollTid> = {};
  for (const [filnamn, lista] of perFil) {
    ut[filnamn] = { ...mattTid(lista), urval: Array.from(new Set(lista.map(r => r.stem_selection).filter((x): x is string => !!x))) };
  }
  return ut;
};
