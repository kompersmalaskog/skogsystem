// Bondeskog AU 2026 (prod 2026-11-05): 22 markeringar utan ritad traktgräns, två GPS-spårade basvägar ut till allmän väg.
// Egenkontrollens kontroll räknar punkter och underkänner trakten; skotarsidan räknar markeringar.
import { describe, it, expect } from 'vitest';
import { beslutaOrigo, markeringsGranser, markeringsPunkter, type VidaGrans } from '@/lib/egenkontrollOrigo';
import { origoPerMarkering } from './server';

const objekt = { lat: 56.6590618621907, lng: 15.3568517902166, kartbild_bounds: null };
const vida: VidaGrans = { typ: 'ok', gran: [[15.3541837589796, 56.6581767684365], [15.3595198214536, 56.659946955945]], ringar: [] } as unknown as VidaGrans;
const sym = (x: number, y: number) => ({ data: { x, y, isMarker: true, type: 'eternitytree' } });
const linje = (pts: [number, number][]) => ({ data: { isLine: true, lineType: 'mainRoad', path: pts.map(([x, y]) => ({ x, y })) } });
// Basväg 7: ~1,2 km ut till vägen, glest återgiven men med lika många punkter som i prod (~90), de flesta långt utanför gränsen.
const vag7 = linje(Array.from({ length: 90 }, (_, i) => [298 + (i / 89) * 100, -169 - (i / 89) * 972] as [number, number]));
const vag5 = linje(Array.from({ length: 85 }, (_, i) => [120 + (i / 84) * 172, -51 - (i / 84) * 120] as [number, number]));
const rader = [
  sym(-14, -32), sym(41, -44), sym(-80, 43), sym(-87, 51), sym(-62, 34), sym(-43, 40), sym(-35, 12), sym(70, -10), sym(300, -1140),
  linje([[-92, 75], [-93, 68], [-106, 44], [-118, 15]]),
  linje([[3, -40], [30, -36], [34, -42], [17, -45], [3, -40]]),
  linje([[-74, 41], [-90, 40], [-83, 55], [-71, 50], [-74, 41]]),
  linje([[113, -50], [96, -49], [76, -56]]),
  linje([[-33, -16], [9, 18], [56, -2], [96, -28], [124, -53]]),
  vag5, vag7,
];

describe('origoPerMarkering', () => {
  it('egenkontrollens punktkontroll underkänner Bondeskog (det var felet)', () => {
    const b = beslutaOrigo({ objekt, punkter: markeringsPunkter(rader), granser: markeringsGranser(rader), vida });
    expect(b.ok).toBe(false);
  });
  it('räknat per markering placeras Bondeskog', () => {
    expect(origoPerMarkering(objekt, rader, vida)).not.toBeNull();
  });
  it('en hel trakt förskjuten 2 km underkänns fortfarande', () => {
    const fel = { ...objekt, lat: objekt.lat + 0.018 };
    expect(origoPerMarkering(fel, rader, vida)).toBeNull();
  });
  it('utan Vidas gräns avgör den inget', () => {
    expect(origoPerMarkering(objekt, rader, { typ: 'saknas' } as VidaGrans)).toBeNull();
  });
});

import { skotarHogar } from './hogar';
import { FULL_STYRKA, HOG_PRICK_FARG } from '@/lib/skotarHogarKvar';
describe('högarna som skotarlägets prickar', () => {
  it('ljus prick med full styrka på en orörd hög; sortimenten finns för kortet', () => {
    const st = Array.from({ length: 6 }, (_, i) => ({ lat: 56.659 + i * 1e-6, lng: 15.356, volym: 0.4, tradslag: 'Gran', sortiment: 'Massa' }));
    const h = skotarHogar(st, [], [], []);
    expect(h.hogar.length).toBeGreaterThan(0);
    expect(h.hogar[0].farg).toBe(HOG_PRICK_FARG.alla);
    expect(h.hogar[0].a).toBe(FULL_STYRKA);
    expect(h.hogar[0].sortiment[0].namn).toBe('Massa');
  });
});
