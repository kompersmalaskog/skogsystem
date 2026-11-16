// Läsningen av appens lass + källvakter för hur den är kopplad.
//
// Risken här är TYSTHET: ett lass som ligger under ett annat av traktens
// nummer, eller ett obekräftat lass som smyger in, syns inte som ett fel —
// det syns som en faktura med fel avståndstillägg.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lasAppLass } from './lasAppLass';

const HAMTA = readFileSync('lib/faktura/hamtaUnderlag.ts', 'utf8');
const LAS = readFileSync('lib/faktura/lasAppLass.ts', 'utf8');

/** Minsta möjliga Supabase-klient: spelar in frågan och svarar med rader. */
function fejk(svar: Record<string, any[]>) {
  const fragor: any[] = [];
  const bygg = (tabell: string) => {
    const f: any = { tabell, filter: {} as Record<string, any> };
    const k: any = {
      select: (s: string) => { f.select = s; return k; },
      in: (kol: string, v: any[]) => { f.filter[`in:${kol}`] = v; return k; },
      eq: (kol: string, v: any) => { f.filter[`eq:${kol}`] = v; return k; },
      neq: (kol: string, v: any) => { f.filter[`neq:${kol}`] = v; return k; },
      order: () => k,
      range: async () => { fragor.push(f); return { data: svar[tabell] ?? [], error: null }; },
    };
    return k;
  };
  return { sb: { from: bygg }, fragor };
}

const SPAR = [{ lat: 56.000, lng: 15 }, { lat: 56.002, lng: 15 }];

describe('appens lass för en trakt', () => {
  it('läser på ALLA traktens nummer — ett lass under ett annat nummer tappas tyst', async () => {
    const { sb, fragor } = fejk({ skotar_lass: [] });
    await lasAppLass(sb as any, ['11271883', 'R64428_12', '11166477']);
    expect(fragor[0].filter['in:vo_nummer']).toEqual(['11271883', 'R64428_12', '11166477']);
  });

  it('BARA klar räknas: bekräftat, aldrig auto', async () => {
    const { sb, fragor } = fejk({ skotar_lass: [] });
    await lasAppLass(sb as any, ['X']);
    expect(fragor[0].filter['eq:status']).toBe('bekraftat');
    expect(fragor[0].filter['neq:bekraftad_av']).toBe('auto');
  });

  it('volymen summeras per lass ur sortimentraderna', async () => {
    const { sb } = fejk({
      skotar_lass: [{ id: 'L1', maskin_id: 'A130743', datum: '2026-11-02', spar: SPAR }],
      skotar_lass_sortiment: [
        { lass_id: 'L1', m3_forare: 12 },
        { lass_id: 'L1', m3_forare: 8 },
      ],
    });
    const r = await lasAppLass(sb as any, ['X']);
    expect(r).toHaveLength(1);
    expect(r[0].volym).toBe(20);
    expect(r[0].kalla).toBe('app');
    expect(r[0].maskinId).toBe('A130743');
    expect(r[0].avstandM).toBeGreaterThan(100);
  });

  it('lass utan spår får avstandM null — aldrig 0, som ser mätt ut', async () => {
    const { sb } = fejk({
      skotar_lass: [{ id: 'L1', maskin_id: 'A', datum: '2026-11-02', spar: null }],
      skotar_lass_sortiment: [{ lass_id: 'L1', m3_forare: 20 }],
    });
    const r = await lasAppLass(sb as any, ['X']);
    expect(r[0].avstandM).toBeNull();
    expect(r[0].volym).toBe(20);
  });

  it('lass utan sortimentrader får volym 0, inte ett kast', async () => {
    const { sb } = fejk({
      skotar_lass: [{ id: 'L1', maskin_id: 'A', datum: '2026-11-02', spar: SPAR }],
      skotar_lass_sortiment: [],
    });
    expect((await lasAppLass(sb as any, ['X']))[0].volym).toBe(0);
  });

  it('inga nummer och inga lass ger tom lista utan att fråga', async () => {
    const { sb, fragor } = fejk({});
    expect(await lasAppLass(sb as any, [])).toEqual([]);
    expect(fragor).toHaveLength(0);
  });
});

describe('källvakter: hur det är kopplat', () => {
  it('ett läsfel KASTAR — en tom lista hade blivit 0 kr som ser mätt ut', () => {
    // fetchAllRows kastar vid fel; funktionen fångar inte.
    expect(LAS).not.toMatch(/catch\s*\(/);
    expect(LAS).not.toMatch(/\|\|\s*\[\]\s*;?\s*$/m);
  });

  it('underlaget läser appens lass på VO plus dim-numren', () => {
    expect(HAMTA).toMatch(/lasAppLass\(sb, \[voNummer, \.\.\.objektIds\]\)/);
  });

  it('källorna vägs mot varandra — aldrig summerade', () => {
    expect(HAMTA).toContain('valjLassKalla([...optiLass, ...appLass])');
    // Loopen som summerar kronor går över de VALDA lassen, inte över båda.
    expect(HAMTA).toMatch(/for \(const l of barande\)/);
    expect(HAMTA).not.toMatch(/for \(const l of \[\.\.\.optiLass/);
  });

  it('halveringen sker på ETT ställe, aldrig med en egen division', () => {
    expect(LAS).not.toMatch(/\/\s*2\b/);
    const f = readFileSync('lib/faktura/lassAvstand.ts', 'utf8');
    expect(f).toContain('skotningsavstandM(pathMeters(koord))');
    expect(f.replace(/\/\/[^\n]*/g, '')).not.toMatch(/\/\s*2\b/);
  });
});
