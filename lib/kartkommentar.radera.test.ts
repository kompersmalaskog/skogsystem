// Frågan före radering (Martin 2026-11-26): vilka kommentarer räknas — kartkommentarer på nyckeln, markeringens äldre kommentar och en ren Viktigt-rad; tomma rader räknas inte.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kommentarerForRadering, type KommentarVy } from './kartkommentar';

const rad = (id: string, nyckel: string, text: string, viktigt: string | null = null): KommentarVy => ({
  id, objekt_id: 'o1', yta_nyckel: nyckel, text, viktigt, skapad_av: 'm1', namn: 'Martin Hjert', skapad_at: '2026-11-25T10:00:00Z', andrad_at: '2026-11-25T10:00:00Z', vantar: false,
});
const i = { objektId: 'o1' };

describe('kommentarerForRadering', () => {
  it('ingen kommentar = ingen fråga (tom lista)', () => {
    expect(kommentarerForRadering({ ...i, rader: [], nyckel: 'marker:1' })).toEqual([]);
    expect(kommentarerForRadering({ ...i, rader: [rad('a', 'marker:2', 'annan markering')], nyckel: 'marker:1' })).toEqual([]);
    expect(kommentarerForRadering({ ...i, rader: [rad('a', 'marker:1', '   ')], nyckel: 'marker:1' })).toEqual([]);   // en tom rad är ingen kommentar
  });
  it('en kommentar på markeringen räknas, med text och författare', () => {
    const r = kommentarerForRadering({ ...i, rader: [rad('a', 'marker:1', 'Kör sakta vid bron')], nyckel: 'marker:1', nu: new Date('2026-11-25T12:00:00Z') });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'a', text: 'Kör sakta vid bron', viktigt: null });
    expect(r[0].forfattare).toContain('Martin');
  });
  it('en kommentar med BARA Viktigt-rad räknas (utan Övrigt), Viktigt står överst', () => {
    const r = kommentarerForRadering({ ...i, rader: [rad('a', 'marker:1', 'Vanlig'), rad('b', 'marker:1', '', 'Bro smal')], nyckel: 'marker:1' });
    expect(r.map((x) => [x.id, x.text, x.viktigt])).toEqual([['b', '', 'Bro smal'], ['a', 'Vanlig', null]]);
  });
  it('markeringens äldre kommentar (före kartkommentarerna) räknas också', () => {
    const r = kommentarerForRadering({ ...i, rader: [], nyckel: 'marker:1', aldreText: 'Gammal text' });
    expect(r).toHaveLength(1); expect(r[0].text).toBe('Gammal text'); expect(r[0].forfattare).toBeNull();
    expect(kommentarerForRadering({ ...i, rader: [], nyckel: 'marker:1', aldreText: '  ' })).toEqual([]);
  });
});

describe('sidan frågar före radering', () => {
  const sida = readFileSync('app/planering/page.tsx', 'utf8');
  it('markörkortets Ta bort, trakt-kortets Radera och översiktens Ta bort går genom frågan', () => {
    expect(sida).toContain('const deleteMarker = (id: string | number) => medKommentarFraga(');
    expect(sida).toContain('const raderaMarkering = (id: string | number) => {');
    expect(sida).toMatch(/onClick=\{\(\) => medKommentarFraga\(selectedOversiktVag, \(\) => \{/);
    expect(sida).toMatch(/onClick=\{\(\) => medKommentarFraga\(selectedOversiktItem, \(\) => \{/);
    expect(sida).toContain('onClick={() => deleteMarker(marker.id)}');
  });
  it('utan kommentar raderas direkt; med kommentar visas frågan och raderingen körs först vid Radera ändå', () => {
    expect(sida).toContain('if (rader.length === 0) { utfor(); return; }');
    expect(sida).toContain('setRaderaKommentarFraga({ rader, utfor });');
    expect(sida).toMatch(/<RaderaKommentarFraga rader=\{raderaKommentarFraga\.rader\} onAvbryt=\{\(\) => setRaderaKommentarFraga\(null\)\}/);
    expect(sida).toContain('f.utfor(); }}');
  });
  it('egna områden frågar på sin nyckel omrade:<id>, övriga på marker:<id>', () => {
    expect(sida).toContain("marker.lineType === 'boundary' ? `omrade:${id}` : markerNyckel(id)");
  });
});
