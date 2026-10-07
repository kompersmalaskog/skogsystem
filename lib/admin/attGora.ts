// Översiktens att-göra-lista — ren uppbyggnad. Inga nya trösklar: varje rad kommer ur en regel som redan
// finns i admin (Att åtgärda i Medarbetare, Maskiners nya-lista, Vilobrott, Avtal, Datahälsa).
//
// Indatat är resultat per källa. En källa som inte gick att läsa blir en egen rad ("Kunde inte kontrollera
// …"), aldrig en tyst nolla: ett läsfel är inte "inget väntar".
import type { MedarbetarKontroller } from "@/lib/medarbetarKontroll";
import type { LeveransRad } from "@/app/datahalsa/useDatahalsa";
import { LEV_GUL_DYGN } from "@/app/datahalsa/useDatahalsa";
import type { VilobrottRad } from "@/lib/admin/vilobrottLista";

export type AdminFlik = "oversikt" | "medarbetare" | "maskiner" | "lon" | "avtal";

/** Vart en rad leder: en flik (med underflik/parametrar), en annan sida, eller en ny läsning. */
export type Mal =
  | { typ: "flik"; flik: AdminFlik; underflik?: string; params?: Record<string, string> }
  | { typ: "sida"; href: string }
  | { typ: "forsok" };

export type Sak = { id: string; rubrik: string; detalj?: string; knapp: string; mal: Mal };
export type StammerRad = { id: string; rubrik: string; detalj?: string };

/** Resultat av en läsning: data, eller felet som stoppade den. */
export type Kalla<T> = { data: T | null; fel: string | null };

export type Person = { id: string; namn: string | null; user_id: string | null };
export type MaskinRad = { maskin_id: string; visningsnamn: string | null; modell: string | null; bekraftad: boolean; aktiv_till: string | null };
export type ObekraftadDag = { medarbetare_id: string; datum: string };
export type LonLage = { arbetsManad: string; antalMedDagar: number; antalSkickade: number };
export type AvtalRad = { giltigt_till: string | null };

export type AttGoraIndata = {
  kontroller: Kalla<MedarbetarKontroller>;
  personer: Kalla<Person[]>;
  maskiner: Kalla<MaskinRad[]>;
  obekraftade: Kalla<ObekraftadDag[]>;
  lon: Kalla<LonLage>;
  vilobrott: Kalla<VilobrottRad[]>;
  avtal: Kalla<AvtalRad | null>;
  leverans: Kalla<LeveransRad[]>;
};

const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const MAN_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export const manadNamn = (ym: string) => MANADER[Number(ym.slice(5, 7)) - 1] || ym;
export const datumKort = (d: string) => `${Number(d.slice(8, 10))} ${MAN_KORT[Number(d.slice(5, 7)) - 1] || ""}`;
export const datumLangt = (d: string) => `${Number(d.slice(8, 10))} ${MANADER[Number(d.slice(5, 7)) - 1] || ""} ${d.slice(0, 4)}`;

/** "8,5 h" — vilan i timmar med en decimal och decimalkomma. */
const vilaTimmarText = (h: number | string) => `${String(Math.round(Number(h) * 10) / 10).replace(".", ",")} h`;
const dygn = (n: number) => `${n} dygn`;
const dagar = (n: number) => `${n} ${n === 1 ? "dag" : "dagar"}`;

/** Avtalet "går ut inom en månad" = slutdatumet är högst 31 dagar bort, eller redan passerat. */
export function avtalKraverDig(giltigtTill: string | null, idag: string): "utgatt" | "snart" | null {
  const d = (giltigtTill || "").slice(0, 10);
  if (!d) return null;
  if (d < idag) return "utgatt";
  const dagarKvar = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${idag}T12:00:00Z`)) / 86400000);
  return dagarKvar <= 31 ? "snart" : null;
}

export function byggAttGora(i: AttGoraIndata, idag: string): { saker: Sak[]; stammer: StammerRad[] } {
  const saker: Sak[] = [];
  const stammer: StammerRad[] = [];
  const felRad = (id: string, vad: string, fel: string) =>
    saker.push({ id: `fel-${id}`, rubrik: `Kunde inte kontrollera ${vad}`, detalj: fel, knapp: "Försök igen", mal: { typ: "forsok" } });

  // ── Lön ──
  if (i.lon.fel) felRad("lon", "lönen", i.lon.fel);
  else if (i.lon.data && i.lon.data.antalMedDagar > 0) {
    const l = i.lon.data;
    if (l.antalSkickade < l.antalMedDagar) {
      saker.push({
        id: "lon", rubrik: `Lönen för ${manadNamn(l.arbetsManad)} är klar att granska`,
        detalj: l.antalSkickade > 0 ? `${l.antalSkickade} av ${l.antalMedDagar} förare är skickade till Fortnox` : `${l.antalMedDagar} förare väntar på att skickas till Fortnox`,
        knapp: "Granska", mal: { typ: "flik", flik: "lon", underflik: "underlag" },
      });
    } else stammer.push({ id: "lon", rubrik: `Lönen för ${manadNamn(l.arbetsManad)} är skickad till Fortnox` });
  }

  // ── Dagar som väntar på bekräftelse ──
  if (i.obekraftade.fel) felRad("dagar", "dagar som väntar på bekräftelse", i.obekraftade.fel);
  else if (i.obekraftade.data) {
    const rader = i.obekraftade.data;
    if (rader.length > 0) {
      const namn = new Map((i.personer.data || []).map(p => [p.id, p.namn || p.id.slice(0, 8)]));
      const perPerson = new Map<string, string[]>();
      for (const r of [...rader].sort((a, b) => a.datum.localeCompare(b.datum))) {
        if (!perPerson.has(r.medarbetare_id)) perPerson.set(r.medarbetare_id, []);
        perPerson.get(r.medarbetare_id)!.push(r.datum);
      }
      const tidigast = [...rader].map(r => r.datum).sort()[0];
      const nu = idag.slice(0, 7);
      const manadensOffset = (Number(nu.slice(0, 4)) - Number(tidigast.slice(0, 4))) * 12 + (Number(nu.slice(5, 7)) - Number(tidigast.slice(5, 7)));
      saker.push({
        id: "dagar", rubrik: `${dagar(rader.length)} väntar på bekräftelse`,
        detalj: Array.from(perPerson.entries()).map(([id, ds]: [string, string[]]) => `${namn.get(id) || id.slice(0, 8)}: ${ds.map(datumKort).join(", ")}`).join(" · "),
        knapp: "Se dagarna",
        mal: { typ: "flik", flik: "lon", underflik: "dagar", params: { dagper: "M", dagoff: String(-manadensOffset), avv: "1" } },
      });
    } else stammer.push({ id: "dagar", rubrik: "Alla dagar är bekräftade" });
  }

  // ── Vilobrott ──
  if (i.vilobrott.fel) felRad("vilobrott", "vilobrott", i.vilobrott.fel);
  else if (i.vilobrott.data) {
    const obesvarade = i.vilobrott.data.filter(b => !b.svar);
    if (obesvarade.length > 0) {
      const perPerson = new Map<string, VilobrottRad[]>();
      for (const b of obesvarade) { if (!perPerson.has(b.medarbetare_id)) perPerson.set(b.medarbetare_id, []); perPerson.get(b.medarbetare_id)!.push(b); }
      perPerson.forEach((lista, id) => {
        const sorterat = [...lista].sort((a, b) => a.datum.localeCompare(b.datum));
        saker.push({
          id: `vila-${id}`,
          rubrik: `${lista[0].namn}: ${lista.length} ${lista.length === 1 ? "obesvarat vilobrott" : "obesvarade vilobrott"}`,
          detalj: sorterat.map(b => `${datumKort(b.datum)} ${b.typ === "dygnsvila" ? "dygnsvila" : "veckovila"} ${vilaTimmarText(b.vila_h)}`).join(" · "),
          knapp: "Visa", mal: { typ: "flik", flik: "lon", underflik: "vila" },
        });
      });
    } else stammer.push({ id: "vila", rubrik: "Inga obesvarade vilobrott" });
  }

  // ── Personer: saknar maskin, hempunkt eller inloggning ──
  const personProblem = new Map<string, { namn: string; problem: string[] }>();
  const lagg = (id: string, namn: string, p: string) => {
    const e = personProblem.get(id) || { namn, problem: [] as string[] };
    e.problem.push(p); personProblem.set(id, e);
  };
  if (i.kontroller.fel) felRad("personer", "personerna", i.kontroller.fel);
  else if (i.kontroller.data) {
    for (const f of i.kontroller.data.forareUtanMaskin) lagg(f.id, f.namn, "saknar maskin");
    for (const h of i.kontroller.data.saknarHempunkt) {
      lagg(h.id, h.namn, h.orsak === "ingen_adress" ? "saknar hemadress" : h.orsak === "osaker" ? "hemadressen är osäker" : h.orsak === "misslyckad" ? "hemadressen hittades inte" : "hemadressen väntar på geokodning");
    }
  }
  if (i.personer.fel) felRad("inloggning", "inloggningarna", i.personer.fel);
  else if (i.personer.data) for (const p of i.personer.data) if (!p.user_id) lagg(p.id, p.namn || "Namnlös", "ingen inloggning kopplad");
  personProblem.forEach((e, id) => {
    saker.push({ id: `person-${id}`, rubrik: e.namn, detalj: e.problem.join(" · "), knapp: "Öppna", mal: { typ: "flik", flik: "medarbetare", params: { person: id } } });
  });
  if (i.kontroller.data && i.personer.data && personProblem.size === 0) stammer.push({ id: "personer", rubrik: "Alla har maskin, hempunkt och inloggning" });

  // ── Okänd operatör vars namn matchar en medarbetare ──
  if (i.kontroller.data) {
    for (const o of i.kontroller.data.okandaOperatorer) {
      saker.push({
        id: `operator-${o.operator_id}`,
        rubrik: `Operatören "${o.operator_namn}" matchar ${o.medarbetare.namn}`,
        detalj: `${dagar(o.datum.length)} utan koppling, tiden når inte lönen`,
        knapp: "Koppla", mal: { typ: "flik", flik: "medarbetare" },
      });
    }
    if (i.kontroller.data.okandaOperatorer.length === 0) stammer.push({ id: "operatorer", rubrik: "Alla operatörer är kopplade" });
  }

  // ── Ny maskin i importen ──
  if (i.maskiner.fel) felRad("maskiner", "maskinerna", i.maskiner.fel);
  else if (i.maskiner.data) {
    const nya = i.maskiner.data.filter(m => !m.bekraftad && !m.aktiv_till);
    for (const m of nya) {
      saker.push({
        id: `maskin-${m.maskin_id}`, rubrik: `Ny maskin i importen: ${m.visningsnamn || m.modell || m.maskin_id}`,
        detalj: m.maskin_id, knapp: "Bekräfta", mal: { typ: "flik", flik: "maskiner", params: { maskin: m.maskin_id } },
      });
    }
  }

  // ── Avtalet ──
  if (i.avtal.fel) felRad("avtalet", "avtalet", i.avtal.fel);
  else if (i.avtal.data) {
    const k = avtalKraverDig(i.avtal.data.giltigt_till, idag);
    if (k) {
      saker.push({
        id: "avtal", rubrik: k === "utgatt" ? "Avtalet har gått ut" : "Avtalet går ut inom en månad",
        detalj: `Gäller till ${datumLangt(i.avtal.data.giltigt_till!)}`, knapp: "Öppna avtalet", mal: { typ: "flik", flik: "avtal" },
      });
    } else stammer.push({ id: "avtal", rubrik: i.avtal.data.giltigt_till ? `Avtalet gäller till ${datumLangt(i.avtal.data.giltigt_till)}` : "Avtalet har inget slutdatum" });
  }

  // ── Maskiner som inte skickat fil på länge (Datahälsa) ──
  if (i.leverans.fel) felRad("maskinfilerna", "maskinfilerna", i.leverans.fel);
  else if (i.leverans.data) {
    // Samma urval som Datahälsa: ur drift, filfria och obekräftade maskiner larmar aldrig.
    const tysta = i.leverans.data.filter(r => !r.aktivTill && r.sanderFiler && r.bekraftad && r.dagarSedan != null && r.dagarSedan > LEV_GUL_DYGN);
    for (const r of tysta) {
      saker.push({
        id: `tyst-${r.maskinId}`, rubrik: `${r.namn} har inte skickat fil på ${dygn(r.dagarSedan!)}`,
        detalj: r.senasteData ? `Senaste data ${datumLangt(r.senasteData)}` : undefined, knapp: "Öppna Datahälsa", mal: { typ: "sida", href: "/datahalsa" },
      });
    }
    if (tysta.length === 0) stammer.push({ id: "maskinfiler", rubrik: `Alla maskiner har skickat fil inom ${dygn(LEV_GUL_DYGN)}` });
  }

  return { saker, stammer };
}
