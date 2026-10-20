// Backväg: källvakter för kopplingen i planeringssidan, kartstilen och egenkontrollens karta. Beteendet testas i backvag.test.ts och BackvagVal.render.test.tsx.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SYMBOL_UNDANTAG } from './symbolZoom';
import { backvagFeatureUrData, backvagLager, BACKVAG_KALLA } from './egenkontrollkarta';
import { BACKVAG_STRECK_FARGER } from './backvag';
import { backvagIkonNamn, backvagStreckLager } from './kartstil';

const rot = join(__dirname, '..');
const las = (rel: string) => readFileSync(join(rot, rel), 'utf8');
const page = las('app/planering/page.tsx');

describe('backväg: planeringssidan', () => {
  it('tvärstrecket har egen källa och eget lager med prefixet line- (med i körvyns och skotarlägets whitelist) — vägens egna lager rörs inte', () => {
    expect(page).toContain("map.addSource('backvag-source'");
    expect(page).toContain("map.addLayer(backvagStreckLager('backvag-source', 'line'))");
    const m = page.match(/const KEEP_PREFIX = \[([^\]]*)\];/)!;
    expect(m[1]).toContain("'line-'");
    expect(backvagStreckLager('backvag-source', 'line').id).toBe('line-backvag');
    // vägens linjelager: samma uttryck som före backväg (färg ur farg, gula streck bara utan färg)
    expect(page).toContain("'line-color': isMainRoad ? (BASVAG_FARG_UTTRYCK as any) : lt.color");
    expect(page).toContain("filter: isMainRoad ? ['all', ['==', ['get', 'lineType'], lt.id], BASVAG_UTAN_FARG as any]");
  });
  it('lagret är ett symbollager som inte klipps på zoom (en del av linjen, inte en symbol att gömma) och alla fyra ikonerna registreras', () => {
    expect(SYMBOL_UNDANTAG).toContain('line-backvag');
    expect(page).toContain('for (const f of BACKVAG_STRECK_FARGER)');
    expect(page).toContain('canvasToMapLibreImage(ritaBackvagStreck(f))');
    expect(BACKVAG_STRECK_FARGER).toEqual(['red', 'yellow', 'blue', 'blagul']);
  });
  it('datan byggs i samma effekt som linjerna, och tomställs när objektet saknar position', () => {
    expect(page).toContain('const bvf = backvagFeature(m, coords as [number, number][]);');
    expect(page).toContain("(map.getSource('backvag-source') as any)?.setData({ type: 'FeatureCollection', features: backvagFeatures });");
    expect(page).toMatch(/objektSaknarPosition\) \{ src\.setData\([^;]*\); \(map\.getSource\('backvag-source'\) as any\)\?\.setData\(\{ type: 'FeatureCollection', features: \[\] \}\); return; \}/);
  });
  it('lagret följer sin vägs synlighet i lagerväljaren (en dold väg lämnar inget streck kvar)', () => {
    expect(page).toContain("safeSetVisibility('line-backvag', visibleLayers.lines ? 'visible' : 'none');");
    expect(page).toContain("map.setFilter('line-backvag', ['in', ['get', 'lineType'], ['literal', lineTypeIds.filter((id) => visibleLines[id] !== false)]]);");
  });
  it('kortet: Backväg visas för varje väg (basväg, stickväg) och sparas via medBackvag på markeringen — ingen ny vägtyp', () => {
    expect(page).toContain('marker.isLine && arVagTyp(marker.lineType) && (');
    expect(page).toContain('<BackvagVal backvag={lasBackvag(marker)}');
    expect(page).toContain('medBackvag(m, bv)');
    expect(page).not.toMatch(/lineType: ?'backvag'|\{ id: 'backvag'/);   // ingen linjetyp "backvag"
  });
});

describe('backväg: bara EN modell — egenskapen på vägen', () => {
  it('den gamla Stickväg/Backväg-växeln i snitslingsverktyget och linjetyperna backRoadRed/Yellow/Blue är borta ur all kod (prod hade 0 rader med dem)', () => {
    const filer: string[] = [];
    const gå = (d: string) => { for (const e of readdirSync(join(rot, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) { if (e.name !== 'node_modules') gå(r); } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) filer.push(r); } };
    gå('app'); gå('lib'); gå('components');
    for (const f of filer) {
      const t = las(f);
      expect(t, f).not.toMatch(/backRoad(Red|Yellow|Blue)|isBackRoad|selectedVagType|setSelectedVagType/);
    }
    expect(page).not.toContain("n: 'Backväg' }");   // växelknappen
    expect(page).toContain('const lineId = `sideRoad${eng}`;');   // snitslingen ritar bara stickväg
  });
});

describe('backväg: dubbla tvärstreck (‖)', () => {
  it('ikonen ritar TVÅ staplar med mörk kant (en loop över två lägen), i vägens färg — och lagret ritar en ikon per backväg', () => {
    const k = las('lib/kartstil.ts');
    expect(k).toContain('for (const dy of [-avstand / 2, avstand / 2]) {');
    expect(k).toContain("ctx.fillStyle = 'rgba(0,0,0,0.9)';");
    expect(k).toMatch(/farg === 'red' \? LEGEND\.fara : farg === 'yellow' \? LEGEND\.gul : LEGEND\.vatten/);
  });
  it('kortet har bara växeln och Början/Slutet: ingen orsak, ingen förklaringstext', () => {
    const k = las('components/planering/BackvagVal.tsx').split('\n').filter((r) => !r.trim().startsWith('//')).join('\n');   // koden, inte kommentarerna
    expect(k).not.toMatch(/orsak|Orsak|Sten|Brant|Blött/i);
    expect(k).not.toContain('Man kör in');
    expect(las('lib/backvag.ts')).not.toMatch(/BACKVAG_ORSAKER|BackvagOrsak/);
  });
});

describe('backväg: bara information', () => {
  it('Kvar, Klar-dag, Väg klar, lassrapporteringen och Klar med trakten? läser inte backväg', () => {
    const filer: string[] = [];
    const gå = (d: string) => { for (const e of readdirSync(join(rot, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) gå(r); else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) filer.push(r); } };
    gå('lib/skotarLass'); gå('components/planering/skotar');
    for (const f of ['lib/klarTrakt.ts', 'lib/klarSteg.ts', 'lib/klarFalt.ts']) filer.push(f);
    for (const f of filer) expect(las(f), f).not.toMatch(/backvag/i);
  });
});

describe('backväg: egenkontrollens karta', () => {
  const origo = { lat: 56.5, lng: 14, zoom: 16 };
  const path = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 120, y: 0 }];
  it('en backväg i kontexten ger ett nedtonat streck, en kontrollpunkts snapshot ett fullstarkt — och en vanlig väg inget', () => {
    const kontext = backvagFeatureUrData({ id: 4, lineType: 'sideRoadRed', path, backvag: { ande: 'slut', orsak: 'sten' } }, origo, undefined, true)!;
    expect(kontext.properties).toMatchObject({ id: 4, lineType: 'sideRoadRed', streck: 'red', dim: true });
    const punkt = backvagFeatureUrData({ id: 4, path, farg: 'blue', backvag: { ande: 'start' } }, origo, 'mainRoad', false)!;
    expect(punkt.properties).toMatchObject({ lineType: 'mainRoad', streck: 'blue', dim: false });
    expect(backvagFeatureUrData({ id: 4, lineType: 'mainRoad', path }, origo)).toBeNull();
    expect(backvagFeatureUrData({ id: 4, lineType: 'ditch', path, backvag: { ande: 'slut' } }, origo)).toBeNull();
    expect(backvagFeatureUrData({ id: 4, lineType: 'mainRoad', path: [{ x: 0, y: 0 }], backvag: { ande: 'slut' } }, origo)).toBeNull();
  });
  it('lagret ritas av samma funktion som planeringens (samma ikoner och storlek), med nedtoning för kontexten', () => {
    const [lager] = backvagLager();
    expect(lager.id).toBe('ek-backvag');
    expect(lager.source).toBe(BACKVAG_KALLA);
    expect(lager.layout['icon-image']).toEqual(backvagStreckLager('x', 'y').layout['icon-image']);
    expect(lager.layout['icon-size']).toEqual(backvagStreckLager('x', 'y').layout['icon-size']);
    expect(backvagIkonNamn('red')).toBe('backvag-streck-red');
    const rund = las('app/egenkontroll/RundKarta.tsx');
    expect(rund).toContain('map.addSource(BACKVAG_KALLA');
    expect(rund).toContain('for (const spec of backvagLager()) laggTillLager(map, spec);');
    expect(rund).toContain('map.getSource(BACKVAG_KALLA)?.setData(backvagGeo);');
  });
});
