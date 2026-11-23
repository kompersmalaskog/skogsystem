// Lugnare körvy: etiketter bara inom 100 m. Faror, kultur och Viktigt syns alltid.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALLTID_TEXTLAGER, NARA_TEXTLAGER, NARA_TEXTLAGER_ID, TEXT_RADIE_M, aterstallTextRadie, naraFilter, textCirkelNyckel, tillampaTextRadie } from './korvyText';
import { YTA } from './larm/grupper';

const sida = readFileSync('app/planering/page.tsx', 'utf8');

function falskKarta(lager: Record<string, any[] | null>) {
  const filter: Record<string, any> = { ...lager };
  return {
    filter,
    getLayer: (id: string) => (id in filter ? {} : undefined),
    getFilter: (id: string) => filter[id],
    setFilter: (id: string, f: any) => { filter[id] = f; },
  };
}

describe('vilka etiketter som begränsas', () => {
  it('Hänsyn, Övrigt, nyckelbiotop, avläggsnummer, områdesnummer och egna ytors namn är nära-text', () => {
    expect([...NARA_TEXTLAGER_ID].sort()).toEqual(['trakt-hansyn-label', 'trakt-nb-label', 'trakt-ovrigt-label', 'trakt-punkt-label', 'yta-nr-label', 'zone-label']);
  });
  it('faror, kultur och Viktigt står aldrig i listan', () => {
    for (const id of ALLTID_TEXTLAGER) expect(NARA_TEXTLAGER_ID).not.toContain(id);
    expect(ALLTID_TEXTLAGER).toEqual(['markers-korvy-label', 'trakt-raa-label', 'viktigt-etikett']);
  });
  it('egna kulturytor (zone-label) är undantagna — alla ytor i gruppen Kultur', () => {
    const zone = NARA_TEXTLAGER.find((l) => l.id === 'zone-label')!;
    const kultur = Object.keys(YTA).filter((t) => YTA[t].grupp === 'kultur');
    expect(kultur.length).toBeGreaterThan(0);
    expect(zone.undantag).toEqual(['in', ['get', 'zoneType'], ['literal', kultur]]);
    // och inget annat lager har något undantag
    expect(NARA_TEXTLAGER.filter((l) => l.id !== 'zone-label').every((l) => !l.undantag)).toBe(true);
  });
  it('radien är 100 m', () => { expect(TEXT_RADIE_M).toBe(100); });
});

describe('filtret', () => {
  const cirkel = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  it('originalet ligger först (polygoner filtreras bort innan within prövas) och within sist', () => {
    expect(naraFilter(['==', ['get', 'a'], 1], cirkel)).toEqual(['all', ['==', ['get', 'a'], 1], ['within', cirkel]]);
  });
  it('med undantag: undantaget ELLER inom cirkeln', () => {
    expect(naraFilter(['has', 'x'], cirkel, ['==', 1, 1])).toEqual(['all', ['has', 'x'], ['any', ['==', 1, 1], ['within', cirkel]]]);
  });
  it('lager utan originalfilter får bara within', () => { expect(naraFilter(null, cirkel)).toEqual(['within', cirkel]); });
});

describe('tillämpa på kartan', () => {
  const orig = ['==', ['get', 'k'], 1];
  const lager = () => Object.fromEntries([...NARA_TEXTLAGER_ID, ...ALLTID_TEXTLAGER].map((id) => [id, id === 'zone-label' ? ['in', ['get', 'zoneType'], ['literal', ['wet']]] : orig]));
  it('rör bara nära-lagren; faror, kultur och Viktigt behåller sitt filter', () => {
    const k = falskKarta(lager());
    const fore = JSON.stringify(k.filter);
    tillampaTextRadie(k, { lat: 57, lon: 15 });
    for (const id of ALLTID_TEXTLAGER) expect(JSON.stringify(k.filter[id])).toBe(JSON.stringify(JSON.parse(fore)[id]));
    for (const id of NARA_TEXTLAGER_ID) expect(JSON.stringify(k.filter[id])).toContain('within');
    aterstallTextRadie(k);
  });
  it('utan position visas all text (ursprungliga filter)', () => {
    const k = falskKarta(lager());
    const fore = JSON.stringify(k.filter);
    tillampaTextRadie(k, null);
    expect(JSON.stringify(k.filter)).toBe(fore);
  });
  it('flyttas cirkeln lindas originalet inte in en gång till; och körvyn stängs → originalen tillbaka', () => {
    const k = falskKarta(lager());
    const fore = JSON.stringify(k.filter);
    tillampaTextRadie(k, { lat: 57, lon: 15 });
    tillampaTextRadie(k, { lat: 57.001, lon: 15.001 });
    expect((JSON.stringify(k.filter['trakt-hansyn-label']).match(/within/g) ?? []).length).toBe(1);
    aterstallTextRadie(k);
    expect(JSON.stringify(k.filter)).toBe(fore);
  });
  it('ett lager som inte finns än hoppas över utan kast', () => {
    const k = falskKarta({ 'zone-label': orig });
    expect(() => tillampaTextRadie(k, { lat: 57, lon: 15 })).not.toThrow();
  });
  it('cirkeln flyttas först när maskinen rört sig ~10 m', () => {
    const a = textCirkelNyckel({ lat: 57.00001, lon: 15.00001 });
    expect(textCirkelNyckel({ lat: 57.00002, lon: 15.00002 })).toBe(a);            // 1–2 m: samma nyckel
    expect(textCirkelNyckel({ lat: 57.0003, lon: 15.00001 })).not.toBe(a);         // ~33 m: ny
    expect(textCirkelNyckel(null)).toBeNull();
  });
});

describe('källvakter mot sidan', () => {
  it('faro-etiketten (markers-korvy-label) har inget avståndsfilter längre', () => {
    const i = sida.indexOf("id: 'markers-korvy-label'");
    const block = sida.slice(i, i + 900);
    expect(block).toContain("filter: ['match', ['get', 'type'], [...KORVY_FARO_TYPER] as any, true, false]");
    expect(block).not.toContain("['get', 'dist']");
  });
  it('dämpningen gäller bara skördarens körvy och går via dampadOpacitet', () => {
    expect(sida).toContain('const dampaPa = korvyActive && !skotarKorvy;');
    expect(sida).toContain("opacity = dampadOpacitet(opacity, { id: String(m.id), typ: m.type, klara: klaraSymboler, harViktigt: viktigtNycklar.has(markerNyckel(m.id)), slaPa: dampaPa });");
  });
  it('Klar-knappen finns bara när dampaPa och symbolen går att dämpa — på både markörkortet och prick-kortet', () => {
    expect(sida).toContain('dampaPa && marker.isMarker && kanDampas(marker.type, viktigtNycklar.has(markerNyckel(marker.id)))');
    expect(sida).toContain('dampaPa && kanDampas(prickValt.typ, viktigtNycklar.has(markerNyckel(prickValt.id)))');
  });
  it('textradien kopplas in av en effekt som återställer när körvyn stängs', () => {
    expect(sida).toContain('if (!korvyActive) { aterstallTextRadie(map as any); return; }');
    expect(sida).toContain('tillampaTextRadie(map as any, korvyEffectivePos);');
  });
  it('sidan skriver aldrig localStorage för Klar själv (allt går genom lib/korvyKlar)', () => {
    expect(sida).not.toContain('korvy_klarsymboler_v1');
  });
});
