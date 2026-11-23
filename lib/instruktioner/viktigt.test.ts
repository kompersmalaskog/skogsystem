// VIKTIGT i instruktionerna vid inkörning (Martin 2026-11-23): en kommentar med bara en Viktigt-rad är en instruktion (text får vara tom), Viktigt kommer först,
// och en ändrad Viktigt-rad är osedd igen — medan en kommentar utan Viktigt behåller sin hash (och därmed sitt "sett").
import { describe, expect, it } from 'vitest';
import { TOMT_INSTRUKTION, hashText, kortAttVisa, paminnelseAttVisa, samlaOmraden, stegaInstruktion, type InstruktionOmrade } from './instruktioner';
import type { KommentarVy } from '../kartkommentar';

const OBJ = 'obj-1';
const kvadrat = (lon: number, lat: number, d = 0.0005) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const hansyn = (lopnr: string) => ({ type: 'Feature', geometry: kvadrat(15, 56), properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', LOPNR: lopnr, FLBESKR: 'Naturvårdsyta' } });
const kk = (id: string, nyckel: string, text: string, viktigt: string | null, skapad = '2026-11-23T08:00:00Z'): KommentarVy => ({
  id, objekt_id: OBJ, yta_nyckel: nyckel, text, viktigt, skapad_av: 'm1', namn: 'Martin Hjert', skapad_at: skapad, andrad_at: skapad, vantar: false,
});
const samla = (kommentarer: KommentarVy[]): InstruktionOmrade[] => samlaOmraden({
  objektId: OBJ, vida: { features: [hansyn('1')] }, markers: [], svgToLatLon: (x, y) => ({ lat: y, lon: x }), typNamn: () => 'Symbol', kommentarer, pos: { lat: 56, lon: 15 }, nu: new Date('2026-11-23T10:00:00Z'),
});

describe('Viktigt i samlaOmraden', () => {
  it('en kommentar med bara Viktigt (tom Övrigt) blir en instruktion', () => {
    const o = samla([kk('a', 'hansyn:1', '', 'Bron håller inte')]);
    expect(o).toHaveLength(1);
    expect(o[0].instruktioner[0]).toMatchObject({ ref: 'a', text: '', viktigt: 'Bron håller inte', kalla: 'egen' });
  });

  it('Viktigt kommer först, även före en äldre kommentar utan Viktigt', () => {
    const o = samla([kk('gammal', 'hansyn:1', 'Gammal text', null, '2026-11-01T08:00:00Z'), kk('ny', 'hansyn:1', 'Mer', 'Kör inte här', '2026-11-23T08:00:00Z')]);
    expect(o[0].instruktioner.map((i) => i.ref)).toEqual(['ny', 'gammal']);
  });

  it('en kommentar utan Viktigt har oförändrad hash (gamla "sett" gäller), med Viktigt en annan, och en ändrad Viktigt är en tredje', () => {
    const utan = samla([kk('a', 'hansyn:1', 'Hej', null)])[0].instruktioner[0];
    expect(utan.hash).toBe(hashText('Hej'));
    expect(utan.viktigt).toBeNull();
    const med = samla([kk('a', 'hansyn:1', 'Hej', 'Stopp')])[0].instruktioner[0];
    const andrad = samla([kk('a', 'hansyn:1', 'Hej', 'Stopp 2')])[0].instruktioner[0];
    expect(med.hash).not.toBe(utan.hash);
    expect(andrad.hash).not.toBe(med.hash);
  });

  it('en kommentar utan varken Övrigt eller Viktigt ger ingen instruktion', () => {
    expect(samla([kk('a', 'hansyn:1', '   ', null)])).toHaveLength(0);
  });

  it('påminnelsepillen i ytan säger Viktigt-raden (inte en tom text) och kortet kommer först när Viktigt är osedd', () => {
    const omr = samla([kk('a', 'hansyn:1', '', 'Bron håller inte')]);
    // Osedd: inkörningen ger det stora kortet med Sett.
    const s1 = stegaInstruktion(TOMT_INSTRUKTION, omr, new Map(), 1000);
    expect(kortAttVisa(s1, omr, new Map(), false)).not.toBeNull();
    // Sedd (hashen med Viktigt): pillen visas och bär Viktigt-raden som text.
    const sedda = new Map([['a', omr[0].instruktioner[0].hash]]);
    const s2 = stegaInstruktion(TOMT_INSTRUKTION, omr, sedda, 1000);
    const p = paminnelseAttVisa(s2, omr, sedda, 2000, false, false)!;
    expect(p.text).toBe('Bron håller inte');
  });

  it('är kommentaren sedd utan Viktigt och Viktigt läggs till efteråt är den osedd igen', () => {
    const utan = samla([kk('a', 'hansyn:1', 'Hej', null)]);
    const sedd = new Map([['a', utan[0].instruktioner[0].hash]]);
    const med = samla([kk('a', 'hansyn:1', 'Hej', 'Ny viktig rad')]);
    expect(kortAttVisa(stegaInstruktion(TOMT_INSTRUKTION, utan, sedd, 1000), utan, sedd, false)).toBeNull();
    expect(kortAttVisa(stegaInstruktion(TOMT_INSTRUKTION, med, sedd, 1000), med, sedd, false)).not.toBeNull();
  });
});
