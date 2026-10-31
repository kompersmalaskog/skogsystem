import { describe, it, expect } from 'vitest';
import { arDags, enManadSenare, fragorFor, fotoSokvag, kontrollfotoFor, lage, type Fraga } from './regler';

const f = (kod: string, ordning: number, maskin_typ: string | null = null): Fraga =>
  ({ id: kod, kod, text: kod, hjalptext: null, maskin_typ, foto_url: null, ordning });

describe('maskinkoll — regler', () => {
  it('frågorna: alla maskiner + maskinens typ, sorterade på ordning', () => {
    const alla = [f('S1', 110, 'Harvester'), f('G2', 20), f('K1', 210, 'Forwarder'), f('G1', 10)];
    expect(fragorFor(alla, 'Forwarder').map((x) => x.kod)).toEqual(['G1', 'G2', 'K1']);
    expect(fragorFor(alla, 'Harvester').map((x) => x.kod)).toEqual(['G1', 'G2', 'S1']);
    expect(fragorFor(alla, null).map((x) => x.kod)).toEqual(['G1', 'G2']);
  });

  it('en kalendermånad senare klipper månadsslutet', () => {
    expect(enManadSenare(new Date(2026, 0, 31)).getDate()).toBe(28);
    expect(enManadSenare(new Date(2026, 0, 31)).getMonth()).toBe(1);
    expect(enManadSenare(new Date(2026, 9, 31)).getMonth()).toBe(10);
    expect(enManadSenare(new Date(2026, 9, 31)).getDate()).toBe(30);
  });

  it('dags: ingen koll → ja; samma dag nästa månad → ja; dagen före → nej', () => {
    expect(arDags(null)).toBe(true);
    const klar = new Date(2026, 9, 12, 14, 0);
    expect(arDags(klar, new Date(2026, 10, 11, 23, 0))).toBe(false);
    expect(arDags(klar, new Date(2026, 10, 12, 6, 0))).toBe(true);
  });

  it('kontrollfotot är samma hela månaden och byts nästa', () => {
    expect(kontrollfotoFor(new Date(2026, 9, 1))).toBe(kontrollfotoFor(new Date(2026, 9, 31)));
    expect(kontrollfotoFor(new Date(2026, 9, 1))).not.toBe(kontrollfotoFor(new Date(2026, 10, 1)));
  });

  it('fotots sökväg börjar med medarbetarens id (RLS) och är unik per foto', () => {
    const a = fotoSokvag('med-1', 'koll-1', 'fraga-1', 1);
    expect(a.split('/')[0]).toBe('med-1');
    expect(a).not.toBe(fotoSokvag('med-1', 'koll-1', 'fraga-1', 2));
  });

  it('läget: besvarade, kvar och första obesvarade', () => {
    const fr = [f('G1', 10), f('G2', 20), f('G3', 30)];
    expect(lage(fr, [{ fraga_id: 'G1', ok: true, foto_url: null, kommentar: null }])).toEqual({ besvarade: 1, kvar: 2, forstaObesvarade: 1 });
    expect(lage(fr, [])).toEqual({ besvarade: 0, kvar: 3, forstaObesvarade: 0 });
  });
});
