// PLANERA — ren logik (ingen databas, ingen React). Testad i logik.test.ts.
//
// Vyn skapar bara perioder (extra_tid) på en trakt; dagen bekräftas som vanligt
// i Dag eller Kalender. Alla datum är LOKALA YYYY-MM-DD — aldrig toISOString
// (UTC-fällan: tz-off-by-one vid månadsgränser).
import { AKTIVITETER, type AktivitetTyp } from "@/lib/aktiviteter";
import type { ArbetsObjekt } from "@/lib/arbetsobjekt";

/** Aktiviteterna Planera-vyn hanterar. Övriga perioder (service, reparation,
 *  utbildning …) läggs in och ändras i Dag/Redigera. */
export const PLANERA_TYPER: AktivitetTyp[] = ["planering", "manuellt", "markagare", "mote", "restid"];
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
/** Pågående period: har start men ingen slut (extra_tid.slut_tid = null). */
export const arOppen = (p: PeriodRad) => !!p.start_tid && !p.slut_tid;
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
export function forslagFranIgar(perioder: PeriodRad[], idag: string, nu?: Date): Forslag | null {
  const igar = plusDagar(idag, -1);
  const harIdag = perioder.some(p => p.datum === idag && stangd(p) && p.aktivitet_typ === "planering");
  if (harIdag) return null;
  const igarPlanering = perioder
    .filter(p => p.datum === igar && stangd(p) && p.aktivitet_typ === "planering" && !!p.objekt_id)
    .sort((a, b) => hhmm(a.start_tid).localeCompare(hhmm(b.start_tid)));
  if (!igarPlanering.length) return null;
  // Tid som inte har varit än går inte att spara (samma regel som sparandet) —
  // då erbjuds inget förslag hellre än ett som skulle nekas efteråt.
  if (nu && igarPlanering.some(p => liggerIFramtiden(idag, tMin(p.slut_tid as string), nu))) return null;
  return {
    id: `igar-${igar}`, kalla: "igar", datum: igar,
    perioder: igarPlanering.map(p => ({
      start: hhmm(p.start_tid), slut: hhmm(p.slut_tid), typ: "planering" as AktivitetTyp,
      objektId: p.objekt_id as string, deb: !!p.debiterbar,
    })),
  };
}

// ── Kvartar ───────────────────────────────────────────────────────────────
// ALLT i Planera är kvartar. Webbläsarens klockfält (alla minuter 00–59 att
// scrolla) är borta; tiden ändras en kvart per tryck. Förifyllning avrundas
// till kvart — annars blir längden "3 tim 17 min" (testdata 2026-10-02:
// 10:17, 16:17).
export const KVART = 15;
/** Senaste sluttid i Planera. 24:00 hanteras inte av kalendern/dagsegmenten, så dagen tar slut 23:45. */
export const DAGENS_SLUT = 23 * 60 + 45;
export const klockaTillMin = (t: string) => tMin(t);
export const minTillKlocka = (m: number) => minHHMM(Math.max(0, Math.min(DAGENS_SLUT, Math.round(m))));
export const kvartNarmast = (m: number) => Math.round(m / KVART) * KVART;
export const kvartNed = (m: number) => Math.floor(m / KVART) * KVART;
export const kvartUpp = (m: number) => Math.ceil(m / KVART) * KVART;
/** Klockan nu som minuter, avrundad NED till kvart ("Till nu" och taket för idag). */
export const nuKvartNed = (nu: Date) => kvartNed(nu.getHours() * 60 + nu.getMinutes());

/** Ligger slutet efter nu? Idag får inte sluta efter nu och framtida dagar går inte att fylla i.
 *  Samma regel gäller i vyn OCH i sparandet (en spärr i bara ena änden är ingen spärr). */
export function liggerIFramtiden(datum: string, slutMin: number, nu: Date): boolean {
  const idag = lokalISO(nu);
  if (datum > idag) return true;
  return datum === idag && slutMin > nu.getHours() * 60 + nu.getMinutes();
}

// ── Förifyllda tider ──────────────────────────────────────────────────────
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Förarens VANLIGA starttid: median av dagens första periods start de senaste
 *  30 dagarna (före idag), avrundad till närmaste kvart. Inga data → 07:00.
 *  Systemet lär sig av vad man gör i stället för att fråga. */
export function vanligStarttid(perioder: PeriodRad[], idag: string): string {
  const fran = plusDagar(idag, -30);
  const forstaPerDag = new Map<string, number>();
  for (const p of perioder) {
    if (!p.start_tid || !p.slut_tid || p.datum >= idag || p.datum < fran) continue;
    const m = tMin(p.start_tid);
    const nuv = forstaPerDag.get(p.datum);
    if (nuv === undefined || m < nuv) forstaPerDag.set(p.datum, m);
  }
  if (forstaPerDag.size === 0) return "07:00";
  return minHHMM(kvartNarmast(median(Array.from(forstaPerDag.values()))));
}

/** Starttid för en ny period: har dagen en period → där den slutade (avrundat
 *  UPP till kvart så att en gammal 10:17 aldrig ger krock); annars förarens
 *  vanliga starttid, för idag högst en kvart före nu så att något ryms. */
export function foreslagenStart(perioder: PeriodRad[], datum: string, idag: string, nu?: Date): string {
  let senast = -1;
  for (const p of perioder) if (p.datum === datum && stangd(p)) senast = Math.max(senast, tMin(p.slut_tid as string));
  if (senast >= 0) return minHHMM(Math.min(kvartUpp(senast), DAGENS_SLUT - KVART));
  const tak = datum === idag && nu ? Math.max(0, nuKvartNed(nu) - KVART) : DAGENS_SLUT - KVART;
  return minHHMM(Math.min(tMin(vanligStarttid(perioder, idag)), tak));
}

/** Krockar perioden med en annan samma dag? Returnerar den första (för texten) eller null. */
export function krockMed(perioder: PeriodRad[], datum: string, startMin: number, slutMin: number, undantaId?: string | null): PeriodRad | null {
  for (const p of perioder) {
    if (p.datum !== datum || p.id === undantaId || !p.start_tid) continue;
    // En pågående period har inget slut än — den löper framåt, så allt som slutar efter dess start krockar.
    const pSlut = p.slut_tid ? tMin(p.slut_tid) : DAGENS_SLUT;
    if (startMin < pSlut && tMin(p.start_tid) < slutMin) return p;
  }
  return null;
}

/** "Idag, fre 2 okt" · "I går, tors 1 okt" · "Tis 29 sep". */
export function dagRubrik(iso: string, idag: string): string {
  const rel = relativDag(iso, idag);
  const kort = datumKort(iso);
  const stor = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return rel === kort ? stor(kort) : `${stor(rel)}, ${kort}`;
}

/** De sju senaste dagarna (idag först) — dagväljaren. Äldre dagar via datumfältet. */
export const senasteDagar = (idag: string, antal = 7) => Array.from({ length: antal }, (_, i) => plusDagar(idag, -i));

/** Faktureras som aktiviteten säger (ingen väljare på skärmen). */
export const debFor = (typ: AktivitetTyp) => AKTIVITETER.find(a => a.typ === typ)?.debDefault ?? false;

// ── Pågående period ("Starta nu — avsluta sen") ───────────────────────────
// En period med start men utan slut (extra_tid.slut_tid = null) ligger kvar tills
// föraren trycker Avsluta eller Ta bort — man ska kunna stänga appen, gå ut i
// skogen och komma tillbaka. Bara EN åt gången.
/** Den pågående perioden (senaste om det mot förmodan finns flera). */
export function oppenPeriod(perioder: PeriodRad[]): PeriodRad | null {
  const oppna = perioder.filter(arOppen).sort((a, b) => b.datum.localeCompare(a.datum) || hhmm(b.start_tid).localeCompare(hhmm(a.start_tid)));
  return oppna[0] ?? null;
}
/** Glömd = startad en tidigare dag. Då sätts slut ALDRIG till nu — föraren väljer själv. */
export const arGlomd = (p: PeriodRad, idag: string) => arOppen(p) && p.datum < idag;
/** Minuter sedan start (verkliga minuter, inte kvartar) — det levande "2 tim 15 min". Aldrig negativt. */
export function pagatt(p: PeriodRad, nu: Date): number {
  if (!p.start_tid) return 0;
  const idag = lokalISO(nu);
  if (p.datum < idag) return 0; // glömd: ingen räknare, bara "startade i går 07:00"
  return Math.max(0, nu.getHours() * 60 + nu.getMinutes() - tMin(p.start_tid));
}
/** Slut vid Avsluta/Rast: nu, avrundat NED till kvart. null om det inte blir längre än starten (under en kvart sedan). */
export function slutVidAvsluta(startTid: string, nu: Date): number | null {
  const slut = nuKvartNed(nu);
  return slut > tMin(startTid) ? slut : null;
}
/** Rast = luckan mellan två perioder (ingen kolumn). Erbjudandet "Fortsätt" gäller
 *  bara idag, när inget pågår och rastens period är dagens senaste. */
export function rastPeriod(perioder: PeriodRad[], rastId: string | null, idag: string): PeriodRad | null {
  if (!rastId || perioder.some(arOppen)) return null;
  const rad = perioder.find(p => p.id === rastId);
  if (!rad || rad.datum !== idag || !stangd(rad)) return null;
  const senare = perioder.some(p => p.id !== rad.id && p.datum === idag && stangd(p) && tMin(p.slut_tid as string) > tMin(rad.slut_tid as string));
  return senare ? null : rad;
}

// ── Trakter i grupper ─────────────────────────────────────────────────────
export type TraktGrupp = { key: "gallring" | "slutavverkning" | "grot" | "ovrigt"; label: string; objekt: ArbetsObjekt[] };
const GRUPPER: Omit<TraktGrupp, "objekt">[] = [
  { key: "gallring", label: "Gallring" },
  { key: "slutavverkning", label: "Slutavverkning" },
  { key: "grot", label: "GROT" },
  { key: "ovrigt", label: "Övrigt" },
];
/** Trakter per åtgärdstyp. Utan sökning bara AKTIVA (planerad/pågående). Med sökning
 *  (≥ 2 tecken) filtreras alla trakter — Joacim fyller i dagar i efterhand på
 *  avslutade — men grupperingen är densamma. Tomma grupper utelämnas. */
export function traktGrupper(objekt: ArbetsObjekt[], sok: string): TraktGrupp[] {
  const q = sok.trim().toLowerCase();
  const urval = q.length >= 2
    ? objekt.filter(o => `${o.namn} ${o.ägare} ${o.vo ?? ""}`.toLowerCase().includes(q))
    : objekt.filter(o => o.aktiv);
  return GRUPPER
    .map(g => ({ ...g, objekt: urval.filter(o => (o.typ ?? "ovrigt") === g.key) }))
    .filter(g => g.objekt.length > 0);
}
