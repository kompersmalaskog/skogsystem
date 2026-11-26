// VIKTIGT-RADEN i kommentaren (Martin 2026-11-23): ren logik — en rad, högst 60 tecken, överst; Övrigt är det som alltid funnits.
import { describe, expect, it } from 'vitest';
import {
  VIKTIGT_MAX, arViktigtKolumnSaknas, harInnehall, kommentarSigText, kortKommentarer, laggKoOvanpa, larmKommentarText, rensaViktigt, slaIhopOp,
  viktigtForNyckel, viktigtPerNyckel, type KommentarRad, type KommentarVy, type KoPost,
} from './kartkommentar';

const rad = (id: string, over: Partial<KommentarRad> = {}): KommentarRad => ({
  id, objekt_id: 'o1', yta_nyckel: 'hansyn:1', text: 'Övrigt-text', viktigt: null, skapad_av: 'm1', namn: 'Martin Hjert', skapad_at: '2026-11-23T08:00:00Z', andrad_at: '2026-11-23T08:00:00Z', ...over,
});
const vy = (r: KommentarRad, vantar = false): KommentarVy => ({ ...r, vantar });
const post = (over: Partial<KoPost> = {}): KoPost => ({ id: 'k1', objekt_id: 'o1', yta_nyckel: 'hansyn:1', op: 'ny', text: 'x', skapad_av: 'm1', namn: 'Martin', skapad_lokalt: '2026-11-23T08:00:00Z', forsok: 0, nasta: 0, ...over });

describe('rensaViktigt', () => {
  it('en rad: radbrytningar och dubbla mellanslag blir ett mellanslag, kanterna trimmas', () => {
    expect(rensaViktigt('  Stenmuren\nligger\r\ndolt   i gräset ')).toBe('Stenmuren ligger dolt i gräset');
  });
  it(`högst ${VIKTIGT_MAX} tecken, utan avslutande mellanslag`, () => {
    const r = rensaViktigt('a'.repeat(59) + ' ' + 'b'.repeat(20))!;
    expect(r.length).toBeLessThanOrEqual(VIKTIGT_MAX);
    expect(r.endsWith(' ')).toBe(false);
  });
  it('tomt, bara blanka och null blir null', () => {
    expect(rensaViktigt('')).toBeNull();
    expect(rensaViktigt('   \n ')).toBeNull();
    expect(rensaViktigt(null)).toBeNull();
    expect(rensaViktigt(undefined)).toBeNull();
  });
});

describe('harInnehall — minst ett av fälten', () => {
  it('Viktigt räcker, Övrigt räcker, inget räcker inte', () => {
    expect(harInnehall('', 'Bro saknas')).toBe(true);
    expect(harInnehall('Något', null)).toBe(true);
    expect(harInnehall('  ', '  ')).toBe(false);
    expect(harInnehall('', undefined)).toBe(false);
  });
});

describe('kortKommentarer — Viktigt överst, Övrigt orört', () => {
  const rader = [
    vy(rad('a', { text: 'Gammal kommentar', skapad_at: '2026-11-20T08:00:00Z' })),
    vy(rad('b', { text: '', viktigt: 'Kör inte över muren', skapad_at: '2026-11-22T08:00:00Z' })),
    vy(rad('c', { text: 'Mer text', viktigt: 'Brant norrut', skapad_at: '2026-11-21T08:00:00Z' })),
  ];
  const k = kortKommentarer({ rader, nyckel: 'hansyn:1', objektId: 'o1', minId: 'm1', arAdmin: false, nu: new Date('2026-11-23T10:00:00Z') });
  it('kommentarerna med Viktigt kommer först (äldst först inom varje grupp), de utan sist', () => {
    expect(k.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('en gammal kommentar utan Viktigt har ingen Viktigt-rad och sin text kvar som Övrigt', () => {
    const a = k.find((x) => x.id === 'a')!;
    expect(a.viktigt).toBeNull();
    expect(a.text).toBe('Gammal kommentar');
  });
  it('en kommentar med bara Viktigt har tom Övrigt', () => {
    expect(k.find((x) => x.id === 'b')).toMatchObject({ text: '', viktigt: 'Kör inte över muren' });
  });
});

describe('viktigtPerNyckel och viktigtForNyckel', () => {
  const rader = [
    vy(rad('1', { yta_nyckel: 'hansyn:1', viktigt: 'Kör inte här', skapad_at: '2026-11-22T08:00:00Z' })),
    vy(rad('2', { yta_nyckel: 'hansyn:1', viktigt: 'Vattnet står högt', skapad_at: '2026-11-23T08:00:00Z' })),
    vy(rad('3', { yta_nyckel: 'marker:7', viktigt: null, text: 'bara text' })),
    vy(rad('4', { yta_nyckel: 'marker:8', viktigt: '   ' as any, text: 'x' })),
  ];
  it('en post per nyckel, flera Viktigt på samma nyckel läggs ihop äldst först', () => {
    const m = viktigtPerNyckel(rader);
    expect([...m.keys()]).toEqual(['hansyn:1']);
    expect(m.get('hansyn:1')).toBe('Kör inte här · Vattnet står högt');
  });
  it('äldst först oavsett i vilken ordning raderna kommer in', () => {
    expect(viktigtPerNyckel([...rader].reverse()).get('hansyn:1')).toBe('Kör inte här · Vattnet står högt');
  });
  it('en kommentar utan Viktigt (eller bara blanka) ger ingen etikett', () => {
    expect(viktigtPerNyckel(rader).has('marker:7')).toBe(false);
    expect(viktigtPerNyckel(rader).has('marker:8')).toBe(false);
  });
  it('viktigtForNyckel: raderna med författare', () => {
    const v = viktigtForNyckel(rader, 'hansyn:1');
    expect(v.map((x) => x.viktigt)).toEqual(['Kör inte här', 'Vattnet står högt']);
    expect(v[0].forfattare).toMatch(/^Martin ·/);
  });
});

describe('kön bär Viktigt', () => {
  it('ny post visas direkt med Viktigt och märket väntar', () => {
    const ut = laggKoOvanpa([], [post({ text: '', viktigt: 'Bro saknas' })], 'o1');
    expect(ut).toHaveLength(1);
    expect(ut[0]).toMatchObject({ viktigt: 'Bro saknas', text: '', vantar: true });
  });
  it('ändra på en serverrad byter Viktigt när posten bär det, annars rörs den inte', () => {
    const server = [rad('k1', { viktigt: 'Gammal rad', text: 'Text' })];
    expect(laggKoOvanpa(server, [post({ op: 'andra', text: 'Ny text', viktigt: 'Ny rad' })], 'o1')[0]).toMatchObject({ viktigt: 'Ny rad', text: 'Ny text' });
    expect(laggKoOvanpa(server, [post({ op: 'andra', text: 'Ny text' })], 'o1')[0]).toMatchObject({ viktigt: 'Gammal rad', text: 'Ny text' });
    expect(laggKoOvanpa(server, [post({ op: 'andra', text: 'Ny text', viktigt: null })], 'o1')[0].viktigt).toBeNull();
  });
  it('slaIhopOp: ändra på en väntande ny behåller Viktigt om ändringen inte rör det, och tar det nya annars', () => {
    const vantande = post({ op: 'ny', text: 'a', viktigt: 'Rad 1' });
    expect(slaIhopOp(vantande, post({ op: 'andra', text: 'b' }))).toMatchObject({ op: 'ny', text: 'b', viktigt: 'Rad 1' });
    expect(slaIhopOp(vantande, post({ op: 'andra', text: 'b', viktigt: 'Rad 2' }))).toMatchObject({ viktigt: 'Rad 2' });
    expect(slaIhopOp(vantande, post({ op: 'andra', text: 'b', viktigt: null }))).toMatchObject({ viktigt: null });
  });
});

describe('signaturer och larmrad', () => {
  it('kommentarSigText: oförändrad utan Viktigt (gamla "sett" består), ny signatur med Viktigt', () => {
    expect(kommentarSigText({ text: 'Hej' })).toBe('Hej');
    expect(kommentarSigText({ text: 'Hej', viktigt: null })).toBe('Hej');
    expect(kommentarSigText({ text: 'Hej', viktigt: 'Stopp' })).not.toBe('Hej');
    expect(kommentarSigText({ text: 'Hej', viktigt: 'Stopp' })).not.toBe(kommentarSigText({ text: 'Hej', viktigt: 'Stopp 2' }));
  });
  it('larmraden visar Viktigt när den finns, annars Övrigt (och aldrig "Daniel: " med tom text)', () => {
    expect(larmKommentarText({ namn: 'Daniel Nilsson', text: '', viktigt: 'Stolpe lutar', aldre: false })).toBe('Daniel: Stolpe lutar');
    expect(larmKommentarText({ namn: 'Daniel Nilsson', text: 'Lång text', viktigt: null, aldre: false })).toBe('Daniel: Lång text');
    // Har kommentaren båda står Viktigt (det som ska stå på en rad), inte Övrigt.
    expect(larmKommentarText({ namn: 'Daniel Nilsson', text: 'Lång text', viktigt: 'Stopp', aldre: false })).toBe('Daniel: Stopp');
  });
});

describe('arViktigtKolumnSaknas', () => {
  it('känner igen båda felen om kolumnen saknas, och inget annat', () => {
    expect(arViktigtKolumnSaknas({ code: 'PGRST204', message: "Could not find the 'viktigt' column of 'kartkommentar' in the schema cache" })).toBe(true);
    expect(arViktigtKolumnSaknas({ code: '42703', message: 'column kartkommentar.viktigt does not exist' })).toBe(true);
    expect(arViktigtKolumnSaknas({ code: '42703', message: 'column foo does not exist' })).toBe(false);
    expect(arViktigtKolumnSaknas({ code: '42501', message: 'permission denied viktigt' })).toBe(false);
    expect(arViktigtKolumnSaknas(null)).toBe(false);
  });
});
