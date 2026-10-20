import { describe, expect, it } from 'vitest';
import { GRUPPER, VIDA } from './larm/grupper';
import { SYMBOL_FORKLARING, VIDA_FORKLARING, YTA_FORKLARING } from './symboler';
import { GRUPP_ORDNING, MENY_SYMBOLER, byggTeckenforklaring, vidaSlagIFeatures } from './teckenforklaring';

const sym = (type: string) => ({ isMarker: true, type });
const rader = (g: ReturnType<typeof byggTeckenforklaring>) => g.flatMap((x) => x.rader.map((r) => r.nyckel));

describe('Vad betyder kartan: bara det som finns på trakten', () => {
  it('tom trakt → inga grupper (sidan säger det, listar inget)', () => {
    expect(byggTeckenforklaring({ markeringar: [], vida: [] })).toEqual([]);
  });
  it('grupperat Fara · Natur · Kultur · Blött · Att göra · Info — i den ordningen, tomma grupper utelämnas', () => {
    const g = byggTeckenforklaring({ markeringar: [sym('gate'), sym('highstump'), sym('warning'), sym('wet'), sym('culturemonument')], vida: [] });
    expect(g.map((x) => x.grupp)).toEqual(['fara', 'natur', 'kultur', 'blott', 'info']);
    expect(GRUPP_ORDNING).toEqual(['fara', 'natur', 'kultur', 'blott', 'att_gora', 'info']);
  });
  it('en rad per sort: tre Varning och en gammal Kulturstubbe + en Kulturlämning blir EN rad var', () => {
    const g = byggTeckenforklaring({ markeringar: [sym('warning'), sym('warning'), sym('warning'), sym('culturestump'), sym('culturemonument')] });
    expect(rader(g)).toEqual(['symbol:warning', 'symbol:culturemonument']);
    expect(g.find((x) => x.grupp === 'kultur')!.rader[0].namn).toBe('Kulturlämning');
  });
  it('namn, grupp och mening kommer ur symbolkällan — ingen egen text', () => {
    const [fara] = byggTeckenforklaring({ markeringar: [sym('huntingtower')] });
    expect(fara).toMatchObject({ grupp: 'fara', namn: GRUPPER.fara.namn, farg: GRUPPER.fara.farg, form: 'triangel' });
    expect(fara.rader[0]).toMatchObject({ namn: 'Jakttorn', forklaring: SYMBOL_FORKLARING.huntingtower });
  });
  it('ytor: egna (zoneType) och Vidas lager, med förbjudna ytor markerade', () => {
    const g = byggTeckenforklaring({
      markeringar: [{ isZone: true, zoneType: 'protected' }, { isZone: true, zoneType: 'wet' }, { isZone: true, zoneType: 'gallring' }],
      vida: ['nyckelbiotop', 'raa_yta'],
    });
    const alla = g.flatMap((x) => x.rader);
    expect(alla.map((r) => r.nyckel).sort()).toEqual(['vida:nyckelbiotop', 'vida:raa_yta', 'yta:protected', 'yta:wet']);   // gallringszonen är ingen varningsyta
    expect(alla.find((r) => r.nyckel === 'yta:protected')).toMatchObject({ forbjuden: true, forklaring: YTA_FORKLARING.protected });
    expect(alla.find((r) => r.nyckel === 'yta:wet')!.forbjuden).toBe(false);
    expect(alla.find((r) => r.nyckel === 'vida:nyckelbiotop')).toMatchObject({ namn: VIDA.nyckelbiotop.namn, forklaring: VIDA_FORKLARING.nyckelbiotop, forbjuden: true });
  });
  it('en okänd symboltyp får ingen rad (vi gissar inte ett namn)', () => {
    expect(byggTeckenforklaring({ markeringar: [sym('hittepa')] })).toEqual([]);
  });
  it('"Visa alla symboler": allt som går att sätta ur menyn + alla ytor + Vidas lager, oavsett vad som finns på trakten', () => {
    const g = byggTeckenforklaring({ markeringar: [], vida: [], visaAlla: true });
    const n = rader(g);
    for (const t of MENY_SYMBOLER) expect(n, t).toContain(`symbol:${t}`);
    expect(n).toContain('symbol:gate');
    expect(n).toContain('yta:fornlamning');
    expect(n).toContain('vida:kraftledning');
    expect(n).not.toContain('symbol:culturestump');   // slogs ihop med Kulturlämning
    expect(g.map((x) => x.grupp)).toEqual(['fara', 'natur', 'kultur', 'blott', 'att_gora', 'info']);
  });
});

describe('Vidas kraftledning och RAÄ-punkt får en bild som matchar kartan', () => {
  it('kraftledningen är en streckad linje i Fara; RAÄ-punkten en Kulturlämning-symbol; ytorna är ytor', () => {
    const r = byggTeckenforklaring({ vida: ['kraftledning', 'raa_punkt', 'hansynsyta'] }).flatMap((g) => g.rader);
    expect(r.find((x) => x.nyckel === 'vida:kraftledning')).toMatchObject({ slag: 'linje', streckad: true, grupp: 'fara' });
    expect(r.find((x) => x.nyckel === 'vida:raa_punkt')).toMatchObject({ slag: 'symbol', typ: 'culturemonument', grupp: 'kultur' });
    expect(r.find((x) => x.nyckel === 'vida:hansynsyta')).toMatchObject({ slag: 'yta', forbjuden: true });
  });
});

describe('Vidas lager ur traktgeometrin', () => {
  it('känner igen hänsynsyta, nyckelbiotop, RAÄ-yta, RAÄ-punkt och kraftledning', () => {
    const f = (properties: Record<string, unknown>) => ({ properties });
    expect(vidaSlagIFeatures([
      f({ _typ: 'hänsynsyta' }), f({ _lager: 'SV_SKS_NYCKELBIOTOP_101' }), f({ _lager: 'L_RAA_POLY_101' }), f({ _lager: 'L_RAA_POINT_101' }),
      f({ _typ: 'linje', FLBESKR: 'Kraftledning' }), f({ _typ: 'linje', FLBESKR: 'Basväg' }), f({ _typ: 'punkt' }),
    ]).sort()).toEqual(['hansynsyta', 'kraftledning', 'nyckelbiotop', 'raa_punkt', 'raa_yta']);
    expect(vidaSlagIFeatures(null)).toEqual([]);
  });
});
