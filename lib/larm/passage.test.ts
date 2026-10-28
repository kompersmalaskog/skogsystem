// PASSAGE PÅ PLANERAD VÄG genom en förbjuden yta (lib/larm/passage + stegaLarm `paVag`). Martin 2026-10-28, Skälviken: basvägen genom Vidas Hänsyn 6.
import { describe, expect, it } from 'vitest';
import { GRUPPER, type FargGrupp } from './grupper';
import { TOMT_LARM, arPassage, stegaLarm, type LarmObjekt, type LarmState } from './larm';
import { PASSAGE_HYSTERES_M, PASSAGE_VAG_M, arPlaneradVag, avstandTillPlaneradVagM, passageText, stegaPaVag } from './passage';
import { vidaObjekt } from './objekt';

const M = 1 / 111320;
const POS = { lat: 56.5, lon: 14.7 };
const ost = (m: number) => POS.lon + m * M / Math.cos(POS.lat * Math.PI / 180);

const yta = (grupp: FargGrupp, forbjuden: boolean, inne = true, extra: Partial<LarmObjekt> = {}): LarmObjekt => ({
  id: `y-${grupp}-${forbjuden}`, kalla: 'yta', grupp, namn: GRUPPER[grupp].namn, hash: 'h', avstandM: null, inne, forbjuden, ...extra,
});
const hansyn6 = (inne = true) => yta('natur', true, inne, { id: 'vida:L_TILLAGGSYTOR:6', namn: 'Hänsyn', bricka: 'Hänsyn 6' });
const steg = (objekt: LarmObjekt[], paVag: boolean, state: LarmState = TOMT_LARM) => stegaLarm({ objekt, kvitt: new Map(), forareId: 'A', state, paVag });

describe('planerad väg', () => {
  it('basväg (alla färgval) och stickvägar är planerade vägar; dike, stig, stenmur, traktgräns m.fl. är det inte', () => {
    for (const t of ['mainRoad', 'sideRoadRed', 'sideRoadYellow', 'sideRoadBlue']) expect(arPlaneradVag(t), t).toBe(true);
    for (const t of ['boundary', 'nature', 'ditch', 'trail', 'stonewall', 'powerline', 'backRoadRed', '', undefined, null]) expect(arPlaneradVag(t), String(t)).toBe(false);
  });
  it('avståndet är till NÄRMASTE planerade väg; inga vägar (eller en väg med en punkt) är oändligt långt bort', () => {
    const v1 = [{ lat: POS.lat - 0.001, lon: ost(5) }, { lat: POS.lat + 0.001, lon: ost(5) }];
    const v2 = [{ lat: POS.lat - 0.001, lon: ost(20) }, { lat: POS.lat + 0.001, lon: ost(20) }];
    expect(avstandTillPlaneradVagM(POS, [v2, v1])).toBeCloseTo(5, 1);
    expect(avstandTillPlaneradVagM(POS, [])).toBe(Infinity);
    expect(avstandTillPlaneradVagM(POS, [[POS]])).toBe(Infinity);
  });
});

describe('på vägen — tolerans och hysteres', () => {
  it(`på vid ≤ ${PASSAGE_VAG_M} m, inte vid mer`, () => {
    expect(stegaPaVag(false, PASSAGE_VAG_M)).toBe(true);
    expect(stegaPaVag(false, PASSAGE_VAG_M + 0.1)).toBe(false);
    expect(stegaPaVag(false, 0)).toBe(true);
  });
  it(`av först vid mer än ${PASSAGE_VAG_M + PASSAGE_HYSTERES_M} m (GPS-brus kring kanten fladdrar inte)`, () => {
    expect(stegaPaVag(true, PASSAGE_VAG_M + 2)).toBe(true);
    expect(stegaPaVag(true, PASSAGE_VAG_M + PASSAGE_HYSTERES_M)).toBe(true);
    expect(stegaPaVag(true, PASSAGE_VAG_M + PASSAGE_HYSTERES_M + 0.1)).toBe(false);
  });
  it('ingen väg (oändligt avstånd) är aldrig på vägen', () => {
    expect(stegaPaVag(true, Infinity)).toBe(false);
    expect(stegaPaVag(false, NaN)).toBe(false);
  });
  it('en serie GPS-punkter som svajar 6–10 m från vägen ger INTE av/på', () => {
    let pa = false;
    const ut = [3, 6, 9, 10, 7, 10.5, 8, 6].map((d) => (pa = stegaPaVag(pa, d)));
    expect(ut).toEqual([true, true, true, true, true, true, true, true]);
  });
});

describe('stegaLarm med paVag', () => {
  it('på vägen inne i Hänsyn 6: INGET kort, INGET ljud, raden "Passage genom Hänsyn 6"', () => {
    const u = steg([hansyn6()], true);
    expect(u.kort).toBeNull();
    expect(u.ljud).toBeNull();
    expect(u.vibration).toBeNull();
    expect(u.settRad).toBeNull();
    expect(u.passage).toEqual({ id: 'vida:L_TILLAGGSYTOR:6', namn: 'Hänsyn 6', grupp: 'natur', farg: GRUPPER.natur.farg });
    expect(passageText(u.passage!.namn)).toBe('Passage genom Hänsyn 6');
  });
  it('av vägen men kvar i ytan: det riktiga larmet (kort + ljud), som förut — ingen passage', () => {
    const u = steg([hansyn6()], false);
    expect(u.kort).toMatchObject({ forbjuden: true, text: 'Du är inne i ytan, kör inte här' });
    expect(u.ljud).toBe('nara');
    expect(u.passage).toBeNull();
  });
  it('på vägen → av vägen i ytan: kortet OCH ljudet kommer (passagen sparar inget steg)', () => {
    const a = steg([hansyn6()], true);
    const b = steg([hansyn6()], false, a.state);
    expect(b.kort).not.toBeNull();
    expect(b.ljud).toBe('nara');
  });
  it('i ytan med larm → upp på vägen: kortet försvinner och raden kommer; av igen: nytt larm med ljud', () => {
    const a = steg([hansyn6()], false);
    const b = steg([hansyn6()], true, a.state);
    expect(b.kort).toBeNull(); expect(b.passage?.namn).toBe('Hänsyn 6');
    const c = steg([hansyn6()], false, b.state);
    expect(c.kort).not.toBeNull(); expect(c.ljud).toBe('nara');
  });
  it('på vägen men UTANFÖR ytan: ingen passage', () => {
    expect(steg([hansyn6(false)], true).passage).toBeNull();
  });
  it('Röd fara (Ej framkomlig, förbjuden) larmar ALLTID — också på en planerad väg', () => {
    const ej = yta('fara', true, true, { id: 'ej', namn: 'Ej framkomlig' });
    const u = steg([ej], true);
    expect(u.kort).toMatchObject({ id: 'ej', grupp: 'fara' });
    expect(u.ljud).toBe('nara');
    expect(u.passage).toBeNull();
  });
  it('bara FÖRBJUDNA ytor: Blött (ej förbjuden) larmar som förut på vägen', () => {
    const blott = yta('blott', false, true, { id: 'b' });
    const u = steg([blott], true);
    expect(u.kort).toMatchObject({ id: 'b' });
    expect(u.passage).toBeNull();
  });
  it('symboler och linjer rörs inte på vägen (Grön symbol 20 m, Brun stenmur 10 m, Röd El-ledning 30 m)', () => {
    const objekt: LarmObjekt[] = [
      { id: 'n', kalla: 'symbol', grupp: 'natur', namn: 'Naturhörna', hash: 'h', avstandM: 20 },
      { id: 's', kalla: 'linje', grupp: 'kultur', namn: 'Stenmur', hash: 'h', avstandM: 10 },
      { id: 'p', kalla: 'linje', grupp: 'fara', namn: 'El-ledning', hash: 'h', avstandM: 30 },
    ];
    const med = steg(objekt, true), utan = steg(objekt, false);
    expect(med.kort).toEqual(utan.kort);
    expect(med.fler).toEqual(utan.fler);
    expect(med.ljud).toBe(utan.ljud);
    expect(med.passage).toBeNull();
  });
  it('passage i Hänsyn + Röd i närheten: Röda kortet visas, raden finns ändå (sidan visar den bara utan kort)', () => {
    const u = steg([hansyn6(), { id: 'p', kalla: 'symbol', grupp: 'fara', namn: 'El-ledning', hash: 'h', avstandM: 20 }], true);
    expect(u.kort?.id).toBe('p');
    expect(u.fler).toHaveLength(0);
    expect(u.passage?.namn).toBe('Hänsyn 6');
  });
  it('utan bricka (egen ritad Hänsyn-yta) står ytans namn', () => {
    expect(steg([yta('natur', true, true, { namn: 'Hänsyn' })], true).passage?.namn).toBe('Hänsyn');
  });
  it('arPassage: kräver väg, yta, förbjuden, inne, inte fara, inte undantagen', () => {
    const o = hansyn6();
    expect(arPassage(o, true)).toBe(true);
    expect(arPassage(o, false)).toBe(false);
    expect(arPassage({ ...o, forbjuden: false }, true)).toBe(false);
    expect(arPassage({ ...o, inne: false }, true)).toBe(false);
    expect(arPassage({ ...o, grupp: 'fara' }, true)).toBe(false);
    expect(arPassage({ ...o, kalla: 'linje', avstandM: 3 }, true)).toBe(false);
    expect(arPassage({ ...o, undantagen: true }, true)).toBe(false);
  });
  it('utan paVag (gamla anrop) är allt som förut', () => {
    expect(stegaLarm({ objekt: [hansyn6()], kvitt: new Map(), forareId: 'A', state: TOMT_LARM }).kort).not.toBeNull();
  });
});

describe('Vidas tilläggsyta får brickan ur lib/ytaNamn', () => {
  it('L_TILLAGGSYTOR med LOPNR 6 → bricka "Hänsyn 6"; nyckelbiotop har ingen bricka', () => {
    const ring = [[ost(-50), POS.lat - 50 * M], [ost(50), POS.lat - 50 * M], [ost(50), POS.lat + 50 * M], [ost(-50), POS.lat + 50 * M], [ost(-50), POS.lat - 50 * M]];
    const fc = { features: [
      { type: 'Feature', properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', TYP: '24', LOPNR: 6, FLBESKR: 'Kant mot vatten O' }, geometry: { type: 'Polygon', coordinates: [ring] } },
      { type: 'Feature', properties: { _lager: 'SV_SKS_NYCKELBIOTOP_101' }, geometry: { type: 'Polygon', coordinates: [ring] } },
    ] };
    const [h, nb] = vidaObjekt(fc, POS);
    expect(h).toMatchObject({ kalla: 'yta', forbjuden: true, inne: true, bricka: 'Hänsyn 6' });
    expect(nb.bricka).toBeUndefined();
    expect(steg([h], true).passage?.namn).toBe('Hänsyn 6');
  });
});
