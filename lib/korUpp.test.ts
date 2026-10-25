// Kör upp och backa: vit dubbelpil. Texter, skäl, snäpp till väg, vad som syns var. Pixlar och riktiga fingrar prövas i lib/fallTradKorUpp.hytt.test.ts (Chromium).
import { describe, expect, it } from 'vitest';
import { samlaOmraden, stegaInstruktion, TOMT_INSTRUKTION, kortAttVisa, arOsedd } from './instruktioner/instruktioner';
import {
  KORUPP_MIN_M, KORUPP_SKAL, KORUPP_SYNLIG_M, KORUPP_TYP, arKorUpp, arSkal, korUppData, korUppLager, korUppLangdM, korUppOrd, korUppText, korUppUr, nyKorUpp, skalNamn, snappaTillVag, synligaKorUpp,
  type KorUppPos,
} from './korUpp';
import { fram } from './fallTrad';

const origo = { lat: 57, lon: 15 };
const pil = (id: string, skal: KorUppPos['skal'] = 'inget', start = origo, slut = fram(origo, 0, 40)): KorUppPos => ({ id, start, slut, skal, vagId: null });

describe('skälen och texterna', () => {
  it('fem skäl i den ordning planeraren ser dem: Inget, Blött, Brant, Stenigt, Annat', () => {
    expect(KORUPP_SKAL.map((s) => s.namn)).toEqual(['Inget', 'Blött', 'Brant', 'Stenigt', 'Annat']);
    expect(KORUPP_SKAL.every((s) => arSkal(s.id))).toBe(true);
    expect(arSkal('bergig')).toBe(false);
    expect(skalNamn('brant')).toBe('Brant'); expect(skalNamn('okänt')).toBe('Inget'); expect(skalNamn(undefined)).toBe('Inget');
  });
  it('ordet vid pilen: skälet — men INGET ord när skälet är Inget (eller okänt)', () => {
    expect(korUppOrd('brant')).toBe('Brant'); expect(korUppOrd('blott')).toBe('Blött');
    expect(korUppOrd('inget')).toBeNull(); expect(korUppOrd(undefined)).toBeNull(); expect(korUppOrd('xx')).toBeNull();
  });
  it('instruktionskortets text: "Brant – kör upp mot gränsen och backa tillbaka"; utan skäl bara uppmaningen', () => {
    expect(korUppText('brant')).toBe('Brant – kör upp mot gränsen och backa tillbaka');
    expect(korUppText('stenigt')).toBe('Stenigt – kör upp mot gränsen och backa tillbaka');
    expect(korUppText('inget')).toBe('Kör upp mot gränsen och backa tillbaka');
    expect(korUppText(undefined)).toBe('Kör upp mot gränsen och backa tillbaka');
  });
});

describe('markeringen', () => {
  it('är en pil-markering (typ pil i databasen) av sorten koruppbacka med start och slut', () => {
    const m = nyKorUpp(origo, fram(origo, 90, 30), 'v1', 77)!;
    expect(m).toMatchObject({ id: 77, isArrow: true, arrowType: KORUPP_TYP, lng: 15, lat: 57, skal: 'inget', vagId: 'v1' });
    expect(arKorUpp(m)).toBe(true);
    expect(arKorUpp({ isArrow: true, arrowType: 'fellingtree' })).toBe(false);
    const k = korUppUr(m)!;
    expect(k.start).toEqual(origo); expect(korUppLangdM(k)).toBeCloseTo(30, 0); expect(k.skal).toBe('inget'); expect(k.vagId).toBe('v1');
  });
  it('en pil utan väg har ingen vagId; en kortare än 8 m blir ingen pil', () => {
    expect('vagId' in nyKorUpp(origo, fram(origo, 0, 20), null)!).toBe(false);
    expect(KORUPP_MIN_M).toBe(8);
    expect(nyKorUpp(origo, fram(origo, 0, 7.5), null)).toBeNull();
    expect(nyKorUpp(origo, fram(origo, 0, 8.5), null)).not.toBeNull();
  });
  it('en trasig markering (saknad slutpunkt) ignoreras, ett okänt skäl blir Inget', () => {
    expect(korUppUr({ id: 1, isArrow: true, arrowType: KORUPP_TYP, lng: 15, lat: 57 })).toBeNull();
    expect(korUppUr({ id: 1, isArrow: true, arrowType: KORUPP_TYP, lng: 15, lat: 57, lng2: 15.1, lat2: 57.1, skal: 'tokigt' })!.skal).toBe('inget');
  });
});

describe('från vilken väg? — snäpp till närmaste väg', () => {
  const proj = (c: readonly [number, number]) => ({ x: (c[0] - 15) * 1e5, y: -(c[1] - 57) * 1e5 });
  const vagar = [{ id: 'a', coords: [[14.99, 57.0], [15.01, 57.0]] as Array<[number, number]> }, { id: 'b', coords: [[15.0, 57.0], [15.0, 56.99]] as Array<[number, number]> }];
  it('närmaste väg inom 32 px vinner, och starten läggs PÅ vägen', () => {
    const s = snappaTillVag(vagar, { x: 300, y: 12 }, proj)!;
    expect(s.id).toBe('a'); expect(s.punkt.lat).toBeCloseTo(57, 8); expect(s.punkt.lon).toBeCloseTo(15.003, 6); expect(s.avstandPx).toBeCloseTo(12, 5);
  });
  it('i ett vägkors vinner den närmaste; på lika avstånd den först listade', () => {
    expect(snappaTillVag(vagar, { x: 5, y: 100 }, proj)!.id).toBe('b');
    expect(snappaTillVag(vagar, { x: 20, y: 10 }, proj)!.id).toBe('a');
  });
  it('längre än 32 px från alla vägar → ingen väg', () => {
    expect(snappaTillVag(vagar, { x: 500, y: 40 }, proj)).toBeNull();
    expect(snappaTillVag([], { x: 0, y: 0 }, proj)).toBeNull();
    expect(snappaTillVag(vagar, { x: 300, y: 31 }, proj)).not.toBeNull();
  });
  it('en väg med en enda punkt (ingen sträcka) ger aldrig en träff', () => { expect(snappaTillVag([{ id: 'x', coords: [[15, 57]] }], { x: 0, y: 0 }, proj)).toBeNull(); });
});

describe('vad som syns var — maskinen', () => {
  const nara = pil('nara', 'brant', fram(origo, 0, 50), fram(origo, 0, 90));
  const langt = pil('langt', 'inget', fram(origo, 0, 300), fram(origo, 0, 340));
  it('planeringen ser alla', () => { expect(synligaKorUpp([nara, langt], 'planering', null)).toHaveLength(2); });
  it('SKÖRDAREN ser bara de som ligger nära maskinen (80 m till närmaste punkt på pilen)', () => {
    expect(KORUPP_SYNLIG_M).toBe(80);
    expect(synligaKorUpp([nara, langt], 'skordare', origo).map((p) => p.id)).toEqual(['nara']);
    expect(synligaKorUpp([pil('a', 'inget', fram(origo, 0, 79), fram(origo, 0, 120))], 'skordare', origo)).toHaveLength(1);
    expect(synligaKorUpp([pil('a', 'inget', fram(origo, 0, 81), fram(origo, 0, 120))], 'skordare', origo)).toHaveLength(0);
  });
  it('utan position ser skördaren inga; skotaren ser aldrig några', () => {
    expect(synligaKorUpp([nara], 'skordare', null)).toEqual([]);
    expect(synligaKorUpp([nara], 'skotare', origo)).toEqual([]);
    expect(synligaKorUpp([pil('pa-maskinen')], 'skotare', origo)).toEqual([]);
  });
});

describe('data till kartan', () => {
  it('en linje, två spetsar (rakt åt var sitt håll) och ordet i mitten — bara när skälet inte är Inget', () => {
    const med = korUppData([pil('a', 'brant', origo, fram(origo, 90, 40))]).features;
    expect(med.map((f) => f.properties.slag).sort()).toEqual(['linje', 'ord', 'spets', 'spets']);
    const spetsar = med.filter((f) => f.properties.slag === 'spets');
    expect(spetsar.map((f) => f.properties.riktning).sort((a: any, b: any) => a - b)).toEqual([90, 270]);
    const slut = spetsar.find((f) => f.properties.riktning === 90)!.geometry.coordinates as number[];
    expect(slut[0]).toBeCloseTo(fram(origo, 90, 40).lon, 8);
    const ord = med.find((f) => f.properties.slag === 'ord')!;
    expect(ord.properties.text).toBe('Brant');
    expect((ord.geometry.coordinates as number[])[0]).toBeCloseTo(fram(origo, 90, 20).lon, 7);
    expect(korUppData([pil('a', 'inget')]).features.map((f) => f.properties.slag).sort()).toEqual(['linje', 'spets', 'spets']);
  });
  it('lagren: träffyta (36 px), kant, vit linje, spets och ord — alla med prefixet line- (körvyns whitelist)', () => {
    const l = korUppLager();
    expect(l.map((x) => x.id)).toEqual(['line-korupp-traff', 'line-korupp-kant', 'line-korupp-linje', 'line-korupp-spets', 'line-korupp-ord']);
    expect(l.every((x) => x.id.startsWith('line-'))).toBe(true);
    expect(l[0].paint['line-width']).toBeGreaterThanOrEqual(36);
    expect(l[2].paint['line-color']).toBe('#ffffff');   // vit dubbelpil
  });
});

describe('instruktionskortet vid inkörning (maskinläget)', () => {
  const marker = nyKorUpp(origo, fram(origo, 0, 40), 'v1', 5)!;
  const samla = (pos: { lat: number; lon: number } | null, skal = 'brant') => samlaOmraden({ objektId: 'o', vida: null, markers: [{ ...marker, skal }], svgToLatLon: () => origo, typNamn: () => '', kommentarer: [], pos });
  it('pilen är ett område med EN instruktion: skälet + uppmaningen, källa "Planerare"', () => {
    const [o] = samla(null);
    expect(o).toMatchObject({ nyckel: 'korupp:5', namn: 'Kör upp och backa', avlagg: false });
    expect(o.instruktioner).toHaveLength(1);
    expect(o.instruktioner[0]).toMatchObject({ ref: 'korupp:5', text: 'Brant – kör upp mot gränsen och backa tillbaka', kalla: 'planering', etikett: 'Planerare', forfattare: null });
  });
  it('kortet kommer när maskinen kommer inom 30 m från pilen — inte före', () => {
    const sett = new Map<string, string>();
    let st = stegaInstruktion(TOMT_INSTRUKTION, samla(fram(origo, 270, 100)), sett, 0);
    expect(kortAttVisa(st, samla(fram(origo, 270, 100)), sett, false)).toBeNull();
    const nara = fram(origo, 90, 20);
    st = stegaInstruktion(st, samla(nara), sett, 1000);
    const kort = kortAttVisa(st, samla(nara), sett, false);
    expect(kort?.namn).toBe('Kör upp och backa');
    expect(kort?.instruktioner[0].text).toContain('Brant');
  });
  it('ändrar planeraren skälet är instruktionen osedd igen (ny text → ny hash); ett sett skäl visas inte igen', () => {
    const [a] = samla(null, 'brant'); const [b] = samla(null, 'blott');
    const sett = new Map([[a.instruktioner[0].ref, a.instruktioner[0].hash]]);
    expect(arOsedd(a.instruktioner[0], sett)).toBe(false);
    expect(arOsedd(b.instruktioner[0], sett)).toBe(true);
  });
  it('en pil utan giltig slutpunkt ger ingen instruktion', () => {
    expect(samlaOmraden({ objektId: 'o', vida: null, markers: [{ id: 1, isArrow: true, arrowType: KORUPP_TYP, lng: 15, lat: 57 }], svgToLatLon: () => origo, typNamn: () => '', kommentarer: [], pos: null })).toEqual([]);
  });
});
