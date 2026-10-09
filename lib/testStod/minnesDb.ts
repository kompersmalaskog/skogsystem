// En MINNES-databas som härmar den del av supabase-js/PostgREST som appens skrivande kod använder — bara för tester.
//
// Varför inte en mock per test: sammanslagningen och hyttspårskopplingen gör flera läsningar och skrivningar efter varandra och ska bevisas på
// SLUTTILLSTÅNDET (vilka rader finns kvar var), inte på vilka anrop som gjordes. Därför en riktig liten tabellmodell:
//   • from(t).select(kol?).eq/neq/in/is/gte/lte/like(...).order().limit()  → { data, error }   (supabase-js KASTAR aldrig — fel kommer som { error })
//   • from(t).insert(rad|rader).select() / .update(patch).filter...select() / .delete().filter...select()
//   • unika nycklar (constraints) → 23505 som i Postgres; fel kan injiceras per tabell+operation (injiceraFel)
//   • rpc(namn) → registrerade funktioner
// Ingen RLS, inga typer, ingen join — det prövar vi inte här.

export type Rad = Record<string, any>;
type Fel = { message: string; code?: string };
type Svar<T> = { data: T | null; error: Fel | null };

export interface MinnesDb {
  tabeller: Record<string, Rad[]>;
  /** Unika nycklar: tabell → lista av kolumnlistor. NULL räknas som olika (som Postgres). */
  unika: Record<string, string[][]>;
  /** Injicera fel: nyckel 'tabell.operation' (select|insert|update|delete) → felet returneras en gång (eller alltid med { alltid: true }). */
  injiceraFel(nyckel: string, fel: Fel, opt?: { alltid?: boolean }): void;
  /** ON DELETE CASCADE: raderas en rad i `ref` raderas rader i `tabell` vars `kol` pekar på den (id). */
  kaskad: { tabell: string; kol: string; ref: string }[];
  /** Kör `fn` EN gång precis före nästa operation 'tabell.operation' (t.ex. för att låta en annan klient ändra tabellen mellan en läsning och en skrivning). */
  fore(nyckel: string, fn: () => void): void;
  /** Alla skrivningar i ordning (insert/update/delete) — för att kunna visa att INGET skrevs. */
  skrivlogg: { tabell: string; op: string; antal: number }[];
  funktioner: Record<string, (args?: any) => any>;
  from(tabell: string): any;
  rpc(namn: string, args?: any): Promise<Svar<any>>;
}

export function skapaMinnesDb(start: Record<string, Rad[]> = {}, unika: Record<string, string[][]> = {}): MinnesDb {
  const tabeller: Record<string, Rad[]> = {};
  for (const [t, rader] of Object.entries(start)) tabeller[t] = rader.map((r) => ({ ...r }));
  const felLista = new Map<string, { fel: Fel; alltid: boolean }>();
  const foreLista = new Map<string, () => void>();
  let idRaknare = 0;

  const db: MinnesDb = {
    tabeller, unika, skrivlogg: [], funktioner: {}, kaskad: [],
    injiceraFel(nyckel, fel, opt) { felLista.set(nyckel, { fel, alltid: !!opt?.alltid }); },
    fore(nyckel, fn) { foreLista.set(nyckel, fn); },
    rpc(namn, args) {
      const f = db.funktioner[namn];
      if (!f) return Promise.resolve({ data: null, error: { message: `function ${namn} does not exist`, code: '42883' } });
      try { return Promise.resolve({ data: f(args), error: null }); } catch (e: any) { return Promise.resolve({ data: null, error: { message: e?.message || String(e) } }); }
    },
    from(tabell: string) {
      if (!tabeller[tabell]) tabeller[tabell] = [];
      const filter: ((r: Rad) => boolean)[] = [];
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let payload: any = null;
      let kolumner = '*';
      let ordning: { kol: string; stigande: boolean } | null = null;
      let gräns: number | null = null;
      let skickaTillbaka = false;
      let ensam: null | 'single' | 'maybe' = null;

      const projicera = (r: Rad) => {
        if (!kolumner || kolumner === '*') return { ...r };
        const ut: Rad = {};
        for (const k of kolumner.split(',').map((s) => s.trim()).filter(Boolean)) ut[k] = r[k];
        return ut;
      };
      const unikBrott = (rad: Rad, ignorera?: Rad): boolean => {
        for (const kols of unika[tabell] || []) {
          if (kols.some((k) => rad[k] == null)) continue;
          if (tabeller[tabell].some((o) => o !== ignorera && kols.every((k) => String(o[k]) === String(rad[k])))) return true;
        }
        return false;
      };
      const utfor = (): Svar<any> => {
        const nyckel = `${tabell}.${op}`;
        const fore = foreLista.get(nyckel);
        if (fore) { foreLista.delete(nyckel); fore(); }
        const inj = felLista.get(nyckel);
        if (inj) { if (!inj.alltid) felLista.delete(nyckel); return { data: null, error: inj.fel }; }
        const traffar = () => tabeller[tabell].filter((r) => filter.every((f) => f(r)));
        if (op === 'select') {
          let rader = traffar();
          if (ordning) { const o = ordning; rader = [...rader].sort((a, b) => (a[o.kol] === b[o.kol] ? 0 : a[o.kol] > b[o.kol] ? 1 : -1) * (o.stigande ? 1 : -1)); }
          if (gräns != null) rader = rader.slice(0, gräns);
          const ut = rader.map(projicera);
          if (ensam) return { data: ut[0] ?? null, error: ensam === 'single' && ut.length !== 1 ? { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } : null };
          return { data: ut, error: null };
        }
        if (op === 'insert') {
          const nya = (Array.isArray(payload) ? payload : [payload]).map((r: Rad) => ({ id: `id-${++idRaknare}`, ...r }));
          for (const n of nya) { if (unikBrott(n)) return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } }; }
          for (const n of nya) tabeller[tabell].push(n);
          db.skrivlogg.push({ tabell, op, antal: nya.length });
          if (!skickaTillbaka) return { data: null, error: null };
          const ut = nya.map(projicera);
          return { data: ensam ? ut[0] ?? null : ut, error: null };
        }
        if (op === 'update') {
          const rader = traffar();
          // Atomärt per sats (som Postgres): bryter någon rad en unik nyckel ändras ingen.
          const nyaVarden = rader.map((r) => ({ ...r, ...payload }));
          for (let i = 0; i < rader.length; i++) {
            if (unikBrott(nyaVarden[i], rader[i])) return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          }
          rader.forEach((r, i) => Object.assign(r, nyaVarden[i]));
          db.skrivlogg.push({ tabell, op, antal: rader.length });
          if (!skickaTillbaka) return { data: null, error: null };
          const ut = rader.map(projicera);
          return { data: ensam ? ut[0] ?? null : ut, error: null };
        }
        // delete
        const bort = new Set(traffar());
        tabeller[tabell] = tabeller[tabell].filter((r) => !bort.has(r));
        const bortIds = new Set([...bort].map((r) => String(r.id)));
        for (const k of db.kaskad) if (k.ref === tabell && tabeller[k.tabell]) tabeller[k.tabell] = tabeller[k.tabell].filter((r) => !bortIds.has(String(r[k.kol])));
        db.skrivlogg.push({ tabell, op, antal: bort.size });
        return { data: skickaTillbaka ? [...bort].map(projicera) : null, error: null };
      };

      const lagg = (kol: string, test: (v: any) => boolean) => { filter.push((r) => test(r[kol])); };
      const b: any = {
        select(kol?: string) { if (op === 'select') kolumner = kol ?? '*'; else { skickaTillbaka = true; if (kol) kolumner = kol; } return b; },
        insert(p: any) { op = 'insert'; payload = p; return b; },
        update(p: any) { op = 'update'; payload = p; return b; },
        delete() { op = 'delete'; return b; },
        eq(kol: string, v: any) { lagg(kol, (x) => x != null && String(x) === String(v)); return b; },
        neq(kol: string, v: any) { lagg(kol, (x) => String(x) !== String(v)); return b; },
        in(kol: string, v: any[]) { const s = new Set((v || []).map(String)); lagg(kol, (x) => x != null && s.has(String(x))); return b; },
        is(kol: string, v: null) { lagg(kol, (x) => (v === null ? x == null : x === v)); return b; },
        gte(kol: string, v: any) { lagg(kol, (x) => x != null && x >= v); return b; },
        lte(kol: string, v: any) { lagg(kol, (x) => x != null && x <= v); return b; },
        like(kol: string, m: string) {
          const delar = String(m).split('%');
          lagg(kol, (x) => { if (x == null) return false; const s = String(x); if (delar.length === 1) return s === delar[0]; return s.startsWith(delar[0]) && s.endsWith(delar[delar.length - 1]) && s.length >= delar[0].length + delar[delar.length - 1].length; });
          return b;
        },
        not(kol: string, o: string, v: any) { if (o === 'like') { const delar = String(v).split('%'); lagg(kol, (x) => !(x != null && String(x).startsWith(delar[0]))); } else if (o === 'is' && v === null) lagg(kol, (x) => x != null); return b; },
        order(kol: string, o?: { ascending?: boolean }) { ordning = { kol, stigande: o?.ascending !== false }; return b; },
        limit(n: number) { gräns = n; return b; },
        maybeSingle() { ensam = 'maybe'; return Promise.resolve(utfor()); },
        single() { ensam = 'single'; return Promise.resolve(utfor()); },
        then(res: any, rej: any) { return Promise.resolve(utfor()).then(res, rej); },
      };
      return b;
    },
  };
  return db;
}
