// Torrkörningen (testläget, admin: /maskin?som=<maskin_id>) mot den RIKTIGA koKopplad: lass och Färdigskotad lagras bara i minnet.
// Servern får aldrig ett skrivande anrop (rpc), och den riktiga kön delar inget lager med torrkön.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Lass } from './typer';

const sb = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: true, error: null })), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: sb.rpc, from: sb.from } }));

import { begarFardigskotad, hamtaLassKo, korLassKo, sparaLass } from './koKopplad';

const lass = (id: string): Lass => ({
  id, objektId: 'o1', voNummer: '555', maskinId: 'A030353', medarbetareId: null, lassNummer: 1, datum: '2026-10-19', status: 'bekraftat', bekraftadAv: 'forare', bekraftadTid: '2026-10-19T08:00:00.000Z',
  sparPunkter: [], vagar: [], skapad: '2026-10-19T08:00:00.000Z', andrad: '2026-10-19T08:00:00.000Z',
  delar: [{ delNr: 1, avlaggId: 'vida:2', avlaggNummer: '2', lossadTid: '2026-10-19T08:00:00.000Z', lat: 56.6, lng: 15.8, rader: [{ nyckel: 'tall', namn: 'Tall', m3: 10 }] }],
});

beforeEach(() => { sb.rpc.mockClear(); });

describe('torrkörning', () => {
  it('sparaLass/begarFardigskotad med torr skickar aldrig något till servern, inte ens när kön körs', async () => {
    await sparaLass(lass('t1'), true);
    await begarFardigskotad('o1', true);
    await korLassKo();                       // den riktiga kön: ingenting att skicka
    await (await hamtaLassKo(true)).kor();   // torrkön själv: "skickar" till ingenstans
    expect(sb.rpc).not.toHaveBeenCalled();
  });
  it('torrlass syns i torrkön men aldrig i den riktiga', async () => {
    await sparaLass(lass('t2'), true);
    expect((await (await hamtaLassKo(true)).lassForObjekt('o1')).map((l) => l.id)).toContain('t2');
    expect((await (await hamtaLassKo(false)).lassForObjekt('o1')).map((l) => l.id)).not.toContain('t2');
  });
  it('utan torr går lasset till den riktiga kön och skickas', async () => {
    await sparaLass(lass('r1'), false);
    await korLassKo();
    expect(sb.rpc).toHaveBeenCalledWith('skotar_lass_spara', expect.anything());
  });
});
