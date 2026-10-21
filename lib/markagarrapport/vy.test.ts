import { describe, it, expect } from 'vitest';
import { byggRapportVy, procentSomSummerar, enkeltBrak, jamforRota, avverkadText, heltal } from './vy';
import type { MarkagarRapport } from './types';

// Husjönäs (objekt 11124938) — siffrorna ur prod 2026-10-21 och STATUS.md (Markägarrapport — verifierade siffror).
// Fördelningen är aggregate.ts:s grupper; volymerna är detalj_stock per grupp.
function husjonas(over: Partial<MarkagarRapport> = {}): MarkagarRapport {
  return {
    objekt: {
      objekt_id: '11124938', namn: 'Husjönäs 1:18 JE-G LRK -25', skogsagare: null, atgard: null,
      forsta_datum: '2026-02-16', operator: '–', maskin: '–',
    },
    oversikt: { yta_ha: null, yta_kalla: null, stammar: 1349, volym_m3sub: 678.4, virkesvarde_kr: 433163.2 },
    karta: { stammar: [] },
    tradslag: [
      { namn: 'Gran', volym_m3sub: 424.8, andel_pct: 62.6, stammar: 924, medeldiameter_cm: 25.2 },
      { namn: 'Tall', volym_m3sub: 239.4, andel_pct: 35.3, stammar: 359, medeldiameter_cm: 31.1 },
      { namn: 'Björk', volym_m3sub: 14.0, andel_pct: 2.1, stammar: 65, medeldiameter_cm: 20.1 },
      { namn: 'Övr löv', volym_m3sub: 0.1, andel_pct: 0, stammar: 1, medeldiameter_cm: 13 },
    ],
    rotrota: {
      stammar_med_rot: 235, bmav_count: 207, avkap_count: 28, grade9_count: 0,
      gran_stammar: 924, gran_med_rot: 235, pct_av_gran: (235 / 924) * 100,
      rotpaverkad_volym_m3: 0, rotpaverkad_pct: 0, vardeforlust_kr: -26382, vardeforlust_pct: 0, rotandel_pct: 0,
    },
    avkap_skicklighet: {
      totalt: 28, lyckade: 23, raddat_kr: 2597.4, raddad_volym_m3: 0,
      utfall: { lyckad: 23, misslyckad: 0, avkap_igen: 0, ovrigt: 5 },
    },
    fordelning: [
      { grupp: 'Timmer', volym_m3sub: 378.8, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
      { grupp: 'Kubb', volym_m3sub: 138.6, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
      { grupp: 'Massa', volym_m3sub: 146.8, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
      { grupp: 'Energi', volym_m3sub: 12.4, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
      { grupp: 'Övrigt', volym_m3sub: 1.8, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
    ],
    timmer_top2: [],
    stubbar: { behandlade: 0, totalt: 0 },
    sortiment: [],
    ...over,
  };
}

describe('Husjönäs — facit', () => {
  const vy = byggRapportVy(husjonas());

  it('svaret först: värdet, volymen och antalet träd', () => {
    expect(vy.huvud).toBe('Husjönäs 1:18 JE-G LRK -25 · avverkad i februari 2026');
    expect(vy.vardeFraga).toBe('Virket från skogen är värt');
    expect(vy.svar).toBe('433 163 kr');
    expect(vy.underSvar).toBe('678 kubikmeter virke från 1 349 träd');
  });

  it('virket: fyra grupper mörkast först, procenten summerar till 100', () => {
    const r = vy.virket!.rader;
    expect(r.map(x => x.namn)).toEqual(['Timmer', 'Kubb', 'Massaved', 'Övrigt']);
    expect(r.map(x => x.hoger)).toEqual(['379 m³', '139 m³', '147 m³', '14 m³']);
    expect(r.map(x => x.hogerUnder)).toEqual(['56 %', '20 %', '22 %', '2 %']);
    expect(r.map(x => x.under)).toEqual(['blir plankor och brädor', 'blir korta brädor', 'blir papper', 'blir ved och flis']);
  });

  it('träden: räknat i träd, björk och övrigt löv ihop', () => {
    const r = vy.trad!.rader;
    expect(r.map(x => `${x.namn}|${x.hoger}|${x.under}`)).toEqual([
      'Gran|924 träd|25 cm tjock i snitt',
      'Tall|359 träd|31 cm tjock i snitt',
      'Björk och annat löv|66 träd|20 cm tjock i snitt',
    ]);
  });

  it('granarna: 3 av 4 friska, vanligt (25,4 % räknas som 25)', () => {
    const g = vy.granar!;
    expect(g.bild).toEqual({ friska: 3, rotade: 1 });
    expect(g.rubrik).toBe('3 av 4 granar var friska');
    expect(g.text).toBe('1 av 4 var rutten i roten. Det är vanligt i Sverige.');
    expect(g.rader.map(x => `${x.namn}|${x.hoger}`)).toEqual(['Rötan kostade|−26 382 kr', 'Föraren sparade|+2 597 kr']);
  });
});

describe('procentSomSummerar', () => {
  it('summerar alltid till 100', () => {
    for (const v of [[1, 1, 1], [56, 20, 22, 2], [378.8, 138.6, 146.8, 14.2], [10, 0, 0], [3, 3, 3, 1]]) {
      expect(procentSomSummerar(v).reduce((s, x) => s + x, 0)).toBe(100);
    }
  });
  it('nollsumma ger nollor', () => {
    expect(procentSomSummerar([0, 0])).toEqual([0, 0]);
  });
});

describe('enkeltBrak', () => {
  it('väljer minsta nämnare inom 3 procentenheter', () => {
    expect(enkeltBrak(0.746)).toEqual({ friska: 3, av: 4 });
    expect(enkeltBrak(0.5)).toEqual({ friska: 1, av: 2 });
    expect(enkeltBrak(0.9)).toEqual({ friska: 9, av: 10 });
  });
  it('ingen röta eller bara röta är inget bråk', () => {
    expect(enkeltBrak(1)).toBeNull();
    expect(enkeltBrak(0)).toBeNull();
  });
  it('nästan alla friska ger aldrig "alla friska" som bild', () => {
    // 0,99: 2/2, 3/3 … skulle betyda inga rötade; inget bråk passar → procent i stället.
    expect(enkeltBrak(0.99)).toBeNull();
  });
});

describe('jamforRota', () => {
  it('jämför på den avrundade procenten', () => {
    expect(jamforRota(25.4)).toBe('Det är vanligt i Sverige.');
    expect(jamforRota(25.5)).toBe('Det är mer än vanligt i Sverige.');
    expect(jamforRota(14.6)).toBe('Det är vanligt i Sverige.');
    expect(jamforRota(14.4)).toBe('Det är mindre än vanligt i Sverige.');
  });
});

describe('fallen runt', () => {
  it('ingen röta: alla granar friska, inga rader', () => {
    const d = husjonas();
    d.rotrota = { ...d.rotrota, gran_med_rot: 0, pct_av_gran: 0, vardeforlust_kr: 0 };
    d.avkap_skicklighet = { ...d.avkap_skicklighet, totalt: 0, raddat_kr: 0 };
    const g = byggRapportVy(d).granar!;
    expect(g.rubrik).toBe('Alla granar var friska');
    expect(g.bild).toBeNull();
    expect(g.rader).toEqual([]);
  });

  it('inga granar: ingen granfråga alls', () => {
    const d = husjonas();
    d.rotrota = { ...d.rotrota, gran_stammar: 0, gran_med_rot: 0 };
    expect(byggRapportVy(d).granar).toBeNull();
  });

  it('nästan alla friska: procent i stället för bild', () => {
    const d = husjonas();
    d.rotrota = { ...d.rotrota, gran_stammar: 1000, gran_med_rot: 10 };
    const g = byggRapportVy(d).granar!;
    expect(g.bild).toBeNull();
    expect(g.rubrik).toBe('99 % av granarna var friska');
    expect(g.text).toBe('1 % var rutten i roten. Det är mindre än vanligt i Sverige.');
  });

  it('en grupp med 0 m³ visas inte', () => {
    const d = husjonas();
    d.fordelning = d.fordelning.filter(f => f.grupp !== 'Kubb');
    const r = byggRapportVy(d).virket!.rader;
    expect(r.map(x => x.namn)).toEqual(['Timmer', 'Massaved', 'Övrigt']);
    expect(r.reduce((s, x) => s + Number(x.hogerUnder!.replace(' %', '')), 0)).toBe(100);
  });

  it('inget pris: volymen är svaret och det står varför', () => {
    const d = husjonas();
    d.oversikt = { ...d.oversikt, virkesvarde_kr: 0 };
    const vy = byggRapportVy(d);
    expect(vy.vardeFraga).toBeNull();
    expect(vy.svar).toBe('678 kubikmeter virke');
    expect(vy.underSvar).toMatch(/värdet saknas/);
  });

  it('saknat datum: bara namnet i huvudet', () => {
    const d = husjonas();
    d.objekt = { ...d.objekt, forsta_datum: null };
    expect(byggRapportVy(d).huvud).toBe('Husjönäs 1:18 JE-G LRK -25');
  });

  it('bara björk eller bara annat löv får rätt namn', () => {
    const d = husjonas();
    d.tradslag = d.tradslag.filter(t => t.namn !== 'Björk');
    expect(byggRapportVy(d).trad!.rader.map(r => r.namn)).toContain('Annat löv');
    const e = husjonas();
    e.tradslag = e.tradslag.filter(t => t.namn !== 'Övr löv');
    expect(byggRapportVy(e).trad!.rader.map(r => r.namn)).toContain('Björk');
  });
});

describe('format', () => {
  it('heltal med mellanslag och riktigt minustecken', () => {
    expect(heltal(433163.2)).toBe('433 163');
    expect(heltal(-26382)).toBe('−26 382');
    expect(heltal(0.4)).toBe('0');
  });
  it('avverkad i månad år', () => {
    expect(avverkadText('2026-10-07')).toBe('avverkad i oktober 2026');
    expect(avverkadText('nonsens')).toBeNull();
  });
});
