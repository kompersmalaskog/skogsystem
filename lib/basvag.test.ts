import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASVAG_FARGER, BASVAG_FARG_UTTRYCK, BASVAG_UTAN_FARG, arBasvagFarg, basvagYta, basvagFargHex, basvagLangdM, basvagNamn, basvagSammanfattning, basvagText } from './basvag';
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
  it('senast valda: Blå/gul (dagens utseende) första gången, sedan det som valdes; en trasig lagring ger Blå/gul och kastar aldrig', async () => {
    const m = await import('./basvag');
    const lager = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => lager.get(k) ?? null, setItem: (k: string, v: string) => { lager.set(k, v); } };
    expect(m.lasSenasteBasvagFarg()).toBe('blagul');
    m.sparaSenasteBasvagFarg('blue');
    expect(m.lasSenasteBasvagFarg()).toBe('blue');
    m.sparaSenasteBasvagFarg('blagul');                         // Blå/gul går också att komma ihåg
    expect(m.lasSenasteBasvagFarg()).toBe('blagul');
    lager.set(m.BASVAG_SENASTE_FARG_NYCKEL, 'lila');            // okänt värde
    expect(m.lasSenasteBasvagFarg()).toBe('blagul');
    (globalThis as any).localStorage = { getItem: () => { throw new Error('blockerad'); }, setItem: () => { throw new Error('blockerad'); } };
    expect(m.lasSenasteBasvagFarg()).toBe('blagul');
    expect(() => m.sparaSenasteBasvagFarg('yellow')).not.toThrow();
    delete (globalThis as any).localStorage;
  });
  it('FYRA val, Blå/gul först: Blå/gul, Röd, Gul, Blå', async () => {
    const m = await import('./basvag');
    expect(m.BASVAG_VAL.map((v) => v.namn)).toEqual(['Blå/gul', 'Röd', 'Gul', 'Blå']);
    expect(m.BASVAG_VAL.map((v) => v.id)).toEqual(['blagul', 'red', 'yellow', 'blue']);
  });
  it('Blå/gul lagras som INGEN färg — exakt som alla basvägar före färgvalet; en lagrad utan färg visas som Blå/gul', async () => {
    const m = await import('./basvag');
    expect(m.valTillFarg('blagul')).toBeNull();
    expect(m.valTillFarg('red')).toBe('red');
    expect(m.fargTillVal(undefined)).toBe('blagul');             // befintlig basväg utan farg
    expect(m.fargTillVal(null)).toBe('blagul');
    expect(m.fargTillVal('lila')).toBe('blagul');                // okänt = ritas som förut = Blå/gul
    expect(m.fargTillVal('yellow')).toBe('yellow');
    for (const v of m.BASVAG_VAL) expect(m.fargTillVal(m.valTillFarg(v.id))).toBe(v.id);   // rundtur val → lagrat → val
  });
  it('markeringsmenyn: Röd/Gul/Blå sätter `farg`, Blå/gul TAR BORT fältet (identiskt med en basväg före färgvalet) och rör inget annat', async () => {
    const m = await import('./basvag');
    const gammal = { id: 7, isLine: true, lineType: 'mainRoad', nummer: 2, path: [{ x: 1, y: 2 }] };            // en basväg som ritades före färgvalet
    const rod = m.medBasvagVal(gammal, 'red');
    expect(rod).toEqual({ ...gammal, farg: 'red' });
    const tillbaka = m.medBasvagVal(rod, 'blagul');
    expect(tillbaka).toEqual(gammal);                                       // exakt som förut
    expect('farg' in tillbaka).toBe(false);                                 // fältet finns inte (inte null, inte undefined)
    expect(JSON.stringify(tillbaka)).toBe(JSON.stringify(gammal));          // samma lagrade JSON → synken ser ingen skillnad
    expect(m.medBasvagVal(gammal, 'blagul')).toEqual(gammal);               // redan Blå/gul: ingen ändring
    expect(m.medBasvagVal(rod, 'blue')).toEqual({ ...gammal, farg: 'blue' });
    expect(m.fargTillVal((rod as any).farg)).toBe('red');
  });
  it('Om trakten: Blå/gul (ingen färg) heter "Basväg · 640 m" som idag, övriga "Basväg röd · 640 m"', async () => {
    const m = await import('./basvag');
    expect(m.basvagText(m.valTillFarg('blagul'), 640)).toBe('Basväg · 640 m');
    expect(m.basvagText(m.valTillFarg('red'), 640)).toBe('Basväg röd · 640 m');
    expect(m.basvagText(m.valTillFarg('yellow'), 640)).toBe('Basväg gul · 640 m');
    expect(m.basvagText(m.valTillFarg('blue'), 640)).toBe('Basväg blå · 640 m');
  });
  it('teckenförklaringens ruta har alla fyra valen: Blå/gul (dagens streck) och de tre heldragna färgerna', () => {
    const y = basvagYta();
    for (const f of BASVAG_FARGER) expect(y).toContain(f.hex);
    expect(y).toContain('repeating-linear-gradient');   // Blå/gul = blå med gula streck
  });
});

describe('sidans koppling (page.tsx kan inte monteras i test — källvakt)', () => {
  const page = readFileSync(resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
  const las = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

  it('basvägen är EN typ med färgfält: lagren färgas ur `farg`, de gula strecken bara på basväg utan färg, och featuren bär färgen', () => {
    expect(page).toContain("korFarg(isMainRoad ? (BASVAG_FARG_UTTRYCK as any) : lt.color)");
    expect(page).toContain("filter: isMainRoad ? ['all', ['==', ['get', 'lineType'], lt.id], BASVAG_UTAN_FARG as any, KOR_INTE_KLAR]");
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
    expect(page).toContain("setBasvagVal(lasSenasteBasvagFarg());   // senast valda är förvalt (Blå/gul första gången)");
    expect(page).toContain("startGpsTracking('mainRoad', valTillFarg(basvagVal));");   // Blå/gul = ingen färg, som förut
    expect(page).toContain("setDrawType('mainRoad'); setDrawFarg(valTillFarg(basvagVal)); setIsDrawMode(true);");
    expect(page.split('sparaSenasteBasvagFarg(basvagVal);').length - 1).toBe(2);   // båda vägarna kommer ihåg färgen
    // för ALLA trakttyper: ingen roll-/typspärr runt raden
    const lista = page.slice(page.indexOf('{/* Linjer - GPS */}'), page.indexOf('{/* === ZONER === */}')) + las('../components/planering/LinjeTypLista.tsx');
    expect(lista).not.toMatch(/isAdminRiktig|isForare|typ === 'gallring'|typ === 'slutavverkning'/);
  });

  it('färgvalet är SAMMA komponent överallt (markeringsmenyn på en befintlig basväg och steget i Rita linje / Spåra med GPS)', () => {
    const k = las('../components/planering/BasvagFargVal.tsx');
    expect(k).toContain('data-testid="basvag-farg-val"');
    expect(k).toContain('BASVAG_VAL.map');   // Blå/gul först, sedan röd, gul, blå
    expect(page).toContain('<BasvagFargVal valt={fargTillVal(marker.farg)}');   // en befintlig basväg utan färg visas som Blå/gul
    // Blå/gul på en befintlig basväg TAR BORT fältet (exakt som före färgvalet) — sätter aldrig en färg
    expect(page).toContain('m.id === marker.id ? medBasvagVal(m, v) : m');
    expect(k).toContain('<BasvagFargVal valt={valt} onVal={onVal} />');
  });

  it('GALLRINGSVERKTYGET ÄR RÖRT: snitslingen startar sin spårning med bara linjetypen (inget färgfält), och stickväg tar aldrig `farg`', () => {
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

describe('Klar med trakten?: EN rad för basvägarna', () => {
  it('antal och sammanlagd längd: "5 st · 599 m", "1 st · 640 m", över en km i km', () => {
    expect(basvagSammanfattning([100, 100, 120, 140, 139])).toBe('5 st · 599 m');
    expect(basvagSammanfattning([640])).toBe('1 st · 640 m');
    expect(basvagSammanfattning([600, 650])).toMatch(/^2 st · 1[,.]2\d? km$/);
  });
  it('inga basvägar → null; saknas längden på någon står bara antalet (en summa av några vore en för låg siffra som ser ut som en mätning)', () => {
    expect(basvagSammanfattning([])).toBeNull();
    expect(basvagSammanfattning([100, null, 120])).toBe('3 st');
    expect(basvagSammanfattning([undefined])).toBe('1 st');
    expect(basvagSammanfattning([NaN, 50])).toBe('2 st');
  });
  it('sidan skickar sammanfattningen ur de ritade basvägarnas längd', () => {
    const page = readFileSync(resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
    expect(page).toContain('sammanfattning: basvagSammanfattning(kartMarkeringar.filter(arBasvagMark).map((m) => m.langdM))');
  });
});
