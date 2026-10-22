// En minimal Supabase-fake för besökets servertester: tabeller som arrayer, filtren som servern använder (eq, gte, lte, in), insert och rpc. Inget annat — anropar koden något annat kastar fakeen.

type Rad = Record<string, any>;
type Resultat = { data: any; error: { message: string } | null; count?: number | null };

export function fakeSb(tabeller: Record<string, Rad[]>, rpcSvar: Record<string, any> = {}, opt: { fel?: Record<string, string> } = {}) {
  const loggar: { tabell: string; op: string; rad?: Rad }[] = [];
  const valda: { tabell: string; kolumner: string }[] = [];
  let n = 0;
  function bygg(tabell: string) {
    const filter: ((r: Rad) => boolean)[] = [];
    let op: 'select' | 'insert' | 'upsert' = 'select';
    let insRad: Rad | null = null;
    let huvud = false;
    let upsertNyckel: Record<string, true> = {};
    let kolumner = '*';
    const kor = (): Resultat => {
      const fel = opt.fel?.[tabell];
      if (fel) return { data: null, error: { message: fel } };
      if (op === 'upsert') {
        const rad = { ...insRad };
        const finns = (tabeller[tabell] ?? []).some((r) => Object.keys(upsertNyckel).every((k) => r[k] === rad[k]));
        if (!finns) { (tabeller[tabell] ??= []).push(rad); loggar.push({ tabell, op: 'upsert', rad }); }
        return { data: null, error: null };
      }
      if (op === 'insert') {
        const rad = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, skapad_at: new Date().toISOString(), ...insRad };
        (tabeller[tabell] ??= []).push(rad);
        loggar.push({ tabell, op: 'insert', rad });
        return { data: rad, error: null };
      }
      const rader = (tabeller[tabell] ?? []).filter((r) => filter.every((f) => f(r)));
      return { data: huvud ? null : rader, error: null, count: rader.length };
    };
    const b: any = {
      select(k?: string, o?: { head?: boolean; count?: string }) { kolumner = k ?? '*'; valda.push({ tabell, kolumner }); if (o?.head) huvud = true; return b; },
      insert(rad: Rad) { op = 'insert'; insRad = rad; return b; },
      upsert(rad: Rad, o?: { onConflict?: string }) { op = 'upsert'; insRad = rad; upsertNyckel = Object.fromEntries((o?.onConflict ?? 'id').split(',').map((k) => [k.trim(), true as const])); return b; },
      eq(k: string, v: any) { filter.push((r) => r[k] === v); return b; },
      gte(k: string, v: any) { filter.push((r) => r[k] >= v); return b; },
      lte(k: string, v: any) { filter.push((r) => r[k] <= v); return b; },
      in(k: string, v: any[]) { filter.push((r) => v.includes(r[k])); return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() { const r = kor(); return Promise.resolve(r.error ? r : { data: (r.data as Rad[])[0] ?? null, error: null }); },
      single() { const r = kor(); return Promise.resolve(r.error ? r : op === 'insert' ? r : { data: (r.data as Rad[])[0] ?? null, error: null }); },
      then(res: (v: Resultat) => any, rej?: (e: any) => any) { return Promise.resolve(kor()).then(res, rej); },
    };
    return b;
  }
  return {
    from: (t: string) => bygg(t),
    rpc: async (namn: string) => (namn in rpcSvar ? { data: rpcSvar[namn], error: null } : { data: null, error: { message: `rpc ${namn} saknas` } }),
    _loggar: loggar,
    _valda: valda,
  } as any;
}
