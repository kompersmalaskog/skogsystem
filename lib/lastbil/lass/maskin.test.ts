import { describe, expect, it } from 'vitest';
import { bedomMaskin, gpsFoljer, gpsUtesluten, skalRad, skalText, uteslutenText, type MaskinBevis } from './maskin';
import type { PosTraff } from './skotarpos';

const gps = (punkter: number, traffar: number, medianM: number) => ({ punkter, traffar, medianM });
const B = (maskin_id: string, o: Partial<MaskinBevis> = {}): MaskinBevis => ({ maskin_id, ...o });

describe('Hög — maskinens eget GPS-spår följde bilen', () => {
  it('Giant 1 sep (22+23): 8 av 8 punkter, 17 m', () => {
    const r = bedomMaskin([B('PONS', { gps: gps(8, 8, 17) }), B('R64428'), B('A130743')]);
    expect(r).toMatchObject({ forslag: 'PONS', sakerhet: 'hog', konflikt: false });
  });
  it('Giant 22 sep: 9 av 10 punkter, 23 m', () => {
    expect(bedomMaskin([B('PONS', { gps: gps(10, 9, 23) }), B('X')]).sakerhet).toBe('hog');
  });
  it('en enda GPS-punkt räcker bara om den ligger ≤ 50 m från bilen', () => {
    expect(gpsFoljer(gps(1, 1, 30))).toBe(true);
    expect(gpsFoljer(gps(1, 1, 120))).toBe(false);
  });
  it('under 60 % träffar följer inte (3 av 7)', () => {
    expect(gpsFoljer(gps(7, 3, 90))).toBe(false);
  });
  it('H8E (datorn av under transport): arbetade vid lastplatsen och startades vid lossningen = Hög', () => {
    const r = bedomMaskin([B('R64428', { ankomstM: 14, avgangM: 346 }), B('PONS', { gps: gps(5, 0, 7000) })]);
    expect(r).toMatchObject({ forslag: 'R64428', sakerhet: 'hog' });
  });
  it('bara ankomst utan avgång är INTE Hög', () => {
    const r = bedomMaskin([B('R64428', { ankomstM: 14 })]);
    expect(r.sakerhet).not.toBe('hog');
  });
  it('TVÅ maskiner som båda följt bilen = konflikt: ingen automatik (Låg), bästa som förslag', () => {
    const r = bedomMaskin([B('A', { gps: gps(5, 5, 20) }), B('B', { gps: gps(5, 5, 25) })]);
    expect(r.sakerhet).toBe('lag');
    expect(r.konflikt).toBe(true);
    expect(r.forslag).toBe('A');
  });
});

describe('Medel / Låg / Okänd', () => {
  it('Medel: skotade lastplatsens trakt före OCH lossningsplatsens trakt efter (Elefant 26, 14 sep)', () => {
    const r = bedomMaskin([
      B('A130743', { kedjaFran: { dag: '2026-09-14', trakt: 'Rävemåla AU' }, kedjaTill: { dag: '2026-09-14', trakt: 'Akelius' } }),
      B('PONS', { gps: gps(3, 0, 7000) }), B('R64428'),
    ]);
    expect(r).toMatchObject({ forslag: 'A130743', sakerhet: 'medel' });
  });
  it('Låg: ett enda stöd (bara kedja till)', () => {
    const r = bedomMaskin([B('A130743', { kedjaTill: { dag: '2026-10-13', trakt: 'Bågskyttebanan' } }), B('X')]);
    expect(r.sakerhet).toBe('lag');
    expect(r.forslag).toBe('A130743');
  });
  it('Okänd: ingenting pekar ut någon — inget förslag', () => {
    const r = bedomMaskin([B('A'), B('B')]);
    expect(r).toMatchObject({ forslag: null, sakerhet: 'okand' });
  });
  it('en maskin vars GPS låg långt bort hela lasset är utesluten och kan inte föreslås', () => {
    expect(gpsUtesluten(gps(4, 0, 9000))).toBe(true);
    const r = bedomMaskin([B('PONS', { gps: gps(4, 0, 9000), kedjaFran: { dag: '2026-09-01', trakt: 'X' }, kedjaTill: { dag: '2026-09-01', trakt: 'Y' } })]);
    expect(r.forslag).toBeNull();
    expect(r.kandidater[0].utesluten).toBe(true);
  });
  it('en påbörjad flytt i appen + senaste position vid lastplatsen ger ett förslag', () => {
    const r = bedomMaskin([B('A030353', { paborjadFlytt: true, positionNara: true, kedjaFran: { dag: '2026-08-06', trakt: 'Tjuvön' } }), B('X')]);
    expect(r.forslag).toBe('A030353');
  });
});

describe('texter', () => {
  it('skalRad ger de två bästa skälen på svenska', () => {
    const r = bedomMaskin([B('PONS', { gps: gps(8, 8, 17), kedjaFran: { dag: '2026-09-01', trakt: 'Stänkelsmåla' } })]);
    expect(skalRad(r.kandidater[0].skal)).toContain('GPS-spåret följde bilen (8 av 8 punkter, cirka 17 m)');
  });
});

// ── Skotarnas egna lossningspositioner ───────────────────────────────────────────────────────────────

const traff = (avstandM: number, kl = '12:48'): PosTraff => ({ avstandM, dag: '2026-10-22', kl, annanDag: false });

describe('skotarpositioner (skotar_lass_del)', () => {
  it('22 okt: Wisent med avgång 757 m = Troligen (Medel), Elefant 42 km bort utesluten, Giant utesluten av GPS', () => {
    const r = bedomMaskin([
      B('PONS', { gps: gps(5, 0, 43_955) }),
      B('A030353', { skotare: { avgang: traff(757) }, kedjaFran: { dag: '2026-10-19', trakt: 'Vällust' } }),
      B('A130743', { skotare: { langt: { ...traff(41_937, '11:20'), nar: 'fore' } } }),
      B('JD810E'),
    ]);
    expect(r).toMatchObject({ forslag: 'A030353', sakerhet: 'medel', konflikt: false });
    const w = r.kandidater.find(k => k.maskin_id === 'A030353')!;
    expect(w.poang).toBe(8);
    expect(w.skal[0]).toMatchObject({ kod: 'skotar_avgang', avstandM: 757 });
    expect(r.kandidater.find(k => k.maskin_id === 'A130743')).toMatchObject({ utesluten: true, poang: 0 });
    expect(r.kandidater.find(k => k.maskin_id === 'JD810E')).toMatchObject({ utesluten: false, poang: 0 });
  });
  it('avgång ≤ 300 m ger 6 p, ≤ 1 km 5 p', () => {
    expect(bedomMaskin([B('W', { skotare: { avgang: traff(250) } })]).kandidater[0].poang).toBe(6);
    expect(bedomMaskin([B('W', { skotare: { avgang: traff(757) } })]).kandidater[0].poang).toBe(5);
  });
  it('avgång OCH ankomst vid en trakt = Hög', () => {
    const r = bedomMaskin([B('W', { skotare: { avgang: traff(757), ankomst: traff(300, '17:05') } }), B('E')]);
    expect(r).toMatchObject({ forslag: 'W', sakerhet: 'hog', konflikt: false });
  });
  it('bara ankomst (utan avgång) är inte Hög', () => {
    expect(bedomMaskin([B('W', { skotare: { ankomst: traff(300) } })]).sakerhet).not.toBe('hog');
  });
  it('kvar-position utesluter, också med avgång och ankomst', () => {
    const r = bedomMaskin([B('W', { skotare: { avgang: traff(300), ankomst: traff(200), kvar: traff(400, '14:35') } }), B('E')]);
    expect(r.kandidater.find(k => k.maskin_id === 'W')).toMatchObject({ utesluten: true, poang: 0 });
    expect(r.sakerhet).not.toBe('hog');
    expect(r.forslag).toBeNull();
  });
  it('GPS som följde bilen går före en skotarposition som säger motsatsen', () => {
    const r = bedomMaskin([B('PONS', { gps: gps(8, 8, 17), skotare: { langt: { ...traff(9_000), nar: 'fore' } } })]);
    expect(r).toMatchObject({ forslag: 'PONS', sakerhet: 'hog' });
  });
  it('två maskiner med avgång + ankomst = konflikt som idag (ingen automatik)', () => {
    const sk = { avgang: traff(500), ankomst: traff(500) };
    const r = bedomMaskin([B('A', { skotare: sk }), B('B', { skotare: sk })]);
    expect(r).toMatchObject({ sakerhet: 'lag', konflikt: true });
  });
  it('en maskin med avgång som är den enda som återstår, utan marginal mot en annan = Okänd, inte gissad', () => {
    const r = bedomMaskin([B('A', { skotare: { avgang: traff(500) } }), B('B', { skotare: { avgang: traff(600) } })]);
    expect(r).toMatchObject({ forslag: null, sakerhet: 'okand' });
  });
  it('saknade positioner ger inget skäl och ingen uteslutning', () => {
    const r = bedomMaskin([B('A', { skotare: {} }), B('B')]);
    expect(r.kandidater.every(k => k.skal.length === 0 && !k.utesluten)).toBe(true);
    expect(r.sakerhet).toBe('okand');
  });
});

describe('texter för skotarpositionerna', () => {
  it('avgång, ankomst, kvar och långt borta — i klartext', () => {
    expect(skalText({ kod: 'skotar_avgang', ...traff(757) })).toBe('Sista lasset 757 m från lastplatsen kl 12:48');
    expect(skalText({ kod: 'skotar_ankomst', ...traff(1_000, '17:05') })).toBe('Första lasset 1 km från lossplatsen kl 17:05');
    expect(skalText({ kod: 'skotar_kvar', ...traff(400, '14:35') })).toBe('Skotade kvar 400 m från lastplatsen kl 14:35');
    expect(skalText({ kod: 'skotar_langt', ...traff(41_937, '11:20'), nar: 'fore' })).toBe('Skotade 42 km bort kl 11:20');
    expect(skalText({ kod: 'skotar_langt', ...traff(7_400), nar: 'under' })).toBe('Skotade 7,4 km från lastplatsen under transporten kl 12:48');
  });
  it('annan dag står med: "21 okt kl 16:40"', () => {
    expect(skalText({ kod: 'skotar_avgang', avstandM: 757, dag: '2026-10-21', kl: '16:40', annanDag: true })).toContain('21 okt kl 16:40');
  });
  it('en utesluten maskin får skälet, inte bara "Följde inte bilen"', () => {
    expect(uteslutenText([{ kod: 'skotar_langt', ...traff(41_937, '11:20'), nar: 'fore' }])).toBe('Skotade 42 km bort kl 11:20');
    expect(uteslutenText([{ kod: 'foljer_inte', medianM: 43_955 }])).toBe('Följde inte bilen');
  });
  it('skalRad (förslagsraden) visar aldrig uteslutningsskäl', () => {
    expect(skalRad([{ kod: 'skotar_kvar', ...traff(400) }, { kod: 'skotar_avgang', ...traff(300) }])).toBe('Sista lasset 300 m från lastplatsen kl 12:48');
  });
});
