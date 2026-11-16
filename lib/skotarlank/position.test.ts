// Skotarlänken, telefonen som GPS: servern sparar bara den senaste positionen per trakt, objektet ur token, och aldrig långt från trakten.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { lasPositionBody, skotarPositionHamta, skotarPositionSpara, POSITION_MARGINAL_M } from './position';
import { arFarsk, POSITION_FARSK_MS } from './positionRegler';
import { arOffentligSkotarSokvag } from './offentlig';
import * as server from './server';

const TOKEN = 'e'.repeat(64);
const OBJ = 'o-1';

function fake(rader: Record<string, any>[] = [], fel = false) {
  const upserts: any[] = [];
  const sb: any = {
    from(tabell: string) {
      if (tabell === 'objekt_skotar_lank') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { objekt_id: OBJ, aktiv: true }, error: null }) }) }) };
      if (tabell === 'objekt') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: OBJ, namn: 'T', status: 'pagaende', lat: 56.6, lng: 15.0 }, error: null }) }) }) };
      if (tabell === 'skotar_lank_position') return {
        upsert: async (r: any, o: any) => { upserts.push({ r, o }); return { error: fel ? { message: 'x' } : null }; },
        select: () => ({ eq: (_k: string, v: string) => ({ maybeSingle: async () => ({ data: rader.find((x) => x.objekt_id === v) ?? null, error: null }) }) }),
      };
      throw new Error(`oväntad tabell ${tabell}`);
    },
  };
  return { sb, upserts };
}

beforeEach(() => {
  vi.spyOn(server, 'cachadSkotarVy').mockResolvedValue({ gran: [[[15.0, 56.6], [15.01, 56.6], [15.01, 56.61]]], hogar: null, mitt: { lat: 56.6, lng: 15.0 } } as any);
});

describe('telefonen som GPS', () => {
  it('positionen läses bara när den är rimlig', () => {
    expect(lasPositionBody({ lat: 56.6, lng: 15, noggrannhet: 8, kurs: 370 })).toEqual({ lat: 56.6, lng: 15, noggrannhet: 8, kurs: 10 });
    expect(lasPositionBody({ lat: 'a', lng: 15 })).toBeNull();
    expect(lasPositionBody({ lat: 91, lng: 15 })).toBeNull();
    expect(lasPositionBody({ lat: 56.6, lng: 15, noggrannhet: -1 })).toEqual({ lat: 56.6, lng: 15, noggrannhet: null, kurs: null });
  });

  it('nära trakten sparas på objektet ur token, utan tid från klienten', async () => {
    const { sb, upserts } = fake();
    const s = await skotarPositionSpara(sb, TOKEN, { lat: 56.605, lng: 15.005, noggrannhet: 9, objekt_id: 'annat', uppdaterad_at: '2000-01-01' });
    expect(s.status).toBe(200);
    expect(s.body).toEqual({ ok: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].r).toEqual({ objekt_id: OBJ, lat: 56.605, lng: 15.005, noggrannhet_m: 9, kurs: null });
    expect(upserts[0].o).toEqual({ onConflict: 'objekt_id' });
  });

  it('långt från trakten sparas inte', async () => {
    const { sb, upserts } = fake();
    const langt = 56.6 + (POSITION_MARGINAL_M + 2000) / 111_320;
    const s = await skotarPositionSpara(sb, TOKEN, { lat: langt, lng: 15.0 });
    expect(s.body).toEqual({ ok: true, langt: true });
    expect(upserts).toHaveLength(0);
  });

  it('ogiltig token sparar ingenting', async () => {
    const { sb, upserts } = fake();
    expect((await skotarPositionSpara(sb, 'kort', { lat: 56.6, lng: 15 })).status).toBe(404);
    expect((await skotarPositionSpara(sb, TOKEN, null)).status).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it('ett skrivfel är ett fel, aldrig ok', async () => {
    const { sb } = fake([], true);
    expect((await skotarPositionSpara(sb, TOKEN, { lat: 56.6, lng: 15 })).status).toBe(503);
  });

  it('hämtar den senaste, men inte en som är över tolv timmar gammal', async () => {
    const nu = Date.parse('2026-11-11T12:00:00Z');
    const { sb } = fake([{ objekt_id: OBJ, lat: 56.6, lng: 15, noggrannhet_m: 7, kurs: null, uppdaterad_at: '2026-11-11T11:59:00Z' }]);
    expect((await skotarPositionHamta(sb, TOKEN, nu)).body).toEqual({ ok: true, position: { lat: 56.6, lng: 15, noggrannhet: 7, kurs: null, tid: '2026-11-11T11:59:00Z' } });
    const gammal = fake([{ objekt_id: OBJ, lat: 56.6, lng: 15, noggrannhet_m: 7, kurs: null, uppdaterad_at: '2026-11-10T20:00:00Z' }]);
    expect((await skotarPositionHamta(gammal.sb, TOKEN, nu)).body).toEqual({ ok: true, position: null });
  });

  it('färsk i två minuter', () => {
    const nu = Date.parse('2026-11-11T12:00:00Z');
    expect(arFarsk(new Date(nu - POSITION_FARSK_MS).toISOString(), nu)).toBe(true);
    expect(arFarsk(new Date(nu - POSITION_FARSK_MS - 1000).toISOString(), nu)).toBe(false);
  });

  it('adressen är öppen med token, och bara den', () => {
    expect(arOffentligSkotarSokvag(`/api/skotare/${TOKEN}/position`)).toBe(true);
    expect(arOffentligSkotarSokvag(`/api/skotare/${TOKEN}/positioner`)).toBe(false);
  });
});
