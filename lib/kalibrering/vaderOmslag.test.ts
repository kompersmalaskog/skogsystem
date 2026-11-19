import { beforeEach, describe, expect, it } from 'vitest';
import { _tomSmhiObsCache, narmasteStationer, slaIhopObs, tolkaObservationer, tolkaStationer, type TempObs } from '@/lib/smhi-obs';
import { OMSLAG_MIN_GRADER, medelTemp, omslagText, vaderKlass, vaderLage, vaderRad } from './vaderOmslag';
import { byggVaderNotis, dagsAttKollaVader, iMorgonfonstret, koaVaderOmslag, lasVaderLage, vaderDedup } from './vaderServer';

const TIM = 3_600_000;
const nu = Date.parse('2026-11-18T10:00:00Z');
const kontroll = Date.parse('2026-11-16T09:00:00Z');
/** Timvärden: `fore` grader fram till och med kontrollen + 1 h, sedan `efter`. */
const serie = (fore: number, efter: number): TempObs[] => {
  const ut: TempObs[] = [];
  for (let ms = kontroll - 24 * TIM; ms <= nu; ms += TIM) ut.push({ ms, temp: ms <= kontroll + TIM ? fore : efter });
  return ut;
};

describe('regeln', () => {
  it('lägen: över 0 varmt, 0 till −7 fruset, −7 och under kallt', () => {
    expect(vaderKlass(0.1)).toBe('varmt');
    expect(vaderKlass(0)).toBe('fruset');
    expect(vaderKlass(-6.9)).toBe('fruset');
    expect(vaderKlass(-7)).toBe('kallt');
  });
  it('snitt kräver minst tre värden — en timme är ingen temperatur', () => {
    expect(medelTemp([{ ms: 1, temp: -5 }], 0, 10)).toBeNull();
    expect(medelTemp([{ ms: 1, temp: -6 }, { ms: 2, temp: -4 }, { ms: 3, temp: -5 }], 0, 10)).toBe(-5);
  });
  it('+3 vid kontrollen, −8 nu → omslag', () => {
    const l = vaderLage({ obs: serie(3, -8), kontrollMs: kontroll, kontrollTemp: null, nuMs: nu });
    expect(l).toMatchObject({ nu: -8, vidKontroll: 3, kalla: 'station', omslag: true });
    expect(omslagText('Giant', l, '16 nov')).toEqual({
      title: 'Gör en kontrollmätning · Giant',
      body: 'Vid senaste kontrollen 16 nov var det 3 °C, nu −8 °C – det har blivit sträng kyla. Kolla längd och diameter.',
    });
    expect(vaderRad(l)).toEqual({ varde: '−8 °C nu', under: '3 °C vid senaste kontrollen · gör en kontroll', orange: true });
  });
  it('svänger runt noll (+1 → −1) ger inget omslag — under 4 grader', () => {
    const l = vaderLage({ obs: serie(1, -1), kontrollMs: kontroll, kontrollTemp: null, nuMs: nu });
    expect(l.omslag).toBe(false);
    expect(Math.abs(-1 - 1)).toBeLessThan(OMSLAG_MIN_GRADER);
    expect(omslagText('Giant', l, null)).toBeNull();
    expect(vaderRad(l)).toMatchObject({ varde: '−1 °C nu', orange: false });
  });
  it('samma läge (−2 → −6) ger inget omslag även om skillnaden är stor', () => {
    expect(vaderLage({ obs: serie(-2, -6), kontrollMs: kontroll, kontrollTemp: null, nuMs: nu }).omslag).toBe(false);
  });
  it('kallt → plus åt andra hållet: "det har blivit plusgrader"', () => {
    const l = vaderLage({ obs: serie(-9, 4), kontrollMs: kontroll, kontrollTemp: null, nuMs: nu });
    expect(l.omslag).toBe(true);
    expect(omslagText('H8E -26', l, null)?.body).toContain('det har blivit plusgrader');
  });
  it('stationen saknar värden vid kontrollen → kontrollens eget väder; saknas båda → inget omslag', () => {
    const bara = serie(3, -8).filter(o => o.ms > kontroll + 2 * TIM);
    expect(vaderLage({ obs: bara, kontrollMs: kontroll, kontrollTemp: 2, nuMs: nu })).toMatchObject({ vidKontroll: 2, kalla: 'kontroll', omslag: true });
    expect(vaderLage({ obs: bara, kontrollMs: kontroll, kontrollTemp: null, nuMs: nu })).toMatchObject({ vidKontroll: null, omslag: false });
  });
  it('inga färska värden → ingen rad', () => {
    const gammal = serie(3, -8).filter(o => o.ms < nu - 12 * TIM);
    expect(vaderRad(vaderLage({ obs: gammal, kontrollMs: kontroll, kontrollTemp: null, nuMs: nu }))).toBeNull();
  });
});

describe('SMHI-tolkningen', () => {
  it('värdet är text, date i ms (sekunder räknas om), skräp släpps', () => {
    expect(tolkaObservationer({ value: [
      { date: 1763460000000, value: '-3.2', quality: 'G' },
      { date: 1763463600, value: '-4.0' },
      { date: 1763467200000, value: '' },
      { date: null, value: '1' },
    ] })).toEqual([{ ms: 1763460000000, temp: -3.2 }, { ms: 1763463600000, temp: -4 }]);
    expect(tolkaObservationer({})).toEqual([]);
  });
  it('stationer: bara aktiva inom 60 km, närmast först', () => {
    const st = tolkaStationer({ station: [
      { key: 64510, name: 'Växjö A', latitude: 56.92, longitude: 14.73, active: true },
      { key: 1, name: 'Långt bort', latitude: 59, longitude: 18, active: true },
      { key: 2, name: 'Nedlagd', latitude: 56.5, longitude: 14.7, active: false },
      { key: 3, name: 'Ljungby', latitude: 56.85, longitude: 13.95, active: true },
    ] });
    expect(narmasteStationer({ lat: 56.51, lon: 14.71 }, st).map(s => s.namn)).toEqual(['Växjö A', 'Ljungby']);
  });
  it('dygnet går före månaderna för samma timme', () => {
    expect(slaIhopObs([{ ms: 1, temp: 1 }, { ms: 2, temp: 2 }], [{ ms: 2, temp: 5 }])).toEqual([{ ms: 1, temp: 1 }, { ms: 2, temp: 5 }]);
  });
});

// En liten falsk databas och ett falskt SMHI för hela kedjan.
function fakeSb(o: { kontrollMs?: number | null; notisFinns?: boolean; inserts?: unknown[]; startIso?: string | null } = {}) {
  const kontrollIso = o.kontrollMs == null ? null : new Date(o.kontrollMs).toISOString();
  const svar = (data: unknown) => {
    const q: any = { data, error: null };
    for (const m of ['select', 'eq', 'not', 'order', 'limit', 'maybeSingle']) q[m] = () => q;
    q.upsert = (rader: unknown[]) => { o.inserts?.push(...rader); return svar((rader as unknown[]).map(() => ({ dedup_nyckel: 'x' }))); };
    q.then = (res: (v: unknown) => void) => res({ data: q.data, error: null });
    return q;
  };
  return {
    rpc: async () => ({ data: [{ maskin_id: 'PONS', lat: 56.43, lng: 14.77, tid: new Date(nu).toISOString() }], error: null }),
    from: (t: string) => {
      if (t === 'detalj_kontroll_stock') return svar(kontrollIso ? [{ filnamn: 'f', operator_measurement_date: kontrollIso, tid_ar_utc: true }] : []);
      if (t === 'fakt_kalibrering') return svar([{ weather_at_harvest: null }]);
      if (t === 'dim_maskin') return svar([{ maskin_id: 'PONS', aktiv_till: null, visningsnamn: 'Giant' }]);
      if (t === 'hyttspar') return svar(o.startIso === null ? [] : [{ skapad_at: o.startIso ?? '2026-11-18T09:20:00Z' }]);
      if (t === 'notis_kö') return svar(o.notisFinns ? [{ id: 1 }] : []);
      if (t === 'medarbetare') return svar([{ id: 'stefan', aktiv: true }]);
      return svar([]);
    },
  } as any;
}
const fakeSmhi = (obs: TempObs[]): typeof fetch => (async (url: string) => {
  const u = String(url);
  const body = u.endsWith('parameter/1.json')
    ? { station: [{ key: 64510, name: 'Växjö A', latitude: 56.92, longitude: 14.73, active: true }] }
    : { value: obs.map(x => ({ date: x.ms, value: String(x.temp) })) };
  return { ok: true, json: async () => body } as Response;
}) as unknown as typeof fetch;

describe('kedjan: läsning, pushen', () => {
  beforeEach(() => _tomSmhiObsCache());
  const dags = new Date('2026-11-18T10:01:00Z'); // 11:01 svensk tid, första kvarten

  it('var kvart', () => {
    expect(dagsAttKollaVader(new Date('2026-11-18T05:00:00Z'))).toBe(true);
    expect(dagsAttKollaVader(new Date('2026-11-18T05:07:00Z'))).toBe(false);
  });
  it('morgonfönstret: från starten och två timmar framåt, inte innan och inte utan start', () => {
    const start = Date.parse('2026-11-18T06:00:00Z');
    expect(iMorgonfonstret(start, new Date('2026-11-18T06:00:00Z'))).toBe(true);
    expect(iMorgonfonstret(start, new Date('2026-11-18T08:00:00Z'))).toBe(true);
    expect(iMorgonfonstret(start, new Date('2026-11-18T08:01:00Z'))).toBe(false);
    expect(iMorgonfonstret(null, new Date('2026-11-18T06:30:00Z'))).toBe(false);
  });
  it('omslag på morgonen → en push per förare och dag', async () => {
    const inserts: any[] = [];
    const r = await koaVaderOmslag(fakeSb({ kontrollMs: kontroll, inserts }), dags, fakeSmhi(serie(3, -8)));
    expect(r).toMatchObject({ ok: true, koade: 1 });
    expect(inserts[0]).toMatchObject({ mottagare_id: 'stefan', typ: 'kalib_vader', skickas_at: 'infinity', dedup_nyckel: 'vader:PONS:2026-11-18' });
    expect(vaderDedup('PONS', dags)).toBe('vader:PONS:2026-11-18');
    expect(inserts[0].payload).toEqual({ maskin_id: 'PONS', kontroll_ms: kontroll });
  });
  it('mitt på dagen (startade för länge sedan) eller inte startad idag → ingen push, trots omslag', async () => {
    const a: any[] = [];
    await koaVaderOmslag(fakeSb({ kontrollMs: kontroll, inserts: a, startIso: '2026-11-18T05:30:00Z' }), dags, fakeSmhi(serie(3, -8)));
    _tomSmhiObsCache();
    await koaVaderOmslag(fakeSb({ kontrollMs: kontroll, inserts: a, startIso: null }), dags, fakeSmhi(serie(3, -8)));
    expect(a.length).toBe(0);
  });
  it('redan köad eller inget omslag → ingen ny', async () => {
    const a: any[] = [];
    await koaVaderOmslag(fakeSb({ kontrollMs: kontroll, notisFinns: true, inserts: a }), dags, fakeSmhi(serie(3, -8)));
    const b: any[] = [];
    _tomSmhiObsCache(); // SMHI-svaren sparas en kvart per station
    await koaVaderOmslag(fakeSb({ kontrollMs: kontroll, inserts: b }), dags, fakeSmhi(serie(-2, -3)));
    expect(a.length + b.length).toBe(0);
  });
  it('läsningen ger stationens namn och kontrollens dag', async () => {
    const s = await lasVaderLage(fakeSb({ kontrollMs: kontroll }), 'PONS', new Date(nu), fakeSmhi(serie(3, -8)));
    expect(s).toMatchObject({ ok: true, station: 'Växjö A', kontrollDag: '16 nov', lage: { omslag: true } });
  });
  it('byggNotis: ny kontroll sedan köandet → hoppas över, inget omslag → hoppas över, läsfel → uppskjuts', async () => {
    const n = { payload: { maskin_id: 'PONS', kontroll_ms: kontroll }, skapad_at: new Date(nu).toISOString() };
    const omslag = vaderLage({ obs: serie(3, -8), kontrollMs: kontroll, kontrollTemp: null, nuMs: nu });
    const ok = { ok: true as const, lage: omslag, station: 'Växjö A', kontrollMs: kontroll, kontrollDag: '16 nov' };
    const u = await byggVaderNotis(n, async () => ({ namn: 'Giant', svar: ok }), new Date(nu));
    expect(u.typ === 'skicka' && u.meddelande.url).toBe('/kalibrering?maskin=PONS');
    expect((await byggVaderNotis(n, async () => ({ namn: 'Giant', svar: { ...ok, kontrollMs: kontroll + TIM } }), new Date(nu))).typ).toBe('hoppa_over');
    expect((await byggVaderNotis(n, async () => ({ namn: 'Giant', svar: { ...ok, lage: { ...omslag, omslag: false } } }), new Date(nu))).typ).toBe('hoppa_over');
    expect((await byggVaderNotis(n, async () => null, new Date(nu))).typ).toBe('uppskjut');
    expect((await byggVaderNotis({ ...n, skapad_at: new Date(nu - 7 * TIM).toISOString() }, async () => ({ namn: 'Giant', svar: ok }), new Date(nu))).typ).toBe('hoppa_over');
  });
});
