import { describe, it, expect } from 'vitest';
import { arbetsLage } from './lage';
import type { MaskinRad } from './nasta-v2';

const IDAG = '2026-10-04';
const maskiner: MaskinRad[] = [
  { maskin_id: 'A030353', maskin_typ: 'Forwarder' },
  { maskin_id: 'R64428', maskin_typ: 'Harvester' },
  { maskin_id: 'JD810E', maskin_typ: 'Forwarder', aktiv_till: null },
  { maskin_id: 'GAMMAL', maskin_typ: 'Harvester', aktiv_till: '2026-09-30' },   // avvecklad
  { maskin_id: 'SLUTAR', maskin_typ: 'Harvester', aktiv_till: IDAG },           // sista dagen räknas som aktiv
];
const lage = (over: Partial<Parameters<typeof arbetsLage>[0]> = {}) =>
  arbetsLage({ roll: 'forare', rollLaddar: false, maskinId: 'A030353', maskiner, idag: IDAG, ...over });

describe('arbetsLage — vem får göra vad', () => {
  it('admin och chef är förman (de enda med skrivknappar)', () => {
    expect(lage({ roll: 'admin', maskinId: null })).toEqual({ typ: 'forman' });
    expect(lage({ roll: 'chef', maskinId: null })).toEqual({ typ: 'forman' });
  });
  it('förare med giltig maskin: läsläge, och maskinen är den egna', () => {
    expect(lage()).toEqual({ typ: 'forare', maskinId: 'A030353' });
    expect(lage({ maskinId: 'JD810E' })).toEqual({ typ: 'forare', maskinId: 'JD810E' }); // en maskin utan position/kö är lika giltig
    expect(lage({ maskinId: 'SLUTAR' })).toEqual({ typ: 'forare', maskinId: 'SLUTAR' });
  });
  it('förare UTAN giltig maskin → bara kartan, aldrig förman', () => {
    for (const maskinId of [null, undefined, '', ' ', 'FINNS-INTE', 'a030353', ' A030353', 'A030353 ', 'GAMMAL']) {
      expect(lage({ maskinId })).toEqual({ typ: 'karta' });
    }
  });
  it('okänd eller saknad roll → bara kartan (fail-closed), inte förman', () => {
    for (const roll of [null, undefined, '', 'maskinist', 'Admin', 'ADMIN', 'forman', 'forare ']) {
      expect(lage({ roll, maskinId: 'A030353' })).toEqual({ typ: 'karta' });
    }
  });
  it('medan rollen läses: laddar — oavsett vad som annars står i raden', () => {
    expect(lage({ rollLaddar: true, roll: 'admin' })).toEqual({ typ: 'laddar' });
    expect(lage({ rollLaddar: true, roll: null })).toEqual({ typ: 'laddar' });
    expect(lage({ rollLaddar: true, roll: 'forare' })).toEqual({ typ: 'laddar' });
  });
  it('förare vars maskinlista inte är läst än: laddar (kan inte avgöra om maskinen är giltig); förman behöver ingen lista', () => {
    expect(lage({ maskiner: null })).toEqual({ typ: 'laddar' });
    expect(lage({ roll: 'admin', maskiner: null })).toEqual({ typ: 'forman' });
    expect(lage({ roll: null, maskiner: null })).toEqual({ typ: 'karta' });
  });
});
