import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASVAG_FARGER, BASVAG_FARG_UTTRYCK, BASVAG_UTAN_FARG, arBasvagFarg, basvagYta, medBasvagFarger, basvagFargHex, basvagLangdM, basvagNamn, basvagText } from './basvag';
import { LEGEND } from './kartstil';

describe('basvägens färg', () => {
  it('tre färger: röd, gul, blå — samma hex som kartlegenden (LEGEND)', () => {
    expect(BASVAG_FARGER.map((f) => [f.id, f.namn, f.hex])).toEqual([['red', 'röd', LEGEND.fara], ['yellow', 'gul', LEGEND.gul], ['blue', 'blå', LEGEND.vatten]]);
  });
  it('okänt eller saknat värde är ingen färg; hex faller tillbaka på blå (som förut)', () => {
    expect(arBasvagFarg('red')).toBe(true);
    expect(arBasvagFarg('green')).toBe(false);
    expect(arBasvagFarg(undefined)).toBe(false);
    expect(basvagFargHex(undefined)).toBe(LEGEND.vatten);
    expect(basvagFargHex('yellow')).toBe(LEGEND.gul);
  });
  it('namn: "Basväg" utan färg, "Basväg röd" med', () => {
    expect(basvagNamn(undefined)).toBe('Basväg');
    expect(basvagNamn('red')).toBe('Basväg röd');
    expect(basvagNamn('blue')).toBe('Basväg blå');
    expect(basvagNamn('lila')).toBe('Basväg');
  });
  it('MapLibre-uttrycket: match på farg, okänt → blå; "utan färg"-filtret träffar bara de utan egenskapen', () => {
    expect(BASVAG_FARG_UTTRYCK).toEqual(['match', ['get', 'farg'], 'red', LEGEND.fara, 'yellow', LEGEND.gul, 'blue', LEGEND.vatten, LEGEND.vatten]);
    expect(BASVAG_UTAN_FARG).toEqual(['!', ['has', 'farg']]);
  });
  it('Om trakten: "Basväg röd · 640 m" — längden ur punkterna', () => {
    const p = [{ lat: 56.4, lng: 14.7 }, { lat: 56.4, lng: 14.7 + 640 / (111320 * Math.cos(56.4 * Math.PI / 180)) }];
    expect(Math.round(basvagLangdM(p))).toBeGreaterThan(630);
    expect(Math.round(basvagLangdM(p))).toBeLessThan(650);
    expect(basvagText('red', 640)).toBe('Basväg röd · 640 m');
    expect(basvagText(undefined, 1250)).toMatch(/^Basväg · 1,\d+ km$/);
    expect(basvagText('yellow', null)).toBe('Basväg gul');
  });
});

describe('listor och teckenförklaring', () => {
  it('Basväg delas i tre val (röd, gul, blå, heldragna); övriga linjetyper oförändrade och i samma ordning', () => {
    const ut = medBasvagFarger([{ id: 'boundary', name: 'Traktgräns', color: '#f00' }, { id: 'mainRoad', name: 'Basväg', color: '#00f', striped: true, color2: '#ff0' }, { id: 'nature', name: 'Naturvård', color: '#0f0' }]);
    expect(ut.map((t) => t.key)).toEqual(['boundary', 'mainRoad-red', 'mainRoad-yellow', 'mainRoad-blue', 'nature']);
    expect(ut.filter((t) => t.id === 'mainRoad').map((t) => [t.name, t.farg, t.color, t.striped, t.color2])).toEqual([
      ['Basväg röd', 'red', LEGEND.fara, false, undefined], ['Basväg gul', 'yellow', LEGEND.gul, false, undefined], ['Basväg blå', 'blue', LEGEND.vatten, false, undefined]]);
    expect(ut.find((t) => t.id === 'boundary')).toMatchObject({ key: 'boundary', name: 'Traktgräns' });
    expect((ut.find((t) => t.id === 'boundary') as any).farg).toBeUndefined();
  });
  it('teckenförklaringens ruta har de tre färgerna', () => {
    const y = basvagYta();
    for (const f of BASVAG_FARGER) expect(y).toContain(f.hex);
  });
});

describe('sidans koppling (page.tsx kan inte monteras i test — källvakt)', () => {
  const page = readFileSync(resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
  const las = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

  it('basvägen är EN typ med färgfält: lagren färgas ur `farg`, de gula strecken bara på basväg utan färg, och featuren bär färgen', () => {
    expect(page).toContain("'line-color': isMainRoad ? (BASVAG_FARG_UTTRYCK as any) : lt.color");
    expect(page).toContain("filter: isMainRoad ? ['all', ['==', ['get', 'lineType'], lt.id], BASVAG_UTAN_FARG as any]");
    expect(page).toContain("...(m.lineType === 'mainRoad' && m.farg ? { farg: m.farg } : {})");
    expect(page).toContain("{ id: 'mainRoad', color: LEGEND.vatten, color2: LEGEND.gul, striped: true },");   // lineTypeDefs oförändrad: ingen ny typ bredvid
    expect(page).not.toContain("id: 'mainRoadRed'");
  });

  it('rita och spåra: färgen följer med in i linjen (alla fyra ställen där en linje skapas)', () => {
    expect(page.split("...(drawType === 'mainRoad' && drawFarg ? { farg: drawFarg } : {})").length - 1).toBe(2);
    expect(page).toContain("...(gpsLineType === 'mainRoad' && gpsFargRef.current ? { farg: gpsFargRef.current } : {})");
    expect(page).toContain("...(currentLineType === 'mainRoad' && gpsFargRef.current ? { farg: gpsFargRef.current } : {})");
    expect(page).toContain("gpsFargRef.current = lineType === 'mainRoad' ? (farg ?? null) : null;");
    expect(page).toContain('setDrawFarg(type.farg ?? null);');
  });

  it('"Spåra basväg" finns som ruta i + och öppnar färgvalet; ett tryck på en färg startar spårningen — samma spårning som förut (startGpsTracking)', () => {
    expect(page).toContain("{ id: 'basvag', titel: 'Spåra basväg', ikon: 'basvag', onTryck: () => { stangPlus(); avslutaPagaendeLage(); setActiveCategory('lines'); setSubMenu('gps-basvag'); setMenuOpen(true); } }");
    expect(page).toContain("subMenu === 'gps-basvag'");
    expect(page).toContain("startGpsTracking('mainRoad', f.id)");
    // för ALLA trakttyper: ingen roll-/typspärr runt rutan eller menyn
    const rita = page.slice(page.indexOf('const byggRita = '), page.indexOf('// Spårens förhandsfärg'));
    expect(rita).not.toContain('isAdminRiktig');
    expect(rita).not.toContain('isForare');
    expect(page.slice(page.indexOf("subMenu === 'gps-basvag' && ("), page.indexOf('{/* Linjer - Rita */}'))).not.toMatch(/typ === 'gallring'|typ === 'slutavverkning'/);
  });

  it('GALLRINGSVERKTYGET ÄR RÖRT: snitslingen startar sin spårning med bara linjetypen (inget färgfält), och stickväg/backväg tar aldrig `farg`', () => {
    expect(page).toContain('startGpsTracking(lineId);');
    expect(page).toContain("startGpsTracking(colorMap[colorId] || 'sideRoadRed');");
    expect(page).toContain("gpsFargRef.current = lineType === 'mainRoad' ? (farg ?? null) : null;");   // andra typer nollställer färgen
    // färgen sätts bara där linjetypen är mainRoad — varje ställe som skriver `farg: …` i en ny linje har villkoret framför sig
    const satter = Array.from(page.matchAll(/\.\.\.\(([^)]*?)\? \{ farg: [^}]*\} : \{\}\)/g)).map((m) => m[1]);
    expect(satter.length).toBe(6);   // 2 ritade, 2 GPS-spårade, featuren som kartan får (egenskapen farg) och Om traktens lista (#766: "Basväg röd · 640 m")
    for (const v of satter) expect(v).toContain("=== 'mainRoad'");
  });

  it('Lager (teckenförklaringen) visar basvägens tre färger; markeringsmenyn har färgval; färgen ritas även i förhandsvisningarna', () => {
    expect(page).toContain("l.id === 'mainRoad' ? basvagYta() :");
    expect(page).toContain('data-testid="basvag-farg-val"');
    expect(page).toContain("gpsLineType === 'mainRoad' && gpsFargRef.current ? basvagFargHex(gpsFargRef.current)");
    expect(page).toContain("drawType === 'mainRoad' && drawFarg ? basvagFargHex(drawFarg)");
  });

  it('egenkontrollens karta följer med: samma färguttryck och strecken bara på basväg utan färg; färgen följer med i featuren', () => {
    const k = las('./kartstil.ts');
    expect(k).toContain("'line-color': lt.id === 'mainRoad' ? BASVAG_FARG_UTTRYCK : lt.color");
    expect(k).toContain("filter: lt.id === 'mainRoad' ? och(filter, BASVAG_UTAN_FARG) : filter");
    expect(las('./egenkontrollkarta.ts')).toContain('arBasvagFarg(');
  });
});
