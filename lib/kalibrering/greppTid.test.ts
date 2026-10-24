import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fixtur from './__fixtures__/scorpion_grepp_2026.json';
import skalviken from './__fixtures__/skalviken_stam1_profil.json';
import {
  findGreppSlapp, forandringTon, GREPP_FORANDRING_ORANGE, GREPP_FORANDRING_ROD, GREPP_MIN_CM, GREPP_MIN_STAMMAR, GREPP_VERSION, greppAndelStam, greppRutnat,
  greppTradslag, type GreppRad,
} from './greppTid';

const rader: GreppRad[] = (fixtur.rader as (string | number)[][]).map(r => ({
  manad: r[0] as string, tradslag: r[1] as string, klass: r[2] as string, stammar: r[3] as number, steg: r[4] as number, still: r[5] as number, summaAndel: r[6] as number,
}));
const rad = (manad: string, tradslag: string, klass: string, stammar: number, andel: number, steg = 100): GreppRad =>
  ({ manad, tradslag, klass, stammar, steg: steg * stammar, still: Math.round(andel * steg * stammar), summaAndel: andel * stammar });

describe('greppAndelStam — regeln för EN stam, samma som databasen och stamvyn', () => {
  it('diametern sjunker hela vägen: inget grepp', () => {
    expect(greppAndelStam([300, 290, 280, 270, 260])).toEqual({ steg: 4, still: 0, andel: 0 });
  });
  it('30 cm (tre steg) lika eller större är ett ställe; 20 cm räknas inte', () => {
    expect(greppAndelStam([300, 290, 290, 290, 290, 280])).toMatchObject({ steg: 5, still: 3 }); // 290→290→290→290 = 3 steg = 30 cm
    expect(greppAndelStam([300, 290, 290, 290, 280, 270])).toMatchObject({ steg: 5, still: 0 }); // 20 cm
    expect(GREPP_MIN_CM).toBe(30);
  });
  it('maskinens mått får stiga och det är fortfarande ett ställe (lika eller större än föregående)', () => {
    expect(greppAndelStam([300, 290, 291, 295, 295, 280])).toMatchObject({ steg: 5, still: 3 });
  });
  it('steget som sjunker är ett steg men aldrig "still"; stammens sista ställe räknas', () => {
    const r = greppAndelStam([300, 300, 300, 300, 290, 290, 290, 290]);
    expect(r).toEqual({ steg: 7, still: 6, andel: 6 / 7 });
  });
  it('en stam utan steg ger 0, inte NaN', () => {
    expect(greppAndelStam([300])).toEqual({ steg: 0, still: 0, andel: 0 });
    expect(greppAndelStam([])).toEqual({ steg: 0, still: 0, andel: 0 });
  });
  it('håller ihop med stamvyn: stegen i ställena som findGreppSlapp hittar = still, på Skälvikens riktiga stam (8 ställen)', () => {
    const profil = skalviken.stem_diameter_profile as { position_cm: number; diameter_mm: number }[];
    const stallen = findGreppSlapp(profil, []);
    expect(stallen).toHaveLength(8);
    const iStamvyn = stallen.reduce((a, s) => a + s.lengthCm / 10, 0);
    expect(greppAndelStam(profil.map(p => p.diameter_mm)).still).toBe(iStamvyn);
  });
  it('håller ihop med stamvyn på slumpade profiler', () => {
    let seed = 7;
    const slump = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    for (let n = 0; n < 200; n++) {
      let d = 400; const profil = Array.from({ length: 5 + Math.floor(slump() * 120) }, (_, i) => { d += slump() < 0.55 ? -Math.floor(slump() * 6) : Math.floor(slump() * 3); return { position_cm: i * 10, diameter_mm: d }; });
      expect(greppAndelStam(profil.map(p => p.diameter_mm)).still).toBe(findGreppSlapp(profil, []).reduce((a, s) => a + s.lengthCm / 10, 0));
    }
  });
  it('databasen räknar med samma gräns som koden (migrationen bär GREPP_MIN_CM)', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20261023180000_kalibrering_grepp_over_tid.sql'), 'utf8');
    expect(sql).toContain(`v_min_cm  CONSTANT integer := ${GREPP_MIN_CM};`);
    expect(sql).toContain(`v_version CONSTANT integer := ${GREPP_VERSION};`);
    expect(sql).toContain(`r.version = ${GREPP_VERSION}`);
    expect(sql).not.toMatch(/^\s*DELETE\b/m); // en fristående DELETE hänger Supabase-MCP:n (CLAUDE.md) — raderingen står som CTE
  });
});

describe('forandringTon — förändring, inte nivå', () => {
  it('mer greppfel: orange från +3, röd från +6; mindre: grön från −3; däremellan neutral. Dömer på heltalet som visas', () => {
    expect([0, 2.4, 2.5, 5.4, 5.5, 20].map(forandringTon)).toEqual(['neutral', 'neutral', 'orange', 'orange', 'rod', 'rod']);
    expect([-2.4, -2.5, -9].map(forandringTon)).toEqual(['neutral', 'gron', 'gron']);
    expect(GREPP_FORANDRING_ORANGE).toBe(3);
    expect(GREPP_FORANDRING_ROD).toBe(6);
  });
});

describe('greppRutnat', () => {
  it('rutans värde är medelvärdet över stammarna (summa_andel / stammar), inte andelen av alla steg', () => {
    const r = greppRutnat([{ manad: '2026-10', tradslag: 'GRAN', klass: '200-249', stammar: 40, steg: 4000, still: 1000, summaAndel: 40 * 0.4 }], 'manad');
    const c = r.rader[0].celler[0]!;
    expect(c.pct).toBeCloseTo(40, 6);
    expect(c.pctSteg).toBeCloseTo(25, 6); // alla steg lika: 1000/4000
  });

  it('en rad per trädslag (Gran, Tall, Björk, Övrigt löv) och sist 300+ för alla trädslag', () => {
    const r = greppRutnat(rader, 'manad');
    expect(r.rader.map(x => x.id)).toEqual(['Gran', 'Tall', 'Björk', 'Övrigt löv', '300+']);
    expect(r.rader[4]).toMatchObject({ etikett: '300+ mm', sub: 'alla trädslag' });
    expect(greppTradslag(rader)).toEqual(['Gran', 'Tall', 'Björk', 'Övrigt löv']);
  });

  it('300+-raden är de grova stammarna i ALLA trädslag, inte en delmängd av ett', () => {
    const r = greppRutnat([rad('2026-10', 'GRAN', '300+', 30, 0.2), rad('2026-10', 'TALL', '300+', 30, 0.6), rad('2026-10', 'GRAN', '200-249', 30, 0.9)], 'manad');
    const grov = r.rader.find(x => x.id === '300+')!.celler[0]!;
    expect(grov.stammar).toBe(60);
    expect(grov.pct).toBeCloseTo(40, 6);
  });

  it(`färre än ${GREPP_MIN_STAMMAR} stammar: grå, ingen färg och ingen förändring`, () => {
    const r = greppRutnat([rad('2026-10', 'GRAN', '200-249', GREPP_MIN_STAMMAR - 1, 0.5)], 'manad');
    expect(r.rader[0].celler[0]).toMatchObject({ tunn: true, ton: 'tunn', forandring: null });
  });

  it('färgen är förändringen mot radens FÖRSTA ruta med underlag — en grå början är inte referensen', () => {
    const r = greppRutnat([
      rad('2026-06', 'GRAN', '200-249', 5, 0.9), // för få: referens blir inte denna
      rad('2026-07', 'GRAN', '200-249', 100, 0.20), // referensen
      rad('2026-08', 'GRAN', '200-249', 100, 0.22), // +2 neutral
      rad('2026-09', 'GRAN', '200-249', 100, 0.24), // +4 orange
      rad('2026-10', 'GRAN', '200-249', 100, 0.30), // +10 röd
      rad('2026-11', 'GRAN', '200-249', 100, 0.15), // −5 grön
    ], 'manad');
    const gran = r.rader.find(x => x.id === 'Gran')!.celler;
    expect(gran.map(c => c!.ton)).toEqual(['tunn', 'neutral', 'neutral', 'orange', 'rod', 'gron']);
    expect(gran.map(c => c!.forandring == null ? null : Math.round(c!.forandring))).toEqual([null, null, 2, 4, 10, -5]);
  });

  it('nivån färgar inte: björk ligger alltid högre än gran men får samma ton för samma förändring', () => {
    const r = greppRutnat([
      rad('2026-07', 'BJÖRK', '200-249', 100, 0.44), rad('2026-08', 'BJÖRK', '200-249', 100, 0.48),
      rad('2026-07', 'GRAN', '200-249', 100, 0.14), rad('2026-08', 'GRAN', '200-249', 100, 0.18),
    ], 'manad');
    const ton = (id: string) => r.rader.find(x => x.id === id)!.celler[1]!.ton;
    expect(ton('Björk')).toBe('orange');
    expect(ton('Gran')).toBe('orange');
  });

  it('kvartal slår ihop månaderna viktat på stammar, och förändringen räknas mot första kvartalet', () => {
    const r = greppRutnat([
      rad('2026-01', 'GRAN', '200-249', 100, 0.2), rad('2026-02', 'GRAN', '200-249', 300, 0.4),
      rad('2026-04', 'GRAN', '200-249', 100, 0.3),
    ], 'kvartal');
    expect(r.perioder).toEqual(['2026-Q1', '2026-Q2']);
    const gran = r.rader.find(x => x.id === 'Gran')!.celler;
    expect(gran[0]!.pct).toBeCloseTo(35, 6); // (100·20 + 300·40) / 400
    expect(gran[0]!.stammar).toBe(400);
    expect(gran[1]!.forandring).toBeCloseTo(-5, 6);
  });

  it('perioder utan underlag i en rad är null; rader utan någon ruta tas bort', () => {
    const r = greppRutnat([rad('2026-07', 'GRAN', '200-249', 50, 0.2), rad('2026-08', 'TALL', '200-249', 50, 0.3)], 'manad');
    expect(r.rader.find(x => x.id === 'Gran')!.celler[1]).toBeNull();
    expect(r.rader.find(x => x.id === 'Tall')!.celler[0]).toBeNull();
    expect(greppRutnat([], 'manad')).toEqual({ perioder: [], rader: [] });
  });

  it('trädslagen stavas som i resten av appen: ÖVR LÖV och ÖVR_LÖV är en rad', () => {
    const r = greppRutnat([rad('2026-07', 'ÖVR_LÖV', '200-249', 25, 0.3), rad('2026-07', 'ÖVR LÖV', '200-249', 25, 0.5)], 'manad');
    expect(r.rader.filter(x => x.id === 'Övrigt löv')).toHaveLength(1);
    expect(r.rader[0].celler[0]!.stammar).toBe(50);
  });
});

// === Scorpionen 2026 — riktiga tal ===
describe('Scorpionen 2026 (prod 2026-10-23, alla stammar)', () => {
  const r = greppRutnat(rader, 'manad');
  const rutaFor = (id: string, manad: string) => r.rader.find(x => x.id === id)!.celler[r.perioder.indexOf(manad)]!;

  it('perioderna är de som finns: januari och juli–oktober (februari–juni saknar serie)', () => {
    expect(r.perioder).toEqual(['2026-01', '2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('björk ligger runt 42–44 % i september och oktober', () => {
    expect(rutaFor('Björk', '2026-09').pct).toBeCloseTo(43.9, 1);
    expect(rutaFor('Björk', '2026-10').pct).toBeCloseTo(42.5, 1);
  });

  it('gran och tall stiger från september till oktober (med stamvyns gräns på 30 cm)', () => {
    expect(rutaFor('Gran', '2026-09').pct).toBeCloseTo(19.5, 1);
    expect(rutaFor('Gran', '2026-10').pct).toBeCloseTo(22.3, 1);
    expect(rutaFor('Tall', '2026-09').pct).toBeCloseTo(28.9, 1);
    expect(rutaFor('Tall', '2026-10').pct).toBeCloseTo(36.1, 1);
    expect(rutaFor('Gran', '2026-10').pct - rutaFor('Gran', '2026-09').pct).toBeGreaterThan(2.5);
    expect(rutaFor('Tall', '2026-10').pct - rutaFor('Tall', '2026-09').pct).toBeGreaterThan(6);
  });

  it('antalet stammar är alla stammar: 10 371 gran i september', () => {
    expect(rutaFor('Gran', '2026-09').stammar).toBe(10371);
    expect(rutaFor('Tall', '2026-10').stammar).toBe(1319);
  });

  it('tall i oktober syns som röd förändring mot referensen, gran och björk inte', () => {
    expect(rutaFor('Tall', '2026-10').ton).toBe('rod');
    expect(rutaFor('Björk', '2026-10').ton).toBe('neutral');
  });

  it('januari är referensen för gran (389 stammar), men för tall/björk för tunn (9 respektive 5 stammar): deras referens blir juli', () => {
    expect(rutaFor('Gran', '2026-01')).toMatchObject({ stammar: 389, tunn: false, ton: 'neutral', forandring: null });
    expect(rutaFor('Tall', '2026-01')).toMatchObject({ stammar: 9, tunn: true });
    expect(rutaFor('Björk', '2026-01')).toMatchObject({ stammar: 5, tunn: true });
    expect(rutaFor('Tall', '2026-07')).toMatchObject({ forandring: null, ton: 'neutral' });
  });

  it('andelen av alla steg (den andra läsningen) är lägre än stammens snitt när långa stammar greppar mindre — de två skiljer sig, så valet av läsning är inte kosmetiskt', () => {
    const c = rutaFor('Gran', '2026-09');
    expect(Math.abs(c.pct - c.pctSteg)).toBeGreaterThan(0.1);
  });
});
