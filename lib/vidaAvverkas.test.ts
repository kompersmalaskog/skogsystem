import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { kanMarkeraAvverkas, lasAvverkas, sattAvverkas, utanAvverkade } from './vidaAvverkas';
import { vidaObjekt } from './larm/objekt';
import { fallningKandidater } from './larm/fallning';

const O = { lat: 56.5, lon: 14.7 };
const M_LAT = 1 / 111320;
const M_LON = 1 / (111320 * Math.cos(56.5 * Math.PI / 180));
const c = (ost: number, nord: number): [number, number] => [O.lon + ost * M_LON, O.lat + nord * M_LAT];
const ruta = (cx: number, r: number): [number, number][] => [c(cx - r, -r), c(cx + r, -r), c(cx + r, r), c(cx - r, r), c(cx - r, -r)];
const hansyn = (lopnr: number, cx: number) => ({ type: 'Feature', properties: { _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR', LOPNR: lopnr, TYP: '24' }, geometry: { type: 'Polygon', coordinates: [ruta(cx, 20)] } });
const nb = { type: 'Feature', properties: { _lager: 'SV_SKS_NYCKELBIOTOP_101', Beteckn: 'N1' }, geometry: { type: 'Polygon', coordinates: [ruta(0, 20)] } };
const fc = { type: 'FeatureCollection', features: [hansyn(6, 0), hansyn(7, 0), nb] };

describe('"Avverkas – larma inte" på Vidas hänsynsyta', () => {
  it('bara hänsynsytor kan markeras', () => {
    expect(kanMarkeraAvverkas('hansyn:6')).toBe(true);
    for (const n of ['nb:N1', 'raa:1', 'traktdel:1', 'hansyn:', '', null, undefined]) expect(kanMarkeraAvverkas(n as any)).toBe(false);
  });

  it('utan markering larmar ytan (förbjuden yta, inne)', () => {
    const o = vidaObjekt(utanAvverkade(fc, new Set()), O);
    expect(o.filter((x) => x.typ === 'hansynsyta' && x.inne && x.forbjuden)).toHaveLength(2);
  });

  it('markerad yta larmar inte — de andra gör det, och deras id är oförändrade', () => {
    const fore = vidaObjekt(fc, O).map((x) => x.id);
    const efter = vidaObjekt(utanAvverkade(fc, new Set(['hansyn:6'])), O);
    expect(efter.map((x) => x.id)).toEqual(fore.filter((id) => id !== 'vida:L_TILLAGGSYTOR:0'));
    expect(efter.some((x) => x.id === 'vida:L_TILLAGGSYTOR:0')).toBe(false);
    expect(efter.some((x) => x.id === 'vida:L_TILLAGGSYTOR:1')).toBe(true);
    expect(efter.some((x) => x.typ === 'nyckelbiotop')).toBe(true);
  });

  it('nyckelbiotopen går aldrig att tysta, även om nyckeln står i mängden', () => {
    const efter = vidaObjekt(utanAvverkade(fc, new Set(['nb:N1', 'hansyn:6', 'hansyn:7'])), O);
    expect(efter.map((x) => x.typ)).toEqual(['nyckelbiotop']);
  });

  it('markerad yta räknas inte i fällningscirkeln', () => {
    const ids = (v: any) => fallningKandidater({ pos: O, markers: [], svgToLatLon: () => ({ lat: 0, lon: 0 }), vida: v } as any).map((k) => k.id);
    expect(ids(fc)).toContain('vida:L_TILLAGGSYTOR:0');
    expect(ids(utanAvverkade(fc, new Set(['hansyn:6'])))).not.toContain('vida:L_TILLAGGSYTOR:0');
  });

  it('samma samling tillbaka när inget ändras; indatan rörs aldrig', () => {
    expect(utanAvverkade(fc, new Set())).toBe(fc);
    expect(utanAvverkade(fc, new Set(['hansyn:99']))).toBe(fc);
    expect(utanAvverkade(null, new Set(['hansyn:6']))).toBeNull();
    utanAvverkade(fc, new Set(['hansyn:6']));
    expect(fc.features[0].geometry).not.toBeNull();
  });
});

function fakeDb(rader: { objekt_id: string; nyckel: string }[], opt: { lasFel?: boolean; skrivFel?: boolean } = {}) {
  return {
    from: () => {
      const q: any = { f: {} as Record<string, string> };
      q.select = () => q;
      q.eq = (k: string, v: string) => { q.f[k] = v; return q; };
      q.then = (res: any) => res(opt.lasFel ? { data: null, error: { message: 'nej' } } : { data: rader.filter((r) => Object.entries(q.f).every(([k, v]) => (r as any)[k] === v)), error: null });
      q.upsert = async (r: any) => { if (opt.skrivFel) return { error: { message: 'RLS' } }; if (!rader.some((x) => x.objekt_id === r.objekt_id && x.nyckel === r.nyckel)) rader.push(r); return { error: null }; };
      q.delete = () => { const d: any = { f: {} as Record<string, string> }; d.eq = (k: string, v: string) => { d.f[k] = v; return d; };
        d.then = (res: any) => { if (opt.skrivFel) return res({ error: { message: 'RLS' } }); for (let i = rader.length - 1; i >= 0; i--) if (Object.entries(d.f).every(([k, v]) => (rader[i] as any)[k] === v)) rader.splice(i, 1); return res({ error: null }); };
        return d; };
      return q;
    },
  };
}

describe('kortets larmregel', () => {
  it('markerad yta säger "Larmar inte – avverkas", annars som förut', async () => {
    const { larmRegelText } = await import('./larm/grupper');
    expect(larmRegelText({ grupp: 'natur', forbjuden: true, avverkas: true })).toBe('Larmar inte – avverkas');
    expect(larmRegelText({ grupp: 'natur', forbjuden: true })).toBe('Larmar alltid');
  });
});

describe('lagring', () => {
  it('läsfel = null (då larmar allt), aldrig en tom mängd', async () => {
    expect(await lasAvverkas(fakeDb([], { lasFel: true }), 'o1')).toBeNull();
    expect([...(await lasAvverkas(fakeDb([{ objekt_id: 'o1', nyckel: 'hansyn:6' }, { objekt_id: 'o2', nyckel: 'hansyn:7' }]), 'o1'))!]).toEqual(['hansyn:6']);
  });
  it('markera och ta bort läses tillbaka; ett avvisat skriv är ett fel', async () => {
    const rader: any[] = [];
    expect(await sattAvverkas(fakeDb(rader), 'o1', 'hansyn:6', true)).toBe(true);
    expect(rader).toEqual([{ objekt_id: 'o1', nyckel: 'hansyn:6' }]);
    expect(await sattAvverkas(fakeDb(rader), 'o1', 'hansyn:6', false)).toBe(true);
    expect(rader).toEqual([]);
    expect(await sattAvverkas(fakeDb([], { skrivFel: true }), 'o1', 'hansyn:6', true)).toBe(false);
    expect(await sattAvverkas(fakeDb([]), 'o1', 'nb:N1', true)).toBe(false);
  });
});

describe('kopplingen i planeringsvyn', () => {
  const sida = readFileSync('app/planering/page.tsx', 'utf8');
  const mig = readFileSync('supabase/migrations/20261029060000_objekt_yta_avverkas.sql', 'utf8');
  it('larmet och fällningscirkeln läser den filtrerade samlingen, aldrig traktGeo direkt', () => {
    const larm = sida.slice(sida.indexOf('const larm = useKorvyLarm({'), sida.indexOf('const fall = useFallning({'));
    const fall = sida.slice(sida.indexOf('const fall = useFallning({'), sida.indexOf('const fall = useFallning({') + 400);
    expect(larm).toContain('vida: vidaLarm');
    expect(fall).toContain('vida: vidaLarm');
    expect(larm).not.toContain('vida: traktGeo');
    expect(fall).not.toContain('vida: traktGeo');
  });
  it('brytaren finns bara för admin i planeringsläget', () => {
    expect(sida).toMatch(/kanAvverkas && objektListaVal && isAdminRiktig && vidaAvverkas\.tillganglig/);
  });
  it('migrationen: bara hänsyn, admin skriver, servern sätter vem och när', () => {
    expect(mig).toContain("check (nyckel ~ '^hansyn:.+')");
    for (const op of ['insert', 'update', 'delete']) expect(mig).toMatch(new RegExp(`objekt_yta_avverkas_${op}[^;]*ar_admin`));
    expect(mig).toContain('new.andrad_av := public.korvy_min_medarbetare()');
  });
});
