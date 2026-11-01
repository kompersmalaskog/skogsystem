// Personal — vad vyn säger om en person. Ren logik, ingen data hämtas här.
//
// Vyn svarar på EN fråga: "Är alla nåbara och behöriga?" (beslut 2026-11-01, bygginstruktionen i projektet
// "Personal vyn"). Varje uppgift ägs av ett ställe: telefon och anhörig av Personal, utbildning av Utbildning
// (`utbildning_status`), ledighet av Ledighet (`ledighet_ansokningar`). Här räknas bara ut vad som ska STÅ.
//
// Färg är aldrig ensam: varje statustext säger själv vad det gäller. `atgard` = orange text, annars grå.

import { FRANVARO_TYP_RUBRIK, type FranvaroTyp } from "@/lib/franvaro";
import { kraverAtgard, kravtypRang, type Kravtyp, type UtbStatus } from "@/lib/utbildning";

export type PersonUtbildning = {
  namn: string;
  status: UtbStatus;
  kravtyp: Kravtyp;
  giltig_till: string | null;
};

export type PersonLedighet = {
  typ: string;
  startdatum: string;
  slutdatum: string;
};

export type Person = {
  id: string;
  namn: string;
  roll: string | null;
  maskin_namn: string | null;
  telefon: string | null;
  anhorig_namn: string | null;
  anhorig_telefon: string | null;
  anhorig_relation: string | null;
  utbildning: PersonUtbildning[];
  /** Pågående eller närmast kommande ledighet/frånvaro (godkänd eller registrerad). */
  ledighet: PersonLedighet | null;
  /** Anställningsdatum (ägs av Admin › Medarbetare). Bara i adminsvaret — undefined = okänt här, aldrig "saknas". */
  anstallningsdatum?: string | null;
  /** Vad vi ska tänka på när vi beställer mat ("laktosfri"). Personens egen uppgift, bara den själv och admin ser den. */
  mat?: string | null;
};

export type Skyddsombud = { id: string; namn: string; telefon: string | null };

export type Status = { text: string; atgard: boolean };

const MANAD = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

/** "YYYY-MM-DD" som lokalt datum, aldrig UTC — annars blir 1 november 31 oktober här. */
function datum(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dagStart(nu: Date): Date {
  return new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
}

const harText = (s: string | null | undefined) => !!s && s.trim() !== "";

export const saknarTelefon = (p: Person) => !harText(p.telefon);
/** Anhörig räknas som ifylld först när det finns ett nummer att ringa — ett namn räcker inte vid en olycka. */
export const saknarAnhorig = (p: Person) => !harText(p.anhorig_telefon);

/** Fornamn: "Stefan Nilsson" → "Stefan". */
export function fornamn(namn: string | null | undefined): string {
  return (namn || "").trim().split(/\s+/)[0] || "Namnlös";
}

// ---------------------------------------------------------------------------
// Utbildning
// ---------------------------------------------------------------------------

const UTB_RANG: Record<UtbStatus, number> = { utgangen: 0, saknas: 1, gar_ut_snart: 2, giltig: 3 };

/** Utbildningar som kräver något, värst först — sedan konsekvensen (lagkrav före beställarkrav). */
export function utbildningAttGora(rader: PersonUtbildning[]): PersonUtbildning[] {
  return rader
    .filter((r) => kraverAtgard(r.status))
    .sort((a, b) => UTB_RANG[a.status] - UTB_RANG[b.status] || kravtypRang(a.kravtyp) - kravtypRang(b.kravtyp) || a.namn.localeCompare(b.namn, "sv"));
}

/** EN rad om personens utbildning. null = personen har inga utbildningskrav alls. */
export function utbildningStatus(rader: PersonUtbildning[]): Status | null {
  if (rader.length === 0) return null;
  const attGora = utbildningAttGora(rader);
  if (attGora.length === 0) return { text: "Allt giltigt", atgard: false };
  const forst = attGora[0];
  const sammaSlag = attGora.filter((r) => r.status === forst.status).length;
  if (forst.status === "utgangen") {
    return { text: sammaSlag === 1 ? `${forst.namn} har gått ut` : `${sammaSlag} utbildningar har gått ut`, atgard: true };
  }
  if (forst.status === "saknas") {
    return { text: sammaSlag === 1 ? `${forst.namn} saknas` : `${sammaSlag} utbildningar saknas`, atgard: true };
  }
  const nar = forst.giltig_till ? ` i ${MANAD[datum(forst.giltig_till).getMonth()]}` : " snart";
  return { text: sammaSlag === 1 ? `${forst.namn} går ut${nar}` : `${sammaSlag} utbildningar går ut snart`, atgard: true };
}

// ---------------------------------------------------------------------------
// Ledighet
// ---------------------------------------------------------------------------

function typRubrik(typ: string): string {
  return FRANVARO_TYP_RUBRIK[typ as FranvaroTyp] ?? "Ledig";
}

/** "3–7 november", "28 oktober – 3 november", "4 november" — med år bara när det inte är i år. */
export function periodText(start: string, slut: string, nu: Date = new Date()): string {
  const a = datum(start);
  const b = datum(slut);
  const ar = (d: Date) => (d.getFullYear() === nu.getFullYear() ? "" : ` ${d.getFullYear()}`);
  if (a.getTime() === b.getTime()) return `${a.getDate()} ${MANAD[a.getMonth()]}${ar(a)}`;
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${MANAD[b.getMonth()]}${ar(b)}`;
  }
  return `${a.getDate()} ${MANAD[a.getMonth()]}${ar(a)} – ${b.getDate()} ${MANAD[b.getMonth()]}${ar(b)}`;
}

export function pagar(l: PersonLedighet, nu: Date = new Date()): boolean {
  const idag = dagStart(nu).getTime();
  return datum(l.startdatum).getTime() <= idag && datum(l.slutdatum).getTime() >= idag;
}

/** Personsidans rad: "Semester 3–7 november", "Sjukdag i dag", "Inget planerat". */
export function ledighetText(l: PersonLedighet | null, nu: Date = new Date()): string {
  if (!l) return "Inget planerat";
  if (pagar(l, nu)) {
    const slutIdag = datum(l.slutdatum).getTime() === dagStart(nu).getTime();
    return slutIdag ? `${typRubrik(l.typ)} i dag` : `${typRubrik(l.typ)} t.o.m. ${periodText(l.slutdatum, l.slutdatum, nu)}`;
  }
  return `${typRubrik(l.typ)} ${periodText(l.startdatum, l.slutdatum, nu)}`;
}

/** Listan nämner bara ledighet som pågår eller börjar inom två veckor — längre fram är inte en status i dag. */
const LEDIG_NARA_DAGAR = 14;

function ledighetNara(l: PersonLedighet | null, nu: Date): boolean {
  if (!l) return false;
  if (pagar(l, nu)) return true;
  const dagarKvar = Math.round((datum(l.startdatum).getTime() - dagStart(nu).getTime()) / 86_400_000);
  return dagarKvar >= 0 && dagarKvar <= LEDIG_NARA_DAGAR;
}

// ---------------------------------------------------------------------------
// Raden i listan och talet överst
// ---------------------------------------------------------------------------

/**
 * EN statustext per person i listan, i den här ordningen: nåbar först (telefon, anhörig), sedan behörig
 * (utbildning), sist information (ledighet). null = inget att säga.
 */
export function personStatus(p: Person, nu: Date = new Date()): Status | null {
  const tel = saknarTelefon(p);
  const anh = saknarAnhorig(p);
  if (tel && anh) return { text: "Saknar telefon och anhörig", atgard: true };
  if (anh) return { text: "Saknar anhörig", atgard: true };
  if (tel) return { text: "Saknar telefon", atgard: true };
  const utb = utbildningStatus(p.utbildning);
  if (utb?.atgard) return utb;
  // Lönen behöver datumet (helglön kräver tre månaders anställning). Bara när svaret faktiskt bär fältet (admin).
  if (saknarAnstallningsdatum(p)) return { text: "Anställningsdatum saknas", atgard: true };
  if (ledighetNara(p.ledighet, nu)) return { text: ledighetText(p.ledighet, nu), atgard: false };
  return null;
}

/** Fältet finns i svaret (admin) men är tomt. Saknas fältet helt vet vi inget och säger inget. */
export const saknarAnstallningsdatum = (p: Person) => p.anstallningsdatum !== undefined && !harText(p.anstallningsdatum);

/** "Mat att tänka på": de som skrivit något, i bokstavsordning. Aldrig de som inte skrivit — det saknas inget då. */
export function matAttTankaPa(personal: Person[]): { id: string; namn: string; mat: string }[] {
  return personal
    .filter((p) => harText(p.mat))
    .map((p) => ({ id: p.id, namn: p.namn, mat: p.mat!.trim() }))
    .sort((a, b) => a.namn.localeCompare(b.namn, "sv"));
}

/** Startsidans påminnelse till personen själv. null = inget att fylla i. */
export function egnaUppgifterText(p: Pick<Person, "telefon" | "anhorig_telefon">): string | null {
  const tel = !harText(p.telefon);
  const anh = !harText(p.anhorig_telefon);
  if (tel && anh) return "Fyll i telefon och anhörig";
  if (anh) return "Fyll i vem vi ringer om något händer dig";
  if (tel) return "Fyll i ditt telefonnummer";
  return null;
}

export function behoverAtgard(p: Person, nu: Date = new Date()): boolean {
  return personStatus(p, nu)?.atgard === true;
}

/** Talet överst: hur många personer som behöver åtgärd. */
export function antalAttGora(personal: Person[], nu: Date = new Date()): number {
  return personal.filter((p) => behoverAtgard(p, nu)).length;
}

/** Listans grupper: rollen är rubriken (som Admin › Medarbetare), förare först. */
export function grupperaPaRoll(personal: Person[]): { rubrik: string; personer: Person[] }[] {
  const ordning: { roll: string; rubrik: string }[] = [
    { roll: "forare", rubrik: "Förare" },
    { roll: "admin", rubrik: "Admin" },
  ];
  const kanda = new Set(ordning.map((o) => o.roll));
  const grupper = ordning
    .map((o) => ({ rubrik: o.rubrik, personer: personal.filter((p) => p.roll === o.roll) }))
    .filter((g) => g.personer.length > 0);
  const ovriga = personal.filter((p) => !p.roll || !kanda.has(p.roll));
  if (ovriga.length) grupper.push({ rubrik: "Övriga", personer: ovriga });
  return grupper;
}
