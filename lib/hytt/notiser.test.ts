import { describe, expect, it } from 'vitest';
import { besokNotis, faraNotis, gpsSaknasNotis, faraRegel, farorUrLarm, omradeNotis, omradeNyckel, omradeUrKort, stegaNotiser, testNotis, TOMT_NOTISLAGE, type NotisIndata, type NotisState } from './notiser';
import { fonsterLage, lasFonsterLage } from './notisFonster';

const NU = Date.parse('2026-10-24T10:00:00Z');
const min = (m: number) => NU + m * 60000;

const LEDNING = { id: 'm1', namn: 'El-ledning', typ: 'powerline', avstandM: 12, text: null };
const BESOK = { id: 'b1', namn: 'Anna Svensson', besokstid: new Date(NU + 30 * 60000).toISOString() };
const OMRADE = { nyckel: 'hansyn:4', namn: 'Hänsynsyta 4', bricka: 'Hänsyn 4', typ: 'Kant mot vatten', instruktioner: [{ text: 'Lämna kantzonen mot sjön.', hash: 'h1' }], fler: 0 };

const indata = (over: Partial<NotisIndata> = {}): NotisIndata => ({
  lage: 'borta', nu: NU, roll: 'skordare', trakt: 'Skälviken', maskinId: 'R64428', test: false, url: '/planering', fara: [], besok: [], omrade: null, ...over,
});
const steg = (prev: NotisState, over: Partial<NotisIndata> = {}) => stegaNotiser(prev, indata(over));

describe('fönstret: framme = synligt OCH valt', () => {
  it('bara synligt + fokus är framme; allt annat är borta', () => {
    expect(fonsterLage({ visibilityState: 'visible', harFokus: true })).toBe('framme');
    expect(fonsterLage({ visibilityState: 'visible', harFokus: false })).toBe('borta');   // ett annat program är valt
    expect(fonsterLage({ visibilityState: 'hidden', harFokus: true })).toBe('borta');     // minimerat eller helt täckt
    expect(fonsterLage({})).toBe('borta');                                                // osäker läsning = borta
  });
  it('lasFonsterLage läser dokumentet och tål att hasFocus kastar', () => {
    expect(lasFonsterLage({ visibilityState: 'visible', hasFocus: () => true } as any)).toBe('framme');
    expect(lasFonsterLage({ visibilityState: 'visible', hasFocus: () => { throw new Error('x'); } } as any)).toBe('borta');
    expect(lasFonsterLage(undefined as any)).toBe('borta');
  });
});

describe('FARA — röd, ligger kvar, en per inkörning', () => {
  it('titel "<Namn> <meter> m", regel per maskin, röd ikon, ligger kvar, en knapp', () => {
    const skordare = faraNotis(LEDNING, 'skordare', '/planering');
    expect(skordare).toMatchObject({ typ: 'fara', titel: 'El-ledning 12 m', ikon: '/notis-fara.png', kvarTillTryck: true, tag: 'fara-m1' });
    expect(skordare.text).toBe('Fäll inte mot ledningen');
    expect(skordare.knappar).toEqual([{ action: 'visa', title: 'Visa på kartan' }]);
    expect(faraNotis(LEDNING, 'skotare', '/planering').text).toBe('Kranen nära ledningen');
    expect(faraRegel({ namn: 'Brant', avstandM: 8 }, 'skordare')).toBe('Håll avstånd');
    expect(faraRegel({ namn: 'Ej framkomlig', avstandM: null }, 'skordare')).toBe('Du är inne i ytan – kör inte här');
  });
  it('Kraftledning (Vidas) räknas som ledning, Markkabel gör det inte', () => {
    expect(faraRegel({ namn: 'Kraftledning', avstandM: 20 }, 'skordare')).toBe('Fäll inte mot ledningen');
    expect(faraRegel({ namn: 'Markkabel', avstandM: 3 }, 'skordare')).toBe('Håll avstånd');
  });
  it('markeringens kommentar kommer med som andra rad', () => {
    expect(faraNotis({ ...LEDNING, text: 'Stolpe lutar\nHögspänning' }, 'skordare', '/p').text).toBe('Fäll inte mot ledningen\nStolpe lutar');
  });
  it('appen borta: EN notis, och inte en till medan faran är kvar nära', () => {
    const a = steg(TOMT_NOTISLAGE, { fara: [LEDNING] });
    expect(a.visa.map((n) => n.typ)).toEqual(['fara']);
    const b = steg(a.state, { fara: [{ ...LEDNING, avstandM: 6 }] });
    expect(b.visa).toEqual([]);
  });
  it('kör ut och in igen = en ny inkörning = en ny notis', () => {
    const a = steg(TOMT_NOTISLAGE, { fara: [LEDNING] });
    const ut = steg(a.state, { fara: [] });
    expect(ut.state.fara).toEqual({});
    expect(steg(ut.state, { fara: [LEDNING] }).visa).toHaveLength(1);
  });
  it('appen framme: ingen notis; blir den borta medan faran är nära kommer notisen då', () => {
    const framme = steg(TOMT_NOTISLAGE, { lage: 'framme', fara: [LEDNING] });
    expect(framme.visa).toEqual([]);
    expect(steg(framme.state, { lage: 'borta', fara: [LEDNING] }).visa).toHaveLength(1);
  });
  it('farorUrLarm tar bara Röd (grupp fara), stora kortet och +-raden, och upprepar inte yttexten', () => {
    const post = (o: any) => ({ id: 'x', grupp: 'fara', namn: 'N', kalla: 'symbol', avstandM: 10, text: null, ...o });
    const ut = farorUrLarm(post({ id: 'a', namn: 'El-ledning', text: 'Lutar' }), [post({ id: 'b', grupp: 'natur' }), post({ id: 'c', kalla: 'yta', avstandM: null, text: 'Du är inne i ytan, kör inte här', namn: 'Brant' })]);
    expect(ut.map((f) => f.id)).toEqual(['a', 'c']);
    expect(ut[0].text).toBe('Lutar');
    expect(ut[1]).toMatchObject({ avstandM: null, text: null });
    expect(farorUrLarm(null, [])).toEqual([]);
    expect(farorUrLarm(post({ grupp: 'kultur' }), [post({ grupp: 'blott' })])).toEqual([]);
  });
});

describe('BESÖK — orange, ligger kvar, Uppfattat + Öppna kartan, påminnelse efter 5 min', () => {
  it('titel, text, ikon, knappar och data som service workern behöver', () => {
    const n = besokNotis(BESOK, { trakt: 'Skälviken', maskinId: 'R64428', test: false, url: '/planering', nu: new Date(NU), paminnelse: false });
    expect(n.titel).toMatch(/^Besök: Anna Svensson kommer /);
    expect(n.text).toBe('Skälviken · Stäng av när du ser hen');
    expect(n).toMatchObject({ typ: 'besok', ikon: '/notis-besok.png', kvarTillTryck: true, renotify: false, tag: 'besok-b1' });
    expect(n.knappar).toEqual([{ action: 'uppfattat', title: 'Uppfattat' }, { action: 'visa', title: 'Öppna kartan' }]);
    expect(n.data).toMatchObject({ hytt: true, typ: 'besok', besokId: 'b1', maskinId: 'R64428', test: false });
  });
  it('appen borta: notis; framme: ingen och den som låg uppe stängs', () => {
    const a = steg(TOMT_NOTISLAGE, { besok: [BESOK] });
    expect(a.visa.map((n) => n.typ)).toEqual(['besok']);
    const b = steg(a.state, { lage: 'framme', besok: [BESOK] });
    expect(b.visa).toEqual([]);
    expect(b.stang).toEqual(['besok-b1']);
    expect(b.stangAlla).toBe(true);
    // borta igen, fortfarande ej kvitterat: ny notis
    expect(steg(b.state, { besok: [BESOK] }).visa.map((n) => n.typ)).toEqual(['besok']);
  });
  it('påminnelsen: efter 5 min utan Uppfattat kommer EN ny notis med ljud (renotify) — inte fler', () => {
    const a = steg(TOMT_NOTISLAGE, { besok: [BESOK], nu: NU });
    expect(steg(a.state, { besok: [BESOK], nu: min(4) }).visa).toEqual([]);
    const p = steg(a.state, { besok: [BESOK], nu: min(5) });
    expect(p.visa).toHaveLength(1);
    expect(p.visa[0]).toMatchObject({ renotify: true, tag: 'besok-b1' });
    expect(p.visa[0].text).toContain('Inte kvitterat ännu');
    expect(p.visa[0].data.paminnelse).toBe(true);
    expect(steg(p.state, { besok: [BESOK], nu: min(9) }).visa).toEqual([]);
    expect(steg(p.state, { besok: [BESOK], nu: min(60) }).visa).toEqual([]);
  });
  it('kvitterat (försvunnet ur listan) stänger notisen och städar', () => {
    const a = steg(TOMT_NOTISLAGE, { besok: [BESOK] });
    const b = steg(a.state, { besok: [] });
    expect(b.stang).toEqual(['besok-b1']);
    expect(b.state.besok).toEqual({});
  });
  it('testläget skickar test: true vidare', () => {
    expect(steg(TOMT_NOTISLAGE, { besok: [BESOK], test: true }).visa[0].data.test).toBe(true);
  });
});

describe('OMRÅDE — områdesnamn + första punkten, ingen knapp, en per yta och text', () => {
  it('titel = bricka · typ, första punkten, (+N till)', () => {
    const n = omradeNotis({ ...OMRADE, instruktioner: [{ text: 'Lämna kantzonen\nKör inte i diket', hash: 'h1' }, { text: 'Och detta', hash: 'h2' }], fler: 1 }, '/planering');
    expect(n).toMatchObject({ typ: 'omrade', titel: 'Hänsyn 4 · Kant mot vatten', ikon: '/notis-omrade.png', knappar: [], tag: 'omrade-hansyn:4' });
    expect(n.text).toBe('Lämna kantzonen (+2 till)');
  });
  it('utan bricka används områdets namn; lång text kortas', () => {
    const n = omradeNotis({ ...OMRADE, bricka: undefined, typ: undefined, instruktioner: [{ text: 'x'.repeat(300), hash: 'h' }] }, '/p');
    expect(n.titel).toBe('Hänsynsyta 4');
    expect(n.text.length).toBeLessThanOrEqual(141);
    expect(n.text.endsWith('…')).toBe(true);
  });
  it('en notis per yta och text: samma igen = ingen ny; ändrad text = ny', () => {
    const a = steg(TOMT_NOTISLAGE, { omrade: OMRADE });
    expect(a.visa.map((n) => n.typ)).toEqual(['omrade']);
    expect(steg(a.state, { omrade: OMRADE }).visa).toEqual([]);
    const ny = { ...OMRADE, instruktioner: [{ text: 'Ny text', hash: 'h9' }] };
    expect(steg(a.state, { omrade: ny }).visa).toHaveLength(1);
    expect(omradeNyckel(OMRADE)).not.toBe(omradeNyckel(ny));
  });
  it('appen framme: ingen notis', () => {
    expect(steg(TOMT_NOTISLAGE, { lage: 'framme', omrade: OMRADE }).visa).toEqual([]);
  });
  it('omradeUrKort: tomt kort ger ingen notis, osedda instruktioner följer med', () => {
    expect(omradeUrKort(null)).toBeNull();
    expect(omradeUrKort({ nyckel: 'k', namn: 'N', instruktioner: [], fler: 0 })).toBeNull();
    expect(omradeUrKort({ nyckel: 'k', namn: 'N', instruktioner: [{ text: 't', hash: 'h' }], fler: 2 })).toMatchObject({ nyckel: 'k', fler: 2 });
  });
});

describe('ordning och framme-läget', () => {
  it('flera samtidigt: skapas område, besök, fara (Windows lägger den senast skapade överst → fara överst)', () => {
    const u = steg(TOMT_NOTISLAGE, { fara: [LEDNING], besok: [BESOK], omrade: OMRADE });
    expect(u.visa.map((n) => n.typ)).toEqual(['omrade', 'besok', 'fara']);
  });
  it('info (avlägg, ved, grind) ger ingen notis: det finns ingen väg in — bara fara, besök och område matas in', () => {
    expect(steg(TOMT_NOTISLAGE, {}).visa).toEqual([]);
  });
  it('framme: allt som ligger uppe stängs (stangAlla), inget nytt visas', () => {
    const a = steg(TOMT_NOTISLAGE, { fara: [LEDNING], besok: [BESOK], omrade: OMRADE });
    const b = steg(a.state, { lage: 'framme', fara: [LEDNING], besok: [BESOK], omrade: OMRADE });
    expect(b.stangAlla).toBe(true);
    expect(b.visa).toEqual([]);
  });
  it('testnotisen har knapparna och ligger kvar', () => {
    expect(testNotis('/planering')).toMatchObject({ typ: 'test', kvarTillTryck: true, tag: 'hytt-test' });
  });
});

describe('GPS SAKNAS — röd, en gång per avbrott, bara när appen är borta', () => {
  it('texten säger att skyddet är borta; röd ikon, ligger kvar, en knapp', () => {
    expect(gpsSaknasNotis('/planering')).toMatchObject({
      typ: 'gps', tag: 'gps-saknas', titel: 'GPS saknas – faror varnas inte', ikon: '/notis-fara.png', kvarTillTryck: true, renotify: false,
      knappar: [{ action: 'visa', title: 'Öppna kartan' }],
    });
  });
  it('borta + GPS saknas: EN notis, och inte en till medan avbrottet pågår', () => {
    const a = steg(TOMT_NOTISLAGE, { gpsSaknas: true });
    expect(a.visa.map((n) => n.typ)).toEqual(['gps']);
    expect(steg(a.state, { gpsSaknas: true }).visa).toEqual([]);
    expect(steg(a.state, { gpsSaknas: true, nu: min(10) }).visa).toEqual([]);
  });
  it('GPS tillbaka: notisen stängs; nästa avbrott ger en ny', () => {
    const a = steg(TOMT_NOTISLAGE, { gpsSaknas: true });
    const tillbaka = steg(a.state, { gpsSaknas: false });
    expect(tillbaka.stang).toEqual(['gps-saknas']);
    expect(tillbaka.visa).toEqual([]);
    expect(steg(tillbaka.state, { gpsSaknas: true }).visa.map((n) => n.typ)).toEqual(['gps']);
  });
  it('appen framme: ingen notis; allt stängs; blir den borta mitt i avbrottet kommer notisen då', () => {
    const framme = steg(TOMT_NOTISLAGE, { lage: 'framme', gpsSaknas: true });
    expect(framme.visa).toEqual([]);
    expect(framme.stangAlla).toBe(true);
    expect(steg(framme.state, { lage: 'borta', gpsSaknas: true }).visa.map((n) => n.typ)).toEqual(['gps']);
  });
  it('GPS finns hela tiden: ingen notis alls (en gammal state utan gps-fältet kraschar inte)', () => {
    expect(steg(TOMT_NOTISLAGE, { gpsSaknas: false }).visa).toEqual([]);
    expect(steg(TOMT_NOTISLAGE, {}).visa).toEqual([]);
  });
  it('flera samtidigt: GPS-notisen skapas sist så att den hamnar överst', () => {
    const u = steg(TOMT_NOTISLAGE, { fara: [LEDNING], besok: [BESOK], omrade: OMRADE, gpsSaknas: true });
    expect(u.visa.map((n) => n.typ)).toEqual(['omrade', 'besok', 'fara', 'gps']);
  });
});
