// En liten supabase-fake för kor.test.ts: tabeller som arrayer, filter i minnet, upsert med onConflict, rpc via handlers.
// Bara det kor.ts använder (select/eq/in/gte/lte/not/order/limit/upsert/update/rpc) — inte en allmän PostgREST-emulering.

type Rad = Record<string, any>;
type Svar = { data: any; error: any };

export class FakeDb {
  tabeller: Record<string, Rad[]> = {};
  rpcHandlers: Record<string, (args: any) => Svar | Promise<Svar>> = {};
  anrop: { tabeller: string[]; rpc: { namn: string; args: any }[]; upserts: { tabell: string; rader: Rad[] }[]; updates: { tabell: string; varden: Rad; traffade: number }[] } = { tabeller: [], rpc: [], upserts: [], updates: [] };
  /** Tabeller vars läsning ska ge ett fel. */
  lasFel: Record<string, string> = {};
  private n = 0;
  /** "Nu" för kolumner som databasen fyller med now() (skapad_tid). Testet sätter den före varje körning. */
  klocka = new Date().toISOString();

  constructor(start: Record<string, Rad[]> = {}) { this.tabeller = JSON.parse(JSON.stringify(start)); }

  from(tabell: string) { this.anrop.tabeller.push(tabell); return new Fraga(this, tabell); }
  async rpc(namn: string, args: any): Promise<Svar> {
    this.anrop.rpc.push({ namn, args });
    const h = this.rpcHandlers[namn];
    return h ? h(args) : { data: null, error: { message: `rpc ${namn} saknas i fake` } };
  }
  nyttId(): string { return `id-${++this.n}`; }
  rader(tabell: string): Rad[] { return (this.tabeller[tabell] ??= []); }
}

class Fraga implements PromiseLike<Svar> {
  private filter: ((r: Rad) => boolean)[] = [];
  private ordning: { kol: string; stigande: boolean } | null = null;
  private gräns = Infinity;
  private fran = 0;
  private handling: 'select' | 'upsert' | 'update' = 'select';
  private nya: Rad[] = [];
  private varden: Rad = {};
  private konflikt: string[] = [];
  private ignorera = false;
  private returnera = false;

  constructor(private db: FakeDb, private tabell: string) {}

  select(_kolumner?: string) { this.returnera = true; return this; }
  eq(k: string, v: any) { this.filter.push(r => r[k] === v); return this; }
  in(k: string, v: any[]) { this.filter.push(r => v.includes(r[k])); return this; }
  gte(k: string, v: any) { this.filter.push(r => r[k] != null && jamfor(r[k], v) >= 0); return this; }
  lt(k: string, v: any) { this.filter.push(r => r[k] != null && jamfor(r[k], v) < 0); return this; }
  is(k: string, v: any) { this.filter.push(r => (v === null ? r[k] == null : r[k] === v)); return this; }
  range(a: number, b: number) { this.fran = a; this.gräns = b - a + 1; return this; }
  lte(k: string, v: any) { this.filter.push(r => r[k] != null && jamfor(r[k], v) <= 0); return this; }
  not(k: string, op: string, v: any) { if (op === 'is' && v === null) this.filter.push(r => r[k] != null); return this; }
  order(kol: string, o?: { ascending?: boolean }) { this.ordning = { kol, stigande: o?.ascending !== false }; return this; }
  limit(n: number) { this.gräns = n; return this; }
  upsert(rader: Rad | Rad[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.handling = 'upsert'; this.nya = Array.isArray(rader) ? rader : [rader];
    this.konflikt = (o?.onConflict ?? '').split(',').filter(Boolean); this.ignorera = !!o?.ignoreDuplicates;
    return this;
  }
  update(v: Rad) { this.handling = 'update'; this.varden = v; return this; }

  then<T1 = Svar, T2 = never>(ok?: ((v: Svar) => T1 | PromiseLike<T1>) | null, nej?: ((r: any) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    return Promise.resolve(this.kor()).then(ok, nej);
  }

  private kor(): Svar {
    const rader = this.db.rader(this.tabell);
    if (this.handling === 'select') {
      if (this.db.lasFel[this.tabell]) return { data: null, error: { message: this.db.lasFel[this.tabell] } };
      let ut = rader.filter(r => this.filter.every(f => f(r)));
      if (this.ordning) { const { kol, stigande } = this.ordning; ut = [...ut].sort((a, b) => (jamfor(a[kol], b[kol])) * (stigande ? 1 : -1)); }
      return { data: ut.slice(this.fran, this.fran + this.gräns).map(r => ({ ...r })), error: null };
    }
    if (this.handling === 'upsert') {
      const inlagda: Rad[] = [];
      for (const n of this.nya) {
        const finns = this.konflikt.length && rader.some(r => this.konflikt.every(k => r[k] === n[k]));
        if (finns && this.ignorera) continue;
        const rad = { id: this.db.nyttId(), ...(this.tabell === 'lastbil_lass' ? { skapad_tid: this.db.klocka } : {}), ...n };
        if (finns) { Object.assign(rader.find(r => this.konflikt.every(k => r[k] === n[k]))!, n); continue; }
        rader.push(rad); inlagda.push(rad);
      }
      this.db.anrop.upserts.push({ tabell: this.tabell, rader: this.nya });
      return { data: this.returnera ? inlagda.map(r => ({ ...r })) : null, error: null };
    }
    const traffade = rader.filter(r => this.filter.every(f => f(r)));
    traffade.forEach(r => Object.assign(r, this.varden));
    this.db.anrop.updates.push({ tabell: this.tabell, varden: this.varden, traffade: traffade.length });
    return { data: null, error: null };
  }
}

function jamfor(a: any, b: any): number {
  const ta = typeof a === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(a) ? Date.parse(a) : a;
  const tb = typeof b === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(b) ? Date.parse(b) : b;
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}
