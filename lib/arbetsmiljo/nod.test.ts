// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LARMPLATS_NARA_M, NOD_NYCKEL, RUTINKORT, avstandM, hittaKort, koordinatRader, koordinatText, lasNod, senasteObjektPaEnheten, sparaNod,
  telLank, tolkaNod, valjLarmplats, type Larmplats,
} from './nod';
import { atgardTitel } from './atgarder';
import { byggTillbudNotis, tillbudNotisText, type TillbudNotisRad } from './tillbudNotis';

const plats = (o: Partial<Larmplats>): Larmplats => ({ objektId: 'o', namn: 'Trakt', lat: 56.8, lng: 15.2, beskrivning: null, ...o });

describe('rutinkorten', () => {
  it('sju kort, alla med exakt tre steg och unika id', () => {
    expect(RUTINKORT).toHaveLength(7);
    for (const k of RUTINKORT) expect(k.steg).toHaveLength(3);
    expect(new Set(RUTINKORT.map(k => k.id)).size).toBe(7);
  });
  it('hittaKort: okänt id ger inget', () => {
    expect(hittaKort('brand')?.titel).toBe('Det brinner');
    expect(hittaKort('finns-inte')).toBeNull();
    expect(hittaKort(null)).toBeNull();
  });
});

describe('koordinaten', () => {
  it('fem decimaler, som larmkoordinaten i resten av appen', () => {
    expect(koordinatText(56.843214, 15.2219)).toBe('56.84321, 15.22190');
    expect(koordinatRader(56.843214, 15.2219)).toEqual(['N 56.84321', 'E 15.22190']);
  });
  it('tel-länken tar bort mellanslag och bindestreck', () => {
    expect(telLank('070-123 45 67')).toBe('tel:0701234567');
    expect(telLank('+46 70 123')).toBe('tel:+4670123');
  });
});

describe('vilken larmplats', () => {
  const nara = plats({ objektId: 'a', namn: 'Nära', lat: 56.8, lng: 15.2 });
  const langt = plats({ objektId: 'b', namn: 'Långt', lat: 57.5, lng: 15.2 });
  it('med position: den närmaste inom 3 km', () => {
    expect(valjLarmplats([langt, nara], { lat: 56.81, lng: 15.2, noggrannhet: 10 }, null)?.namn).toBe('Nära');
  });
  it('med position men ingen trakt nära: ingen (aldrig en trakt långt bort)', () => {
    const pos = { lat: 56.8 + (LARMPLATS_NARA_M + 200) / 111_000, lng: 15.2, noggrannhet: 10 };
    expect(avstandM(pos, nara)).toBeGreaterThan(LARMPLATS_NARA_M);
    expect(valjLarmplats([nara], pos, 'a')).toBeNull();
  });
  it('utan position: traktens som enheten senast hade öppen, annars ingen', () => {
    expect(valjLarmplats([nara, langt], null, 'b')?.namn).toBe('Långt');
    expect(valjLarmplats([nara, langt], null, 'c')).toBeNull();
    expect(valjLarmplats([nara, langt], null, null)).toBeNull();
  });
});

describe('det som sparas på enheten', () => {
  beforeEach(() => { localStorage.clear(); });
  it('sparas och läses tillbaka; trasigt eller fel form ger inget', () => {
    sparaNod({ kontakter: [{ namn: 'Martin', telefon: '070' }], larmplatser: [plats({})], hamtad: 5 });
    expect(lasNod()).toEqual({ kontakter: [{ namn: 'Martin', telefon: '070' }], larmplatser: [plats({})], hamtad: 5 });
    localStorage.setItem(NOD_NYCKEL, '{trasig');
    expect(lasNod()).toBeNull();
    expect(tolkaNod(JSON.stringify({ kontakter: 'x', larmplatser: [], hamtad: 1 }))).toBeNull();
  });
  it('en kontakt utan telefon och en plats utan koordinat sållas bort', () => {
    const d = tolkaNod(JSON.stringify({ kontakter: [{ namn: 'A', telefon: '' }, { namn: 'B', telefon: '1' }], larmplatser: [{ objektId: 'x', lat: 'n', lng: 1 }], hamtad: 1 }));
    expect(d?.kontakter).toEqual([{ namn: 'B', telefon: '1' }]);
    expect(d?.larmplatser).toEqual([]);
  });
  it('senaste objekt: maskindatorns minne före planeringens', () => {
    expect(senasteObjektPaEnheten()).toBeNull();
    localStorage.setItem('planering_senaste_objekt_v1', JSON.stringify({ anvandarId: 'u', objektId: 'plan' }));
    expect(senasteObjektPaEnheten()).toBe('plan');
    localStorage.setItem('enhet_senaste_objekt_v1', JSON.stringify({ maskinId: 'm', objektId: 'maskin' }));
    expect(senasteObjektPaEnheten()).toBe('maskin');
  });
});

describe('tillbud i åtgärdslistan', () => {
  it('ett tillbud säger vad det är först, en maskinåtgärd heter som maskinen', () => {
    expect(atgardTitel({ kalla: 'tillbud', maskinNamn: 'Giant' }, 'olycka')).toBe('Olycka · Giant');
    expect(atgardTitel({ kalla: 'tillbud', maskinNamn: null }, 'tillbud')).toBe('Tillbud');
    expect(atgardTitel({ kalla: 'tillbud', maskinNamn: null }, null)).toBe('Tillbud');
    expect(atgardTitel({ kalla: 'svar', maskinNamn: 'Wisent' }, 'olycka')).toBe('Wisent');
    expect(atgardTitel({ kalla: 'forare', maskinNamn: null })).toBe('Okänd maskin');
  });
});

describe('tillbudspushen', () => {
  const rad = (o: Partial<TillbudNotisRad> = {}): TillbudNotisRad => ({
    id: 'a-1', status: 'oppen', typ: 'olycka', beskrivning: 'Fick en gren i ansiktet', maskin_namn: 'Giant', rapportor_namn: 'Stefan Karlsson', ...o,
  });
  const nu = Date.parse('2026-11-01T12:00:00Z');
  const n = (o: Record<string, unknown> = {}) => ({ typ: 'am_tillbud', payload: { atgard_id: 'a-1' }, skapad_at: '2026-11-01T11:59:00Z', ...o });

  it('olycka med maskin, text och förnamn; länkar till åtgärden', async () => {
    expect(await byggTillbudNotis(n(), async () => ({ rad: rad() }), nu)).toEqual({ typ: 'skicka', meddelande: {
      title: 'Olycka · Giant', body: 'Fick en gren i ansiktet · Stefan', url: '/atgarder?id=a-1', tag: 'am-tillbud-a-1' } });
  });
  it('tillbud utan maskin', () => {
    expect(tillbudNotisText(rad({ typ: 'tillbud', maskin_namn: null }))).toEqual({ title: 'Tillbud', body: 'Fick en gren i ansiktet · Stefan' });
  });
  it('borta eller åtgärdad skickas inte; läsfel skjuter upp; för gammal hoppas över', async () => {
    expect((await byggTillbudNotis(n(), async () => ({ rad: null }), nu)).typ).toBe('hoppa_over');
    expect((await byggTillbudNotis(n(), async () => ({ rad: rad({ status: 'klar' }) }), nu)).typ).toBe('hoppa_over');
    expect(await byggTillbudNotis(n(), async () => ({ rad: null, fel: 'nät' }), nu)).toEqual({ typ: 'uppskjut' });
    expect((await byggTillbudNotis(n({ skapad_at: '2026-10-30T10:00:00Z' }), async () => ({ rad: rad() }), nu)).typ).toBe('hoppa_over');
    expect((await byggTillbudNotis(n({ payload: {} }), async () => ({ rad: rad() }), nu)).typ).toBe('hoppa_over');
  });
});
