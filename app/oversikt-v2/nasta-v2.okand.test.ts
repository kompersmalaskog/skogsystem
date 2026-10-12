import { describe, it, expect } from 'vitest';
import { markeraOkanda, tomtForslag, type MaskinForslag, type MaskinRad, type KoPost } from './nasta-v2';
import type { OversiktObjekt } from '../oversikt/oversikt-types';

const obj = (id: string): OversiktObjekt => ({ id, namn: `Objekt ${id}`, typ: 'gallring', status: 'planerad', lat: 56.5, lng: 14.7 }) as OversiktObjekt;
const post = (id: string, kalla: 'ko' | 'forslag'): KoPost => ({ objekt: obj(id), troligt: false, kalla });
const skordare: MaskinRad = { maskin_id: 'PONS', maskin_typ: 'Harvester' };
const skotare: MaskinRad = { maskin_id: 'A030353', maskin_typ: 'Forwarder', skotar_roll: 'allt' };
const med = (m: MaskinRad, ko: KoPost[]): MaskinForslag => ({ ...tomtForslag(m), ko });
const karta = (...f: MaskinForslag[]) => new Map(f.map((x) => [x.maskinId, x] as const));

describe('markeraOkanda — ett läsfel är aldrig "inget planerat"', () => {
  it('inga läsfel → samma karta, orörd', () => {
    const k = karta(med(skordare, []), med(skotare, [post('a', 'forslag')]));
    expect(markeraOkanda(k, { ko: false, skord: false })).toBe(k);
  });

  it('köläsningen felade: en maskin utan köpost markeras okänd (ko)', () => {
    const ut = markeraOkanda(karta(med(skordare, []), med(skotare, [])), { ko: true, skord: false });
    expect(ut.get('PONS')?.okand).toBe('ko');
    expect(ut.get('A030353')?.okand).toBe('ko');
  });

  it('köläsningen felade: förslagsrader tas bort (de är räknade mot en kö vi inte vet), kö-rader står kvar', () => {
    const ut = markeraOkanda(karta(med(skotare, [post('k1', 'ko'), post('f1', 'forslag'), post('f2', 'forslag')])), { ko: true, skord: false });
    expect(ut.get('A030353')?.ko.map((p) => p.objekt.id)).toEqual(['k1']);
    expect(ut.get('A030353')?.okand).toBeUndefined(); // det finns en köpost att visa → inte okänd
  });

  it('köläsningen felade men bara förslag fanns → inget kvar, okänd', () => {
    const ut = markeraOkanda(karta(med(skotare, [post('f1', 'forslag')])), { ko: true, skord: false });
    expect(ut.get('A030353')?.ko).toEqual([]);
    expect(ut.get('A030353')?.okand).toBe('ko');
  });

  it('virkesläsningen felade: bara en SKOTARE utan kö och utan förslag markeras (skord) — skördare påverkas inte', () => {
    const ut = markeraOkanda(karta(med(skordare, []), med(skotare, [])), { ko: false, skord: true });
    expect(ut.get('PONS')?.okand).toBeUndefined();
    expect(ut.get('A030353')?.okand).toBe('skord');
  });

  it('virkesläsningen felade men skotaren har en kö eller ett förslag att visa → inte okänd', () => {
    const ut = markeraOkanda(karta(med(skotare, [post('k1', 'ko')])), { ko: false, skord: true });
    expect(ut.get('A030353')?.okand).toBeUndefined();
    expect(ut.get('A030353')?.ko).toHaveLength(1);
  });

  it('båda felade: kön vinner (det är det grundläggande), förslagsrader borta', () => {
    const ut = markeraOkanda(karta(med(skotare, [post('f1', 'forslag')])), { ko: true, skord: true });
    expect(ut.get('A030353')?.okand).toBe('ko');
  });

  it('positionsläsningen felade: förslagsrader tas bort (närheten räknades utan var maskinen står), kö-rader står kvar', () => {
    const ut = markeraOkanda(karta(med(skotare, [post('k1', 'ko'), post('f1', 'forslag'), post('f2', 'forslag')])), { ko: false, skord: false, pos: true });
    expect(ut.get('A030353')?.ko.map((p) => p.objekt.id)).toEqual(['k1']);
    expect(ut.get('A030353')?.okand).toBeUndefined(); // det finns en köpost att visa → inte okänd
  });

  it('positionsläsningen felade men bara förslag fanns → inget kvar, okänd (pos)', () => {
    const ut = markeraOkanda(karta(med(skotare, [post('f1', 'forslag')])), { ko: false, skord: false, pos: true });
    expect(ut.get('A030353')?.ko).toEqual([]);
    expect(ut.get('A030353')?.okand).toBe('pos');
  });

  it('positionsläsningen felade: en skotare utan kö och utan förslag är okänd (pos), en SKÖRDARE utan kö är fortfarande "inget planerat"', () => {
    const ut = markeraOkanda(karta(med(skordare, []), med(skotare, [])), { ko: false, skord: false, pos: true });
    expect(ut.get('PONS')?.okand).toBeUndefined(); // skördarens kö lästes — tom är tom
    expect(ut.get('A030353')?.okand).toBe('pos');
  });

  it('GROT-läsningen felade: en skotare med gömda avslutade rader tappar sina förslagsrader (en manuell kö-rad hade gått före) → okänd (grot)', () => {
    const f = { ...med(skotare, [post('f1', 'forslag'), post('f2', 'forslag')]), doldaAvslutade: 1 };
    const ut = markeraOkanda(karta(f), { ko: false, skord: false, grot: true });
    expect(ut.get('A030353')?.ko).toEqual([]);
    expect(ut.get('A030353')?.okand).toBe('grot');
  });

  it('GROT-läsningen felade: skotare med gömda rader OCH en riktig köpost behåller köposten, förslagen tas bort, inte okänd', () => {
    const f = { ...med(skotare, [post('k1', 'ko'), post('f1', 'forslag')]), doldaAvslutade: 2 };
    const ut = markeraOkanda(karta(f), { ko: false, skord: false, grot: true });
    expect(ut.get('A030353')?.ko.map((p) => p.objekt.id)).toEqual(['k1']);
    expect(ut.get('A030353')?.okand).toBeUndefined();
  });

  it('GROT-läsningen felade men inget är gömt: förslagen står kvar (det finns inget som kunde gå före)', () => {
    const ut = markeraOkanda(karta(med(skotare, [post('f1', 'forslag')])), { ko: false, skord: false, grot: true });
    expect(ut.get('A030353')?.ko.map((p) => p.objekt.id)).toEqual(['f1']);
    expect(ut.get('A030353')?.okand).toBeUndefined();
  });

  it('flera fel: ko vinner över skord, skord över pos', () => {
    const k = () => karta(med(skotare, []));
    expect(markeraOkanda(k(), { ko: true, skord: true, pos: true }).get('A030353')?.okand).toBe('ko');
    expect(markeraOkanda(k(), { ko: false, skord: true, pos: true }).get('A030353')?.okand).toBe('skord');
    expect(markeraOkanda(k(), { ko: false, skord: false, pos: true }).get('A030353')?.okand).toBe('pos');
  });

  it('GROT och andra läsningar felade: en gömd köplats väger tyngre än saknade förslag → grot (efter ko, före skord och pos)', () => {
    const f = () => karta({ ...med(skotare, [post('f1', 'forslag')]), doldaAvslutade: 1 });
    expect(markeraOkanda(f(), { ko: false, skord: true, pos: true, grot: true }).get('A030353')?.okand).toBe('grot');
    expect(markeraOkanda(f(), { ko: false, skord: true, pos: false, grot: true }).get('A030353')?.okand).toBe('grot');
    expect(markeraOkanda(f(), { ko: false, skord: false, pos: true, grot: true }).get('A030353')?.okand).toBe('grot');
    expect(markeraOkanda(f(), { ko: true, skord: true, pos: true, grot: true }).get('A030353')?.okand).toBe('ko');
  });

  it('pos/grot utelämnade eller false → beter sig som förut, samma karta', () => {
    const k = karta(med(skotare, [post('f1', 'forslag')]));
    expect(markeraOkanda(k, { ko: false, skord: false })).toBe(k);
    expect(markeraOkanda(k, { ko: false, skord: false, pos: false, grot: false })).toBe(k);
  });

  it('ändrar inte det den fick in och behåller position och nu-objekt', () => {
    const f: MaskinForslag = { ...med(skotare, [post('f1', 'forslag')]), koordinat: { lat: 56.5, lng: 14.7 }, nuObjekt: obj('nu'), positionAlder: 0 };
    const k = karta(f);
    const ut = markeraOkanda(k, { ko: true, skord: false });
    expect(k.get('A030353')?.ko).toHaveLength(1);              // originalet orört
    expect(k.get('A030353')?.okand).toBeUndefined();
    expect(ut.get('A030353')?.koordinat).toEqual({ lat: 56.5, lng: 14.7 }); // kartan KVAR: maskinen ritas där den står
    expect(ut.get('A030353')?.nuObjekt?.id).toBe('nu');
  });
});
