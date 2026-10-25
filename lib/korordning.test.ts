import { describe, it, expect } from 'vitest';
import fixtur from './__fixtures__/korordning_arvidstorp_2026-10-25.json';
import {
  borjaOm, foreslaOrdning, kvarEtikett, laggTillFix, langdM, medKor, nastaOrdning, nyTackning, ordnade, pilPunkter, punktLangs, riktad, siffraPunkt, statusPerVag,
  tackningStatus, tryckPaVag, korVagUr, PIL, TACKNING, type KorVag, type LngLat,
} from './korordning';

const vag = (id: string, ordning: number | null, o: Partial<KorVag> = {}): KorVag => ({ id, ordning, bak: false, klar: false, coords: [[15.36, 56.28], [15.361, 56.28]], ...o });
const arvidstorp: KorVag[] = fixtur.vagar.map((v) => ({ id: v.id, ordning: null, bak: false, klar: false, coords: v.coords as LngLat[] }));

describe('status: nu, nästa, kommande, klar följer av ordningen och vad som är klart', () => {
  it('första vägen som inte är klar är nu, nästa den efter, resten kommande', () => {
    const s = statusPerVag([vag('a', 1), vag('b', 2), vag('c', 3), vag('d', 4)]);
    expect([s.get('a'), s.get('b'), s.get('c'), s.get('d')]).toEqual(['nu', 'nasta', 'kommande', 'kommande']);
  });
  it('en klar väg är klar och nästa väg blir nu', () => {
    const s = statusPerVag([vag('a', 1, { klar: true }), vag('b', 2), vag('c', 3)]);
    expect([s.get('a'), s.get('b'), s.get('c')]).toEqual(['klar', 'nu', 'nasta']);
  });
  it('ordningen styr, inte listans ordning', () => {
    const s = statusPerVag([vag('c', 3), vag('a', 1), vag('b', 2)]);
    expect([s.get('a'), s.get('b'), s.get('c')]).toEqual(['nu', 'nasta', 'kommande']);
  });
  it('en väg utan siffra har ingen status (ritas som förut)', () => {
    const s = statusPerVag([vag('a', 1), vag('x', null)]);
    expect(s.has('x')).toBe(false);
  });
  it('alla klara: ingen nu och ingen nästa', () => {
    const s = statusPerVag([vag('a', 1, { klar: true }), vag('b', 2, { klar: true })]);
    expect([...s.values()]).toEqual(['klar', 'klar']);
  });
  it('en klar väg mitt i ordningen hoppas över: 1 klar, 2 nu, 3 klar, 4 nästa', () => {
    const s = statusPerVag([vag('a', 1, { klar: true }), vag('b', 2), vag('c', 3, { klar: true }), vag('d', 4)]);
    expect([s.get('b'), s.get('d')]).toEqual(['nu', 'nasta']);
  });
});

describe('planerarens tryck: siffror och riktning', () => {
  it('tryck på en väg utan siffra ger nästa siffra', () => {
    expect(tryckPaVag([vag('a', null), vag('b', null)], 'a', null)).toEqual({ a: { ordning: 1 } });
    expect(tryckPaVag([vag('a', 1), vag('b', null)], 'b', null)).toEqual({ b: { ordning: 2 } });
  });
  it('en siffra som tagits bort återanvänds inte i luckor — nästa är alltid högsta + 1', () => {
    expect(nastaOrdning([vag('a', 1), vag('b', 3)])).toBe(4);
    expect(nastaOrdning([])).toBe(1);
  });
  it('första trycket på en änd numrerar bara, vänder inte', () => {
    expect(tryckPaVag([vag('a', null)], 'a', 'slut')).toEqual({ a: { ordning: 1 } });
  });
  it('tryck på änden av en väg med siffra vänder riktningen, och igen vänder tillbaka', () => {
    expect(tryckPaVag([vag('a', 1)], 'a', 'slut')).toEqual({ a: { riktningBak: true } });
    expect(tryckPaVag([vag('a', 1, { bak: true })], 'a', 'start')).toEqual({ a: { riktningBak: null } });
  });
  it('tryck på mitten av en väg med siffra gör ingenting', () => {
    expect(tryckPaVag([vag('a', 1)], 'a', null)).toEqual({});
  });
  it('tryck på en väg som inte finns gör ingenting', () => {
    expect(tryckPaVag([vag('a', 1)], 'x', null)).toEqual({});
  });
  it('börja om tar bort siffra, riktning och klar på alla — och rör inte vägar som inte ingår', () => {
    const p = borjaOm([vag('a', 1, { bak: true, klar: true }), vag('b', 2), vag('c', null)]);
    expect(Object.keys(p).sort()).toEqual(['a', 'b']);
    expect(p.a).toEqual({ ordning: null, riktningBak: null, korKlar: null });
  });
});

describe('medKor: null tar bort fältet, så lagrad JSON är densamma som före körordning', () => {
  it('sätter och tar bort, rör inget annat', () => {
    const m = { id: 1, isLine: true, lineType: 'mainRoad', nummer: 3, farg: 'red' };
    const a = medKor(m, { ordning: 2, riktningBak: true });
    expect(a).toEqual({ ...m, ordning: 2, riktningBak: true });
    const b = medKor(a, { ordning: null, riktningBak: null, korKlar: null });
    expect(b).toEqual(m);
    expect(Object.keys(b)).not.toContain('ordning');
  });
});

describe('korVagUr: läser fälten försiktigt', () => {
  it('ogiltigt ordning blir null, riktningBak bara true, korKlar bara en text', () => {
    expect(korVagUr({ id: 7, ordning: 0 }, []).ordning).toBeNull();
    expect(korVagUr({ id: 7, ordning: '2' }, []).ordning).toBeNull();
    expect(korVagUr({ id: 7, ordning: 2.9 }, []).ordning).toBe(2);
    expect(korVagUr({ id: 7, riktningBak: 'true' }, []).bak).toBe(false);
    expect(korVagUr({ id: 7, korKlar: '' }, []).klar).toBe(false);
    expect(korVagUr({ id: 7, korKlar: '2026-10-25T08:00:00Z' }, []).klar).toBe(true);
    expect(korVagUr({ id: 7 }, []).id).toBe('7');
  });
});

describe('geometri', () => {
  const rak: LngLat[] = [[15.0, 56.0], [15.0, 56.001]];   // ~111 m rakt norrut
  it('längd och punkt längs vägen', () => {
    expect(langdM(rak)).toBeCloseTo(111.3, 0);
    const p = punktLangs(rak, 50)!;
    expect(p.riktning).toBeCloseTo(0, 3);
    expect(p.lat).toBeCloseTo(56 + 50 / 111320, 6);
  });
  it('punkt utanför vägen klämms till ändarna', () => {
    expect(punktLangs(rak, -10)!.lat).toBeCloseTo(56, 6);
    expect(punktLangs(rak, 9999)!.lat).toBeCloseTo(56.001, 6);
  });
  it('riktad vänder koordinaterna', () => {
    expect(riktad(rak, true)[0]).toEqual(rak[1]);
    expect(riktad(rak, false)[0]).toEqual(rak[0]);
  });
});

describe('pilarna', () => {
  const rak: LngLat[] = [[15.0, 56.0], [15.0, 56.001]];   // 111 m norrut
  it('pekar i körriktningen — söderut när vägen körs bakifrån', () => {
    expect(pilPunkter(rak, false, 0, true).every((p) => Math.abs(p.riktning) < 0.5)).toBe(true);
    expect(pilPunkter(rak, true, 0, true).every((p) => Math.abs(p.riktning - 180) < 0.5)).toBe(true);
  });
  it('glider framåt: nästa tidpunkt ligger längre fram i körriktningen', () => {
    const a = pilPunkter(rak, false, 0)[0], b = pilPunkter(rak, false, 1000)[0];
    expect(b.lat).toBeGreaterThan(a.lat);
  });
  it('rörelsen är lugn: hastigheten är under en gångfart', () => {
    expect(PIL.HASTIGHET_MS).toBeLessThanOrEqual(6);
  });
  it('en kort väg får en pil, en lång flera med PIL.AVSTAND_M emellan', () => {
    expect(pilPunkter([[15, 56], [15, 56.0002]], false, 0, true)).toHaveLength(1);
    expect(pilPunkter(rak, false, 0, true).length).toBe(Math.floor(langdM(rak) / PIL.AVSTAND_M));
  });
  it('fast uppställning ändras inte med tiden', () => {
    expect(pilPunkter(rak, false, 0, true)).toEqual(pilPunkter(rak, false, 99999, true));
  });
  it('siffran sitter vid körstarten', () => {
    expect(siffraPunkt(rak, false)!.lat).toBeLessThan(56.0005);
    expect(siffraPunkt(rak, true)!.lat).toBeGreaterThan(56.0005);
  });
});

describe('täckning: vägen blir klar av sig själv när maskinen kört den', () => {
  const rak: LngLat[] = [[15.0, 56.0], [15.0, 56.002]];   // ~222 m
  const kor = (t: ReturnType<typeof nyTackning>, fran: number, till: number, avvikM = 0, steg = 15) => {
    let prev: LngLat | null = null;
    for (let d = fran; d <= till; d += steg) {
      const nu: LngLat = [15.0 + avvikM / (111320 * Math.cos(56 * Math.PI / 180)), 56.0 + d / 111320];
      laggTillFix(t, prev, nu); prev = nu;
    }
  };
  it('ingen fix: allt återstår', () => {
    const t = nyTackning(rak);
    const s = tackningStatus(t);
    expect(s.klar).toBe(false);
    expect(s.kvarM).toBeGreaterThan(200);
  });
  it('halva vägen körd: ungefär halva återstår, inte klar', () => {
    const t = nyTackning(rak); kor(t, 0, 111);
    const s = tackningStatus(t);
    expect(s.kvarM).toBeGreaterThan(95);
    expect(s.kvarM).toBeLessThan(125);
    expect(s.klar).toBe(false);
  });
  it('hela vägen körd: klar', () => {
    const t = nyTackning(rak); kor(t, 0, 222);
    expect(tackningStatus(t).klar).toBe(true);
  });
  it('hela vägen körd med 6 m GPS-bruk åt sidan (hyttens läge): klar', () => {
    const t = nyTackning(rak); kor(t, 0, 222, 6);
    expect(tackningStatus(t).klar).toBe(true);
  });
  it('en väg som maskinen kör FÖRBI på 40 m avstånd blir inte körd', () => {
    const t = nyTackning(rak); kor(t, -50, 300, 40);
    expect(tackningStatus(t).kvarM).toBeGreaterThan(200);
  });
  it('körd åt andra hållet räknas också (riktningen avgör inte om vägen är körd)', () => {
    const t = nyTackning(rak);
    let prev: LngLat | null = null;
    for (let d = 222; d >= 0; d -= 15) { const nu: LngLat = [15.0, 56.0 + d / 111320]; laggTillFix(t, prev, nu); prev = nu; }
    expect(tackningStatus(t).klar).toBe(true);
  });
  it('glesa fixar (hyttspåret är tunnat) täcker sträckan mellan dem', () => {
    const t = nyTackning(rak);
    laggTillFix(t, null, [15.0, 56.0]);
    laggTillFix(t, [15.0, 56.0], [15.0, 56.0 + 70 / 111320]);
    expect(tackningStatus(t).kvarM).toBeLessThan(160);
  });
  it('ett GPS-glapp över ' + TACKNING.HOPP_MAX_M + ' m binds inte ihop med en sträcka', () => {
    const t = nyTackning(rak);
    laggTillFix(t, [15.0, 56.0], [15.0, 56.0 + 200 / 111320]);   // 200 m isär: bara den sista fixen räknas (inte hela sträckan dit)
    expect(tackningStatus(t).kvarM).toBeGreaterThan(180);
  });
  it('en mycket kort väg (12 m) blir klar när maskinen passerat den', () => {
    const kort: LngLat[] = [[15.0, 56.0], [15.0, 56.0 + 12 / 111320]];
    const t = nyTackning(kort);
    laggTillFix(t, null, [15.0, 56.0 + 6 / 111320]);
    expect(tackningStatus(t).klar).toBe(true);
  });
  it('etiketten visar meter kvar i körriktningen, avrundat till 5, och försvinner när vägen är klar', () => {
    const t = nyTackning(rak); kor(t, 0, 111);
    const e = kvarEtikett(rak, false, t)!;
    expect(e.text).toMatch(/^\d+ m kvar$/);
    expect(parseInt(e.text, 10) % 5).toBe(0);
    expect(e.lat).toBeGreaterThan(56.0014);   // mitt på den del som återstår, alltså norr om mitten
    kor(t, 111, 222);
    expect(kvarEtikett(rak, false, t)).toBeNull();
  });
  it('körs vägen bakifrån ligger etiketten på den del som återstår i körriktningen', () => {
    const t = nyTackning(rak);
    let prev: LngLat | null = null;
    for (let d = 222; d >= 120; d -= 15) { const nu: LngLat = [15.0, 56.0 + d / 111320]; laggTillFix(t, prev, nu); prev = nu; }
    const e = kvarEtikett(rak, true, t)!;
    expect(e.lat).toBeLessThan(56.0007);   // återstår södra delen
  });
});

describe('förslag ur de gamla körriktningspilarna — Arvidstorp (prod 2026-10-25)', () => {
  const pilar = fixtur.pilar.filter((p) => p.arrowType === 'drivedirection').map((p) => ({ id: p.id, lng: p.lng, lat: p.lat, vinkel: p.vinkel }));
  const nummerAv = new Map(fixtur.vagar.map((v) => [v.id, v.nummer]));
  const f = foreslaOrdning(arvidstorp, pilar, (id) => nummerAv.get(id) ?? 999);
  it('varje förslagsrad har en väg som finns, siffror 1..N utan luckor', () => {
    expect(f.rader.map((r) => r.ordning)).toEqual(f.rader.map((_, i) => i + 1));
    for (const r of f.rader) expect(arvidstorp.some((v) => v.id === r.id)).toBe(true);
  });
  it('varje pil är antingen kopplad till en väg eller ligger kvar — ingen tappas', () => {
    expect(f.pilIdn.length + f.kvarIdn.length).toBe(pilar.length);
    expect(new Set([...f.pilIdn, ...f.kvarIdn]).size).toBe(pilar.length);
  });
  it('förslaget gäller bara vägar som har pilar, i den ordning vägarna ritades', () => {
    const nr = f.rader.map((r) => nummerAv.get(r.id)!);
    expect(nr).toEqual([...nr].sort((a, b) => a - b));
    const utanPil = arvidstorp.filter((v) => !f.rader.some((r) => r.id === v.id));
    expect(utanPil.length).toBe(arvidstorp.length - f.rader.length);
  });
  it('pilarnas riktning avgör riktningen: pil som pekar mot ritriktningen ger bak', () => {
    const v = arvidstorp.find((x) => x.id === '75247d0b')!;          // gul väg 5: ritad söderut, ~ vinkel 180°
    const mitt = punktLangs(v.coords, langdM(v.coords) / 2)!;
    const fram = foreslaOrdning([v], [{ id: 'p', lng: mitt.lng, lat: mitt.lat, vinkel: mitt.riktning }], () => 1);
    const bak = foreslaOrdning([v], [{ id: 'p', lng: mitt.lng, lat: mitt.lat, vinkel: (mitt.riktning + 180) % 360 }], () => 1);
    expect(fram.rader[0].bak).toBe(false);
    expect(bak.rader[0].bak).toBe(true);
  });
  it('flera pilar på samma väg: majoriteten avgör', () => {
    const v = arvidstorp.find((x) => x.id === '75247d0b')!;
    const m = (d: number, vinkel: number) => { const p = punktLangs(v.coords, d)!; return { id: `p${d}`, lng: p.lng, lat: p.lat, vinkel }; };
    const r = punktLangs(v.coords, 20)!.riktning;
    const res = foreslaOrdning([v], [m(10, r), m(20, (r + 180) % 360), m(30, (r + 180) % 360)], () => 1);
    expect(res.rader[0]).toMatchObject({ bak: true, pilar: 3 });
  });
  it('en pil över en kilometer från närmaste väg hör inte till någon väg och ligger kvar', () => {
    const v = arvidstorp[0];
    const p = punktLangs(v.coords, 10)!;
    const res = foreslaOrdning([v], [{ id: 'borta', lng: p.lng, lat: p.lat + 0.01, vinkel: 0 }], () => 1);
    expect(res.rader).toEqual([]);
    expect(res.kvarIdn).toEqual(['borta']);
    expect(res.pilIdn).toEqual([]);
  });
  it('Mölleryd har varken vägar eller körriktningspilar i prod: tomt förslag, ingenting händer', () => {
    expect(foreslaOrdning([], [], () => 0)).toEqual({ rader: [], pilIdn: [], kvarIdn: [] });
  });
});

describe('ordnade', () => {
  it('bara de med siffra, i ordning', () => {
    expect(ordnade([vag('c', 3), vag('x', null), vag('a', 1)]).map((v) => v.id)).toEqual(['a', 'c']);
  });
});
