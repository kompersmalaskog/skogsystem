import { describe, expect, it } from 'vitest';
import { detekteraLass, LASS, lastadTroskel, type LoggPunkt } from './detektera';
import { lasFacit, lasLogg, sommarMs } from './fixtur';

const T0 = Date.parse('2026-10-12T06:00:00Z');
const MIN = 60_000;

/** En loggpunkt `min` minuter efter T0. Bilen står stilla (0 km/h) vid en trakt, odometern räknar upp per punkt. */
function P(min: number, vikt: number | null, o: Partial<LoggPunkt> = {}): LoggPunkt {
  return {
    tidpunkt: new Date(T0 + min * MIN).toISOString(),
    lat: 56.3, lng: 14.9, hastighet: 0, odometer_m: 300_000_000 + min * 400,
    vikt_kg: vikt, ...o,
  };
}
const tom = (min: number) => P(min, 28_500);

describe('hysteres — lastad ≥ 34 t, tom ≤ 32 t', () => {
  it('ett vanligt lass: tom → lastad → tom ger ETT lass med lastvikt och km', () => {
    const r = detekteraLass([tom(0), P(10, 50_000), P(20, 50_200), P(60, 50_100), tom(80)]);
    expect(r.lass).toHaveLength(1);
    const l = r.lass[0];
    expect(l.klar).toBe(true);
    expect(l.avvisad).toBeNull();
    expect(l.lastviktKg).toBeGreaterThan(20_000);
    expect(l.km).toBeGreaterThan(10);
  });

  it('SVAJANDE VIKT: 33,2 t mitt i ett lass (över 32 t) gör det inte tomt — lasset hålls ihop', () => {
    const r = detekteraLass([tom(0), P(5, 34_500), P(15, 33_200), P(25, 34_600), P(40, 34_400), tom(60)]);
    expect(r.lass).toHaveLength(1);
    expect(r.lass[0].antalPunkter).toBe(4);
  });

  it('SVAJANDE VIKT: ingen avläsning under 34 t blir ett lass (28 → 33 → 28)', () => {
    const r = detekteraLass([tom(0), P(10, 33_000), P(20, 33_900), tom(30)]);
    expect(r.lass).toHaveLength(0);
  });

  it('SVAJANDE VIKT: en falsk tom (27,5 t i en minut) mitt i ett lass slår ihop ETT lass (22+23 den 1 sep)', () => {
    const r = detekteraLass([tom(0), P(10, 49_300), P(18, 27_500), P(19, 49_000), P(40, 49_100), tom(70)]);
    expect(r.lass).toHaveLength(1);
    expect(r.lass[0].sammanslagen).toBe(true);
    expect(r.lass[0].antalPunkter).toBe(4);   // de tre lastade och den falska tomma emellan
  });

  it('maskinbyte på samma plats (tom i 25 minuter) är TVÅ lass — sammanslagningen gäller bara ≤ 15 min', () => {
    const r = detekteraLass([tom(0), P(10, 50_000), tom(20), tom(35), P(45, 40_000), P(50, 40_200), tom(80)]);
    expect(r.lass).toHaveLength(2);
  });

  it('tomnivån styr tröskeln: tom 28,5 t → 34 t; tom 21 t → 33 t (golvet)', () => {
    expect(lastadTroskel(28_500)).toBe(34_000);
    expect(lastadTroskel(21_000)).toBe(33_000);
  });
});

describe('H8E lätt lass (36–38 t med bilen)', () => {
  it('syns som lass med tröskeln 34 t (38 t hade missat det)', () => {
    const r = detekteraLass([tom(0), P(10, 36_100), P(20, 37_600), P(30, 36_900), P(60, 37_000), tom(90)]);
    expect(r.lass).toHaveLength(1);
    expect(r.lass[0].avvisad).toBeNull();
    expect(r.lass[0].lastviktKg).toBeGreaterThanOrEqual(LASS.MIN_LASTVIKT_KG);
  });
});

describe('enstaka mätning', () => {
  it('EN lastad punkt på 39 t (10,5 t över tom) är en avläsning, inte ett lass', () => {
    const r = detekteraLass([tom(0), P(10, 39_000), tom(30)]);
    expect(r.lass[0].avvisad).toBe('enstaka_matning');
  });
  it('EN lastad punkt på 57 t är ett riktigt lass (≥ 15 t över tom)', () => {
    const r = detekteraLass([tom(0), P(10, 57_000, { hastighet: 50 }), tom(30)]);
    expect(r.lass[0].avvisad).toBeNull();
  });
  it('för lätt last (< 6 t över tom) avvisas', () => {
    const r = detekteraLass([tom(0), { ...P(10, 34_500) }, P(20, 34_400), tom(40)].map(p => (p.vikt_kg === 28_500 ? { ...p, vikt_kg: 29_500 } : p)));
    expect(r.lass[0].avvisad).toBe('for_lag_lastvikt');
  });
  it('bilen kom inte iväg (< 1 km mellan lassning och lossning) avvisas', () => {
    const r = detekteraLass([tom(0), P(10, 50_000, { odometer_m: 1000 }), P(20, 50_000, { odometer_m: 1200 }), tom(30).vikt_kg ? { ...tom(30), odometer_m: 1300 } : tom(30)]);
    expect(r.lass[0].avvisad).toBe('ingen_transport');
  });
});

describe('fönstret', () => {
  it('börjar loggen med bilen lastad är starten okänd och perioden räknas inte', () => {
    const r = detekteraLass([P(0, 50_000), P(10, 50_000), tom(20), P(40, 50_000), P(50, 50_000), tom(70)]);
    expect(r.okandStart).toBe(true);
    expect(r.lass).toHaveLength(1);
  });
  it('punkter utan vikt (null/0) hoppas över', () => {
    const r = detekteraLass([tom(0), P(5, null), P(10, 0), P(15, 50_000), P(30, 50_000), tom(60)]);
    expect(r.lass).toHaveLength(1);
  });
  it('ett lass som ännu pågår är inte klart (bilen är fortfarande lastad)', () => {
    const r = detekteraLass([tom(0), P(10, 50_000), P(30, 50_000)]);
    expect(r.lass[0].klar).toBe(false);
  });
  it('IDEMPOTENS: ett lass behåller sin identitet (första lastade punkten) när loggen växer', () => {
    const kort = detekteraLass([tom(0), P(10, 50_000), P(20, 50_000)]).lass[0];
    const langre = detekteraLass([tom(0), P(10, 50_000), P(20, 50_000), P(40, 50_000), tom(70), P(90, 29_000)]).lass[0];
    expect(langre.forstaLastadTid).toBe(kort.forstaLastadTid);
  });
});

describe('plats', () => {
  it('stod bilen stilla vid lastningen är platsen säker', () => {
    const l = detekteraLass([tom(0), P(10, 50_000), P(20, 50_000), tom(40)]).lass[0];
    expect(l.lassning.saker).toBe(true);
    expect(l.lossning.saker).toBe(true);
  });
  it('körde bilen (60 km/h) och ingen trakt är nära är platsen osäker', () => {
    const rorlig = (min: number, v: number) => P(min, v, { hastighet: 60 });
    const l = detekteraLass([rorlig(0, 28_500), rorlig(10, 50_000), rorlig(20, 50_000), rorlig(40, 28_500)]).lass[0];
    expect(l.lassning.saker).toBe(false);
    expect(l.lossning.saker).toBe(false);
  });
  it('en tom punkt hemma på basen litas aldrig på som lossningsplats (H8E 16 sep)', () => {
    const bas = { lat: 56.3, lng: 14.9, radieM: 300 };
    const ute = (min: number, v: number) => P(min, v, { hastighet: 60, lat: 56.5, lng: 15.1 });
    const l = detekteraLass([ute(0, 28_500), ute(10, 37_000), ute(20, 37_000), P(80, 28_500, { hastighet: 0 })], { bas }).lass[0];
    expect(l.lossning.saker).toBe(false);
  });
});

describe('REPLAY mot loggen 31 jul–15 okt 2026 (1 081 punkter med vikt) — facit är historiklistan från steg 1', () => {
  const facit = lasFacit();
  const detekt = detekteraLass(lasLogg());
  const riktiga = detekt.lass.filter(l => !l.avvisad);

  /** Facit-radens första lastade punkt ligger mellan dess "lassning från" och "lassning till" (±5 min). */
  function traffar(f: (typeof facit)[number]) {
    const start = /^\d/.test(f.lassningFran) ? sommarMs(f.dag, f.lassningFran) : sommarMs(f.dag, f.lassningTid) - 30 * MIN;
    const slut = sommarMs(f.dag, f.lassningTid);
    return detekt.lass.filter(l => {
      const t = Date.parse(l.forstaLastadTid);
      return t >= start - 5 * MIN && t <= slut + 5 * MIN;
    });
  }

  it('startar med bilen tom (inget avskuret första lass)', () => {
    expect(detekt.okandStart).toBe(false);
  });

  it('varje rad i facit (45) hittas som EXAKT ett lass, och inget lass används två gånger', () => {
    const anvanda = new Set<string>();
    for (const f of facit) {
      const t = traffar(f);
      expect(t, `facit ${f.n} ${f.dag} ${f.lassningTid}`).toHaveLength(1);
      expect(t[0].avvisad, `facit ${f.n} ska inte avvisas`).toBeNull();
      expect(anvanda.has(t[0].forstaLastadTid), `facit ${f.n} dubbelträff`).toBe(false);
      anvanda.add(t[0].forstaLastadTid);
    }
    expect(anvanda.size).toBe(45);
  });

  it('22 och 23 den 1 sep är ETT lass (falsk tom 27,5 t slås ihop)', () => {
    const l = traffar(facit.find(f => f.n === '22+23')!)[0];
    expect(l.sammanslagen).toBe(true);
  });

  it('H8E:s lätta lass 21 aug (36–38 t) finns, trots att facit-tröskeln 38 t delade det', () => {
    const l = traffar(facit.find(f => f.n === '14')!)[0];
    expect(l.avvisad).toBeNull();
    expect(l.lastadKg).toBeLessThan(38_500);
  });

  it('AVVIKELSER från facit (rapporteras): exakt tre lass utöver de 45 — H8E 16 sep (registrerad flytt som facit-tröskeln missade) och två enstaka mätningar som avvisas', () => {
    const facitStart = new Set(facit.flatMap(f => traffar(f).map(l => l.forstaLastadTid)));
    const extra = detekt.lass.filter(l => !facitStart.has(l.forstaLastadTid));
    expect(extra).toHaveLength(3);
    const avvisade = extra.filter(l => l.avvisad);
    expect(avvisade.map(l => l.avvisad)).toEqual(['enstaka_matning', 'enstaka_matning']);
    const h8e = extra.find(l => !l.avvisad)!;
    expect(h8e.forstaLastadTid.startsWith('2026-09-16T12:')).toBe(true);   // 14:19 svensk tid
    expect(riktiga).toHaveLength(46);
  });

  it('alla lass utom ett är KLARA (bilen har lossat); inga öppna i historiken', () => {
    expect(detekt.lass.filter(l => !l.klar)).toHaveLength(0);
  });

  it('sträckan ur odometern ligger inom facitets intervall (±3 km) för rader där båda platserna är säkra', () => {
    let kontrollerade = 0;
    for (const f of facit) {
      const l = traffar(f)[0];
      if (!l.lassning.saker || !l.lossning.saker || l.km == null) continue;
      // 26 (2 sep): facit mätte från sista TOMMA punkten före lastningen och räknade med 5,4 km tomkörning till lastplatsen.
      // Vi mäter från första lastade punkten där bilen stod stilla — den lastade sträckan, 10,8 km. Avvikelsen är avsiktlig.
      if (f.n === '26') { expect(l.km).toBeCloseTo(10.8, 1); continue; }
      kontrollerade++;
      expect(l.km, `facit ${f.n} (${f.km.join('–')} km)`).toBeGreaterThanOrEqual(f.km[0] - 3);
      expect(l.km, `facit ${f.n} (${f.km.join('–')} km)`).toBeLessThanOrEqual(f.km[1] + 3);
    }
    expect(kontrollerade).toBeGreaterThan(20);   // 23 av 46 har säker plats i båda ändar på stillastående enbart (utan trakter i närheten)
  });
});
