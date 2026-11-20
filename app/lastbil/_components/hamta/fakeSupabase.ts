// Testfake för Hämta-flödet: tabeller som arrayer, frågor som faktiskt filtrerar, skrivningar som loggas. Inte en ersättning för databasen —
// bara tillräckligt trogen för att testerna ska se RIKTIGA payloads (vad som skrivs, med vilket filter) och rader tillbaka (noll rader = fel).

export interface Skrivning { tabell: string; op: 'insert' | 'update'; varden: any; filter: [string, string, any][]; antal: number }

export interface FakeDb {
  tabeller: Record<string, any[]>;
  skrivningar: Skrivning[];
  /** Tabeller vars läsning ska ge fel. */
  lasfel: Set<string>;
  /** Tabeller vars skrivning ska ge fel. */
  skrivfel: Set<string>;
  rpc: { namn: string; args: any }[];
  användare: { id: string; email: string } | null;
  nastaId: number;
}

export function nyFakeDb(tabeller: Record<string, any[]> = {}): FakeDb {
  return { tabeller, skrivningar: [], lasfel: new Set(), skrivfel: new Set(), rpc: [], användare: { id: 'u-1', email: 'forare@example.se' }, nastaId: 1 };
}

type Filter = [string, string, any];

const jamfor = (rad: any, [k, op, v]: Filter): boolean => {
  const x = rad[k];
  switch (op) {
    case 'eq': return x === v;
    case 'is': return v === null ? x == null : x === v;
    case 'notis': return v === null ? x != null : x !== v;
    case 'in': return (v as any[]).includes(x);
    case 'gt': return x != null && x > v;
    case 'gte': return x != null && x >= v;
    case 'lte': return x != null && x <= v;
    case 'neq': return x !== v;
    default: return true;
  }
};

export function fakeSupabase(db: FakeDb) {
  class Q {
    private filter: Filter[] = [];
    private ordning: [string, boolean][] = [];
    private grans: number | null = null;
    private skriv: { op: 'insert' | 'update'; varden: any } | null = null;
    private huvud = false;
    constructor(private t: string) {}
    select(_k?: string, opt?: { count?: string; head?: boolean }) { if (opt?.head) this.huvud = true; return this; }
    eq(k: string, v: any) { this.filter.push([k, 'eq', v]); return this; }
    neq(k: string, v: any) { this.filter.push([k, 'neq', v]); return this; }
    is(k: string, v: any) { this.filter.push([k, 'is', v]); return this; }
    not(k: string, op: string, v: any) { this.filter.push([k, op === 'is' ? 'notis' : 'neq', v]); return this; }
    in(k: string, v: any[]) { this.filter.push([k, 'in', v]); return this; }
    gt(k: string, v: any) { this.filter.push([k, 'gt', v]); return this; }
    gte(k: string, v: any) { this.filter.push([k, 'gte', v]); return this; }
    lte(k: string, v: any) { this.filter.push([k, 'lte', v]); return this; }
    or() { return this; }
    range() { return this; }
    order(k: string, o?: { ascending?: boolean }) { this.ordning.push([k, o?.ascending !== false]); return this; }
    limit(n: number) { this.grans = n; return this; }
    insert(v: any) { this.skriv = { op: 'insert', varden: v }; return this; }
    update(v: any) { this.skriv = { op: 'update', varden: v }; return this; }
    maybeSingle() { return Promise.resolve(this.svar(true)); }
    single() { return Promise.resolve(this.svar(true)); }
    then(res: any, rej: any) { return Promise.resolve(this.svar(false)).then(res, rej); }

    private rader(): any[] {
      let r = (db.tabeller[this.t] ?? []).filter(x => this.filter.every(f => jamfor(x, f)));
      for (const [k, asc] of [...this.ordning].reverse()) r = [...r].sort((a, b) => (a[k] === b[k] ? 0 : (a[k] > b[k] ? 1 : -1)) * (asc ? 1 : -1));
      return this.grans != null ? r.slice(0, this.grans) : r;
    }
    private svar(en: boolean) {
      if (this.skriv) {
        if (db.skrivfel.has(this.t)) return { data: null, error: { message: `skrivfel ${this.t}` } };
        const { op, varden } = this.skriv;
        let rader: any[];
        if (op === 'insert') {
          rader = (Array.isArray(varden) ? varden : [varden]).map(v => ({ id: `${this.t}-${db.nastaId++}`, ...v }));
          (db.tabeller[this.t] ??= []).push(...rader);
        } else {
          rader = this.rader();
          rader.forEach(r => Object.assign(r, varden));
        }
        db.skrivningar.push({ tabell: this.t, op, varden, filter: this.filter, antal: rader.length });
        return { data: en ? (rader[0] ?? null) : rader, error: null };
      }
      if (db.lasfel.has(this.t)) return { data: null, error: { message: `läsfel ${this.t}` } };
      const rader = this.rader();
      if (this.huvud) return { data: null, count: rader.length, error: null };
      return { data: en ? (rader[0] ?? null) : rader, error: null };
    }
  }
  return {
    from: (t: string) => new Q(t),
    rpc: (namn: string, args: any) => { db.rpc.push({ namn, args }); return Promise.resolve({ data: null, error: null }); },
    auth: { getUser: async () => ({ data: { user: db.användare } }) },
  };
}
