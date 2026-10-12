import { describe, it, expect } from 'vitest';
import fixtur from './__fixtures__/trestensdal_almehult_2026-10-07.json';
import { stegaAvstamning, NYTT_AVSTAMNINGSMINNE, AVSTAMNING_HALL_MS, AVSTAMNING_MIN_FIXAR, type AvstamningsMinne } from './objektAvstamning';
import { objektInnehallerPunkt, traktgransRingar, type ObjektForVal } from './objektPlats';

// LÖPANDE AVSTÄMNING. Fältfel (Oskar, Rottne, R64428, 2026-10-07): appen startade på senast valda objekt (Älmehult) men maskinen stod i Trestensdal och
// loggade 377 hyttspårspunkter på fel objekt i 4 timmar. Datan var rätt — riktiga traktgränser och Oskars riktiga punkter ligger i fixturen
// (prod-läsning, read-only). Regeln: en färsk giltig fix inne i ett annat objekts traktgräns ska ALLTID leda till byte/kort inom en minut.

const MASKIN = 'R64428';
const KAND = fixtur.kandidater as unknown as (ObjektForVal & { namn: string })[];
const ALM = KAND.find((k) => k.namn.startsWith('Älmehult'))!;
const TRE = KAND.find((k) => k.namn.startsWith('Trestensdal'))!;
const MOL = KAND.find((k) => k.namn.startsWith('Mölleryd'))!;
const PUNKTER = fixtur.punkter.map((p) => ({ lat: p.lat, lng: p.lng }));

/** En punkt som verkligen ligger inne i objektets traktgräns (vertex dras mot medelpunkten tills den är inne). */
function innePunkt(o: ObjektForVal): { lat: number; lng: number } {
  for (const ring of traktgransRingar(o.geometri)) {
    const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length, cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    for (const v of ring) for (const t of [0.5, 0.3, 0.15]) {
      const lng = v[0] + (cx - v[0]) * t, lat = v[1] + (cy - v[1]) * t;
      if (objektInnehallerPunkt(o.geometri, lat, lng)) return { lat, lng };
    }
  }
  throw new Error('ingen inre punkt för ' + o.id);
}

type Resultat = { atgard: 'inget' | 'fraga' | 'byt'; efterMs: number | null; fixar: number; traffId: string | null; skal: string };

/** Mata en ström fixar, en per sekund (en riktig GPS), tills något händer eller `maxMs` gått. Minnet rullar vidare mellan fixarna som i appen. */
function kor(a: {
  oppet: string | null; punkt: (i: number) => { lat: number; lng: number };
  kandidater?: ObjektForVal[]; redanFragat?: (id: string) => boolean; maxMs?: number; stegMs?: number; startMinne?: AvstamningsMinne;
}): Resultat {
  let minne = a.startMinne ?? NYTT_AVSTAMNINGSMINNE;
  const steg = a.stegMs ?? 1000, max = a.maxMs ?? 60_000;
  let senast: Resultat = { atgard: 'inget', efterMs: null, fixar: 0, traffId: null, skal: '' };
  for (let i = 0, t = 0; t <= max; i++, t += steg) {
    const r = stegaAvstamning({
      minne, nu: 1_000_000 + t, pos: a.punkt(i), oppetObjektId: a.oppet, maskinId: MASKIN,
      kandidater: a.kandidater ?? KAND, redanFragat: a.redanFragat ?? (() => false),
    });
    minne = r.minne;
    senast = { atgard: r.atgard, efterMs: r.atgard === 'inget' ? null : t, fixar: i + 1, traffId: r.traff?.id ?? null, skal: r.skal };
    if (r.atgard !== 'inget') return senast;
  }
  return senast;
}
const oskar = (i: number) => PUNKTER[i % PUNKTER.length];

describe('fixturen är Oskars riktiga data', () => {
  it('Älmehult är tilldelat R64428, Trestensdal är det inte (båda pågående, båda med traktgräns)', () => {
    expect(ALM.skordare_maskin_id).toBe(MASKIN);
    expect(TRE.skordare_maskin_id ?? null).toBeNull();
    expect(TRE.skotare_maskin_id ?? null).toBeNull();
    expect(ALM.status).toBe('pagaende'); expect(TRE.status).toBe('pagaende');
    expect(traktgransRingar(ALM.geometri).length).toBeGreaterThan(0);
    expect(traktgransRingar(TRE.geometri).length).toBeGreaterThan(0);
  });
  it('ALLA 60 verkliga punkter ligger inne i Trestensdal och ingen i Älmehult (ingen överlappning — datan var inte felet)', () => {
    expect(PUNKTER.length).toBe(60);
    expect(PUNKTER.every((p) => objektInnehallerPunkt(TRE.geometri, p.lat, p.lng))).toBe(true);
    expect(PUNKTER.some((p) => objektInnehallerPunkt(ALM.geometri, p.lat, p.lng))).toBe(false);
  });
});

describe('KODBEVIS: enheten minns Älmehult, fixen är inne i Trestensdal → kort/byte inom 60 s', () => {
  it('ej tilldelat Trestensdal → bekräftelsekortet ("fraga") efter ~10 s, långt före en minut', () => {
    const r = kor({ oppet: ALM.id, punkt: oskar });
    expect(r.atgard).toBe('fraga');
    expect(r.traffId).toBe(TRE.id);
    expect(r.efterMs).not.toBeNull();
    expect(r.efterMs!).toBeLessThanOrEqual(60_000);
    expect(r.efterMs!).toBe(AVSTAMNING_HALL_MS);   // exakt hålltiden vid 1 Hz
  });

  it('tilldelat Trestensdal → tyst byte ("byt") på samma tid', () => {
    const tilldelad = KAND.map((k) => (k.id === TRE.id ? { ...k, skordare_maskin_id: MASKIN } : k));
    const r = kor({ oppet: ALM.id, punkt: oskar, kandidater: tilldelad });
    expect(r.atgard).toBe('byt');
    expect(r.traffId).toBe(TRE.id);
    expect(r.efterMs!).toBeLessThanOrEqual(60_000);
  });

  it('klockan startar på första fixen i Trestensdal, inte på appstarten: en maskin som kör in i Trestensdal efter 5 min i Älmehult får kortet 10 s efter ankomsten', () => {
    const i1 = innePunkt(ALM);
    const r = kor({ oppet: ALM.id, maxMs: 400_000, punkt: (i) => (i < 300 ? i1 : oskar(i)) });   // 300 s i Älmehult, sedan Trestensdal
    expect(r.atgard).toBe('fraga');
    expect(r.efterMs!).toBe(300_000 + AVSTAMNING_HALL_MS);
  });

  it('samma fixar mot ALLA fyra sätt maskinen kunde ha "startat": det gamla beslutet berodde på starten, det nya gör inte det', () => {
    // öppet objekt är det enda indata som skiljer — hur appen startade (senaste/lokal/hyttspår/fix) finns inte längre i beslutet
    for (const oppet of [ALM.id, MOL.id]) expect(kor({ oppet, punkt: oskar }).atgard).toBe('fraga');
  });
});

describe('skydd: aldrig fel kort, aldrig tyst överstyrning', () => {
  it('står maskinen INNE i det öppna objektet → inget, aldrig (rätt objekt)', () => {
    const r = kor({ oppet: TRE.id, punkt: oskar, maxMs: 300_000 });
    expect(r.atgard).toBe('inget');
    expect(r.skal).toBe('inne-i-oppet-objekt');
  });

  it('överlappande trakter: står maskinen inne i det öppna OCH ett annat objekt vinner det öppna', () => {
    const tvilling = { ...TRE, id: 'tvilling', namn: 'Tvilling' } as ObjektForVal;   // samma gräns som Trestensdal → överlapp
    const r = kor({ oppet: TRE.id, punkt: oskar, kandidater: [...KAND, tvilling], maxMs: 120_000 });
    expect(r.atgard).toBe('inget');
  });

  it('redan frågat om Trestensdal denna session ("Annat objekt") → ingen ny fråga, ingen tyst överstyrning', () => {
    const r = kor({ oppet: ALM.id, punkt: oskar, redanFragat: (id) => id === TRE.id, maxMs: 300_000 });
    expect(r.atgard).toBe('inget');
    expect(r.skal).toBe('redan-fragat');
  });

  it('…men tilldelat objekt byts alltid, även om kortet visats (planerarens instruktion gäller)', () => {
    const tilldelad = KAND.map((k) => (k.id === TRE.id ? { ...k, skordare_maskin_id: MASKIN } : k));
    expect(kor({ oppet: ALM.id, punkt: oskar, kandidater: tilldelad, redanFragat: () => true }).atgard).toBe('byt');
  });

  it('GPS-fladder vid en gräns: varannan fix utanför alla objekt → räknaren nollas, aldrig kort', () => {
    const ute = { lat: 56.9, lng: 13.0 };
    const r = kor({ oppet: ALM.id, punkt: (i) => (i % 2 === 0 ? oskar(i) : ute), maxMs: 600_000 });
    expect(r.atgard).toBe('inget');
  });

  it('växlar träffen mellan två andra objekt nollas räknaren (ingen av dem hinner bli kort)', () => {
    const a = oskar(0), b = innePunkt(MOL);
    const r = kor({ oppet: ALM.id, punkt: (i) => (Math.floor(i / 6) % 2 === 0 ? a : b), maxMs: 600_000 });   // 6 s i varje, hålltiden är 10 s
    expect(r.atgard).toBe('inget');
  });

  it('en enstaka fix räcker inte: kortet kräver minst AVSTAMNING_MIN_FIXAR fixar i följd (även om tiden gått)', () => {
    // två fixar med 20 s mellanrum: tiden är passerad men antalet är 2 < 3
    let minne: AvstamningsMinne = NYTT_AVSTAMNINGSMINNE;
    const steg = (t: number) => stegaAvstamning({ minne, nu: t, pos: oskar(0), oppetObjektId: ALM.id, maskinId: MASKIN, kandidater: KAND, redanFragat: () => false });
    let r = steg(0); minne = r.minne; expect(r.atgard).toBe('inget');
    r = steg(20_000); minne = r.minne; expect(r.atgard).toBe('inget'); expect(minne.antal).toBe(2);
    expect(AVSTAMNING_MIN_FIXAR).toBe(3);
    r = steg(21_000); expect(r.atgard).toBe('fraga');
  });

  it('ingen träff alls (utanför alla objekt) → inget; inget öppet objekt → inget', () => {
    expect(kor({ oppet: ALM.id, punkt: () => ({ lat: 56.9, lng: 13.0 }), maxMs: 120_000 }).skal).toBe('ingen-traff');
    expect(kor({ oppet: null, punkt: oskar, maxMs: 120_000 }).skal).toBe('inget-oppet-objekt');
  });

  it('kandidater UTAN geometri (laddningen gick fel) ger aldrig ett bytesbeslut — därför får effekten inte köra förrän laddningen lyckats (lib/objektKandidater)', () => {
    const utanGeo = KAND.map((k) => ({ ...k, geometri: null }));
    const r = kor({ oppet: ALM.id, punkt: oskar, kandidater: utanGeo, maxMs: 600_000 });
    expect(r.atgard).toBe('inget');
    expect(r.skal).toBe('ingen-traff');
  });
});
