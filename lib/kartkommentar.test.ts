import { describe, expect, it } from 'vitest';
import {
  aldreKommentar, arVaranFel, forfattarText, kanAndraKommentar, kanRaderaKommentar, koVantan, kommentarerForNyckel, kortKommentarer, laggKoOvanpa, larmKommentarText,
  markerNyckel, senasteKommentar, senasteLarmKommentarer, slaIhopOp, tidText, type KommentarVy, type KoPost,
} from './kartkommentar';

const rad = (id: string, over: Partial<KommentarVy> = {}): KommentarVy => ({
  id, objekt_id: 'o1', yta_nyckel: 'linje:abc', text: 'text ' + id, skapad_av: 'm1', namn: 'Martin Lindqvist', skapad_at: '2026-10-20T14:20:00Z', andrad_at: '2026-10-20T14:20:00Z', vantar: false, ...over,
});
const post = (over: Partial<KoPost> = {}): KoPost => ({ id: 'k1', objekt_id: 'o1', yta_nyckel: 'linje:abc', op: 'ny', text: 'hej', skapad_av: 'm1', namn: 'Martin', skapad_lokalt: '2026-10-20T14:20:00Z', forsok: 0, nasta: 0, ...over });

describe('namn och tid', () => {
  const nu = new Date('2026-10-20T16:30:00Z');   // 18:30 svensk tid (sommartid slutar 25 okt)
  it('idag, i går, datum och datum med år (svensk tid)', () => {
    expect(tidText('2026-10-20T14:20:00Z', nu)).toBe('idag 16:20');
    expect(tidText('2026-10-19T14:20:00Z', nu)).toBe('i går 16:20');
    expect(tidText('2026-10-12T07:05:00Z', nu)).toBe('12 okt 09:05');
    expect(tidText('2025-12-24T10:00:00Z', nu)).toBe('24 dec 2025 11:00');
    expect(tidText('inte ett datum', nu)).toBe('');
  });
  it('en dag räknas efter svensk midnatt, inte UTC', () => {
    expect(tidText('2026-10-19T22:30:00Z', nu)).toBe('idag 00:30');   // 00:30 den 20:e svensk tid
  });
  it('"Martin · i går 16:20" — förnamn och tid; okänd författare står som Okänd', () => {
    expect(forfattarText('Martin Lindqvist', '2026-10-19T14:20:00Z', nu)).toBe('Martin · i går 16:20');
    expect(forfattarText(null, '2026-10-19T14:20:00Z', nu)).toBe('Okänd · i går 16:20');
    expect(forfattarText('Daniel Svensson', null, nu)).toBe('Daniel');
  });
});

describe('vem får göra vad', () => {
  it('bara författaren ändrar; författaren och admin raderar; en förare raderar aldrig någon annans', () => {
    const r = rad('a', { skapad_av: 'daniel' });
    expect(kanAndraKommentar(r, 'daniel')).toBe(true);
    expect(kanAndraKommentar(r, 'oskar')).toBe(false);
    expect(kanAndraKommentar(r, null)).toBe(false);
    expect(kanRaderaKommentar(r, 'daniel', false)).toBe(true);
    expect(kanRaderaKommentar(r, 'oskar', false)).toBe(false);
    expect(kanRaderaKommentar(r, 'martin', true)).toBe(true);     // admin raderar andras …
    expect(kanAndraKommentar(r, 'martin')).toBe(false);           // … men ändrar aldrig deras text
  });
  it('en rad utan författare kan ingen ändra, bara admin radera', () => {
    const r = rad('a', { skapad_av: null });
    expect(kanAndraKommentar(r, 'daniel')).toBe(false);
    expect(kanRaderaKommentar(r, 'daniel', false)).toBe(false);
    expect(kanRaderaKommentar(r, 'daniel', true)).toBe(true);
  });
});

describe('raderna på kortet', () => {
  const nu = new Date('2026-10-20T16:30:00Z');
  it('en rad per kommentar, äldst först, med namn och tid och rätt knappar per rad', () => {
    const rader = [
      rad('2', { skapad_at: '2026-10-20T10:00:00Z', skapad_av: 'oskar', namn: 'Oskar Nilsson', text: 'Svaret' }),
      rad('1', { skapad_at: '2026-10-19T14:20:00Z', skapad_av: 'daniel', namn: 'Daniel Svensson', text: 'Stolpe lutar' }),
      rad('x', { yta_nyckel: 'annan', text: 'på ett annat objekt' }),
    ];
    const k = kortKommentarer({ rader, nyckel: 'linje:abc', objektId: 'o1', minId: 'daniel', arAdmin: false, nu });
    expect(k.map((r) => r.text)).toEqual(['Stolpe lutar', 'Svaret']);
    expect(k[0]).toMatchObject({ forfattare: 'Daniel · i går 16:20', kanAndra: true, kanRadera: true });
    expect(k[1]).toMatchObject({ forfattare: 'Oskar · idag 12:00', kanAndra: false, kanRadera: false });
  });
  it('admin ser Ta bort på andras men inte Ändra', () => {
    const k = kortKommentarer({ rader: [rad('1', { skapad_av: 'daniel' })], nyckel: 'linje:abc', objektId: 'o1', minId: 'martin', arAdmin: true, nu });
    expect(k[0]).toMatchObject({ kanAndra: false, kanRadera: true });
  });
  it('markeringens gamla kommentarfält visas först som "Äldre kommentar" utan namn och tid; bara admin tar bort den', () => {
    const nyckel = markerNyckel(1790708158598);
    const rader = [rad('1', { yta_nyckel: nyckel })];
    const forare = kortKommentarer({ rader, nyckel, objektId: 'o1', aldreText: 'Gammal text', minId: 'm1', arAdmin: false, nu });
    expect(forare[0]).toMatchObject({ text: 'Gammal text', forfattare: null, kanAndra: false, kanRadera: false });
    expect(forare).toHaveLength(2);
    const admin = kortKommentarer({ rader, nyckel, objektId: 'o1', aldreText: 'Gammal text', minId: 'martin', arAdmin: true, nu });
    expect(admin[0]).toMatchObject({ kanAndra: false, kanRadera: true });
    expect(aldreKommentar('o1', nyckel, '  ')).toBeNull();
    expect(kommentarerForNyckel([rad('1'), rad('2', { yta_nyckel: 'x' })], 'linje:abc')).toHaveLength(1);
  });
});

describe('larmkortet visar senaste kommentaren med namn', () => {
  it('"Daniel: Stolpe lutar" — den senaste per objekt, förnamn före texten', () => {
    const rader = [
      rad('1', { skapad_at: '2026-10-19T10:00:00Z', namn: 'Martin Lindqvist', text: 'Låg ledning' }),
      rad('2', { skapad_at: '2026-10-20T10:00:00Z', namn: 'Daniel Svensson', text: 'Stolpe lutar' }),
    ];
    expect(senasteKommentar(rader)?.id).toBe('2');
    expect(senasteLarmKommentarer(rader)).toEqual({ 'linje:abc': 'Daniel: Stolpe lutar' });
  });
  it('en äldre kommentar utan namn visas bara om inget annat finns, och då utan namn', () => {
    const aldre = aldreKommentar('o1', 'linje:abc', 'Gammal')!;
    expect(larmKommentarText(aldre)).toBe('Gammal');
    expect(senasteKommentar([aldre, rad('1')])?.id).toBe('1');
    expect(senasteKommentar([aldre])?.aldre).toBe(true);
  });
});

describe('kön', () => {
  it('ny + ändra = ny med nya texten; ny + radera = ingenting; ändra + radera = radera; en radera ändras aldrig igen', () => {
    expect(slaIhopOp(undefined, post())).toMatchObject({ op: 'ny' });
    expect(slaIhopOp(post(), post({ op: 'andra', text: 'ny text' }))).toMatchObject({ op: 'ny', text: 'ny text' });
    expect(slaIhopOp(post(), post({ op: 'radera' }))).toBeNull();
    expect(slaIhopOp(post({ op: 'andra' }), post({ op: 'radera' }))).toMatchObject({ op: 'radera' });
    expect(slaIhopOp(post({ op: 'radera' }), post({ op: 'andra', text: 'x' }))).toMatchObject({ op: 'radera' });
  });
  it('en väntande ny kommentar visas direkt med märket väntar, en väntande radering döljer raden, en väntande ändring byter texten', () => {
    const server = [rad('s1', { text: 'server' })];
    const v = laggKoOvanpa(server, [post({ id: 'k9', text: 'min nya' }), post({ id: 's1', op: 'andra', text: 'ändrad' })], 'o1');
    expect(v.find((r) => r.id === 'k9')).toMatchObject({ text: 'min nya', vantar: true, namn: 'Martin' });
    expect(v.find((r) => r.id === 's1')).toMatchObject({ text: 'ändrad', vantar: true });
    expect(laggKoOvanpa(server, [post({ id: 's1', op: 'radera' })], 'o1')).toEqual([]);
    expect(laggKoOvanpa(server, [post({ id: 'k9', objekt_id: 'annat' })], 'o1')).toHaveLength(1);
  });
  it('väntetiden växer och tar slut vid 2 min; bara fel som aldrig blir bättre ges upp', () => {
    expect([1, 2, 3, 4, 10].map(koVantan)).toEqual([5000, 10000, 20000, 40000, 120000]);
    expect(arVaranFel({ code: '42501' })).toBe(true);        // RLS
    expect(arVaranFel({ code: '23503' })).toBe(true);        // objektet finns inte
    expect(arVaranFel({ code: '23505' })).toBe(false);       // finns redan = skickat
    expect(arVaranFel({ code: 'PGRST301' })).toBe(false);    // utgången session: försök igen
    expect(arVaranFel({ message: 'Failed to fetch' } as any)).toBe(false);
    expect(arVaranFel(null)).toBe(false);
  });
});
