import { describe, it, expect } from 'vitest';
import { hamtaSenasteSparStart, type DbLike } from './maskinPositionDb';
import fixtur from './__fixtures__/hyttspar_index_2026-10-02.json';

// En liten fejk-klient byggd på den RIKTIGA prod-fixturen. Den tolkar bara de frågor hamtaSenasteSparStart ställer
// (.or-filtret på objekt, .or(maskin_id/objekt_id.in) + .gt på hyttspar, .eq('id') för punkter/objekt-rad) och loggar varje anrop.
const HALABACK_ID = '0a57ddbb-1bae-4080-ab56-d0972512525f';

function fejk() {
  const logg: string[] = [];
  const objektRader = fixtur.objekt as any[];
  const index = fixtur.index as any[];
  const db: DbLike = {
    from(tabell: string) {
      const q: any = { tabell, select: '', or: '', eq: null as null | [string, string], gt: null as any };
      const b: any = {
        select(s: string) { q.select = s; return b; },
        or(f: string) { q.or = f; return b; },
        gt(k: string, v: number) { q.gt = [k, v]; return b; },
        order() { return b; },
        limit() { return b; },
        eq(k: string, v: string) { q.eq = [k, v]; return b; },
        maybeSingle() { return Promise.resolve(kor(true)); },
        then(res: any, rej: any) { return Promise.resolve(kor(false)).then(res, rej); },
      };
      const kor = (en: boolean): { data: any } => {
        logg.push(`${tabell}|${q.select}|${q.or}|${q.eq ? q.eq.join('=') : ''}`);
        if (tabell === 'objekt' && q.or) {
          const m = /skotare_maskin_id\.eq\.([^,]+),skordare_maskin_id\.eq\.(.+)$/.exec(q.or)!;
          return { data: objektRader.filter((o) => o.skotare_maskin_id === m[1] || o.skordare_maskin_id === m[2])
            .map((o) => ({ id: o.id, skotare_maskin_id: o.skotare_maskin_id, skordare_maskin_id: o.skordare_maskin_id })) };
        }
        if (tabell === 'objekt' && q.eq) return { data: en ? (objektRader.find((o) => o.id === q.eq![1]) ?? null) : null };
        if (tabell === 'hyttspar' && q.or) {
          const mid = /maskin_id\.eq\.([^,]+)/.exec(q.or)![1];
          const ids = (/objekt_id\.in\.\(([^)]*)\)/.exec(q.or)?.[1] ?? '').split(',').filter(Boolean);
          return { data: index.filter((r) => (r.maskin_id === mid || ids.includes(r.objekt_id)) && r.antal_punkter > 0) };
        }
        if (tabell === 'hyttspar' && q.eq) {
          const s = fixtur.senasteSkotarPass;
          return { data: q.eq[1] === s.id ? { points: s.sista5 } : null };
        }
        return { data: null };
      };
      return b;
    },
  };
  return { db, logg };
}

describe('hamtaSenasteSparStart — fejk-klient på riktig prod-fixtur', () => {
  it('KODBEVIS: A130743 → Hålabäck au 2025, spår 2026-10-02, sista punkten + hela objekt-raden', async () => {
    const { db } = fejk();
    const r = await hamtaSenasteSparStart(db, 'A130743');
    expect(r).not.toBeNull();
    expect(r!.start).toMatchObject({ kalla: 'hyttspar', objektId: HALABACK_ID, datum: '2026-10-02', roll: 'skotare' });
    expect(r!.start.lat).toBeCloseTo(56.3573062, 6);
    expect(r!.start.lon).toBeCloseTo(15.0479767, 6);
    expect(r!.objekt?.namn).toBe('Hålabäck au 2025');
  });

  it('vidObjektKant anropas med spårets objekt INNAN punkterna hämtats (förladdning av geometrin går parallellt)', async () => {
    const { db, logg } = fejk();
    let loggVidAnrop: string[] = [];
    await hamtaSenasteSparStart(db, 'A130743', () => { loggVidAnrop = [...logg]; });
    expect(loggVidAnrop.some((l) => l.startsWith('hyttspar|points'))).toBe(false);   // punkterna ej hämtade än
    expect(loggVidAnrop.some((l) => l.startsWith('hyttspar|id,objekt_id'))).toBe(true);   // indexet var klart
  });

  it('exakt tre steg: tilldelning → index (utan points) → punkter + objekt-rad. Aldrig points för index-frågan.', async () => {
    const { db, logg } = fejk();
    await hamtaSenasteSparStart(db, 'A130743');
    expect(logg).toHaveLength(4);
    expect(logg[0].startsWith('objekt|id,skotare_maskin_id,skordare_maskin_id|')).toBe(true);
    expect(logg[1].startsWith('hyttspar|id,objekt_id,roll,datum,maskin_id,antal_punkter,uppdaterad_at|')).toBe(true);
    expect(logg[1]).not.toMatch(/points/);
    expect(logg.slice(2).some((l) => l.startsWith('hyttspar|points'))).toBe(true);
    expect(logg.slice(2).some((l) => l.startsWith('objekt|*'))).toBe(true);
  });

  it('maskin utan spår → null (R64101: gallringsskördare utan hyttspår)', async () => {
    const { db } = fejk();
    expect(await hamtaSenasteSparStart(db, 'R64101')).toBeNull();
  });

  it('maskin_id med tecken som kan bryta ett PostgREST-filter → null UTAN att fråga databasen', async () => {
    const { db, logg } = fejk();
    expect(await hamtaSenasteSparStart(db, 'x,objekt_id.neq.0')).toBeNull();
    expect(await hamtaSenasteSparStart(db, 'a)b')).toBeNull();
    expect(logg).toHaveLength(0);
  });

  it('objekt-raden saknas (raderat objekt) → ändå en position, objekt = null', async () => {
    const { db } = fejk();
    const orig = db.from.bind(db);
    const db2: DbLike = {
      from(t: string) {
        const b = orig(t);
        if (t !== 'objekt') return b;
        const sel = b.select.bind(b);
        b.select = (s: string) => { const r = sel(s); if (s === '*') r.maybeSingle = () => Promise.resolve({ data: null }); return r; };
        return b;
      },
    };
    const r = await hamtaSenasteSparStart(db2, 'A130743');
    expect(r?.objekt).toBeNull();
    expect(r?.start.objektId).toBe(HALABACK_ID);
  });
});
