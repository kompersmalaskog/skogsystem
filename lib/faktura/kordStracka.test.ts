// RÅDATA, ALDRIG RITNINGEN — det är hela poängen med filen, och det som gör
// att talet går att skicka till en inköpare.
import { describe, it, expect } from 'vitest';
import { kordStracka } from './kordStracka';
import { korsparLinjer } from '@/lib/korspar';

/** En rak öst–västlig linje med punkter var `steg` meter. */
function rakt(lat: number, lng0: number, meter: number, steg: number) {
  const perGrad = 111320 * Math.cos(lat * Math.PI / 180);
  const n = Math.round(meter / steg);
  return Array.from({ length: n + 1 }, (_, i) => ({ lat, lng: lng0 + (i * steg) / perGrad }));
}

describe('kordStracka', () => {
  it('mäter längden längs spåret', () => {
    const k = kordStracka([rakt(56.66, 15.36, 1000, 10)], []);
    expect(k).not.toBeNull();
    expect(k!.skotareM).toBeGreaterThan(995);
    expect(k!.skotareM).toBeLessThan(1005);
    // Utan skördarspår sägs ingenting om stråket: vi vet inte var det går.
    expect(k!.skordareM).toBeNull();
    expect(k!.utanforM).toBeNull();
  });

  it('räknar INTE steget över en lucka — där har maskinen inte kört', () => {
    // Appen av, eller maskinen på trailern: två punkter 2 km isär är ingen
    // körning. Samma gräns bryter linjen på kartan, så tal och bild håller ihop.
    const a = rakt(56.66, 15.36, 200, 10);
    const b = rakt(56.66, 15.40, 200, 10);
    const k = kordStracka([[...a, ...b]], []);
    expect(k!.skotareM).toBeGreaterThan(395);
    expect(k!.skotareM).toBeLessThan(405);
  });

  it('LÅS: talet räknas på rådata — ritningens linje är för kort', () => {
    // `korsparLinjer` jämnar ut spåret för kartans skull och kortar det till
    // 69–85 % av det maskinen körde. Ett tal räknat på ritningen hade sagt att
    // skotaren kört en femtedel kortare än hon gjorde — och det går till kund.
    // Darrigt spår, som en riktig GPS i skog:
    const darr = rakt(56.66, 15.36, 600, 3).map((p, i) => ({
      lat: p.lat + (i % 2 === 0 ? 1 : -1) * 0.000018,
      lng: p.lng,
    }));
    const ra = kordStracka([darr], [])!.skotareM;
    // `korsparLinjer` vill ha hyttspårspunkter; tiden används inte av utjämningen.
    const medTid = darr.map((p, i) => ({ ...p, tid: new Date(i * 3000).toISOString() }));
    const ritad = korsparLinjer(medTid).map(l => l.map(([lng, lat]) => ({ lat, lng })));
    const ritadM = kordStracka(ritad, [])!.skotareM;
    expect(ritadM).toBeLessThan(ra * 0.9);
  });

  it('delar skotarens körning på skördarens stråk — samma 8 m som hytten', () => {
    const skordare = [rakt(56.66, 15.36, 500, 10)];
    // Skotaren: 500 m i stråket (några meter bredvid) + 500 m långt därifrån.
    const iStraket = rakt(56.66005, 15.36, 500, 10);   // ~5,5 m norrut
    const utanfor = rakt(56.6650, 15.36, 500, 10);     // ~450 m norrut
    const k = kordStracka([iStraket, utanfor], skordare)!;

    expect(k.skotareM).toBeGreaterThan(995);
    expect(k.skordareM).toBeGreaterThan(495);
    // Ungefär halva körningen ligger utanför. Gränsen är `delaKlart`s egen
    // (8 m) — den provas i `korsparKlart.test.ts`, här bara att den används.
    expect(k.utanforM!).toBeGreaterThan(400);
    expect(k.utanforM!).toBeLessThan(600);
  });

  it('inget skotarspår = inget tal, aldrig en nolla', () => {
    expect(kordStracka([], [rakt(56.66, 15.36, 500, 10)])).toBeNull();
    expect(kordStracka([[{ lat: 56.66, lng: 15.36 }]], [])).toBeNull();
  });
});
