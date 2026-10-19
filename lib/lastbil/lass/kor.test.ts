import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDb } from './fakeDb';
import { koraLassdetektering as korRaw, NOTIS_FORDROJNING_MIN } from './kor';

/** Kör cron-cykeln "klockan nu" — och låter fake-databasen stämpla skapad_tid med samma klocka. */
const koraLassdetektering = (d: FakeDb, nu: Date) => { d.klocka = nu.toISOString(); return korRaw(d, nu); };

// Ett lass: Elefant 26 hämtas vid Östra-Hoka (56,400 / 15,000) och lämnas vid Bågskyttebanan (56,500 / 15,100), 45 km.
const T0 = Date.parse('2026-10-12T06:00:00Z');
const MIN = 60_000;
const iso = (min: number) => new Date(T0 + min * MIN).toISOString();

const punkt = (min: number, vikt: number, lat: number, lng: number, odo: number, fart = 0) =>
  ({ vin: 'V1', tidpunkt: iso(min), lat, lng, hastighet: fart, odometer_m: odo, vikt: String(vikt) });

const LOGG = [
  punkt(0, 28_500, 56.40, 15.00, 300_000_000),
  punkt(10, 50_000, 56.40, 15.00, 300_000_000),
  punkt(20, 50_200, 56.40, 15.00, 300_000_000),
  punkt(40, 50_100, 56.45, 15.05, 300_022_000, 60),
  punkt(75, 28_700, 56.50, 15.10, 300_045_000),
  punkt(90, 28_600, 56.50, 15.10, 300_045_000),
];

const START = () => ({
  lastbil: [{ vin: 'V1', aktiv: true, hemmabas_lat: 56.0, hemmabas_lng: 14.0, hemmabas_radie_m: 300 }],
  lastbil_logg: LOGG,
  objekt: [
    { id: 'o-hoka', namn: 'Östra-Hoka 1:7', lat: 56.4003, lng: 15.0003, bolag: 'Vida', markagare: null, vo_nummer: '111' },
    { id: 'o-bagsk', namn: 'Bågskyttebanan RP', lat: 56.5002, lng: 15.1002, bolag: 'Vida', markagare: null, vo_nummer: '222' },
  ],
  flyttplats: [],
  dim_maskin: [{ maskin_id: 'PONS', aktiv_till: null }, { maskin_id: 'A130743', aktiv_till: null }, { maskin_id: 'R64428', aktiv_till: '2020-01-01' }],
  lastbil_lass: [], lastbil_lass_state: [], maskin_flytt: [], flyttdag: [], fakt_lass: [], hyttspar: [], maskin_position: [],
  medarbetare: [
    { id: 'm', epost: 'martin.lindqvist@kompersmalaskog.com', aktiv: true },
    { id: 'j', epost: 'joacim.ringberg@kompersmalaskog.com', aktiv: true },
  ],
  push_subscriptions: [], 'notis_kö': [],
});

/** Klockan: 150 min efter T0 → 60 min efter sista lastade punkten + 15 min regeln uppfylld; lossning (≈ 75 min) låg 75 min före. */
const NU_TIDIGT = new Date(T0 + 100 * MIN);
const NU_SENT = new Date(T0 + (75 + NOTIS_FORDROJNING_MIN + 10) * MIN);

function db(o: { foljerPons?: boolean } = {}) {
  const d = new FakeDb(START());
  d.rpcHandlers.lastbil_maskin_foljer = ({ p_punkter }: any) => ({
    data: o.foljerPons ? p_punkter.map((_: any, idx: number) => ({ maskin_id: 'PONS', idx, dist_m: 15 })) : [],
    error: null,
  });
  d.rpcHandlers.lastbil_maskin_narvaro = () => ({ data: [], error: null });
  d.rpcHandlers.skapa_flytt_ur_lass = ({ p_lass }: any) => {
    const l = d.rader('lastbil_lass').find(r => r.id === p_lass)!;
    Object.assign(l, { status: 'auto_flytt', flytt_id: 'flytt-ny' });
    return { data: { skapad: true, flytt_id: 'flytt-ny' }, error: null };
  };
  d.rpcHandlers.fyll_flytt_ur_lass = () => ({ data: { ok: true }, error: null });
  return d;
}

describe('koraLassdetektering — hela kedjan med en fake-databas', () => {
  let d: FakeDb;
  beforeEach(() => { d = db({ foljerPons: true }); });

  it('HÖG (maskinens GPS följde bilen) + säkra platser + kund → flytten skapas av sig själv, ingen notis', async () => {
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r.fel).toEqual([]);
    expect(r).toMatchObject({ nya: 1, auto: 1, vantar: 0, notiser: 0 });
    const skapa = d.anrop.rpc.filter(x => x.namn === 'skapa_flytt_ur_lass');
    expect(skapa).toHaveLength(1);
    expect(skapa[0].args).toMatchObject({ p_maskin_id: 'PONS', p_extern_maskin: null, p_av: 'auto' });
    const rad = d.rader('lastbil_lass')[0];
    expect((rad.bevis as any).km_osaker).toBe(false);
    expect(rad).toMatchObject({ fran_namn: 'Östra-Hoka 1:7', till_namn: 'Bågskyttebanan RP', km: 45, sakerhet: 'hog', forslag_maskin_id: 'PONS', kund: 'Vida', status: 'auto_flytt' });
    expect(d.rader('notis_kö')).toHaveLength(0);
  });

  it('IDEMPOTENS: andra körningen (och den tredje) skapar varken ett nytt lass eller en ny flytt', async () => {
    await koraLassdetektering(d, NU_SENT);
    const r2 = await koraLassdetektering(d, new Date(NU_SENT.getTime() + 5 * MIN));
    const r3 = await koraLassdetektering(d, new Date(NU_SENT.getTime() + 10 * MIN));
    expect(r2.nya).toBe(0); expect(r3.nya).toBe(0);
    expect(d.rader('lastbil_lass')).toHaveLength(1);
    expect(d.anrop.rpc.filter(x => x.namn === 'skapa_flytt_ur_lass')).toHaveLength(1);
  });

  it('pulsen skrivs VARJE cykel (också när inget händer) — svaret på "körs cron:en?"', async () => {
    await koraLassdetektering(d, NU_SENT);
    const s1 = d.rader('lastbil_lass_state')[0];
    expect(s1.senast_kord).toBe(NU_SENT.toISOString());
    expect(s1.senaste_logg_tid).toBe(iso(90));
    const senare = new Date(NU_SENT.getTime() + 5 * MIN);
    await koraLassdetektering(d, senare);
    expect(d.rader('lastbil_lass_state')).toHaveLength(1);
    expect(d.rader('lastbil_lass_state')[0].senast_kord).toBe(senare.toISOString());
  });

  it('DUBBLETT MOT MANUELL REGISTRERING: förarens flytt finns → matchad_manuell, ingen ny flytt, lasset fyller i saknade uppgifter', async () => {
    d.rader('maskin_flytt').push({ id: 'f-foraren', maskin_id: 'A130743', extern_maskin: null, starttid: iso(8), hamtad_tid: iso(12), sluttid: iso(80), avbruten: false });
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r).toMatchObject({ nya: 1, matchade: 1, auto: 0 });
    expect(d.anrop.rpc.filter(x => x.namn === 'skapa_flytt_ur_lass')).toHaveLength(0);
    expect(d.anrop.rpc.find(x => x.namn === 'fyll_flytt_ur_lass')?.args).toMatchObject({ p_flytt: 'f-foraren' });
    expect(d.rader('lastbil_lass')[0]).toMatchObject({ status: 'matchad_manuell', flytt_id: 'f-foraren', besvarad_av: 'matchad' });
  });

  it('en flytt som redan hör till ett annat lass matchas inte igen', async () => {
    d.rader('maskin_flytt').push({ id: 'f-annan', maskin_id: 'A130743', extern_maskin: null, starttid: iso(8), hamtad_tid: iso(12), sluttid: iso(80), avbruten: false });
    d.rader('lastbil_lass').push({ id: 'gammalt', vin: 'V1', flytt_id: 'f-annan', skapad_tid: iso(-2000), forsta_lastad_tid: iso(-3000), sista_lastad_tid: iso(-2900), status: 'auto_flytt' });
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r.matchade).toBe(0);
  });

  it('SAKNAD KUND: Hög maskin men traktens bolag saknas → ingen flytt, lasset väntar med orsaken kund_saknas', async () => {
    d.rader('objekt').find(o => o.id === 'o-bagsk')!.bolag = null;
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r).toMatchObject({ nya: 1, auto: 0, vantar: 1 });
    expect(d.anrop.rpc.filter(x => x.namn === 'skapa_flytt_ur_lass')).toHaveLength(0);
    expect(d.rader('lastbil_lass')[0]).toMatchObject({ status: 'vantar_maskin', status_orsak: 'kund_saknas', forslag_maskin_id: 'PONS', kund: null });
  });

  it('INTE klart: bilen är fortfarande lastad → inget skrivs', async () => {
    d.tabeller.lastbil_logg = LOGG.slice(0, 4);
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r).toMatchObject({ nya: 0, oavslutade: 1 });
    expect(d.rader('lastbil_lass')).toHaveLength(0);
  });

  it('inte klart förrän 15 minuter gått efter sista lastade punkten (annars kan en falsk tom ge två lass)', async () => {
    const r = await koraLassdetektering(d, new Date(T0 + 50 * MIN));
    expect(r.nya).toBe(0);
  });

  it('en lastad period utan tom punkt före i fönstret räknas inte (okänd start)', async () => {
    d.tabeller.lastbil_logg = LOGG.slice(1);
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r.nya).toBe(0);
  });

  it('inga viktpunkter ≥ 33 t → ingen onödig läsning av trakter och maskiner', async () => {
    d.tabeller.lastbil_logg = [LOGG[0], LOGG[4], LOGG[5]];
    d.lasFel.objekt = 'ska inte läsas';
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r.fel).toEqual([]);
    expect(r.nya).toBe(0);
  });

  it('en avvisad enstaka mätning sparas som avvisad — och väcker ingen fråga', async () => {
    d.tabeller.lastbil_logg = [LOGG[0], punkt(10, 39_000, 56.4, 15.0, 300_000_000, 50), punkt(30, 28_600, 56.45, 15.05, 300_020_000)];
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r).toMatchObject({ nya: 1, avvisade: 1, auto: 0, vantar: 0, notiser: 0 });
    expect(d.rader('lastbil_lass')[0]).toMatchObject({ status: 'avvisad', status_orsak: 'enstaka_matning' });
  });
});

describe('frågan "Vilken maskin?" — vem, när, och när inte', () => {
  let d: FakeDb;
  beforeEach(() => { d = db({ foljerPons: false }); });   // inget GPS-spår → Okänd

  it('lass utan spår → vantar_maskin, men INGEN notis förrän maskinspåren hunnit komma (2 timmar)', async () => {
    const r = await koraLassdetektering(d, NU_TIDIGT);
    expect(r).toMatchObject({ nya: 1, auto: 0, vantar: 1, notiser: 0 });
    expect(d.rader('notis_kö')).toHaveLength(0);
    expect(d.rader('lastbil_lass')[0]).toMatchObject({ status: 'vantar_maskin', status_orsak: 'sakerhet', sakerhet: 'okand' });
  });

  it('efter fördröjningen går frågan ut — till BÅDA när ingen varit inne i appen, köad med skickas_at "infinity"', async () => {
    await koraLassdetektering(d, NU_TIDIGT);
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r.notiser).toBe(2);
    const koade = d.rader('notis_kö');
    expect(koade.map(n => n.mottagare_id).sort()).toEqual(['j', 'm']);
    expect(koade[0]).toMatchObject({ typ: 'lass_maskin', skickas_at: 'infinity', dedup_nyckel: d.rader('lastbil_lass')[0].id });
    expect(koade[0].payload).toEqual({ lass_id: d.rader('lastbil_lass')[0].id });
  });

  it('bara den som var inne i appen under rundan får frågan', async () => {
    d.rader('push_subscriptions').push({ medarbetare_id: 'j', senast_oppnad: iso(30) }, { medarbetare_id: 'm', senast_oppnad: '2026-10-01T08:00:00Z' });
    await koraLassdetektering(d, NU_TIDIGT);
    await koraLassdetektering(d, NU_SENT);
    expect(d.rader('notis_kö').map(n => n.mottagare_id)).toEqual(['j']);
  });

  it('samma fråga köas aldrig två gånger (varje cykel försöker, dedup stoppar)', async () => {
    await koraLassdetektering(d, NU_TIDIGT);
    await koraLassdetektering(d, NU_SENT);
    await koraLassdetektering(d, new Date(NU_SENT.getTime() + 5 * MIN));
    await koraLassdetektering(d, new Date(NU_SENT.getTime() + 10 * MIN));
    expect(d.rader('notis_kö')).toHaveLength(2);
  });

  it('kommer maskinens GPS-spår efter första körningen och lasset blir Hög → flytten skapas, ingen fråga', async () => {
    await koraLassdetektering(d, NU_TIDIGT);
    d.rpcHandlers.lastbil_maskin_foljer = ({ p_punkter }: any) => ({ data: p_punkter.map((_: any, idx: number) => ({ maskin_id: 'PONS', idx, dist_m: 12 })), error: null });
    const r = await koraLassdetektering(d, new Date(NU_TIDIGT.getTime() + 30 * MIN));
    expect(r).toMatchObject({ nya: 0, omvarderade: 1, auto: 1 });
    expect(d.anrop.rpc.filter(x => x.namn === 'skapa_flytt_ur_lass')).toHaveLength(1);
    expect(d.rader('notis_kö')).toHaveLength(0);
    expect(d.rader('lastbil_lass')[0]).toMatchObject({ status: 'auto_flytt', sakerhet: 'hog' });
  });

  it('ett lass som någon hunnit besvara utvärderas inte om', async () => {
    await koraLassdetektering(d, NU_TIDIGT);
    d.rader('lastbil_lass')[0].status = 'auto_flytt';
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r.omvarderade).toBe(0);
    expect(d.rader('notis_kö')).toHaveLength(0);
  });

  it('efter 24 timmar utvärderas lasset inte om och frågan köas inte på nytt', async () => {
    await koraLassdetektering(d, NU_TIDIGT);
    const r = await koraLassdetektering(d, new Date(T0 + 40 * 60 * MIN));
    expect(r.omvarderade).toBe(0);
  });
});

describe('fel — kraschar aldrig, och fel göms inte', () => {
  it('skapa_flytt_ur_lass faller → lasset stannar som vantar_maskin med orsaken, felet rapporteras, frågan går ut', async () => {
    const d = db({ foljerPons: true });
    d.rpcHandlers.skapa_flytt_ur_lass = () => ({ data: null, error: { message: 'Välj kund — flytten faktureras' } });
    await koraLassdetektering(d, NU_TIDIGT);
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r.ok).toBe(false);
    expect(r.fel.join(' ')).toContain('Välj kund');
    expect(d.rader('lastbil_lass')[0]).toMatchObject({ status: 'vantar_maskin', status_orsak: 'auto_misslyckades' });
    expect(d.rader('notis_kö').length).toBeGreaterThan(0);
  });

  it('läsfel på lastbil_logg → ok:false med klartext, ingen skrivning, pulsen skrivs ändå', async () => {
    const d = db();
    d.lasFel.lastbil_logg = 'connection reset';
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r.ok).toBe(false);
    expect(r.fel.join(' ')).toContain('connection reset');
    expect(d.rader('lastbil_lass')).toHaveLength(0);
    expect(d.rader('lastbil_lass_state')).toHaveLength(1);
  });

  it('läsfel på trakterna → ingen utvärdering (en halv kandidatlista ger fel Från/Till)', async () => {
    const d = db({ foljerPons: true });
    d.lasFel.objekt = 'timeout';
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r.ok).toBe(false);
    expect(d.rader('lastbil_lass')).toHaveLength(0);
  });

  it('ingen aktiv lastbil → inget görs, inget kraschar', async () => {
    const d = db();
    d.tabeller.lastbil = [];
    const r = await koraLassdetektering(d, NU_SENT);
    expect(r).toMatchObject({ ok: true, vin: null, nya: 0 });
  });
});
