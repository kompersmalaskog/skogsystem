// Överläggens reglage ("Kartan syns ↔ Bara lagret"): vad som styrs, startvärden = lagrens eget värde, och att högar, GROT, spår, markeringar och fara aldrig nås.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RASTER_STANDARD, VEKTOR_PREFIX, harReglage, laggPaOpacitet, nyttSkalaMinne, opacitetsMal, tillampaLagerOpacitet } from './lagerOpacitet';
import { wmsLayerGroups } from './mapLayers';

const sida = fs.readFileSync(path.join(process.cwd(), 'app/planering/page.tsx'), 'utf8');

/** En minimal kartfejk: lager med typ + paint, getPaintProperty/setPaintProperty som MapLibre. */
function fejk(lager: Record<string, { type: string; paint: Record<string, any> }>) {
  const satta: string[] = [];
  const map = {
    getLayer: (id: string) => (lager[id] ? { id, type: lager[id].type } : undefined),
    getStyle: () => ({ layers: Object.keys(lager).map((id) => ({ id })) }),
    getPaintProperty: (id: string, k: string) => lager[id].paint[k],
    setPaintProperty: (id: string, k: string, v: any) => { lager[id].paint[k] = v; satta.push(`${id}|${k}`); },
  };
  return { map, lager, satta };
}

describe('startvärden = lagrens eget värde (page.tsx skapar dem; tabellen får inte glida isär)', () => {
  const m = /const wmsLayerDefs = \[([\s\S]*?)\n    \];/.exec(sida);
  const rader = (m?.[1] ?? '').split('\n').filter((r) => r.includes("{ id: '"));
  it('varje WMS-lager i page.tsx har en post i RASTER_STANDARD med samma opacitet (0,7 om inget anges)', () => {
    expect(rader.length).toBeGreaterThan(25);
    for (const r of rader) {
      const id = /\{ id: '([^']+)'/.exec(r)![1];
      const op = /opacity: ([0-9.]+)/.exec(r)?.[1];
      expect(RASTER_STANDARD[id], id).toBe(op ? Number(op) : 0.7);
    }
  });
  it('Körbarhet 0,7 och VIDA-kartbild 0,8 som lagren i page.tsx', () => {
    expect(sida).toMatch(/id: 'wms-layer-korbarhet'[^\n]*'raster-opacity': 0\.7/);
    expect(sida).toMatch(/id: 'vida-layer'[\s\S]{0,200}'raster-opacity': 0\.8/);
    expect(RASTER_STANDARD.korbarhet).toBe(0.7); expect(RASTER_STANDARD.vidaKartbild).toBe(0.8);
  });
  it('reglagets startvärde är lagrets värde i procent, i steg om 5', () => {
    expect(opacitetsMal('sks_markfuktighet', [])).toMatchObject({ slag: 'raster', standardProcent: 70, lager: ['wms-layer-sks_markfuktighet'] });
    expect(opacitetsMal('lm_skuggning', [])?.standardProcent).toBe(35);
    expect(opacitetsMal('nmd_tradslag', [])?.standardProcent).toBe(65);
    expect(opacitetsMal('lm_ortofoto', [])?.standardProcent).toBe(100);
    expect(opacitetsMal('vidaKartbild', [])).toMatchObject({ standardProcent: 80, lager: ['vida-layer'] });
  });
  it('varje rad i Lager-menyns WMS-grupper med ett kartlager har ett reglage (Markfuktighet, Nyckelbiotoper, RAÄ …)', () => {
    for (const g of wmsLayerGroups) for (const l of g.layers) {
      if (l.meny === false) continue;
      if (l.id === 'brandrisk') continue;   // SMHI:s API, inget kartlager
      expect(harReglage(l.id), `${g.group}/${l.id}`).toBe(true);
    }
    for (const id of ['sks_markfuktighet', 'nyckelbiotoper', 'fornlamningar', 'fastighetsgrans', 'hansyn', 'traktNyckelbiotop', 'traktLamning', 'wetlands', 'hydrografi', 'korbarhet', 'vidaKartbild']) expect(harReglage(id), id).toBe(true);
  });
});

describe('vad som aldrig får ett reglage: produktionshögar, GROT, spår, markeringar och fara', () => {
  const ALLA = ['hogar-circle', 'hogar-cluster', 'hogar-hit', 'grot-circle', 'grot-shadow', 'hyttspar-egen-line', 'planspar-skordare-line', 'markers-layer', 'trakt-kraftledning-line', 'trakt-basvag-line', 'trakt-ragang-linje', 'trakt-hansyn-fill'];
  it('ingen post för högar, GROT, spår, Kör & fara, brandrisk, prickar, markeringar', () => {
    for (const id of ['produktionshogar', 'grothogar', 'mittSpar', 'andrasSpar', 'korFara', 'brandrisk', 'symbols', 'lines', 'zones', 'arrows', 'kompass']) {
      expect(harReglage(id), id).toBe(false);
      expect(opacitetsMal(id, ALLA), id).toBeNull();
    }
  });
  it('de vektorlager som skalas är Vidas hänsyn, nyckelbiotop, fornlämning och rågång — aldrig kraftledning, basväg eller träffytor', () => {
    expect(Object.keys(VEKTOR_PREFIX).sort()).toEqual(['fastighetsgrans', 'hansyn', 'traktLamning', 'traktNyckelbiotop']);
    const alla = ['trakt-hansyn-fill', 'trakt-hansyn-line', 'trakt-nb-fill', 'trakt-raa-point', 'trakt-ragang-hit', 'trakt-ragang-linje-kant', 'wms-layer-fastighetsgranser', 'wms-layer-fastighetsgranser-kant', 'trakt-kraftledning-line', 'trakt-basvag-line', 'hogar-circle'];
    expect(opacitetsMal('hansyn', alla)?.lager).toEqual(['trakt-hansyn-fill', 'trakt-hansyn-line']);
    expect(opacitetsMal('traktNyckelbiotop', alla)?.lager).toEqual(['trakt-nb-fill']);
    expect(opacitetsMal('traktLamning', alla)?.lager).toEqual(['trakt-raa-point']);
    expect(opacitetsMal('fastighetsgrans', alla)?.lager).toEqual(['trakt-ragang-linje-kant', 'wms-layer-fastighetsgranser', 'wms-layer-fastighetsgranser-kant']);   // aldrig -hit
  });
  it('källvakt: de nya filerna nämner varken högar, GROT, spår eller larm', () => {
    for (const f of ['lib/lagerOpacitet.ts', 'lib/kartReglage.ts', 'lib/hooks/useKartReglage.ts']) {
      const t = fs.readFileSync(path.join(process.cwd(), f), 'utf8').split('\n').filter((r) => !r.trim().startsWith('//') && !r.trim().startsWith('*') && !r.trim().startsWith('/*')).join('\n');
      expect(t, f).not.toMatch(/hogar|grot-|hyttspar|planspar|kraftledning-|basvag|larm-|marker/i);
    }
  });
});

describe('att lägga reglaget på kartan', () => {
  it('raster: opaciteten blir procent/100, absolut', () => {
    const { map, lager } = fejk({ 'wms-layer-sks_markfuktighet': { type: 'raster', paint: { 'raster-opacity': 0.7 } } });
    laggPaOpacitet(map, 'wms-layer-sks_markfuktighet', 'raster', 40, nyttSkalaMinne());
    expect(lager['wms-layer-sks_markfuktighet'].paint['raster-opacity']).toBe(0.4);
  });
  it('vektor: lagrets eget värde multipliceras — tal blir tal, uttryck blir ett uttryck; 100 ger det ursprungliga tillbaka', () => {
    const uttryck = ['case', ['==', ['get', '_fokus'], 'ute'], 0.3, 1];
    const { map, lager } = fejk({ 'trakt-hansyn-line': { type: 'line', paint: { 'line-opacity': uttryck } }, 'trakt-hansyn-fill': { type: 'fill', paint: { 'fill-opacity': 0.18 } } });
    const minne = nyttSkalaMinne();
    laggPaOpacitet(map, 'trakt-hansyn-line', 'vektor', 50, minne);
    laggPaOpacitet(map, 'trakt-hansyn-fill', 'vektor', 50, minne);
    expect(lager['trakt-hansyn-line'].paint['line-opacity']).toEqual(['*', 0.5, uttryck]);
    expect(lager['trakt-hansyn-fill'].paint['fill-opacity']).toBe(0.09);
    laggPaOpacitet(map, 'trakt-hansyn-line', 'vektor', 30, minne);   // en gång till: multipliceras inte ovanpå sig själv
    expect(lager['trakt-hansyn-line'].paint['line-opacity']).toEqual(['*', 0.3, uttryck]);
    laggPaOpacitet(map, 'trakt-hansyn-line', 'vektor', 100, minne);
    laggPaOpacitet(map, 'trakt-hansyn-fill', 'vektor', 100, minne);
    expect(lager['trakt-hansyn-line'].paint['line-opacity']).toEqual(uttryck);
    expect(lager['trakt-hansyn-fill'].paint['fill-opacity']).toBe(0.18);
  });
  it('ändrar annan kod lagrets värde efteråt räknas det nya som det ursprungliga (inget gammalt värde återställs)', () => {
    const { map, lager } = fejk({ 'trakt-nb-fill': { type: 'fill', paint: { 'fill-opacity': 0.1 } } });
    const minne = nyttSkalaMinne();
    laggPaOpacitet(map, 'trakt-nb-fill', 'vektor', 50, minne);
    lager['trakt-nb-fill'].paint['fill-opacity'] = 0.4;   // t.ex. körvyn byter fyllning
    laggPaOpacitet(map, 'trakt-nb-fill', 'vektor', 50, minne);
    expect(lager['trakt-nb-fill'].paint['fill-opacity']).toBe(0.2);
  });
  it('symbol- och cirkellager skalas på alla sina opacitetsegenskaper', () => {
    const { map, lager } = fejk({ 'trakt-raa-point': { type: 'circle', paint: { 'circle-opacity': 1, 'circle-stroke-opacity': 1 } }, 'trakt-raa-label': { type: 'symbol', paint: { 'icon-opacity': 1, 'text-opacity': 1 } } });
    const minne = nyttSkalaMinne();
    laggPaOpacitet(map, 'trakt-raa-point', 'vektor', 60, minne); laggPaOpacitet(map, 'trakt-raa-label', 'vektor', 60, minne);
    expect(lager['trakt-raa-point'].paint).toEqual({ 'circle-opacity': 0.6, 'circle-stroke-opacity': 0.6 });
    expect(lager['trakt-raa-label'].paint).toEqual({ 'icon-opacity': 0.6, 'text-opacity': 0.6 });
  });
  it('ett lager som inte finns (ännu) och en karta som kastar får aldrig fälla något', () => {
    const { map } = fejk({});
    expect(() => laggPaOpacitet(map, 'finns-inte', 'raster', 50, nyttSkalaMinne())).not.toThrow();
    const trasig = { getLayer: () => { throw new Error('kartan borta'); }, getStyle: () => { throw new Error('kartan borta'); } };
    expect(() => laggPaOpacitet(trasig, 'a', 'raster', 50, nyttSkalaMinne())).not.toThrow();
    expect(() => tillampaLagerOpacitet(trasig, { sks_markfuktighet: 50 }, nyttSkalaMinne())).not.toThrow();
  });
  it('tillampaLagerOpacitet rör bara överlägg med eget värde — högar, GROT och spår orörda även när allt är satt till 15', () => {
    const pile = { type: 'symbol', paint: { 'icon-opacity': 1, 'text-opacity': 1 } };
    const f = fejk({
      'wms-layer-sks_markfuktighet': { type: 'raster', paint: { 'raster-opacity': 0.7 } },
      'wms-layer-nyckelbiotoper': { type: 'raster', paint: { 'raster-opacity': 0.7 } },
      'hogar-circle': structuredClone(pile), 'hogar-cluster': { type: 'circle', paint: { 'circle-opacity': 0.8 } }, 'grot-circle': { type: 'circle', paint: { 'circle-opacity': 1 } },
      'hyttspar-egen-line': { type: 'line', paint: { 'line-opacity': 0.9 } }, 'trakt-kraftledning-line': { type: 'line', paint: { 'line-opacity': 1 } },
    });
    const fore = structuredClone(f.lager);
    tillampaLagerOpacitet(f.map, { sks_markfuktighet: 15, produktionshogar: 15, grothogar: 15, mittSpar: 15, korFara: 15 }, nyttSkalaMinne());
    expect(f.lager['wms-layer-sks_markfuktighet'].paint['raster-opacity']).toBe(0.15);
    expect(f.lager['wms-layer-nyckelbiotoper'].paint['raster-opacity']).toBe(0.7);   // inget eget värde → orört
    for (const id of ['hogar-circle', 'hogar-cluster', 'grot-circle', 'hyttspar-egen-line', 'trakt-kraftledning-line']) expect(f.lager[id], id).toEqual(fore[id]);
    expect(f.satta).toEqual(['wms-layer-sks_markfuktighet|raster-opacity']);
  });
});
