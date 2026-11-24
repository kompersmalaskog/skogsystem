import { describe, expect, it } from 'vitest';
import { meterPerPixel, narmasteTraff, NARA_LINJE_PX, NARA_RAGANG_PX, ragangToleransM, stapelOrdning, stapelRang, vinnandeKategoriNara } from './klickNara';
import { geometriM2, medAreal } from './traktAreal';
import { traktArealHa, valjMinstaYta } from './traktGeometri';

// Skärmen är platt: (lng, lat) = (x, y) i px, så avstånden i testet är pixlar.
const proj = (lng: number, lat: number) => ({ x: lng, y: lat });
const linje = (id: string, y: number) => ({ layer: { id }, geometry: { type: 'LineString', coordinates: [[0, y], [200, y]] } });
const yta = (id: string) => ({ layer: { id }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [200, 0], [200, 200], [0, 200], [0, 0]]] } });

describe('vinnandeKategoriNara — linje och rågång slår bara en yta när trycket ligger PÅ dem', () => {
  const P = { x: 100, y: 100 };
  it('ytan vinner när en egen linje ligger 20 px bort (träffytan når men trycket är inte på linjen)', () => {
    expect(vinnandeKategoriNara([linje('line-hitbox', 120), yta('trakt-hansyn-fill')], P, proj)).toBe('yta');
  });
  it('linjen vinner när trycket ligger på den', () => {
    expect(vinnandeKategoriNara([linje('line-hitbox', 100 + NARA_LINJE_PX), yta('trakt-hansyn-fill')], P, proj)).toBe('linje');
    expect(vinnandeKategoriNara([linje('line-hitbox', 100 + NARA_LINJE_PX + 1), yta('trakt-hansyn-fill')], P, proj)).toBe('yta');
  });
  it('Vidas linje (trakt-linje-hit) beter sig som en egen', () => {
    expect(vinnandeKategoriNara([linje('trakt-linje-hit', 118), yta('zone-fill')], P, proj)).toBe('yta');
  });
  it('rågången: 18 px bort slår inte en hänsyn, men ≤ 8 px gör det', () => {
    expect(vinnandeKategoriNara([linje('trakt-ragang-hit', 118), yta('trakt-hansyn-fill')], P, proj)).toBe('yta');
    expect(vinnandeKategoriNara([linje('trakt-ragang-hit', 100 + NARA_RAGANG_PX), yta('trakt-hansyn-fill')], P, proj)).toBe('fastighet');
  });
  it('utan yta under fingret är den generösa träffytan kvar (en tunn linje ska gå att träffa)', () => {
    expect(vinnandeKategoriNara([linje('line-hitbox', 120)], P, proj)).toBe('linje');
    expect(vinnandeKategoriNara([linje('trakt-ragang-hit', 120)], P, proj)).toBe('fastighet');
  });
  it('en traktdel (traktyta) är ingen specifik yta: en väg 20 px bort inne i trakten öppnas som förut, rågången slår traktdelen', () => {
    expect(vinnandeKategoriNara([linje('line-hitbox', 120), yta('trakt-gr-fill')], P, proj)).toBe('linje');
    expect(vinnandeKategoriNara([linje('trakt-ragang-hit', 120), yta('trakt-gr-fill')], P, proj)).toBe('fastighet');
  });
  it('symbol och larm går före allt, oförändrat', () => {
    expect(vinnandeKategoriNara([{ layer: { id: 'markers-hit' }, geometry: { type: 'Point', coordinates: [100, 100] } }, yta('trakt-hansyn-fill'), linje('line-hitbox', 100)], P, proj)).toBe('symbol');
  });
  it('inga träffar → null', () => { expect(vinnandeKategoriNara([], P, proj)).toBeNull(); });
});

describe('narmasteTraff — den närmaste symbolen vinner, inte den som ritats sist', () => {
  const punkt = (id: string, x: number, y: number) => ({ layer: { id: 'markers-hit' }, properties: { id }, geometry: { type: 'Point', coordinates: [x, y] } });
  it('en note och en bro 8 px isär: trycket på noten öppnar noten (bron ligger överst i listan)', () => {
    expect(narmasteTraff([punkt('bro', 108, 100), punkt('note', 100, 100)], { x: 101, y: 100 }, proj)?.properties?.id).toBe('note');
  });
  it('lika långt → den första', () => {
    expect(narmasteTraff([punkt('a', 90, 100), punkt('b', 110, 100)], { x: 100, y: 100 }, proj)?.properties?.id).toBe('a');
  });
  it('tom lista → null', () => { expect(narmasteTraff([], { x: 0, y: 0 }, proj)).toBeNull(); });
});

describe('rågångens tolerans i meter följer zoomen', () => {
  it('MapLibre-zoom 16 vid 56° ger ca 0,66 m/px; zoom 14 ca 2,7 m/px', () => {
    expect(meterPerPixel(56.3, 16)).toBeGreaterThan(0.6);
    expect(meterPerPixel(56.3, 16)).toBeLessThan(0.72);
    expect(meterPerPixel(56.3, 14)).toBeGreaterThan(2.5);
  });
  it('utzoomat (14) är 11 px över 29 m — mer än de gamla 14 m, annars ger trycket "ingenting"; inzoomat stannar den på 14 m', () => {
    expect(ragangToleransM(56.3, 14)).toBeGreaterThanOrEqual(29);
    expect(ragangToleransM(56.3, 16)).toBe(14);
    expect(ragangToleransM(56.3, 19)).toBe(14);
  });
});

describe('areal ur geometrin för ytor utan Vidas areal', () => {
  const ruta = (lng: number, lat: number, dx: number, dy: number) => [[[lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy]]];
  it('100 × 100 m ≈ 10 000 m², hål dras av', () => {
    const lat = 56.3, dLat = 50 / 111320, dLon = 50 / (111320 * Math.cos((lat * Math.PI) / 180));
    expect(geometriM2({ type: 'Polygon', coordinates: ruta(14.47, lat, dLon, dLat) })!).toBeGreaterThan(9900);
    expect(geometriM2({ type: 'Polygon', coordinates: ruta(14.47, lat, dLon, dLat) })!).toBeLessThan(10100);
    const hal = ruta(14.47, lat, dLon / 2, dLat / 2);
    expect(geometriM2({ type: 'Polygon', coordinates: [ruta(14.47, lat, dLon, dLat)[0], hal[0]] })!).toBeLessThan(7600);
  });
  it('punkt och linje har ingen areal', () => { expect(geometriM2({ type: 'Point', coordinates: [1, 2] })).toBeNull(); expect(geometriM2({ type: 'LineString', coordinates: [[0, 0], [1, 1]] })).toBeNull(); });
  it('en yta utan Vidas areal får _arealM2, en med SHAPE.STAr lämnas orörd', () => {
    const g = { type: 'Polygon', coordinates: ruta(14.47, 56.3, 0.0007, 0.00045) };
    const ut = medAreal<{ features?: any[] }>({ features: [{ properties: { _lager: 'L_RAA_POLY_101' }, geometry: g }, { properties: { _lager: 'L_TILLAGGSYTOR', 'SHAPE.STAr': 5000 }, geometry: g }] });
    expect(ut.features![0].properties._arealM2).toBeGreaterThan(0);
    expect(ut.features![1].properties._arealM2).toBeUndefined();
  });
  it('BROKAMÅLA: fornlämningsytan (≈ 10 012 m²) slår inte längre hänsyn 1 (9 995 m²) — den minsta ytan vinner av riktig areal', () => {
    const raa = { properties: { _lager: 'L_RAA_POLY_101', _arealM2: 10012 } };
    const hansyn1 = { properties: { _lager: 'L_TILLAGGSYTOR', 'SHAPE.STAr': 9995.0 } };
    expect(valjMinstaYta([raa, hansyn1])).toBe(hansyn1);
    expect(valjMinstaYta([hansyn1, raa])).toBe(hansyn1);
    expect(traktArealHa(raa.properties)).toBeCloseTo(1.0012, 4);
  });
});

describe('stapelOrdning — överlappande ytor i samma kort', () => {
  const y = (layer: string, namn: string, grupp: string, ha: number | null) => ({ layer: { id: layer }, properties: { namn, grupp, ha } });
  const ordna = (t: any[]) => stapelOrdning(t, (f) => f.properties.namn, (f) => stapelRang(f.properties.grupp), (f) => f.properties.ha).map((f) => f.properties.namn);
  it('fara → kultur/fornlämning → hänsyn/nyckelbiotop → övriga, oavsett i vilken ordning kartan lämnar träffarna', () => {
    const t = [y('trakt-hansyn-fill', 'Hänsyn 3', 'natur', 1.28), y('trakt-ovrigt-fill', 'Övrigt 4', 'info', 0.1), y('trakt-raa-fill', 'Lämning', 'kultur', 1.0), y('trakt-nb-fill', 'Nyckelbiotop', 'fara', 2)];
    expect(ordna(t)).toEqual(['Nyckelbiotop', 'Lämning', 'Hänsyn 3', 'Övrigt 4']);
    expect(ordna([...t].reverse())).toEqual(['Nyckelbiotop', 'Lämning', 'Hänsyn 3', 'Övrigt 4']);
  });
  it('inom samma grupp den minsta ytan först; saknad areal sist', () => {
    expect(ordna([y('trakt-hansyn-fill', 'Stor', 'natur', 2), y('trakt-nb-fill', 'Okänd', 'natur', null), y('trakt-hansyn-fill', 'Liten', 'natur', 0.2)])).toEqual(['Liten', 'Stor', 'Okänd']);
  });
  it('traktdel och rågång tas aldrig med, samma yta från flera lager räknas en gång, en enda yta ger ingen stapel', () => {
    expect(ordna([y('trakt-gr-fill', 'Traktdel', 'natur', 9), y('trakt-hansyn-fill', 'Hänsyn 3', 'natur', 1), y('trakt-ragang-hit', 'Gräns', 'info', null)])).toEqual([]);
    expect(ordna([y('trakt-hansyn-fill', 'Hänsyn 3', 'natur', 1), y('trakt-hansyn-fill', 'Hänsyn 3', 'natur', 1)])).toEqual([]);
    expect(ordna([y('trakt-hansyn-fill', 'Hänsyn 3', 'natur', 1), y('trakt-raa-fill', 'Lämning', 'kultur', 1), y('trakt-gr-fill', 'Traktdel', 'natur', 9)])).toEqual(['Lämning', 'Hänsyn 3']);
  });
});
