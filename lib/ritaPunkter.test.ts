import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { arDubbeltryck, arEmuleradMus, slutaRitning, utanDubbletter, type LngLat } from './ritaPunkter';

// Punktlistorna är RIKTIGA rader ur planering_markeringar (data.path, {x,y}) från Martins ritning 2026-10-13.
// Chaikin är affint ekvivariant — att köra den på x/y ger samma form som på lng/lat.
const P = (s: string): LngLat[] => s.split('|').map((t) => { const [x, y] = t.trim().split(',').map(Number); return [x, y] as LngLat; });

// "Ej framkomlig" (noentry): 4 hörn tryckta, 33 punkter lagrade.
const NOENTRY = P('-57.2,-225.4 | -57.2,-225.4 | -55.4,-224.4 | -51.7,-222.3 | -46.3,-219.3 | -39.0,-215.2 | -33.6,-212.2 | -30.0,-210.2 | -28.2,-209.1 | -28.2,-209.1 | -29.3,-206.5 | -31.4,-201.3 | -34.7,-193.4 | -39.1,-182.9 | -42.4,-175.0 | -44.6,-169.8 | -45.7,-167.1 | -45.7,-167.1 | -47.0,-169.3 | -49.6,-173.7 | -53.6,-180.2 | -58.9,-188.9 | -62.9,-195.4 | -65.6,-199.6 | -66.9,-201.7 | -66.9,-201.6 | -66.3,-203.0 | -65.1,-205.9 | -63.3,-210.4 | -60.8,-216.4 | -59.0,-220.9 | -57.8,-223.9 | -57.2,-225.4');
// Gallring: 4 hörn tryckta, 9 punkter lagrade — varje hörn dubbelt, inga mellanpunkter.
const GALLRING = P('-133.4,-112.7 | -133.4,-112.7 | -106.9,-90.9 | -106.9,-90.9 | -124.7,-61.4 | -124.7,-60.9 | -155.7,-93.2 | -155.7,-92.7 | -133.4,-112.7');

// DEN GAMLA utjämningen, ordagrant ur app/planering/page.tsx före rättningen (smoothCoords, 2 varv Chaikin).
const gammalSmoothCoords = (coords: LngLat[], iterations = 2, closed = true): LngLat[] => {
  if (coords.length < 3) return coords;
  let pts = coords;
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: LngLat[] = [];
    for (let j = 0; j < pts.length - 1; j++) {
      const p0 = pts[j];
      const p1 = pts[j + 1];
      smoothed.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25]);
      smoothed.push([p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]);
    }
    if (closed && smoothed.length > 0) smoothed.push(smoothed[0]);
    pts = smoothed;
  }
  return pts;
};

// De fyra hörn man tryckte (första trycket per hörn; det dubblerade trycket ligger 0–0,5 m bredvid i gallringslistan).
const HORN_NOENTRY: LngLat[] = [[-57.2, -225.4], [-28.2, -209.1], [-45.7, -167.1], [-66.9, -201.7]];
const HORN_GALLRING: LngLat[] = [[-133.4, -112.7], [-106.9, -90.9], [-124.7, -61.4], [-155.7, -93.2]];

describe('så blev 4 tryck 33 punkter (kodbevis för (a) dubbla tryck + (b) Chaikin)', () => {
  it('fyra hörn, varje hörn tryckt två gånger + stängning, genom den gamla smoothCoords = exakt de 33 lagrade punkterna', () => {
    const horn4 = HORN_NOENTRY;
    // (a) varje hörn kommer in två gånger (touch + emulerad mus), (b) ytan stängs med första punkten, sedan Chaikin
    const indata: LngLat[] = [...horn4.flatMap((h) => [h, h]), horn4[0]];
    expect(indata).toHaveLength(9);
    const lagrat = gammalSmoothCoords(indata, 2, true);
    expect(lagrat).toHaveLength(33);
    // sex mellanpunkter per sida på den RAKA linjen, 1:2:3:4:3:2:1 i avstånd (Chaikin på en dubblerad kant)
    const sida = lagrat.slice(0, 9);
    const steg = sida.slice(1).map((p, i) => Math.hypot(p[0] - sida[i][0], p[1] - sida[i][1]));
    const L = Math.hypot(horn4[1][0] - horn4[0][0], horn4[1][1] - horn4[0][1]);
    expect(steg.map((s) => Math.round((s / L) * 16))).toEqual([0, 1, 2, 3, 4, 3, 2, 1]);
    // …och det är samma punkter som databasen har (±0,25 = databasens avrundning till en decimal + det andra trycket på ett hörn som landade 0,1 m bredvid)
    lagrat.forEach((p, i) => {
      expect(Math.abs(p[0] - NOENTRY[i][0])).toBeLessThan(0.25);
      expect(Math.abs(p[1] - NOENTRY[i][1])).toBeLessThan(0.25);
    });
  });
  it('gallringszonen (ingen utjämning) = fyra hörn dubbelt + stängning = 9 punkter, som databasen', () => {
    expect(GALLRING).toHaveLength(9);
    // varje hörn står två gånger i rad (0–0,5 m isär = två pekarhändelser på samma tryck), sista punkten = första (stängning)
    HORN_GALLRING.forEach((h, i) => {
      for (const p of [GALLRING[i * 2], GALLRING[i * 2 + 1]]) expect(Math.hypot(p[0] - h[0], p[1] - h[1])).toBeLessThanOrEqual(0.51);
    });
    expect(GALLRING[8]).toEqual(GALLRING[0]);
  });
});

describe('före = rundad, efter = skarp, samma hörn', () => {
  it('FÖRE: ett hörn som trycks EN gång kapas av utjämningen — inget av de fyra hörnen finns kvar bland de sparade punkterna', () => {
    const h = HORN_NOENTRY;
    const fore = gammalSmoothCoords([...h, h[0]], 2, true);
    expect(fore.length).toBeGreaterThan(h.length + 1);   // 17 punkter på 4 tryck
    for (const hh of h) {
      const narmast = Math.min(...fore.map((p) => Math.hypot(p[0] - hh[0], p[1] - hh[1])));
      expect(narmast).toBeGreaterThan(1);   // hörnet är bortkapat: närmaste sparade punkt ligger över en meter därifrån
    }
  });
  it('EFTER: samma fyra tryck sparas som exakt de fyra hörnen + stängning, bit för bit', () => {
    for (const h of [HORN_NOENTRY, HORN_GALLRING]) {
      const efter = slutaRitning(h, true);
      expect(efter).toHaveLength(5);
      expect(efter.slice(0, 4)).toEqual(h);
      expect(efter[4]).toEqual(h[0]);
    }
  });
  it('EFTER: även de redan lagrade listorna (dubblerade hörn + mellanpunkter) ritas rakt — alla punkter ligger på kanten mellan två hörn, hörnen finns kvar', () => {
    for (const [lista, h] of [[NOENTRY, HORN_NOENTRY], [GALLRING, HORN_GALLRING]] as [LngLat[], LngLat[]][]) {
      const ring = [...h, h[0]];
      for (const p of lista) {
        const avstand = Math.min(...ring.slice(1).map((b, i) => {
          const a = ring[i];
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
          return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
        }));
        expect(avstand).toBeLessThan(0.6);   // ingen punkt utanför kanten → ingen kurva, bara raka segment mellan hörnen
      }
    }
  });
});

describe('tryck = exakt en punkt', () => {
  const tryck: LngLat[] = [[14.1, 56.1], [14.2, 56.1], [14.2, 56.2], [14.1, 56.2]];
  it('4 tryck på en YTA sparas som 5 punkter: de fyra hörnen exakt + första punkten sist (sluten ring)', () => {
    const sparat = slutaRitning(tryck, true);
    expect(sparat).toHaveLength(5);
    expect(sparat).toEqual([...tryck, tryck[0]]);
  });
  it('4 tryck på en LINJE sparas som exakt 4 punkter', () => {
    expect(slutaRitning(tryck, false)).toEqual(tryck);
  });
  it('stänger inte en ring som redan är sluten (frihandsdrag som snäppte till start)', () => {
    const sluten: LngLat[] = [...tryck, tryck[0]];
    expect(slutaRitning(sluten, true)).toEqual(sluten);
  });
  it('en dubbel händelse på samma plats blir EN punkt (säkerhetsnät)', () => {
    expect(slutaRitning([tryck[0], tryck[0], tryck[1], tryck[1], tryck[2]], false)).toEqual([tryck[0], tryck[1], tryck[2]]);
  });
});

describe('dubbla pekarhändelser', () => {
  it('musen som webbläsaren emulerar efter ett touch-tryck ignoreras, en riktig mus utan föregående touch räknas', () => {
    expect(arEmuleradMus(5000, 4800)).toBe(true);    // 200 ms efter touchend
    expect(arEmuleradMus(9000, 4800)).toBe(false);   // länge sedan
    expect(arEmuleradMus(5000, 0)).toBe(false);      // ingen touch har skett (skrivbord)
  });
  it('samma tryck igen (≤ 4 px, ≤ 0,8 s) är en dubblett; ett nytt hörn en bit bort eller en stund senare är det inte', () => {
    const a = { x: 100, y: 100, tid: 1000 };
    expect(arDubbeltryck(null, a)).toBe(false);
    expect(arDubbeltryck(a, { x: 101, y: 100, tid: 1050 })).toBe(true);
    expect(arDubbeltryck(a, { x: 130, y: 100, tid: 1050 })).toBe(false);   // ett annat hörn
    expect(arDubbeltryck(a, { x: 100, y: 100, tid: 2500 })).toBe(false);   // medvetet nytt tryck på samma ställe
  });
});

// Kopplingen i page.tsx (23 000 rader går inte att montera i vitest) — larmar om utjämningen eller dubbelhändelserna kommer tillbaka.
const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
describe('page.tsx: ingen utjämning av ritade markeringar, inga dubbla pekarhändelser', () => {
  it('smoothCoords / Chaikin finns inte kvar', () => {
    expect(page).not.toMatch(/smoothCoords\(/);
    expect(page).not.toMatch(/Chaikin/i);
  });
  it('alla fyra avslut (✓-knappen för yta och linje, dubbelklick, frihandsstängning) går via slutaRitning', () => {
    expect(page).toContain("from '../../lib/ritaPunkter'");
    expect((page.match(/slutaRitning\(/g) || []).length).toBeGreaterThanOrEqual(6);
  });
  it('musens mousedown/mouseup går via emulerad-mus-vakten, touch sätter tidsstämpeln', () => {
    expect(page).toContain("canvas.addEventListener('mousedown', onMouseDownRita)");
    expect(page).toContain("document.addEventListener('mouseup', onMouseUpRita)");
    expect(page).toContain("canvas.addEventListener('touchstart', onTouchStartRita, { passive: true })");
    expect(page).toContain("document.addEventListener('touchend', onTouchEndRita)");
    expect(page).not.toContain("canvas.addEventListener('mousedown', onPointerDown)");
    expect(page).not.toContain("document.addEventListener('mouseup', onPointerUp)");
    expect(page).toContain('arEmuleradMus(');
    expect(page).toContain('arDubbeltryck(');
  });
});
