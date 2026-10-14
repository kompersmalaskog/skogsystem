import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byggOmimportPatch, hittaBefintligtObjekt } from './befintligt';

// Minnesdatabas med de två tabellerna uppslaget läser. Räknar frågor per tabell så testerna kan visa vad som INTE läses.
function fakeDb(opt: { objekt?: any[]; alias?: any[]; fel?: Record<string, any> } = {}) {
  const tabeller: Record<string, any[]> = { objekt: opt.objekt ?? [], objekt_alt_nummer: opt.alias ?? [] };
  const fragor: Record<string, number> = {};
  const klient = {
    from: (t: string) => ({
      select: () => {
        fragor[t] = (fragor[t] ?? 0) + 1;
        const filter: Array<(r: any) => boolean> = [];
        const b: any = {
          eq: (k: string, v: any) => { filter.push((r) => r[k] === v); return b; },
          is: (k: string, v: any) => { filter.push((r) => (r[k] ?? null) === v); return b; },
          limit: (n: number) => {
            if (opt.fel?.[t]) return Promise.resolve({ data: null, error: opt.fel[t] });
            return Promise.resolve({ data: tabeller[t].filter((r) => filter.every((f) => f(r))).slice(0, n).map((r) => ({ ...r })), error: null });
          },
        };
        return b;
      },
    }),
  } as any;
  return { klient, fragor };
}

const BAGSKYTT_EFTER_BYTE = { id: 'u-bagskytt', namn: 'Bågskyttebanan RP J-Hus- 25', vo_nummer: '11271849', larmkoordinat_kalla: 'envz' };
const ALIAS_BYTE = { nummer: '11166440', maskin_id: null, objekt_id: 'u-bagskytt', byte_till: '11271849' };

describe('hittaBefintligtObjekt — Bågskyttebanan', () => {
  it('leverans med det GAMLA numret 11166440 hittar objektet som nu har 11271849 (ingen ny rad)', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    const r = await hittaBefintligtObjekt(klient, '11166440');
    expect(r).toMatchObject({ typ: 'traff', objekt: { id: 'u-bagskytt', larmkoordinat_kalla: 'envz', vo_nummer: '11271849', via: 'extra_nummer' } });
  });

  it('leverans med objektets nuvarande nummer: träff på vo_nummer som förut — extra nummer läses aldrig', async () => {
    const { klient, fragor } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    const r = await hittaBefintligtObjekt(klient, '11271849');
    expect(r).toMatchObject({ typ: 'traff', objekt: { id: 'u-bagskytt', via: 'vo_nummer' } });
    expect(fragor.objekt_alt_nummer).toBeUndefined();
  });

  it('vanligt extra nummer (gamla numret hade data → filens nummer sparades som extra nummer) hittar också objektet', async () => {
    const { klient } = fakeDb({
      objekt: [{ id: 'u-molleryd', namn: 'Mölleryd', vo_nummer: '11166477', larmkoordinat_kalla: null }],
      alias: [{ nummer: '11271883', maskin_id: null, objekt_id: 'u-molleryd' }],
    });
    expect(await hittaBefintligtObjekt(klient, '11271883')).toMatchObject({ typ: 'traff', objekt: { id: 'u-molleryd', vo_nummer: '11166477', via: 'extra_nummer' } });
  });
});

describe('hittaBefintligtObjekt — övriga lägen', () => {
  it('okänt nummer → ingen träff (importen skapar en ny rad som förut)', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    expect(await hittaBefintligtObjekt(klient, '11999999')).toEqual({ typ: 'ingen' });
  });
  it('inget VO-nummer → ingen träff utan att fråga', async () => {
    const { klient, fragor } = fakeDb();
    expect(await hittaBefintligtObjekt(klient, '')).toEqual({ typ: 'ingen' });
    expect(await hittaBefintligtObjekt(klient, null)).toEqual({ typ: 'ingen' });
    expect(fragor).toEqual({});
  });
  it('icke-numeriskt VO (P-1012) kan inte vara ett extra nummer: bara vo_nummer-uppslaget görs', async () => {
    const { klient, fragor } = fakeDb({ objekt: [{ id: 'u-p', vo_nummer: 'P-1012', larmkoordinat_kalla: null }] });
    expect(await hittaBefintligtObjekt(klient, 'P-1012')).toMatchObject({ typ: 'traff', objekt: { id: 'u-p', via: 'vo_nummer' } });
    expect(await hittaBefintligtObjekt(klient, 'P-9999')).toEqual({ typ: 'ingen' });
    expect(fragor.objekt_alt_nummer).toBeUndefined();
  });
  it('maskinens egna k-nummer (maskin_id satt) är aldrig ett VO-nummer', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [{ nummer: '12345', maskin_id: 'PONS', objekt_id: 'u-bagskytt' }] });
    expect(await hittaBefintligtObjekt(klient, '12345')).toEqual({ typ: 'ingen' });
  });
  it('mellanslag runt numret spelar ingen roll', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    expect(await hittaBefintligtObjekt(klient, ' 11166440 ')).toMatchObject({ typ: 'traff', objekt: { via: 'extra_nummer' } });
  });
});

describe('hittaBefintligtObjekt — läsfel är aldrig "ingen träff"', () => {
  it('fel på objekt → fel (annars hade importen skapat en ny rad)', async () => {
    const { klient } = fakeDb({ fel: { objekt: { message: 'nät' } } });
    expect(await hittaBefintligtObjekt(klient, '11166440')).toMatchObject({ typ: 'fel' });
  });
  it('fel på extra nummer → fel', async () => {
    const { klient } = fakeDb({ objekt: [], fel: { objekt_alt_nummer: { code: '42501', message: 'permission denied' } } });
    const r = await hittaBefintligtObjekt(klient, '11166440');
    expect(r.typ).toBe('fel');
  });
  it('tabellen saknas (migrationen ej körd) → inga extra nummer → som förut', async () => {
    const { klient } = fakeDb({ objekt: [], fel: { objekt_alt_nummer: { code: '42P01', message: 'relation "public.objekt_alt_nummer" does not exist' } } });
    expect(await hittaBefintligtObjekt(klient, '11166440')).toEqual({ typ: 'ingen' });
  });
});

describe('byggOmimportPatch — oförändrat utom objektets nummer', () => {
  const data = {
    vo_nummer: '11166440', namn: 'Bågskyttebanan RP J-Hus- 25', bolag: 'Vida', typ: 'slutavverkning', volym: 900,
    lat: 56.1, lng: 14.2, anteckningar: 'egen text', status: undefined, areal: null, traktnr: '  ',
    larmkoordinat_lat: 56.2, larmkoordinat_lng: 14.3, larmkoordinat_kalla: 'envz', ar: 2026,
  };
  const SKYDDADE = ['lat', 'lng', 'anteckningar', 'ar', 'manad', 'ordning', 'status'];

  it('omimport på vo_nummer: som förut (skyddade, nollor och tomma strängar skrivs aldrig; vo_nummer skrivs)', () => {
    expect(byggOmimportPatch(data, { skyddade: SKYDDADE, bevaraLarm: false, behallVoNummer: false })).toEqual({
      vo_nummer: '11166440', namn: 'Bågskyttebanan RP J-Hus- 25', bolag: 'Vida', typ: 'slutavverkning', volym: 900,
      larmkoordinat_lat: 56.2, larmkoordinat_lng: 14.3, larmkoordinat_kalla: 'envz',
    });
  });
  it("larmkoordinat 'egen' bevaras som förut", () => {
    const p = byggOmimportPatch(data, { skyddade: SKYDDADE, bevaraLarm: true, behallVoNummer: false });
    expect(Object.keys(p).some((k) => k.startsWith('larmkoordinat_'))).toBe(false);
    expect(p.vo_nummer).toBe('11166440');
  });
  it('träff via extra nummer: leveransens (gamla) vo_nummer skrivs INTE över objektets nuvarande — resten uppdateras', () => {
    const p = byggOmimportPatch(data, { skyddade: SKYDDADE, bevaraLarm: false, behallVoNummer: true });
    expect('vo_nummer' in p).toBe(false);
    expect(p).toMatchObject({ namn: 'Bågskyttebanan RP J-Hus- 25', bolag: 'Vida', volym: 900 });
  });
});

describe('Bågskyttebanan genom hela omimporten (uppslag + patch)', () => {
  it('leverans med 11166440 → det befintliga objektet uppdateras, numret 11271849 står kvar, ingen ny rad', async () => {
    const { klient } = fakeDb({ objekt: [BAGSKYTT_EFTER_BYTE], alias: [ALIAS_BYTE] });
    const sok = await hittaBefintligtObjekt(klient, '11166440');
    expect(sok.typ).toBe('traff');                                    // → routen tar UPDATE-grenen, inte INSERT
    if (sok.typ !== 'traff') return;
    const patch = byggOmimportPatch({ vo_nummer: '11166440', namn: 'Bågskyttebanan RP J-Hus- 25', volym: 950 }, { skyddade: ['status'], bevaraLarm: false, behallVoNummer: sok.objekt.via === 'extra_nummer' });
    expect(patch).toEqual({ namn: 'Bågskyttebanan RP J-Hus- 25', volym: 950 });
  });
});

describe('källvakt: routen använder uppslaget och patch-byggaren', () => {
  const route = readFileSync(resolve(__dirname, '../../app/api/import-trakt/route.ts'), 'utf8');
  it('uppslag via hittaBefintligtObjekt — inget kvar av det gamla enbart-vo_nummer-uppslaget', () => {
    expect(route).toContain("import { byggOmimportPatch, hittaBefintligtObjekt, type BefintligtObjekt } from '@/lib/trakt/befintligt';");
    expect(route).toContain('await hittaBefintligtObjekt(supabase, String(falt.vo_nummer))');
    expect(route).not.toContain(".eq('vo_nummer', String(falt.vo_nummer))");
  });
  it('läsfel stoppar importen (500, loggas) i stället för att falla igenom till INSERT', () => {
    expect(route).toContain("if (sok.typ === 'fel') {");
    expect(route).toContain("'OBJEKT_SOK'");
  });
  it('träff via extra nummer behåller objektets nummer och säger det i import_varningar', () => {
    expect(route).toContain("behallVoNummer: befintlig.via === 'extra_nummer'");
    expect(route).toContain('är ett extra nummer på ett befintligt objekt');
  });
});
