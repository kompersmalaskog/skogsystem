import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake av supabase-klienten: varje from(tabell) ger en kedjebar, väntbar byggare vars svar kommer ur `h.svar(ctx)`.
// ctx bär tabellen, kolumnen i in(...) och eq-värdena — så ett test kan låta EN tabell (eller EN maskins fakt_tid) fela.
interface Ctx { tabell: string; inKol: string | null; inVarden: unknown[]; eq: Record<string, unknown> }
type Svar = { data: any; error: any }
const h = vi.hoisted(() => ({ svar: (_c: any): any => ({ data: [], error: null }), anrop: [] as any[], kasta: false }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabell: string) => {
      const c: Ctx = { tabell, inKol: null, inVarden: [], eq: {} };
      const q: any = {
        select: () => q, not: () => q, order: () => q, limit: () => q,
        in: (k: string, v: unknown[]) => { c.inKol = k; c.inVarden = v; return q; },
        eq: (k: string, v: unknown) => { c.eq[k] = v; return q; },
        then: (res: any, rej: any) => { h.anrop.push(c); return Promise.resolve().then(() => { if (h.kasta) throw new Error('nätverk'); return h.svar(c); }).then(res, rej); },
      };
      return q;
    },
  },
}));
import { hamtaSenastePlatser } from './senastePlats';

const IDAG = new Date().toLocaleDateString('sv-SE');
const objekt = (id: string, namn: string, over: Record<string, unknown> = {}) => ({ id, namn, vo_nummer: null, dim_objekt_id: null, lat: 56.5, lng: 14.7, larmkoordinat_lat: null, larmkoordinat_lng: null, larmkoordinat_bekraftad: false, ...over });
const OBJ1 = objekt('OBJ-1', 'Objekt ett');
const OBJ2 = objekt('OBJ-2', 'Objekt två', { vo_nummer: 'V2', lat: 56.55, lng: 14.75 });
const FEL = (m: string): Svar => ({ data: null, error: { message: m } });

// Friskt läge: M1 har en avslutad flytt till OBJ-1, M2 producerade idag på V2 (= OBJ-2 via vo_nummer). Sätt `fel` för att låta tabeller felas.
function bygg(fel: Record<string, Svar | ((c: Ctx) => Svar | null)> = {}) {
  h.svar = (c: Ctx): Svar => {
    const f = fel[c.tabell]; const onskat = typeof f === 'function' ? f(c) : f;
    if (onskat) return onskat;
    switch (c.tabell) {
      case 'maskin_flytt': return { data: [{ maskin_id: 'M1', sluttid: IDAG, till_objekt_id: 'OBJ-1', till_plats_id: null, till_lat: 56.5, till_lng: 14.7 }], error: null };
      case 'maskin_position': return { data: [], error: null };
      case 'fakt_tid': return { data: c.eq.maskin_id === 'M2' ? [{ datum: IDAG, objekt_id: 'V2', processing_sek: 100, terrain_sek: 50 }] : [], error: null };
      case 'objekt': return { data: c.inKol === 'id' ? [OBJ1] : c.inKol === 'vo_nummer' ? [OBJ2] : [], error: null };
      default: return { data: [], error: null };
    }
  };
}
const namnAv = (m: Map<string, { namn: string }>, id: string) => m.get(id)?.namn;

beforeEach(() => { h.anrop.length = 0; h.kasta = false; bygg(); });

describe('hamtaSenastePlatser — fel och delfel är inte "ingen plats"', () => {
  it('friskt: platserna finns och varken fel eller delfel är satta', async () => {
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toBeNull();
    expect(namnAv(r.platser, 'M1')).toBe('Objekt ett');
    expect(namnAv(r.platser, 'M2')).toBe('Objekt två');
  });

  it('inga maskiner → tomt, inga fel och inga frågor', async () => {
    const r = await hamtaSenastePlatser([]);
    expect(r).toEqual({ platser: new Map(), fel: null, delvisFel: null });
    expect(h.anrop).toHaveLength(0);
  });

  it('ALLA källor i första steget felar → fel (inte delfel), tomma platser, och andra steget frågas aldrig', async () => {
    bygg({ maskin_flytt: FEL('flytt nere'), maskin_position: FEL('position nere'), fakt_tid: FEL('tid nere') });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toContain('flytt nere');
    expect(r.delvisFel).toBeNull();
    expect(r.platser.size).toBe(0);
    expect(h.anrop.every((c: Ctx) => ['maskin_flytt', 'maskin_position', 'fakt_tid'].includes(c.tabell))).toBe(true);
  });

  it('flytten felar men resten svarar → delfel; platserna byggs på resten (M2 finns, M1 saknas)', async () => {
    bygg({ maskin_flytt: FEL('flytt nere') });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('flytt nere');
    expect(r.delvisFel).toContain('Kunde inte läsa alla källor');
    expect(namnAv(r.platser, 'M2')).toBe('Objekt två');
    expect(r.platser.has('M1')).toBe(false);
  });

  it('GPS-fixarna felar men resten svarar → delfel, och platserna är oförändrade', async () => {
    bygg({ maskin_position: FEL('position nere') });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('position nere');
    expect(namnAv(r.platser, 'M1')).toBe('Objekt ett');
    expect(namnAv(r.platser, 'M2')).toBe('Objekt två');
  });

  it('EN maskins produktionsdagar felar → delfel; just den maskinen saknar plats, den andra finns', async () => {
    bygg({ fakt_tid: (c) => (c.eq.maskin_id === 'M2' ? FEL('tid för M2 nere') : null) });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('tid för M2 nere');
    expect(namnAv(r.platser, 'M1')).toBe('Objekt ett');
    expect(r.platser.has('M2')).toBe(false);
  });

  it('flytt och GPS felar men en maskins produktionsdagar svarar → delfel, inte fel', async () => {
    bygg({ maskin_flytt: FEL('flytt nere'), maskin_position: FEL('position nere') });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('flytt nere');
    expect(namnAv(r.platser, 'M2')).toBe('Objekt två');
  });

  it('GPS-fixarna och ALLA produktionsdagar felar men flytten svarar → delfel, inte fel (flytten räcker för M1)', async () => {
    bygg({ maskin_position: FEL('position nere'), fakt_tid: FEL('tid nere') });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('position nere');
    expect(namnAv(r.platser, 'M1')).toBe('Objekt ett');
    expect(r.platser.has('M2')).toBe(false);
  });

  it('flytten och ALLA produktionsdagar felar men GPS-fixarna svarar → delfel, inte fel (GPS-svaret räknas som läst)', async () => {
    bygg({ maskin_flytt: FEL('flytt nere'), fakt_tid: FEL('tid nere') });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('flytt nere');
    expect(r.platser.size).toBe(0);
  });

  it('flytt, GPS och EN maskins produktionsdagar felar men den andras svarar → delfel, inte fel', async () => {
    bygg({ maskin_flytt: FEL('flytt nere'), maskin_position: FEL('position nere'), fakt_tid: (c) => (c.eq.maskin_id === 'M1' ? FEL('tid för M1 nere') : null) });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('flytt nere');
    expect(namnAv(r.platser, 'M2')).toBe('Objekt två');
  });

  it('andra steget: objekt-uppslaget felar → delfel; maskinen finns kvar men utan objektets namn', async () => {
    bygg({ objekt: (c) => (c.inKol === 'id' ? FEL('objekt nere') : null) });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('objekt nere');
    expect(namnAv(r.platser, 'M1')).toBe('Senast lämnad plats');
    expect(namnAv(r.platser, 'M2')).toBe('Objekt två');
  });

  it('andra steget: uppslaget av objekt via vo_nummer felar → delfel (M2 tappar sitt namn)', async () => {
    bygg({ objekt: (c) => (c.inKol === 'vo_nummer' ? FEL('vo nere') : null) });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('vo nere');
    expect(r.platser.has('M2')).toBe(false);
  });

  it('andra steget: uppslaget av objekt via dim_objekt_id felar → delfel', async () => {
    bygg({ objekt: (c) => (c.inKol === 'dim_objekt_id' ? FEL('dimid nere') : null) });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('dimid nere');
  });

  it('andra steget: dim_objekt felar → delfel', async () => {
    bygg({ dim_objekt: FEL('dim nere') });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('dim nere');
  });

  it('andra steget: flyttplatserna felar → delfel', async () => {
    bygg({
      maskin_flytt: { data: [{ maskin_id: 'M1', sluttid: IDAG, till_objekt_id: null, till_plats_id: 'PL-1', till_lat: 56.5, till_lng: 14.7 }], error: null },
      flyttplats: FEL('plats nere'),
    });
    const r = await hamtaSenastePlatser(['M1']);
    expect(r.fel).toBeNull();
    expect(r.delvisFel).toContain('plats nere');
  });

  it('flera fel: felet från första steget nämns (det är det första i kedjan)', async () => {
    bygg({ maskin_flytt: FEL('flytt nere'), objekt: (c) => (c.inKol === 'vo_nummer' ? FEL('vo nere') : null) });
    const r = await hamtaSenastePlatser(['M1', 'M2']);
    expect(r.delvisFel).toContain('flytt nere');
    expect(r.delvisFel).not.toContain('vo nere');
  });

  it('ett kastat nätverksfel kastas vidare (oförändrat kontrakt: anroparna fångar det)', async () => {
    h.kasta = true;
    await expect(hamtaSenastePlatser(['M1'])).rejects.toThrow('nätverk');
  });
});
