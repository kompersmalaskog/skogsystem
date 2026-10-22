// PÅMINNELSEN I YTAN (Martin 2026-10-22): redan sedd instruktion + inne i ytan → pill (bricka + kort text) i 10 s, sedan bara brickan så länge man är kvar; ut → borta, in igen → pillen 10 s igen.
import { describe, expect, it } from 'vitest';
import {
  PAMINNELSE_FULL_MS, TOMT_INSTRUKTION, hashText, kortAttVisa, paminnelseAttVisa, samlaOmraden, stegaInstruktion,
  type InstruktionOmrade, type InstruktionState, type SettKarta,
} from './instruktioner';

const kv = (lon: number, lat: number, d = 0.0005) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const yta = (TYP: string, LOPNR: number, FLBESKR: string, ATGARD: string, lon: number) => ({
  type: 'Feature', geometry: kv(lon, 56), properties: { TYP, LOPNR, _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR', FLBESKR, ATGARD },
});
const ATG = 'Lämna 10–15 m, bara gran avverkas.\r\nIngen körning i kantzonen.';
const FEATURES = [yta('24', 1, 'Kant mot vatten O', ATG, 15), yta('71', 4, 'Övrigt', 'avverkning av frötallar.', 15.01)];
const INNE_1 = { lat: 56, lon: 15 };       // i Hänsyn 1
const INNE_4 = { lat: 56, lon: 15.01 };    // i Övrigt 4
const UTE = { lat: 57, lon: 16 };
const omr = (pos: { lat: number; lon: number } | null, direktiv: string | null = null): InstruktionOmrade[] => samlaOmraden({
  objektId: 'o', vida: { features: FEATURES }, markers: [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'Symbol', kommentarer: [], pos, direktiv,
});
const SEDDA: SettKarta = new Map([[`vida:hansyn:1`, hashText(ATG)], [`vida:hansyn:4`, hashText('avverkning av frötallar.')]]);
const INGET: SettKarta = new Map();
const T0 = 1_000_000;

describe('stegaInstruktion — påminnelsens tillstånd', () => {
  it('första inkörningen i en SEDD yta startar påminnelsen (hela pillen)', () => {
    const s = stegaInstruktion(TOMT_INSTRUKTION, omr(INNE_1), SEDDA, T0);
    expect(s.inne).toEqual({ 'hansyn:1': true });
    expect(s.paminn).toEqual({ 'hansyn:1': T0 });
    expect(s.vantande).toEqual([]);
  });
  it('en OSEDD yta ger det stora kortet (som förut) — ingen påminnelse', () => {
    const s = stegaInstruktion(TOMT_INSTRUKTION, omr(INNE_1), INGET, T0);
    expect(s.vantande).toEqual(['hansyn:1']);
    expect(s.paminn).toEqual({});
  });
  it('startpunkten ligger kvar medan man är i ytan (tiden räknas från inkörningen, inte från varje GPS-punkt)', () => {
    const a = stegaInstruktion(TOMT_INSTRUKTION, omr(INNE_1), SEDDA, T0);
    const b = stegaInstruktion(a, omr(INNE_1), SEDDA, T0 + 4000);
    expect(b.paminn).toEqual({ 'hansyn:1': T0 });
  });
  it('kör man ut försvinner den; kör man in igen börjar hela pillen om', () => {
    let s = stegaInstruktion(TOMT_INSTRUKTION, omr(INNE_1), SEDDA, T0);
    s = stegaInstruktion(s, omr(UTE), SEDDA, T0 + 30000);
    expect(s.paminn).toEqual({});
    s = stegaInstruktion(s, omr(INNE_1), SEDDA, T0 + 60000);
    expect(s.paminn).toEqual({ 'hansyn:1': T0 + 60000 });
  });
  it('Sett inne i ytan: påminnelsen startar direkt som bricka (man har precis läst det) — ingen ny 10-sekunders pill', () => {
    let s = stegaInstruktion(TOMT_INSTRUKTION, omr(INNE_1), INGET, T0);            // stora kortet väntar
    s = stegaInstruktion(s, omr(INNE_1), SEDDA, T0 + 5000);                          // Sett
    expect(s.vantande).toEqual([]);
    expect(s.paminn['hansyn:1']).toBe(T0 + 5000 - PAMINNELSE_FULL_MS);
    const p = paminnelseAttVisa(s, omr(INNE_1), SEDDA, T0 + 5000, false, false)!;
    expect(p.fas).toBe('bricka');
  });
  it('en ändrad text är osedd igen: det stora kortet, ingen påminnelse', () => {
    const ändrad: SettKarta = new Map([[`vida:hansyn:1`, hashText('gammal text')]]);
    const s = stegaInstruktion(TOMT_INSTRUKTION, omr(INNE_1), ändrad, T0);
    expect(s.vantande).toEqual(['hansyn:1']);
    expect(s.paminn).toEqual({});
  });
  it('hela trakten (direktivet) har ingen påminnelse och ingen inkörning', () => {
    const s = stegaInstruktion(TOMT_INSTRUKTION, omr(INNE_1, 'Obs tjärdal enligt karta.'), new Map([...SEDDA, ['vida:direktiv', hashText('Obs tjärdal enligt karta.')]]), T0);
    expect(Object.keys(s.paminn)).toEqual(['hansyn:1']);
  });
});

describe('paminnelseAttVisa — hela trakten', () => {
  it('direktivet (objektnivå) får aldrig en påminnelse, inte ens om tillståndet av misstag skulle innehålla det', () => {
    const o = omr(INNE_1, 'Obs tjärdal enligt karta.');
    const fel: InstruktionState = { inne: { direktiv: true }, vantande: [], paminn: { direktiv: T0 } };
    const s: SettKarta = new Map([['vida:direktiv', hashText('Obs tjärdal enligt karta.')]]);
    expect(paminnelseAttVisa(fel, o, s, T0, false, false)).toBeNull();
  });
});

describe('paminnelseAttVisa — pill 10 s, sedan bricka', () => {
  const s0: InstruktionState = stegaInstruktion(TOMT_INSTRUKTION, omr(INNE_1), SEDDA, T0);
  const visa = (nu: number, blockerad = false, kortVisas = false) => paminnelseAttVisa(s0, omr(INNE_1), SEDDA, nu, blockerad, kortVisas);
  it('innehållet: brickan är kartans etikett, typen, första punkten av instruktionen och hela instruktionen', () => {
    const p = visa(T0)!;
    expect(p).toMatchObject({ nyckel: 'hansyn:1', bricka: 'Hänsyn 1', typ: 'Kant mot vatten', brickaGrupp: 'natur', text: 'Lämna 10–15 m, bara gran avverkas.', fas: 'full', kvarMs: PAMINNELSE_FULL_MS, avlagg: false });
    expect(p.instruktioner).toHaveLength(1);
    expect(p.instruktioner[0].text).toBe(ATG);
  });
  it('hela pillen i 10 s (kvarMs räknar ner), därefter bara brickan', () => {
    expect(visa(T0 + 9999)).toMatchObject({ fas: 'full', kvarMs: 1 });
    expect(visa(T0 + PAMINNELSE_FULL_MS)).toMatchObject({ fas: 'bricka', kvarMs: 0 });
    expect(visa(T0 + 120000)).toMatchObject({ fas: 'bricka' });   // ligger kvar så länge man är i ytan
  });
  it('Övrigt: brickan "Övrigt 4" (neutral), ingen upprepad typ', () => {
    const s = stegaInstruktion(TOMT_INSTRUKTION, omr(INNE_4), SEDDA, T0);
    expect(paminnelseAttVisa(s, omr(INNE_4), SEDDA, T0, false, false)).toMatchObject({ bricka: 'Övrigt 4', typ: '', brickaGrupp: 'ovrigt', text: 'avverkning av frötallar.' });
  });
  it('larm och lossningskort går före: göms medan de visas (blockerad), kommer tillbaka efter', () => {
    expect(visa(T0 + 2000, true)).toBeNull();
    expect(visa(T0 + 3000, false)).toMatchObject({ fas: 'full' });
  });
  it('instruktionskortet med Sett går före: ingen påminnelse medan det visas', () => {
    expect(visa(T0, false, true)).toBeNull();
  });
  it('utanför ytan, eller en yta som inte är inne enligt tillståndet: ingenting', () => {
    const ute = stegaInstruktion(s0, omr(UTE), SEDDA, T0 + 1000);
    expect(paminnelseAttVisa(ute, omr(UTE), SEDDA, T0 + 1000, false, false)).toBeNull();
  });
  it('påminnelsen är oberoende av instruktionskortets kö: kortAttVisa ger inget kort för en sedd yta', () => {
    expect(kortAttVisa(s0, omr(INNE_1), SEDDA, false)).toBeNull();
  });
  it('en yta som blir osedd medan man är inne (ny text) visar ingen påminnelse', () => {
    expect(paminnelseAttVisa(s0, omr(INNE_1), INGET, T0, false, false)).toBeNull();
  });
});
