// Vidas TYP 71 ("Övrigt") i tilläggsytorna är INGEN hänsyn (Martin 2026-10-22, Hålabäck au 2025). Provar hela kedjan med objektets verkliga fem tilläggsytor (properties ur prod).
import { describe, expect, it } from 'vitest';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { arHansynsyta, arOvrigYta } from './vidaYtaTyp';
import { klassaTraktFeature, byggTraktKort, ytaNyckel } from './traktGeometri';
import { vidaNycklar } from './vidaNycklar';
import { vidaObjekt, vidaSlag } from './larm/objekt';
import { stegaLarm, TOMT_LARM } from './larm/larm';
import { bedomFallning, fallningKandidater } from './larm/fallning';
import { vidaSlagIFeatures } from './teckenforklaring';
import { geometriSammanfattning } from './objekt/filenGav';
import { byggOmGrupper } from './omTrakten';
import { HANSYNSYTA_FILTER, OVRIGT_YTA_FILTER, VIDA_ETIKETT } from './ytaStil';
import { arInstruktionsText } from './instruktioner/instruktioner';

const M_LAT = 1 / 111320;
const M_LON = 1 / (111320 * Math.cos(56.35 * Math.PI / 180));
const MITT = { lat: 56.35, lon: 15.05 };
const kv = (ost: number, nord: number, r = 40) => {
  const c = (dx: number, dy: number): [number, number] => [MITT.lon + (ost + dx) * M_LON, MITT.lat + (nord + dy) * M_LAT];
  return [[c(-r, -r), c(r, -r), c(r, r), c(-r, r), c(-r, -r)]];
};
const yta = (TYP: string, LOPNR: number, FLBESKR: string, ATGARD: string | null, ost: number) => ({
  type: 'Feature', geometry: { type: 'Polygon', coordinates: kv(ost, 0) },
  properties: { TYP, FLID: LOPNR, LOPNR, _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR', FLBESKR, ATGARD, 'SHAPE.STAr': 4000 },
});
const ATG71A = 'avverkning av frötallar.\r\nLämn kantzon mot sjön. Lämna enstaka utspridda tallar.';
const FEATURES = [
  yta('24', 1, 'Kant mot vatten O', 'kantzon lämnas på ca 10-15 m där endast gran avverkas.  Ingen underröjning o ingen körning i kantzonen.', 0),
  yta('8', 2, 'Sumpskog O', 'hänsynsyta', 300),
  yta('5', 3, 'Blockmark / bergbrant O', 'Torr stenig mark som lämnas orörd', 600),
  yta('71', 4, 'Övrigt', ATG71A, 900),
  yta('71', 5, 'Övrigt', 'avverkning av frötallar. spara utspridda tallar, minst 10 per ha. Husruin enligt karta o nordöstra delen.', 1200),
];
const FC = { features: FEATURES };
const [K24, K8, K5, K71A, K71B] = FEATURES;
const pos = (ost: number) => ({ lat: MITT.lat, lon: MITT.lon + ost * M_LON });

describe('klassningen: en funktion avgör', () => {
  it('TYP 24, 8 och 5 är hänsynsytor; TYP 71 är Övrigt', () => {
    expect([K24, K8, K5].map((f) => arHansynsyta(f.properties))).toEqual([true, true, true]);
    expect([K71A, K71B].map((f) => arOvrigYta(f.properties))).toEqual([true, true]);
    expect([K71A, K71B].map((f) => arHansynsyta(f.properties))).toEqual([false, false]);
  });
  it('koden kan vara tal eller text; fel lager eller ingen kod ger ingen Övrigt', () => {
    expect(arOvrigYta({ _lager: 'L_TILLAGGSYTOR', TYP: 71 })).toBe(true);
    expect(arOvrigYta({ _lager: 'L_TILLAGGSYTOR', TYP: ' 71 ' })).toBe(true);
    expect(arOvrigYta({ _lager: 'L_TILLAGGSPUNKTER', TYP: '71' })).toBe(false);
    expect(arOvrigYta({ _lager: 'L_TILLAGGSYTOR' })).toBe(false);
    expect(arOvrigYta({ _lager: 'L_TILLAGGSYTOR', TYP: '710' })).toBe(false);
    expect(arOvrigYta(null)).toBe(false);
    expect(arHansynsyta({ _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR' })).toBe(true);   // utan kod: som förut
    for (const _typ of ['traktgräns', 'punkt', 'linje', 'okänt']) expect(arHansynsyta({ _typ, _lager: 'L_TILLAGGSYTOR', TYP: '24' }), _typ).toBe(false);   // bara tilläggsytor (_typ hänsynsyta) kan vara hänsyn
  });
  it('klassaTraktFeature: 71 är kategorin ovrigt, övriga tilläggsytor hansyn', () => {
    expect([K24, K8, K5].map((f) => klassaTraktFeature(f.properties).kategori)).toEqual(['hansyn', 'hansyn', 'hansyn']);
    expect([K71A, K71B].map((f) => klassaTraktFeature(f.properties))).toEqual([{ kategori: 'ovrigt', kalla: 'Vida' }, { kategori: 'ovrigt', kalla: 'Vida' }]);
  });
});

describe('inget zonlarm, ingen fällningscirkel', () => {
  it('vidaSlag: 71 ger inget larmslag; 24/8/5 ger hansynsyta', () => {
    expect(FEATURES.map((f) => vidaSlag(f.properties, f.geometry.type))).toEqual(['hansynsyta', 'hansynsyta', 'hansynsyta', null, null]);
  });
  it('Hålabäck: inne i Övrigt (71) → inga larmobjekt, inget kort, inget ljud', () => {
    const o = vidaObjekt(FC, pos(900));
    expect(o.map((x) => x.id)).not.toContain('vida:L_TILLAGGSYTOR:3');
    const u = stegaLarm({ objekt: o, kvitt: new Map(), forareId: 'A', state: TOMT_LARM });
    expect(u.kort).toBeNull(); expect(u.ljud).toBeNull(); expect(u.settRad).toBeNull(); expect(u.ringar).toEqual([]);
  });
  it('Hålabäck: inne i Kant mot vatten (24) larmar som förut: förbjuden yta, Natur', () => {
    const u = stegaLarm({ objekt: vidaObjekt(FC, pos(0)), kvitt: new Map(), forareId: 'A', state: TOMT_LARM });
    expect(u.kort).toMatchObject({ namn: 'Hänsyn', forbjuden: true, grupp: 'natur' });
  });
  it('fällningscirkeln räknar inte Övrigt som hänsyn (men 24 gör det)', () => {
    const svg = (x: number, y: number) => ({ lat: y, lon: x });
    const nara71 = bedomFallning(fallningKandidater({ pos: pos(900), markers: [], svgToLatLon: svg, vida: FC }));
    expect(nara71.grupp).toBeNull();
    const nara24 = bedomFallning(fallningKandidater({ pos: pos(0), markers: [], svgToLatLon: svg, vida: FC }));
    expect(nara24.grupp).toBe('natur');
  });
});

describe('kartan: Övrigt ritas i egna lager, hänsynslagren tar inte 71', () => {
  const ritas = (filter: unknown[], f: any) => featureFilter(filter as any).filter({ zoom: 0 }, f);
  it('hänsynslagren (grön, snedstreckad) ritar 24/8/5 men inte 71', () => {
    expect(FEATURES.map((f) => ritas(HANSYNSYTA_FILTER, f))).toEqual([true, true, true, false, false]);
  });
  it('Övrigt-lagren ritar bara 71', () => {
    expect(FEATURES.map((f) => ritas(OVRIGT_YTA_FILTER, f))).toEqual([false, false, false, true, true]);
  });
  it('en tilläggsyta utan kod och med kod som tal hanteras (71 som tal är Övrigt)', () => {
    const utanKod = { type: 'Feature', geometry: K24.geometry, properties: { _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR' } };
    const talKod = { type: 'Feature', geometry: K24.geometry, properties: { _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR', TYP: 71 } };
    expect([ritas(HANSYNSYTA_FILTER, utanKod), ritas(OVRIGT_YTA_FILTER, utanKod)]).toEqual([true, false]);
    expect([ritas(HANSYNSYTA_FILTER, talKod), ritas(OVRIGT_YTA_FILTER, talKod)]).toEqual([false, true]);
  });
  it('traktgräns, linjer och punkter ritas av ingetdera', () => {
    const gr = { type: 'Feature', geometry: K24.geometry, properties: { _typ: 'traktgräns', _lager: 'L_TRAKTDEL' } };
    expect([ritas(HANSYNSYTA_FILTER, gr), ritas(OVRIGT_YTA_FILTER, gr)]).toEqual([false, false]);
  });
  it('etiketten är "ÖVRIGT", inte "HÄNSYN"', () => {
    expect(VIDA_ETIKETT.ovrigt).toBe('ÖVRIGT');
    expect(VIDA_ETIKETT.hansynsyta).toBe('HÄNSYN');
  });
});

describe('kortet och nycklarna: Vidas ATGARD visas som förut', () => {
  it('kortet heter Övrigt, bär Vidas ATGARD som kommentar och har ingen hänsynsrubrik', () => {
    const k = byggTraktKort(K71A.properties);
    expect(k).toMatchObject({ kategori: 'ovrigt', rubrik: 'Övrigt 4', bricka: 'Övrigt 4', brickaGrupp: 'ovrigt', nr: '4', vidaKommentar: ATG71A.trim() });
  });
  it('nyckeln är oförändrad (hansyn:<LOPNR>): redan sparade kommentarer, foton och Sett hänger kvar', () => {
    expect(ytaNyckel(K71A.properties)).toBe('hansyn:4');
    expect(vidaNycklar(FEATURES)).toEqual(['hansyn:1', 'hansyn:2', 'hansyn:3', 'hansyn:4', 'hansyn:5']);
  });
  it('Vidas ATGARD på Övrigt säger något och är en instruktion (instruktionskortet som förut)', () => {
    expect(arInstruktionsText(K71A.properties.ATGARD, [K71A.properties.FLBESKR])).toBe(true);
  });
});

describe('räkningar och listor: Övrigt är inte hänsyn', () => {
  it('"Vad filen gav": hänsynsytorna är tre (24, 8, 5), inte fem', () => {
    expect(geometriSammanfattning(FC)?.hansyn).toMatchObject({ antal: 3 });
  });
  it('teckenförklaringen får inget "Hänsyn" av Övrigt, men av 24', () => {
    expect(vidaSlagIFeatures([K71A, K71B])).toEqual([]);
    expect(vidaSlagIFeatures([K24, K71A])).toEqual(['hansynsyta']);
  });
  it('Om trakten: Övrigt är en egen rad i gruppen ÖVRIGT, aldrig under Hänsyn', () => {
    const grupper = byggOmGrupper([], null, null, ['Övrigt', 'Övrigt']);
    expect(grupper.map((g) => g.grupp)).toEqual(['ovrigt']);
    expect(grupper[0].rader).toMatchObject([{ namn: 'Övrigt', antal: 2, grupp: 'ovrigt' }]);
  });
});
