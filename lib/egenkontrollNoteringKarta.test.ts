import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  NOTERING_KALLA, RITNING_KALLA, noteringBilder, noteringEtikettLager, noteringFeatures, noteringLagerIdn, noteringLinjeLager,
  pilVinkelGrader, ritningFeatures, ritningLager, ritningLagerIdn,
} from './egenkontrollNoteringKarta';
import { SKULLE_STRECK, noteringBildId, ritaNoteringsEtikett, type NoteringCtx } from './egenkontrollNoteringBild';
import type { Notering } from './egenkontrollNotering';
import type { EtikettCanvas } from './figurEtikettBild';

const n = (over: Partial<Notering> = {}): Notering => ({
  id: 'n1', egenkontroll_id: 'r1', underlag: 'karta', foto_id: null, typ: 'punkt', pil: false, etikett: 'Stenmur', avsikt: 'blev',
  koordinater: [[14.5, 56.1]], etikett_dx: null, etikett_dy: null, skapad: 'a', andrad: 'a', ...over,
});

describe('pilens riktning', () => {
  it('grader medsols från norr: norr 0, öster 90, söder 180, väster 270', () => {
    expect(pilVinkelGrader([[14.5, 56.1], [14.5, 56.2]])).toBeCloseTo(0, 6);
    expect(pilVinkelGrader([[14.5, 56.1], [14.6, 56.1]])).toBeCloseTo(90, 6);
    expect(pilVinkelGrader([[14.5, 56.2], [14.5, 56.1]])).toBeCloseTo(180, 6);
    expect(pilVinkelGrader([[14.6, 56.1], [14.5, 56.1]])).toBeCloseTo(270, 6);
  });
  it('riktningen är den SISTA delsträckan, och en dubblett i slutet hoppas över', () => {
    expect(pilVinkelGrader([[14.5, 56.1], [14.5, 56.2], [14.6, 56.2]])).toBeCloseTo(90, 6);
    expect(pilVinkelGrader([[14.5, 56.1], [14.6, 56.1], [14.6, 56.1]])).toBeCloseTo(90, 6);
  });
  it('ingen riktning utan två skilda punkter', () => {
    expect(pilVinkelGrader([[14.5, 56.1]])).toBeNull();
    expect(pilVinkelGrader([[14.5, 56.1], [14.5, 56.1]])).toBeNull();
  });
});

describe('features', () => {
  it('en punkt blir en punkt + en etikett på den; båda bär noteringens id', () => {
    const f = noteringFeatures([n()]);
    expect(f.map((x) => x.properties.form)).toEqual(['punkt', 'etikett']);
    expect(f.every((x) => x.properties.kind === 'notering' && x.properties.id === 'n1')).toBe(true);
    expect(f[1].properties.bild).toBe(noteringBildId('Stenmur', 'blev'));
  });
  it('en linje blir linjen + en etikett mitt på den; ingen pilspets', () => {
    const f = noteringFeatures([n({ typ: 'linje', koordinater: [[14.5, 56.1], [14.6, 56.1]] })]);
    expect(f.map((x) => x.properties.form)).toEqual(['linje', 'etikett']);
    expect(f[1].geometry.coordinates[0]).toBeCloseTo(14.55, 5);
  });
  it('en pil är en linje + en pilspets i slutet med riktningen', () => {
    const f = noteringFeatures([n({ typ: 'linje', pil: true, koordinater: [[14.5, 56.1], [14.6, 56.1]], avsikt: 'skulle' })]);
    expect(f.map((x) => x.properties.form)).toEqual(['linje', 'pilspets', 'etikett']);
    expect(f[1].properties.vinkel).toBeCloseTo(90, 6);
    expect(f[1].geometry.coordinates).toEqual([14.6, 56.1]);
    expect(f[1].properties.avsikt).toBe('skulle');
  });
  it('en fotonotering (9b) hör inte hit', () => {
    expect(noteringFeatures([n({ underlag: 'foto', foto_id: 'f1', koordinater: [[0.5, 0.5]] })])).toEqual([]);
  });
  it('en bild per unik text och avsikt, och en pilspets per avsikt', () => {
    const b = noteringBilder([n(), n({ id: 'n2' }), n({ id: 'n3', avsikt: 'skulle' })]);
    expect(b.etiketter.map((e) => e.id)).toEqual([noteringBildId('Stenmur', 'blev'), noteringBildId('Stenmur', 'skulle')]);
    expect(b.pilar).toHaveLength(2);
  });
  it('ritningen: en punkt per tryck och en linje när det finns två', () => {
    expect(ritningFeatures([[14.5, 56.1]]).map((x) => x.properties.form)).toEqual(['tryck']);
    const f = ritningFeatures([[14.5, 56.1], [14.6, 56.2], [14.7, 56.1]]);
    expect(f.map((x) => x.properties.form)).toEqual(['linje', 'tryck', 'tryck', 'tryck']);
    expect(f.filter((x) => x.properties.senaste === true)).toHaveLength(1);
  });
});

describe('lagren', () => {
  const kalla = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  const stil = (lager: any[]) => ({ version: 8 as const, sources: { [NOTERING_KALLA]: kalla, [RITNING_KALLA]: kalla } as any, layers: lager });
  const fel = (lager: any[]) => validateStyleMin(stil(lager) as any).map((f: any) => `${f.message}`).filter((m: string) => !/sprite/i.test(m));

  it('är giltiga enligt MapLibres egen stil-spec (addLayer kastar inte vid ett ogiltigt uttryck — den hoppar lagret)', () => {
    expect(fel(noteringLinjeLager())).toEqual([]);
    expect(fel(noteringEtikettLager())).toEqual([]);
    expect(fel(ritningLager())).toEqual([]);
  });

  it('kontrollen av kontrollen: ett ogiltigt lager avvisas av samma validering', () => {
    expect(fel([{ id: 'x', type: 'line', source: NOTERING_KALLA, paint: { 'line-width': ['+', ['interpolate', ['linear'], ['zoom'], 5, 2, 17, 7], 4] } }]).length).toBeGreaterThan(0);
  });

  it('inget id börjar på ek-p- (kontrollpunkterna) — noteringar och ritning har sina egna prefix', () => {
    for (const id of [...noteringLagerIdn(), ...ritningLagerIdn()]) {
      expect(id.startsWith('ek-p-')).toBe(false);
      expect(id.startsWith('ek-n-') || id.startsWith('ek-r-')).toBe(true);
    }
    expect(ritningLagerIdn().every((id) => id.startsWith('ek-r-'))).toBe(true);
    expect(noteringLagerIdn().every((id) => id.startsWith('ek-n-'))).toBe(true);
  });

  it('FÄRGEN BÄR ALDRIG ENSAM: "skulle" är streckad och en ring, "blev" är heldragen och en fylld punkt', () => {
    const l = noteringLinjeLager();
    const linje = (a: string) => l.find((x) => x.id === `ek-n-linje-${a}`);
    expect(linje('skulle').paint['line-dasharray']).toBeTruthy();
    expect(linje('blev').paint['line-dasharray']).toBeUndefined();
    const punkt = (a: string) => l.find((x) => x.id === `ek-n-punkt-${a}`);
    expect(punkt('blev').paint['circle-opacity']).toBe(1);
    expect(punkt('skulle').paint['circle-opacity']).toBe(0);
    // kanten under en streckad linje är heldragen, annars visar hålen flygfotot i stället för kanten
    expect(l.find((x) => x.id === 'ek-n-linje-kant-skulle').paint['line-dasharray']).toBeUndefined();
  });

  it('etiketterna ritas alltid (en dold etikett vore en notering man inte ser)', () => {
    const e = noteringEtikettLager()[0];
    expect(e.layout['icon-allow-overlap']).toBe(true);
    expect(e.layout['icon-ignore-placement']).toBe(true);
  });
});

describe('etikettens pill', () => {
  function fejkCanvas() {
    const anrop: string[] = [];
    const ctx: NoteringCtx = {
      font: '', fillStyle: '', textBaseline: '', textAlign: '', strokeStyle: '', lineWidth: 0,
      measureText: (t: string) => ({ width: t.length * 8 }),
      scale: () => {}, beginPath: () => {}, moveTo: () => {}, arcTo: () => {}, closePath: () => {}, fill: () => {},
      fillText: (t: string) => { anrop.push(`text:${t}`); },
      setLineDash: (s: number[]) => { anrop.push(`streck:${s.join(',')}`); },
      stroke: () => { anrop.push(`kant:${ctx.strokeStyle}`); },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    };
    const canvas: EtikettCanvas = { width: 0, height: 0, getContext: () => ctx as any };
    return { canvas, anrop };
  }

  it('"skulle" har STRECKAD kant, "blev" en heldragen — formen skiljer, inte bara färgen', () => {
    const skulle = fejkCanvas();
    expect(ritaNoteringsEtikett('Basvägen skulle gått här', 'skulle', () => skulle.canvas)).not.toBeNull();
    expect(skulle.anrop).toContain(`streck:${SKULLE_STRECK.join(',')}`);
    const blev = fejkCanvas();
    expect(ritaNoteringsEtikett('Stenmur', 'blev', () => blev.canvas)).not.toBeNull();
    expect(blev.anrop.filter((a) => a.startsWith('streck:') && a !== 'streck:')).toEqual([]);
  });

  it('en tom text ger ingen bild', () => {
    expect(ritaNoteringsEtikett('   ', 'blev', () => fejkCanvas().canvas)).toBeNull();
  });
});
