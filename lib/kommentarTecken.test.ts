import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bubblaFarg, kommentarTecken, linjeMitt, teckenFriLager, teckenHornLager, teckenPunkter, teckenTraffLager, TECKEN_TRAFF_LAGERLISTA, TECKEN_TRAFF_PX, TRAFF_RADIE_MED_KOMMENTAR_PX, TECKEN_OVAN_LYFT_PX } from './kommentarTecken';
import { FARG } from './design/tokens';
import { KLICK_LAGER, kategoriForLager, valjKlickKategori } from './klickPrioritet';
import { linjeGeometriNyckel } from './vidaNycklar';

describe('kommentar-tecknet', () => {
  it('pratbubbla för text, kamera för foto, båda för båda, inget annars', () => {
    expect(kommentarTecken(true, false)).toBe('text');
    expect(kommentarTecken(false, true)).toBe('foto');
    expect(kommentarTecken(true, true)).toBe('bada');
    expect(kommentarTecken(false, false)).toBeNull();
  });
  it('linjens mitt är halvvägs längs linjen i meter, inte mittpunkten i listan', () => {
    const m = linjeMitt([[15, 57], [15, 57.001], [15, 57.009]])!;
    expect(m[0]).toBeCloseTo(15, 6);
    expect(m[1]).toBeCloseTo(57.0045, 4);
    expect(linjeMitt([])).toBeNull();
  });
  it('egna linjer och ytor med text eller foto får en punkt; utan får ingen', () => {
    const fc = teckenPunkter({
      nycklar: new Set(['marker:2']),
      egna: [
        { id: 1, slag: 'linje', coords: [[15, 57], [15, 57.001]], harText: false, harFoto: false },
        { id: 2, slag: 'linje', coords: [[15, 57], [15, 57.001]], harText: false, harFoto: false },
        { id: 3, slag: 'yta', coords: [[15, 57], [15.001, 57], [15.001, 57.001], [15, 57.001], [15, 57]], harText: false, harFoto: true },
      ],
    });
    expect(fc.features.map((f) => [f.properties.id, f.properties.kommentar, f.properties.ovanNamn])).toEqual([['marker:2', 'text', false], ['marker:3', 'foto', true]]);
  });
  it('Vidas linje med en kommentar (nyckeln ur geometrin) får tecknet mitt på linjen', () => {
    const geom = { type: 'LineString', coordinates: [[15, 57], [15, 57.002]] };
    const n = linjeGeometriNyckel(geom)!;
    const fc = teckenPunkter({ nycklar: new Set([n]), egna: [], vida: { features: [{ type: 'Feature', properties: { _typ: 'linje' }, geometry: geom }] } });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.kommentar).toBe('text');
  });
  it('styrkan följer avståndet (samma regel som symbolerna)', () => {
    const fc = teckenPunkter({ nycklar: new Set(['marker:1']), egna: [{ id: 1, slag: 'linje', coords: [[15, 57], [15, 57.001]], harText: true, harFoto: false }], styrka: () => 0.5 });
    expect(fc.features[0].properties.nar).toBe(0.5);
  });
  it('lagren skriver aldrig text på kartan — bara bilder', () => {
    expect(JSON.stringify(teckenHornLager(0.5))).not.toContain('text-field');
    expect(JSON.stringify(teckenFriLager())).not.toContain('text-field');
    expect(JSON.stringify(teckenHornLager(0.5))).toContain('"!=",["get","prick"],true');
  });
  it('sidan lägger tecknet i hörnet på symbolerna och följer symbolens storlek', () => {
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    expect(sida).toContain('map.addLayer(teckenHornLager(');
    expect(sida).toContain("map.setLayoutProperty(TECKEN_HORN_LAGER, 'icon-size'");
    expect(sida).toContain('src.setData(teckenPunkter({');
  });

  // ── Viktigt = ORANGE pratbubbla, ingen text på kartan (Martin 2026-11-26) ──
  it('en kommentar med Viktigt får en orange bubbla; Viktigt vinner över en vanlig kommentar; foto ger kamera bredvid', () => {
    expect(kommentarTecken(false, false, true)).toBe('viktigt');
    expect(kommentarTecken(true, false, true)).toBe('viktigt');
    expect(kommentarTecken(false, true, true)).toBe('viktigtfoto');
    expect(kommentarTecken(true, false, false)).toBe('text');
    expect(bubblaFarg('viktigt')).toBe(FARG.orange);
    expect(bubblaFarg('viktigtfoto')).toBe(FARG.orange);
    for (const slag of ['text', 'foto', 'bada'] as const) expect(bubblaFarg(slag)).toBe('#ffffff');   // vanliga kommentarer behåller sin vita bubbla
  });
  it('Viktigt på en linje, yta och Vidas linje/yta ger slaget viktigt i punkten', () => {
    const geom = { type: 'LineString', coordinates: [[15, 57], [15, 57.002]] };
    const nyckel = linjeGeometriNyckel(geom)!;
    const fc = teckenPunkter({
      nycklar: new Set(['marker:1', 'marker:3', nyckel]), viktigt: new Set(['marker:1', nyckel]),
      egna: [
        { id: 1, slag: 'linje', coords: [[15, 57], [15, 57.001]], harText: false, harFoto: false },
        { id: 3, slag: 'yta', coords: [[15, 57], [15.001, 57], [15.001, 57.001], [15, 57.001], [15, 57]], harText: true, harFoto: false },
      ],
      vida: { features: [{ type: 'Feature', properties: { _typ: 'linje' }, geometry: geom }] },
    });
    const slag = Object.fromEntries(fc.features.map((f) => [f.properties.id, f.properties.kommentar]));
    expect(slag).toEqual({ 'marker:1': 'viktigt', 'marker:3': 'text', [nyckel]: 'viktigt' });
  });
  it('en traktdels kommentar ligger under delytans nyckel (traktdel:<partKey>) — bubblan sitter på delytan, inte på Vidas TRDEL-id', () => {
    const ring: [number, number][] = [[15, 57], [15.002, 57], [15.002, 57.002], [15, 57.002], [15, 57]];
    const fc = teckenPunkter({ nycklar: new Set(['traktdel:9775:0']), viktigt: new Set(['traktdel:9775:0']), egna: [], traktdelar: [{ partKey: '9775:0', ring }, { partKey: '9372:0', ring }] });
    expect(fc.features.map((f) => [f.properties.id, f.properties.kommentar, f.properties.ovanNamn])).toEqual([['traktdel:9775:0', 'viktigt', true]]);
    // Vidas rå traktdel-feature (TRDEL_ID utan delindex) ger ALDRIG en bubbla — den nyckeln skriver ingen kommentar under.
    const vida = { features: [{ type: 'Feature', properties: { _lager: 'L_TRAKTDEL', _typ: 'traktgräns', TRDEL_ID: '9775' }, geometry: { type: 'Polygon', coordinates: [ring] } }] };
    expect(teckenPunkter({ nycklar: new Set(['traktdel:9775']), egna: [], vida }).features).toHaveLength(0);
  });
  it('ett eget område/en egen traktgräns (boundary) har sin kommentar under omrade:<id>', () => {
    const ring: [number, number][] = [[15, 57], [15.002, 57], [15.002, 57.002], [15, 57.002], [15, 57]];
    const fc = teckenPunkter({ nycklar: new Set(['omrade:9']), egna: [{ id: 9, nyckel: 'omrade:9', slag: 'yta', coords: ring, harText: false, harFoto: false }] });
    expect(fc.features.map((f) => [f.properties.id, f.properties.kommentar])).toEqual([['omrade:9', 'text']]);
  });
  it('Vidas hänsynsyta med Viktigt: bubblan ovanför ytans namn, slaget viktigt', () => {
    const ring = [[15, 57], [15.002, 57], [15.002, 57.002], [15, 57.002], [15, 57]];
    const vida = { features: [{ type: 'Feature', properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', LOPNR: '3' }, geometry: { type: 'Polygon', coordinates: [ring] } }] };
    const fc = teckenPunkter({ nycklar: new Set(['hansyn:3']), viktigt: new Set(['hansyn:3']), egna: [], vida });
    expect(fc.features.map((f) => [f.properties.id, f.properties.kommentar, f.properties.ovanNamn])).toEqual([['hansyn:3', 'viktigt', true]]);
  });
  it('en symbol med Viktigt tonas aldrig ned av avstånd (full styrka, som en fara)', () => {
    expect(readFileSync('app/planering/page.tsx', 'utf8')).toContain('KORVY_FARO_TYPER.has(String(m.type)) || viktigtNycklar.has(markerNyckel(m.id))');
  });
  it('lagren skriver ingen Viktigt-text på kartan — det finns inget textlager för Viktigt', () => {
    expect(readFileSync('app/planering/page.tsx', 'utf8')).not.toMatch(/viktigt-etikett|VIKTIGT_KALLA|viktigtLager|viktigtPunkter/);
    expect(readFileSync('lib/lagerOrdning.ts', 'utf8')).not.toContain('viktigt-etikett');
  });

  // ── Varje bubbla går att trycka på ──
  it('varje fristående bubbla har en osynlig träffyta (44 px+) på samma ställe som bubblan, och bubblan över en yta är lyft lika mycket som ikonen', () => {
    const [vanlig, ovan] = teckenTraffLager();
    expect(TECKEN_TRAFF_PX * 2).toBeGreaterThanOrEqual(44);
    expect(vanlig.type).toBe('circle'); expect(ovan.type).toBe('circle');
    expect(vanlig.paint['circle-radius']).toBe(TECKEN_TRAFF_PX);
    expect(vanlig.paint['circle-color']).toBe('rgba(0,0,0,0)');
    expect(vanlig.paint['circle-translate']).toEqual([0, 0]);
    expect(ovan.paint['circle-translate']).toEqual([0, -TECKEN_OVAN_LYFT_PX]);
    expect(JSON.stringify(teckenFriLager().layout['icon-offset'])).toContain(`[0,${-TECKEN_OVAN_LYFT_PX}]`);   // träffytan följer ikonens lyft
    expect(vanlig.source).toBe(teckenFriLager().source); expect(ovan.source).toBe(teckenFriLager().source);
    expect(TECKEN_TRAFF_LAGERLISTA).toEqual([vanlig.id, ovan.id]);
    expect(vanlig.id.startsWith('markers-')).toBe(true);   // följer med in i körvyns whitelist (KEEP_PREFIX)
  });
  it('trycket på en bubbla är en egen kategori ovanför symbol, linje och yta — bara larmet är högre', () => {
    expect(kategoriForLager('markers-kommentar-traff')).toBe('kommentar');
    expect(kategoriForLager('markers-kommentar-traff-ovan')).toBe('kommentar');
    expect(KLICK_LAGER.map((k) => k.kategori).slice(0, 3)).toEqual(['larm', 'kommentar', 'symbol']);
    expect(valjKlickKategori(['trakt-gr-fill', 'markers-kommentar-traff-ovan'])).toBe('kommentar');   // bubblan slår traktdelen under sig
    expect(valjKlickKategori(['line-hitbox', 'zone-fill', 'markers-kommentar-traff'])).toBe('kommentar');
    expect(valjKlickKategori(['larm-pin-hit', 'markers-kommentar-traff'])).toBe('larm');
  });
  it('en symbol med kommentar har större träffyta så att bubblan i hörnet (också när körvyn förstorar symbolen) går att trycka på', () => {
    expect(TRAFF_RADIE_MED_KOMMENTAR_PX).toBeGreaterThan(22);   // 22 = vanlig träffradie (44 px)
    expect(TRAFF_RADIE_MED_KOMMENTAR_PX).toBeGreaterThanOrEqual(Math.ceil(Math.hypot(20, 19) * 1.5));   // bubblan 20,−19 px från mitten × körvyns förstoring 1,5
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    expect(sida).toContain('TRAFF_RADIE_MED_KOMMENTAR_PX, TRAFF_RADIE_PX]');
  });
  it('sidan skickar delytorna och områdesnyckeln till bubblorna, och en bubbla på ett eget område öppnar områdets kort', () => {
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    expect(sida).toContain("traktdelar: traktdelDelar.filter((d: any) => !justeradeTraktdelar.has(d.partKey)).map((d: any) => ({ partKey: d.partKey, ring: d.ringLngLat as [number, number][] })),");
    expect(sida).toContain("nyckel: m.isLine && m.lineType === 'boundary' ? `omrade:${m.id}` : undefined,");
    expect(sida).toMatch(/nyckel\.startsWith\('omrade:'\)\) \{\n\s+const m = \(markersRef\.current as any\[\]\)\.find\(\(x\) => `omrade:\$\{x\?\.id\}` === nyckel\);\n\s+if \(m\) oppnaGranskort\(m\);/);
  });
  it('sidan öppnar bubblans EGEN markering (egen markering, eget område, Vida-yta/linje/traktdel) och avstår i ritläge', () => {
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    expect(sida).toContain("for (const l of teckenTraffLager()) if (!map.getLayer(l.id)) map.addLayer(l);");
    expect(sida).toContain("if (vinnandeKategoriForKarta(map, e.point) !== 'kommentar') return;");
    expect(sida).toContain("nyckel.startsWith('marker:')");
    expect(sida).toContain("nyckel.startsWith('omrade:')");
    expect(sida).toContain("oppnaVidaMalRef.current?.(nyckel, traktGeo?.features ?? []);");
    expect(sida).toContain("if (nyckel.startsWith('traktdel:')) { oppnaTraktdelKort(");
    expect(sida).toMatch(/const onBubbla = \(e: any\) => \{\n\s+if \(skotningDrawingRef\.current[^\n]+\n\s+if \(ritlageRef\.current \|\| larmPlacering\) return;/);
  });
});
