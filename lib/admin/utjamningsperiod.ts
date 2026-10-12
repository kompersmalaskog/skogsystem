// ─────────────────────────────────────────────────────────────
// UTJÄMNINGSPERIODER I ADMIN (Admin → Avtal). Ren logik: veckor, validering, sortering och regeln om exporterad lön.
//
// Tabellen utjamningsperiod (migration 20260918100000): startdatum (måndag), slutdatum (söndag) — samma CHECK som tabellen —
// medarbetare_id (NULL = alla), anteckning, skapad_av. Årsövertiden läser den (lib/lonesystem/arsovertid).
// En period väljs i HELA ISO-veckor: formuläret erbjuder bara måndagar, så en period som bryter tabellens CHECK inte går
// att skapa.
// ─────────────────────────────────────────────────────────────
import { isoVecka } from "@/lib/vilobrott"

/** Namnet på en period: kort nog att stå i en lista, en kalenderrad och en krockvarning. */
export const MAX_NAMN_TECKEN = 20

/** Längre än så kräver lokal överenskommelse (§5 mom 2). En varning, ingen spärr. */
export const MAX_VECKOR_UTAN_ÖVERENSKOMMELSE = 16

const MAN_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]

type Datumpar = { startdatum: string; slutdatum: string }

const lokal = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d) }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const dagar = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

/** "v17–27", "v17", eller över årsskifte "v51 2026 – v3 2027". */
export function veckoText(p: Datumpar): string {
  const a = isoVecka(lokal(p.startdatum)), b = isoVecka(lokal(p.slutdatum))
  if (a.år !== b.år) return `v${a.vecka} ${a.år} – v${b.vecka} ${b.år}`
  return a.vecka === b.vecka ? `v${a.vecka}` : `v${a.vecka}–${b.vecka}`
}

/** Hela veckor från måndagen till söndagen (båda inräknade). */
export function antalVeckor(p: Datumpar): number {
  return Math.round((lokal(p.slutdatum).getTime() + 86400000 - lokal(p.startdatum).getTime()) / (7 * 86400000))
}

export const arLangPeriod = (p: Datumpar) => antalVeckor(p) > MAX_VECKOR_UTAN_ÖVERENSKOMMELSE

/** Söndagen i veckan som börjar på måndagen `mandag`. */
export const slutFranMandag = (mandag: string) => iso(dagar(lokal(mandag), 6))

/** Måndagen i veckan som slutar på söndagen `slut` (för att fylla formuläret ur en sparad period). */
export const mandagFranSlut = (slut: string) => iso(dagar(lokal(slut), -6))

const MAN_LANG = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const mandagFor = (s: string) => { const d = lokal(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

/** Måndagen i veckan som innehåller dagen (YYYY-MM-DD). */
export const mandagForDag = (s: string) => iso(mandagFor(s));

export type Urval = { forsta: string; sista: string };

/** Valet i månadsbladet: första veckans måndag, sista veckans MÅNDAG (perioden slutar den veckans söndag), och var man är i valet. */
export type Valt = { fran: string; till: string; fas: "klar" | "slut" };

/**
 * Ett tryck på en dag i månadsbladet. Perioden snäpper alltid till HELA veckor (start måndag, slut söndag): första trycket väljer veckan
 * för dagen och väntar på slutdagen, andra trycket väljer slutveckan (en slutdag före startdagen byter plats), och ett tryck när
 * perioden är klar börjar om.
 */
export function tryckDag(v: Valt, dag: string): Valt {
  const m = iso(mandagFor(dag));
  if (v.fas === "klar") return { fran: m, till: m, fas: "slut" };
  return m < v.fran ? { fran: m, till: v.fran, fas: "klar" } : { fran: v.fran, till: m, fas: "klar" };
}

/** Ligger dagen i perioden? Från måndagen i första veckan till söndagen i sista. */
export const arDagIPerioden = (v: { fran: string; till: string }, dag: string) => dag >= v.fran && dag <= slutFranMandag(v.till);

/** Månadsbladet: veckor måndag–söndag, `null` för dagar utanför månaden. `manad0` = 0 för januari. */
export function manadVeckor(ar: number, manad0: number): (string | null)[][] {
  const antal = new Date(ar, manad0 + 1, 0).getDate();
  const forsta = (new Date(ar, manad0, 1).getDay() + 6) % 7;            // 0 = måndag
  const celler: (string | null)[] = [...Array(forsta).fill(null), ...Array.from({ length: antal }, (_, i) => iso(new Date(ar, manad0, i + 1)))];
  while (celler.length % 7) celler.push(null);
  return Array.from({ length: celler.length / 7 }, (_, r) => celler.slice(r * 7, r * 7 + 7));
}

export const manadRubrik = (ar: number, manad0: number) => `${MAN_LANG[manad0]} ${ar}`;

export function flyttaManad(ar: number, manad0: number, delta: number): { ar: number; manad0: number } {
  const d = new Date(ar, manad0 + delta, 1);
  return { ar: d.getFullYear(), manad0: d.getMonth() };
}

/** Resultatet under valet: 'v42–v45 · 12 okt–8 nov · 4 veckor'. Årtal när perioden inte ligger i innevarande år eller går över årsskiftet. */
export function periodResultat(fran: string, till: string, innevarandeAr: number): string {
  const a = lokal(fran), b = lokal(slutFranMandag(till));
  const va = isoVecka(a).vecka, vb = isoVecka(lokal(till)).vecka;
  const n = antalVeckor({ startdatum: fran, slutdatum: slutFranMandag(till) });
  const veckor = fran === till ? `v${va}` : `v${va}–v${vb}`;
  const dm = (d: Date) => `${d.getDate()} ${MAN_KORT[d.getMonth()]}`;
  let datum: string;
  if (a.getFullYear() !== b.getFullYear()) datum = `${dm(a)} ${a.getFullYear()}–${dm(b)} ${b.getFullYear()}`;
  else {
    const ar = a.getFullYear() === innevarandeAr ? "" : ` ${a.getFullYear()}`;
    datum = a.getMonth() === b.getMonth() ? `${a.getDate()}–${dm(b)}${ar}` : `${dm(a)}–${dm(b)}${ar}`;
  }
  return `${veckor} · ${datum} · ${n} ${n === 1 ? "vecka" : "veckor"}`;
}

/** "12 okt 2026". */
export function kortDatumMedAr(s: string): string {
  const d = lokal(s);
  return `${d.getDate()} ${MAN_KORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Överenskommen 12 okt 2026". */
export const overenskommenText = (datum: string) => `Överenskommen ${kortDatumMedAr(datum)}`;

/**
 * Skogsavtalet §5 mom 2: en beräkningsperiod på högst 16 veckor kräver ingen överenskommelse. Över 16 veckor krävs en överenskommelse
 * med LOKAL FACKLIG ORGANISATION (inte med arbetstagaren). Texten som står vid fältet för perioder över 16 veckor:
 */
export const KRAVER_FACKLIG_OVERENSKOMMELSE = "Kräver överenskommelse med lokal facklig organisation";
const SAKNAR_FACKLIG_OVERENSKOMMELSE = "Saknar överenskommelse med lokal facklig organisation";

/**
 * Raden om överenskommelsen i listan. Högst 16 veckor: ingenting att säga (inte ens "ej dokumenterad"), utom datumet om ett finns.
 * Över 16 veckor: datumet, eller en orange varning när det saknas. Null = ingen rad.
 */
export function overenskommelseRad(g: { startdatum: string; slutdatum: string; overenskommen?: string | null }): { text: string; orange: boolean } | null {
  if (g.overenskommen) return { text: overenskommenText(g.overenskommen), orange: false };
  return arLangPeriod(g) ? { text: SAKNAR_FACKLIG_OVERENSKOMMELSE, orange: true } : null;
}

type Krockperiod = { id: string; namn?: string | null; startdatum: string; slutdatum: string; medarbetare_id: string | null; anteckning: string };
export type Forarval = { alla: boolean; ids: string[] };

/** Namnet på en period; för en rad som saknar det de första 20 tecknen av anteckningen (som migrationens backfill), annars 'Period'. */
export function periodNamn(p: { namn?: string | null; anteckning?: string | null }): string {
  const n = (p.namn || "").trim();
  if (n) return n;
  return (p.anteckning || "").trim().slice(0, MAX_NAMN_TECKEN).trim() || "Period";
}

/** Den period man håller på att lägga in: samma namn och samma veckor som en befintlig är samma period för andra förare. */
export type NyPeriod = { namn: string; startdatum: string; slutdatum: string };
const arSammaPeriod = (e: Krockperiod, ny?: NyPeriod) =>
  !!ny && ny.namn.trim() !== "" && periodNamn(e).toLowerCase() === ny.namn.trim().toLowerCase() && e.startdatum === ny.startdatum && e.slutdatum === ny.slutdatum;

/** Perioder som ligger över veckan för någon av de valda förarna. Alla valt = en period för vem som helst krockar. */
export function krockarIVecka<T extends Krockperiod>(mandag: string, val: Forarval, befintliga: T[], utan?: string | string[], ny?: NyPeriod): T[] {
  const undantag = Array.isArray(utan) ? utan : utan ? [utan] : [];
  if (!val.alla && val.ids.length === 0) return [];   // ingen förare vald: inget att krocka med
  const sondag = slutFranMandag(mandag);
  return befintliga.filter(e => !undantag.includes(e.id) && !arSammaPeriod(e, ny) && e.startdatum <= sondag && e.slutdatum >= mandag
    && (val.alla || e.medarbetare_id == null || val.ids.includes(e.medarbetare_id)));
}

/** Perioden som står på en tonad vecka: dess NAMN, och "+N" när flera ligger över varandra. */
export function krockText(k: { namn?: string | null; anteckning?: string | null; startdatum?: string; slutdatum?: string }[]): string {
  // Rader i samma period (samma namn och veckor, olika förare) räknas som EN period.
  const unika = new Map<string, (typeof k)[number]>();
  for (const r of k) { const nyckel = `${periodNamn(r).toLowerCase()}|${r.startdatum ?? ""}|${r.slutdatum ?? ""}`; if (!unika.has(nyckel)) unika.set(nyckel, r); }
  const lista = Array.from(unika.values());
  return lista.length === 0 ? "" : lista.length === 1 ? periodNamn(lista[0]) : `${periodNamn(lista[0])} +${lista.length - 1}`;
}

/** Varje krockande period en gång (tidigast först) för veckorna i urvalet. */
export function krockarIUrval<T extends Krockperiod>(u: Urval, val: Forarval, befintliga: T[], utan?: string | string[], ny?: NyPeriod): T[] {
  if (!u.forsta) return [];
  const sett = new Map<string, T>();
  for (let m = lokal(u.forsta); iso(m) <= (u.sista || u.forsta); m = dagar(m, 7)) for (const k of krockarIVecka(iso(m), val, befintliga, utan, ny)) sett.set(k.id, k);
  return Array.from(sett.values()).sort((a, b) => a.startdatum.localeCompare(b.startdatum));
}

export type PeriodRad = Krockperiod & { overenskommen_datum?: string | null; skapad_av?: string | null };

/** EN period i listan: rader med samma namn, start och slut. Varje förare (eller Alla) är en egen rad i databasen. */
export type PeriodGrupp<T extends PeriodRad = PeriodRad> = {
  nyckel: string; namn: string; startdatum: string; slutdatum: string;
  rader: T[]; ids: string[];
  /** En rad med medarbetare_id NULL finns i gruppen. */
  alla: boolean;
  /** Personerna (medarbetar-id) som har en egen rad, i radernas ordning. */
  forare: string[];
  anteckning: string;
  /** Överenskommelsens datum: det första i gruppen. Appen skriver samma datum på alla rader. */
  overenskommen: string | null;
};

export function grupperaPerioder<T extends PeriodRad>(rader: T[]): PeriodGrupp<T>[] {
  const grupper = new Map<string, PeriodGrupp<T>>();
  for (const r of rader) {
    const nyckel = `${periodNamn(r).toLowerCase()}|${r.startdatum}|${r.slutdatum}`;
    const g = grupper.get(nyckel) || { nyckel, namn: periodNamn(r), startdatum: r.startdatum, slutdatum: r.slutdatum, rader: [], ids: [], alla: false, forare: [], anteckning: "", overenskommen: null };
    g.rader.push(r); g.ids.push(r.id);
    if (r.medarbetare_id == null) g.alla = true;
    else if (!g.forare.includes(r.medarbetare_id)) g.forare.push(r.medarbetare_id);
    if (!g.anteckning && (r.anteckning || "").trim()) g.anteckning = r.anteckning.trim();
    if (!g.overenskommen && r.overenskommen_datum) g.overenskommen = r.overenskommen_datum;
    grupper.set(nyckel, g);
  }
  return Array.from(grupper.values());
}

/**
 * Vad som ska göras med raderna i en grupp när förarna ändras: de som finns kvar uppdateras (veckor, namn, anteckning,
 * överenskommelse), de som bockats ur raderas, de som bockats i blir nya rader. Alla (NULL) är en egen rad.
 */
export function planeraAndring(grupp: { rader: { id: string; medarbetare_id: string | null }[] }, val: Forarval): { uppdatera: string[]; taBort: string[]; ny: (string | null)[] } {
  const onskade: (string | null)[] = [...(val.alla ? [null] : []), ...val.ids];
  const uppdatera: string[] = [], taBort: string[] = [];
  for (const r of grupp.rader) (onskade.includes(r.medarbetare_id) ? uppdatera : taBort).push(r.id);
  const finns = new Set(grupp.rader.map(r => r.medarbetare_id));
  return { uppdatera, taBort, ny: onskade.filter(o => !finns.has(o)) };
}

/** Förnamnen på de valda förarna (Alla först), i förarlistans ordning. */
export function forareNamn(val: Forarval, personer: { id: string; namn: string | null }[]): string[] {
  return [...(val.alla ? ["Alla"] : []), ...personer.filter(p => val.ids.includes(p.id)).map(p => (p.namn || "Namnlös").split(" ")[0])];
}

/**
 * Värdet på Förare-raden: 'Välj', 'Alla', namnen ('Stefan, Daniel, Joacim') eller, om de inte får plats, 'N förare'.
 * Alla och en enda förare visas alltid med namn: de är korta och ändras inte till ett antal.
 */
export function forareRadText(val: Forarval, personer: { id: string; namn: string | null }[], passar: boolean): string {
  const namn = forareNamn(val, personer);
  if (namn.length === 0) return "Välj";
  if (passar || namn.length === 1 || (val.alla && val.ids.length === 0)) return namn.join(", ");
  return `${namn.length} förare`;
}

/**
 * EN rad om krocken: "Krockar med Gävle v17–27 (Joacim, Daniel, Stefan, Martin)". Samma period för flera förare (samma namn och
 * veckor) blir en post; anteckningen står aldrig med. `fornamn` ger förarens förnamn för ett medarbetar-id.
 */
export function krockMening(krockar: Krockperiod[], fornamn: (id: string) => string): string {
  const grupper = new Map<string, { namn: string; startdatum: string; slutdatum: string; forare: string[]; alla: boolean }>();
  for (const k of krockar) {
    const nyckel = `${periodNamn(k).toLowerCase()}|${k.startdatum}|${k.slutdatum}`;
    const g = grupper.get(nyckel) || { namn: periodNamn(k), startdatum: k.startdatum, slutdatum: k.slutdatum, forare: [], alla: false };
    if (k.medarbetare_id == null) g.alla = true;
    else { const n = fornamn(k.medarbetare_id); if (!g.forare.includes(n)) g.forare.push(n); }
    grupper.set(nyckel, g);
  }
  const poster = Array.from(grupper.values()).sort((a, b) => a.startdatum.localeCompare(b.startdatum))
    .map(g => `${g.namn} ${veckoText(g)} (${g.alla ? "alla" : g.forare.join(", ")})`);
  return poster.length ? `Krockar med ${poster.join(", ")}` : "";
}

/** Det som spärrar Spara. Null = går att spara. Anteckningen är valfri och ingår inte. */
export function kontrolleraPeriod(p: { forsta: string; sista: string; namn: string; antalForare?: number }): string | null {
  if (p.antalForare === 0) return "Välj minst en förare."
  const namn = p.namn.trim()
  if (!namn) return "Skriv ett namn på perioden."
  if (namn.length > MAX_NAMN_TECKEN) return `Namnet får vara högst ${MAX_NAMN_TECKEN} tecken.`
  if (!p.forsta) return "Välj första veckan."
  if (!p.sista) return "Välj sista veckan."
  if (p.sista < p.forsta) return "Sista veckan ligger före den första."
  return null
}

/** Kommande och pågående (efter start, tidigast först) överst; avslutade (senast slut först) under. En period som slutar idag pågår. */
export function delaUpp<T extends Datumpar>(rader: T[], idag: string): { kommande: T[]; avslutade: T[] } {
  const kommande = rader.filter(r => r.slutdatum >= idag).sort((a, b) => a.startdatum.localeCompare(b.startdatum))
  const avslutade = rader.filter(r => r.slutdatum < idag).sort((a, b) => b.slutdatum.localeCompare(a.slutdatum))
  return { kommande, avslutade }
}

/** Löneperioderna (YYYY-MM) som perioden berör: varje arbetsmånad från start till slut, löneperiod = arbetsmånad + 1. */
export function loneperioderBerorda(p: Datumpar): string[] {
  const s = lokal(p.startdatum), e = lokal(p.slutdatum)
  const ut: string[] = []
  for (let y = s.getFullYear(), m = s.getMonth(); y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth()); m++) {
    if (m > 11) { m = 0; y++ }
    const lone = new Date(y, m + 1, 1)
    ut.push(`${lone.getFullYear()}-${String(lone.getMonth() + 1).padStart(2, "0")}`)
  }
  return ut
}

/**
 * Har perioden påverkat en redan EXPORTERAD löneperiod? Skickad lön (fortnox_export_logg.status = 'skickat') för en
 * berörd löneperiod: för vem som helst om perioden gäller alla, annars för just den personen.
 */
export function arExporterad(p: Datumpar & { medarbetare_id?: string | null }, logg: { period: string; medarbetare_id: string; status: string }[]): boolean {
  const berorda = new Set(loneperioderBerorda(p))
  return logg.some(l => l.status === "skickat" && berorda.has(l.period) && (!p.medarbetare_id || l.medarbetare_id === p.medarbetare_id))
}
