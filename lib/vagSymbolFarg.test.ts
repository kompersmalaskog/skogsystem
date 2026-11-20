import { describe, expect, it } from 'vitest';
import fixtur from './__fixtures__/skalviken_vagsymboler_2026-10-28.json';
import { fargUrText, foreslaVagFarg, harVagForslag, tillampaVagForslag, vagForslagText, forslagFargPerVag, VAGSYMBOL_MAX_M, type VagMarkering } from './vagSymbolFarg';
import type { LatLon } from './larm/geo';

// Samma omräkning som planeringsvyns svgToLatLon: x/y i "pixlar" (meter per pixel = scale) från kartans mitt.
function konverterare(lat0: number, lng0: number, zoom: number) {
  const scale = (156543.03392 * Math.cos((lat0 * Math.PI) / 180)) / Math.pow(2, zoom);
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return (x: number, y: number): LatLon => ({ lat: lat0 + (-y * scale) / 111320, lon: lng0 + (x * scale) / mLon });
}
// Enkel plan värld för konstruerade fall: 1 enhet = 1 m (ca) vid ekvatorn räcker inte — använd Skälvikens kamera, scale ≈ 1,33 m/enhet.
const tillLL = konverterare(fixtur.kamera.lat, fixtur.kamera.lng, fixtur.kamera.zoom);
const M_PER_ENHET = (156543.03392 * Math.cos((fixtur.kamera.lat * Math.PI) / 180)) / Math.pow(2, fixtur.kamera.zoom);

const vag = (id: number, pts: Array<[number, number]>, extra: Partial<VagMarkering> = {}): VagMarkering => ({ id, isLine: true, lineType: 'mainRoad', path: pts.map(([x, y]) => ({ x, y })), ...extra });
const symbol = (id: number, x: number, y: number, comment: string): VagMarkering => ({ id, isMarker: true, type: 'road', comment, x, y });

describe('fargUrText', () => {
  it('läser färgen ur symbolens text', () => {
    expect(fargUrText('Röd väg ')).toBe('red');
    expect(fargUrText('Gul väg')).toBe('yellow');
    expect(fargUrText('blå')).toBe('blue');
    expect(fargUrText('Gul Basväg in till gallringen ')).toBe('yellow');
    expect(fargUrText('röda vägen')).toBe('red');
    expect(fargUrText('Blått band')).toBe('blue');
  });
  it('ingen färg eller två olika färger = null', () => {
    expect(fargUrText('Ny väg huggd')).toBeNull();
    expect(fargUrText('')).toBeNull();
    expect(fargUrText(undefined)).toBeNull();
    expect(fargUrText('röd eller gul?')).toBeNull();
    expect(fargUrText('Rödingvägen')).toBeNull();    // ordet måste stå ensamt
    expect(fargUrText('Gulsparv')).toBeNull();
  });
  it('samma färg två gånger är fortfarande en färg', () => {
    expect(fargUrText('röd väg, röda band')).toBe('red');
  });
});

describe('foreslaVagFarg — konstruerade fall', () => {
  it('en symbol vid en basväg ger vägen symbolens färg och tar bort symbolen', () => {
    const f = foreslaVagFarg([vag(1, [[0, 0], [100, 0]]), symbol(9, 50, 3, 'Röd väg')], tillLL);
    expect(f.vagar).toEqual([{ vagId: '1', farg: 'red', andras: true, symbolIdn: ['9'] }]);
    expect(f.symbolIdn).toEqual(['9']);
    expect(harVagForslag(f)).toBe(true);
  });

  it('symbolen hör till NÄRMASTE basväg', () => {
    const f = foreslaVagFarg([vag(1, [[0, 0], [100, 0]]), vag(2, [[0, 10], [100, 10]]), symbol(9, 50, 7, 'Gul väg')], tillLL);
    expect(f.vagar.map((r) => r.vagId)).toEqual(['2']);
  });

  it('gränsen är VAGSYMBOL_MAX_M: precis innanför tas med, precis utanför rörs inte', () => {
    const innan = (VAGSYMBOL_MAX_M - 0.5) / M_PER_ENHET, utom = (VAGSYMBOL_MAX_M + 0.5) / M_PER_ENHET;
    const a = foreslaVagFarg([vag(1, [[0, 0], [100, 0]]), symbol(9, 50, innan, 'Röd väg')], tillLL);
    const b = foreslaVagFarg([vag(1, [[0, 0], [100, 0]]), symbol(9, 50, utom, 'Röd väg')], tillLL);
    expect(a.vagar).toHaveLength(1);
    expect(b.vagar).toHaveLength(0);
    expect(b.orort.utanVag).toBe(1);
    expect(b.symbolIdn).toEqual([]);
    expect(harVagForslag(b)).toBe(false);
  });

  it('en symbol 30 m från närmaste basväg hör inte till någon väg (gränsen är 25 m, Martin: "bredvid vägen")', () => {
    expect(VAGSYMBOL_MAX_M).toBe(25);
    const f = foreslaVagFarg([vag(1, [[0, 0], [100, 0]]), symbol(9, 50, 30 / M_PER_ENHET, 'Röd väg')], tillLL);
    expect(f.vagar).toEqual([]);
    expect(f.orort.utanVag).toBe(1);
  });

  it('två symboler med OLIKA färg på samma väg: varken vägen eller symbolerna rörs', () => {
    const f = foreslaVagFarg([vag(1, [[0, 0], [100, 0]]), symbol(8, 20, 2, 'Röd väg'), symbol(9, 80, 2, 'Gul väg')], tillLL);
    expect(f.vagar).toEqual([]);
    expect(f.symbolIdn).toEqual([]);
    expect(f.orort.krock).toBe(1);
  });

  it('två symboler med SAMMA färg på samma väg: en väg, båda symbolerna tas bort', () => {
    const f = foreslaVagFarg([vag(1, [[0, 0], [100, 0]]), symbol(8, 20, 2, 'Röd väg'), symbol(9, 80, 2, 'röd')], tillLL);
    expect(f.vagar).toEqual([{ vagId: '1', farg: 'red', andras: true, symbolIdn: ['8', '9'] }]);
  });

  it('vägen har redan en ANNAN färg: rörs inte', () => {
    const f = foreslaVagFarg([vag(1, [[0, 0], [100, 0]], { farg: 'blue' }), symbol(9, 50, 2, 'Röd väg')], tillLL);
    expect(f.vagar).toEqual([]);
    expect(f.symbolIdn).toEqual([]);
    expect(f.orort.annanFarg).toBe(1);
  });

  it('vägen har redan SAMMA färg: vägen ändras inte men symbolen tas bort', () => {
    const f = foreslaVagFarg([vag(1, [[0, 0], [100, 0]], { farg: 'red' }), symbol(9, 50, 2, 'Röd väg')], tillLL);
    expect(f.vagar).toEqual([{ vagId: '1', farg: 'red', andras: false, symbolIdn: ['9'] }]);
  });

  it('symbol utan färg rörs inte', () => {
    const f = foreslaVagFarg([vag(1, [[0, 0], [100, 0]]), symbol(9, 50, 2, 'Ny väg huggd')], tillLL);
    expect(f.vagar).toEqual([]);
    expect(f.orort.utanFarg).toBe(1);
  });

  it('bara basvägar: stickvägar och andra linjer får aldrig symbolens färg', () => {
    const f = foreslaVagFarg([
      { id: 1, isLine: true, lineType: 'sideRoadBlue', path: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { id: 2, isLine: true, lineType: 'stonewall', path: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      symbol(9, 50, 1, 'Röd väg'),
    ], tillLL);
    expect(f.vagar).toEqual([]);
    expect(f.orort.utanVag).toBe(1);
  });

  it('andra symboler än vägsymbolen rörs inte, och en linje med en enda punkt räknas inte', () => {
    const f = foreslaVagFarg([
      vag(1, [[0, 0]]),
      { id: 9, isMarker: true, type: 'warning', comment: 'Röd fara', x: 0, y: 1 },
    ], tillLL);
    expect(f.vagar).toEqual([]);
    expect(f.orort).toEqual({ utanVag: 0, krock: 0, annanFarg: 0, utanFarg: 0 });
  });

  it('vägar och symboler med lat/lng i stället för x/y fungerar också', () => {
    const a = tillLL(0, 0), b = tillLL(100, 0), s = tillLL(50, 2);
    const f = foreslaVagFarg([
      { id: 1, isLine: true, lineType: 'mainRoad', path: [{ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon }] },
      { id: 9, isMarker: true, type: 'road', comment: 'Gul väg', lat: s.lat, lng: s.lon },
    ], tillLL);
    expect(f.vagar).toEqual([{ vagId: '1', farg: 'yellow', andras: true, symbolIdn: ['9'] }]);
  });

  it('vägarna kommer i nummerordning', () => {
    const f = foreslaVagFarg([vag(1, [[0, 0], [100, 0]], { nummer: 7 }), vag(2, [[0, 50], [100, 50]], { nummer: 2 }), symbol(8, 50, 1, 'röd'), symbol(9, 50, 51, 'gul')], tillLL);
    expect(f.vagar.map((r) => r.vagId)).toEqual(['2', '1']);
  });
});

describe('vagForslagText', () => {
  it('frågan räknar vägarna och säger det som inte rörs på EN rad', () => {
    const f = foreslaVagFarg([
      vag(1, [[0, 0], [100, 0]]), vag(2, [[0, 50], [100, 50]]), vag(3, [[0, 100], [100, 100]]),
      symbol(7, 10, 1, 'röd'), symbol(8, 10, 51, 'gul'), symbol(9, 10, 101, 'röd'), symbol(10, 80, 101, 'gul'), symbol(11, 500, 500, 'blå'),
    ], tillLL);
    const t = vagForslagText(f);
    expect(t.fraga).toBe('Ge 2 vägar färg från symbolerna?');
    expect(t.orort).toBe('Rörs inte: 1 väg med två färger, 1 symbol långt från vägarna.');
  });
  it('en väg: "Ge vägen färg från symbolen?", inget som inte rörs = ingen rad', () => {
    const t = vagForslagText(foreslaVagFarg([vag(1, [[0, 0], [100, 0]]), symbol(9, 50, 2, 'Röd väg')], tillLL));
    expect(t).toEqual({ fraga: 'Ge vägen färg från symbolen?', orort: null });
  });
});

describe('tillampaVagForslag', () => {
  it('sätter färgen bara på vägarna som ändras, rör inget annat, och tar bort exakt förslagets symboler', () => {
    const markers: VagMarkering[] = [
      vag(1, [[0, 0], [100, 0]], { nummer: 1, comment: 'kommentar' } as any), vag(2, [[0, 50], [100, 50]], { farg: 'yellow' }),
      symbol(8, 50, 1, 'röd'), symbol(9, 50, 51, 'gul'), symbol(10, 900, 900, 'blå'),
    ];
    const f = foreslaVagFarg(markers, tillLL);
    const { andrade, bortIdn } = tillampaVagForslag(markers, f);
    expect(andrade).toEqual([{ ...markers[0], farg: 'red' }]);
    expect(bortIdn.sort()).toEqual(['8', '9']);
    expect(forslagFargPerVag(f).get('1')).toBe('red');
  });
});

describe('Skälviken RP J-Hus -25 (prod 2026-10-28)', () => {
  const f = foreslaVagFarg(fixtur.markers as VagMarkering[], tillLL);

  it('fyra vägsymboler: två får färg på basväg 5 och 10, två krockar på basväg 3 och rörs inte', () => {
    expect(f.vagar).toEqual([
      { vagId: '1791969996511', farg: 'red', andras: true, symbolIdn: ['1791970014284'] },     // basväg 5, "Röd väg"
      { vagId: '1791972711302', farg: 'yellow', andras: true, symbolIdn: ['1791975268869'] },  // basväg 10, "Gul väg"
    ]);
    expect(f.orort).toEqual({ utanVag: 0, krock: 1, annanFarg: 0, utanFarg: 0 });  // basväg 3: en röd och en gul symbol
    expect(vagForslagText(f)).toEqual({ fraga: 'Ge 2 vägar färg från symbolerna?', orort: 'Rörs inte: 1 väg med två färger.' });
  });

  it('symbolerna står 1–2 m från sin väg — långt innanför gränsen', () => {
    const vagar = (fixtur.markers as VagMarkering[]).filter((m) => m.lineType === 'mainRoad');
    for (const id of [1791970014284, 1791975268869]) {
      const s = (fixtur.markers as VagMarkering[]).find((m) => m.id === id)!;
      const f1 = foreslaVagFarg([...vagar, s], tillLL, 3);
      expect(f1.vagar).toHaveLength(1);
    }
  });
});
