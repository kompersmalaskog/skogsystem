import { describe, it, expect } from 'vitest';
import fixtur from './__fixtures__/hyttspar_utjamning_2026-10-08.json';
import {
  jamnaSpar, hyttsparRitadeLinjer, tabortSpikar, glesaPunkter, tatSteg, glidandeMedel, hittaSvangar, douglasPeucker,
  SPAR_MIN_STEG_M, SPAR_SPIK_STEG_M, SPAR_TOLERANS_M, SPAR_SVANG_GRADER, type Koord,
} from './sparJamning';
import { hyttsparTillLinjer } from './hyttspar';

// HYTTSPÅRENS RITNING UTJÄMNAD (bara ritningen). Skördarnas spår är hackiga: maskinen kör sakta (1–3 m steg) eller står still medan den avverkar, och
// GPS-bruset (1–2 m) är lika stort som stegen. Fixturen är DE RIKTIGA spåren (prod 2026-10-08): Trestensdal (Oskar, R64428) och Bågskyttebanan (Stefan).

type XY = [number, number];
const LAT0 = 56.5, M = 111320, K = Math.cos((LAT0 * Math.PI) / 180) * M;
const till = (x: number, y: number): Koord => [14.7 + x / K, LAT0 + y / M];
const fran = (c: Koord): XY => [(c[0] - 14.7) * K, (c[1] - LAT0) * M];
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ang = (a: number[], b: number[], c: number[]) => { const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]); let v = Math.abs(a2 - a1) * 180 / Math.PI; if (v > 180) v = 360 - v; return v; };
function slump(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; }; }
function avstandTillLinje(p: number[], l: number[][]): number {
  let best = Infinity;
  for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i]; const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; best = Math.min(best, dist(p, [a[0] + t * dx, a[1] + t * dy])); }
  return best;
}
const langd = (l: number[][]) => { let s = 0; for (let i = 1; i < l.length; i++) s += dist(l[i - 1], l[i]); return s; };
/** Summa av absoluta riktningsändringar per 100 m — hur hackigt spåret är. */
function hackighet(l: number[][]): number { let s = 0; for (let i = 1; i < l.length - 1; i++) s += ang(l[i - 1], l[i], l[i + 1]); const L = langd(l); return L ? (s / L) * 100 : 0; }

describe('tabortSpikar: enskild punkt där GPS:en hoppade', () => {
  it('Stefans riktiga spik: steg 14 m ut och 14 m tillbaka där grannarna ligger 0,4 m isär → bort', () => {
    const p: XY[] = [[0, 0], [1, 0], [1.5, 14], [1.4, 0.1], [2, 0]];
    expect(tabortSpikar(p).length).toBe(4);
    expect(tabortSpikar(p).some((q) => q[1] === 14)).toBe(false);
  });
  it('i rörelse (3 m steg) ligger grannarna 6 m isär men spiken 14 m ut → ändå en spik', () => {
    const p: XY[] = []; for (let i = 0; i < 8; i++) p.push([i * 3, 0]); p[4] = [12, 14];
    expect(tabortSpikar(p).length).toBe(7);
  });
  it('en riktig tvär sväng (grannarna LÅNGT isär) är ingen spik', () => {
    const p: XY[] = [[0, 0], [10, 0], [20, 10], [30, 20]];
    expect(tabortSpikar(p).length).toBe(4);
  });
  it('steg under 8 m räknas aldrig som spik (vanligt GPS-brus)', () => {
    const p: XY[] = [[0, 0], [1, 0], [1, 6], [1.2, 0.2], [2, 0]];
    expect(SPAR_SPIK_STEG_M).toBe(8);
    expect(tabortSpikar(p).length).toBe(5);
  });
  it('bara EN i följd: två avvikande punkter bredvid varandra är ingen enskild spik', () => {
    const p: XY[] = [[0, 0], [1, 0], [1, 14], [1.5, 14], [2, 0], [3, 0]];
    expect(tabortSpikar(p).length).toBe(6);
  });
  it('ändpunkterna tas aldrig bort; kortare än 3 punkter oförändrat', () => {
    const p: XY[] = [[0, 0], [100, 0], [0.2, 0]];
    const r = tabortSpikar(p); expect(r[0]).toEqual([0, 0]); expect(r[r.length - 1]).toEqual([0.2, 0]);
    expect(tabortSpikar([[0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
  });
});

describe('glesaPunkter: hoppa över punkter närmare än 4 m från senast RITADE punkt', () => {
  it('mäts mot senast behållna — inte mot föregående punkt (2 m-steg ger varannan punkt, inte alla)', () => {
    const p: XY[] = []; for (let i = 0; i <= 10; i++) p.push([i * 2, 0]);
    const r = glesaPunkter(p);
    expect(r.map((q) => q[0])).toEqual([0, 4, 8, 12, 16, 20]);
    expect(SPAR_MIN_STEG_M).toBe(4);
  });
  it('en punkt som ligger precis 3,9 m från senast ritade hoppas över, 4,0 m behålls', () => {
    expect(glesaPunkter([[0, 0], [3.9, 0], [10, 0]]).length).toBe(2);
    expect(glesaPunkter([[0, 0], [4, 0], [10, 0]]).length).toBe(3);
  });
  it('sista punkten behålls ALLTID — linjen når maskinen (live) även när den ligger < 4 m från senast ritade', () => {
    const r = glesaPunkter([[0, 0], [10, 0], [11, 0]]);
    expect(r[r.length - 1]).toEqual([11, 0]);
  });
  it('en maskin som står still: tusen punkter inom 2 m blir start + slut', () => {
    const s = slump(3); const p: XY[] = []; for (let i = 0; i < 1000; i++) p.push([s() * 3, s() * 3]);
    expect(glesaPunkter(p).length).toBeLessThanOrEqual(3);
  });
});

describe('tatSteg: inget steg längre än 4 m (de sparade punkterna är RDP-gallrade → glesa längs raka vägar)', () => {
  it('60 m rakt blir 15 steg, punkterna ligger på linjen och ändpunkterna är orörda', () => {
    const r = tatSteg([[0, 0], [60, 0]]);
    expect(r.length).toBe(16);
    expect(r.every((q) => q[1] === 0)).toBe(true);
    for (let i = 1; i < r.length; i++) expect(dist(r[i - 1], r[i])).toBeLessThanOrEqual(4.0000001);
    expect(r[0]).toEqual([0, 0]); expect(r[15]).toEqual([60, 0]);
  });
  it('korta steg lämnas som de är', () => { expect(tatSteg([[0, 0], [3, 0], [6, 0]]).length).toBe(3); });
});

describe('glidandeMedel: över 5 punkter, symmetriskt, ändpunkterna rörs aldrig', () => {
  it('en rak linje med brus blir rakare; första och sista punkten är oförändrade', () => {
    const s = slump(11); const p: XY[] = []; for (let i = 0; i <= 30; i++) p.push([i * 4, s() * 3]);
    const r = glidandeMedel(p, 5);
    expect(r[0]).toEqual(p[0]); expect(r[30]).toEqual(p[30]);
    const sd = (a: XY[]) => Math.sqrt(a.reduce((t, q) => t + q[1] * q[1], 0) / a.length);
    expect(sd(r)).toBeLessThan(sd(p) * 0.6);
  });
  it('en rak linje utan brus ändras inte', () => {
    const p: XY[] = []; for (let i = 0; i <= 10; i++) p.push([i * 4, 7]);
    for (const q of glidandeMedel(p, 5)) expect(q[1]).toBeCloseTo(7, 9);
  });
  it('låsta punkter (svängar) flyttas aldrig och medelvärdet korsar dem inte', () => {
    const p: XY[] = []; for (let i = 0; i <= 5; i++) p.push([i * 4, 0]); for (let i = 1; i <= 5; i++) p.push([20, i * 4]);
    const fri = glidandeMedel(p, 5);
    const las = glidandeMedel(p, 5, new Set([5]));
    expect(las[5]).toEqual([20, 0]);                   // låst hörn orört
    expect(dist(fri[5], [20, 0])).toBeGreaterThan(1);  // utan lås rundas hörnet av
    expect(dist(las[4], [16, 0])).toBeLessThan(dist(fri[4], [16, 0]) + 1e-9);   // grannen bredvid låset påverkas inte av andra sidan
  });
});

describe('hittaSvangar: riktiga svängar över 20° — inte brus', () => {
  const tat = (grader: number, ben = 60, steg = 4): XY[] => { const a = (grader * Math.PI) / 180; const p: XY[] = []; for (let s = 0; s <= ben; s += steg) p.push([s, 0]); for (let s = steg; s <= ben; s += steg) p.push([ben + s * Math.cos(a), s * Math.sin(a)]); return p; };
  it('en 90°-sväng hittas EN gång, i hörnet', () => {
    const p = tat(90); const r = hittaSvangar(p);
    expect(r.length).toBe(1);
    expect(dist(p[r[0]], [60, 0])).toBeLessThan(0.01);
  });
  it('gränsen går vid 20°: 15° hittas inte, 25° hittas', () => {
    expect(SPAR_SVANG_GRADER).toBe(20);
    expect(hittaSvangar(tat(15)).length).toBe(0);
    expect(hittaSvangar(tat(25)).length).toBe(1);
  });
  it('en rak väg ger inga svängar', () => { expect(hittaSvangar(tat(0)).length).toBe(0); });
  it('en maskin som står i princip still (brusmoln, ingen punkt 14 m bort) ger INGA svängar — bruset räknas inte', () => {
    const s = slump(5); const p: XY[] = []; for (let i = 0; i < 200; i++) p.push([s() * 6, s() * 6]);
    expect(hittaSvangar(p).length).toBe(0);
  });
  it('en sväng nära ändarna där basen inte räcker ger ingen sväng (ingen halvmätt vinkel)', () => {
    expect(hittaSvangar([[0, 0], [5, 0], [5, 5], [5, 10]]).length).toBe(0);
  });
});

describe('douglasPeucker: 1,5 m tolerans', () => {
  it('punkter närmare än toleransen från linjen tas bort, ändpunkterna behålls', () => {
    const p: XY[] = [[0, 0], [10, 1], [20, -1], [30, 0.5], [40, 0]];
    expect(douglasPeucker(p, 1.5)).toEqual([[0, 0], [40, 0]]);
    expect(SPAR_TOLERANS_M).toBe(1.5);
  });
  it('en punkt längre bort än toleransen behålls', () => {
    expect(douglasPeucker([[0, 0], [20, 3], [40, 0]], 1.5).length).toBe(3);
  });
  it('samma start och slut (sluten loop) ger inget NaN', () => {
    const r = douglasPeucker([[0, 0], [10, 10], [0, 0]], 1.5);
    expect(r.flat().every(Number.isFinite)).toBe(true);
  });
});

describe('jamnaSpar: hela kedjan på syntetiska fall', () => {
  it('rak stickväg 150 m med ±1,5 m brus och 2,5 m steg → några få punkter, sidoavvikelse under rådatans', () => {
    const s = slump(21); const l: Koord[] = []; for (let x = 0; x <= 150; x += 2.5) l.push(till(x + s() * 3, s() * 3));
    const r = jamnaSpar(l).map(fran);
    expect(r.length).toBeLessThanOrEqual(5);
    expect(Math.max(...r.map((q) => Math.abs(q[1])))).toBeLessThan(1.5);
  });
  it('gles hörn-spår (RDP-gallrat: bara hörn och ändar) → hörnet ligger kvar EXAKT och vinkeln är 90° — inget skärs av', () => {
    const r = jamnaSpar([till(0, 0), till(60, 0), till(60, 60)]).map(fran);
    expect(r.length).toBe(3);
    expect(dist(r[1], [60, 0])).toBeLessThan(0.05);
    expect(ang(r[0], r[1], r[2])).toBeCloseTo(90, 0);
  });
  it('tätt L med brus: sväng bevaras (hörnet inom 3,5 m, benen inom 2,5 m) — och blir inte en rund båge', () => {
    const s = slump(31); const l: Koord[] = [];
    for (let x = 0; x <= 60; x += 3) l.push(till(x + s() * 3, s() * 3)); for (let y = 3; y <= 60; y += 3) l.push(till(60 + s() * 3, y + s() * 3));
    const r = jamnaSpar(l).map(fran);
    expect(Math.min(...r.map((q) => dist(q, [60, 0])))).toBeLessThan(3.5);
    expect(Math.max(...r.map((q) => avstandTillLinje(q, [[0, 0], [60, 0], [60, 60]])))).toBeLessThan(2.5);
    expect(r.length).toBeLessThanOrEqual(8);
  });
  it('svängar över ~20° behålls, svängar under rätas ut (40 m ben)', () => {
    const maxV = (grader: number) => { const a = (grader * Math.PI) / 180; const l: Koord[] = []; for (let s = 0; s <= 40; s += 3) l.push(till(s, 0)); for (let s = 3; s <= 40; s += 3) l.push(till(40 + s * Math.cos(a), s * Math.sin(a))); const r = jamnaSpar(l).map(fran); let m = 0; for (let i = 1; i < r.length - 1; i++) m = Math.max(m, ang(r[i - 1], r[i], r[i + 1])); return m; };
    expect(maxV(10)).toBeLessThan(11);   // för lite för att vara en sväng — följer dock datan (ingen konstgjord rakning av riktig geometri)
    expect(maxV(30)).toBeGreaterThan(24);
    expect(maxV(45)).toBeGreaterThan(38);
    expect(maxV(90)).toBeGreaterThan(65);   // medelvärdet rundar hörnets spets något (axlar) men det är fortfarande ett tydligt hörn — vinkeln är aldrig platt
  });
  it('en spik (en punkt 14 m utanför en gående linje) är borta', () => {
    const s = slump(41); const l: Koord[] = []; for (let x = 0; x <= 60; x += 3) l.push(till(x, s())); l[10] = till(30, 14);
    expect(Math.max(...jamnaSpar(l).map(fran).map((q) => Math.abs(q[1])))).toBeLessThan(1);
  });
  it('första och sista punkten är EXAKT oförändrade (linjen når maskinen, även live)', () => {
    const s = slump(51); const l: Koord[] = []; for (let x = 0; x <= 80; x += 2) l.push(till(x, s() * 3));
    const r = jamnaSpar(l);
    expect(r[0]).toEqual(l[0]); expect(r[r.length - 1]).toEqual(l[l.length - 1]);
  });
  it('färre än 3 punkter lämnas oförändrade; tom linje och ogiltiga koordinater ger inget NaN', () => {
    const tva: Koord[] = [till(0, 0), till(10, 0)];
    expect(jamnaSpar(tva)).toEqual(tva);
    expect(jamnaSpar([])).toEqual([]);
    const r = jamnaSpar([till(0, 0), [NaN, 5], till(10, 0), till(20, 0), [Infinity, 1] as Koord, till(30, 0)]);
    expect(r.flat().every(Number.isFinite)).toBe(true);
    expect(r.length).toBeGreaterThanOrEqual(2);
  });
  it('deterministisk: samma indata ger exakt samma utdata', () => {
    const s = slump(61); const l: Koord[] = []; for (let x = 0; x <= 100; x += 2.5) l.push(till(x, s() * 3));
    expect(jamnaSpar(l)).toEqual(jamnaSpar(l));
  });
  it('rör inte indata (ingen mutation)', () => {
    const l: Koord[] = [till(0, 0), till(5, 1), till(10, -1), till(15, 0), till(40, 3)];
    const kopia = JSON.stringify(l); jamnaSpar(l); expect(JSON.stringify(l)).toBe(kopia);
  });
});

describe('DE RIKTIGA SPÅREN (prod 2026-10-08): Trestensdal (Oskar) och Bågskyttebanan (Stefan)', () => {
  const punkter = (a: number[][]) => a.map(([lat, lng], i) => ({ lat, lng, tid: new Date(1_700_000_000_000 + i * 30_000).toISOString() }));
  const SPAR: [string, number[][]][] = [['Trestensdal idag', fixtur.trestensdal_idag], ['Trestensdal igår', fixtur.trestensdal_igar], ['Bågskyttebanan igår', fixtur.bagskytte_igar]];

  for (const [namn, data] of SPAR) {
    describe(namn, () => {
      const raw = hyttsparTillLinjer(punkter(data)) as Koord[][];
      const ritat = hyttsparRitadeLinjer(punkter(data));
      const rawXY = raw.map((l) => l.map(fran)), ritXY = ritat.map((l) => l.map(fran));

      it('samma antal segment som förut (200 m-regeln för äkta glapp är oförändrad)', () => { expect(ritat.length).toBe(raw.length); });
      it('mycket färre punkter (≤ 30 %) — brusmolnet blir en linje', () => {
        const a = raw.flat().length, b = ritat.flat().length;
        expect(b).toBeLessThanOrEqual(a * 0.3);
      });
      it('MINDRE hackigt: riktningsändringarna per 100 m minskar med minst 55 %', () => {
        const h = (l: number[][][]) => { let s = 0, L = 0; for (const x of l) { for (let i = 1; i < x.length - 1; i++) s += ang(x[i - 1], x[i], x[i + 1]); L += langd(x); } return L ? (s / L) * 100 : 0; };
        expect(h(ritXY)).toBeLessThan(h(rawXY) * 0.45);
      });
      it('troget: ingen rådatapunkt ligger mer än 8 m från den utjämnade linjen (mätt 5,5–6,6 m = GPS-bruset självt)', () => {
        let max = 0; for (const l of rawXY) for (const p of l) max = Math.max(max, Math.min(...ritXY.map((r) => avstandTillLinje(p, r))));
        expect(max).toBeLessThan(8);
      });
      it('första och sista punkten i varje segment är EXAKT oförändrade', () => {
        raw.forEach((l, i) => { expect(ritat[i][0]).toEqual(l[0]); expect(ritat[i][ritat[i].length - 1]).toEqual(l[l.length - 1]); });
      });
      it('inga NaN/Infinity, och inget segment har färre än 2 punkter', () => {
        expect(ritat.flat(2).every(Number.isFinite)).toBe(true);
        expect(ritat.every((l) => l.length >= 2)).toBe(true);
      });
    });
  }

  it('Stefans spik (rådatapunkt 513: 14,1 m ut, 13,9 m tillbaka, grannarna 0,4 m isär) tas bort — och bara den', () => {
    const p = (hyttsparTillLinjer(punkter(fixtur.bagskytte_igar)) as Koord[][])[0].map(fran);
    expect(dist(p[512], p[514])).toBeLessThan(1);
    expect(dist(p[512], p[513])).toBeGreaterThan(13);
    const efter = tabortSpikar(p);
    expect(efter.includes(p[513])).toBe(false);                 // spiken är borta…
    expect(efter.includes(p[512]) && efter.includes(p[514])).toBe(true);   // …grannarna kvar
    expect(p.length - efter.length).toBeLessThanOrEqual(3);     // och inget annat plockas bort i onödan (mätt: 1)
  });

  it('ett äkta glapp (> 200 m mellan två punkter, t.ex. app stängd medan maskinen flyttades) ger fortfarande separata linjer — ingen rak brygga', () => {
    const a = punkter(fixtur.trestensdal_idag).map((q) => ({ ...q }));
    const b = punkter(fixtur.trestensdal_igar).map((q) => ({ ...q, lat: q.lat + 0.06 }));   // 6,7 km norrut
    const rad = [...a, ...b];
    const raw = hyttsparTillLinjer(rad) as Koord[][]; const r = hyttsparRitadeLinjer(rad);
    expect(raw.length).toBe(2);
    expect(r.length).toBe(2);
    r.forEach((l, i) => { expect(l[0]).toEqual(raw[i][0]); expect(l[l.length - 1]).toEqual(raw[i][raw[i].length - 1]); });
  });

  it('SPARAD DATA RÖRS INTE: utjämningen läser rådata men muterar den aldrig', () => {
    const p = punkter(fixtur.trestensdal_idag); const fore = JSON.stringify(p);
    hyttsparRitadeLinjer(p);
    expect(JSON.stringify(p)).toBe(fore);
  });

  it('kostnad: hela dagens spår (500+ punkter) utjämnas på under 25 ms även i en trög hytt-webbläsare (mätt ~0,5 ms) — räknas om vid varje ny punkt live', () => {
    const p = punkter(fixtur.bagskytte_igar);
    const t0 = performance.now(); for (let i = 0; i < 20; i++) hyttsparRitadeLinjer(p); const per = (performance.now() - t0) / 20;
    expect(per).toBeLessThan(25);
  });
});
