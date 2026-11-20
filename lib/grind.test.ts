import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { GRIND_KOD_MAX, GRIND_NARA_M, GRIND_TYP, GRIND_UT_M, TOMT_GRIND, grindarUrMarkeringar, rensaGrindKod, stegaGrind, type GrindState } from './grind';
import { byggRapportIndata } from './egenkontrollRapportIndata';
import { byggRapport } from './egenkontrollRapport';
import type { Egenkontroll } from './egenkontroll';

// Kartan: en grind i (0,0) och en position som flyttas norrut (~111 m per 0,001 grader)
const GRIND = { id: 'g1', kod: '4711', lat: 56, lon: 15 };
const pos = (metersNorr: number) => ({ lat: 56 + metersNorr / 111_195, lon: 15 });
const steg = (m: number | null, state: GrindState) => stegaGrind({ grindar: [GRIND], pos: m === null ? null : pos(m), state });

describe('rensaGrindKod', () => {
  it('bara siffror, högst 12', () => {
    expect(rensaGrindKod('47 11-a')).toBe('4711');
    expect(rensaGrindKod('1234567890123456')).toHaveLength(GRIND_KOD_MAX);
    expect(rensaGrindKod(null)).toBe('');
    expect(rensaGrindKod('abc')).toBe('');
  });
});

describe('grindarUrMarkeringar', () => {
  it('bara grindar med kod; en grind utan kod har inget att visa', () => {
    const svg = () => ({ lat: 56, lon: 15 });
    const g = grindarUrMarkeringar([
      { id: 1, isMarker: true, type: GRIND_TYP, x: 0, y: 0, kod: '1234' },
      { id: 2, isMarker: true, type: GRIND_TYP, x: 0, y: 0 },
      { id: 3, isMarker: true, type: 'warning', x: 0, y: 0, kod: '9999' },
      { id: 4, isMarker: true, type: GRIND_TYP, x: 0, y: 0, kod: 'abc' },
    ], svg);
    expect(g.map((x) => [x.id, x.kod])).toEqual([['1', '1234']]);
  });
});

describe('kortet "Grind · Stäng efter dig"', () => {
  it('visas inom 50 m med koden, inte utanför', () => {
    expect(steg(GRIND_NARA_M + 5, TOMT_GRIND).kort).toBeNull();
    const r = steg(GRIND_NARA_M - 5, TOMT_GRIND);
    expect(r.kort).toMatchObject({ id: 'g1', kod: '4711' });
  });
  it('hysteres: ett kort som visats släpps först vid 60 m (GPS-brus vid kanten får det inte att flimra)', () => {
    const inne = steg(GRIND_NARA_M - 5, TOMT_GRIND);
    expect(steg(GRIND_NARA_M + 5, inne.state).kort).not.toBeNull();
    expect(steg(GRIND_UT_M + 5, inne.state).kort).toBeNull();
  });
  it('försvinner när man passerat: nära (≤ 25 m) och sedan 15 m bort igen', () => {
    let s = steg(40, TOMT_GRIND);
    s = steg(15, s.state);
    expect(s.kort).not.toBeNull();
    s = steg(35, s.state);
    expect(s.kort).toBeNull();                       // passerad
    expect(steg(20, s.state).kort).toBeNull();       // visas inte igen medan man är kvar
  });
  it('utan position: inget kort och inget minne', () => {
    expect(steg(null, TOMT_GRIND)).toEqual({ state: TOMT_GRIND, kort: null });
  });
});

describe('koden hör aldrig hemma i A4-rapporten', () => {
  const RUNDA = { id: 'e1', objekt_typ: 'slutavverkning', status: 'klar' } as unknown as Egenkontroll;
  const ORIGO = { lat: 56.1, lng: 15.1, zoom: 16 };

  it('en grind med kod i planeringen blir en symbol utan kod i rapportens indata och modell', () => {
    const indata = byggRapportIndata({
      objektNamn: 'Aramo', voNummer: '1', runda: RUNDA, punkter: [], observationer: [], foton: [], provytor: [], origo: ORIGO, granserXy: [],
      kontext: [{ data: { x: 5, y: 5, type: 'gate', isMarker: true, kod: '482916', comment: 'Stäng efter dig' } }],
      stammar: null, antalStammar: null, hyttspar: [], areal: null,
    });
    expect(indata.markeringar).toEqual([{ slag: 'symbol', typ: 'gate', plats: expect.any(Object) }]);
    expect(JSON.stringify(indata)).not.toContain('482916');
    expect(JSON.stringify(byggRapport(indata))).not.toContain('482916');
  });

  it('ingen källfil som bygger rapporten läser fältet kod eller grinden', () => {
    const filer = readdirSync('lib').filter((f) => /^egenkontrollRapport.*\.ts$/.test(f) && !f.endsWith('.test.ts'));
    expect(filer.length).toBeGreaterThanOrEqual(5);
    for (const f of filer) {
      const t = readFileSync(`lib/${f}`, 'utf8');
      expect(t, f).not.toMatch(/\.kod\b|\['kod'\]|\bGRIND_|lib\/grind|from '\.\/grind'/);
    }
  });

  it('markägarrapporten och dokumenten läser inte heller koden: bara körvyn (useGrind) och markeringskortet använder den', () => {
    const anv = readdirSync('lib/hooks').filter((f) => f === 'useGrind.ts');
    expect(anv).toHaveLength(1);
    for (const f of ['lib/egenkontroll.ts', 'lib/egenkontrollOrigo.ts']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\.kod\b/);
  });
});

describe('sidan', () => {
  const page = readFileSync('app/planering/page.tsx', 'utf8');
  it('kortet ligger högst upp, under larmkortet när det finns, och ger inget ljud', () => {
    expect(page).toContain('<GrindKortVy');
    expect(page).toMatch(/larm\.kort && !inst\.kort \? 96 : 0/);
    const kort = readFileSync('components/planering/LarmKort.tsx', 'utf8');
    const g = kort.slice(kort.indexOf('export function GrindKortVy'));
    expect(g).toContain('Grind');
    expect(g).toContain('Stäng efter dig');
    expect(g).not.toMatch(/Audio|vibrate|spela/i);
  });
});
