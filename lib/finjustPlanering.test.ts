import { MALBILDER, MALBILD_ORDNING, malbildNyckel } from './malbilder';
import { describe, it, expect } from 'vitest';
import { planMiljoRader } from './miljokrav';
import { certTyper, CERT_INFO } from './certKrav';
import { ytaObjekt } from './larm/objekt';
import { FALLNING_YTA, larmRegelText, YTA } from './larm/grupper';
import { ZONE_COLORS } from './zone-colors';
import { YTA_FORKLARING } from './symboler';

// Martin 2026-11-02 (planeringen av Bondeskog).
describe('räknarna i planeringens namnfält', () => {
  it('antal av krav, grönt när kravet är uppfyllt', () => {
    expect(planMiljoRader({ hogstubbar: 3, evighetstrad: 26 }, { hogstubbar: 8, evighetstrad: 26 })).toEqual([
      { text: 'Högstubbar 3/8', klar: false }, { text: 'Evighetsträd 26/26', klar: true },
    ]);
  });
  it('ej certifierat: bara antalet, och inget alls när inget är satt', () => {
    expect(planMiljoRader({ hogstubbar: 2, evighetstrad: 0 }, { hogstubbar: null, evighetstrad: null })).toEqual([{ text: 'Högstubbar 2', klar: false }]);
    expect(planMiljoRader({ hogstubbar: 0, evighetstrad: 0 }, { hogstubbar: null, evighetstrad: null })).toBeNull();
  });
});

describe('certifieringen', () => {
  it('läser PEFC och FSC ur objekt.cert, aldrig ur "Ej certifierad"', () => {
    expect(certTyper('FSC PEFC')).toEqual(['PEFC', 'FSC']);
    expect(certTyper('PEFC')).toEqual(['PEFC']);
    expect(certTyper('Ej certifierad')).toEqual([]);
    expect(certTyper(null)).toEqual([]);
  });
  it('varje krav har en källa; FSC högstubbar är 3/ha och inte längre okontrollerat', () => {
    for (const info of Object.values(CERT_INFO)) for (const k of info.krav) expect(k.kalla, k.rubrik).toBeTruthy();
    expect(CERT_INFO.FSC.krav.find((k) => k.rubrik === 'Högstubbar')?.kontrollera).toBeUndefined();
    expect(CERT_INFO.FSC.krav.find((k) => k.rubrik === 'Högstubbar')?.text).toMatch(/3 högstubbar per hektar/);
  });
});

describe('Målbilder kant och stubbe', () => {
  it('ytan Fäll inte ut här och fastighetsgränsen visar målbilden kant; stubben står först i listan', () => {
    expect(malbildNyckel('yta', 'ungskog')).toBe('kant');
    expect(malbildNyckel('linje', 'fastighetsgrans')).toBe('kant');
    expect(MALBILD_ORDNING.slice(0, 2)).toEqual(['stubbe', 'kant']);
    expect(MALBILDER.kant.rader.join(' ')).toMatch(/grannens mark/);
    expect(MALBILDER.stubbe.rader.join(' ')).toMatch(/ryggen/);
    expect(YTA.ungskog.namn).toBe('Fäll inte ut här');
  });
});

describe('Ungskog', () => {
  it('larmar aldrig men färgar fällningscirkeln grön', () => {
    expect(ytaObjekt({ id: 1, zoneType: 'ungskog', ring: [] }, { lat: 0, lon: 0 })).toBeNull();
    expect(larmRegelText({ grupp: 'natur', typ: 'ungskog' })).toBe('Larmar inte');
    expect(FALLNING_YTA.ungskog).toBe('natur');
    expect(YTA.ungskog.forbjuden).toBe(false);
    expect(ZONE_COLORS.ungskog).toBeTruthy();
    expect(YTA_FORKLARING.ungskog).toBeTruthy();
  });
  it('Hänsyn larmar fortfarande', () => {
    expect(ytaObjekt({ id: 1, zoneType: 'protected', ring: [] }, { lat: 0, lon: 0 })).not.toBeNull();
  });
});
