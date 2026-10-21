// @vitest-environment jsdom
// Instruktioner till föraren i React: samma hook som sidan kör, mot en låtsasdatabas med tabellen kommentar_sett_forare.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useInstruktioner, type InstruktionerIn, type InstruktionerUt } from './useInstruktioner';
import { nollstallSett } from '../instruktioner/sett';
import type { KommentarVy } from '../kartkommentar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type SettRad = { objekt_id: string; forare_id: string; kommentar_ref: string; yta_nyckel: string | null; innehall_hash: string; sett_at: string };

/** Servern: RLS efterliknas (bara egna rader), tiden sätts av servern, tabellen kan saknas (PGRST205). */
function server(saknas = false) {
  const rader: SettRad[] = [];
  const anrop = { select: 0, upsert: 0 };
  let klocka = Date.parse('2026-10-21T10:00:00Z');
  const db = {
    from: () => ({
      select: () => ({ eq: (_a: string, objekt: string) => ({ eq: async (_b: string, forare: string) => {
        anrop.select++;
        if (saknas) return { data: null, error: { code: 'PGRST205', message: 'tabellen finns inte' } };
        return { data: rader.filter((r) => r.objekt_id === objekt && r.forare_id === forare), error: null };
      } }) }),
      upsert: async (poster: any[]) => {
        anrop.upsert++;
        if (saknas) return { error: { code: 'PGRST205', message: 'tabellen finns inte' } };
        for (const p of poster) {
          klocka += 1000;
          const i = rader.findIndex((r) => r.objekt_id === p.objekt_id && r.forare_id === p.forare_id && r.kommentar_ref === p.kommentar_ref);
          const ny = { ...p, sett_at: new Date(klocka).toISOString() };
          if (i >= 0) rader[i] = ny; else rader.push(ny);
        }
        return { error: null };
      },
    }),
  };
  return { db, rader, anrop };
}

const kvadrat = (lon: number, lat: number, d = 0.0005) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const VIDA = { features: [{ type: 'Feature', geometry: kvadrat(15, 56), properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', LOPNR: '7', FLBESKR: 'Naturvårdsyta', ATGARD: 'Spara aspar' } }] };
const INNE = { lat: 56, lon: 15 };
const UTE = { lat: 56.01, lon: 15 };
const kk = (id: string, text: string): KommentarVy => ({ id, objekt_id: 'o1', yta_nyckel: 'hansyn:7', text, skapad_av: 'm1', namn: 'Martin', skapad_at: '2026-10-20T10:00:00Z', andrad_at: '2026-10-20T10:00:00Z', vantar: false });

let rot: Root | null = null;
let ruta: HTMLElement | null = null;
let ut: InstruktionerUt;
beforeEach(() => { nollstallSett(); });
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });

function Test({ inp }: { inp: InstruktionerIn }) { ut = useInstruktioner(inp); return null; }
const grund = (db: any, o: Partial<InstruktionerIn> = {}): InstruktionerIn => ({
  aktiv: true, pos: UTE, markers: [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'Symbol', vida: VIDA, kommentarer: [], objektId: 'o1',
  forare: { id: 'f1' }, db, blockerad: false, torr: false, ...o,
});
async function montera(inp: InstruktionerIn) {
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
  await act(async () => { rot!.render(<Test inp={inp} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const satt = async (inp: InstruktionerIn) => { await act(async () => { rot!.render(<Test inp={inp} />); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

describe('useInstruktioner', () => {
  it('ute ur området: inget kort; in i området: kortet med Vidas text', async () => {
    const s = server();
    await montera(grund(s.db));
    expect(ut.kort).toBeNull();
    await satt(grund(s.db, { pos: INNE }));
    expect(ut.kort?.namn).toBe('Naturvårdsyta');
    expect(ut.kort?.instruktioner.map((i) => i.kalla)).toEqual(['vida']);
  });

  it('kortet står kvar tills Sett — också när man kört ut — och Sett sparar per kommentar med hash', async () => {
    const s = server();
    await montera(grund(s.db, { pos: INNE }));
    await satt(grund(s.db, { pos: UTE }));
    expect(ut.kort).not.toBeNull();
    await act(async () => { ut.settKort(); });
    expect(ut.kort).toBeNull();
    expect(s.rader).toHaveLength(1);
    expect(s.rader[0]).toMatchObject({ objekt_id: 'o1', forare_id: 'f1', kommentar_ref: 'vida:hansyn:7', yta_nyckel: 'hansyn:7' });
    expect(s.rader[0].innehall_hash).toBeTruthy();
  });

  it('en sedd kommentar visas inte igen vid inkörning — inte ens efter omstart av appen (servern minns)', async () => {
    const s = server();
    await montera(grund(s.db, { pos: INNE }));
    await act(async () => { ut.settKort(); });
    act(() => { rot!.unmount(); }); ruta!.remove();
    nollstallSett();   // en annan enhet: bara servern minns
    await montera(grund(s.db, { pos: INNE }));
    expect(ut.kort).toBeNull();
  });

  it('en ny kommentar efter Sett räknas som osedd — kortet visar bara den nya', async () => {
    const s = server();
    await montera(grund(s.db, { pos: INNE }));
    await act(async () => { ut.settKort(); });
    expect(ut.kort).toBeNull();
    await satt(grund(s.db, { pos: INNE, kommentarer: [kk('k1', 'Ny: stolpe lutar')] }));
    await satt(grund(s.db, { pos: UTE, kommentarer: [kk('k1', 'Ny: stolpe lutar')] }));
    await satt(grund(s.db, { pos: INNE, kommentarer: [kk('k1', 'Ny: stolpe lutar')] }));
    expect(ut.kort?.instruktioner.map((i) => i.ref)).toEqual(['k1']);
  });

  it('en ändrad kommentar räknas som osedd', async () => {
    const s = server();
    await montera(grund(s.db, { pos: INNE, kommentarer: [kk('k1', 'Original')] }));
    await act(async () => { ut.settKort(); });
    expect(ut.kort).toBeNull();
    await satt(grund(s.db, { pos: UTE, kommentarer: [kk('k1', 'Original, ändrad')] }));
    await satt(grund(s.db, { pos: INNE, kommentarer: [kk('k1', 'Original, ändrad')] }));
    expect(ut.kort?.instruktioner.map((i) => i.text)).toEqual(['Original, ändrad']);
  });

  it('lästes den på annat håll (genomgången / kartkortet) försvinner kortet och kommer inte tillbaka', async () => {
    const s = server();
    await montera(grund(s.db, { pos: INNE }));
    expect(ut.kort).not.toBeNull();
    expect(ut.oseddaPer['hansyn:7']).toBe(1);
    await act(async () => { ut.settOmraden(['hansyn:7']); });
    expect(ut.kort).toBeNull();
    expect(ut.oseddaPer['hansyn:7']).toBeUndefined();
    expect(ut.paTrakten.nya).toBe(0);
    expect(ut.paTrakten.antal).toBe(1);
  });

  it('ett annat kort har platsen (larm eller lossning): inget instruktionskort, sedan kommer det — och `vantar` säger att den väntar', async () => {
    const s = server();
    await montera(grund(s.db, { pos: INNE, blockerad: true }));
    expect(ut.kort).toBeNull();
    expect(ut.vantar).toBe(true);
    await satt(grund(s.db, { pos: INNE, blockerad: false }));
    expect(ut.kort?.nyckel).toBe('hansyn:7');
    await act(async () => { ut.settKort(); });
    expect(ut.vantar).toBe(false);
  });

  it('"sett" gäller bara den föraren — en annan förare får kortet', async () => {
    const s = server();
    await montera(grund(s.db, { pos: INNE }));
    await act(async () => { ut.settKort(); });
    act(() => { rot!.unmount(); }); ruta!.remove();
    await montera(grund(s.db, { pos: INNE, forare: { id: 'f2' } }));
    expect(ut.kort).not.toBeNull();
  });

  it('inget kort medan serverns sett läses — ingen blixt av en text som redan setts', async () => {
    // Först: ta reda på hashen för Vidas text.
    const t = server();
    await montera(grund(t.db, { pos: INNE }));
    const hash = ut.kort!.instruktioner[0].hash;
    act(() => { rot!.unmount(); }); ruta!.remove(); nollstallSett();
    // Sedan en server som svarar sent med att texten redan är sedd.
    let slapp: (v: any) => void = () => {};
    const db: any = { from: () => ({
      select: () => ({ eq: () => ({ eq: () => new Promise((res) => { slapp = res; }) }) }),
      upsert: async () => ({ error: null }),
    }) };
    ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
    await act(async () => { rot!.render(<Test inp={grund(db, { pos: INNE })} />); });
    expect(ut.kort).toBeNull();   // läsningen pågår
    await act(async () => { slapp({ data: [{ kommentar_ref: 'vida:hansyn:7', innehall_hash: hash, sett_at: 'x' }], error: null }); });
    expect(ut.kort).toBeNull();   // sedd redan — kortet kommer aldrig fram
  });

  it('tabellen saknas i databasen: "sett" fungerar ändå på enheten, utan att kasta', async () => {
    const s = server(true);
    await montera(grund(s.db, { pos: INNE }));
    expect(ut.kort).not.toBeNull();
    await act(async () => { ut.settKort(); });
    expect(ut.kort).toBeNull();
    act(() => { rot!.unmount(); }); ruta!.remove();
    await montera(grund(s.db, { pos: INNE }));
    expect(ut.kort).toBeNull();   // enhetens kopia minns
  });

  it('passiv utanför maskinläget: inga anrop, inget kort, ingen lista', async () => {
    const s = server();
    await montera(grund(s.db, { aktiv: false, pos: INNE }));
    expect(ut.kort).toBeNull();
    expect(ut.paTrakten.antal).toBe(0);
    expect(s.anrop).toEqual({ select: 0, upsert: 0 });
  });

  it('testläget skriver inget — varken i databasen eller på enheten', async () => {
    const s = server();
    await montera(grund(s.db, { pos: INNE, torr: true }));
    await act(async () => { ut.settKort(); });
    expect(ut.kort).toBeNull();   // i minnet
    expect(s.anrop.upsert).toBe(0);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('instruktion_sett_v1:'))).toEqual([]);
  });

  it('utan inloggad förare visas inget kort (det går inte att kvittera under något id)', async () => {
    const s = server();
    await montera(grund(s.db, { pos: INNE, forare: null }));
    expect(ut.kort).toBeNull();
  });

  it('genomgången: listan har allt på trakten, sedda och osedda', async () => {
    const s = server();
    await montera(grund(s.db, { pos: UTE, kommentarer: [kk('k1', 'a'), kk('k2', 'b')] }));
    expect(ut.paTrakten.antal).toBe(3);
    expect(ut.paTrakten.nya).toBe(3);
    await act(async () => { ut.settOmraden(['hansyn:7']); });
    expect(ut.paTrakten.nya).toBe(0);
  });
});
