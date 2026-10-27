import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RANG, flyttarFor, harEgenRegel, installeraLagerOrdning, lagerRang, onskadOrdning, ordnaLager, symbolSortKey, VAG_SORT_KEY, type LagerInfo, type LagerKarta } from './lagerOrdning';
import { SYMBOL_GRUPP } from './larm/grupper';

const rot = join(__dirname, '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const rang = (id: string, type?: string) => lagerRang({ id, type });

// Representanter för varje steg i Martins ordning, nerifrån och upp.
const STEG: Array<[string, string[]]> = [
  ['bakgrund', ['bg', 'osm-layer', 'satellite-layer', 'lm-layer', 'terrain-layer', 'hillshade-korvy', 'lm-skuggning-layer', 'vida-layer', 'wms-layer-fastighetsgranser']],
  ['ytor', ['zone-fill', 'zone-hatch-natur', 'zone-outline', 'klart-yta-line', 'trakt-hansyn-fill', 'trakt-nb-fill', 'trakt-raa-fill']],
  ['hyttspår', ['hyttspar-hist-line', 'hyttspar-andras-line', 'hyttspar-egen-line', 'planspar-skordare-line', 'planspar-skotare-line']],
  ['traktgräns/rågång', ['line-boundary-base', 'line-boundary-stripe', 'trakt-gr-line', 'grans-fill', 'hornedit-base']],
  ['basvägar/stickvägar', ['line-mainRoad-casing', 'line-mainRoad-base', 'line-mainRoad-stripe', 'line-sideRoadRed-base', 'line-sideRoadBlue-base', 'trakt-basvag-line']],
  ['linjer (stenmur, dike, ledning)', ['line-stonewall-base', 'line-ditch-base', 'line-powerline-line', 'line-powerline-symbol', 'line-nature-base', 'trakt-kraftledning-line']],
  ['symboler', ['markers-layer', 'markers-prick', 'arrows-layer', 'trakt-punkt-circle', 'skotar-avlagg-ruta', 'hogar-circle']],
  ['etiketter', ['trakt-punkt-label', 'zone-label', 'yta-nr-label', 'markers-korvy-label', 'trakt-hansyn-label']],
  ['egen position', ['gps-dot', 'gps-ring', 'maskin-symbol', 'gps-osakerhet-fyll']],
];

describe('lagerordningen: bakgrund → ytor → hyttspår → traktgräns → vägar → linjer → symboler → etiketter → egen position', () => {
  it('varje steg ligger över alla steg under det (och varje lager tillhör sitt steg)', () => {
    let forra = -Infinity;
    for (const [namn, ids] of STEG) {
      const r = ids.map((id) => rang(id));
      expect(Math.min(...r), `${namn}: ${ids.join(', ')}`).toBeGreaterThan(forra);
      forra = Math.max(...r);
    }
  });
  it('stenmuren ligger över maskinernas spår och över basvägen (felet: den hamnade under spåren)', () => {
    for (const mur of ['line-stonewall-base', 'line-stonewall-casing']) {
      for (const under of ['hyttspar-egen-line', 'hyttspar-andras-line', 'hyttspar-hist-line', 'planspar-skordare-line', 'planspar-skotare-line', 'line-mainRoad-base', 'line-sideRoadRed-base', 'line-boundary-base', 'trakt-gr-line']) {
        expect(rang(mur), `${mur} över ${under}`).toBeGreaterThan(rang(under));
      }
    }
    expect(rang('line-ditch-base')).toBeGreaterThan(rang('line-mainRoad-base'));
    expect(rang('line-powerline-line')).toBeGreaterThan(rang('hyttspar-egen-line'));
  });
  it('symbolerna ligger över spåren, vägarna och linjerna; etiketterna över symbolerna; egen position överst', () => {
    for (const under of ['hyttspar-egen-line', 'line-mainRoad-base', 'line-stonewall-base', 'line-powerline-line']) expect(rang('markers-layer')).toBeGreaterThan(rang(under));
    expect(rang('trakt-punkt-label')).toBeGreaterThan(rang('markers-layer'));
    expect(rang('gps-dot')).toBeGreaterThan(rang('trakt-punkt-label'));
    expect(rang('gps-dot')).toBeGreaterThan(rang('drawing-line'));
  });
  it('spåren ligger UNDER basvägen: skördarens spår syns men aldrig över vägen', () => {
    expect(rang('hyttspar-andras-casing')).toBeLessThan(rang('line-mainRoad-casing'));
    expect(rang('hyttspar-egen-line')).toBeLessThan(rang('line-mainRoad-casing'));
  });
  it('inom hyttspåren: skördarens under skotarens, tidigare dagar < den andres < eget', () => {
    expect(rang('hyttspar-hist-line')).toBeLessThan(rang('hyttspar-andras-line'));
    expect(rang('hyttspar-andras-line')).toBeLessThan(rang('hyttspar-egen-line'));
    expect(rang('planspar-skordare-line')).toBeLessThan(rang('planspar-skotare-line'));
  });
  it('körordningens sken ligger UNDER väglagren, pilen över; larmet över symbolerna; framhävningens glöd under linjerna men ringen över symbolerna', () => {
    expect(rang('line-kor-sken')).toBeLessThan(rang('line-mainRoad-casing'));
    expect(rang('lines-korvy-mainroad-glow')).toBeLessThan(rang('line-mainRoad-casing'));
    expect(rang('line-kor-pil')).toBeGreaterThan(rang('line-mainRoad-stripe'));
    expect(rang('larm-pin')).toBeGreaterThan(rang('markers-layer'));
    expect(rang('omtrakten-framhav-glod')).toBeLessThan(rang('line-mainRoad-casing'));
    expect(rang('omtrakten-framhav-ring')).toBeGreaterThan(rang('markers-layer'));
  });
  it('ett lager utan regel får rang av sin typ — aldrig överst av en slump', () => {
    expect(rang('okant-lager', 'raster')).toBe(RANG.bakgrund);
    expect(rang('okant-lager', 'fill')).toBe(RANG.ytor);
    expect(rang('okant-lager', 'line')).toBe(RANG.linjer);
    expect(lagerRang({ id: 'okant-lager', type: 'symbol', harText: true, harIkon: false })).toBe(RANG.etiketter);
    expect(lagerRang({ id: 'okant-lager', type: 'symbol', harText: false, harIkon: true })).toBe(RANG.symboler);
    expect(rang('okant-lager', 'circle')).toBe(RANG.symboler);
  });
});

describe('sorteringen', () => {
  const lager = (...ids: string[]): LagerInfo[] => ids.map((id) => ({ id }));
  it('stabil: lager med samma rang behåller sin inbördes ordning', () => {
    expect(onskadOrdning(lager('zone-fill', 'trakt-nb-fill', 'zone-outline'))).toEqual(['zone-fill', 'trakt-nb-fill', 'zone-outline']);
  });
  it('Mölleryds fel: spåren lades till sist och hamnade över stenmuren → nu ligger stenmuren över', () => {
    const o = onskadOrdning(lager('osm-layer', 'zone-fill', 'line-mainRoad-base', 'line-stonewall-base', 'markers-layer', 'hyttspar-egen-casing', 'hyttspar-egen-line', 'gps-dot'));
    expect(o).toEqual(['osm-layer', 'zone-fill', 'hyttspar-egen-casing', 'hyttspar-egen-line', 'line-mainRoad-base', 'line-stonewall-base', 'markers-layer', 'gps-dot']);
  });
  it('flyttarFor ger exakt de flyttar som behövs, och noll när ordningen redan är rätt', () => {
    const nu = ['osm-layer', 'line-stonewall-base', 'hyttspar-egen-line', 'markers-layer'];
    const onskad = onskadOrdning(lager(...nu));
    const flyttar = flyttarFor(nu, onskad);
    expect(flyttar.length).toBeGreaterThan(0);
    const spela = [...nu];
    for (const f of flyttar) { spela.splice(spela.indexOf(f.id), 1); const i = f.fore ? spela.indexOf(f.fore) : spela.length; spela.splice(i, 0, f.id); }
    expect(spela).toEqual(onskad);
    expect(flyttarFor(onskad, onskad)).toEqual([]);
  });
  it('slumpade ordningar av alla steg sorteras alltid till samma resultat (och hamnar rätt)', () => {
    const alla = STEG.flatMap(([, ids]) => ids);
    for (let seed = 1; seed <= 20; seed++) {
      let x = seed * 9301;
      const slump = [...alla].sort(() => { x = (x * 49297 + 233280) % 233281; return x / 233281 - 0.5; });
      const onskad = onskadOrdning(slump.map((id) => ({ id })));
      const spela = [...slump];
      for (const f of flyttarFor(slump, onskad)) { spela.splice(spela.indexOf(f.id), 1); const i = f.fore ? spela.indexOf(f.fore) : spela.length; spela.splice(i, 0, f.id); }
      expect(spela).toEqual(onskad);
      const r = onskad.map((id) => rang(id));
      expect(r).toEqual([...r].sort((a, b) => a - b));
    }
  });
});

describe('kopplingen till kartan', () => {
  function falskKarta(start: string[]) {
    let ordning = [...start];
    const lyssnare: Array<() => void> = [];
    const flyttat: string[] = [];
    const karta: LagerKarta & { ordning: () => string[]; flyttat: string[]; laggTill: (id: string) => void; emit: () => void } = {
      getLayersOrder: () => [...ordning],
      getLayer: (id: string) => (ordning.includes(id) ? { type: id.startsWith('markers') ? 'symbol' : 'line' } : undefined),
      moveLayer: (id: string, fore?: string) => { flyttat.push(id); ordning = ordning.filter((x) => x !== id); const i = fore ? ordning.indexOf(fore) : ordning.length; ordning.splice(i < 0 ? ordning.length : i, 0, id); },
      getLayoutProperty: () => undefined,
      on: (_t: string, fn: () => void) => { lyssnare.push(fn); },
      off: () => {},
      ordning: () => [...ordning], flyttat,
      laggTill: (id: string) => { ordning.push(id); },
      emit: () => lyssnare.forEach((f) => f()),
    };
    return karta;
  }
  it('ordnaLager lägger om och är idempotent', () => {
    const k = falskKarta(['osm-layer', 'line-stonewall-base', 'hyttspar-egen-line', 'markers-layer', 'gps-dot']);
    expect(ordnaLager(k)).toBeGreaterThan(0);
    expect(k.ordning()).toEqual(['osm-layer', 'hyttspar-egen-line', 'line-stonewall-base', 'markers-layer', 'gps-dot']);
    expect(ordnaLager(k)).toBe(0);
  });
  it('ett lager som läggs till senare (spåren när körvyn öppnas) hamnar rätt vid nästa styledata — och en omläggning som inget behöver flytta ger ingen ny flytt', async () => {
    const k = falskKarta(['osm-layer', 'line-stonewall-base', 'markers-layer', 'gps-dot']);
    installeraLagerOrdning(k);
    await new Promise((r) => setTimeout(r, 30));
    k.laggTill('hyttspar-egen-line');   // läggs sist = överst
    k.emit();
    await new Promise((r) => setTimeout(r, 30));
    expect(k.ordning().indexOf('hyttspar-egen-line')).toBeLessThan(k.ordning().indexOf('line-stonewall-base'));
    const antal = k.flyttat.length;
    k.emit(); k.emit();
    await new Promise((r) => setTimeout(r, 30));
    expect(k.flyttat.length).toBe(antal);
  });
  it('installeras högst en gång per karta', () => {
    const k = falskKarta(['osm-layer']);
    installeraLagerOrdning(k); installeraLagerOrdning(k);
    k.emit();
  });
});

describe('röd fara överst bland symbolerna', () => {
  const fara = Object.keys(SYMBOL_GRUPP).filter((t) => SYMBOL_GRUPP[t] === 'fara');
  it('symbol-sort-key ger faror 2 och övriga symboler 1', () => {
    const k = symbolSortKey(fara);
    expect(k[0]).toBe('case');
    expect(k[1][2][1]).toEqual(fara);   // ['in', ['get','type'], ['literal', fara]]
    expect(k.slice(2)).toEqual([2, 1]);
    expect(fara.length).toBeGreaterThan(0);
  });
  it('väglagren sorterar nu-vägen överst och en körd väg underst', () => {
    expect(VAG_SORT_KEY).toEqual(['case', ['==', ['get', 'kor'], 'nu'], 2, ['==', ['get', 'kor'], 'klar'], 0, 1]);
  });
});

describe('vakt: varje lager i koden har en regel — ett nytt lager kan inte hamna "överst av en slump"', () => {
  it('alla statiska lager-id:n i planeringssidan och lagerbyggarna har en egen regel i tabellen', () => {
    const filer = ['app/planering/page.tsx', 'lib/kartstil.ts', 'lib/korordningKarta.ts', 'lib/korUpp.ts', 'lib/fallTrad.ts', 'lib/tvaTryck.ts', 'lib/hooks/useLinjeRedigering.ts', 'lib/omTraktenFramhavKarta.ts'];
    const saknas: string[] = [];
    let antal = 0;
    for (const f of filer) {
      for (const m of las(f).matchAll(/id: '([a-zA-Z0-9_-]+)',\s*\n?\s*type: '(line|fill|symbol|circle|raster|background|hillshade)'/g)) {
        antal++;
        if (!harEgenRegel(m[1])) saknas.push(`${f}: ${m[1]} (${m[2]})`);
      }
    }
    expect(antal).toBeGreaterThan(60);
    expect(saknas).toEqual([]);
  });
  it('de dynamiska id-mönstren har regler: zonernas ytor, väglagren per typ, planspår, WMS-underlag', () => {
    for (const id of ['zone-hatch-natur', 'line-sideRoadYellow-stripe', 'line-nature-base', 'line-trail-casing', 'planspar-skotare-casing', 'wms-layer-sks_markfuktighet']) expect(harEgenRegel(id), id).toBe(true);
  });
  it('sidan installerar ordningen, sorterar röda faror överst och nu-vägen överst — och har inga egna moveLayer-regler för spår och symboler kvar', () => {
    const sida = las('app/planering/page.tsx');
    expect(sida).toContain('installeraLagerOrdning(map);');
    expect(sida).toContain("'symbol-z-order': 'auto',");
    expect(sida).toContain("'symbol-sort-key': symbolSortKey(Array.from(KORVY_FARO_TYPER)),");
    expect(sida.match(/'line-sort-key': VAG_SORT_KEY/g)?.length).toBe(3);   // kant, fyllning och streck
    expect(sida).toContain("...BASVAG_STRECK_LAYOUT, 'line-sort-key': VAG_SORT_KEY");
    expect(sida).not.toContain('KORVY_Z_ORDNING');
    expect(sida).not.toMatch(/map\.moveLayer\(`planspar-/);
  });
});
