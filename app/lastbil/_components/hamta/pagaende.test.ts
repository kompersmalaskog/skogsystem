import { describe, expect, it } from 'vitest';
import { nyttUtkast, type Utkast } from './flode';
import { harledPagaende, oppenFlyttGaller, type OppenFlytt } from './pagaende';

const NU = Date.parse('2026-10-19T10:30:00Z');                       // 12:30 svensk tid
const NAMN: Record<string, string> = { PONS: 'Giant', A110148: 'Elefant 26' };
const namnFor = (id: string) => NAMN[id] ?? null;
const flytt = (o: Partial<OppenFlytt> = {}): OppenFlytt => ({ id: 'f-1', maskin_id: 'PONS', extern_maskin: null, starttid: '2026-10-19T10:25:00Z', hamtad_tid: '2026-10-19T09:30:00Z', ...o });
const utkast = (o: Partial<Utkast> = {}): Utkast => ({ ...nyttUtkast('2026-10-19T09:00:00Z'), maskinId: 'PONS', ...o });
const harled = (flytt: OppenFlytt | null, ut: Utkast | null) => harledPagaende({ utkast: ut, flytt, namnFor, nuMs: NU });

describe('Fortsätt hämta X — databasen styr', () => {
  it('öppen flytt + utkast som hör till den: namnet ur dim_maskin, steget ur utkastet', () => {
    const p = harled(flytt(), utkast({ steg: 'kor', flyttId: 'f-1' }));
    expect(p).toEqual({ kalla: 'db', namn: 'Giant', rad: 'Lassat 11:30 · Vart ska den?', behallUtkast: true });
    expect(harled(flytt(), utkast({ steg: 'dest', flyttId: 'f-1', dest: { namn: 'Vällust RP', lat: 1, lng: 1, objektId: 'o', platsId: null, kalla: 'objekt', verkstad: false } }))!.rad).toBe('Lassat 11:30 · På väg till Vällust RP');
    expect(harled(flytt(), utkast({ steg: 'hem', flyttId: 'f-1' }))!.rad).toBe('Lassat 11:30 · Vägen hem');
  });

  it('bara databasen (inget utkast): Lassat-tiden och nästa steg ur flytten; utkastet behålls inte', () => {
    expect(harled(flytt(), null)).toEqual({ kalla: 'db', namn: 'Giant', rad: 'Lassat 11:30 · Vart ska den?', behallUtkast: false });
  });

  it('utkastet hör till en ANNAN flytt: databasen vinner, och utkastet ska inte styra flödet', () => {
    const p = harled(flytt(), utkast({ steg: 'hem', flyttId: 'f-annan', maskinId: 'A110148' }))!;
    expect(p).toMatchObject({ kalla: 'db', namn: 'Giant', rad: 'Lassat 11:30 · Vart ska den?', behallUtkast: false });
  });

  it('extern maskin: namnet ur flytten; maskin utan namn i dim_maskin: "maskinen", aldrig maskin_id', () => {
    expect(harled(flytt({ maskin_id: null, extern_maskin: 'Skotare Anderssons' }), null)!.namn).toBe('Skotare Anderssons');
    expect(harled(flytt({ maskin_id: 'OKAND' }), null)!.namn).toBe('maskinen');
  });

  it('Lassat-tiden räknas från hamtad_tid, annars starttid', () => {
    expect(harled(flytt({ hamtad_tid: null }), null)!.rad).toBe('Lassat 12:25 · Vart ska den?');
  });
});

describe('Fortsätt hämta X — utkastet bara när ingen flytt är öppen', () => {
  it('Vart ska X? och Vägen hem räknas, med lossningen i ord', () => {
    expect(harled(null, utkast({ steg: 'dest' }))).toEqual({ kalla: 'utkast', namn: 'Giant', rad: 'Vart ska den?', behallUtkast: true });
    expect(harled(null, utkast({ steg: 'dest', lossad: { tid: '2026-10-19T10:00:00Z', namn: 'Vällust RP' } }))!.rad).toBe('Lossad på Vällust RP · Vägen hem');
    expect(harled(null, utkast({ steg: 'hem', lossad: { tid: '2026-10-19T10:00:00Z', namn: 'Vällust RP' } }))!.rad).toBe('Lossad på Vällust RP · Vägen hem');
    expect(harled(null, utkast({ steg: 'hem' }))!.rad).toBe('Vägen hem');
    expect(harled(null, utkast({ steg: 'dest', maskinId: null, extern: { namn: 'Skotare Anderssons', kund: 'Vida' } }))!.namn).toBe('Skotare Anderssons');
  });

  it('maskinvalet (val) och Hämtar X utan öppen flytt räknas inte', () => {
    expect(harled(null, utkast({ steg: 'val', maskinId: null }))).toBeNull();
    expect(harled(null, utkast({ steg: 'kor' }))).toBeNull();
    expect(harled(null, utkast({ steg: 'kor', flyttId: 'f-1' }))).toBeNull();   // flytten stängdes/avbröts: stale utkast, ingen knapp
  });

  it('varken flytt eller utkast: den vanliga knappen', () => {
    expect(harled(null, null)).toBeNull();
  });
});

describe('Fortsätt hämta X — äldre än 12 h', () => {
  it('en öppen flytt äldre än 12 h gäller inte (och öppnas aldrig automatiskt)', () => {
    const gammal = flytt({ hamtad_tid: '2026-10-18T21:00:00Z', starttid: '2026-10-18T20:50:00Z' });      // 13,5 h sedan
    expect(oppenFlyttGaller(gammal, NU)).toBe(false);
    expect(harled(gammal, null)).toBeNull();
    // ...också med ett utkast i Vart ska X? — databasens gamla flytt styr inget, utkastet avgör ensamt
    expect(harled(gammal, utkast({ steg: 'dest' }))).toMatchObject({ kalla: 'utkast' });
  });

  it('gränsen är 12 h från Lassat: precis innanför gäller, precis utanför inte', () => {
    expect(oppenFlyttGaller(flytt({ hamtad_tid: new Date(NU - 12 * 3600 * 1000).toISOString() }), NU)).toBe(true);
    expect(oppenFlyttGaller(flytt({ hamtad_tid: new Date(NU - 12 * 3600 * 1000 - 1000).toISOString() }), NU)).toBe(false);
    expect(oppenFlyttGaller(flytt({ hamtad_tid: 'inte ett datum', starttid: 'inte heller' }), NU)).toBe(false);
  });
});
