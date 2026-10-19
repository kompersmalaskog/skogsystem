// ─────────────────────────────────────────────────────────────
// LAGKONTROLL FÖR ARBETSTID — sex gränser, en rad per gräns, per förare. Ren logik: ingen I/O, inga trösklar i vyn.
// Källa för varje gräns och för varje tolkning: docs/lonesystem/skogsavtalet-arbetstid.md (avtalstexten) — där står också
// vad som är lagtext (ATL, SFS 1982:673) och vad som är avtal.
//
//   1  Allmän övertid ≤ 250 tim/kalenderår        Skogsavtalet §5 mom 5
//   2  Extra övertid  ≤ 150 tim/kalenderår        ATL 8 a §
//   3  Övertid (allmän + extra) ≤ 50 tim/månad     ATL 8 § och 8 a § 2 st. (avtalet avviker inte)
//   4  Arbetstid ≤ 48 tim/vecka i snitt, 4 mån     ATL 10 b §
//   5  Veckovila ≥ 36 tim per 7 dagar              ATL 14 §
//   6  Dygnsvila ≥ 11 tim per 24 tim               ATL 13 §
//
// NIVÅER: gul från 90 % av gränsen, röd först OVER gränsen (gränsen själv är tillåten). Vilan är ett "minst": gul under
// dygnsvilans varningsgräns (gs_avtal.dygnsvila_varning_h, 12) resp. veckovilans krav / 0,9 (36 → 40), röd under kravet.
//
// ÄRLIG DATA (CLAUDE.md): det som är RÄKNAT eller UPPSKATTAT säger det (`markning`), det som saknas underlag för blir
// `null`, aldrig noll, och restid som inte finns i underlaget sägs vara utanför ("Restid ingår inte").
//
// ÖVERTID PER MÅNAD (beslut Martin 2026-10-19, ersätter 2026-10-13): övertid räknas per KALENDERMÅNAD, med samma regel som lönen —
// först när månadens ordinarie timmar är fyllda (lib/lonesystem/arsovertid, modell `manad`; reglerna i lib/lonesystem/manadsordinarie).
//   - En AVSLUTAD månad är FASTSTÄLLD och ger exakt det tal lönen visar. Kan ge RÖD.
//   - Den PÅGÅENDE månaden är "ställning t.o.m. igår" (arbetat − ordinarie, båda fram till igår): UPPSKATTAD. Kan bara ge GUL.
//   - En månad som överlappar en MARKERAD utjämningsperiod behåller avtalets genomsnitt (§5 mom 2), som lönen behåller sin gamla
//     formel där: ej markerade block fördelas per vecka (veckans torsdag avgör månaden) som fastställda, en markerad period läggs hel
//     på slutmånaden som UPPSKATTAD (pågående period: innevarande månad). Kan bara ge GUL — hur utjämningen verkligen fördelas på
//     månader avgörs av hur den lades ut.
// ÅRETS ÖVERTID (gräns 1 och 2) är summan av månadernas övertid, varje månad avrundad till en decimal först.
// ─────────────────────────────────────────────────────────────
import { getRödaDagar } from "./roda-dagar";
import { arArbetsdag } from "./arbetsdagRegler";
import { analyseraVilobrott, medPerioddagSpann, veckovilaPerDag, type VilaTrosklar } from "./vilobrott";
import { franvaroPerDatum, deldagarPerDatum, deldagTimmar, FRANVARO_STATUS_GALLER, type FranvaroRad } from "./franvaro";
import { overtidPerManad, isoVeckaMandag, type Arsovertid, type ManadsOvertid } from "./lonesystem/arsovertid";

// Övertid per månad ligger i lib/lonesystem/arsovertid (där månadsmodellen räknas); lagkontrollen läser den härifrån som förut.
export { overtidPerManad, isoVeckaMandag, type ManadsOvertid };
import { sthlmDelar, sthlmVaggklocka } from "./sthlmTid";

export const GRANSER = {
  allmanOvertidAr: 250,
  extraOvertidAr: 150,
  overtidManad: 50,
  snittVeckaH: 48,
  snittManader: 4,
  veckovilaH: 36,
  dygnsvilaH: 11,
  /** Gul från så här stor andel av gränsen. */
  gulAndel: 0.9,
  /** Vilobrott äldre än så här många dagar är inget att göra i dag (de ligger kvar i Vilobrott-listan). */
  vilaFonsterDagar: 28,
  /** Under så här många dagars registrerad tid finns inget fyramånaderssnitt att visa. */
  snittMinDagar: 28,
  /** Timmar per vardag som semester och sjukfrånvaro likställs med (ATL 10 b §). */
  vardagH: 8,
} as const;

export type Niva = "lugn" | "gul" | "rod";
export type GransId = "allman_overtid_ar" | "extra_overtid_ar" | "overtid_manad" | "snitt_48" | "veckovila" | "dygnsvila";

export type Gransstatus = {
  id: GransId;
  namn: string;
  niva: Niva;
  /** Mätvärdet, eller null när underlag saknas (aldrig en påhittad nolla). */
  varde: number | null;
  grans: number;
  enhet: string;
  /** 0–1 för staplar mot en övre gräns; null för vila (ett "minst"). */
  andel: number | null;
  /** EN mening, enkel svenska. */
  mening: string;
  /** Paragrafen och tolkningen bakom gränsen ("Varför?"). */
  varfor: string;
  /** Talet är räknat/uppskattat/en tolkning — syns som etikett. */
  markning?: "räknat" | "uppskattad" | "tolkning";
};

export type ArbetstidDag = { datum: string; arbetad_min: number | null; start_tid?: string | null; slut_tid?: string | null };
export type ArbetstidExtra = { datum: string | null; minuter: number | null; start_tid?: string | null; slut_tid?: string | null; aktivitet_typ?: string | null };

/** En rad ur flyttdag (maskinflyttens dag): starttid/sluttid är timestamptz, total_tid_min är MÄTT starttid → "Kör hem" och exkluderar hemresan. */
export type ArbetstidFlytt = { starttid: string; sluttid?: string | null; total_tid_min?: number | null };

/** En flyttdag som arbetstid, i Stockholmstid: lokalt datum, minuter från midnatt (slutMin kan passera 1440 vid pass över midnatt). */
export type FlyttPass = { datum: string; startMin: number; slutMin: number; min: number };

export type ArbetstidIndata = {
  medarbetare_id: string;
  namn: string;
  tomDatum: string;
  arsovertid: Arsovertid;
  /** Alla rader sedan minst fyra månader före tomDatum (plus veckovilans fönster före den). */
  dagar: ArbetstidDag[];
  extra: ArbetstidExtra[];
  franvaro: FranvaroRad[];
  trosklar: VilaTrosklar;
  /** gs_avtal.max_overtid_ar_h; 250 om den inte kunnat läsas. */
  tak?: number;
  /** flyttdag-rader (maskinflyttens körtid). Räknas i gränserna 4–6 — bara här, aldrig i lönen. */
  flytt?: ArbetstidFlytt[];
  /** Företagsledare / delägare (medarbetare.foretagsledare): arbetstidslagen gäller inte. Räknas ändå, men visas aldrig som gul/röd. */
  foretagsledare?: boolean;
  /** Det RIKTIGA ögonblicket (new Date()): vilan efter sista passet fram till nu räknas, och en pågående flyttdag räknas t.o.m. nu. */
  nu?: Date;
};

export type ArbetstidForare = {
  medarbetare_id: string;
  namn: string;
  /** Den värsta gränsen. ALLTID "lugn" för en företagsledare (lagen gäller inte) — se `skulleVarit`. */
  varsta: Niva;
  /** Företagsledare / delägare: visas grått ("Delägare – arbetstidslagen gäller inte"), räknas aldrig i menysiffran. */
  foretagsledare: boolean;
  /** Bara för en företagsledare: vad `varsta` hade blivit för en vanlig förare. Styr om hen visas alls (grått) i Översikten. */
  skulleVarit?: Niva;
  granser: Gransstatus[];
  /** Saker föraren/admin ska veta om underlaget (t.ex. "Restid ingår inte"). */
  notiser: string[];
  restidSaknas: boolean;
};

// ─── datum ───────────────────────────────────────────────────
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lokal = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const plusDagar = (s: string, n: number) => { const d = lokal(s); d.setDate(d.getDate() + n); return iso(d); };
const r1 = (x: number) => Math.round(x * 10) / 10;

// ─── Maskinflytt (flyttdag) ──────────────────────────────────
// flyttdag.starttid är timestamptz (UTC) och räknas om till Stockholmstid (lib/sthlmTid) innan den jämförs med arbetsdagens klockslag.

/** Flyttdagar längre än så är skräp (samma skräpskydd som klienten: 16 tim). */
export const FLYTT_MAX_MIN = 16 * 60;

/**
 * Flyttdagarna som arbetstid i Stockholmstid. Tiden är den MÄTTA (total_tid_min: starttid → "Kör hem"; hemresan ingår inte).
 * En pågående dag (ingen sluttid, ingen mätt tid) räknas t.o.m. `nu`. Dagar utan mätt tid, med 0 min eller över 16 tim
 * utesluts och räknas i `uteslutna` — okänt är aldrig noll. `fonster` begränsar till lokala datum (inklusive).
 */
export function flyttdagTillPass(rader: ArbetstidFlytt[], nu?: Date, fonster?: { fran: string; till: string }): { pass: FlyttPass[]; uteslutna: number } {
  const pass: FlyttPass[] = [];
  let uteslutna = 0;
  for (const r of rader) {
    const start = new Date(r.starttid);
    const lokalStart = sthlmDelar(start);
    if (!lokalStart) { uteslutna++; continue; }
    if (fonster && (lokalStart.datum < fonster.fran || lokalStart.datum > fonster.till)) continue;
    let min: number | null = null;
    if (r.total_tid_min != null && Number.isFinite(Number(r.total_tid_min))) min = Number(r.total_tid_min);
    else if (!r.sluttid && nu) min = Math.round((nu.getTime() - start.getTime()) / 60000);
    if (min == null || !(min > 0) || min > FLYTT_MAX_MIN) { uteslutna++; continue; }
    pass.push({ datum: lokalStart.datum, startMin: lokalStart.min, slutMin: lokalStart.min + min, min });
  }
  return { pass, uteslutna };
}

const klockaMin = (t: string | null | undefined): number | null => {
  const m = String(t || "").match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** Ett pass som [start, slut] i minuter från datumets midnatt; slut ≤ start betyder nästa dygn. */
function tidsrad(start?: string | null, slut?: string | null): [number, number] | null {
  const s = klockaMin(start), e = klockaMin(slut);
  if (s == null || e == null) return null;
  return [s, e <= s ? e + 1440 : e];
}
const hhmm = (min: number) => `${String(Math.floor((min % 1440) / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Flyttens minuter som INTE redan finns i underlaget samma dag (maskinpass och perioder med klockslag; rader utan klockslag kan inte jämföras och räknas inte som överlapp). */
function flyttNettoMin(f: FlyttPass, dagar: ArbetstidDag[], extra: ArbetstidExtra[]): number {
  const befintliga: [number, number][] = [];
  for (const d of dagar) if (d.datum === f.datum) { const r = tidsrad(d.start_tid, d.slut_tid); if (r) befintliga.push(r); }
  for (const e of extra) if (e.datum === f.datum) { const r = tidsrad(e.start_tid, e.slut_tid); if (r) befintliga.push(r); }
  befintliga.sort((a, b) => a[0] - b[0]);
  const sammanslagna: [number, number][] = [];
  for (const r of befintliga) {
    const sista = sammanslagna[sammanslagna.length - 1];
    if (sista && r[0] <= sista[1]) sista[1] = Math.max(sista[1], r[1]); else sammanslagna.push([r[0], r[1]]);
  }
  let overlapp = 0;
  for (const [s, e] of sammanslagna) overlapp += Math.max(0, Math.min(e, f.slutMin) - Math.max(s, f.startMin));
  return Math.max(0, f.min - overlapp);
}

/** Flytten förlänger dagens pass (första start → sista slut), eller blir dagens pass där inget pass finns. */
function medFlyttSpann<T extends { datum: string; start_tid?: string | null; slut_tid?: string | null }>(spann: T[], flytt: FlyttPass[]): (T | { datum: string; start_tid: string; slut_tid: string })[] {
  const perDatum = new Map<string, { s: number; e: number }>();
  for (const f of flytt) {
    const c = perDatum.get(f.datum);
    perDatum.set(f.datum, c ? { s: Math.min(c.s, f.startMin), e: Math.max(c.e, f.slutMin) } : { s: f.startMin, e: f.slutMin });
  }
  const harPass = new Set<string>();
  const ut: (T | { datum: string; start_tid: string; slut_tid: string })[] = spann.map(row => {
    const f = perDatum.get(row.datum);
    const r = tidsrad(row.start_tid, row.slut_tid);
    if (!r) return row;
    harPass.add(row.datum);
    if (!f) return row;
    const s = Math.min(r[0], f.s);
    return { ...row, start_tid: hhmm(s), slut_tid: hhmm(Math.max(r[1], f.e)) };
  });
  perDatum.forEach((f, datum) => { if (!harPass.has(datum)) ut.push({ datum, start_tid: hhmm(f.s), slut_tid: hhmm(f.e) }); });
  return ut;
}

/** Samma dag-i-månaden `n` månader bakåt, kapad vid månadens sista dag. */
function minusManader(s: string, n: number): string {
  const d = lokal(s);
  const dag = d.getDate();
  const mal = new Date(d.getFullYear(), d.getMonth() - n, 1);
  mal.setDate(Math.min(dag, new Date(mal.getFullYear(), mal.getMonth() + 1, 0).getDate()));
  return iso(mal);
}

const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const MAN_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const manadNamn = (ym: string) => MANADER[Number(ym.slice(5, 7)) - 1] || ym;
const datumKort = (s: string) => `${Number(s.slice(8, 10))} ${MAN_KORT[Number(s.slice(5, 7)) - 1] || ""}`;
/** "74,5", "250", "0": svensk decimalkomma, en decimal, ingen avslutande ",0". */
const tim = (h: number) => String(r1(h)).replace(".", ",");

/**
 * Tidigaste datum vars rader behövs för att bedöma alla sex gränser t.o.m. tomDatum: årets början (årsövertiden) eller fyra
 * månader bakåt (snitt och restid), det som är tidigast. Vilans fönster (28 dagar + veckovilans 7 före) ryms alltid inom de
 * fyra månaderna, så den behöver ingen egen gräns.
 */
export function dataFranDatum(tomDatum: string): string {
  return [`${tomDatum.slice(0, 4)}-01-01`, minusManader(tomDatum, GRANSER.snittManader)].sort()[0];
}

// ─── nivå ────────────────────────────────────────────────────
/** Gul från 90 % av gränsen, röd först över den. Gränsen själv är tillåten ("högst 250"). */
export function nivaMotTak(varde: number, grans: number): Niva {
  if (varde > grans) return "rod";
  // heltalsjämförelse: 43,2 av 48 ska vara gul, inte 43,19999 av 48
  if (Math.round(varde * 1e6) >= Math.round(grans * GRANSER.gulAndel * 1e6)) return "gul";
  return "lugn";
}

const NIVA_RANG: Record<Niva, number> = { lugn: 0, gul: 1, rod: 2 };
const varre = (a: Niva, b: Niva): Niva => (NIVA_RANG[a] >= NIVA_RANG[b] ? a : b);
const suffix = (n: Niva, gul: string, rod: string) => (n === "rod" ? ` — ${rod}` : n === "gul" ? ` — ${gul}` : "");

// ─── gräns 3: övertid per månad ──────────────────────────────
/** `stallning`: månaden är den pågående och talet är "ställning t.o.m. igår" (arbetat − ordinarie fram till igår), inte en fastställd övertid. */
export type Manadsstatus = { manad: string; fast: number; uppskattadTimmar: number; total: number; uppskattad: boolean; stallning: boolean; niva: Niva };

function manadNiva(fast: number, uppskattadH: number): Niva {
  const G = GRANSER.overtidManad;
  if (fast > G) return "rod";                                   // fastställd övertid över taket
  const n = nivaMotTak(fast + uppskattadH, G);
  return n === "rod" ? "gul" : n;                               // uppskattad fördelning ger aldrig röd
}

/** Den värsta av innevarande och föregående månad (äldre månader är historia, inget att åtgärda). */
export function manadsstatus(per: ManadsOvertid, tomDatum: string): Manadsstatus {
  const nu = tomDatum.slice(0, 7);
  const [y, m] = nu.split("-").map(Number);
  const f = new Date(y, m - 2, 1);
  const forra = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`;
  const kandidat = (ym: string): Manadsstatus => {
    const x = per[ym] || { fast: 0, uppskattad: 0 };
    return { manad: ym, fast: x.fast, uppskattadTimmar: x.uppskattad, total: r1(x.fast + x.uppskattad), uppskattad: x.uppskattad > 0, stallning: x.stallning === true, niva: manadNiva(x.fast, x.uppskattad) };
  };
  const a = kandidat(nu), b = kandidat(forra);
  if (NIVA_RANG[b.niva] > NIVA_RANG[a.niva]) return b;
  if (NIVA_RANG[b.niva] === NIVA_RANG[a.niva] && b.total > a.total) return b;
  return a;
}

// ─── gräns 4: 48 tim/vecka i snitt över fyra månader ─────────
export type SnittResultat = {
  /** Timmar per sjudagarsperiod i snitt, oavrundat; null om underlaget är för kort. */
  snitt: number | null;
  /** Arbetade timmar plus likställd frånvaro. */
  timmar: number;
  franvaroTimmar: number;
  fran: string;
  dagar: number;
};

/**
 * Fönstret är de fyra senaste månaderna fram t.o.m. tomDatum (startdagen exklusive: 31 maj → 1 feb), men börjar aldrig
 * före förarens första registrerade tid. TOLKNING: semester och sjukfrånvaro under tid då föraren annars skulle ha arbetat
 * likställs med fullgjord arbetstid (ATL 10 b §) och räknas som 8 tim per vardag; "arbete vinner" och röda dagar räknas inte.
 * Maskinflyttens körtid (flyttdag) räknas som arbetstid.
 */
export function snittVeckaH(i: { dagar: ArbetstidDag[]; extra: ArbetstidExtra[]; franvaro: FranvaroRad[]; tomDatum: string; flytt?: ArbetstidFlytt[]; nu?: Date }): SnittResultat {
  const fonsterStart = plusDagar(minusManader(i.tomDatum, GRANSER.snittManader), 1);
  const minPerDatum = new Map<string, number>();
  const lagg = (datum: string | null, min: number | null) => {
    if (!datum || !(min && min > 0) || datum > i.tomDatum) return;
    minPerDatum.set(datum, (minPerDatum.get(datum) || 0) + min);
  };
  for (const d of i.dagar) lagg(d.datum, d.arbetad_min);
  for (const e of i.extra) lagg(e.datum, e.minuter);
  // Maskinflyttens körtid (flyttdag): bara det som inte redan finns i underlaget samma dag, så att en flytt som även är inmatad
  // som maskinpass eller period inte räknas två gånger.
  for (const f of flyttdagTillPass(i.flytt || [], i.nu, { fran: fonsterStart, till: i.tomDatum }).pass) lagg(f.datum, flyttNettoMin(f, i.dagar, i.extra));
  const forsta = Array.from(minPerDatum.keys()).filter(d => d >= fonsterStart).sort()[0];
  if (!forsta) return { snitt: null, timmar: 0, franvaroTimmar: 0, fran: fonsterStart, dagar: 0 };
  const fran = forsta;                                         // forsta ≥ fonsterStart: aldrig före fönstret
  const dagar = Math.round((lokal(i.tomDatum).getTime() - lokal(fran).getTime()) / 86400000) + 1;

  let arbetadMin = 0;
  minPerDatum.forEach((m, d) => { if (d >= fran) arbetadMin += m; });

  const gallande = i.franvaro.filter(r => (FRANVARO_STATUS_GALLER as readonly string[]).includes(r.status) && (r.typ === "semester" || r.typ === "sjuk"));
  const heldag = franvaroPerDatum(gallande, fran, i.tomDatum);
  const deldag = deldagarPerDatum(gallande, fran, i.tomDatum);
  const roda: Record<string, string> = {};
  for (let ar = Number(fran.slice(0, 4)); ar <= Number(i.tomDatum.slice(0, 4)); ar++) Object.assign(roda, getRödaDagar(ar));
  let franvaroTimmar = 0;
  for (let d = fran; d <= i.tomDatum; d = plusDagar(d, 1)) {
    const dow = lokal(d).getDay();
    if (dow === 0 || dow === 6 || roda[d]) continue;
    const min = minPerDatum.get(d) || 0;
    if (heldag[d] && !arArbetsdag(min)) franvaroTimmar += GRANSER.vardagH;
    else if (deldag[d]) franvaroTimmar += deldagTimmar(GRANSER.vardagH, min);
  }

  const timmar = arbetadMin / 60 + franvaroTimmar;
  const kort = dagar < GRANSER.snittMinDagar;
  return { snitt: kort ? null : timmar / (dagar / 7), timmar: Math.round(timmar * 100) / 100, franvaroTimmar, fran, dagar };
}

// ─── gräns 5 och 6: vila ─────────────────────────────────────
type VilaMatt = { varde: number | null; datum: string | null; niva: Niva };

function bedomVila(i: ArbetstidIndata): { vecka: VilaMatt; dygn: VilaMatt } {
  const tom = i.tomDatum;
  const fran = plusDagar(tom, -GRANSER.vilaFonsterDagar);
  const pass = i.dagar.filter(d => d.datum <= tom).map(d => ({ datum: d.datum, start_tid: d.start_tid ?? null, slut_tid: d.slut_tid ?? null }));
  const perioder = i.extra
    .filter(e => e.datum && e.datum <= tom && e.start_tid && e.slut_tid)
    .map(e => ({ datum: e.datum as string, start_tid: e.start_tid as string, slut_tid: e.slut_tid as string }));
  const flyttPass = flyttdagTillPass(i.flytt || [], i.nu, { fran: plusDagar(fran, -8), till: tom }).pass;
  // Maskinflytten är arbetstid och förlänger dagens pass (eller blir dagens pass) — den ligger varken i arbetsdag eller extra_tid.
  const spann = medFlyttSpann(medPerioddagSpann(pass, perioder), flyttPass);
  const T = i.trosklar;
  // Utan `nu` (tester, anropare som inte vet) räknas ingen avslutande vila; med `nu` (routen) räknas den fram till nu.
  const nu = i.nu ? (sthlmVaggklocka(i.nu) ?? null) : null;

  // Veckovila: varje dags EGET värde (lib/vilobrott.veckovilaPerDag), inte stretchens första dag — ett gammalt brott får inte
  // dölja en vila som fortfarande är för kort. Ändarna räknas: tiden före förarens första pass är vila (nyanställd), och vilan från
  // sista passet fram till nu är vila (öppen lucka = slutar nu) — prod-kontroll 2026-10-13.
  const vkrav = T.veckovila_krav_h;
  const vgul = r1(vkrav / GRANSER.gulAndel);
  let vMin: { h: number; datum: string } | null = null;
  for (const d of veckovilaPerDag(spann, T.veckovila_fonster_dagar, nu)) {
    if (d.datum < fran) continue;   // pass efter tomDatum är redan bortfiltrerade ovan; 0 tim betyder nu 'ingen vila alls' (ändarna räknas), inte 'okänt'
    if (!vMin || d.max_h < vMin.h) vMin = { h: d.max_h, datum: d.datum };
  }
  const vecka: VilaMatt = !vMin ? { varde: null, datum: null, niva: "lugn" }
    : { varde: r1(Math.min(vMin.h, T.veckovila_fonster_dagar * 24)), datum: vMin.datum, niva: vMin.h < vkrav ? "rod" : vMin.h < vgul ? "gul" : "lugn" };   // visas aldrig över fönstret (7 dygn)

  // Dygnsvila: lib/vilobrott.analyseraVilobrott tre gånger — med kravet (röd), med varningsgränsen (gul) och med en
  // orimligt hög gräns (alla par, för det lägsta värdet). Rod/gul avgörs av analysens egen jämförelse på OAVRUNDAD vila:
  // 10 h 58 min visas som "11" men är under kravet.
  const dygnIFonster = (krav: number) => analyseraVilobrott(spann, { ...T, dygnsvila_krav_h: krav }, nu)
    .filter(b => b.typ === "dygnsvila" && b.datum >= fran && b.vila_h > 0);
  const alla = dygnIFonster(1e6);
  const rod = dygnIFonster(T.dygnsvila_krav_h).length > 0;
  const gul = dygnIFonster(Math.max(T.dygnsvila_varning_h, T.dygnsvila_krav_h)).length > 0;
  const lagst = alla.reduce<(typeof alla)[number] | null>((m, b) => (!m || b.vila_h < m.vila_h ? b : m), null);
  const dygn: VilaMatt = { varde: lagst ? lagst.vila_h : null, datum: lagst ? lagst.datum : null, niva: rod ? "rod" : gul ? "gul" : "lugn" };
  return { vecka, dygn };
}

// ─── texter ──────────────────────────────────────────────────
const VARFOR = {
  allman_overtid_ar:
    "Skogsavtalet §5 mom 5: arbetsgivaren får begära högst 250 timmar allmän övertid per kalenderår. Appen räknar övertid per kalendermånad, med samma regel som lönen: först när månadens ordinarie timmar är fyllda (vardagar × 8 tim, minus röda dagar, frånvaro och dagar före anställning). En månad i en markerad utjämningsperiod räknas som avtalets genomsnitt (§5 mom 2, högst 16 veckor). Det som går över 250 räknas som extra övertid och kräver särskilda skäl (gräns 2).",
  extra_overtid_ar:
    "ATL 8 a § (arbetstidslagen): extra övertid högst 150 timmar per kalenderår, bara om det finns särskilda skäl och situationen inte kunnat lösas på annat rimligt sätt. Appen vet inte vilka timmar som beordrats som extra — den räknar allt över 250 timmar som extra. Räknat, inte mätt.",
  overtid_manad:
    "ATL 8 § och 8 a § 2 st. (arbetstidslagen): allmän och extra övertid tillsammans får inte överstiga 50 timmar per kalendermånad (eller 48 timmar på fyra veckor). Avtalet avviker inte från det. En avslutad månad är fastställd och räknas som lönen. Den pågående månaden visar ställningen t.o.m. igår (arbetat minus ordinarie fram till igår) och ger aldrig mer än gul, liksom övertid från en markerad utjämningsperiod, som läggs på periodens slutmånad som uppskattad fördelning.",
  snitt_48:
    "ATL 10 b § (arbetstidslagen): den sammanlagda arbetstiden under varje period om sju dagar får i genomsnitt inte överstiga 48 timmar under högst fyra månader. Appen räknar de senaste fyra månaderna. Tolkning: semester och sjukfrånvaro under tid då föraren annars skulle ha arbetat likställs med fullgjord arbetstid och räknas som 8 tim per vardag (lagtexten säger det, men inte hur många timmar); andra frånvarotyper räknas som 0 tim.",
  veckovila:
    "ATL 14 § (arbetstidslagen): minst 36 timmar sammanhängande ledighet under varje period om sju dagar. Appen kontrollerar varje dag de senaste fyra veckorna mot de sju dagarna före. Avtalet har ingen egen regel (Skogsavtalet §5 mom 1).",
  dygnsvila:
    "ATL 13 § (arbetstidslagen): minst 11 timmar sammanhängande ledighet under varje period om 24 timmar. Avtalet har ingen egen regel (Skogsavtalet §5 mom 1). Gul under 12 tim. Perioddagar (planering, restid, manuellt arbete) räknas med sina klockslag.",
} as const;

export const RESTID_NOTIS = "Restid ingår inte: ingen restid och ingen maskinflytt finns registrerad de senaste fyra månaderna, så arbetstiden och vilan kan vara kortare än den verkliga.";

// ─── bygg allt för en förare ─────────────────────────────────
export function byggArbetstid(i: ArbetstidIndata): ArbetstidForare {
  const tak = i.tak ?? GRANSER.allmanOvertidAr;
  // Årets övertid = summan av månadernas övertid (månadsregeln, samma som lönen); utjämningsmånader med genomsnittets fördelning.
  const ov = i.arsovertid.modeller.manad;
  const granser: Gransstatus[] = [];

  // 1 — allmän övertid per år
  {
    const niva = nivaMotTak(ov, tak);
    granser.push({
      id: "allman_overtid_ar", namn: "Övertid per år", niva, varde: ov, grans: tak, enhet: "tim", andel: tak > 0 ? Math.min(1, ov / tak) : 0,
      mening: `${tim(ov)} av ${tim(tak)} tim övertid i år${suffix(niva, "närmar sig taket", "taket är passerat")}`,
      varfor: VARFOR.allman_overtid_ar,
    });
  }
  // 2 — extra övertid per år (det som går över allmänna taket)
  {
    const extra = r1(Math.max(0, ov - tak));
    const G = GRANSER.extraOvertidAr;
    const niva = nivaMotTak(extra, G);
    granser.push({
      id: "extra_overtid_ar", namn: "Extra övertid per år", niva, varde: extra, grans: G, enhet: "tim", andel: Math.min(1, extra / G), markning: "räknat",
      mening: extra === 0 ? `Ingen extra övertid — allt över ${tim(tak)} tim räknas som extra` : `${tim(extra)} av ${tim(G)} tim extra övertid${suffix(niva, "närmar sig taket", "taket är passerat")}`,
      varfor: VARFOR.extra_overtid_ar,
    });
  }
  // 3 — övertid per månad
  {
    const s = manadsstatus(overtidPerManad(i.arsovertid), i.tomDatum);
    const G = GRANSER.overtidManad;
    const man = manadNamn(s.manad);
    let mening: string;
    if (s.stallning) mening = `${tim(s.total)} av ${tim(G)} tim övertid i ${man} t.o.m. igår${s.total > G ? " — över gränsen" : suffix(s.niva, "närmar sig gränsen", "")}`;
    else if (s.uppskattad && s.niva !== "rod" && s.total >= G * GRANSER.gulAndel) mening = `${tim(s.total)} av ${tim(G)} tim övertid i ${man}, varav ${tim(s.uppskattadTimmar)} uppskattad fördelning från en utjämningsperiod`;
    else mening = `${tim(s.total)} av ${tim(G)} tim övertid i ${man}${suffix(s.niva, "närmar sig gränsen", "gränsen är passerad")}`;
    granser.push({
      id: "overtid_manad", namn: "Övertid per månad", niva: s.niva, varde: s.total, grans: G, enhet: "tim", andel: Math.min(1, s.total / G),
      markning: s.uppskattad ? "uppskattad" : undefined, mening, varfor: VARFOR.overtid_manad,
    });
  }
  // 4 — 48 tim/vecka i snitt
  {
    const r = snittVeckaH({ dagar: i.dagar, extra: i.extra, franvaro: i.franvaro, tomDatum: i.tomDatum, flytt: i.flytt, nu: i.nu });
    const G = GRANSER.snittVeckaH;
    const niva: Niva = r.snitt == null ? "lugn" : nivaMotTak(r.snitt, G);
    const v = r.snitt == null ? null : r1(r.snitt);
    granser.push({
      id: "snitt_48", namn: "Arbetstid per vecka", niva, varde: v, grans: G, enhet: "tim/vecka", andel: r.snitt == null ? null : Math.min(1, r.snitt / G), markning: "tolkning",
      mening: v == null
        ? (r.dagar === 0 ? "Ingen registrerad tid de senaste fyra månaderna" : "För kort underlag för ett fyramånaderssnitt — minst 4 veckors registrerad tid behövs")
        : `${tim(v)} tim/vecka i snitt de senaste 4 månaderna${suffix(niva, "närmar sig 48", "över 48")}`,
      varfor: VARFOR.snitt_48,
    });
  }
  // 5 och 6 — vila
  {
    const { vecka, dygn } = bedomVila(i);
    const T = i.trosklar;
    granser.push({
      id: "veckovila", namn: "Veckovila", niva: vecka.niva, varde: vecka.varde, grans: T.veckovila_krav_h, enhet: "tim vila", andel: null,
      mening: vecka.varde == null ? "Ingen veckovila att bedöma — för lite registrerad tid de senaste fyra veckorna"
        : vecka.niva === "rod" ? `Veckovilan blev bara ${tim(vecka.varde)} tim — minst ${tim(T.veckovila_krav_h)} krävs`
        : `Lägsta veckovila ${tim(vecka.varde)} tim — minst ${tim(T.veckovila_krav_h)} krävs`,
      varfor: VARFOR.veckovila,
    });
    const dygnDatum = dygn.datum ? ` den ${datumKort(dygn.datum)}` : "";
    granser.push({
      id: "dygnsvila", namn: "Dygnsvila", niva: dygn.niva, varde: dygn.varde, grans: T.dygnsvila_krav_h, enhet: "tim vila", andel: null,
      mening: dygn.varde == null ? "Ingen dygnsvila att bedöma — för lite registrerad tid de senaste fyra veckorna"
        : dygn.niva === "rod" ? `Dygnsvilan blev ${tim(dygn.varde)} tim${dygnDatum} — minst ${tim(T.dygnsvila_krav_h)} krävs`
        : `Lägsta dygnsvila ${tim(dygn.varde)} tim${dygnDatum} — minst ${tim(T.dygnsvila_krav_h)} krävs`,
      varfor: VARFOR.dygnsvila,
    });
  }

  // Restid och maskinflytt: finns de i underlaget (extra_tid med aktivitet 'restid', flyttdag) de senaste fyra månaderna? Flytten ingår
  // i gränserna 4–6, så med flyttdagar säger kortet det i stället för att säga att restid saknas.
  const restFran = plusDagar(minusManader(i.tomDatum, GRANSER.snittManader), 1);
  const harRestid = i.extra.some(e => e.aktivitet_typ === "restid" && !!e.datum && e.datum >= restFran && e.datum <= i.tomDatum);
  const flytt = flyttdagTillPass(i.flytt || [], i.nu, { fran: restFran, till: i.tomDatum });
  const restidSaknas = !harRestid && flytt.pass.length === 0;
  const notiser: string[] = [];
  if (flytt.pass.length > 0) {
    const n = flytt.pass.length;
    const h = flytt.pass.reduce((s, f) => s + f.min, 0) / 60;
    notiser.push(`Maskinflytt ingår: ${n} ${n === 1 ? "flyttdag" : "flyttdagar"}, ${tim(h)} tim (körningen fram till sista objektet; hemresan ingår inte).`);
  }
  if (flytt.uteslutna > 0) notiser.push(`${flytt.uteslutna} ${flytt.uteslutna === 1 ? "flyttdag saknar" : "flyttdagar saknar"} mätt tid eller ${flytt.uteslutna === 1 ? "är" : "är"} över 16 tim och ingår inte.`);
  if (restidSaknas) notiser.unshift(RESTID_NOTIS);

  const varsta = granser.reduce<Niva>((v, g) => varre(v, g.niva), "lugn");
  if (i.foretagsledare) return { medarbetare_id: i.medarbetare_id, namn: i.namn, varsta: "lugn", foretagsledare: true, skulleVarit: varsta, granser, notiser, restidSaknas };
  return { medarbetare_id: i.medarbetare_id, namn: i.namn, varsta, foretagsledare: false, granser, notiser, restidSaknas };
}

/**
 * Röda först, sedan gula; inom nivån den som är närmast sin gräns. Lugna förare tas inte med. Företagsledare / delägare
 * (arbetstidslagen gäller inte) kommer SIST och bara om de annars hade varit gula eller röda — grå, utan nivå.
 */
export function sorteraAttGora(forare: ArbetstidForare[]): ArbetstidForare[] {
  // ogrånsad kvot (inte den kapade stapeln): 300 av 250 ska ligga före 255 av 250
  const narmast = (f: ArbetstidForare) => Math.max(0, ...f.granser.filter(g => g.niva === f.varsta && g.andel != null && g.varde != null).map(g => (g.varde as number) / g.grans));
  const flaggade = forare
    .filter(f => !f.foretagsledare && f.varsta !== "lugn")
    .sort((a, b) => NIVA_RANG[b.varsta] - NIVA_RANG[a.varsta] || narmast(b) - narmast(a) || a.namn.localeCompare(b.namn, "sv"));
  const delagare = forare
    .filter(f => f.foretagsledare && f.skulleVarit != null && f.skulleVarit !== "lugn")
    .sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
  return [...flaggade, ...delagare];
}
