import { describe, expect, it } from 'vitest';
import { attSkicka, hamtaSett, settKarta, slaIhopSett, sparaSett } from './sett';

describe('slaIhopSett — den nyaste per kommentar vinner', () => {
  it('union av server och enhet', () => {
    const r = slaIhopSett({ a: { hash: '1', tid: '2026-10-20T10:00:00Z' } }, { b: { hash: '2', tid: '2026-10-20T11:00:00Z' } });
    expect(Object.keys(r).sort()).toEqual(['a', 'b']);
  });
  it('samma kommentar: nyare enhet vinner över äldre server (ändrad text sedd senare)', () => {
    const r = slaIhopSett({ a: { hash: 'gammal', tid: '2026-10-20T10:00:00Z' } }, { a: { hash: 'ny', tid: '2026-10-20T12:00:00Z' } });
    expect(r.a.hash).toBe('ny');
  });
  it('samma kommentar: nyare server vinner över äldre enhet', () => {
    const r = slaIhopSett({ a: { hash: 'ny', tid: '2026-10-20T12:00:00Z' } }, { a: { hash: 'gammal', tid: '2026-10-20T10:00:00Z' } });
    expect(r.a.hash).toBe('ny');
  });
  it('samma hash behåller serverns tid', () => {
    const r = slaIhopSett({ a: { hash: 'x', tid: 'S' } }, { a: { hash: 'x', tid: 'Z' } });
    expect(r.a.tid).toBe('S');
  });
});

describe('attSkicka — det servern saknar', () => {
  it('saknad rad och nyare version skickas, lika eller äldre inte', () => {
    const server = { a: { hash: '1', tid: '2026-10-20T10:00:00Z' }, c: { hash: '3', tid: '2026-10-20T10:00:00Z' } };
    const lokal = { a: { hash: '1', tid: '2026-10-20T10:00:00Z' }, b: { hash: '2', tid: '2026-10-20T11:00:00Z' }, c: { hash: '9', tid: '2026-10-20T12:00:00Z' } };
    expect(attSkicka(server, lokal).sort()).toEqual(['b', 'c']);
  });
});

describe('hamtaSett / sparaSett', () => {
  it('läser förarens rader och mappar kolumnerna', async () => {
    const db: any = { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [{ kommentar_ref: 'k1', innehall_hash: 'h', sett_at: 'T' }], error: null }) }) }) }) };
    const r = await hamtaSett(db, 'o', 'f');
    expect(r).toEqual({ lager: { k1: { hash: 'h', tid: 'T' } }, fel: null });
    expect([...settKarta(r.lager)]).toEqual([['k1', 'h']]);
  });
  it('ett fel (tabellen saknas) ger tomt lager och felet — aldrig ett kast', async () => {
    const db: any = { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: null, error: { message: 'PGRST205' } }) }) }) }) };
    expect(await hamtaSett(db, 'o', 'f')).toEqual({ lager: {}, fel: 'PGRST205' });
  });
  it('sparar med upsert på objekt + förare + kommentar och skickar ingen tid', async () => {
    let rader: any[] = []; let opt: any = null;
    const db: any = { from: () => ({ upsert: async (r: any[], o: any) => { rader = r; opt = o; return { error: null }; } }) };
    expect(await sparaSett(db, 'o', 'f', [{ ref: 'k1', nyckel: 'hansyn:7', hash: 'h' }])).toBeNull();
    expect(opt).toEqual({ onConflict: 'objekt_id,forare_id,kommentar_ref' });
    expect(rader).toEqual([{ objekt_id: 'o', forare_id: 'f', kommentar_ref: 'k1', yta_nyckel: 'hansyn:7', innehall_hash: 'h' }]);
    expect(Object.keys(rader[0])).not.toContain('sett_at');
  });
  it('inget att spara = inget anrop; ett kast blir en felsträng', async () => {
    const db: any = { from: () => { throw new Error('nät'); } };
    expect(await sparaSett(db, 'o', 'f', [])).toBeNull();
    expect(await sparaSett(db, 'o', 'f', [{ ref: 'a', nyckel: '', hash: 'h' }])).toBe('nät');
  });
});
