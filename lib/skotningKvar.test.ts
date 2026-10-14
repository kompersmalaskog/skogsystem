import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hamtaSkotningKvar, raknaSkotningKvar, SKOTNING_KVAR_MIN_M3 } from './skotningKvar';

const dim = (objekt_id: string, vo_nummer: string | null, extra: Record<string, unknown> = {}) => ({ objekt_id, vo_nummer, skotning_avslutad: null, egen_skotning: false, ...extra });
const tom = { dim: [], prod: [], lass: [], manuell: [] };

describe('raknaSkotningKvar — samma villkor som den gamla väljaren', () => {
  it('Vällust-formen: 900 m³ skördat, 600 skotat → skotning kvar', () => {
    const k = raknaSkotningKvar({ ...tom, dim: [dim('v', 'VO-V')], prod: [{ objekt_id: 'v', volym_m3sub: 900 }], lass: [{ objekt_id: 'v', volym_m3sub: 600 }] });
    expect(Array.from(k)).toEqual(['VO-V']);
  });
  it('gränsen: mer än 5 m³ kvar räknas, precis 5 räknas inte', () => {
    const med = (skotat: number) => raknaSkotningKvar({ ...tom, dim: [dim('v', 'VO-V')], prod: [{ objekt_id: 'v', volym_m3sub: 100 }], lass: [{ objekt_id: 'v', volym_m3sub: skotat }] });
    expect(SKOTNING_KVAR_MIN_M3).toBe(5);
    expect(med(95).size).toBe(0);
    expect(med(94.9).size).toBe(1);
  });
  it('skotning_avslutad eller egen_skotning → aldrig kvar', () => {
    const rader = { prod: [{ objekt_id: 'v', volym_m3sub: 900 }], lass: [] };
    expect(raknaSkotningKvar({ ...tom, ...rader, dim: [dim('v', 'VO-V', { skotning_avslutad: '2026-09-20' })] }).size).toBe(0);
    expect(raknaSkotningKvar({ ...tom, ...rader, dim: [dim('v', 'VO-V', { egen_skotning: true })] }).size).toBe(0);
  });
  it('manuell EGEN skotning räknas som skotat, omlastning aldrig, grot-rader (maskin_id null) hoppas över', () => {
    const bas = { ...tom, dim: [dim('v', 'VO-V')], prod: [{ objekt_id: 'v', volym_m3sub: 100 }] };
    expect(raknaSkotningKvar({ ...bas, manuell: [{ objekt_id: 'v', maskin_id: 'M1', volym_egen_skotning: 100 }] }).size).toBe(0);
    expect(raknaSkotningKvar({ ...bas, manuell: [{ objekt_id: 'v', maskin_id: 'M1', volym_m3: 100, ar_omlastning: true }] }).size).toBe(1);
    expect(raknaSkotningKvar({ ...bas, manuell: [{ objekt_id: 'v', maskin_id: null, volym_m3: 100 }] }).size).toBe(1);
  });
  it('flera rader per objekt summeras; rader utan objekt_id ignoreras', () => {
    const k = raknaSkotningKvar({ ...tom, dim: [dim('v', 'VO-V')], prod: [{ objekt_id: 'v', volym_m3sub: 60 }, { objekt_id: 'v', volym_m3sub: 60 }, { objekt_id: null, volym_m3sub: 999 }], lass: [{ objekt_id: 'v', volym_m3sub: 50 }] });
    expect(Array.from(k)).toEqual(['VO-V']);
  });
});

describe('hamtaSkotningKvar — fel är okänt, aldrig "inga"', () => {
  const klient = (fel: string | null) => ({
    from: (t: string) => ({
      select: () => {
        const data: Record<string, any[]> = {
          dim_objekt: [dim('v', 'VO-V')], vy_uppf_prod_per_objekt: [{ objekt_id: 'v', volym_m3sub: 900 }], vy_uppf_lass_per_objekt: [{ objekt_id: 'v', volym_m3sub: 600 }], skotare_objekt_manuell: [],
        };
        const svar = t === fel ? { data: null, error: { message: 'nät' } } : { data: data[t], error: null };
        const p: any = Promise.resolve(svar);
        p.is = () => Promise.resolve(svar);
        return p;
      },
    }),
  });
  it('alla fyra frågor lyckas → mängden', async () => {
    expect(Array.from((await hamtaSkotningKvar(klient(null)))!)).toEqual(['VO-V']);
  });
  it('någon fråga ger fel → null', async () => {
    for (const t of ['dim_objekt', 'vy_uppf_prod_per_objekt', 'vy_uppf_lass_per_objekt', 'skotare_objekt_manuell']) expect(await hamtaSkotningKvar(klient(t))).toBeNull();
  });
  it('en fråga som kastar → null', async () => {
    expect(await hamtaSkotningKvar({ from: () => { throw new Error('boom'); } } as any)).toBeNull();
  });
});

describe('vakt: samma villkor som ObjektValjare (som lever kvar orörd för maskinläget)', () => {
  const valjare = readFileSync(resolve(__dirname, '../app/planering/ObjektValjare.tsx'), 'utf8');
  it('gränsen "> 5" och de fyra källorna är desamma', () => {
    expect(valjare).toContain('if (sk - (skotat.get(vo) || 0) > 5) kvar.add(vo);');
    for (const k of ["from('dim_objekt')", "from('vy_uppf_prod_per_objekt')", "from('vy_uppf_lass_per_objekt')", "from('skotare_objekt_manuell')"]) expect(valjare).toContain(k);
    expect(valjare).toContain('if (skotKlar.has(vo) || egen.has(vo)) continue;');
    expect(valjare).toContain("const arKlartAvslutat = (o: any) => o.status === 'avslutat' && !harSkotningKvar(o);");
  });
});
