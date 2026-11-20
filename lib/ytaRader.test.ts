// Raderna i ⓘ-panelen "Det här gäller här": en rad per yta, kartans namn som bricka, första punkten, blå prick för osedda.
import { describe, expect, it } from 'vitest';
import { ytaRader } from './ytaRader';
import { instruktionerPaTrakten, samlaOmraden, hashText, type SettKarta } from './instruktioner/instruktioner';

const kvadrat = (lon: number, lat: number, d = 0.0005) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const yta = (TYP: string, LOPNR: number, FLBESKR: string, ATGARD: string | null, lon: number) => ({
  type: 'Feature', geometry: kvadrat(lon, 56.35), properties: { TYP, LOPNR, _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR', FLBESKR, ATGARD },
});
const DIR = 'Obs tjärdal enligt karta. Lämna fina ekar.';
// Hålabäck au 2025, ur prod 2026-10-22 — i OMVÄND nummerordning i filen: raderna ska ändå komma i Vidas nummer.
const FEATURES = [
  yta('71', 5, 'Övrigt', 'avverkning av frötallar. spara utspridda tallar, minst 10 per ha.', 15.07),
  yta('71', 4, 'Övrigt', 'avverkning av frötallar.\r\nLämn kantzon mot sjön.', 15.06),
  yta('5', 3, 'Blockmark / bergbrant O', 'Torr stenig mark som lämnas orörd', 15.05),
  yta('8', 2, 'Sumpskog O', 'hänsynsyta', 15.04),
  yta('24', 1, 'Kant mot vatten O', 'kantzon lämnas på ca 10-15 m där endast gran avverkas.  Ingen underröjning o ingen körning i kantzonen.', 15.03),
];
const lista = (sett: SettKarta = new Map()) => instruktionerPaTrakten(samlaOmraden({
  objektId: 'o', vida: { features: FEATURES }, markers: [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'Symbol', kommentarer: [], pos: null, direktiv: DIR,
}), sett);

describe('ytaRader — Hålabäck au 2025', () => {
  const rader = ytaRader(FEATURES, lista());
  it('en rad per Vida-yta i Vidas nummerordning (som kartan), direktivet är ingen yta', () => {
    expect(rader.map((r) => r.bricka)).toEqual(['Hänsyn 1', 'Hänsyn 2', 'Hänsyn 3', 'Övrigt 4', 'Övrigt 5']);
    expect(rader.map((r) => r.nyckel)).toEqual(['hansyn:1', 'hansyn:2', 'hansyn:3', 'hansyn:4', 'hansyn:5']);
  });
  it('typ utan Vidas " O"; Övrigt upprepar inte sitt namn; brickans grupp: natur grön, Övrigt neutral', () => {
    expect(rader.map((r) => r.typ)).toEqual(['Kant mot vatten', 'Sumpskog', 'Blockmark / bergbrant', '', '']);
    expect(rader.map((r) => r.grupp)).toEqual(['natur', 'natur', 'natur', 'ovrigt', 'ovrigt']);
  });
  it('kort text = första punkten av instruktionen; en yta utan instruktion ("hänsynsyta") visar ingen text men finns ändå', () => {
    expect(rader[0].text).toBe('kantzon lämnas på ca 10-15 m där endast gran avverkas.  Ingen underröjning o ingen körning i kantzonen.');
    expect(rader[1].text).toBeNull();                       // Sumpskog O: ATGARD "hänsynsyta" är bara ett typnamn
    expect(rader[2].text).toBe('Torr stenig mark som lämnas orörd');
    expect(rader[3].text).toBe('avverkning av frötallar.');   // första raden av två
  });
  it('osedda har blå prick, sedda inte (sett per kommentar, hash av texten)', () => {
    expect(rader.filter((r) => r.osedd).map((r) => r.bricka)).toEqual(['Hänsyn 1', 'Hänsyn 3', 'Övrigt 4', 'Övrigt 5']);   // Sumpskog har ingen instruktion
    const sett: SettKarta = new Map([['vida:hansyn:3', hashText('Torr stenig mark som lämnas orörd')]]);
    expect(ytaRader(FEATURES, lista(sett)).find((r) => r.bricka === 'Hänsyn 3')!.osedd).toBe(false);
  });
  it('egna områden och avlägg med instruktion kommer efter Vidas ytor; en yta räknas bara en gång', () => {
    const egen = { nyckel: 'marker:9', namn: 'Hänsyn', instruktioner: [{ ref: 'k', text: 'Gå runt blötan', hash: 'h', kalla: 'egen' as const, forfattare: 'Daniel', vantar: false, sedd: false }], nya: 1, bricka: 'Hänsyn', typ: '', brickaGrupp: 'natur' as const };
    const l = lista(); l.omraden.push(egen);
    const r = ytaRader([...FEATURES, FEATURES[0]], l);
    expect(r.map((x) => x.bricka)).toEqual(['Hänsyn 1', 'Hänsyn 2', 'Hänsyn 3', 'Övrigt 4', 'Övrigt 5', 'Hänsyn']);
    expect(r[5]).toMatchObject({ nyckel: 'marker:9', text: 'Gå runt blötan', osedd: true });
  });
  it('ingen geometri → inga rader', () => {
    expect(ytaRader(null, { antal: 0, nya: 0, omraden: [] })).toEqual([]);
    expect(ytaRader([], { antal: 0, nya: 0, omraden: [] })).toEqual([]);
    // direktivet ensamt är ingen yta
    expect(ytaRader([], instruktionerPaTrakten(samlaOmraden({ objektId: 'o', vida: { features: [] }, markers: [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'S', kommentarer: [], pos: null, direktiv: DIR }), new Map()))).toEqual([]);
  });
});
