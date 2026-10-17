// En liten databasklient över tabeller som testet själv skriver (till skillnad från sepKlient, som läser produktionens fixtur).
// Den svarar på exakt de frågor beraknaLoneunderlag ställer (eq / in / gte / lte, ingen sortering — raderna ligger i skrivordning).
type Rad = Record<string, any>;

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

/** Tabeller som beraknaLoneunderlag läser men som ett test sällan bryr sig om: tomma om testet inte anger dem. */
const TOMMA = ["extra_tid", "ledighet_ansokningar", "fortnox_export_logg", "utjamningsperiod", "vilobrott", "arbetsdag_objekt", "dim_objekt", "fakt_avbrott", "operator_medarbetare", "fakt_tid"];

export function tabellKlient(tabeller: Record<string, Rad[]>) {
  const alla: Record<string, Rad[]> = { ...Object.fromEntries(TOMMA.map(t => [t, []])), ...tabeller };
  return {
    from(t: string) {
      if (!(t in alla)) throw new Error(`tabellKlient: tabellen ${t} finns inte i testdatan`);
      return new Fraga(alla[t]);
    },
  };
}
