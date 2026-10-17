// Löneunderlaget per förare (Admin → Lön → Löneunderlag), ren uppbyggnad ur dry_run-svaret.
//
// Tre sorters rader, en sak per rad:
//   - kolla: något som en människa kan göra något åt (med en knapp dit det fixas när det finns en),
//   - info: dämpat — sant men ingen åtgärd,
//   - helglon: bara de röda dagarna som INTE är en vanlig helglön (de som betalar syns i lönearaden).
// Samma sak står aldrig två gånger: brandriskraden och "dagar utan rast" är borta (lönearaden har OB-timmarna, och rast
// noll är info i dagens detalj), "anställningsdatum saknas" lyfts till svarsraden i stället för att upprepas per förare.
// Företagsledare har inga lönerader — och inga varningar om dem.
//
// Datum skrivs på ETT sätt här: "11 aug".
import { helglonSkalText } from "@/lib/lonesystem/helglon";
import { unikaUtjamningar, utjamningsRad } from "@/lib/admin/arsovertidVy";

const MAN_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export const dagText = (d: string) => `${Number(d.slice(8, 10))} ${MAN_KORT[Number(d.slice(5, 7)) - 1] || ""}`;

export type Mal =
  | { typ: "dagar" }
  | { typ: "maskin"; id: string }
  | { typ: "person"; id: string }
  | { typ: "personer" }
  | { typ: "lonearter" };

export type VyRad = { id: string; text: string; mal?: Mal; knapp?: string };

export type ForarKort = {
  id: string;
  namn: string;
  ledare: boolean;
  status: string;
  /** Anställningsnumret saknas: går inte att skicka. */
  saknarAnstNr: boolean;
  helglon: string[];
  kolla: VyRad[];
  info: VyRad[];
};

const FRANVARO_ORD: Record<string, string> = {
  sjuk: "Sjuk", vab: "VAB", tjanstledig: "Tjänstledig", foraldraledig: "Föräldraledig", semester: "Semester", atk: "ATK", komp: "Komp", permission: "Permission",
};

const fmtMin = (min: number) => { const h = Math.floor(min / 60), mm = Math.round(min % 60); return mm ? `${h} tim ${mm} min` : `${h} tim`; };
const tim = (min: number) => (Math.round(Math.abs(min) / 6) / 10).toLocaleString("sv-SE");
const ANST_DATUM = /^Anställningsdatum saknas/i;
/** Varningar som redan visas som egna rader eller lyfts till svarsraden. */
const REDAN_VISAD = /saknar typ|^Kortpass|^Helglön|^Löneart saknas|skickas inte: ingen kod är kopplad|^Anställningsdatum saknas/i;

/** "Frånvaro (tjanstledig): 1 dag(ar) 2025-12-30 — löneart …" → "Tjänstledig 30 dec · ingen löneart i Fortnox, lägg in för hand". Flera dagar: "Sjuk 5 dagar, 3 aug–7 aug · …". Annan varning: orörd. */
function franvaroRad(v: string): string | null {
  const m = /^Frånvaro \((\w+)\): (\d+) dag\(ar\) (\d{4}-\d{2}-\d{2})(?:…(\d{4}-\d{2}-\d{2}))? — löneart/.exec(v);
  if (!m) return null;
  const ord = FRANVARO_ORD[m[1]] || m[1];
  const n = Number(m[2]);
  const nar = n === 1 || !m[4] ? dagText(m[3]) : `${n} dagar, ${dagText(m[3])}–${dagText(m[4])}`;
  return `${ord} ${nar} · ingen löneart i Fortnox, lägg in för hand`;
}

export function byggForarKort(m: any, oenighet: any[] = []): ForarKort {
  const ledare = m.foretagsledare === true;
  const kort: ForarKort = { id: m.medarbetare_id, namn: m.namn, ledare, status: m.status, saknarAnstNr: !ledare && !m.anstallningsnummer, helglon: [], kolla: [], info: [] };
  if (ledare) return kort;

  const dagar: Mal = { typ: "dagar" };
  const kolla = (id: string, text: string, mal?: Mal, knapp?: string) => kort.kolla.push({ id, text, mal, knapp });
  const info = (id: string, text: string) => kort.info.push({ id, text });

  for (const h of m.helglon?.dagar || []) {
    if (h.ger === false) kort.helglon.push(`${dagText(h.datum)} ${h.namn}: ingen helglön — ${helglonSkalText(h.skal)}`);
    else if (h.arbetad) kort.helglon.push(`${dagText(h.datum)} ${h.namn}: arbetad, helglön ändå`);
    if (h.bytesLedig) kort.helglon.push(`${dagText(h.datum)} ${h.namn}: byts mot ledig ${dagText(h.bytesLedig)}`);
  }

  for (const id of m.maskin_utan_typ || []) kolla(`typ-${id}`, `Maskinen ${id} saknar typ — premien räknas inte`, { typ: "maskin", id }, "Öppna");
  for (const o of m.orimliga || []) {
    const tider = `${String(o.start_tid || "").slice(0, 5)}–${String(o.slut_tid || "").slice(0, 5)}`;
    kolla(`orim-${o.datum}`, o.slag === "lang"
      ? `${dagText(o.datum)}: passet är ${tim(o.arbetad_min)} tim (${tider}) — stämmer det?`
      : `${dagText(o.datum)}: rasten är längre än passet (${tider}, rast ${o.rast_min} min)`, dagar, "Se dagen");
  }
  for (const r of m.rast_langa || []) {
    const ovrigt = (r.avbrott || []).filter((a: any) => /övrigt|default/i.test(`${a.typ} ${a.kategori || ""}`));
    const stopp = ovrigt.length > 0 ? ` · maskinen stod still ${ovrigt.map((a: any) => `${a.minuter} min`).join(", ")} samtidigt` : "";
    kolla(`rast-${r.datum}`, `${dagText(r.datum)}: rast ${r.rast_min} min${stopp}`, dagar, "Se dagen");
  }
  for (const k of m.kortpass || []) kolla(`kort-${k.datum}`, `${dagText(k.datum)}: kortpass ${k.minuter} min · räknas inte som arbetsdag`, dagar, "Se dagen");
  (m.synk || []).forEach((s: any, i: number) => kolla(`synk-${i}`, `${dagText(s.datum)}: ${s.diff_min} min skiljer mot maskinen (du sa ${s.bekraftat}, maskinen ${s.maskinen})`, dagar, "Se dagen"));
  (m.ledighetskollision || []).forEach((k: any, i: number) => kolla(`led-${i}`, `${dagText(k.datum)}: godkänd ledighet (${k.typ}) och ${fmtMin(k.arbetad_min)} arbete`, dagar, "Se dagen"));
  if ((m.obekraftade || 0) > 0) kolla("obekr", `${m.obekraftade} obekräftad${m.obekraftade === 1 ? "" : "e"} arbetsdag${m.obekraftade === 1 ? "" : "ar"}`, dagar, "Se dagarna");
  (m.byten || []).forEach((b: any, i: number) => {
    const text = `Bytesdag: ${dagText(b.ledig)} ersätter ${b.ersatterNamn} ${dagText(b.ersatter)}`
      + (b.ledigArbetad ? " — men den lediga dagen har arbete" : !b.ersatterArbetad ? " — men ingen arbetstid den röda dagen" : "");
    if (b.ledigArbetad || !b.ersatterArbetad) kolla(`byte-${i}`, text, dagar, "Se dagen"); else info(`byte-${i}`, text);
  });

  (m.deldagar || []).forEach((dd: any, i: number) =>
    info(`deldag-${i}`, `Deldag ${dagText(dd.datum)}: ${dd.typ} ${dd.fran_tid ? `från ${dd.fran_tid}` : `till ${dd.till_tid}`} · ${Number(dd.timmar).toLocaleString("sv-SE")} tim frånvaro, arbetade ${tim(dd.arbetad_min)} tim`));
  unikaUtjamningar(m.utjamning).forEach((u, i) => info(`utj-${i}`, utjamningsRad(u)));
  if ((m.ob?.obesvarade || 0) > 0) info("ob-obesvarad", `${m.ob.obesvarade} tidig start väntar på förarens brandrisk-svar`);
  for (const o of oenighet.filter((x: any) => x.svar.some((s: any) => s.medarbetare_id === m.medarbetare_id))) {
    info(`oen-${o.datum}`, `${dagText(o.datum)}: förarna svarar olika på brandriskfrågan (${o.svar.map((s: any) => `${s.namn} ${s.brandrisk_beordrad ? "ja" : "nej"}`).join(", ")})`);
  }
  (m.varningar || []).filter((v: string) => !REDAN_VISAD.test(v)).forEach((v: string, i: number) => {
    const fr = franvaroRad(v);
    if (fr) info(`fr-${i}`, fr); else info(`v-${i}`, v);
  });
  return kort;
}

/** Förare som saknar anställningsdatum (kvalifikationstiden för helglön går inte att kontrollera). En rad i svarsraden, inte en per förare. */
export function saknarAnstallningsdatum(medarbetare: any[]): { id: string; namn: string }[] {
  return (medarbetare || [])
    .filter(m => m.foretagsledare !== true && (m.varningar || []).some((v: string) => ANST_DATUM.test(v)))
    .map(m => ({ id: m.medarbetare_id, namn: m.namn }));
}

/** Antal saker att kolla: varje kolla-rad, och en för anställningsdatum (hur många som än saknar det) och en för koder att koppla. */
export function antalAttKolla(kort: ForarKort[], saknarDatum: number, kodRad: boolean): number {
  return kort.reduce((n, k) => n + k.kolla.length + (k.saknarAnstNr ? 1 : 0), 0) + (saknarDatum > 0 ? 1 : 0) + (kodRad ? 1 : 0);
}
