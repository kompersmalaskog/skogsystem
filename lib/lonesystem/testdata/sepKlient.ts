// En liten databasklient över testdata/sep2026.json (produktionens augusti–september 2026, pseudonymiserad) för septemberbytediff.test.ts.
// Den svarar på exakt de frågor beraknaLoneunderlag ställer (eq / in / gte / lte, ingen sortering — raderna ligger redan i databasens ordning).
// Ingen import från lib/: samma fil körs mot den GAMLA och den NYA koden, så den får inte bero på något som ändrats.
import fixtur from "./sep2026.json";

type Rad = Record<string, any>;

/** Produktionens sju löneartskopplingar (2026-10-15), så som lonesystem_artikelmappning ser ut. */
export const PROD_MAPPNING: { intern_typ: string; extern_kod: string; beskrivning: string }[] = [
  { intern_typ: "timlon", extern_kod: "11", beskrivning: "Timlön" },
  { intern_typ: "premielon_skordare", extern_kod: "1355", beskrivning: "Premielön skördare" },
  { intern_typ: "premielon_skotare", extern_kod: "1354", beskrivning: "Premielön skotare" },
  { intern_typ: "overtid_skordare", extern_kod: "1435", beskrivning: "Övertid skördare" },
  { intern_typ: "overtid_skotare", extern_kod: "1436", beskrivning: "Övertid skotare" },
  { intern_typ: "valtlappar", extern_kod: "136", beskrivning: "Vältlappar mm" },
  { intern_typ: "korersattning", extern_kod: "821", beskrivning: "Körersättning skattefri" },
];

export function sepTabeller(mappning = PROD_MAPPNING): Record<string, Rad[]> {
  const f: any = fixtur;
  return {
    medarbetare: f.medarbetare.map(([id, namn, maskin_id]: any[]) => ({ id, namn, maskin_id })),
    arbetsdag: f.arbetsdag.map((r: any[], i: number) => ({
      id: `d${i + 1}`, medarbetare_id: r[0], datum: r[1], arbetad_min: r[2], maskin_id: r[3], km_totalt: r[4], bekraftad: r[5], dagtyp: r[6],
      synk_avvikelse: null, start_tid: r[7], brandrisk_beordrad: r[11], slut_tid: r[8], rast_min: r[9], traktamente: r[10], objekt_id: null,
    })),
    extra_tid: f.extra_tid.map((r: any[]) => ({ medarbetare_id: r[0], datum: r[1], minuter: r[2], objekt_id: null, aktivitet_typ: null, start_tid: r[3], slut_tid: r[4] })),
    ledighet_ansokningar: f.ledighet.map((r: any[], i: number) => ({
      id: `l${i + 1}`, medarbetare_id: r[0], typ: r[1], startdatum: r[2], slutdatum: r[3], ersatter_datum: r[4], fran_tid: r[5], till_tid: r[6], status: r[7],
    })),
    dim_maskin: f.dim_maskin.map(([maskin_id, maskin_typ, sander_filer]: any[]) => ({ maskin_id, maskin_typ, sander_filer })),
    medarbetare_lonesystem: f.anstnr.map((medarbetare_id: string, i: number) => ({ medarbetare_id, anstallningsnummer: String(1001 + i) })),
    gs_avtal: [{ ...f.gs_avtal, giltigt_fran: "2025-04-01" }],
    fortnox_export_logg: [],
    utjamningsperiod: [],
    vilobrott: [],
    arbetsdag_objekt: [],
    dim_objekt: [],
    fakt_avbrott: [],
    operator_medarbetare: [],
    fakt_tid: [],
    lonesystem_koppling: [{ id: "ls1", system_typ: "fortnox" }],
    lonesystem_artikelmappning: mappning.map((m, i) => ({ id: `x${i + 1}`, lonesystem_id: "ls1", ...m })),
  };
}

class Fraga {
  private f: ((r: Rad) => boolean)[] = [];
  private enkel = false;
  constructor(private rader: Rad[]) {}
  select() { return this; } order() { return this; } limit() { return this; } range() { return this; }
  eq(k: string, v: any) { this.f.push(r => r[k] === v); return this; }
  in(k: string, v: any[]) { this.f.push(r => v.includes(r[k])); return this; }
  gte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] >= v); return this; }
  lte(k: string, v: any) { this.f.push(r => r[k] != null && r[k] <= v); return this; }
  maybeSingle() { this.enkel = true; return this; }
  then(res: any, rej: any) {
    const rader = this.rader.filter(r => this.f.every(fn => fn(r))).map(r => ({ ...r }));
    return Promise.resolve({ data: this.enkel ? rader[0] ?? null : rader, error: null }).then(res, rej);
  }
}

export function sepKlient(mappning = PROD_MAPPNING) {
  const tabeller = sepTabeller(mappning);
  return {
    from(t: string) {
      if (!(t in tabeller)) throw new Error(`sepKlient: tabellen ${t} finns inte i testdatan`);
      return new Fraga(tabeller[t]);
    },
  };
}
