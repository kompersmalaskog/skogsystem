import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DIMMA_FYLL_OPACITET, DIMMA_OPACITET, FRAMHAV_FARG, IKON_STOPP, SYMBOL_FORSTORING, arKartTryck, dimmaMal, etikettPunkt, forstoradIkonStorlek, framhavBounds, framhavGeoJson, framhavLista, likaNagon,
  framhavdFran, lika, pulsFas, ringRadieStopp, slappAtgard,
} from './omTraktenFramhav';
import { bryt } from './omTraktenEtikettBild';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { FARG } from './design/tokens';

const mark = (o: any) => framhavdFran({ typ: 'x', namn: 'Namn', comment: '', farg: null, langdM: null, lat: 56.4, lng: 14.7, ...o });

const LINJE = mark({ id: 'l1', slag: 'linje', lat: 56.4, lng: 14.7, geometri: [{ lat: 56.4, lng: 14.7 }, { lat: 56.401, lng: 14.702 }, { lat: 56.402, lng: 14.701 }] });
const ZON = mark({ id: 'z1', slag: 'zon', lat: 56.4, lng: 14.7, geometri: [{ lat: 56.4, lng: 14.7 }, { lat: 56.401, lng: 14.7 }, { lat: 56.401, lng: 14.702 }] });
const SYMBOL = mark({ id: 's1', slag: 'symbol', lat: 56.4, lng: 14.7 });

describe('Visa › — vad som framhävs', () => {
  it('en LINJE framhävs som HELA linjen (alla punkter), inte en punkt', () => {
    const f = framhavGeoJson(LINJE).features;
    expect(f.length).toBe(1);
    expect(f[0].geometry.type).toBe('LineString');
    expect(f[0].geometry.coordinates).toEqual([[14.7, 56.4], [14.702, 56.401], [14.701, 56.402]]);
  });
  it('en yta framhävs som sluten kontur', () => {
    const g = framhavGeoJson(ZON).features[0].geometry;
    expect(g.type).toBe('Polygon');
    expect(g.coordinates[0][0]).toEqual(g.coordinates[0][g.coordinates[0].length - 1]);
    expect(g.coordinates[0].length).toBe(4);
  });
  it('en symbol är en punkt; saknas geometri faller även linjen tillbaka till sin punkt; inget val → tomt', () => {
    expect(framhavGeoJson(SYMBOL).features[0].geometry).toEqual({ type: 'Point', coordinates: [14.7, 56.4] });
    expect(framhavGeoJson({ ...LINJE, geometri: undefined }).features[0].geometry.type).toBe('Point');
    expect(framhavGeoJson(null).features).toEqual([]);
    expect(framhavGeoJson({ ...SYMBOL, lat: null, lng: null }).features).toEqual([]);
  });
  it('kameran rymmer hela linjen/ytan; en symbol har ingen ram (kameran flyger till punkten)', () => {
    expect(framhavBounds(LINJE)).toEqual([[14.7, 56.4], [14.702, 56.402]]);
    expect(framhavBounds(ZON)).toEqual([[14.7, 56.4], [14.702, 56.401]]);
    expect(framhavBounds(SYMBOL)).toBeNull();
    expect(framhavBounds(null)).toBeNull();
  });
});

describe('Visa › — vad som tonas ner', () => {
  const ALLA = ['basemap', 'markers-layer', 'markers-prick', 'markers-hit', 'arrows-layer', 'line-boundary-base', 'line-boundary-stripe', 'line-mainRoad-base', 'line-mainRoad-casing', 'line-sideRoadRed-base',
    'line-hitbox', 'zone-fill', 'zone-outline', 'zone-outline-dash', 'omtrakten-framhav-ring', 'maskin-pos', 'trail-footprints'];
  it('symboler, prickar, pilar, väg-/naturlinjer och ytor tonas ner; traktgränsen, baskartan, träffytor, förarens position och framhävningen själv rörs inte', () => {
    const m = dimmaMal(ALLA);
    expect(m.map((x) => x.id)).toEqual(['markers-layer', 'markers-prick', 'arrows-layer', 'line-mainRoad-base', 'line-mainRoad-casing', 'line-sideRoadRed-base', 'zone-fill', 'zone-outline', 'zone-outline-dash']);
    expect(m.find((x) => x.id === 'zone-fill')).toMatchObject({ prop: 'fill-opacity', dim: DIMMA_FYLL_OPACITET });
    expect(m.find((x) => x.id === 'markers-layer')).toMatchObject({ prop: 'icon-opacity', dim: DIMMA_OPACITET });
    expect(m.find((x) => x.id === 'markers-prick')).toMatchObject({ prop: 'circle-opacity' });
    expect(m.map((x) => x.id)).not.toContain('line-boundary-base');
    expect(m.map((x) => x.id)).not.toContain('markers-hit');
    expect(m.map((x) => x.id)).not.toContain('line-hitbox');
  });
  it('övriga tonas ner till ca 30 % — tydligt mindre än den valda (1)', () => {
    expect(DIMMA_OPACITET).toBeGreaterThanOrEqual(0.25);
    expect(DIMMA_OPACITET).toBeLessThanOrEqual(0.35);
  });
  it('ett textlager med line-prefix (väg-etiketten) får inte line-opacity — egenskapen följer lagrets typ', () => {
    const m = dimmaMal([{ id: 'line-mainroad-label', type: 'symbol' }, { id: 'line-mainRoad-base', type: 'line' }]);
    expect(m.map((x) => x.id)).toEqual(['line-mainRoad-base']);
  });
  it('MapLibres egen uttrycksmotor: uttrycket är sant för ett TAL-id när listans id är text — och det gamla strikta uttrycket är falskt (felet i förhandsvisningen)', () => {
    const utvardera = (uttryck: any, id: unknown) => {
      const r: any = createExpression(uttryck, { type: 'boolean' } as any);
      expect(r.result, JSON.stringify(r.value)).toBe('success');
      return r.value.evaluate({ zoom: 17 }, { type: 'Point', properties: { id }, id: undefined } as any);
    };
    expect(utvardera(lika('1760000000001'), 1760000000001)).toBe(true);     // kartans id = tal
    expect(utvardera(lika('1760000000001'), '1760000000001')).toBe(true);   // eller text
    expect(utvardera(lika('1760000000001'), 1760000000002)).toBe(false);
    expect(utvardera(['==', ['get', 'id'], '1760000000001'], 1760000000001)).toBe(false);   // gamla uttrycket
  });
  it('både filtret på den förstorade symbolen och nedtoningen använder `lika` — aldrig en strikt jämförelse mot id', () => {
    const karta = readFileSync(resolve(__dirname, './omTraktenFramhavKarta.ts'), 'utf8');
    expect(karta).not.toMatch(/\['==', \['get', 'id'\]/);
    expect(karta).not.toContain('lika(f.id)');
    expect(karta.match(/likaNagon\(ids\)/g)!.length).toBe(2);   // en id ger exakt `lika` (se nedan), flera ger `in`
  });
  it('IDJÄMFÖRELSEN: kartans id är ett TAL (Date.now()), listans en TEXT — uttrycket jämför som text, annars tonas även den valda ner (felet i förhandsvisningen)', () => {
    expect(lika('1710000000123')).toEqual(['==', ['to-string', ['get', 'id']], '1710000000123']);
    // evaluerar som MapLibre: to-string(1710000000123) === '1710000000123'
    expect(String(1710000000123)).toBe('1710000000123');
    // och det gamla uttrycket (strikt, utan to-string) hade varit falskt: tal !== text
    expect((1710000000123 as unknown) === ('1710000000123' as unknown)).toBe(false);
  });
});

describe('Typraden — flera framhävs samtidigt', () => {
  const sym = (id: string, lat: number, lng: number) => ({ id, slag: 'symbol' as const, lat, lng, etikett: id });
  const lin = (id: string) => ({ id, slag: 'linje' as const, lat: null, lng: null, geometri: [{ lat: 56.4, lng: 14.7 }, { lat: 56.401, lng: 14.702 }], etikett: id });
  it('framhavLista: en eller flera (aldrig null-poster); en ensam lista ger exakt samma geometri som en enda markering', () => {
    expect(framhavLista(null)).toEqual([]);
    expect(framhavLista(sym('a', 1, 1))).toHaveLength(1);
    expect(framhavLista([sym('a', 1, 1), sym('b', 2, 2)])).toHaveLength(2);
    expect(framhavGeoJson([lin('x')])).toEqual(framhavGeoJson(lin('x')));
  });
  it('geometrin är alla objekten: punkter, linjer och ytor i EN samling', () => {
    const g = framhavGeoJson([sym('a', 56.4, 14.7), lin('x'), sym('b', 56.5, 14.8)]);
    expect(g.features.map((f: any) => f.geometry.type)).toEqual(['Point', 'LineString', 'Point']);
  });
  it('kameran rymmer ALLA — punkter och linjens hörn; en enda symbol har ingen ram', () => {
    expect(framhavBounds([sym('a', 56.4, 14.7), sym('b', 56.5, 14.9), lin('x')])).toEqual([[14.7, 56.4], [14.9, 56.5]]);
    expect(framhavBounds([sym('a', 56.4, 14.7)])).toBeNull();
  });
  it('uttrycket: flera id → `in` mot en lista TEXT (kartans id är ett tal), en id → exakt `lika`; sant för tal-id i MapLibres egen motor', () => {
    expect(likaNagon(['1'])).toEqual(lika('1'));
    const uttryck = likaNagon(['1760000000001', '1760000000002']);
    const utvardera = (id: unknown) => {
      const r: any = createExpression(uttryck, { type: 'boolean' } as any);
      expect(r.result, JSON.stringify(r.value)).toBe('success');
      return r.value.evaluate({ zoom: 17 }, { type: 'Point', properties: { id }, id: undefined } as any);
    };
    expect(utvardera(1760000000001)).toBe(true);
    expect(utvardera(1760000000002)).toBe(true);
    expect(utvardera(1760000000003)).toBe(false);
  });
  it('kartlagret: flera markeringar får ingen etikett (de skulle ligga huller om buller); ett objekt får sin som förut', () => {
    const karta = readFileSync(resolve(__dirname, './omTraktenFramhavKarta.ts'), 'utf8');
    expect(karta).toContain('const ep = flera ? null : etikettPunkt(f);');
  });
  it('listens text: "Basväg röd · 329 m", kommentaren efter symbolens namn, bara namnet utan kommentar', () => {
    expect(framhavdFran({ id: '1', slag: 'linje', typ: 'mainRoad', namn: 'Basväg', comment: '', farg: 'red', langdM: 329, lat: null, lng: null }).lista).toBe('Basväg röd · 329 m');
    expect(framhavdFran({ id: '2', slag: 'symbol', typ: 'culturemonument', namn: 'Kulturminne', comment: 'Stenrös  vid vägen', lat: 1, lng: 1 }).lista).toBe('Kulturminne · Stenrös vid vägen');
    expect(framhavdFran({ id: '3', slag: 'symbol', typ: 'highstump', namn: 'Högstubbe', comment: '', lat: 1, lng: 1 }).lista).toBe('Högstubbe');
  });
});

describe('Visa › — den valda symbolen och ringen', () => {
  it('symbolen ritas 1,5× större än kartans (varje zoomstopp × 1,5)', () => {
    expect(SYMBOL_FORSTORING).toBe(1.5);
    const e: any[] = forstoradIkonStorlek();
    expect(e.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']]);
    const stopp = e.slice(3);
    IKON_STOPP.forEach(([z, s], i) => { expect(stopp[i * 2]).toBe(z); expect(stopp[i * 2 + 1]).toBeCloseTo(s * 1.5, 10); });
  });
  it('ringen är systemblå (inte vit) och större än den förstorade symbolen vid varje zoom', () => {
    expect(FRAMHAV_FARG).toBe(FARG.bla);
    expect(FRAMHAV_FARG.toLowerCase()).not.toBe('#ffffff');
    const r: any[] = ringRadieStopp();
    IKON_STOPP.forEach(([, s], i) => { expect(r[3 + i * 2 + 1]).toBeGreaterThan((64 * s * 1.5) / 2); });
    expect((ringRadieStopp(10) as any[])[4]).toBe((ringRadieStopp() as any[])[4] + 10);
  });
});

describe('Visa › — etikettens plats', () => {
  it('symbol: på punkten. Linje: halva LÄNGDEN (inte mitten av ramen). Yta: medelpunkten av hörnen (sluten ring räknas inte dubbelt). Utan geometri: markeringens punkt', () => {
    expect(etikettPunkt(SYMBOL)).toEqual({ lat: 56.4, lng: 14.7 });
    // L-formad linje: 1:a benet 0,001° lat (111 m), 2:a benet 0,010° lng (~ 616 m) — halva längden ligger på det långa benet, inte i ramens mitt
    const L = mark({ id: 'l2', slag: 'linje', geometri: [{ lat: 56.4, lng: 14.7 }, { lat: 56.401, lng: 14.7 }, { lat: 56.401, lng: 14.71 }] });
    const p = etikettPunkt(L)!;
    expect(p.lat).toBeCloseTo(56.401, 6);
    expect(p.lng).toBeGreaterThan(14.7);
    expect(p.lng).toBeLessThan(14.71);
    const Z = mark({ id: 'z2', slag: 'zon', geometri: [{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }, { lat: 2, lng: 2 }, { lat: 2, lng: 0 }, { lat: 0, lng: 0 }] });
    expect(etikettPunkt(Z)).toEqual({ lat: 1, lng: 1 });
    expect(etikettPunkt({ ...LINJE, geometri: undefined })).toEqual({ lat: 56.4, lng: 14.7 });
    expect(etikettPunkt(null)).toBeNull();
  });
  it('etikettens text: kommentaren; utan kommentar symbolens namn; basväg utan kommentar "Basväg röd · 640 m"', () => {
    expect(mark({ id: 'a', slag: 'symbol', comment: '  En knäckt gran  ', namn: 'Fara' }).etikett).toBe('En knäckt gran');
    expect(mark({ id: 'b', slag: 'symbol', comment: '', namn: 'Fara' }).etikett).toBe('Fara');
    expect(mark({ id: 'c', slag: 'linje', typ: 'mainRoad', comment: '', namn: 'Basväg', farg: 'red', langdM: 640 }).etikett).toBe('Basväg röd · 640 m');
  });
  it('id blir alltid text (listan och kartan delar nyckel)', () => {
    expect(mark({ id: 123, slag: 'symbol' }).id).toBe('123');
  });
});

describe('Visa › — radbrytning och avkortning av etiketten (1–2 rader, …)', () => {
  const mat = (s: string) => s.length * 10;   // 10 px per tecken
  it('kort text = en rad; lång text bryts i två; för lång text avkortas med … på rad två', () => {
    expect(bryt('En knäckt gran', mat, 200)).toEqual(['En knäckt gran']);
    expect(bryt('Farlig knäckt gran vid stigen', mat, 150)).toEqual(['Farlig knäckt', 'gran vid stigen']);
    const r = bryt('Farlig knäckt gran som hänger över stigen och måste tas ner innan nästa vända', mat, 150);
    expect(r.length).toBe(2);
    expect(r[1].endsWith('…')).toBe(true);
    expect(mat(r[1])).toBeLessThanOrEqual(150);
    expect(r[0]).toBe('Farlig knäckt');
  });
  it('ett ord längre än raden bryts mitt i; radbrytningar i texten blir mellanslag; tom text → inga rader', () => {
    expect(bryt('Aaaaaaaaaaaaaaaaaaaaa', mat, 100).length).toBeLessThanOrEqual(2);
    expect(bryt('rad ett\nrad två', mat, 300)).toEqual(['rad ett rad två']);
    expect(bryt('   ', mat, 100)).toEqual([]);
  });
});

describe('Visa › — att lämna framhävningen', () => {
  it('rad ("Visa hela", telefonens ×) och stängd panel zoomar ut till hela trakten; tryck på tom yta, "‹ Om trakten" och nytt val lämnar kameran där den står', () => {
    expect(slappAtgard('rad').zoomaUt).toBe(true);
    expect(slappAtgard('stang').zoomaUt).toBe(true);
    expect(slappAtgard('karta').zoomaUt).toBe(false);
    expect(slappAtgard('tillbaka').zoomaUt).toBe(false);
    expect(slappAtgard('nytt').zoomaUt).toBe(false);
  });
  it('ett TRYCK är litet och kort och med ett finger — inte en panorering, ett nyp eller ett långt tryck', () => {
    expect(arKartTryck({ dx: 2, dy: 3, ms: 120, flerFingrar: false })).toBe(true);
    expect(arKartTryck({ dx: 40, dy: 0, ms: 120, flerFingrar: false })).toBe(false);
    expect(arKartTryck({ dx: 1, dy: 1, ms: 1200, flerFingrar: false })).toBe(false);
    expect(arKartTryck({ dx: 1, dy: 1, ms: 100, flerFingrar: true })).toBe(false);
  });
});

describe('puls', () => {
  it('0 → 1 → 0 över en period; stilla på mitten vid minskad rörelse', () => {
    expect(pulsFas(0, 1000)).toBeCloseTo(0, 5);
    expect(pulsFas(500, 1000)).toBeCloseTo(1, 5);
    expect(pulsFas(1000, 1000)).toBeCloseTo(0, 5);
    expect(pulsFas(123, 1000, true)).toBe(0.5);
  });
});

describe('sidans koppling (page.tsx kan inte monteras — källvakt)', () => {
  const page = readFileSync(resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
  it('framhävningen släpps vid tryck på kartan eller nytt val — ingen timer — och ligger EFTER briefing-effekten (som annars skriver över nedtoningen)', () => {
    expect(page).not.toMatch(/setTimeout\(\(\) => setFramhavdMarkering\(null\), \d+\)/);
    expect(page).toContain('startaFramhavning(map as any, framhavning,');
    expect(page).toContain('const framhavning = framhavdMarkering ?? (framhavdTyp && framhavdTyp.length > 0 ? framhavdTyp : null);');   // ett enskilt objekt går före typens
    const briefing = page.indexOf('}, [briefingMode, briefingHighlightId, mapLibreReady, markers, checklistMapView]);');
    const framhav = page.indexOf('// Om trakten › Visa ›: markeringen framhävs');
    expect(briefing).toBeGreaterThan(0);
    expect(framhav).toBeGreaterThan(briefing);
    expect(page).toContain('useEffect(() => { setFramhavdMarkering(null); setFramhavdTyp(null); omNavRef.current = null; }, [valtObjekt?.id]);');
  });
  it('tryck på kartan släpper via DOM-lyssnaren (kartans canvas, infångning) i en EGEN effekt som bara hänger på valet — inte på `markers`, inte på MapLibres click', () => {
    const effekt = page.slice(page.indexOf('const framhavdId = framhavdMarkering?.id ?? null;'));
    const ur = effekt.slice(0, effekt.indexOf('}, [framhavdId, mapLibreReady]);') + 40);
    expect(ur).toContain("startaKartSlapp(map.getCanvasContainer(), () => slappFramhavningRef.current('karta'))");
    expect(ur).toContain('}, [framhavdId, mapLibreReady]);');
    expect(ur).not.toContain('markers');
    expect(page).not.toContain("map.once('click'");
    const karta = readFileSync(resolve(__dirname, './omTraktenFramhavKarta.ts'), 'utf8');
    expect(karta).toContain("addEventListener('pointerup', pu, true)");   // infångningsfasen
    expect(karta).not.toMatch(/\.once\('click'/);
  });
  it('släppet zoomar ut med samma svep som objektval (flygTillObjekt) och bara när något ÄR framhävt', () => {
    const f = page.slice(page.indexOf('slappFramhavningRef.current = (orsak) => {'));
    expect(f.slice(0, 600)).toContain('if (!framhavdMarkering) return;');
    expect(f.slice(0, 700)).toContain('flygTillObjekt(map, { gran: traktGrans(traktGeo), start: objektStartKamera(valtObjekt) })');
    expect(f.slice(0, 700)).toContain('slappAtgard(orsak).zoomaUt');
  });
  it('raden "Visa hela", stängd panel och telefonens "‹ Om trakten" är kopplade; objektinfon kan öppnas direkt på Om trakten', () => {
    expect(page).toContain("onSlapp: (orsak) => slappFramhavningRef.current(orsak),");
    expect(page).toContain('<ObjektInfo oppen={infoOppen} startVy={infoStartVy} {...op} />');
    expect(page).toContain('testid="framhav-list"');
    expect(page).toContain("slappFramhavningRef.current('tillbaka'); setInfoStartVy('om'); setTraktOversiktOpen(true);");
    expect(page).toContain("AVBRYT_KNAPP(() => slappFramhavningRef.current('rad'), 'framhav-slapp')");   // × på telefonens rad = som Visa hela (zoomar ut)
    // bara telefonen (arket stängdes av Visa) och bara när inget annat nertill-läge pågår
    expect(page).toContain("framhavdLageRef.current === 'ark' && !traktOversiktOpen");
  });
  it('Visa › på en linje/yta rymmer HELA figuren (fitBounds), en symbol flyger till punkten; panelen på bred skärm räknas bort', () => {
    expect(page).toContain('const bounds = framhavBounds(framhavdFran(m));');
    expect(page).toContain('map.fitBounds(bounds,');
    expect(page).toContain('offset: [-panelPx / 2, 0]');
    expect(page).toContain("const panelPx = lage === 'panel' ? PANEL_BREDD_PX");
  });
  it('markeringarna bär hela linjen/ytan (geometri) och listans ikon är kartans (getIconDef: riktig färg + vit ring)', () => {
    expect(page).toContain('geometri = heltSpar(m.path)');
    expect(page).toContain('const def = getIconDef(m.typ);');
    expect(page).toContain('background: def.bg, border:');
    expect(page).not.toContain("const chipBg = (t: string) =>");
  });
});
