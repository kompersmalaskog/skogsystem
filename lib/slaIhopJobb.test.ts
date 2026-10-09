import { describe, it, expect } from 'vitest';
import { slaIhopJobb, sammanfogaAnteckning, FLYTTA_TABELLER } from './slaIhopJobb';
import { skapaMinnesDb, type Rad } from './testStod/minnesDb';
import { kvadrat, spar } from './testStod/geometri';

// SLÅ IHOP: bevisas på SLUTTILLSTÅNDET i en minnesdatabas — vad finns kvar var — inte på vilka anrop som gjordes.
// Det viktiga: (1) allt hamnar på Vida-objektet, (2) P-objektet är borta, (3) ett fel mitt i lämnar P-objektet HELT kvar, (4) privata jobb rörs aldrig.

const LAT = 56.40, LNG = 14.90;
const NU = new Date('2026-10-09T12:00:00.000Z');

const jobbRad = (o: Rad = {}): Rad => ({
  id: 'p1', namn: 'Hållsta', vo_nummer: 'P-1018', ursprung: 'vanta_vida', kalla: 'starta-jobb', typ: 'slutavverkning', status: 'pagaende',
  pagaende_startad_timestamp: '2026-10-09T06:00:00.000Z', lat: LAT, lng: LNG, skordare_maskin_id: 'R64428', skotare_maskin_id: null,
  anteckningar: 'Stor tall vid stenmuren', info_anteckningar: null, dim_objekt_id: null, hor_till_objekt_id: null, ...o,
});
const vidaRad = (o: Rad = {}): Rad => ({
  id: 'v1', namn: 'Hållsta 2:7 RP -26', vo_nummer: '11260001', ursprung: null, kalla: 'trakt-import', typ: 'slutavverkning', status: 'planerad',
  lat: LAT, lng: LNG, skordare_maskin_id: null, skotare_maskin_id: null, anteckningar: null, info_anteckningar: null, dim_objekt_id: null, ...o,
});

function varld(extra: Record<string, Rad[]> = {}, jobb: Rad = {}, vida: Rad = {}) {
  const db = skapaMinnesDb({
    objekt: [jobbRad(jobb), vidaRad(vida)],
    objekt_geometri: [{ id: 'g1', objekt_id: 'v1', geometri: kvadrat(LAT, LNG, 0.003) }],
    hyttspar: [{ id: 'h1', objekt_id: 'p1', roll: 'skordare', datum: '2026-10-09', maskin_id: 'R64428', points: spar(LAT - 0.001, LNG - 0.001, 8), antal_punkter: 8 }],
    planering_markeringar: [{ id: 'm1', objekt_id: 'p1', marker_id: 'a' }, { id: 'm2', objekt_id: 'p1', marker_id: 'b' }, { id: 'm3', objekt_id: 'v1', marker_id: 'c' }],
    objekt_yta_anteckning: [{ id: 'a1', objekt_id: 'p1', yta_nyckel: 'omrade:1', text: 'Blött' }],
    objekt_yta_media: [{ id: 'f1', objekt_id: 'p1', yta_nyckel: 'omrade:1', url: 'https://x/yta/p1/foto.jpg' }],
    maskin_ko: [{ id: 'k1', objekt_id: 'p1', maskin_id: 'R64428' }],
    dim_objekt: [{ objekt_id: '85845', vo_nummer: 'P-1018', maskin_id: 'R64428' }, { objekt_id: 'A030353_1', vo_nummer: 'P-1018', maskin_id: 'A030353' }, { objekt_id: 'X', vo_nummer: '11111111', maskin_id: 'R64428' }],
    ...extra,
  });
  // Som FK:erna i prod: raderas P-objektet faller allt som FORTFARANDE hänger på det med (därför ska allt vara flyttat FÖRE raderingen).
  for (const t of ['hyttspar', 'planering_markeringar', 'objekt_yta_anteckning', 'objekt_yta_media', 'maskin_ko', 'egenkontroll', 'tma_assessments']) db.kaskad.push({ tabell: t, kol: 'objekt_id', ref: 'objekt' });
  return db;
}
const ids =(db: ReturnType<typeof varld>, t: string) => db.tabeller[t].map((r) => r.id).sort();

describe('slaIhopJobb — Ja flyttar allt och tar bort P-objektet', () => {
  it('hyttspår, markeringar, anteckningar, media, kö och tilldelning hamnar på Vida-objektet; P-objektet är borta', async () => {
    const db = varld();
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(true);
    expect(r.raderat).toBe(true);
    // P-objektet är borta, Vida-objektet kvar
    expect(ids(db, 'objekt')).toEqual(['v1']);
    // hyttspår
    expect(db.tabeller.hyttspar).toHaveLength(1);
    expect(db.tabeller.hyttspar[0]).toMatchObject({ id: 'h1', objekt_id: 'v1', roll: 'skordare' });
    expect(db.tabeller.hyttspar[0].points).toHaveLength(8);
    // markeringar: de två från jobbet + den som redan fanns
    expect(db.tabeller.planering_markeringar.map((x) => [x.id, x.objekt_id]).sort()).toEqual([['m1', 'v1'], ['m2', 'v1'], ['m3', 'v1']]);
    // anteckning + media + kö
    expect(db.tabeller.objekt_yta_anteckning[0].objekt_id).toBe('v1');
    expect(db.tabeller.objekt_yta_media[0]).toMatchObject({ objekt_id: 'v1', url: 'https://x/yta/p1/foto.jpg' });   // storage-URL:en oförändrad
    expect(db.tabeller.maskin_ko[0].objekt_id).toBe('v1');
    // maskindatans VO: bara raderna med P-numret byter, andra VO rörs inte
    expect(db.tabeller.dim_objekt.map((d) => [d.objekt_id, d.vo_nummer])).toEqual([['85845', '11260001'], ['A030353_1', '11260001'], ['X', '11111111']]);
    expect(r.dimUppdaterade).toBe(2);
    // sammanfattningen
    expect(r.hyttspar).toEqual({ flyttade: 1, sammanslagna: 0 });
    expect(r.flyttat['planering_markeringar.objekt_id']).toBe(2);
  });

  it('tilldelning + pågående + anteckningar följer med till Vida-objektet (det som redan är satt där vinner)', async () => {
    const db = varld({}, { skotare_maskin_id: 'A030353', info_anteckningar: 'Ring Stefan' }, { skordare_maskin_id: 'JD810E', anteckningar: 'Vidas anteckning' });
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(true);
    const v = db.tabeller.objekt[0];
    expect(v.skotare_maskin_id).toBe('A030353');          // saknades → från jobbet
    expect(v.skordare_maskin_id).toBe('JD810E');          // fanns → behålls (jobbets R64428 skriver INTE över)
    expect(v.status).toBe('pagaende');
    expect(v.pagaende_startad_timestamp).toBe('2026-10-09T06:00:00.000Z');
    expect(v.anteckningar).toBe('Vidas anteckning\n\n— Från P-1018 Hållsta:\nStor tall vid stenmuren');
    expect(v.info_anteckningar).toBe('Ring Stefan');
    expect(r.tilldelning).toEqual(['skotare_maskin_id']);
    expect(r.statusPagaende).toBe(true);
  });

  it('är Vida-objektet redan pågående eller avslutat ändras inte dess status', async () => {
    const db = varld({}, {}, { status: 'avslutat' });
    await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(db.tabeller.objekt[0].status).toBe('avslutat');
  });

  it('samma roll + dag på båda: punkterna slås ihop på EN rad (inga punkter tappas), jobbets rad tas bort', async () => {
    const mal = spar(LAT, LNG, 5, 0.0001, 0, '2026-10-09T05:00:00.000Z');
    const db = varld({ hyttspar: [
      { id: 'h1', objekt_id: 'p1', roll: 'skordare', datum: '2026-10-09', maskin_id: 'R64428', points: spar(LAT - 0.001, LNG, 6, 0.0001, 0, '2026-10-09T08:00:00.000Z'), antal_punkter: 6 },
      { id: 'hv', objekt_id: 'v1', roll: 'skordare', datum: '2026-10-09', maskin_id: 'A030353', points: mal, antal_punkter: 5 },
      { id: 'h2', objekt_id: 'p1', roll: 'skordare', datum: '2026-10-08', maskin_id: 'R64428', points: spar(LAT, LNG, 4), antal_punkter: 4 },
    ] });
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(true);
    expect(ids(db, 'hyttspar')).toEqual(['h2', 'hv']);
    const hv = db.tabeller.hyttspar.find((x) => x.id === 'hv')!;
    expect(hv.points).toHaveLength(11);
    expect(hv.antal_punkter).toBe(11);
    expect(db.tabeller.hyttspar.find((x) => x.id === 'h2')!.objekt_id).toBe('v1');   // andra dagen: raden bytte bara objekt
    expect(r.hyttspar).toEqual({ flyttade: 2, sammanslagna: 1 });
  });

  it('GROT-jobb som hörde till jobbet följer med till Vida-objektet', async () => {
    const db = varld({}, {});
    db.tabeller.objekt.push({ id: 'g9', namn: 'GROT', vo_nummer: 'P-1020', typ: 'grot', hor_till_objekt_id: 'p1' });
    await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(db.tabeller.objekt.find((o) => o.id === 'g9')!.hor_till_objekt_id).toBe('v1');
  });

  it('är idempotent mot ett halvfärdigt tillstånd: andra körningen efter ett avbrott fortsätter och blir klar', async () => {
    const db = varld();
    db.injiceraFel('objekt_yta_media.update', { message: 'connection reset', code: '08006' });
    const f = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(f.ok).toBe(false);
    expect(ids(db, 'objekt')).toEqual(['p1', 'v1']);                         // P-objektet KVAR
    expect(db.tabeller.hyttspar[0].objekt_id).toBe('v1');                      // men det som hann flyttas har flyttats
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(true);
    expect(ids(db, 'objekt')).toEqual(['v1']);
    expect(db.tabeller.objekt_yta_media[0].objekt_id).toBe('v1');
  });
});

describe('slaIhopJobb — vad som aldrig får hända', () => {
  const orort = (db: ReturnType<typeof varld>) => expect(db.skrivlogg).toEqual([]);

  it('PRIVAT jobb slås aldrig ihop — nekas före första skrivningen', async () => {
    const db = varld({}, { ursprung: 'privat' });
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(false);
    expect(r.fel).toContain('privata jobb');
    orort(db);
    expect(ids(db, 'objekt')).toEqual(['p1', 'v1']);
  });
  it('ett vanligt objekt (inget ursprung) kan inte slås bort', async () => {
    const db = varld({}, { ursprung: null });
    expect((await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU })).ok).toBe(false);
    orort(db);
  });
  it('målet måste vara ett riktigt Vida-objekt (inte ett annat P-jobb, inte ett märkt jobb)', async () => {
    for (const vida of [{ vo_nummer: 'P-1030' }, { ursprung: 'vanta_vida' }, { kalla: 'starta-jobb' }]) {
      const db = varld({}, {}, vida);
      expect((await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU })).ok).toBe(false);
      orort(db);
    }
  });
  it('Vida-objektets traktgräns täcker INTE jobbet → inget flyttas, inget raderas', async () => {
    const db = varld({ objekt_geometri: [{ id: 'g1', objekt_id: 'v1', geometri: kvadrat(LAT + 0.5, LNG, 0.003) }] });
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(false);
    expect(r.fel).toContain('täcker inte');
    orort(db);
  });
  it('Vida-objekt utan traktgräns kan inte täcka något → nekas', async () => {
    const db = varld({ objekt_geometri: [] });
    expect((await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU })).ok).toBe(false);
    orort(db);
  });
  it('samma objekt som både jobb och mål, och saknade id:n, nekas', async () => {
    const db = varld();
    expect((await slaIhopJobb(db as any, { franId: 'p1', tillId: 'p1' })).ok).toBe(false);
    expect((await slaIhopJobb(db as any, { franId: '', tillId: 'v1' })).ok).toBe(false);
    expect((await slaIhopJobb(db as any, { franId: 'finns-inte', tillId: 'v1' })).fel).toContain('finns inte');
    orort(db);
  });
  it('en egenkontroll som KROCKAR (målet har redan en) stoppar sammanslagningen — raderna får inte försvinna tyst med P-objektet', async () => {
    const db = varld({ egenkontroll: [{ id: 'e1', objekt_id: 'p1', status: 'pagaende' }, { id: 'e2', objekt_id: 'v1', status: 'pagaende' }] });
    (db as any).unika.egenkontroll = [['objekt_id']];
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(false);
    expect(r.fel).toContain('egenkontroll');
    expect(ids(db, 'objekt')).toEqual(['p1', 'v1']);
    expect(db.tabeller.egenkontroll.find((e) => e.id === 'e1')!.objekt_id).toBe('p1');
  });
  it('krock i en ICKE-blockerande tabell: målets rad vinner, krocken redovisas, sammanslagningen blir klar', async () => {
    const db = varld({ tma_assessments: [{ id: 't1', objekt_id: 'p1' }, { id: 't2', objekt_id: 'v1' }] });
    (db as any).unika.tma_assessments = [['objekt_id']];
    db.kaskad.push({ tabell: 'tma_assessments', kol: 'objekt_id', ref: 'objekt' });   // som FK:n i prod: ON DELETE CASCADE
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.krockar).toEqual(['tma_assessments.objekt_id']);
    expect(r.ok).toBe(true);
    expect(db.tabeller.tma_assessments.map((t) => t.id)).toEqual(['t2']);   // jobbets föll med P-objektet, målets kvar
  });
  it('en tabell som inte finns i databasen hoppas över och redovisas', async () => {
    const db = varld();
    for (const op of ['update', 'select']) db.injiceraFel(`brand_samrad.${op}`, { message: 'Could not find the table public.brand_samrad', code: 'PGRST205' }, { alltid: true });
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(true);
    expect(r.saknas).toEqual(['brand_samrad']);
  });
  it('en rad som INTE flyttades (skrivning som tyst träffade 0 rader, t.ex. en ny rad som hann komma) → verifieringen stoppar före radering', async () => {
    const db = varld();
    // en klient hinner skriva en ny markering på jobbet efter flytten men före kontrollen
    db.fore('planering_markeringar.select', () => { db.tabeller.planering_markeringar.push({ id: 'sen', objekt_id: 'p1', marker_id: 'z' }); });
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(false);
    expect(r.fel).toContain('planering_markeringar');
    expect(ids(db, 'objekt')).toEqual(['p1', 'v1']);
  });
  it('raderingen sist: nekas den (RLS/fel) är allt redan flyttat och felet säger det', async () => {
    const db = varld();
    db.injiceraFel('objekt.delete', { message: 'permission denied' });
    const r = await slaIhopJobb(db as any, { franId: 'p1', tillId: 'v1', nu: NU });
    expect(r.ok).toBe(false);
    expect(r.fel).toContain('Allt flyttades');
    expect(db.tabeller.hyttspar[0].objekt_id).toBe('v1');
    expect(r.raderat).toBe(false);
  });
});

describe('sammanfogaAnteckning', () => {
  it('bara en sida → den sidan; båda → målets först, jobbets under med rubrik; tomt → null', () => {
    expect(sammanfogaAnteckning(null, 'a', 'P-1')).toBe('a');
    expect(sammanfogaAnteckning('m', null, 'P-1')).toBe('m');
    expect(sammanfogaAnteckning('m', '  ', 'P-1')).toBe('m');
    expect(sammanfogaAnteckning('m', 'j', 'P-1 X')).toBe('m\n\n— Från P-1 X:\nj');
    expect(sammanfogaAnteckning(null, null, 'P-1')).toBeNull();
  });
});

describe('listan över flyttade tabeller', () => {
  it('täcker de operativa tabellerna med FK mot objekt.id i prod (hyttspar hanteras separat; geometri/väg-data/kvittering flyttas medvetet INTE)', () => {
    const t = new Set(FLYTTA_TABELLER.map(([a]) => a));
    for (const n of ['planering_markeringar', 'objekt_yta_anteckning', 'objekt_yta_media', 'avlagg_assessments', 'tma_assessments', 'brand_samrad', 'egenkontroll', 'skotning_uttag', 'skordarstrak', 'maskin_ko', 'maskin_flytt', 'gps_tracks']) expect(t.has(n)).toBe(true);
    for (const n of ['hyttspar', 'objekt_geometri', 'objekt_vagdata', 'objekt_kvittering']) expect(t.has(n)).toBe(false);
  });
});
