// "Nytt från …": rena regler (namn, stämpel, vad som är nytt, texten på raden, tonen).
import { describe, expect, it } from 'vitest';
import {
  andradAvNamn, arFaraMarkering, avstandText, avstandTillPlats, forenamn, kommentarPost, laggIPoster, markeringPlats, markeringPost, markeringsBaslinje,
  nyaKommentarer, nyaMarkeringar, osedda, radText, stampla, toneFor, NYTT_GRUPP_MS, type NyttPlats, type NyttPost,
} from './nyttFranPlaneraren';

const svg = (x: number, y: number) => ({ lat: 57 + y / 1e5, lon: 15 + x / 1e5 });
const sym = (id: string, type: string, extra: any = {}) => ({ id, isMarker: true, type, x: 0, y: 0, andradTs: 100, ...extra });

describe('namn', () => {
  it('förnamn ur ett helt namn; ett maskinnamn kortas aldrig', () => { expect(forenamn('Martin Hjert')).toBe('Martin'); expect(forenamn('H8E -26')).toBe('H8E -26'); expect(forenamn('Elefant 26')).toBe('Elefant 26'); expect(forenamn('Giant')).toBe('Giant'); expect(forenamn('  ')).toBeNull(); expect(forenamn(null)).toBeNull(); });
  it('personkonto → förnamn', () => { expect(andradAvNamn({ konto: { namn: 'Joacim Lindqvist', roll: 'admin' } })).toBe('Joacim'); });
  it('maskinkonto utan upplåst förare → maskinens namn, aldrig tomt', () => {
    expect(andradAvNamn({ konto: { namn: 'R64428', roll: 'maskin' }, maskinNamn: 'H8E -26' })).toBe('H8E -26');
    expect(andradAvNamn({ konto: { namn: 'R64428', roll: 'maskin' }, maskinNamn: '' })).toBe('R64428');
    expect(andradAvNamn({ konto: { namn: '', roll: 'maskin' } })).toBe('Maskinen');
  });
  it('maskinkonto med upplåst förare → förarens förnamn', () => { expect(andradAvNamn({ upplastNamn: 'Stefan Karlsson', konto: { namn: 'Giant', roll: 'maskin' }, maskinNamn: 'Giant' })).toBe('Stefan'); });
});

describe('stampel', () => {
  it('stämplar id och namn utan att röra markeringen', () => {
    const m = sym('1', 'warning'); const s = stampla(m, { id: 'u1', namn: 'Martin' });
    expect(s).toMatchObject({ id: '1', type: 'warning', andradAv: 'u1', andradAvNamn: 'Martin' });
    expect((m as any).andradAv).toBeUndefined();
  });
});

describe('nya markeringar', () => {
  const bas = markeringsBaslinje([sym('1', 'warning'), sym('2', 'wet')]);
  it('oförändrat → inget', () => { expect(nyaMarkeringar(bas, [sym('1', 'warning'), sym('2', 'wet')], 'jag').nya).toEqual([]); });
  it('ny markering från en annan → ny', () => {
    const r = nyaMarkeringar(bas, [sym('1', 'warning'), sym('2', 'wet'), sym('3', 'powerline', { andradAv: 'x', andradAvNamn: 'Martin' })], 'jag');
    expect(r.nya.map((m) => m.id)).toEqual(['3']);
    expect(r.bas.get('3')).toBe(100);
  });
  it('ändrad (nyare andradTs) → ny', () => { expect(nyaMarkeringar(bas, [sym('1', 'warning', { andradTs: 250 }), sym('2', 'wet')], 'jag').nya.map((m) => m.id)).toEqual(['1']); });
  it('mitt eget → aldrig nytt', () => { expect(nyaMarkeringar(bas, [sym('9', 'wet', { andradAv: 'jag', andradAvNamn: 'Stefan' })], 'jag').nya).toEqual([]); });
  it('ostämplad rad från någon annan räknas, och heter "planeringen"', () => {
    const { nya } = nyaMarkeringar(bas, [sym('7', 'wet')], 'jag');
    expect(nya).toHaveLength(1);
    expect(markeringPost(nya[0], null, 5).av).toBe('planeringen');
  });
  it('borttagen markering är ingen ändring', () => { expect(nyaMarkeringar(bas, [sym('1', 'warning')], 'jag').nya).toEqual([]); });
});

describe('nya kommentarer', () => {
  const k = (id: string, extra: any = {}) => ({ id, skapad_av: 'a', namn: 'Martin Hjert', text: 'Hej', viktigt: null, yta_nyckel: 'hansyn:3', skapad_at: '2026-11-24T10:00:00Z', andrad_at: null, ...extra });
  const bas = new Map([['k1', '2026-11-24T10:00:00Z']]);
  it('ny och ändrad räknas, egen och oförändrad inte', () => {
    const r = nyaKommentarer(bas, [k('k1'), k('k2'), k('k3', { skapad_av: 'jag' })], 'jag');
    expect(r.nya.map((x) => x.id)).toEqual(['k2']);
    expect(nyaKommentarer(bas, [k('k1', { andrad_at: '2026-11-24T10:05:00Z' })], 'jag').nya.map((x) => x.id)).toEqual(['k1']);
  });
  it('Viktigt-raden ger gul ton och visas före kommentaren', () => {
    const p = kommentarPost(k('k9', { viktigt: 'Kör inte in i hänsynen' }), null, 1);
    expect(p).toMatchObject({ rubrik: 'Viktigt', detalj: 'Kör inte in i hänsynen', ton: 'viktigt', av: 'Martin' });
    expect(radText([p], null)).toBe('Nytt från Martin: Viktigt – Kör inte in i hänsynen');
  });
  it('vanlig kommentar → neutral, "Kommentar – början"', () => { expect(radText([kommentarPost(k('k8', { text: 'Stolpe lutar\nmer text' }), null, 1)], null)).toBe('Nytt från Martin: Kommentar – Stolpe lutar'); });
});

describe('platsen och avståndet', () => {
  it('en symbol är en punkt, en linje har bounds', () => {
    expect(markeringPlats(sym('1', 'wet', { x: 10, y: 20 }), svg)).toMatchObject({ geometri: { type: 'Point' } });
    const l = markeringPlats({ id: 'l', isLine: true, lineType: 'stonewall', path: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 50 }] }, svg)!;
    expect(l.geometri.type).toBe('LineString');
    expect(l.bounds[0][0]).toBeLessThan(l.bounds[1][0]);
  });
  it('avstånd i meter avrundat till 10 m, km från 1 km', () => {
    expect(avstandText(118)).toBe('120 m'); expect(avstandText(83)).toBe('80 m'); expect(avstandText(4)).toBe('10 m'); expect(avstandText(1240)).toBe('1,2 km'); expect(avstandText(null)).toBeNull();
  });
  it('avståndet till närmaste punkt', () => {
    const p: NyttPlats = { lat: 57.001, lng: 15, geometri: { type: 'Point', coordinates: [15, 57.001] }, bounds: [[15, 57.001], [15, 57.001]] };
    expect(Math.round(avstandTillPlats({ lat: 57, lon: 15 }, p)!)).toBeCloseTo(111, -1);
    expect(avstandTillPlats(null, p)).toBeNull();
  });
});

describe('fara', () => {
  it('röd grupp är fara, annat inte', () => {
    expect(arFaraMarkering(sym('1', 'warning'))).toBe(true);
    expect(arFaraMarkering(sym('1', 'powerline'))).toBe(true);
    expect(arFaraMarkering(sym('1', 'wet'))).toBe(false);
    expect(arFaraMarkering({ isLine: true, lineType: 'powerline' })).toBe(true);
    expect(arFaraMarkering({ isZone: true, zoneType: 'steep' })).toBe(true);
    expect(arFaraMarkering({ isZone: true, zoneType: 'wet' })).toBe(false);
  });
});

describe('raden', () => {
  const plats120: NyttPlats = { lat: 57.00108, lng: 15, geometri: { type: 'Point', coordinates: [15, 57.00108] }, bounds: [[15, 57.00108], [15, 57.00108]] };
  const post = (p: Partial<NyttPost>): NyttPost => ({ nyckel: 'markering:1', kalla: 'markering', av: 'Martin', rubrik: 'Varning', detalj: null, ton: 'neutral', plats: null, nar: 0, ...p });
  it('en ändring: namn, typ, kommentar och avstånd', () => { expect(radText([post({ detalj: 'Torrträd', plats: plats120 })], { lat: 57, lon: 15 })).toBe('Nytt från Martin: Varning – Torrträd, 120 m'); });
  it('utan kommentar och utan position', () => {
    expect(radText([post({ rubrik: 'Blött', av: 'Stefan', plats: plats120 })], { lat: 57.00036, lon: 15 })).toBe('Nytt från Stefan: Blött, 80 m');
    expect(radText([post({ rubrik: 'Blött' })], null)).toBe('Nytt från Martin: Blött');
  });
  it('flera: en rad med antal och avsändare', () => {
    expect(radText([post({ av: 'Jocke', nyckel: 'a' }), post({ av: 'Jocke', nyckel: 'b' }), post({ av: 'Jocke', nyckel: 'c' })], null)).toBe('3 nya från Jocke');
    expect(radText([post({ nyckel: 'a' }), post({ av: 'Jocke', nyckel: 'b' })], null)).toBe('2 nya från Martin och Jocke');
    expect(radText([post({ av: 'A', nyckel: 'a' }), post({ av: 'B', nyckel: 'b' }), post({ av: 'C', nyckel: 'c' })], null)).toBe('3 nya');
  });
  it('tonen: fara går före Viktigt går före neutral', () => {
    expect(toneFor([post({ ton: 'neutral' }), post({ ton: 'viktigt', nyckel: 'b' })])).toBe('viktigt');
    expect(toneFor([post({ ton: 'viktigt' }), post({ ton: 'fara', nyckel: 'b' })])).toBe('fara');
    expect(toneFor([post({})])).toBe('neutral');
  });
  it('loggen: samma sak ändrad igen ersätter, äldre än 2 min och sedda rensas', () => {
    const a = post({ nyckel: 'a', nar: 0 }); const b = post({ nyckel: 'b', nar: 10 });
    const l = laggIPoster([a, b], [post({ nyckel: 'a', nar: 20, rubrik: 'Ny' })], 20);
    expect(l.map((p) => p.nyckel)).toEqual(['b', 'a']);
    expect(laggIPoster(l, [], NYTT_GRUPP_MS + 15).map((p) => p.nyckel)).toEqual(['a']);
    expect(osedda([{ ...a, sedd: true }, b], 20).map((p) => p.nyckel)).toEqual(['b']);
  });
});
