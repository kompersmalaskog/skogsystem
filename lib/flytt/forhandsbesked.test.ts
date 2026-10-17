import { describe, it, expect } from 'vitest';
import tabell from './__fixtures__/fakturerbar_tabell.json';
import { forhandsbesked, type ForeFlytt } from './forhandsbesked';

const fore = (o: Partial<ForeFlytt> = {}): ForeFlytt => ({ typ: 'produktion', km: 53, fakturerbar: true, maskinId: 'GIANT', externMaskin: null, ...o });
const ny = (o: Record<string, unknown> = {}) => ({ typ: 'produktion', manuell: null, maskinId: 'GIANT', externMaskin: null, ...o }) as any;

describe('förhandsbeskedet följer samma regel som fakturerbar_for (den gemensamma testtabellen)', () => {
  it.each(tabell.map(r => [r.typ, r.km, r.manuell, r.forvantat] as const))('%s, %s km, manuellt %s → %s', (typ, km, manuell, forvantat) => {
    // Från motsatt läge till det tabellen säger: beskedet ska då säga att flytten byter läge — och bara då.
    const rader = forhandsbesked(fore({ km, fakturerbar: !forvantat }), ny({ typ, manuell }), null);
    expect(rader).toEqual([forvantat ? 'Blir fakturerbar — hamnar under Att godkänna' : 'Blir inte fakturerbar — underlaget stryks']);
    // Från samma läge som tabellen säger: inget besked om fakturering.
    expect(forhandsbesked(fore({ km, fakturerbar: forvantat }), ny({ typ, manuell }), null)).toEqual([]);
  });
});

describe('förhandsbesked — manuellt val', () => {
  it('15 km produktion, ej fakturerbar: att slå på Fakturera ger "hamnar under Att godkänna"', () => {
    expect(forhandsbesked(fore({ km: 15, fakturerbar: false }), ny({ manuell: true }), null)).toEqual(['Blir fakturerbar — hamnar under Att godkänna']);
  });
  it('53 km produktion, fakturerbar: att slå av Fakturera ger "underlaget stryks"', () => {
    expect(forhandsbesked(fore(), ny({ manuell: false }), null)).toEqual(['Blir inte fakturerbar — underlaget stryks']);
  });
  it('ett val som inte ändrar läget säger ingenting (53 km, "ja" = som regeln)', () => {
    expect(forhandsbesked(fore(), ny({ manuell: true }), null)).toEqual([]);
  });
  it('manuellt ja på service går före typen — och byter man typ till produktion under 30 km behåller valet läget', () => {
    expect(forhandsbesked(fore({ typ: 'service', km: 15, fakturerbar: true }), ny({ typ: 'produktion', manuell: true }), null)).toEqual([]);
  });
});

describe('förhandsbesked', () => {
  it('produktion → service på en fakturerbar flytt: underlaget stryks (mätt km avgör, aldrig justerat)', () => {
    expect(forhandsbesked(fore(), ny({ typ: 'service' }), null)).toEqual(['Blir inte fakturerbar — underlaget stryks']);
  });
  it('service → produktion med 53 km: blir fakturerbar; med 20 km händer inget', () => {
    expect(forhandsbesked(fore({ typ: 'service', fakturerbar: false }), ny({ typ: 'produktion' }), null)).toEqual(['Blir fakturerbar — hamnar under Att godkänna']);
    expect(forhandsbesked(fore({ typ: 'service', fakturerbar: false, km: 20 }), ny({ typ: 'produktion' }), null)).toEqual([]);
  });
  it('maskinbyte egen → egen: positionen följer med, med den nya maskinens namn', () => {
    expect(forhandsbesked(fore(), ny({ maskinId: 'ELEFANT' }), 'Elefant 26')).toEqual(['Positionen följer med till Elefant 26']);
  });
  it('byte till eller från annans maskin: säger ärligt att positionen inte följer med', () => {
    const r = forhandsbesked(fore(), ny({ maskinId: null, externMaskin: 'Kundens skotare' }), null);
    expect(r).toEqual(['Positionen följer inte med vid byte till eller från en annan maskin — kolla kartan efteråt']);
  });
  it('typ och maskin samtidigt: båda raderna, fakturering först', () => {
    expect(forhandsbesked(fore(), ny({ typ: 'annat', maskinId: 'ELEFANT' }), 'Elefant 26')).toEqual([
      'Blir inte fakturerbar — underlaget stryks', 'Positionen följer med till Elefant 26']);
  });
  it('inget ändrat: inget besked', () => {
    expect(forhandsbesked(fore(), ny(), null)).toEqual([]);
  });
});
