// PLANERA — ren logik (ingen databas, ingen React). Testad i logik.test.ts.
//
// Vyn skapar bara perioder (extra_tid) på en trakt; dagen bekräftas som vanligt
// i Dag eller Kalender. Alla datum är LOKALA YYYY-MM-DD — aldrig toISOString
// (UTC-fällan: tz-off-by-one vid månadsgränser).
import { AKTIVITETER, type AktivitetTyp } from "@/lib/aktiviteter";

/** Aktiviteterna Planera-vyn hanterar. Övriga perioder (service, reparation,
 *  utbildning …) läggs in och ändras i Dag/Redigera. */
export const PLANERA_TYPER: AktivitetTyp[] = ["planering", "manuellt", "mote", "restid"];
export const arPlaneraTyp = (t: string | null | undefined) => PLANERA_TYPER.includes(t as AktivitetTyp);

export type PeriodRad = {
  id: string;
  datum: string;
  start_tid: string | null;
  slut_tid: string | null;
  minuter: number | null;
  aktivitet_typ: string | null;
  objekt_id: string | null;
  debiterbar: boolean | null;
  arbetsdag_id?: string | null;
  kommentar?: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const lokalISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const delar = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0); };
export const plusDagar = (iso: string, n: number) => { const d = delar(iso); d.setDate(d.getDate() + n); return lokalISO(d); };

const DAG_KORT = ["sön", "mån", "tis", "ons", "tors", "fre", "lör"];
const MAN_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** "tis 29 sep" */
export const datumKort = (iso: string) => { const d = delar(iso); return `${DAG_KORT[d.getDay()]} ${d.getDate()} ${MAN_KORT[d.getMonth()]}`; };
/** "idag", "i går", "i förrgår", annars "tis 29 sep". */
export function relativDag(iso: string, idag: string): string {
  if (iso === idag) return "idag";
  if (iso === plusDagar(idag, -1)) return "i går";
  if (iso === plusDagar(idag, -2)) return "i förrgår";
  return datumKort(iso);
}

/** Minuter i människoord: 180 → "3 tim", 90 → "1 tim 30 min", 45 → "45 min". */
export function timText(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} tim ${r} min` : `${h} tim`;
}

const hhmm = (t: string | null | undefined) => (t || "").slice(0, 5);
const tMin = (t: string) => { const [h, m] = hhmm(t).split(":").map(Number); return h * 60 + m; };
const minHHMM = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const periodMinuter = (start: string, slut: string) => (start && slut ? tMin(slut) - tMin(start) : 0);

const stangd = (p: PeriodRad) => !!p.slut_tid && !!p.start_tid;
const minuterAv = (p: PeriodRad) => p.minuter ?? Math.max(0, periodMinuter(hhmm(p.start_tid), hhmm(p.slut_tid)));

// ── Senaste trakter ───────────────────────────────────────────────────────
export type SenasteTrakt = { objektId: string; datum: string; minuter: number };
/** Trakter jag lagt Planera-tid på, senast använda överst. Minuterna = det
 *  som lades på trakten den SENASTE dagen ("i går 3 tim"). */
export function senasteTrakter(perioder: PeriodRad[], max = 5): SenasteTrakt[] {
  const perObjekt = new Map<string, SenasteTrakt>();
  for (const p of perioder) {
    if (!p.objekt_id || !stangd(p) || !arPlaneraTyp(p.aktivitet_typ)) continue;
    const nuv = perObjekt.get(p.objekt_id);
    if (!nuv || p.datum > nuv.datum) perObjekt.set(p.objekt_id, { objektId: p.objekt_id, datum: p.datum, minuter: minuterAv(p) });
    else if (p.datum === nuv.datum) nuv.minuter += minuterAv(p);
  }
  return Array.from(perObjekt.values())
    .sort((a, b) => b.datum.localeCompare(a.datum) || b.minuter - a.minuter)
    .slice(0, max);
}

// ── Veckan ────────────────────────────────────────────────────────────────
/** Måndag–söndag för veckan som innehåller `iso`. */
export function veckoSpann(iso: string): { start: string; slut: string } {
  const d = delar(iso);
  const dagIVeckan = (d.getDay() + 6) % 7; // mån = 0
  const start = plusDagar(iso, -dagIVeckan);
  return { start, slut: plusDagar(start, 6) };
}
export type VeckoDag = { datum: string; perioder: PeriodRad[]; summaMin: number };
/** Dagens perioder i veckan, senaste dag överst, perioderna i tidsordning. */
export function veckoDagar(perioder: PeriodRad[], idag: string): { dagar: VeckoDag[]; summaMin: number } {
  const { start, slut } = veckoSpann(idag);
  const perDag = new Map<string, PeriodRad[]>();
  for (const p of perioder) {
    if (!stangd(p) || !arPlaneraTyp(p.aktivitet_typ) || p.datum < start || p.datum > slut) continue;
    if (!perDag.has(p.datum)) perDag.set(p.datum, []);
    perDag.get(p.datum)!.push(p);
  }
  const dagar: VeckoDag[] = Array.from(perDag.entries())
    .map(([datum, ps]) => {
      ps.sort((a, b) => hhmm(a.start_tid).localeCompare(hhmm(b.start_tid)));
      return { datum, perioder: ps, summaMin: ps.reduce((s, p) => s + minuterAv(p), 0) };
    })
    .sort((a, b) => b.datum.localeCompare(a.datum));
  return { dagar, summaMin: dagar.reduce((s, d) => s + d.summaMin, 0) };
}

// ── Förslag ───────────────────────────────────────────────────────────────
// Ett FÖRSLAG är en lista perioder som föraren kan godkänna med ett tryck. Det
// sparas ALDRIG förrän föraren tryckt (ärlig data eller ingen data). Idag finns
// en källa — "Samma som i går". Framtida källor landar i SAMMA lista med
// `kalla` satt: 'bil' (Mercedes Fleet: "Du var på Trestensdal 07:12–10:05.
// Stämmer?") och 'plats' (incheckning vid en trakt). docs/planera.md.
export type ForslagPeriod = { start: string; slut: string; typ: AktivitetTyp; objektId: string; deb: boolean };
export type Forslag = {
  id: string;
  kalla: "igar" | "bil" | "plats";
  datum: string;
  perioder: ForslagPeriod[];
};
/** Gårdagens planering (med trakt) → förslag för idag. Inget förslag om idag
 *  redan har planering — då vore det en dubblett, inte en hjälp. */
export function forslagFranIgar(perioder: PeriodRad[], idag: string): Forslag | null {
  const igar = plusDagar(idag, -1);
  const harIdag = perioder.some(p => p.datum === idag && stangd(p) && p.aktivitet_typ === "planering");
  if (harIdag) return null;
  const igarPlanering = perioder
    .filter(p => p.datum === igar && stangd(p) && p.aktivitet_typ === "planering" && !!p.objekt_id)
    .sort((a, b) => hhmm(a.start_tid).localeCompare(hhmm(b.start_tid)));
  if (!igarPlanering.length) return null;
  return {
    id: `igar-${igar}`, kalla: "igar", datum: igar,
    perioder: igarPlanering.map(p => ({
      start: hhmm(p.start_tid), slut: hhmm(p.slut_tid), typ: "planering" as AktivitetTyp,
      objektId: p.objekt_id as string, deb: !!p.debiterbar,
    })),
  };
}

// ── Förifyllda tider ──────────────────────────────────────────────────────
/** Starttid för en ny period: slutet på dagens senaste period, annars 07:00. */
export function foreslagenStart(perioder: PeriodRad[], datum: string): string {
  let senast = -1;
  for (const p of perioder) if (p.datum === datum && stangd(p)) senast = Math.max(senast, tMin(p.slut_tid as string));
  return senast >= 0 && senast < 23 * 60 ? minHHMM(senast) : "07:00";
}

/** Faktureras som aktiviteten säger (ingen väljare på skärmen). */
export const debFor = (typ: AktivitetTyp) => AKTIVITETER.find(a => a.typ === typ)?.debDefault ?? false;
