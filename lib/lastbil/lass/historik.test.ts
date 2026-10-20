import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDb } from './fakeDb';
import { koraHistoriskaLass, type HistorikRapport } from './historik';
import { historikTabell } from './historikText';

// Samma lass som kor.test.ts: Elefant/Giant hämtas vid Östra-Hoka (56,400 / 15,000) och lämnas vid Bågskyttebanan (56,500 / 15,100), 45 km.
const T0 = Date.parse('2026-10-12T06:00:00Z');
const MIN = 60_000;
const iso = (min: number) => new Date(T0 + min * MIN).toISOString();
const punkt = (min: number, vikt: number, lat: number, lng: number, odo: number, fart = 0) =>
  ({ vin: 'V1', tidpunkt: iso(min), lat, lng, hastighet: fart, odometer_m: odo, vikt: String(vikt) });

const LOGG = (fart0 = 0) => [
  punkt(0, 28_500, 56.40, 15.00, 300_000_000, fart0),
  punkt(10, 50_000, 56.40, 15.00, 300_000_000, fart0),
  punkt(20, 50_200, 56.40, 15.00, 300_000_000, fart0),
  punkt(40, 50_100, 56.45, 15.05, 300_022_000, 60),
  punkt(75, 28_700, 56.50, 15.10, 300_045_000),
  punkt(90, 28_600, 56.50, 15.10, 300_045_000),
];

/** Klockan: åtta dygn efter lasset. Intervallet 12–13 okt ligger då långt före cron-jobbets fönster (96 h). */
const NU = new Date('2026-10-20T10:00:00Z');
const ALT = { fran: '2026-10-12', till: '2026-10-13' };

const START = (fart0 = 0) => ({
  lastbil: [{ vin: 'V1', aktiv: true, hemmabas_lat: 56.0, hemmabas_lng: 14.0, hemmabas_radie_m: 300 }],
  lastbil_logg: LOGG(fart0),
  objekt: [
    { id: 'o-hoka', namn: 'Östra-Hoka 1:7', lat: 56.4003, lng: 15.0003, bolag: 'Vida', markagare: null, vo_nummer: '111' },
    { id: 'o-bagsk', namn: 'Bågskyttebanan RP', lat: 56.5002, lng: 15.1002, bolag: 'Vida', markagare: null, vo_nummer: '222' },
  ],
  flyttplats: [],
  dim_maskin: [
    { maskin_id: 'PONS', visningsnamn: 'Giant', aktiv_till: null },
    { maskin_id: 'A130743', visningsnamn: 'Elefant 26', aktiv_till: null },
    { maskin_id: 'R64428', visningsnamn: 'H8E -23', aktiv_till: null },
  ],
  lastbil_lass: [], maskin_flytt: [], fakt_lass: [], hyttspar: [], maskin_position: [], 'notis_kö': [],
});

const flytt = (o: Record<string, unknown> = {}) => ({
  id: 'f-1', maskin_id: 'R64428', extern_maskin: null, starttid: iso(8), hamtad_tid: iso(12), sluttid: iso(80), avbruten: false,
  fran_objekt_id: null, fran_plats_id: null, fran_lat: null, fran_lng: null, till_objekt_id: null, till_plats_id: null, till_lat: null, till_lng: null,
  fran_odometer_m: null, till_odometer_m: null, ...o,
});

/** Databasens fyll_flytt_ur_lass: fyller COALESCE-vis (bara tomma fält), som migrationen. */
function fyllHandler(d: FakeDb) {
  return ({ p_lass, p_flytt }: any) => {
    const l = d.rader('lastbil_lass').find(r => r.id === p_lass)!;
    const f = d.rader('maskin_flytt').find(r => r.id === p_flytt)!;
    f.fran_odometer_m ??= l.lassning_odometer_m;
    f.till_odometer_m ??= l.lossning_odometer_m;
    if (f.fran_objekt_id == null && f.fran_plats_id == null) { f.fran_objekt_id = l.fran_objekt_id; f.fran_plats_id = l.fran_plats_id; }
    Object.assign(l, { status: 'matchad_manuell', flytt_id: p_flytt });
    return { data: { ok: true }, error: null };
  };
}

function db(o: { foljerPons?: boolean; fart0?: number } = {}) {
  const d = new FakeDb(START(o.fart0 ?? 0));
  d.rpcHandlers.lastbil_maskin_foljer = ({ p_punkter }: any) => ({
    data: o.foljerPons ? p_punkter.map((_: any, idx: number) => ({ maskin_id: 'PONS', idx, dist_m: 15 })) : [],
    error: null,
  });
  d.rpcHandlers.lastbil_maskin_narvaro = () => ({ data: [], error: null });
  d.rpcHandlers.fyll_flytt_ur_lass = fyllHandler(d);
  // Om koden mot förmodan anropade den skulle det synas i anropen — handlern finns bara för att ett anrop inte ska gömmas av "rpc saknas".
  d.rpcHandlers.skapa_flytt_ur_lass = () => ({ data: { skapad: true, flytt_id: 'SKA-INTE-HÄNDA' }, error: null });
  return d;
}

const kor = (d: FakeDb, skriv: boolean, alt = ALT): Promise<HistorikRapport> => { d.klocka = NU.toISOString(); return koraHistoriskaLass(d, { ...alt, skriv, nu: NU }); };

const TILLATNA_RPC = ['lastbil_maskin_foljer', 'lastbil_maskin_narvaro', 'fyll_flytt_ur_lass'];

describe('koraHistoriskaLass — torrkörning (standard): hela kedjan, ingenting skrivs', () => {
  it('rapporterar lasset som en FRÅGA och skriver ingenting: inga upserts, inga updates, inget fyll', async () => {
    const d = db({ foljerPons: true });
    d.rader('maskin_flytt').push(flytt({ till_objekt_id: 'o-bagsk' }));
    const r = await kor(d, false);
    expect(r.fel).toEqual([]);
    expect(r.ok).toBe(true);
    expect(d.anrop.upserts).toEqual([]);
    expect(d.anrop.updates).toEqual([]);
    expect(d.anrop.rpc.map(x => x.namn).filter(n => !['lastbil_maskin_foljer', 'lastbil_maskin_narvaro'].includes(n))).toEqual([]);   // inte ens fyll_flytt_ur_lass
    expect(d.rader('lastbil_lass')).toHaveLength(0);
    expect(r.rader).toHaveLength(1);
    expect(r.rader[0]).toMatchObject({ utfall: 'matchad', fran: 'Östra-Hoka 1:7' });   // flytten finns (samma tid + plats): kopplas, men bara i skriv-läget
  });

  it('ett lass utan registrerad flytt: utfall fraga, förslaget med säkerhet, och tabellen i Summary visar det', async () => {
    const d = db({ foljerPons: true });
    const r = await kor(d, false);
    expect(r.rader[0]).toMatchObject({ utfall: 'fraga', forslag: 'PONS', forslagNamn: 'Giant', sakerhet: 'hog', fran: 'Östra-Hoka 1:7', till: 'Bågskyttebanan RP', km: 45 });
    expect(r.antal).toMatchObject({ fraga: 1, matchad: 0 });
    const tabell = historikTabell(r);
    expect(tabell).toContain('torrkörning');
    expect(tabell).toContain('Inget skrevs');
    expect(tabell).toContain('| 1 | 2026-10-12 | 08:10 → ');   // sommartid: 06:10 UTC = 08:10
    expect(tabell).toContain('Giant (hög)');
    expect(tabell).toContain('FRÅGA');
  });
});

describe('koraHistoriskaLass — skriv: ALLTID en fråga, aldrig en flytt, aldrig en push', () => {
  let d: FakeDb;
  beforeEach(() => { d = db({ foljerPons: true }); });

  it('HÖG maskin + säkra platser + kund (cron-jobbet hade skapat flytten själv) → ändå status vantar_maskin, förslaget förvalt', async () => {
    const r = await kor(d, true);
    expect(r.fel).toEqual([]);
    const rad = d.rader('lastbil_lass')[0];
    expect(rad).toMatchObject({ status: 'vantar_maskin', status_orsak: null, forslag_maskin_id: 'PONS', sakerhet: 'hog', kund: 'Vida' });
    expect(rad.flytt_id ?? null).toBeNull();
    expect(d.rader('lastbil_lass')).toHaveLength(1);
  });

  it('skapa_flytt_ur_lass anropas ALDRIG och notis_kö rörs ALDRIG (varken läst eller skriven)', async () => {
    await kor(d, true);
    expect(d.anrop.rpc.map(x => x.namn).filter(n => !TILLATNA_RPC.includes(n))).toEqual([]);
    expect(d.anrop.rpc.some(x => x.namn === 'skapa_flytt_ur_lass')).toBe(false);
    expect(d.anrop.tabeller).not.toContain('notis_kö');
    expect(d.anrop.upserts.every(u => u.tabell === 'lastbil_lass')).toBe(true);
    expect(d.anrop.updates).toEqual([]);
    expect(d.rader('notis_kö')).toHaveLength(0);
  });

  it('skapad_tid = LOSSNINGSTIDEN (inte nu) så cron-jobbets 24-timmarsloop aldrig plockar raden, och raden märks historisk', async () => {
    await kor(d, true);
    const rad = d.rader('lastbil_lass')[0];
    expect(rad.skapad_tid).toBe(rad.lossning_tid);
    expect(Date.parse(rad.skapad_tid as string)).toBeLessThan(NU.getTime() - 24 * 3_600_000);
    expect((rad.bevis as any).historisk).toBe(true);
    expect(rad.besvarad_av).toBeUndefined();
  });

  it('IDEMPOTENS: en andra (och tredje) körning skriver inget och ger ingen ny fråga', async () => {
    await kor(d, true);
    const r2 = await kor(d, true);
    const r3 = await kor(d, true);
    expect(d.rader('lastbil_lass')).toHaveLength(1);
    expect(r2.rader[0].utfall).toBe('finns_lass');
    expect(r3.rader[0].utfall).toBe('finns_lass');
    expect(r2.antal.fraga + r3.antal.fraga).toBe(0);
  });

  it('ett lass som cron-jobbet redan skrivit (överlappande tid) hoppas över', async () => {
    d.rader('lastbil_lass').push({ id: 'gammalt', vin: 'V1', forsta_lastad_tid: iso(12), sista_lastad_tid: iso(40), status: 'vantar_maskin', flytt_id: null });
    const r = await kor(d, true);
    expect(r.rader[0]).toMatchObject({ utfall: 'finns_lass' });
    expect(d.rader('lastbil_lass')).toHaveLength(1);
  });

  it('inget Hög-bevis: lasset blir ändå en fråga (orsak sakerhet), utan förslag', async () => {
    const d2 = db({ foljerPons: false });
    await kor(d2, true);
    expect(d2.rader('lastbil_lass')[0]).toMatchObject({ status: 'vantar_maskin', status_orsak: 'sakerhet', forslag_maskin_id: null });
  });

  it('avvisade lass (enstaka mätning) lagras inte, men syns i rapporten', async () => {
    const d2 = db();
    d2.rader('lastbil_logg').splice(0, d2.rader('lastbil_logg').length,
      punkt(0, 28_500, 56.40, 15.00, 300_000_000), punkt(10, 36_000, 56.40, 15.00, 300_000_000), punkt(40, 28_700, 56.50, 15.10, 300_045_000));
    const r = await kor(d2, true);
    expect(r.rader[0]).toMatchObject({ utfall: 'avvisad', orsak: 'enstaka_matning' });
    expect(d2.rader('lastbil_lass')).toHaveLength(0);
  });
});

describe('koraHistoriskaLass — förarens registrerade flytt (tid + plats)', () => {
  it('samma tid och samma plats → INGEN fråga: lasset kopplas till flytten (matchad_manuell) och fyll_flytt_ur_lass fyller de TOMMA fälten', async () => {
    const d = db({ foljerPons: true });
    d.rader('maskin_flytt').push(flytt({ till_objekt_id: 'o-bagsk' }));
    const r = await kor(d, true);
    expect(r.fel).toEqual([]);
    expect(r.antal).toMatchObject({ matchad: 1, fraga: 0 });
    expect(r.rader[0].flytt).toMatchObject({ id: 'f-1', maskin: 'H8E -23', fyller: ['odometer vid lassning', 'odometer vid lossning', 'Från: Östra-Hoka 1:7'] });
    const rad = d.rader('lastbil_lass')[0];
    expect(rad).toMatchObject({ status: 'matchad_manuell', flytt_id: 'f-1', besvarad_av: 'matchad' });
    expect(rad.skapad_tid).toBe(rad.lossning_tid);
    expect((rad.bevis as any).historisk).toBe(true);
    expect(d.anrop.rpc.filter(x => x.namn === 'fyll_flytt_ur_lass')).toHaveLength(1);
    expect(d.anrop.rpc.some(x => x.namn === 'skapa_flytt_ur_lass')).toBe(false);
    const f = d.rader('maskin_flytt')[0];
    expect(f).toMatchObject({ fran_odometer_m: 300_000_000, till_odometer_m: 300_045_000, fran_objekt_id: 'o-hoka' });
    expect(r.fyllda).toBe(1);
  });

  it('BARA TOMMA FÄLT: det som redan finns på flytten (odometer, Från) rörs inte', async () => {
    const d = db();
    d.rader('maskin_flytt').push(flytt({ till_objekt_id: 'o-bagsk', fran_odometer_m: 7, fran_objekt_id: 'o-annat', till_odometer_m: null }));
    const r = await kor(d, true);
    expect(r.fel).toEqual([]);
    expect(r.rader[0].flytt!.fyller).toEqual(['odometer vid lossning']);
    expect(d.rader('maskin_flytt')[0]).toMatchObject({ fran_odometer_m: 7, fran_objekt_id: 'o-annat', till_odometer_m: 300_045_000 });
  });

  it('SKYDD: skulle databasen skriva över något som fanns, larmas det (läses tillbaka och jämförs)', async () => {
    const d = db();
    d.rader('maskin_flytt').push(flytt({ till_objekt_id: 'o-bagsk', fran_odometer_m: 7 }));
    d.rpcHandlers.fyll_flytt_ur_lass = ({ p_lass, p_flytt }: any) => {   // en trasig funktion som skriver över
      d.rader('maskin_flytt').find(x => x.id === p_flytt)!.fran_odometer_m = 999;
      d.rader('lastbil_lass').find(x => x.id === p_lass)!.status = 'matchad_manuell';
      return { data: { ok: true }, error: null };
    };
    const r = await kor(d, true);
    expect(r.ok).toBe(false);
    expect(r.fel.join(' ')).toContain('fran_odometer_m ändrades');
  });

  it('Från fylls BARA när platsen är säker: bilen stod inte stilla vid lastningen → Från lämnas tom och rapporten säger det', async () => {
    const d = db({ fart0: 60 });
    d.rader('maskin_flytt').push(flytt({ till_objekt_id: 'o-bagsk' }));
    const r = await kor(d, true);
    expect(r.fel).toEqual([]);
    expect(r.rader[0].flytt!.fyller).not.toContain('Från: Östra-Hoka 1:7');
    expect(r.rader[0].flytt!.franUtelamnad).toBe('Östra-Hoka 1:7');
    expect(d.rader('maskin_flytt')[0].fran_objekt_id).toBeNull();
    expect((d.rader('lastbil_lass')[0].bevis as any).fran_utelamnad).toBe(true);
    expect(historikTabell(r)).toContain('Från lämnas tom');
  });

  it('samma tid men ANNAN plats → en fråga som SÄGER att flytten finns (bevis.flytt_samma_tid), och ingenting fylls', async () => {
    const d = db({ foljerPons: true });
    d.rader('maskin_flytt').push(flytt({ till_objekt_id: 'o-nagon-annan', fran_objekt_id: 'o-annat' }));
    const r = await kor(d, true);
    expect(r.rader[0]).toMatchObject({ utfall: 'fraga' });
    expect(r.rader[0].samtidigaText).toEqual(['En flytt med H8E -23 finns samma tid']);
    expect((d.rader('lastbil_lass')[0].bevis as any).flytt_samma_tid).toEqual([{ flytt_id: 'f-1', maskin_id: 'R64428', extern_maskin: null, avbruten: false, skal: 'annan_plats' }]);
    expect(d.anrop.rpc.some(x => x.namn === 'fyll_flytt_ur_lass')).toBe(false);
    expect(d.rader('maskin_flytt')[0].fran_odometer_m).toBeNull();
    expect(historikTabell(r)).toContain('En flytt med H8E -23 finns samma tid');
  });

  it('en AVBRUTEN flytt är ingen registrerad flytt: lasset blir en fråga, märkt "avbruten", och maskinen blir förslag (påbörjad flytt)', async () => {
    const d = db();
    d.rader('maskin_flytt').push(flytt({ id: 'f-avbr', maskin_id: 'A130743', avbruten: true, till_objekt_id: 'o-bagsk' }));
    const r = await kor(d, true);
    expect(r.rader[0]).toMatchObject({ utfall: 'fraga' });
    expect(r.rader[0].samtidigaText).toEqual(['En avbruten flytt med Elefant 26 finns samma tid']);
    expect((d.rader('lastbil_lass')[0].bevis as any).flytt_samma_tid[0]).toMatchObject({ flytt_id: 'f-avbr', avbruten: true, skal: 'avbruten' });
    expect(d.anrop.rpc.some(x => x.namn === 'fyll_flytt_ur_lass')).toBe(false);
  });

  it('en flytt som redan hör till ett annat lass matchas inte igen (en flytt = ett lass)', async () => {
    const d = db();
    d.rader('maskin_flytt').push(flytt({ till_objekt_id: 'o-bagsk' }));
    d.rader('lastbil_lass').push({ id: 'annat', vin: 'V1', forsta_lastad_tid: iso(-3000), sista_lastad_tid: iso(-2900), status: 'matchad_manuell', flytt_id: 'f-1' });
    const r = await kor(d, true);
    expect(r.rader[0].utfall).toBe('fraga');
    expect(d.anrop.rpc.some(x => x.namn === 'fyll_flytt_ur_lass')).toBe(false);
  });

  it('flytten ligger vid samma plats men en dag senare (ingen tidsöverlapp) → ingen koppling', async () => {
    const d = db();
    d.rader('maskin_flytt').push(flytt({ starttid: iso(60 * 24), hamtad_tid: iso(60 * 24 + 5), sluttid: iso(60 * 24 + 90), till_objekt_id: 'o-bagsk' }));
    const r = await kor(d, false);
    expect(r.rader[0].utfall).toBe('fraga');
    expect(r.rader[0].samtidiga).toEqual([]);
  });

  it('koordinaten räcker som "samma plats" när flytten saknar objekt-id (inom 2 km från lossningen)', async () => {
    const d = db();
    d.rader('maskin_flytt').push(flytt({ till_lat: 56.5008, till_lng: 15.1004 }));
    const r = await kor(d, false);
    expect(r.rader[0].utfall).toBe('matchad');
  });
});

describe('koraHistoriskaLass — skydd mot fel intervall och fel data', () => {
  it('ett intervall som når in i cron-jobbets fönster (senaste 96 h) vägras: de dagarna äger cron-jobbet', async () => {
    const d = db();
    const r = await kor(d, true, { fran: '2026-10-15', till: '2026-10-20' });
    expect(r.ok).toBe(false);
    expect(r.fel[0]).toMatch(/för nytt/);
    expect(d.anrop.upserts).toEqual([]);
  });

  it('ogiltiga datum eller till före fran vägras', async () => {
    const d = db();
    expect((await kor(d, false, { fran: '2026-10-13', till: '2026-10-12' })).ok).toBe(false);
    expect((await kor(d, false, { fran: 'igår', till: '2026-10-12' })).ok).toBe(false);
  });

  it('ett läsfel stoppar allt: inget skrivs på halva underlaget', async () => {
    const d = db({ foljerPons: true });
    d.lasFel.objekt = 'nätverksfel';
    const r = await kor(d, true);
    expect(r.ok).toBe(false);
    expect(r.fel.join(' ')).toContain('nätverksfel');
    expect(d.anrop.upserts).toEqual([]);
  });

  it('loggen läses i sidor om 1 000: 1 200 rader utan vikt före lasset ger samma lass', async () => {
    const d = db({ foljerPons: true });
    const fyllnad = Array.from({ length: 1200 }, (_, i) => ({ vin: 'V1', tidpunkt: new Date(T0 - 2 * 24 * 3_600_000 + i * 60_000).toISOString(), lat: 56.4, lng: 15.0, hastighet: 0, odometer_m: 1, vikt: null }));
    d.rader('lastbil_logg').push(...fyllnad);
    const r = await kor(d, false);
    expect(r.fel).toEqual([]);
    expect(r.rader).toHaveLength(1);
    expect(r.rader[0].km).toBe(45);
  });
});
