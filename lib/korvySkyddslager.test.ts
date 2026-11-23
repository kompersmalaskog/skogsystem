// @vitest-environment jsdom
// KÖRVYNS SKYDDSLAGER GÅR ATT SLÄCKA (Martin 2026-11-23). Reglerna prövas för ALLA sju lagren; "omstart" = nytt läsanrop mot samma localStorage.
// Källvakterna läser app/planering/page.tsx: ingen rad får tvinga lagren synliga igen (det var felet).
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  KORVY_SKYDDSLAGER, SKYDDSLAGER_NYCKEL, hamtaSlackta, skyddslagerNyckel, skyddslagerSynligt, sparaSlackta, tillampaSkyddslager, tolkaSlackta, vaxlaSlackt,
} from './korvySkyddslager';

const SJU = ['nyckelbiotoper', 'biotopskydd', 'vattenskydd', 'naturreservat', 'natura2000', 'sumpskog', 'kraftledningar'];
const GIANT = 'PONS20SDJAA270231';
const H8E = 'R64428';

beforeEach(() => { localStorage.clear(); });

describe('de sju lagren', () => {
  it('är exakt de sju — och fornlämningar är inte med (deras tänd/släck har aldrig tvingats)', () => {
    expect(Array.from(KORVY_SKYDDSLAGER).sort()).toEqual([...SJU].sort());
    expect(KORVY_SKYDDSLAGER.has('fornlamningar')).toBe(false);
  });
});

describe.each(SJU)('lager %s', (lager) => {
  it('ett nytt objekt: tänt', () => {
    expect(skyddslagerSynligt(lager, hamtaSlackta(GIANT, 'obj-1'))).toBe(true);
  });

  it('släck → släckt; omstart (ny läsning) → fortfarande släckt på samma objekt', () => {
    sparaSlackta(GIANT, 'obj-1', vaxlaSlackt(hamtaSlackta(GIANT, 'obj-1'), lager));
    expect(skyddslagerSynligt(lager, hamtaSlackta(GIANT, 'obj-1'))).toBe(false);
    // "omstart": inget minne i sidan, bara localStorage
    expect(skyddslagerSynligt(lager, tolkaSlackta(localStorage.getItem(skyddslagerNyckel(GIANT, 'obj-1')!)))).toBe(false);
  });

  it('ett annat objekt: tänt. Tillbaka till första: släckt', () => {
    sparaSlackta(GIANT, 'obj-1', vaxlaSlackt(hamtaSlackta(GIANT, 'obj-1'), lager));
    expect(skyddslagerSynligt(lager, hamtaSlackta(GIANT, 'obj-2'))).toBe(true);
    expect(skyddslagerSynligt(lager, hamtaSlackta(GIANT, 'obj-1'))).toBe(false);
  });

  it('en annan maskin på samma objekt: tänt (valet är per maskin)', () => {
    sparaSlackta(GIANT, 'obj-1', vaxlaSlackt(hamtaSlackta(GIANT, 'obj-1'), lager));
    expect(skyddslagerSynligt(lager, hamtaSlackta(H8E, 'obj-1'))).toBe(true);
  });

  it('tänder han det igen blir det tänt, och inget släckt lämnas kvar i minnet', () => {
    const slackt = vaxlaSlackt(new Set(), lager);
    sparaSlackta(GIANT, 'obj-1', slackt);
    sparaSlackta(GIANT, 'obj-1', vaxlaSlackt(slackt, lager));
    expect(skyddslagerSynligt(lager, hamtaSlackta(GIANT, 'obj-1'))).toBe(true);
    expect(localStorage.getItem(skyddslagerNyckel(GIANT, 'obj-1')!)).toBeNull();
  });

  it('släckt påverkar inte de andra sex', () => {
    sparaSlackta(GIANT, 'obj-1', vaxlaSlackt(new Set(), lager));
    const s = hamtaSlackta(GIANT, 'obj-1');
    for (const annat of SJU.filter((x) => x !== lager)) expect(skyddslagerSynligt(annat, s)).toBe(true);
  });
});

describe('robusthet', () => {
  it('trasig JSON, fel form och okända id:n ger tänt — aldrig ett kast, aldrig tyst släckt', () => {
    expect(tolkaSlackta('{inte json').size).toBe(0);
    expect(tolkaSlackta('{"a":1}').size).toBe(0);
    expect(tolkaSlackta(null).size).toBe(0);
    expect(Array.from(tolkaSlackta('["vattenskydd","fornlamningar",5]'))).toEqual(['vattenskydd']);
  });

  it('inget objekt → ingen nyckel, ingenting sparas eller läses', () => {
    expect(skyddslagerNyckel(GIANT, null)).toBeNull();
    sparaSlackta(GIANT, null, new Set(['vattenskydd']));
    expect(localStorage.length).toBe(0);
    expect(hamtaSlackta(GIANT, null).size).toBe(0);
  });

  it('blockerad localStorage kastar inte (allt är tänt)', () => {
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blockerad'); } });
    try {
      expect(() => sparaSlackta(GIANT, 'obj-1', new Set(['vattenskydd']))).not.toThrow();
      expect(hamtaSlackta(GIANT, 'obj-1').size).toBe(0);
    } finally { Object.defineProperty(window, 'localStorage', orig); }
  });

  it('en maskin utan val delar nyckeln "ingen"; nyckeln bär maskin, objekt och version', () => {
    expect(skyddslagerNyckel(null, 'obj-1')).toBe(`${SKYDDSLAGER_NYCKEL}:ingen:obj-1`);
    expect(skyddslagerNyckel(GIANT, 'obj-1')).toBe(`${SKYDDSLAGER_NYCKEL}:${GIANT}:obj-1`);
  });

  it('växla rör bara skyddslager', () => {
    expect(Array.from(vaxlaSlackt(new Set(), 'fornlamningar'))).toEqual([]);
  });
});

describe('tillampaSkyddslager sätter synligheten på kartan', () => {
  it('släckta → none, övriga → visible; saknade lager hoppas över utan fel', () => {
    const vis: Record<string, string> = {};
    const finns = new Set(SJU.filter((x) => x !== 'sumpskog').map((x) => 'wms-layer-' + x));
    const karta = { getLayer: (id: string) => (finns.has(id) ? {} : undefined), setLayoutProperty: (id: string, _n: string, v: string) => { vis[id] = v; } };
    tillampaSkyddslager(karta, new Set(['vattenskydd', 'natura2000']));
    expect(vis['wms-layer-vattenskydd']).toBe('none');
    expect(vis['wms-layer-natura2000']).toBe('none');
    expect(vis['wms-layer-nyckelbiotoper']).toBe('visible');
    expect(vis['wms-layer-kraftledningar']).toBe('visible');
    expect(vis['wms-layer-sumpskog']).toBeUndefined();
  });
});

describe('källvakt: page.tsx tvingar inte längre lagren synliga', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'app/planering/page.tsx'), 'utf8');

  it('konstanten bor i lib, inte i sidan, och ingen loop över den sätter "visible" rakt av', () => {
    expect(src).not.toMatch(/const KORVY_SKYDDSLAGER\s*=/);
    for (const m of src.matchAll(/for \(const id of Array\.from\(KORVY_SKYDDSLAGER\)\)[\s\S]{0,300}/g)) expect(m[0]).not.toMatch(/'visibility', 'visible'/);
  });

  it('lagereffekten och defer-effekten går genom tillampaSkyddslager med förarens val', () => {
    expect(src).toMatch(/if \(korvyActive\) tillampaSkyddslager\(map, skyddSlackta\);/);
    expect(src).toMatch(/tillampaSkyddslager\(map, skyddSlacktaRef\.current\);/);
  });

  it('lagerknappen (lagerPa + vaxlaLager + wms-raderna) läser och skriver förarens val i körvyn', () => {
    expect(src).toMatch(/const arKorvySkydd = \(id: string\): boolean => korvyActive && KORVY_SKYDDSLAGER\.has\(id\);/);
    expect(src).toMatch(/lagerPa = \(id: string\): boolean => \(arKorvySkydd\(id\) \? skyddslagerSynligt\(id, skyddSlackta\)/);
    expect(src).toMatch(/if \(arKorvySkydd\(id\)\) \{ vaxlaSkyddslager\(id\); return; \}/);
    expect(src).toMatch(/arKorvySkydd\(l\.id\) \? \(\) => vaxlaLager\(l\.id\) : sla\(l\.id\)/);
  });

  it('sidan använder hooken, och hooken rör inte planeringsvyns val (overlays)', () => {
    expect(src).toMatch(/useKorvySkyddslager\(enhetMaskinId \?\? maskinSomParam \?\? null, valtObjekt\?\.id \? String\(valtObjekt\.id\) : null\)/);
    const hook = fs.readFileSync(path.join(process.cwd(), 'lib/hooks/useKorvySkyddslager.ts'), 'utf8');
    expect(hook).not.toMatch(/overlays|setOverlays/);
  });

  it('varningarna (traktanalysen, närhetslarmen) läser aldrig skyddsvalet: bara lager-, knapp- och effektkoden gör det', () => {
    const rader = src.split('\n').filter((r) => /skyddSlackta|vaxlaSkyddslager|skyddslagerSynligt|tillampaSkyddslager/.test(r));
    for (const r of rader) expect(r, r).not.toMatch(/restriktion|varning|Varning|hit\.type|traktAnalys|nearby|proximity/);
  });
});
