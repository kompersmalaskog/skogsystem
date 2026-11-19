import { beforeEach, describe, expect, it } from 'vitest';
import { _tomSmhiObsCache, narmasteStationer, slaIhopObs, tolkaObservationer, tolkaStationer, type TempObs } from '@/lib/smhi-obs';
import { OMSLAG_MIN_GRADER, medelTemp, omslagText, slutDagOrd, vaderKlass, vaderLage, vaderRad } from './vaderOmslag';
import { byggVaderNotis, dagsAttKollaVader, iMorgonfonstret, koaVaderOmslag, lasVaderLage, slutForraDagen, vaderDedup } from './vaderServer';

const TIM = 3_600_000;
const nu = Date.parse('2026-11-18T10:00:00Z'); // onsdag 11:00 svensk tid
const slut = Date.parse('2026-11-17T15:30:00Z'); // tisdag 16:30, när maskinen slutade igår
/** Timvärden: `fore` grader fram till och med slutet + 1 h, sedan `efter` (det slog om under kvällen/natten). */
const serie = (fore: number, efter: number): TempObs[] => {
  const ut: TempObs[] = [];
  for (let ms = slut - 24 * TIM; ms <= nu; ms += TIM) ut.push({ ms, temp: ms <= slut + TIM ? fore : efter });
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
  it('+3 när maskinen slutade igår, −6 nu → omslag: säger bara att vädret slagit om, inget råd', () => {
    const l = vaderLage({ obs: serie(3, -6), slutMs: slut, nuMs: nu });
    expect(l).toEqual({ nu: -6, vidSlut: 3, omslag: true });
    expect(omslagText('Giant', l, slut, nu)).toEqual({
      title: 'Vädret har slagit om · Giant',
      body: 'När maskinen slutade igår var det 3 °C, nu −6 °C – virket har frusit.',
    });
    expect(vaderRad(l, slut, nu)).toEqual({ varde: '−6 °C nu', under: '3 °C när maskinen slutade igår · vädret har slagit om', orange: true });
  });
  it('JÄMFÖR MED IGÅR, INTE MED SENASTE KONTROLLEN: ett omslag under natten syns oavsett när kontrollen gjordes', () => {
    // Senaste kontrollen kan ha gjorts i förra veckan i minusgrader — det spelar ingen roll, det som räknas är kvällen före.
    expect(vaderLage({ obs: serie(3, -6), slutMs: slut, nuMs: nu }).omslag).toBe(true);
  });
  it('en kontroll gjord sedan starten idag → inte orange, raden säger när', () => {
    const l = vaderLage({ obs: serie(3, -6), slutMs: slut, nuMs: nu });
    expect(vaderRad(l, slut, nu, '07:40')).toEqual({ varde: '−6 °C nu', under: '3 °C när maskinen slutade igår · kontroll gjord 07:40', orange: false });
  });
  it('svänger runt noll (+1 → −1) ger inget omslag — under 4 grader', () => {
    const l = vaderLage({ obs: serie(1, -1), slutMs: slut, nuMs: nu });
    expect(l.omslag).toBe(false);
    expect(OMSLAG_MIN_GRADER).toBe(4);
    expect(omslagText('Giant', l, slut, nu)).toBeNull();
    expect(vaderRad(l, slut, nu)).toMatchObject({ varde: '−1 °C nu', orange: false });
  });
  it('samma läge (−2 → −6) ger inget omslag även om skillnaden är stor', () => {
    expect(vaderLage({ obs: serie(-2, -6), slutMs: slut, nuMs: nu }).omslag).toBe(false);
  });
  it('töväder: −9 → +4 = virket har tinat', () => {
    const l = vaderLage({ obs: serie(-9, 4), slutMs: slut, nuMs: nu });
    expect(l.omslag).toBe(true);
    expect(omslagText('H8E -26', l, slut, nu)?.body).toContain('virket har tinat');
  });
  it('ingen arbetsdag senaste veckan → inget omslag, raden visar bara nu', () => {
    const l = vaderLage({ obs: serie(3, -6), slutMs: null, nuMs: nu });
    expect(l).toEqual({ nu: -6, vidSlut: null, omslag: false });
    expect(vaderRad(l, null, nu)).toEqual({ varde: '−6 °C nu', under: null, orange: false });
  });
  it('stationen utan färska värden → ingen rad', () => {
    const gammal = serie(3, -6).filter(o => o.ms < slut);
    expect(vaderRad(vaderLage({ obs: gammal, slutMs: slut, nuMs: nu }), slut, nu)).toBeNull();
  });
  it('dagen i ord: igår, i fredags efter helgen, datum längre bak', () => {
    const mandag = Date.parse('2026-11-16T07:00:00Z');
    expect(slutDagOrd(slut, nu)).toBe('igår');
    expect(slutDagOrd(Date.parse('2026-11-13T15:00:00Z'), mandag)).toBe('i fredags');
    expect(slutDagOrd(Date.parse('2026-11-05T15:00:00Z'), mandag)).toBe('5 nov');
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
function fakeSb(o: { kontrollMs?: number | null; notisFinns?: boolean; inserts?: unknown[]; startIso?: string | null; slutIso?: string | null } = {}) {
  const kontrollIso = o.kontrollMs == null ? null : new Date(o.kontrollMs).toISOString();
  const svar = (data: unknown, hytt = false) => {
    const q: any = { data, error: null };
    for (const m of ['select', 'eq', 'not', 'order', 'limit', 'maybeSingle', 'gte']) q[m] = () => q;
    // hyttspar: .lt('datum', idag) = förra arbetsdagen, annars dagens start
    q.lt = () => { if (hytt) q.data = o.slutIso === null ? [] : [{ skapad_at: '2026-11-17T06:00:00Z', uppdaterad_at: o.slutIso ?? new Date(slut).toISOString() }]; return q; };
    q.upsert = (rader: unknown[]) => { o.inserts?.push(...rader); return svar((rader as unknown[]).map(() => ({ dedup_nyckel: 'x' }))); };
    q.then = (res: (v: unknown) => void) => res({ data: q.data, error: null });
    return q;
  };
  return {
    rpc: async () => ({ data: [{ maskin_id: 'PONS', lat: 56.43, lng: 14.77, tid: new Date(nu).toISOString() }], error: null }),
    from: (t: string) => {
      if (t === 'detalj_kontroll_stock') return svar(kontrollIso ? [{ operator_measurement_date: kontrollIso, tid_ar_utc: true }] : []);
      if (t === 'dim_maskin') return svar([{ maskin_id: 'PONS', aktiv_till: null, visningsnamn: 'Giant' }]);
      if (t === 'hyttspar') return svar(o.startIso === null ? [] : [{ skapad_at: o.startIso ?? '2026-11-18T09:20:00Z' }], true);
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
  it('omslag under natten → en push på morgonen per förare och dag', async () => {
    const inserts: any[] = [];
    const r = await koaVaderOmslag(fakeSb({ kontrollMs: Date.parse('2026-11-10T09:00:00Z'), inserts }), dags, fakeSmhi(serie(3, -6)));
    expect(r).toMatchObject({ ok: true, koade: 1 });
    expect(inserts[0]).toMatchObject({ mottagare_id: 'stefan', typ: 'kalib_vader', skickas_at: 'infinity', dedup_nyckel: 'vader:PONS:2026-11-18' });
    expect(vaderDedup('PONS', dags)).toBe('vader:PONS:2026-11-18');
    expect(inserts[0].payload).toEqual({ maskin_id: 'PONS', koad_ms: dags.getTime() });
  });
  it('ingen kontroll någonsin → pushen kommer ändå (den beror inte på senaste kontrollen)', async () => {
    const inserts: any[] = [];
    await koaVaderOmslag(fakeSb({ kontrollMs: null, inserts }), dags, fakeSmhi(serie(3, -6)));
    expect(inserts.length).toBe(1);
  });
  it('kontroll redan gjord sedan starten idag → ingen push', async () => {
    const inserts: any[] = [];
    await koaVaderOmslag(fakeSb({ kontrollMs: Date.parse('2026-11-18T09:40:00Z'), inserts }), dags, fakeSmhi(serie(3, -6)));
    expect(inserts.length).toBe(0);
  });
  it('mitt på dagen (startade för länge sedan) eller inte startad idag → ingen push, trots omslag', async () => {
    const a: any[] = [];
    await koaVaderOmslag(fakeSb({ inserts: a, startIso: '2026-11-18T05:30:00Z' }), dags, fakeSmhi(serie(3, -6)));
    _tomSmhiObsCache();
    await koaVaderOmslag(fakeSb({ inserts: a, startIso: null }), dags, fakeSmhi(serie(3, -6)));
    expect(a.length).toBe(0);
  });
  it('redan köad, inget omslag eller ingen arbetsdag senaste veckan → ingen ny', async () => {
    const a: any[] = [];
    await koaVaderOmslag(fakeSb({ notisFinns: true, inserts: a }), dags, fakeSmhi(serie(3, -6)));
    _tomSmhiObsCache(); // SMHI-svaren sparas en kvart per station
    await koaVaderOmslag(fakeSb({ inserts: a }), dags, fakeSmhi(serie(-2, -3)));
    _tomSmhiObsCache();
    await koaVaderOmslag(fakeSb({ inserts: a, slutIso: null }), dags, fakeSmhi(serie(3, -6)));
    expect(a.length).toBe(0);
  });
  it('läsningen ger stationen, när maskinen slutade och om en kontroll är gjord idag', async () => {
    const s = await lasVaderLage(fakeSb({ kontrollMs: Date.parse('2026-11-18T09:40:00Z') }), 'PONS', new Date(nu), fakeSmhi(serie(3, -6)));
    expect(s).toMatchObject({ ok: true, station: 'Växjö A', slutMs: slut, kontrollIdag: '10:40', lage: { omslag: true } });
    expect(await slutForraDagen(fakeSb({ slutIso: null }), 'PONS', new Date(nu))).toBeNull();
  });
  it('byggNotis: kontroll gjord sedan köandet → hoppas över, inget omslag → hoppas över, läsfel → uppskjuts', async () => {
    const n = { payload: { maskin_id: 'PONS', koad_ms: nu }, skapad_at: new Date(nu).toISOString() };
    const omslag = vaderLage({ obs: serie(3, -6), slutMs: slut, nuMs: nu });
    const ok = { ok: true as const, lage: omslag, station: 'Växjö A', slutMs: slut, kontrollMs: null, kontrollIdag: null };
    const u = await byggVaderNotis(n, async () => ({ namn: 'Giant', svar: ok }), new Date(nu));
    expect(u.typ === 'skicka' && u.meddelande.url).toBe('/kalibrering?maskin=PONS');
    expect(u.typ === 'skicka' && u.meddelande.body).toContain('När maskinen slutade igår');
    expect((await byggVaderNotis(n, async () => ({ namn: 'Giant', svar: { ...ok, kontrollMs: nu + TIM } }), new Date(nu))).typ).toBe('hoppa_over');
    expect((await byggVaderNotis(n, async () => ({ namn: 'Giant', svar: { ...ok, lage: { ...omslag, omslag: false } } }), new Date(nu))).typ).toBe('hoppa_over');
    expect((await byggVaderNotis(n, async () => null, new Date(nu))).typ).toBe('uppskjut');
    expect((await byggVaderNotis({ ...n, skapad_at: new Date(nu - 7 * TIM).toISOString() }, async () => ({ namn: 'Giant', svar: ok }), new Date(nu))).typ).toBe('hoppa_over');
  });
});
