/**
 * "GPS i hytten från 06:47" — när appen i hytten började skicka position,
 * jämfört med förarens starttid. Bara visning i Admin › Lön › Dagar; lönen
 * läser aldrig detta (Martin 2026-11-23).
 *
 * Varför: en starttid som flyttats bakåt i Opti syns som ett glapp mellan
 * starttiden och första GPS-punkten. Datorn och appen behöver 1–5 minuter att
 * starta (uppmätt på Martin, Stefan och Daniel), så först över
 * GPS_SENARE_GRANS_MIN markeras dagen.
 *
 * Underlaget är RPC hyttspar_starter (migration 20261123174923): per maskin och
 * dag en lista med starter — första punkten och varje punkt efter mer än 30
 * minuters uppehåll. Starten som hör till passet = den första som ligger högst
 * STARTFONSTER_MIN före förarens starttid (en tidigare start är en annan förare
 * eller gårdagens pass).
 */
import { sthlmOffsetMin } from "@/lib/optiTid";

/** Mer än så här mellan starttid och första GPS markeras (orange). */
export const GPS_SENARE_GRANS_MIN = 10;
/** En GPS-start upp till så här långt FÖRE starttiden hör ändå till passet. */
export const STARTFONSTER_MIN = 30;

export type GpsStart = {
  /** Första GPS-punktens klockslag i svensk tid, "06:47". */
  tid: string;
  /** Minuter från starttiden till första GPS (negativt = GPS före starttiden). */
  senareMin: number;
  /** Mer än GPS_SENARE_GRANS_MIN efter starttiden. */
  markerad: boolean;
};

/** Minuter sedan midnatt i svensk tid för en UTC-tid. */
function svenskaMinuter(utcMs: number): { datum: string; min: number } {
  const lokal = new Date(utcMs + sthlmOffsetMin(utcMs) * 60_000);
  const datum = lokal.toISOString().slice(0, 10);
  return { datum, min: lokal.getUTCHours() * 60 + lokal.getUTCMinutes() };
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Väljer dagens GPS-start för ett pass. null när det inte går att säga något:
 * ingen starttid, inga starter, eller ingen start som hör till passet.
 */
export function gpsStartForPass(datum: string, startTid: string | null | undefined, starter: string[] | null | undefined): GpsStart | null {
  if (!startTid || !starter?.length) return null;
  const [h, m] = startTid.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const startMin = h * 60 + m;
  const kandidater = starter
    .map(s => svenskaMinuter(Date.parse(s)))
    .filter(s => s.datum === datum && s.min >= startMin - STARTFONSTER_MIN)
    .sort((a, b) => a.min - b.min);
  const forsta = kandidater[0];
  if (!forsta) return null;
  const senareMin = forsta.min - startMin;
  return { tid: hhmm(forsta.min), senareMin, markerad: senareMin > GPS_SENARE_GRANS_MIN };
}

/** Raden i dagens detalj: "GPS i hytten från 06:55 · 15 min senare". */
export function gpsStartText(g: GpsStart): string {
  return g.markerad ? `GPS i hytten från ${g.tid} · ${g.senareMin} min senare` : `GPS i hytten från ${g.tid}`;
}

/** Ordet i dagens avvikelselista: "GPS 15 min senare". */
export function gpsStartAvvikelse(g: GpsStart): string | null {
  return g.markerad ? `GPS ${g.senareMin} min senare` : null;
}
