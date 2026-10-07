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
