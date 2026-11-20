// Lagren som tands i menyn (PR 8a): planens vagar i full styrka, hyttspar per roll, Vidas traktgrans.
//
// Det som far ga sonder tyst:
//  - ett lager avvisas av MapLibre (addLayer kastar inte: lagret ar bara borta),
//  - ett lager STARTAR tant (standarden lagger da nagot nytt pa kartan),
//  - planens vagar ritar mer an vagar (dike, naturvard, traktgrans), eller ritas nedtonade,
//  - ett nytt lagers id borjar pa "ek-p-" och blir tryckbart som en kontrollpunkt (tryckhanteraren fragar alla ek-p-*),
//  - hyttsparet ritas som en kontrollpunkt (tryckbart) eller fargas lika for bada rollerna.
import { describe, expect, it } from 'vitest';
import { featureFilter, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import {
  BACKVAG_LAGER_ID, BACKVAG_OPACITET, KONTEXT_KALLA, SPAR_KALLA, VIDA_GRANS_KALLA,
  backvagLager, kontextLager, kontrollLager, planVagLager, planVagLagerIdn, sparFeatures, sparLager, sparLagerIdn, vidaGransFeatures,
  vidaGransLager, vidaGransLagerIdn,
} from './egenkontrollkarta';
import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from './sparStil';
import { LINJE_STIL } from './kartstil';

const kalla = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
const riktigaFel = (lager: any[], kallor: string[]) =>
  validateStyleMin({ version: 8 as const, sources: Object.fromEntries(kallor.map((k) => [k, kalla])) as any, layers: lager } as any)
    .map((f: any) => `${f.message}`)
    .filter((m: string) => !/sprite/i.test(m));

const alla = () => [...planVagLager(), ...sparLager('skordare'), ...sparLager('skotare'), ...vidaGransLager()];

describe('lagren ar giltiga enligt MapLibres stil-spec', () => {
  it('planens vagar', () => expect(riktigaFel(planVagLager(), [KONTEXT_KALLA])).toEqual([]));
  it('hyttspar, bada roller', () => {
    expect(riktigaFel(sparLager('skordare'), [SPAR_KALLA.skordare])).toEqual([]);
    expect(riktigaFel(sparLager('skotare'), [SPAR_KALLA.skotare])).toEqual([]);
  });
  it('Vidas traktgrans', () => expect(riktigaFel(vidaGransLager(), [VIDA_GRANS_KALLA])).toEqual([]));
  it('kontrollen av kontrollen: ett ogiltigt lager hade avvisats', () => {
    const dalig = [{ id: 'd', type: 'line', source: VIDA_GRANS_KALLA, paint: { 'line-width': ['+', ['interpolate', ['linear'], ['zoom'], 5, 2, 17, 7], 4] } }];
    expect(riktigaFel(dalig, [VIDA_GRANS_KALLA]).length).toBeGreaterThan(0);
  });
});

describe('STANDARDEN LAGGER INGET NYTT PA KARTAN: varje nytt lager startar slackt', () => {
  it('layout.visibility ar none pa alla', () => {
    for (const l of alla()) expect(l.layout?.visibility, l.id).toBe('none');
  });
  it('...men de ovriga layout-egenskaperna (cap/join) behalls', () => {
    const kant = sparLager('skordare')[0];
    expect(kant.layout['line-cap']).toBe('round');
    expect(kant.layout['line-join']).toBe('round');
  });
});

describe('id:n ar kontrakt mot RundKarta, lagermenyn och tryckhanteraren', () => {
  it('inget nytt id borjar pa "ek-p-": tryckhanteraren fragar alla ek-p-* efter kontrollpunkter, och underlag ska inte ga att trycka pa', () => {
    for (const l of alla()) expect(l.id.startsWith('ek-p-'), l.id).toBe(false);
  });
  it('id:n ar unika - ett lager ritas av exakt ett anrop - och krockar inte med kontext-, kontroll- eller backvagslagren', () => {
    const nya = alla().map((l) => l.id as string);
    expect(new Set(nya).size).toBe(nya.length);
    const gamla = new Set([...kontextLager(), ...kontrollLager(), ...backvagLager()].map((l) => l.id as string));
    for (const id of nya) expect(gamla.has(id), id).toBe(false);
  });
  it('...och Idn-funktionerna ger exakt lagrens id, i ordning', () => {
    expect(planVagLagerIdn()).toEqual(planVagLager().map((l) => l.id));
    expect(sparLagerIdn('skordare')).toEqual(['ek-spar-skordare-kant', 'ek-spar-skordare']);
    expect(sparLagerIdn('skotare')).toEqual(['ek-spar-skotare-kant', 'ek-spar-skotare']);
    expect(vidaGransLagerIdn()).toEqual(['ek-vida-grans-kant', 'ek-vida-grans']);
  });
  it('tvarstreckets lager-id och opacitet ar exporterade (RundKarta lyfter strecken nar planens vagar lyfts)', () => {
    expect(backvagLager()[0].id).toBe(BACKVAG_LAGER_ID);
    expect(backvagLager()[0].paint['icon-opacity']).toEqual(BACKVAG_OPACITET);
  });
});

describe('PLANENS VAGAR: bara vagar, full styrka, ur kontextens kalla', () => {
  const lager = planVagLager();
  const traffar = (lagerId: string, feature: any) => {
    const l = lager.find((x) => x.id === lagerId);
    return !!l && featureFilter(l.filter).filter({ zoom: 0 }, feature);
  };
  const f = (typ: string) => ({ type: 1, properties: { kind: 'linje', typ } });

  it('ritar bas- och stickvagar och INGET annat (dike, naturvard, stig, stenmur, traktgrans) - ingen okand-fallback heller', () => {
    const typer = LINJE_STIL.map((l) => l.id);
    const vagar = ['mainRoad', 'sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'];
    for (const typ of typer) {
      const ritas = lager.some((l) => featureFilter(l.filter).filter({ zoom: 0 }, f(typ) as any));
      expect(ritas, typ).toBe(vagar.includes(typ));
    }
    expect(lager.some((l) => l.id.endsWith('-okand'))).toBe(false);
    expect(traffar('ek-plan-lin-mainRoad', f('ditch'))).toBe(false);
  });

  it('kallan ar kontextens - utan dem som redan ar kontrollpunkter', () => {
    for (const l of lager) expect(l.source).toBe(KONTEXT_KALLA);
  });

  it('FULL STYRKA: ingen nedtoning (ingen line-opacity) - det ar hela poangen med raden', () => {
    for (const l of lager) expect(l.paint['line-opacity'], l.id).toBeUndefined();
    const dim = kontextLager().filter((l) => l.id.startsWith('ek-k-lin-mainRoad'));
    expect(dim.some((l) => l.paint['line-opacity'] === 0.4)).toBe(true);   // jamforelsen: kontexten ar nedtonad
  });

  it('basvagen har sin svarta kant (som i planeringen); kontextens nedtonade har ingen', () => {
    expect(lager.some((l) => l.id === 'ek-plan-lin-mainRoad-kant')).toBe(true);
    expect(kontextLager().some((l) => l.id === 'ek-k-lin-mainRoad-kant')).toBe(false);
  });
});

describe('HYTTSPAR', () => {
  it('rollfargerna: skordare lila, skotare gron - samma som resten av appen (lib/sparStil)', () => {
    expect(sparLager('skordare')[1].paint['line-color']).toBe(ROLLFARG_SKORDARE);
    expect(sparLager('skotare')[1].paint['line-color']).toBe(ROLLFARG_SKOTARE);
  });

  it('farg ar aldrig ensam: skotaren ar STRECKAD, skordaren heldragen - som i A4-rapporten', () => {
    expect(sparLager('skordare')[1].paint['line-dasharray']).toBeUndefined();
    expect(sparLager('skotare')[1].paint['line-dasharray']).toBeDefined();
  });

  it('ljus kant UNDER linjen (lagerordning: kant forst)', () => {
    for (const roll of ['skordare', 'skotare'] as const) {
      const [kant, linje] = sparLager(roll);
      expect(kant.id.endsWith('-kant')).toBe(true);
      expect(kant.paint['line-color']).toBe('#ffffff');
      expect(linje.id.endsWith('-kant')).toBe(false);
    }
  });

  it('features: en linje per linje; en linje med under tva punkter ritas inte; WGS84 [lng,lat]', () => {
    const f = sparFeatures([[{ lat: 56.1, lng: 14.2 }, { lat: 56.2, lng: 14.3 }], [{ lat: 56, lng: 14 }], []]);
    expect(f).toHaveLength(1);
    expect(f[0].geometry).toEqual({ type: 'LineString', coordinates: [[14.2, 56.1], [14.3, 56.2]] });
  });
});

describe('VIDAS TRAKTGRANS', () => {
  it('vit streckad linje med morkt skugga: skild fran var egen traktgrans (rod/gul)', () => {
    const [kant, linje] = vidaGransLager();
    expect(linje.paint['line-dasharray']).toBeDefined();
    expect(linje.paint['line-color']).toBe('#ffffff');
    expect(kant.paint['line-color']).toMatch(/^rgba\(0,\s*0,\s*0/);
  });

  it('en ring blir en linje; en ring med under tre punkter ar ingen yta', () => {
    const ring: [number, number][] = [[14, 56], [14.1, 56], [14.1, 56.1], [14, 56]];
    const f = vidaGransFeatures([ring, [[14, 56], [14.1, 56]]]);
    expect(f).toHaveLength(1);
    expect(f[0].geometry).toEqual({ type: 'LineString', coordinates: ring });
  });
});
