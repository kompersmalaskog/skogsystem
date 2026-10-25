import { describe, it, expect } from 'vitest';
import { arGodkand, kmAndrad, kmAndringsText, kundNotis, sorteraUnderlag, strackaNotis, summeraFakturerbart, underlagStatus, type FaktureratRad, type UnderlagRad } from './fakturerbart';

// De åtta riktiga raderna i fakturaunderlag_flytt (prod 2026-10-15, efter backfill-godkännandet):
// alla status 'aktiv', ingen fakturerad, alla godkända med skapad_tid.
const GODKAND = '2026-09-17T13:27:49Z';
const rad = (km: number | null, o: Partial<FaktureratRad> = {}): FaktureratRad => ({ km, status: 'aktiv', fakturerad_tid: null, godkand_tid: GODKAND, ...o });
const REAL: FaktureratRad[] = [34, 40, 31, 47, 49, 44, 36, 53].map(km => rad(km));

describe('summeraFakturerbart', () => {
  it('de åtta riktiga flyttarna: 334 km, alla hos faktureringen', () => {
    expect(summeraFakturerbart(REAL)).toEqual({ km: 334, antal: 8, hos: 8, fakturerad: 0, struken: 0, utanKm: 0, vantar: 0 });
  });

  it('oktober (36 + 53) = 89 km', () => {
    expect(summeraFakturerbart(REAL.slice(6)).km).toBe(89);
  });

  it('en struken flytt är inte fakturerbar: ingen km, inget antal, men den räknas som struken', () => {
    const r = summeraFakturerbart([...REAL, rad(100, { status: 'struken' })]);
    expect(r.km).toBe(334);
    expect(r.antal).toBe(8);
    expect(r.struken).toBe(1);
  });

  it('fakturerad räknas separat från hos faktureringen', () => {
    const r = summeraFakturerbart([
      rad(50, { fakturerad_tid: '2026-10-09T08:00:00Z' }),
      rad(40),
    ]);
    expect(r).toMatchObject({ antal: 2, hos: 1, fakturerad: 1, km: 90 });
  });

  it('summan är summan av avrundade delar, inte råsumman avrundad', () => {
    // 10,4 + 10,4 + 10,4 = 31,2 → 31 (rå). Avrundade delar: 10 + 10 + 10 = 30, och det är det som visas.
    const rader = [10.4, 10.4, 10.4].map(km => rad(km));
    expect(summeraFakturerbart(rader).km).toBe(30);
  });

  it('en flytt utan km räknas i antal men adderar ingen km (och syns som utanKm)', () => {
    const r = summeraFakturerbart([rad(null), rad(31)]);
    expect(r).toMatchObject({ km: 31, antal: 2, utanKm: 1 });
  });

  it('inga rader → nollor (det är lästa utan fel; ett läsfel hanteras av hooken, aldrig här)', () => {
    expect(summeraFakturerbart([])).toEqual({ km: 0, antal: 0, hos: 0, fakturerad: 0, struken: 0, utanKm: 0, vantar: 0 });
  });
});

describe('godkännandet (migration 20261015151948)', () => {
  it('en OGODKÄND flytt ingår inte i pengatalet — den väntar', () => {
    const r = summeraFakturerbart([...REAL, rad(60, { godkand_tid: null })]);
    expect(r).toMatchObject({ km: 334, antal: 8, hos: 8, vantar: 1 });
  });

  it('en ogodkänd flytt utan km räknas inte heller som "utan km"', () => {
    expect(summeraFakturerbart([rad(null, { godkand_tid: null })])).toMatchObject({ antal: 0, utanKm: 0, vantar: 1, km: 0 });
  });

  it('en struken flytt som aldrig godkänts är struken, inte väntande', () => {
    expect(summeraFakturerbart([rad(60, { godkand_tid: null, status: 'struken' })])).toMatchObject({ struken: 1, vantar: 0, antal: 0 });
  });

  it('en redan fakturerad flytt räknas som godkänd även om godkand_tid saknas', () => {
    expect(arGodkand({ godkand_tid: null, fakturerad_tid: '2026-10-09T08:00:00Z' })).toBe(true);
    expect(arGodkand({ godkand_tid: null, fakturerad_tid: null })).toBe(false);
    expect(arGodkand({ godkand_tid: GODKAND, fakturerad_tid: null })).toBe(true);
  });

  it('underlagStatus: struken > fakturerad > godkänd (hos) > att godkänna', () => {
    const u = (o: Partial<FaktureratRad>) => underlagStatus(rad(10, o));
    expect(u({ status: 'struken', godkand_tid: null })).toBe('struken');
    expect(u({ fakturerad_tid: '2026-10-09T08:00:00Z' })).toBe('fakturerad');
    expect(u({})).toBe('hos');
    expect(u({ godkand_tid: null })).toBe('att_godkanna');
  });

  it('sorteringen: att godkänna överst (ÄLDSTA först), sedan hos, fakturerade, strukna (nyast först)', () => {
    const u = (id: string, datum: string, o: Partial<FaktureratRad> = {}): UnderlagRad => ({
      ...rad(10, o), id, flytt_id: null, kund: null, datum, maskin: 'M', fran_objekt_id: null, fran_plats_id: null, till_objekt_id: null, till_plats_id: null,
      struken_tid: null, struken_anledning: null, godkand_av: null, km_original: null, kund_original: null, redigerad_tid: null, redigerad_av: null,
    });
    const sorterat = sorteraUnderlag([
      u('hos-ny', '2026-10-06'), u('stryk', '2026-10-07', { status: 'struken' }), u('vantar-ny', '2026-10-05', { godkand_tid: null }),
      u('fakt', '2026-10-02', { fakturerad_tid: '2026-10-09T08:00:00Z' }), u('vantar-gammal', '2026-09-20', { godkand_tid: null }), u('hos-gammal', '2026-09-01'),
    ]);
    expect(sorterat.map(r => r.id)).toEqual(['vantar-gammal', 'vantar-ny', 'hos-ny', 'hos-gammal', 'fakt', 'stryk']);
  });
});


describe('redigerade värden: märkningen följer av att värdet skiljer sig från originalet', () => {
  const r = (o: Record<string, unknown>) => ({ km: 42, km_original: 47, kund: null, kund_original: null, redigerad_tid: '2026-10-15T10:00:00Z', ...o }) as any;

  it('aldrig redigerad (redigerad_tid NULL) märks aldrig — även om originalet är NULL', () => {
    expect(kmAndringsText(r({ redigerad_tid: null, km_original: null }))).toBeNull();
    expect(kundNotis(r({ redigerad_tid: null, kund: 'Vida', kund_original: null }), () => 'tor 15 okt')).toBeNull();
  });

  it('km: ändrad från, ifylld (saknades), borttagen — och ingenting när värdet är tillbaka vid originalet', () => {
    expect(kmAndringsText(r({}))).toBe('ändrad från 47');
    expect(kmAndringsText(r({ km_original: 46.6, km: 47.2 }))).toBe('ändrad från 46,6');
    expect(kmAndringsText(r({ km_original: null }))).toBe('ifylld, saknades i datan');
    expect(kmAndringsText(r({ km: null }))).toBe('borttagen, var 47');
    expect(kmAndringsText(r({ km: 47 }))).toBeNull();
    expect(kmAndrad(r({ km: 47 }))).toBe(false);
  });

  it('kund: tillagd när den saknades, ändrad från, borttagen; blanksteg och tomt är samma sak som saknas', () => {
    expect(kundNotis(r({ kund: 'Vida', kund_original: null, redigerad_av: 'Martin' }), () => 'tor 15 okt')).toBe('Tillagd av Martin tor 15 okt');
    expect(kundNotis(r({ kund: 'Vida', kund_original: 'Skog AB' }), () => 'tor 15 okt')).toBe('Ändrad från Skog AB');
    expect(kundNotis(r({ kund: null, kund_original: 'Skog AB' }), () => 'tor 15 okt')).toBe('Borttagen — var Skog AB');
    expect(kundNotis(r({ kund: ' Vida ', kund_original: 'Vida' }), () => 'tor 15 okt')).toBeNull();
    expect(kundNotis(r({ kund: '', kund_original: null }), () => 'tor 15 okt')).toBeNull();
  });
});

describe('strackaNotis — det mätta står bara när det skiljer sig från det fakturerade', () => {
  it('samma tal: bara fakturerat ("53 km"), inte "· mätt 53"', () => {
    expect(strackaNotis(53, 53)).toBe('53 km');
    expect(strackaNotis(46.6, 46.6)).toBe('46,6 km');
  });
  it('rättat km: fakturerat och mätt', () => {
    expect(strackaNotis(48, 53)).toBe('48 km · mätt 53');
  });
  it('saknas ett av dem är det en skillnad och det står; saknas båda står bara att km saknas', () => {
    expect(strackaNotis(44, null)).toBe('44 km · mätt saknas i datan');
    expect(strackaNotis(null, 53)).toBe('km saknas i datan · mätt 53');
    expect(strackaNotis(null, null)).toBe('km saknas i datan');
  });
});

describe('Var kommer flyttens km ifrån? (mätare eller räknad väg)', () => {
  it('mätaren mellan lastad och lossad, en decimal; saknad eller orimlig mätning är null', async () => {
    const { matarKm } = await import('./fakturerbart');
    expect(matarKm(299_480_800, 299_516_200)).toBe(35.4);
    expect(matarKm(null, 299_516_200)).toBeNull();
    expect(matarKm(299_516_200, 299_516_200)).toBeNull();          // stod still: ingen flytt att mäta
    expect(matarKm(1_000, 300_000)).toBeNull();                     // 299 km: orimligt för en flytt
  });

  it('säger ingenting när km ÄR mätarens; annars att den är räknad och vad mätaren säger (Giant 10 aug: 5 mot 11,0)', async () => {
    const { kmKallaText } = await import('./fakturerbart');
    expect(kmKallaText(35.4, 299_480_800, 299_516_200)).toBeNull();
    expect(kmKallaText(5, 300_000_000, 300_011_000)).toBe('Räknad väg — bilens mätare säger 11 km');
    expect(kmKallaText(53, null, null)).toBe('Räknad väg — bilens mätare saknas');
    expect(kmKallaText(null, null, null)).toBeNull();
  });
});
