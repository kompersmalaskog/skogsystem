import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASVAG_FARGER, BASVAG_FARG_UTTRYCK, BASVAG_UTAN_FARG, arBasvagFarg, basvagYta, basvagFargHex, basvagLangdM, basvagNamn, basvagText } from './basvag';
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
  it('senast valda färg: röd första gången, sedan den som valdes; en trasig lagring ger röd och kastar aldrig', async () => {
    const m = await import('./basvag');
    const lager = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => lager.get(k) ?? null, setItem: (k: string, v: string) => { lager.set(k, v); } };
    expect(m.lasSenasteBasvagFarg()).toBe('red');
    m.sparaSenasteBasvagFarg('blue');
    expect(m.lasSenasteBasvagFarg()).toBe('blue');
    lager.set(m.BASVAG_SENASTE_FARG_NYCKEL, 'lila');          // okänt värde
    expect(m.lasSenasteBasvagFarg()).toBe('red');
    (globalThis as any).localStorage = { getItem: () => { throw new Error('blockerad'); }, setItem: () => { throw new Error('blockerad'); } };
    expect(m.lasSenasteBasvagFarg()).toBe('red');
    expect(() => m.sparaSenasteBasvagFarg('yellow')).not.toThrow();
    delete (globalThis as any).localStorage;
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
  });

  it('Basväg är EN rad i Rita linje och i Spåra med GPS (ingen egen ruta "Spåra basväg", ingen undermeny): raden fäller ut färgvalet med senast valda förvald; samma spårning som förut (startGpsTracking), för alla trakttyper', () => {
    expect(page).not.toContain("subMenu === 'gps-basvag'");
    expect(page).not.toContain("setSubMenu('gps-basvag')");
    expect(page).not.toContain('Spåra basväg');
    for (const [steg, start] of [['spara', 'startaBasvagSpara'], ['rita', 'startaBasvagRita']]) {
      expect(page).toContain(`<LinjeTypLista steg="${steg}" typer={ritaLinjeTyper} basvagOppen={basvagSteg === '${steg}'} basvagVal={basvagVal} onBasvagVal={setBasvagVal}`);
      expect(page).toContain(`onTryckBasvag={() => oppnaBasvagSteg('${steg}')} onStartaBasvag={${start}}`);
    }
    expect(page).toContain("setBasvagVal(lasSenasteBasvagFarg());   // senast valda färg är förvald");
    expect(page).toContain("startGpsTracking('mainRoad', basvagVal);");
    expect(page).toContain("setDrawType('mainRoad'); setDrawFarg(basvagVal); setIsDrawMode(true);");
    expect(page.split('sparaSenasteBasvagFarg(basvagVal);').length - 1).toBe(2);   // båda vägarna kommer ihåg färgen
    // för ALLA trakttyper: ingen roll-/typspärr runt raden
    const lista = page.slice(page.indexOf('{/* Linjer - GPS */}'), page.indexOf('{/* === ZONER === */}')) + las('../components/planering/LinjeTypLista.tsx');
    expect(lista).not.toMatch(/isAdminRiktig|isForare|typ === 'gallring'|typ === 'slutavverkning'/);
  });

  it('färgvalet är SAMMA komponent överallt (markeringsmenyn på en befintlig basväg och steget i Rita linje / Spåra med GPS)', () => {
    const k = las('../components/planering/BasvagFargVal.tsx');
    expect(k).toContain('data-testid="basvag-farg-val"');
    expect(k).toContain('BASVAG_FARGER.map');
    expect(page).toContain('<BasvagFargVal centrerad valt={marker.farg} onVal=');
    expect(k).toContain('<BasvagFargVal valt={valt} onVal={onVal} />');
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
