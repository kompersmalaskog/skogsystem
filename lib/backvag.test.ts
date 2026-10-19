import { describe, it, expect } from 'vitest';
import {
  BACKVAG_FORVALD_ANDE, BACKVAG_ORSAKER, BACKVAG_TITEL, VAG_LINJETYPER, arVagTyp, backvagFeature, backvagStreck, backvagStreckFarg, backvagText, lasBackvag, medBackvag,
} from './backvag';

describe('backväg: vilka linjer är vägar', () => {
  it('basväg, stickväg och backväg-typerna (röd/gul/blå) är vägar — dike, naturvård, stig, stenmur och traktgräns är det inte', () => {
    for (const t of ['mainRoad', 'sideRoadRed', 'sideRoadYellow', 'sideRoadBlue', 'backRoadRed', 'backRoadYellow', 'backRoadBlue']) expect(arVagTyp(t), t).toBe(true);
    for (const t of ['boundary', 'nature', 'ditch', 'trail', 'stonewall', '', undefined, null, 5]) expect(arVagTyp(t), String(t)).toBe(false);
    expect(VAG_LINJETYPER).toHaveLength(7);
  });
});

describe('backväg: lagring på markeringen (ingen migration)', () => {
  it('läser bara ett riktigt värde — trasigt eller okänt är en vanlig väg, aldrig ett påhittat hinder', () => {
    expect(lasBackvag({})).toBeNull();
    expect(lasBackvag(null)).toBeNull();
    expect(lasBackvag({ backvag: null })).toBeNull();
    expect(lasBackvag({ backvag: true })).toBeNull();
    expect(lasBackvag({ backvag: { ande: 'mitten' } })).toBeNull();
    expect(lasBackvag({ backvag: { ande: 'slut' } })).toEqual({ ande: 'slut' });
    expect(lasBackvag({ backvag: { ande: 'start', orsak: 'sten' } })).toEqual({ ande: 'start', orsak: 'sten' });
    expect(lasBackvag({ backvag: { ande: 'start', orsak: 'trasig' } })).toEqual({ ande: 'start' });
  });
  it('på → fältet läggs till; av → fältet TAS BORT (lagrad JSON blir identisk med före backväg); inget annat på markeringen rörs', () => {
    const vag = { id: 7, lineType: 'mainRoad', farg: 'red', nummer: 3, path: [{ x: 0, y: 0 }, { x: 5, y: 5 }] };
    const pa = medBackvag(vag, { ande: 'slut', orsak: 'brant' });
    expect(pa).toEqual({ ...vag, backvag: { ande: 'slut', orsak: 'brant' } });
    expect(medBackvag(pa, null)).toEqual(vag);
    expect('backvag' in medBackvag(pa, null)).toBe(false);
    expect(vag).not.toHaveProperty('backvag');   // inget muteras
  });
  it('orsaken är valfri och ett av fyra ord: Sten · Brant · Blött · Annat — inget fritextfält', () => {
    expect(BACKVAG_ORSAKER.map((o) => o.namn)).toEqual(['Sten', 'Brant', 'Blött', 'Annat']);
    expect(medBackvag({}, { ande: 'start' })).toEqual({ backvag: { ande: 'start' } });
    expect(BACKVAG_FORVALD_ANDE).toBe('slut');
  });
  it('kortets text: "Backväg – backa ut" + orsak om satt', () => {
    expect(BACKVAG_TITEL).toBe('Backväg – backa ut');
    expect(backvagText(null)).toBeNull();
    expect(backvagText({ ande: 'slut' })).toBe('Backväg – backa ut');
    expect(backvagText({ ande: 'slut', orsak: 'sten' })).toBe('Backväg – backa ut · Sten');
    expect(backvagText({ ande: 'start', orsak: 'blott' })).toBe('Backväg – backa ut · Blött');
  });
});

describe('backväg: tvärstreckets färg = vägens egen', () => {
  it('röd/gul/blå väg → samma färg; basväg utan färg → blå/gul; basväg med färg → sin färg', () => {
    expect(backvagStreckFarg('sideRoadRed')).toBe('red');
    expect(backvagStreckFarg('sideRoadYellow')).toBe('yellow');
    expect(backvagStreckFarg('sideRoadBlue')).toBe('blue');
    expect(backvagStreckFarg('backRoadRed')).toBe('red');
    expect(backvagStreckFarg('mainRoad')).toBe('blagul');
    expect(backvagStreckFarg('mainRoad', undefined)).toBe('blagul');
    expect(backvagStreckFarg('mainRoad', 'red')).toBe('red');
    expect(backvagStreckFarg('mainRoad', 'yellow')).toBe('yellow');
    expect(backvagStreckFarg('mainRoad', 'blue')).toBe('blue');
    expect(backvagStreckFarg('mainRoad', 'lila')).toBe('blagul');
  });
});

describe('backväg: tvärstreckets läge', () => {
  // en väg rakt österut vid lat 56,5: riktningen ut i slutet är 90°, ut i början 270°
  const ost: [number, number][] = [[14.0, 56.5], [14.001, 56.5], [14.002, 56.5]];
  it('slutet: sista punkten, riktning ut ur vägen; början: första punkten, motsatt riktning', () => {
    const slut = backvagStreck(ost, 'slut')!;
    expect(slut.punkt).toEqual([14.002, 56.5]);
    expect(Math.round(slut.riktning)).toBe(90);
    const start = backvagStreck(ost, 'start')!;
    expect(start.punkt).toEqual([14.0, 56.5]);
    expect(Math.round(start.riktning)).toBe(270);
  });
  it('rakt norrut → 0°, söderut → 180°, nordost ≈ 45° (lutningen i longitud räknas med cos(lat))', () => {
    expect(Math.round(backvagStreck([[14, 56.5], [14, 56.501]], 'slut')!.riktning)).toBe(0);
    expect(Math.round(backvagStreck([[14, 56.501], [14, 56.5]], 'slut')!.riktning)).toBe(180);
    const dLat = 100 / 110540, dLng = 100 / (111320 * Math.cos(56.5 * Math.PI / 180));   // 100 m norrut och 100 m österut
    const nordost = backvagStreck([[14, 56.5], [14 + dLng, 56.5 + dLat]], 'slut')!;
    expect(nordost.riktning).toBeGreaterThan(40);
    expect(nordost.riktning).toBeLessThan(50);
  });
  it('dubblettpunkter i änden ger ingen brusig riktning: grannen tas minst 2 m bort', () => {
    const med: [number, number][] = [[14, 56.5], [14.001, 56.5], [14.001000001, 56.5]];
    expect(Math.round(backvagStreck(med, 'slut')!.riktning)).toBe(90);
  });
  it('färre än två punkter, eller alla på samma ställe → inget streck', () => {
    expect(backvagStreck([[14, 56.5]], 'slut')).toBeNull();
    expect(backvagStreck([], 'start')).toBeNull();
    expect(backvagStreck([[14, 56.5], [14, 56.5]], 'slut')).toBeNull();
  });
});

describe('backväg: feature för kartan', () => {
  const koord: [number, number][] = [[14.0, 56.5], [14.001, 56.5]];
  it('en backväg ger EN punkt med vägens färg, riktning och id — inget annat ändras på linjen', () => {
    const f = backvagFeature({ id: 11, lineType: 'sideRoadYellow', backvag: { ande: 'slut' } }, koord)!;
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [14.001, 56.5] });
    expect(f.properties).toEqual({ id: 11, lineType: 'sideRoadYellow', streck: 'yellow', riktning: 90 });
  });
  it('basväg utan färg → blågul; basväg röd → röd', () => {
    expect(backvagFeature({ id: 1, lineType: 'mainRoad', backvag: { ande: 'start' } }, koord)!.properties.streck).toBe('blagul');
    expect(backvagFeature({ id: 1, lineType: 'mainRoad', farg: 'red', backvag: { ande: 'start' } }, koord)!.properties.streck).toBe('red');
  });
  it('ingen backväg, ingen väg (dike) eller trasig geometri → ingen feature', () => {
    expect(backvagFeature({ id: 1, lineType: 'mainRoad' }, koord)).toBeNull();
    expect(backvagFeature({ id: 1, lineType: 'ditch', backvag: { ande: 'slut' } }, koord)).toBeNull();
    expect(backvagFeature({ id: 1, lineType: 'mainRoad', backvag: { ande: 'slut' } }, [[14, 56.5]])).toBeNull();
    expect(backvagFeature({ id: 1, lineType: 'mainRoad', backvag: { ande: 'sidan' } }, koord)).toBeNull();
  });
});
