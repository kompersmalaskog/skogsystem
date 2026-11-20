import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { kommentarTecken, linjeMitt, teckenFriLager, teckenHornLager, teckenPunkter } from './kommentarTecken';
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
});
