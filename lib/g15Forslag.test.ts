import { describe, expect, it } from 'vitest';
import { beraknaG15Forslag, forslagKalla, fmtMs, laserModell, percentil, prestation, prestationVarning, snittTypOrd, type RollForslag, type UtfallRad } from './g15Forslag';
import { UTFALL_2026_10_17 } from './__fixtures__/utfall_2026-10-17';

const ok = <T extends { ok: boolean }>(r: T) => { expect(r.ok).toBe(true); return (r as any).forslag as RollForslag; };

describe('percentil', () => {
  it('linjär interpolation, som i utredningen', () => {
    expect(percentil([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentil([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 6);
    expect(percentil([10], 0.75)).toBe(10);
  });
});

describe('Skälviken (slutavverkning, 1 734 m³, medelstam 0,8) mot riktigt utfall', () => {
  const f = beraknaG15Forslag({ typ: 'slutavverkning', volym: 1734, medelstam: 0.8 }, UTFALL_2026_10_17);
  it('skördare: trakter med liknande medelstam (±25 %), ~42 G15 och ~42 m³fub/G15', () => {
    const s = ok(f.skordare);
    expect(s.metod).toBe('medelstam');
    expect(s.antal).toBe(7);
    expect(s.g15).toBeGreaterThanOrEqual(41); expect(s.g15).toBeLessThanOrEqual(43);
    expect(s.m3PerG15).toBeGreaterThan(40); expect(s.m3PerG15).toBeLessThan(43);
    expect(s.medelstamSpann!.lag).toBeGreaterThan(0.63); expect(s.medelstamSpann!.hog).toBeLessThan(1.01);
  });
  it('skördare: intervallet är uppmätt prediktionsfel (leave-one-out) — bredare än spridningen bland de sju jämförbara', () => {
    const s = ok(f.skordare);
    expect(s.intervall).not.toBeNull();
    expect(s.intervall!.lag).toBeLessThan(s.g15); expect(s.intervall!.hog).toBeGreaterThan(s.g15);
    // jämförbarnas egen 25–75 gav 41–44; det uppmätta felet (0,90–1,07 faktisk/förutsagd) ger ett bredare spann ≈ 39–46
    expect(s.intervall!.hog - s.intervall!.lag).toBeGreaterThanOrEqual(5);
  });
  it('skotare: snitt över alla slutavverkningar (medelstam används inte), ~77 G15', () => {
    const s = ok(f.skotare);
    expect(s.metod).toBe('snitt-typ');
    expect(s.antal).toBe(22);                               // Bågskyttebanan och Kroksjömåla uteslutna (volym 0,48 / 0,37 av objektets)
    expect(s.g15).toBeGreaterThanOrEqual(74); expect(s.g15).toBeLessThanOrEqual(80);
    expect(s.intervall).not.toBeNull();
    expect(s.intervall!.hog - s.intervall!.lag).toBeGreaterThan(s.intervall!.hog - s.g15);
  });
});

describe('uteslutning: skördad volym 0,7–1,4 av objektets', () => {
  it('Kroksjömåla (0,37) och Bågskyttebanan (0,48) räknas inte med; trakter utan objektvolym behålls', () => {
    const utan = beraknaG15Forslag({ typ: 'slutavverkning', volym: 1000, medelstam: null }, UTFALL_2026_10_17);
    expect(ok(utan.skordare).antal).toBe(27);               // 30 − Bågskytte − Kroksjö − Bjällerhult (2,06)
    const med = beraknaG15Forslag({ typ: 'slutavverkning', volym: 1000, medelstam: null }, UTFALL_2026_10_17.filter((r) => !['Kroksjömåla', 'Bågskytte', 'Bjällerhult'].includes(r.namn)));
    expect(ok(med.skordare).antal).toBe(27);
    expect(ok(med.skordare).g15).toBe(ok(utan.skordare).g15);
  });
});

describe('medelstam saknas → snitt över alla, och det sägs', () => {
  const f = beraknaG15Forslag({ typ: 'slutavverkning', volym: 1734, medelstam: null }, UTFALL_2026_10_17);
  it('metod snitt-medelstam-saknas, ~47 G15, texten bär orsaken', () => {
    const s = ok(f.skordare);
    expect(s.metod).toBe('snitt-medelstam-saknas');
    expect(s.g15).toBeGreaterThanOrEqual(45); expect(s.g15).toBeLessThanOrEqual(49);
    expect(forslagKalla(s)).toMatch(/^Medelstam saknas – snitt över alla trakter · ur 27 slutavverkningar · troligen \d+–\d+$/);
  });
  it('snittTypOrd säger över vad snittet är räknat — kortet skriver "Snitt över alla slutavverkningar" under tabellen; med medelstam finns inget ord', () => {
    expect(snittTypOrd(ok(f.skordare))).toBe('slutavverkningar');
    expect(snittTypOrd(ok(f.skotare))).toBeNull();            // skotaren är snitt per typ ändå — medelstam hjälper den inte
    const g = beraknaG15Forslag({ typ: 'gallring', volym: 900, medelstam: null }, UTFALL_2026_10_17);
    expect(snittTypOrd(ok(g.skordare))).toBe('gallringar');
    const med = beraknaG15Forslag({ typ: 'slutavverkning', volym: 1734, medelstam: 0.8 }, UTFALL_2026_10_17);
    expect(snittTypOrd(ok(med.skordare))).toBeNull();
  });
});

describe('under 3 jämförbara → tomt, aldrig en gissning', () => {
  it('medelstam långt utanför underlaget (3,0) ger inget förslag för skördaren, men skotaren (snitt) finns', () => {
    const f = beraknaG15Forslag({ typ: 'slutavverkning', volym: 1734, medelstam: 3.0 }, UTFALL_2026_10_17);
    expect(f.skordare.ok).toBe(false);
    expect((f.skordare as any).orsak).toBe('for-fa');
    expect((f.skordare as any).text).toMatch(/Färre än 3 jämförbara trakter/);
    expect(f.skotare.ok).toBe(true);
  });
  it('exakt 2 jämförbara → tomt, exakt 3 → förslag', () => {
    const rad = (ms: number): UtfallRad => ({ typ: 'slutavverkning', volymObjekt: null, skordadM3: 100 * ms * 10, stammar: 1000, skordareG15: 20, skotareG15: null });
    const mk = (n: number) => Array.from({ length: n }, (_, i) => rad(0.5 + i * 0.01));
    expect(beraknaG15Forslag({ typ: 'slutavverkning', volym: 500, medelstam: 0.5 }, mk(2)).skordare.ok).toBe(false);
    expect(beraknaG15Forslag({ typ: 'slutavverkning', volym: 500, medelstam: 0.5 }, mk(3)).skordare.ok).toBe(true);
  });
  it('för få trakter av typen utan medelstam → tomt; typ utan underlag (grot) och saknad volym → tomt med orsak', () => {
    const f = beraknaG15Forslag({ typ: 'slutavverkning', volym: 500, medelstam: null }, UTFALL_2026_10_17.slice(0, 2));
    expect(f.skordare.ok).toBe(false);
    expect(beraknaG15Forslag({ typ: 'grot', volym: 500, medelstam: 0.3 }, UTFALL_2026_10_17).skordare.ok).toBe(false);
    const v = beraknaG15Forslag({ typ: 'slutavverkning', volym: null, medelstam: 0.5 }, UTFALL_2026_10_17);
    expect((v.skordare as any).orsak).toBe('ingen-volym');
  });
});

describe('gallring och intervall', () => {
  it('gallring har förslag för skördaren (medelstam 0,06) ur trakter av samma typ', () => {
    const f = beraknaG15Forslag({ typ: 'gallring', volym: 120, medelstam: 0.06 }, UTFALL_2026_10_17);
    const s = ok(f.skordare);
    expect(s.typ).toBe('gallring');
    expect(s.m3PerG15).toBeGreaterThan(3); expect(s.m3PerG15).toBeLessThan(9);
  });
  it('färre än 5 uppmätta fel → inget intervall, och metaraden säger det', () => {
    const rad = (n: number): UtfallRad => ({ typ: 'gallring', volymObjekt: null, skordadM3: 100 + n, stammar: 1000, skordareG15: 20, skotareG15: 20 });
    const f = beraknaG15Forslag({ typ: 'gallring', volym: 100, medelstam: null }, [rad(0), rad(1), rad(2), rad(3)]);
    const s = ok(f.skordare);
    expect(s.intervall).toBeNull();
    expect(forslagKalla(s)).toContain('spridning ej bedömd');
  });
  it('en bas som aldrig varierar ger intervallet = förslaget (felet är noll)', () => {
    const rad = (): UtfallRad => ({ typ: 'slutavverkning', volymObjekt: null, skordadM3: 400, stammar: 800, skordareG15: 10, skotareG15: 20 });
    const f = beraknaG15Forslag({ typ: 'slutavverkning', volym: 800, medelstam: null }, Array.from({ length: 6 }, rad));
    const s = ok(f.skordare);
    expect(s.g15).toBe(20);
    expect(s.intervall).toEqual({ lag: 20, hog: 20 });
  });
  it('basvägens engångstid läggs på skotarens förslag och på dess intervall — aldrig på skördarens', () => {
    const utan = beraknaG15Forslag({ typ: 'slutavverkning', volym: 1000, medelstam: 0.5 }, UTFALL_2026_10_17);
    const med = beraknaG15Forslag({ typ: 'slutavverkning', volym: 1000, medelstam: 0.5, basvagTimmar: 6 }, UTFALL_2026_10_17);
    expect(ok(med.skotare).g15).toBe(ok(utan.skotare).g15 + 6);
    expect(ok(med.skotare).intervall!.lag).toBe(ok(utan.skotare).intervall!.lag + 6);
    expect(ok(med.skordare).g15).toBe(ok(utan.skordare).g15);
  });
});

describe('texter', () => {
  it('fmtMs: decimalkomma, högst två decimaler, avslutande nolla bort', () => {
    expect(fmtMs(0.64)).toBe('0,64'); expect(fmtMs(1)).toBe('1,0'); expect(fmtMs(0.7)).toBe('0,7');
  });
  it('metarad med medelstam: "troligen 39–46 · ur 7 trakter med medelstam 0,64–1,0" (intervallet först)', () => {
    const s = ok(beraknaG15Forslag({ typ: 'slutavverkning', volym: 1734, medelstam: 0.8 }, UTFALL_2026_10_17).skordare);
    expect(forslagKalla(s)).toMatch(/^troligen \d+–\d+ · ur 7 trakter med medelstam 0,6\d–[01],\d+$/);
  });
  it('prestation: volym ÷ G15-tim, null när något saknas eller är noll', () => {
    expect(prestation(1734, 42)).toBeCloseTo(41.29, 2);
    expect(prestation(null, 42)).toBeNull(); expect(prestation(1734, 0)).toBeNull(); expect(prestation(1734, null)).toBeNull();
  });
});

describe('prestationVarning — siffran utanför liknande trakter', () => {
  const iv = { lag: 38, hog: 45 };
  it('inom intervallet (gränserna räknas som inom) → ingen varning', () => {
    for (const t of [38, 41, 45]) expect(prestationVarning(1800, t, iv)).toBeNull();
  });
  it('fler timmar → lågt, och spannet är volym / intervallets timmar', () => {
    const v = prestationVarning(1800, 60, iv)!;
    expect(v.riktning).toBe('lagt');
    expect(v.lag).toBeCloseTo(40, 5); expect(v.hog).toBeCloseTo(1800 / 38, 5);
  });
  it('färre timmar → högt', () => {
    expect(prestationVarning(1800, 30, iv)!.riktning).toBe('hogt');
  });
  it('ingen varning utan förslag/intervall, utan volym eller utan tim att räkna på', () => {
    expect(prestationVarning(1800, 60, null)).toBeNull();
    expect(prestationVarning(1800, 60, undefined)).toBeNull();
    expect(prestationVarning(null, 60, iv)).toBeNull();
    expect(prestationVarning(1800, null, iv)).toBeNull();
    expect(prestationVarning(1800, 0, iv)).toBeNull();
    expect(prestationVarning(1800, 60, { lag: 0, hog: 0 })).toBeNull();
  });
});

describe('medelstam ur laserskanningen (metod laser)', () => {
  // Elva gallringar ur prod 2026-11-17: laserns medeldiameter (cm) och uppmätt medelstam. Takten följer medelstammen (≈ 80 × medelstam m³/G15h).
  const PAR: [number, number][] = [[8.4, 0.032], [10.8, 0.032], [13.1, 0.037], [17.9, 0.044], [12.4, 0.049], [15, 0.052], [21.9, 0.057], [13.9, 0.057], [17.2, 0.069], [21.4, 0.093], [24, 0.116]];
  const rader: UtfallRad[] = PAR.map(([dia, ms], i) => ({ typ: 'gallring', volymObjekt: null, skordadM3: 200, stammar: Math.round(200 / ms), skordareG15: 200 / (80 * ms), skotareG15: 30, objektId: `o${i}`, laserDiaCm: dia }));

  it('laserModell: stiger med grovleken och ligger rimligt (13 cm ≈ 0,04–0,06, 22 cm ≈ 0,07–0,11)', () => {
    const m = laserModell(PAR.map(([dia, medelstam]) => ({ dia, medelstam })))!;
    expect(m(13)).toBeGreaterThan(0.04); expect(m(13)).toBeLessThan(0.06);
    expect(m(22)).toBeGreaterThan(0.07); expect(m(22)).toBeLessThan(0.11);
    expect(m(22)).toBeGreaterThan(m(13));
  });
  it('för få par, eller ett samband som inte stiger: ingen modell', () => {
    expect(laserModell(PAR.slice(0, 4).map(([dia, medelstam]) => ({ dia, medelstam })))).toBeNull();
    expect(laserModell([[10, 0.1], [12, 0.09], [14, 0.08], [16, 0.07], [18, 0.06]].map(([dia, medelstam]) => ({ dia, medelstam })))).toBeNull();
  });
  it('trakt utan medelstam men med laserdiameter: skördaren räknas på liknande medelstam, och det sägs', () => {
    const f = beraknaG15Forslag({ typ: 'gallring', volym: 300, medelstam: null, laserDiaCm: 9.5 }, rader);
    const s = ok(f.skordare);
    expect(s.metod).toBe('laser');
    expect(s.laserMedelstam).toBeGreaterThan(0.025); expect(s.laserMedelstam).toBeLessThan(0.04);
    expect(forslagKalla(s)).toContain('ur laserskanningen');
    // utan laserdatan: snittet över alla gallringar — ett annat tal
    const utan = ok(beraknaG15Forslag({ typ: 'gallring', volym: 300, medelstam: null }, rader).skordare);
    expect(utan.metod).toBe('snitt-medelstam-saknas');
    expect(s.g15).toBeGreaterThan(utan.g15);                     // klen skog tar längre tid än snittet
  });
  it('en angiven medelstam går alltid före lasern', () => {
    const s = ok(beraknaG15Forslag({ typ: 'gallring', volym: 300, medelstam: 0.05, laserDiaCm: 24 }, rader).skordare);
    expect(s.metod).toBe('medelstam');
    expect(s.laserMedelstam).toBeUndefined();
  });
  it('lasern ger en medelstam ingen liknande trakt har: snittet gäller som förut (aldrig "inget förslag" på grund av lasern)', () => {
    const s = ok(beraknaG15Forslag({ typ: 'gallring', volym: 300, medelstam: null, laserDiaCm: 60 }, rader).skordare);
    expect(s.metod).toBe('snitt-medelstam-saknas');
  });
  it('utan laserdata på raderna (äldre underlag): som förut', () => {
    const gamla = rader.map(({ laserDiaCm: _l, ...r }) => r);
    expect(ok(beraknaG15Forslag({ typ: 'gallring', volym: 300, medelstam: null, laserDiaCm: 14 }, gamla).skordare).metod).toBe('snitt-medelstam-saknas');
  });
});
