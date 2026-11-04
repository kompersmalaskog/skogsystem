import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AVVIKELSE_TYPER, forvalTyp, korsparMening, avvikelseSokvag, sha256Hex, forvalVidPos } from './avvikelse';
import { skapaAvvikelseKo, byggAvvikelse, type AvvikelseRadIn, type AvvikelseRad } from './avvikelseKo';
import { skapaMinnesLager } from './fotoKo';
import { slaIhopAvvikelser } from './hooks/useAvvikelser';
import { kortetsTid } from '../components/planering/AvvikelseFlode';

describe('förval ur kartan', () => {
  it('närmaste objekt inom 10 m avgör, annars Körskada', () => {
    expect(forvalTyp([])).toBe('korskada');
    expect(forvalTyp([{ kalla: 'linje', typ: 'stonewall', grupp: 'kultur', avstandM: 4 }])).toBe('stenmur');
    expect(forvalTyp([{ kalla: 'linje', typ: 'stonewall', grupp: 'kultur', avstandM: 11 }])).toBe('korskada');
    expect(forvalTyp([
      { kalla: 'linje', typ: 'stonewall', grupp: 'kultur', avstandM: 8 },
      { kalla: 'yta', typ: 'hansynsyta', grupp: 'natur', avstandM: null, inne: true },
    ])).toBe('hansyn');
    expect(forvalTyp([{ kalla: 'yta', typ: 'raa_yta', grupp: 'kultur', avstandM: null, inne: true }])).toBe('fornlamning');
    expect(forvalTyp([{ kalla: 'yta', typ: 'protected', grupp: 'natur', avstandM: null, inne: false }])).toBe('korskada');
    // El-ledning (fara) föreslår ingenting
    expect(forvalTyp([{ kalla: 'linje', typ: 'powerline', grupp: 'fara', avstandM: 1 }])).toBe('korskada');
  });
  it('förvalet byggs med larmens byggare: en ritad stenmur 3 m bort', () => {
    const svg = (x: number, y: number) => ({ lat: 57 + y / 111_000, lon: 15 + x / 60_500 });
    const markers = [{ id: 1, isLine: true, lineType: 'stonewall', path: [{ x: -50, y: 3 }, { x: 50, y: 3 }] }];
    expect(forvalVidPos({ pos: { lat: 57, lng: 15 }, markers, svgToLatLon: svg })).toBe('stenmur');
    expect(forvalVidPos({ pos: null, markers, svgToLatLon: svg })).toBe('korskada');
  });
});

describe('kvittots mening är ett faktum, aldrig "fanns innan"', () => {
  const fore = '2026-11-04T09:12:00Z';
  it('träff: maskinens namn och senaste tid, senaste först', () => {
    const m = korsparMening({ kontrollerat_fore: fore, spar_pa_trakten_fore: 300, traffar: [
      { roll: 'skotare', maskin_id: 'A1', forsta: '2026-11-01T08:00:00Z', senaste: '2026-11-01T09:00:00Z' },
      { roll: 'skordare', maskin_id: 'P1', forsta: '2026-11-02T12:00:00Z', senaste: '2026-11-02T13:30:00Z' },
    ] }, (id) => (id === 'P1' ? 'Scorpion' : null));
    expect(m).toEqual(['Scorpion körde här 2 nov 14:30', 'Skotaren körde här 1 nov 10:00']);
  });
  it('inget spår här men på trakten / inget spår alls', () => {
    expect(korsparMening({ kontrollerat_fore: fore, spar_pa_trakten_fore: 12, traffar: [] })).toEqual(['Inget körspår från våra maskiner här före 4 nov 10:12']);
    expect(korsparMening({ kontrollerat_fore: fore, spar_pa_trakten_fore: 0, traffar: [] })).toEqual(['Inga körspår på trakten före 4 nov 10:12']);
    expect(korsparMening(null)).toBeNull();
    expect(korsparMening({})).toBeNull();
  });
  it('ingen text i appen påstår att skadan fanns innan', () => {
    for (const f of ['lib/avvikelse.ts', 'components/planering/AvvikelseFlode.tsx', 'components/planering/AvvikelseKort.tsx']) {
      const kod = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').toLowerCase();
      expect(kod).not.toMatch(/fanns (innan|före)/);
    }
  });
});

describe('typerna stämmer med databasen', () => {
  it('samma fem värden som CHECK i migrationen', () => {
    const sql = readFileSync('supabase/migrations/20261104093236_avvikelse_bevis.sql', 'utf8');
    for (const t of AVVIKELSE_TYPER) expect(sql).toContain(`'${t}'`);
  });
});

describe('kortets tid', () => {
  it('filens tid om den är färsk, annars nu — aldrig framtid', () => {
    const nu = Date.parse('2026-11-04T10:00:00Z');
    expect(kortetsTid({ lastModified: nu - 60_000 }, nu).getTime()).toBe(nu - 60_000);
    expect(kortetsTid({ lastModified: nu - 3600_000 }, nu).getTime()).toBe(nu);
    expect(kortetsTid({ lastModified: nu + 60_000 }, nu).getTime()).toBe(nu);
    expect(kortetsTid({}, nu).getTime()).toBe(nu);
  });
});

describe('kön: sparad lokalt först, skickas när nätet finns, aldrig dubbelt', () => {
  const foto = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
  const rad = async (id = '11111111-1111-4111-8111-111111111111'): Promise<AvvikelseRadIn> =>
    byggAvvikelse({ id, objektId: 'o1', typ: 'stenmur', kommentar: '  överkörd  ', lat: 57, lng: 15, noggrannhetM: 6.4, tagen: new Date('2026-11-04T09:00:00Z'), foto: foto() });

  it('raden bär fotots SHA-256 och sökväg', async () => {
    const r = await rad();
    expect(r.foto_sha256).toBe(await sha256Hex(await foto().arrayBuffer()));
    expect(r.foto_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.foto_sokvag).toBe(avvikelseSokvag('o1', r.id));
    expect(r.kommentar).toBe('överkörd');
    expect(r.noggrannhet_m).toBe(6);
  });

  it('utan nät ligger den kvar; när nätet kommer laddas fotot upp FÖRE raden, en gång', async () => {
    const lager = skapaMinnesLager();
    let natt = false;
    const logg: string[] = [];
    const sparade: AvvikelseRad[] = [];
    const ko = skapaAvvikelseKo({
      lager,
      ladda: async (s) => { if (!natt) throw new Error('nät'); logg.push(`foto ${s}`); },
      skriv: async (r) => { if (!natt) return { svar: 'fel' }; logg.push(`rad ${r.id}`); return { svar: 'ok', rad: { ...r, skapad_at: 'x', skapad_av: 'm', korspar_fore: {} } }; },
      paSparad: (r) => sparade.push(r),
    });
    const r = await rad();
    await ko.laggTill(r, foto());
    await ko.kor(true);
    expect(logg).toEqual([]);
    expect((await ko.vantande('o1')).map((v) => v.rad.id)).toEqual([r.id]);
    natt = true;
    await ko.kor(true);
    expect(logg).toEqual([`foto ${r.foto_sokvag}`, `rad ${r.id}`]);
    expect(sparade.map((s) => s.id)).toEqual([r.id]);
    expect(await ko.vantande('o1')).toEqual([]);
    await ko.kor(true);
    expect(logg.length).toBe(2);
  });

  it('fotot och raden skrivs i EN post — en kö som går emellan ser aldrig ett foto utan rad', async () => {
    const lager = skapaMinnesLager();
    const put = lager.put.bind(lager);
    const skrivna: any[] = [];
    lager.put = async (f) => { skrivna.push(f); return put(f); };
    const ko = skapaAvvikelseKo({ lager, ladda: async () => {}, skriv: async () => ({ svar: 'fel' }) });
    await ko.laggTill(await rad(), foto());
    expect(skrivna.length).toBe(1);
    expect(skrivna[0].rad.typ).toBe('stenmur');
  });
});

describe('listan: servern + det som väntar på enheten, ingen dubblett', () => {
  it('en väntande som kommit fram visas en gång', () => {
    const r = (id: string, t: string) => ({ id, objekt_id: 'o', typ: 'annat', kommentar: null, lat: 0, lng: 0, noggrannhet_m: null, foto_sokvag: '', foto_sha256: '', tagen_at: t } as any);
    const ut = slaIhopAvvikelser([{ ...r('a', '2026-11-01T00:00:00Z'), skapad_at: '', skapad_av: '', korspar_fore: {} }], [{ rad: r('a', '2026-11-01T00:00:00Z') }, { rad: r('b', '2026-11-03T00:00:00Z') }]);
    expect(ut.map((x) => [x.rad.id, x.vantar])).toEqual([['b', true], ['a', false]]);
  });
});
