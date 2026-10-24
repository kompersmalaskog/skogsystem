import { describe, expect, it } from 'vitest';
import {
  INNE_M, TOMT_INSTRUKTION, arInstruktionsText, arPlats, UT_MARGINAL_M, arOsedd, attKvittera, hashText, instruktionerPaTrakten, kortAttVisa, samlaOmraden, stegaInstruktion,
  type InstruktionOmrade, type SettKarta,
} from './instruktioner';
import type { KommentarVy } from '../kartkommentar';
import { kommentarPunkter } from '../kommentarPunkter';

const OBJ = 'obj-1';
const kvadrat = (lon: number, lat: number, d = 0.0005) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const hansyn = (lopnr: string, atgard: string, lon = 15, lat = 56) => ({
  type: 'Feature', geometry: kvadrat(lon, lat), properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', LOPNR: lopnr, FLBESKR: 'Naturvårdsyta', ATGARD: atgard },
});
const avlagg = (nr: string, atgard: string, lon: number, lat: number) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { _lager: 'L_TILLAGGSPUNKTER', _typ: 'punkt', EXTRA_LABE: nr, FLBESKR: 'Avlägg', ATGARD: atgard },
});
const traktdel = (nr: string) => ({ type: 'Feature', geometry: kvadrat(15, 56, 0.01), properties: { _lager: 'L_TRAKTDEL', TRDEL_ID: nr, TRDEL_NR_K: nr, FLBESKR: 'Slutavverkning' } });
const kk = (id: string, nyckel: string, text: string, namn = 'Martin'): KommentarVy => ({
  id, objekt_id: OBJ, yta_nyckel: nyckel, text, skapad_av: 'm1', namn, skapad_at: '2026-10-20T10:00:00Z', andrad_at: '2026-10-20T10:00:00Z', vantar: false,
});
const samla = (o: { vida?: any[]; kommentarer?: KommentarVy[]; markers?: any[]; pos?: { lat: number; lon: number } | null }) =>
  samlaOmraden({
    objektId: OBJ, vida: { features: o.vida ?? [] }, markers: o.markers ?? [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'Symbol',
    kommentarer: o.kommentarer ?? [], pos: o.pos === undefined ? { lat: 56, lon: 15 } : o.pos, nu: new Date('2026-10-21T08:00:00Z'),
  });
const INGET: SettKarta = new Map();

describe('samlaOmraden — var Vidas text finns', () => {
  it('Vidas ATGARD på en hänsynsyta blir en instruktion från Vida', () => {
    const o = samla({ vida: [hansyn('7', 'Spara alla aspar')] });
    expect(o).toHaveLength(1);
    expect(o[0].nyckel).toBe('hansyn:7');
    expect(o[0].instruktioner[0]).toMatchObject({ kalla: 'vida', text: 'Spara alla aspar', ref: 'vida:hansyn:7', forfattare: null });
  });
  it('Vidas ATGARD på ett avlägg är ett namn och ger ALDRIG en instruktion; en traktdel utan kommentar ger inget område', () => {
    expect(samla({ vida: [avlagg('01-1', 'skbv betet', 15, 56), traktdel('2')] })).toEqual([]);
  });
  it('en egen kommentar på ett avlägg är en instruktion (och avlägget märks som avlägg)', () => {
    const o = samla({ vida: [avlagg('01-1', 'skbv betet', 15, 56)], kommentarer: [kk('a', 'punkt:01-1', 'Lägg max 3 högar')] });
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ nyckel: 'punkt:01-1', avlagg: true });
    expect(o[0].instruktioner.map((x) => x.kalla)).toEqual(['egen']);
  });
  it('en traktdel har ingen Vida-text, men våra kommentarer på den räknas', () => {
    const o = samla({ vida: [traktdel('2')], kommentarer: [kk('k1', 'traktdel:2', 'Blött i norr')] });
    expect(o).toHaveLength(1);
    expect(o[0].instruktioner.map((x) => x.kalla)).toEqual(['egen']);
  });
  it('Vidas text kommer först, sedan våra kommentarer äldst först, var och en med författare och tid', () => {
    const o = samla({ vida: [hansyn('7', 'Spara aspar')], kommentarer: [kk('b', 'hansyn:7', 'Andra'), kk('a', 'hansyn:7', 'Första')] });
    expect(o[0].instruktioner.map((x) => x.kalla)).toEqual(['vida', 'egen', 'egen']);
    expect(o[0].instruktioner[1].forfattare).toMatch(/^Martin · /);
  });
  it('en egen markering med äldre kommentarfält blir "aldre" utan författare', () => {
    const o = samla({ markers: [{ id: 5, isMarker: true, type: 'landing', x: 15, y: 56, comment: 'Gammal text' }] });
    expect(o[0].instruktioner[0]).toMatchObject({ kalla: 'aldre', ref: 'aldre:marker:5', forfattare: null });
  });
  it('en markering utan någon kommentar ger inget område', () => {
    expect(samla({ markers: [{ id: 5, isMarker: true, type: 'landing', x: 15, y: 56 }] })).toEqual([]);
  });
  it('en egen yta med kommentar räknas som yta, inne eller ute efter positionen', () => {
    const yta = { id: 9, isZone: true, zoneType: 'wet', path: [{ x: 14.999, y: 55.999 }, { x: 15.001, y: 55.999 }, { x: 15.001, y: 56.001 }, { x: 14.999, y: 56.001 }] };
    const k = [kk('z', 'marker:9', 'Risa här')];
    expect(samla({ markers: [yta], kommentarer: k, pos: { lat: 56, lon: 15 } })[0].narvaro).toEqual({ slag: 'yta', inne: true });
    expect(samla({ markers: [yta], kommentarer: k, pos: { lat: 56.5, lon: 15 } })[0].narvaro).toEqual({ slag: 'yta', inne: false });
  });
  it('utan position finns området men maskinen är inte "inne"', () => {
    const o = samla({ vida: [hansyn('7', 'x')], pos: null });
    expect(o[0].narvaro).toEqual({ slag: 'yta', inne: false });
  });
  it('en tom kommentar eller bara blanksteg ger ingen instruktion', () => {
    expect(samla({ vida: [hansyn('7', '   ')], kommentarer: [kk('a', 'hansyn:7', '  ')] })).toEqual([]);
  });
});

describe('sett — per kommentar, ändrad text är osedd igen', () => {
  const o = samla({ vida: [hansyn('7', 'Spara aspar')], kommentarer: [kk('k1', 'hansyn:7', 'Stolpe lutar')] })[0];
  it('osedd tills ref + hash finns', () => {
    expect(o.instruktioner.every((x) => arOsedd(x, INGET))).toBe(true);
    const sett: SettKarta = new Map(o.instruktioner.map((x) => [x.ref, x.hash]));
    expect(o.instruktioner.some((x) => arOsedd(x, sett))).toBe(false);
  });
  it('en sedd kommentar är sedd men en annan i samma område är osedd', () => {
    const sett: SettKarta = new Map([['vida:hansyn:7', hashText('Spara aspar')]]);
    expect(o.instruktioner.map((x) => arOsedd(x, sett))).toEqual([false, true]);
  });
  it('ändras texten efter Sett räknas kommentaren som osedd', () => {
    const sett: SettKarta = new Map([['k1', hashText('Stolpe lutar')]]);
    const andrad = samla({ kommentarer: [kk('k1', 'hansyn:7', 'Stolpe lutar och är farlig')], vida: [hansyn('7', '')] })[0];
    expect(arOsedd(andrad.instruktioner[0], sett)).toBe(true);
  });
  it('Vidas text som ändras vid omimport är osedd igen', () => {
    const sett: SettKarta = new Map([['vida:hansyn:7', hashText('Spara aspar')]]);
    const ny = samla({ vida: [hansyn('7', 'Spara aspar och björk')] })[0];
    expect(arOsedd(ny.instruktioner[0], sett)).toBe(true);
  });
});

describe('stegaInstruktion — inkörning', () => {
  const ute = { lat: 56.01, lon: 15 };
  const inne = { lat: 56, lon: 15 };
  const bygg = (pos: { lat: number; lon: number }, extra: any[] = []) => samla({ vida: [hansyn('7', 'Spara aspar'), ...extra], pos });

  it('ute ger ingen kö; inkörning lägger området i kön', () => {
    let s = stegaInstruktion(TOMT_INSTRUKTION, bygg(ute), INGET);
    expect(s.vantande).toEqual([]);
    s = stegaInstruktion(s, bygg(inne), INGET);
    expect(s.vantande).toEqual(['hansyn:7']);
  });
  it('står maskinen redan i området vid första utvärderingen räknas det som inkörning', () => {
    expect(stegaInstruktion(TOMT_INSTRUKTION, bygg(inne), INGET).vantande).toEqual(['hansyn:7']);
  });
  it('kortet står kvar tills Sett — även när man kört ut ur området', () => {
    let s = stegaInstruktion(TOMT_INSTRUKTION, bygg(inne), INGET);
    s = stegaInstruktion(s, bygg(ute), INGET);
    expect(s.vantande).toEqual(['hansyn:7']);
    expect(kortAttVisa(s, bygg(ute), INGET, false)?.nyckel).toBe('hansyn:7');
  });
  it('kortet står kvar också efter flera steg utanför området (inte bara det första)', () => {
    let s = stegaInstruktion(TOMT_INSTRUKTION, bygg(inne), INGET);
    s = stegaInstruktion(s, bygg(ute), INGET);
    s = stegaInstruktion(s, bygg(ute), INGET);
    s = stegaInstruktion(s, bygg(ute), INGET);
    expect(s.vantande).toEqual(['hansyn:7']);
    expect(kortAttVisa(s, bygg(ute), INGET, false)?.nyckel).toBe('hansyn:7');
  });
  it('en sedd instruktion ger inget kort vid inkörning', () => {
    const omr = bygg(inne);
    const sett: SettKarta = new Map(omr[0].instruktioner.map((x) => [x.ref, x.hash]));
    const s = stegaInstruktion(TOMT_INSTRUKTION, omr, sett);
    expect(s.vantande).toEqual([]);
    expect(kortAttVisa(s, omr, sett, false)).toBeNull();
  });
  it('lästes den på annat håll (genomgången, kartkortet) medan den väntade försvinner kortet', () => {
    const omr = bygg(inne);
    const s = stegaInstruktion(TOMT_INSTRUKTION, omr, INGET);
    const sett: SettKarta = new Map(omr[0].instruktioner.map((x) => [x.ref, x.hash]));
    const s2 = stegaInstruktion(s, omr, sett);
    expect(s2.vantande).toEqual([]);
    expect(kortAttVisa(s2, omr, sett, false)).toBeNull();
  });
  it('kortet visar bara det som inte setts', () => {
    const omr = samla({ vida: [hansyn('7', 'Spara aspar')], kommentarer: [kk('k1', 'hansyn:7', 'Ny kommentar')], pos: inne });
    const sett: SettKarta = new Map([['vida:hansyn:7', hashText('Spara aspar')]]);
    const s = stegaInstruktion(TOMT_INSTRUKTION, omr, sett);
    expect(kortAttVisa(s, omr, sett, false)?.instruktioner.map((x) => x.ref)).toEqual(['k1']);
  });
  it('larm går först: medan ett larmkort visas finns inget instruktionskort — det väntar och kommer sedan', () => {
    const omr = bygg(inne);
    const s = stegaInstruktion(TOMT_INSTRUKTION, omr, INGET);
    expect(kortAttVisa(s, omr, INGET, true)).toBeNull();
    expect(kortAttVisa(s, omr, INGET, false)?.nyckel).toBe('hansyn:7');
  });
  it('två områden: det första väntar överst, det andra räknas i "fler"', () => {
    const omr = samla({ vida: [hansyn('7', 'A'), hansyn('8', 'B', 15.01, 56)], pos: inne });
    let s = stegaInstruktion(TOMT_INSTRUKTION, omr, INGET);
    s = stegaInstruktion(s, samla({ vida: [hansyn('7', 'A'), hansyn('8', 'B', 15.01, 56)], pos: { lat: 56, lon: 15.01 } }), INGET);
    const k = kortAttVisa(s, omr, INGET, false)!;
    expect(k.nyckel).toBe('hansyn:7');
    expect(k.fler).toBe(1);
  });
  it('flimmer vid kanten ger inte ett nytt kort efter Sett', () => {
    const omr = bygg(inne);
    const sett: SettKarta = new Map(omr[0].instruktioner.map((x) => [x.ref, x.hash]));
    let s = stegaInstruktion(TOMT_INSTRUKTION, omr, INGET);
    s = stegaInstruktion(s, omr, sett);
    s = stegaInstruktion(s, bygg(ute), sett);
    s = stegaInstruktion(s, bygg(inne), sett);
    expect(s.vantande).toEqual([]);
  });
});

describe('avlägg — närhet med hysteres', () => {
  const avl = (pos: { lat: number; lon: number }) => samla({ vida: [avlagg('01-1', 'skbv betet', 15, 56)], kommentarer: [kk('a', 'punkt:01-1', 'Lägg virket här')], pos });
  const nord = (m: number) => ({ lat: 56 + m / 111320, lon: 15 });
  it('inom INNE_M är inne, utanför inte', () => {
    expect(stegaInstruktion(TOMT_INSTRUKTION, avl(nord(INNE_M - 2)), INGET).vantande).toEqual(['punkt:01-1']);
    expect(stegaInstruktion(TOMT_INSTRUKTION, avl(nord(INNE_M + 5)), INGET).vantande).toEqual([]);
  });
  it('kvar inne i marginalen efter inkörning, ute därefter', () => {
    let s = stegaInstruktion(TOMT_INSTRUKTION, avl(nord(INNE_M - 2)), INGET);
    s = stegaInstruktion(s, avl(nord(INNE_M + UT_MARGINAL_M - 2)), INGET);
    expect(s.inne['punkt:01-1']).toBe(true);
    s = stegaInstruktion(s, avl(nord(INNE_M + UT_MARGINAL_M + 5)), INGET);
    expect(s.inne['punkt:01-1']).toBeUndefined();
  });
  it('okänt avstånd (ingen position) är aldrig inne', () => {
    expect(stegaInstruktion(TOMT_INSTRUKTION, samla({ vida: [avlagg('01-1', 'x', 15, 56)], kommentarer: [kk('a', 'punkt:01-1', 'x')], pos: null }), INGET).vantande).toEqual([]);
  });
});

describe('genomgången — instruktioner på trakten', () => {
  const omr: InstruktionOmrade[] = samla({
    vida: [hansyn('7', 'Spara aspar'), hansyn('8', 'Lämna ris', 15.01, 56)],
    kommentarer: [kk('k1', 'hansyn:8', 'Blött'), kk('k2', 'hansyn:8', 'Stolpe')],
  });
  it('räknar alla instruktioner och de nya', () => {
    const r = instruktionerPaTrakten(omr, INGET);
    expect(r.antal).toBe(4);
    expect(r.nya).toBe(4);
  });
  it('områdena med osedda ligger överst, sedda markeras', () => {
    const sett: SettKarta = new Map(omr[0].instruktioner.map((x) => [x.ref, x.hash]));
    const r = instruktionerPaTrakten(omr, sett);
    expect(r.omraden.map((o) => o.nyckel)).toEqual(['hansyn:8', 'hansyn:7']);
    expect(r.omraden[1].instruktioner.every((x) => x.sedd)).toBe(true);
    expect(r.nya).toBe(3);
  });
  it('attKvittera ger bara det osedda i de valda områdena', () => {
    const sett: SettKarta = new Map([['k1', hashText('Blött')]]);
    expect(attKvittera(omr, ['hansyn:8'], sett).map((x) => x.i.ref)).toEqual(['vida:hansyn:8', 'k2']);
    expect(attKvittera(omr, [], sett)).toEqual([]);
  });
});

describe('bara platser man kör in i — inga punktsymboler eller linjer', () => {
  const kommentar = (nyckel: string) => [kk('p1', nyckel, 'Kommentar')];
  it('Evighetsträd, Högstubbe och Varning (punktsymboler) ger inget kort, med eller utan kommentar', () => {
    for (const type of ['eternitytree', 'highstump', 'warning', 'culturemonument', 'gate']) {
      const m = { id: 5, isMarker: true, type, x: 15, y: 56, comment: 'Äldre text' };
      expect(samla({ markers: [m], kommentarer: kommentar('marker:5') }), type).toEqual([]);
    }
  });
  it('en egen avläggssymbol är en plats: med kommentar blir den ett område', () => {
    const o = samla({ markers: [{ id: 5, isMarker: true, type: 'landing', x: 15, y: 56 }], kommentarer: kommentar('marker:5') });
    expect(o.map((x) => x.nyckel)).toEqual(['marker:5']);
    expect(o[0].narvaro.slag).toBe('avstand');
  });
  it('egna linjer (stenmur, el-ledning, basväg) ger inget kort', () => {
    const l = { id: 6, isLine: true, lineType: 'stonewall', path: [{ x: 15, y: 56 }, { x: 15.001, y: 56 }] };
    expect(samla({ markers: [l], kommentarer: kommentar('marker:6') })).toEqual([]);
  });
  it('Vidas kraftledning (linje) och RAÄ-punkt ger inget kort även med vår kommentar', () => {
    const led = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[15, 56], [15.001, 56]] }, properties: { _lager: 'L_TILLAGGSLINJER', _typ: 'linje', FLBESKR: 'Kraftledning' } };
    const raa = { type: 'Feature', geometry: { type: 'Point', coordinates: [15, 56] }, properties: { _lager: 'L_RAA_POINT_101', lamningsnu: '123', lamningsty: 'Röse' } };
    expect(samla({ vida: [led, raa], kommentarer: [kk('a', 'raa:123', 'x')] })).toEqual([]);
  });
  it('Vidas avlägg, hänsynsytor, traktdelar, nyckelbiotoper och RAÄ-ytor är platser', () => {
    const nb = { type: 'Feature', geometry: kvadrat(15, 56), properties: { _lager: 'SV_SKS_NYCKELBIOTOP_101', Beteckn: 'NB1', Objnamn: 'Nyckelbiotop' } };
    const o = samla({ vida: [hansyn('7', 'Spara'), avlagg('01-1', 'Lägg här', 15, 56), traktdel('2'), nb], kommentarer: [kk('a', 'traktdel:2', 'x'), kk('b', 'nb:NB1', 'y'), kk('c', 'punkt:01-1', 'z')] });
    expect(o.map((x) => x.nyckel).sort()).toEqual(['hansyn:7', 'nb:NB1', 'punkt:01-1', 'traktdel:2']);
  });
  it('arPlats: polygoner alltid, punkter bara om det är ett avlägg', () => {
    expect(arPlats('Polygon', false)).toBe(true);
    expect(arPlats('MultiPolygon', false)).toBe(true);
    expect(arPlats('Point', true)).toBe(true);
    expect(arPlats('Point', false)).toBe(false);
    expect(arPlats('LineString', true)).toBe(false);
    expect(arPlats(undefined, true)).toBe(false);
  });
  it('ett kommentarsrikt objekt med 40 evighetsträd ger ett enda kort-område (hänsynsytan), inte 41', () => {
    const traden = Array.from({ length: 40 }, (_, n) => ({ id: 100 + n, isMarker: true, type: 'eternitytree', x: 15, y: 56, comment: `Träd ${n}` }));
    const o = samla({ vida: [hansyn('7', 'Spara aspar')], markers: traden });
    expect(o).toHaveLength(1);
    expect(stegaInstruktion(TOMT_INSTRUKTION, o, INGET).vantande).toEqual(['hansyn:7']);
  });
});

describe('arInstruktionsText — bara om Vidas text säger något', () => {
  it('tom, blanksteg och null är ingen instruktion', () => {
    for (const t of ['', '   ', null, undefined, '\r\n']) expect(arInstruktionsText(t as any), String(t)).toBe(false);
  });
  it('bara ett typnamn är ingen instruktion ("hänsynsyta", "Övrigt", "Hänsyn.")', () => {
    for (const t of ['hänsynsyta', 'Hänsynsyta', ' hänsynsyta. ', 'Övrigt', 'övrigt', 'Hänsyn', 'yta', 'Tilläggsyta']) expect(arInstruktionsText(t), t).toBe(false);
  });
  it('en text som bara upprepar ytans eget namn är ingen instruktion', () => {
    expect(arInstruktionsText('Sumpskog O', ['Sumpskog O'])).toBe(false);
    expect(arInstruktionsText('sumpskog o.', ['Sumpskog O'])).toBe(false);
    expect(arInstruktionsText('Sumpskog O', ['Annat namn'])).toBe(true);
  });
  it('riktiga instruktioner räknas — Vidas egna ord ur Hålabäck au 2025', () => {
    for (const t of [
      'kantzon lämnas på ca 10-15 m där endast gran avverkas.  Ingen underröjning o ingen körning i kantzonen.',
      'Torr stenig mark som lämnas orörd',
      'avverkning av frötallar.\r\nLämn kantzon mot sjön. Lämna enstaka utspridda tallar.',
      'avverkning av frötallar. spara utspridda tallar, minst 10 per ha. Husruin enligt karta o nordöstra delen.',
    ]) expect(arInstruktionsText(t, ['Övrigt']), t).toBe(true);
  });
  it('en instruktion som innehåller ett typnamn som ord räknas ("lämnas som hänsynsyta, ingen körning")', () => {
    expect(arInstruktionsText('lämnas som hänsynsyta, ingen körning')).toBe(true);
  });
});

describe('Hålabäck au 2025 — Vidas fem tilläggsytor och avläggen (properties ur objekt_geometri)', () => {
  const yta = (lopnr: number, typ: string, flbeskr: string, atgard: string | null, lat: number, lon: number) => ({
    type: 'Feature', geometry: kvadrat(lon, lat), properties: { TYP: typ, _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR', LOPNR: lopnr, FLBESKR: flbeskr, ATGARD: atgard },
  });
  const features = [
    yta(1, '24', 'Kant mot vatten O', 'kantzon lämnas på ca 10-15 m där endast gran avverkas.  Ingen underröjning o ingen körning i kantzonen.', 56.3535, 15.0493),
    yta(2, '8', 'Sumpskog O', 'hänsynsyta', 56.3537, 15.0512),
    yta(3, '5', 'Blockmark / bergbrant O', 'Torr stenig mark som lämnas orörd', 56.3526, 15.0518),
    yta(4, '71', 'Övrigt', 'avverkning av frötallar.\r\nLämn kantzon mot sjön. Lämna enstaka utspridda tallar.', 56.3563, 15.0488),
    yta(5, '71', 'Övrigt', 'avverkning av frötallar. spara utspridda tallar, minst 10 per ha. Husruin enligt karta o nordöstra delen.', 56.3541, 15.0642),
    avlagg('01-1', 'skbv s skärsjön', 15.0521, 56.3522),
    traktdel('5431'),
  ];
  const o = samla({ vida: features, pos: null });
  it('fyra av de fem ytorna ger en instruktion; Sumpskog O ("hänsynsyta") och avläggen och traktdelen ger ingen', () => {
    expect(o.map((x) => x.nyckel).sort()).toEqual(['hansyn:1', 'hansyn:3', 'hansyn:4', 'hansyn:5']);
  });
  it('TYP 71 ("Övrigt", TRDEL_ID 0) är en tilläggsyta i samma lager som de andra — den ger instruktion precis som de andra', () => {
    expect(o.find((x) => x.nyckel === 'hansyn:4')!.instruktioner[0]).toMatchObject({ kalla: 'vida' });
    expect(o.find((x) => x.nyckel === 'hansyn:5')!.instruktioner[0]).toMatchObject({ kalla: 'vida' });
  });
  it('typ 71 med två rader blir två numrerade punkter', () => {
    expect(kommentarPunkter(o.find((x) => x.nyckel === 'hansyn:4')!.instruktioner[0].text)).toEqual(['avverkning av frötallar.', 'Lämn kantzon mot sjön. Lämna enstaka utspridda tallar.']);
  });
  it('en yta vars ATGARD bara upprepar dess eget namn (FLBESKR) ger ingen instruktion', () => {
    const upprepning = samla({ vida: [yta(6, '8', 'Sumpskog O', 'sumpskog o.', 56.35, 15.05)], pos: null });
    expect(upprepning).toEqual([]);
  });
  it('de fyra ytorna är inga avlägg', () => { expect(o.every((x) => !x.avlagg)).toBe(true); });
});

describe('Vidas traktdirektiv är instruktion nr 1', () => {
  const DIR = 'Obs tjärdal enligt karta. Lämna ca 50-70 tallar per ha . Lämna fina ekar och några bokar.';
  const medDirektiv = (extra: Parameters<typeof samla>[0] = {}) => samlaOmraden({
    objektId: OBJ, vida: { features: extra.vida ?? [] }, markers: [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'Symbol', kommentarer: extra.kommentarer ?? [],
    pos: extra.pos === undefined ? { lat: 56, lon: 15 } : extra.pos, direktiv: DIR, nu: new Date('2026-10-21T08:00:00Z'),
  });
  it('är första området, före ytorna, och är märkt som hela trakten', () => {
    const o = medDirektiv({ vida: [hansyn('7', 'Spara aspar')] });
    expect(o.map((x) => x.nyckel)).toEqual(['direktiv', 'hansyn:7']);
    expect(o[0]).toMatchObject({ objektniva: true, namn: 'Traktdirektiv' });
    expect(o[0].instruktioner[0]).toMatchObject({ ref: 'vida:direktiv', kalla: 'vida', text: DIR, meningar: true, forfattare: null });
  });
  it('ytornas Vida-text delas INTE vid meningsslut (bara direktivet)', () => {
    const o = medDirektiv({ vida: [hansyn('7', 'Spara aspar')] });
    expect(o[1].instruktioner[0].meningar).toBeUndefined();
  });
  it('ger aldrig ett kort vid inkörning — oavsett var maskinen står', () => {
    const o = medDirektiv();
    const s = stegaInstruktion(TOMT_INSTRUKTION, o, INGET);
    expect(s.vantande).toEqual([]);
    expect(kortAttVisa(s, o, INGET, false)).toBeNull();
  });
  it('även ett objektnivå-område som står "inne" köar aldrig ett kort (ingen inkörning för hela trakten)', () => {
    const o = medDirektiv().map((x) => ({ ...x, narvaro: { slag: 'yta' as const, inne: true } }));
    const s = stegaInstruktion(TOMT_INSTRUKTION, o, INGET);
    expect(s.vantande).toEqual([]);
    expect(kortAttVisa(s, o, INGET, false)).toBeNull();
  });
  it('ingår i "Instruktioner på trakten": räknas och ligger FÖRST, också när det är sett och en yta har osedda', () => {
    const o = medDirektiv({ vida: [hansyn('7', 'Spara aspar')] });
    const sett: SettKarta = new Map([['vida:direktiv', hashText(DIR)]]);
    const l = instruktionerPaTrakten(o, sett);
    expect(l.antal).toBe(2);
    expect(l.nya).toBe(1);
    expect(l.omraden.map((x) => x.nyckel)).toEqual(['direktiv', 'hansyn:7']);
    expect(instruktionerPaTrakten(o, INGET).omraden[0].nyckel).toBe('direktiv');
  });
  it('Sett räknas likadant: refen + hash av texten — en ändrad text är osedd igen', () => {
    const o = medDirektiv();
    const sett: SettKarta = new Map([['vida:direktiv', hashText(DIR)]]);
    expect(arOsedd(o[0].instruktioner[0], sett)).toBe(false);
    const andrad = samlaOmraden({ objektId: OBJ, vida: { features: [] }, markers: [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'S', kommentarer: [], pos: null, direktiv: DIR + ' Ny rad.' });
    expect(arOsedd(andrad[0].instruktioner[0], sett)).toBe(true);
  });
  it('attKvittera ger direktivet när "direktiv" är valt', () => {
    const o = medDirektiv({ vida: [hansyn('7', 'Spara aspar')] });
    expect(attKvittera(o, ['direktiv'], INGET).map((x) => x.i.ref)).toEqual(['vida:direktiv']);
  });
  it('tomt eller bara blanksteg ger inget direktiv-område', () => {
    for (const d of ['', '   ', null, undefined]) {
      expect(samlaOmraden({ objektId: OBJ, vida: { features: [] }, markers: [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'S', kommentarer: [], pos: null, direktiv: d as any })).toEqual([]);
    }
  });
});
