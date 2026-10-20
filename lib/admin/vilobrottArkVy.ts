// Vilobrottsarket: dagarna ett vilobrott gäller, uppställda för en vy. INGEN egen uträkning — passen, vilan och var den ligger kommer ur
// vilobrottDagar (lib/vilobrott, samma uträkning som brottet) och längden/kravet ur brottet självt. Här bara ord och ordning.
import type { VilobrottRad } from "@/lib/admin/vilobrottLista";
import { dagText } from "@/lib/admin/loneunderlagVy";

const DAG = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const veckodag = (datum: string) => DAG[new Date(datum + "T12:00:00").getDay()];
const dagMedVeckodag = (datum: string) => `${veckodag(datum)} ${dagText(datum)}`;
/** "8,5 h" — timmar med en decimal och decimalkomma (samma som Översiktens rad). */
export const vilaH = (h: number | string) => `${String(Math.round(Number(h) * 10) / 10).replace(".", ",")} h`;

export type VilobrottArkRad =
  | { slag: "pass"; nyckel: string; datum: string; dag: string; tid: string }
  | { slag: "vila"; nyckel: string; rubrik: string; detalj: string };

export type VilobrottArkBrott = {
  nyckel: string;
  typ: "dygnsvila" | "veckovila";
  datum: string;
  rubrik: string;
  /** "8,5 h av 11 h" — vilan mot kravet. */
  hoger: string;
  /** Dagarna: passen och vilan i tidsordning. Tom när brottet inte gick att peka ut i underlaget (då visas `beskrivning`). */
  rader: VilobrottArkRad[];
  /** Veckovila: "7 dagar: 14–20 sep". */
  fonster: string | null;
  beskrivning: string;
  svar: string | null;
  svarText: string;
  /** Dagen "Se hela månaden" öppnar Förare · Månad på: brottets datum. */
  dag: string;
};

export type VilobrottArkVy = { namn: string; forstaNamn: string; medarbetare_id: string; rubrik: string; brott: VilobrottArkBrott[] };

const punktNyckel = (datum: string, tid: string) => `${datum} ${tid}`;

export function byggVilobrottArk(rader: VilobrottRad[], medarbetare_id: string): VilobrottArkVy | null {
  const obesvarade = rader.filter(b => b.medarbetare_id === medarbetare_id && !b.svar).sort((a, b) => a.datum.localeCompare(b.datum) || a.typ.localeCompare(b.typ));
  if (obesvarade.length === 0) return null;
  const namn = obesvarade[0].namn;
  const brott = obesvarade.map((b): VilobrottArkBrott => {
    const d = b.dagar;
    let radlista: VilobrottArkRad[] = [];
    let fonster: string | null = null;
    if (d) {
      // Passen och vilan i tidsordning: vilan står efter passet som slutar där den börjar (före passen när den börjar före första passet).
      const poster: { sort: string; rad: VilobrottArkRad }[] = d.pass.map((p, i) => ({
        sort: punktNyckel(p.datum, p.start_tid),
        rad: { slag: "pass", nyckel: `pass-${i}`, datum: p.datum, dag: dagMedVeckodag(p.datum), tid: `${p.start_tid}–${p.slut_tid}` },
      }));
      const kravText = `kravet ${vilaH(b.krav_h)}`;
      const slagText = d.vila.slag === "fore_forsta" ? " före första passet" : d.vila.slag === "efter_sista" ? " efter sista passet, fram till nu" : "";
      poster.push({
        sort: punktNyckel(d.vila.fran.datum, d.vila.fran.tid),
        rad: {
          slag: "vila", nyckel: "vila",
          rubrik: `${b.typ === "veckovila" ? "Längsta vilan" : "Vila"} ${vilaH(d.vila.h)}${slagText} · ${kravText}`,
          detalj: `${veckodag(d.vila.fran.datum)} ${d.vila.fran.tid} → ${veckodag(d.vila.till.datum)} ${d.vila.till.tid}${b.typ === "veckovila" ? " · sammanhängande" : ""}`,
        },
      });
      // Pass före vilan först; ett pass som börjar när vilan börjar hör till efter den (stabil sortering, vilan före).
      radlista = poster.sort((a, c) => (a.sort < c.sort ? -1 : a.sort > c.sort ? 1 : a.rad.slag === c.rad.slag ? 0 : a.rad.slag === "vila" ? -1 : 1)).map(x => x.rad);
      if (d.fonster) fonster = `${Math.round((new Date(d.fonster.till).getTime() - new Date(d.fonster.fran).getTime()) / 86400000) + 1} dagar: ${dagText(d.fonster.fran)}–${dagText(d.fonster.till)}`;
    }
    return {
      nyckel: `${b.typ}-${b.datum}`,
      typ: b.typ,
      datum: b.datum,
      rubrik: `${b.typ === "dygnsvila" ? "Dygnsvila" : "Veckovila"} · ${b.typ === "dygnsvila" ? dagText(b.datum) : `v.${b.vecka}`}`,
      hoger: `${vilaH(b.vila_h)} av ${vilaH(b.krav_h)}`,
      rader: radlista,
      fonster,
      beskrivning: b.beskrivning,
      svar: b.svar,
      svarText: b.svar ? `Förarens svar: ${b.svar}` : "Obesvarat – föraren svarar i sin Arbetsrapport",
      dag: b.datum,
    };
  });
  return {
    namn,
    forstaNamn: namn.split(" ")[0],
    medarbetare_id,
    rubrik: `${brott.length} ${brott.length === 1 ? "obesvarat vilobrott" : "obesvarade vilobrott"}`,
    brott,
  };
}

/** Löneperioden (adressens ?period=) för en arbetsdag: arbetsmånaden + 1, samma regel som Löneunderlag. */
export function loneperiodForDag(datum: string): string {
  const [ar, man] = [Number(datum.slice(0, 4)), Number(datum.slice(5, 7))];
  const d = new Date(ar, man, 1);   // månad + 1
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Går månaden att öppna i Förare · Månad? Löneunderlaget finns för månader t.o.m. förra kalendermånaden (adressens period får inte ligga i framtiden). */
export function manadenGarAttOppna(datum: string, idag: string): boolean {
  return loneperiodForDag(datum) <= idag.slice(0, 7);
}
