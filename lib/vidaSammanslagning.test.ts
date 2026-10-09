import { describe, it, expect } from 'vitest';
import {
  arVantaVidaJobb, arVidaObjekt, traktTackerJobb, hittaSlaIhopForslag, forslagText, SPAR_ANDEL_MIN, SPAR_PUNKTER_MIN,
  type JobbForSla, type VidaObjektForSla, type SparPunkt,
} from './vidaSammanslagning';
import { kvadrat, spar } from './testStod/geometri';

// FÖRSLAGET "P-1018 har fått Vida-objekt X — slå ihop?": bara för jobb som väntar på Vida, bara mot riktiga Vida-objekt vars traktgräns täcker
// jobbets position eller hyttspår. Privata jobb frågas ALDRIG.

const LAT = 56.40, LNG = 14.90;
const jobb = (o: Partial<JobbForSla> = {}): JobbForSla => ({ id: 'j1', namn: 'Hållsta', vo_nummer: 'P-1018', ursprung: 'vanta_vida', lat: LAT, lng: LNG, ...o });
const vida = (o: Partial<VidaObjektForSla> = {}): VidaObjektForSla => ({ id: 'v1', namn: 'Hållsta 2:7 RP -26', vo_nummer: '11260001', kalla: 'trakt-import', ursprung: null, geometri: kvadrat(LAT, LNG, 0.003), lat: LAT, lng: LNG, ...o });
const inga = new Map<string, SparPunkt[]>();

describe('vilka som kommer i fråga', () => {
  it('jobbet: ursprung vanta_vida OCH P-VO — privat, vanligt objekt och P-VO utan märkning kommer aldrig i fråga', () => {
    expect(arVantaVidaJobb(jobb())).toBe(true);
    expect(arVantaVidaJobb(jobb({ ursprung: 'privat' }))).toBe(false);
    expect(arVantaVidaJobb(jobb({ ursprung: null }))).toBe(false);
    expect(arVantaVidaJobb(jobb({ vo_nummer: '11260001' }))).toBe(false);
    expect(arVantaVidaJobb(null)).toBe(false);
  });
  it('Vida-objektet: riktigt VO, inte märkt, inte ett Starta jobb-jobb', () => {
    expect(arVidaObjekt(vida())).toBe(true);
    expect(arVidaObjekt(vida({ vo_nummer: 'P-1020' }))).toBe(false);
    expect(arVidaObjekt(vida({ ursprung: 'vanta_vida' }))).toBe(false);
    expect(arVidaObjekt(vida({ ursprung: 'privat' }))).toBe(false);
    expect(arVidaObjekt(vida({ kalla: 'starta-jobb' }))).toBe(false);
    expect(arVidaObjekt(vida({ vo_nummer: '' }))).toBe(false);
  });
});

describe('traktTackerJobb', () => {
  const g = kvadrat(LAT, LNG, 0.003);
  it('jobbets position inne i gränsen → träff (orsak position)', () => {
    expect(traktTackerJobb(g, { lat: LAT, lng: LNG }, [])).toMatchObject({ tacker: true, orsak: 'position' });
  });
  it('jobbets position utanför och inget spår → ingen träff', () => {
    expect(traktTackerJobb(g, { lat: LAT + 0.05, lng: LNG }, [])).toMatchObject({ tacker: false, orsak: null });
    expect(traktTackerJobb(g, { lat: null, lng: null }, [])).toMatchObject({ tacker: false });
  });
  it('hyttspår: minst hälften och minst 3 punkter inne → träff (orsak hyttspar), även om jobbets egen punkt ligger utanför', () => {
    const inne = spar(LAT - 0.001, LNG - 0.001, 8);          // ligger inne
    const ute = spar(LAT + 0.1, LNG, 4);                      // ute
    expect(traktTackerJobb(g, { lat: LAT + 0.2, lng: LNG }, [...inne, ...ute])).toMatchObject({ tacker: true, orsak: 'hyttspar' });
    expect(SPAR_ANDEL_MIN).toBe(0.5);
    expect(SPAR_PUNKTER_MIN).toBe(3);
  });
  it('ett spår som bara PASSERAR (under hälften inne) räknas inte; två punkter inne räcker inte', () => {
    const passerar = [...spar(LAT, LNG, 3), ...spar(LAT + 0.1, LNG, 10)];
    expect(traktTackerJobb(g, { lat: LAT + 0.2, lng: LNG }, passerar).tacker).toBe(false);
    expect(traktTackerJobb(g, { lat: LAT + 0.2, lng: LNG }, spar(LAT, LNG, 2)).tacker).toBe(false);
  });
});

describe('hittaSlaIhopForslag', () => {
  it('väntar på Vida + Vida-objekt över samma plats → ETT förslag', () => {
    const f = hittaSlaIhopForslag({ jobb: [jobb()], vida: [vida()], sparPerJobb: inga });
    expect(f).toEqual([{ jobbId: 'j1', vidaId: 'v1', orsak: 'position', andelSpar: null }]);
  });
  it('PRIVAT jobb + samma Vida-objekt över samma plats → INGET förslag', () => {
    expect(hittaSlaIhopForslag({ jobb: [jobb({ ursprung: 'privat' })], vida: [vida()], sparPerJobb: inga })).toEqual([]);
  });
  it('Vida-objekt som inte täcker platsen → inget förslag', () => {
    expect(hittaSlaIhopForslag({ jobb: [jobb()], vida: [vida({ geometri: kvadrat(LAT + 0.5, LNG, 0.003) })], sparPerJobb: inga })).toEqual([]);
  });
  it('Vida-objekt utan traktgräns kan inte täcka något → inget förslag', () => {
    expect(hittaSlaIhopForslag({ jobb: [jobb()], vida: [vida({ geometri: null })], sparPerJobb: inga })).toEqual([]);
  });
  it('avvisat par kommer inte tillbaka; ett annat Vida-objekt över samma plats gör det', () => {
    const a = vida({ id: 'v1' }), b = vida({ id: 'v2', namn: 'Annat' });
    expect(hittaSlaIhopForslag({ jobb: [jobb({ sla_ihop_avvisade: ['v1'] })], vida: [a], sparPerJobb: inga })).toEqual([]);
    expect(hittaSlaIhopForslag({ jobb: [jobb({ sla_ihop_avvisade: ['v1'] })], vida: [a, b], sparPerJobb: inga }).map((x) => x.vidaId)).toEqual(['v2']);
  });
  it('flera träffar: hyttspår slår bara position; sedan störst andel av spåret inne; sedan närmast', () => {
    const sp = new Map<string, SparPunkt[]>([['j1', spar(LAT, LNG, 10)]]);
    const bara = vida({ id: 'bara-position', geometri: kvadrat(LAT, LNG, 0.003) });
    const t = hittaSlaIhopForslag({ jobb: [jobb()], vida: [bara], sparPerJobb: inga });
    expect(t[0].orsak).toBe('position');
    const bådaTäcker = hittaSlaIhopForslag({ jobb: [jobb()], vida: [bara, vida({ id: 'v-spar', geometri: kvadrat(LAT + 0.001, LNG + 0.0005, 0.004) })], sparPerJobb: sp });
    expect(bådaTäcker).toHaveLength(1);
    expect(bådaTäcker[0].orsak).toBe('hyttspar');
  });
  it('flera jobb → ett förslag per jobb; ett jobb utan träff utelämnas', () => {
    const j2 = jobb({ id: 'j2', vo_nummer: 'P-1019', lat: LAT + 0.5 });
    const f = hittaSlaIhopForslag({ jobb: [jobb(), j2], vida: [vida()], sparPerJobb: inga });
    expect(f.map((x) => x.jobbId)).toEqual(['j1']);
  });
  it('förslagstexten', () => {
    expect(forslagText({ vo_nummer: 'P-1018', namn: 'Hållsta' }, { namn: 'Hållsta 2:7 RP -26', vo_nummer: '11260001' })).toBe('P-1018 har fått Vida-objekt Hållsta 2:7 RP -26 — slå ihop?');
  });
});
