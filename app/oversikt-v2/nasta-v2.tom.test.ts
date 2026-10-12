import { describe, it, expect } from 'vitest';
import { beraknaForslag, tomtForslag, type MaskinRad } from './nasta-v2';
import type { OversiktObjekt } from '../oversikt/oversikt-types';

const idag = new Date().toISOString().slice(0, 10);
const obj = (id: string, over: Partial<OversiktObjekt> = {}): OversiktObjekt =>
  ({ id, namn: `Objekt ${id}`, typ: 'gallring', status: 'planerad', lat: 56.5, lng: 14.7, bolag: 'B', vo_nummer: `VO-${id}`, ...over }) as OversiktObjekt;
const wisent: MaskinRad = { maskin_id: 'A030353', maskin_typ: 'Forwarder', skotar_roll: 'allt' };
const jd810e: MaskinRad = { maskin_id: 'JD810E', maskin_typ: 'Forwarder', skotar_roll: 'gallring' };
const giant: MaskinRad = { maskin_id: 'PONS20SDJAA270231', maskin_typ: 'Harvester' };

describe('tomtForslag — en aktiv maskin utan position och kö ska gå att öppna', () => {
  it('tomt: ingen kö, ingen position, ingen plats — och rätt roll', () => {
    expect(tomtForslag(jd810e)).toMatchObject({ maskinId: 'JD810E', typ: 'skotare', koordinat: null, positionAlder: null, nuObjekt: null, ko: [], manuellKo: false });
    expect(tomtForslag(giant)).toMatchObject({ maskinId: 'PONS20SDJAA270231', typ: 'skordare', ko: [] });
  });
  it('rollen läses som i beräkningen (maskin_typ eller typ)', () => {
    expect(tomtForslag({ maskin_id: 'X', typ: 'skotare' }).typ).toBe('skotare');
    expect(tomtForslag({ maskin_id: 'Y', maskin_typ: 'Harvester' }).typ).toBe('skordare');
  });

  // Varför sidan lägger till den EFTER beräkningen och inte skickar in den: en skotare i beräkningen tävlar om objekten
  // (deconflict) och flyttar därmed andra skotares förslag, även om den själv saknar position och kö.
  it('skickas en tom skotare in i beräkningen flyttar den Wisents förslag — därför görs det inte', () => {
    const objekt = [obj('a'), obj('b')];
    const skord = { 'VO-a': { skordat: 500, skotat: null, egenSkotning: false, sista: idag }, 'VO-b': { skordat: 100, skotat: null, egenSkotning: false, sista: idag } } as any;
    const kor = (maskiner: MaskinRad[]) => beraknaForslag({ maskiner, objekt, maskinKo: [], skord, positions: new Map(), avstandKm: () => null });
    const forsta = (m: Map<string, any>, id: string) => m.get(id)?.ko[0]?.objekt.id;
    expect(forsta(kor([wisent]), 'A030353')).toBe('a');           // utan 810E: Wisent får det stora objektet
    expect(forsta(kor([wisent, jd810e]), 'A030353')).toBe('b');   // med 810E i beräkningen: specialisten tar 'a' och Wisent får 'b'
    expect(kor([wisent]).has('JD810E')).toBe(false);              // och utan att den skickas in finns den inte i resultatet alls
  });
});
