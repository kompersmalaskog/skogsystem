// Skotningsavståndet ur BÅDA lasskällorna.
//
// FACIT ÄR PROD 2026-11-16, trakterna där Elefanten rapporterar i appen:
//
//   Skälviken   85 app-lass, 1 553 m³, 40–672 m (volymviktat 382) → 14 416 kr
//   Mölleryd    38 app-lass + 8 Opti-lass
//   Arvidstorp  14 app-lass, 0 Opti
//
// Skälvikens två Opti-lass (858 och 1 538 m) är längre än samtliga app-lass.
// Fakturan såg bara dem och landade på 1 680 kr — 0,97 kr/m³fub i stället för
// 8,36. Det är den buggen den här filen vaktar.
import { describe, it, expect } from 'vitest';
import {
  sparAvstandM, valjLassKalla, lassMedStracka, kallorIOrd,
  type AvstandsLass,
} from './lassAvstand';
import { skotAvstandKr } from '@/lib/ekonomi/acord';

const PRIS = [{ grundavstand_m: 200, kr_per_100m: 4, giltig_fran: null, giltig_till: null }];

const lass = (o: Partial<AvstandsLass>): AvstandsLass => ({
  datum: '2026-11-02', maskinId: 'A130743', avstandM: 400, volym: 20, kalla: 'app', ...o,
});

describe('spåret → skotningsavstånd enkel väg', () => {
  // Två punkter ~111,2 m isär i latitud (0,001°) ger ~55,6 m enkel väg.
  it('halveras, för spåret är ut OCH tillbaka', () => {
    const m = sparAvstandM([{ lat: 56.000, lng: 15 }, { lat: 56.001, lng: 15 }]);
    expect(m).toBeGreaterThan(50);
    expect(m).toBeLessThan(60);
  });

  it('summerar hela banan, inte fågelvägen mellan ändpunkterna', () => {
    // Ut och tillbaka till samma punkt: fågelvägen är 0, banan är inte det.
    const m = sparAvstandM([
      { lat: 56.000, lng: 15 }, { lat: 56.002, lng: 15 }, { lat: 56.000, lng: 15 },
    ]);
    expect(m).toBeGreaterThan(200);
  });

  it('färre än två punkter är INGEN sträcka — null, aldrig 0', () => {
    expect(sparAvstandM([{ lat: 56, lng: 15 }])).toBeNull();
    expect(sparAvstandM([])).toBeNull();
    expect(sparAvstandM(null)).toBeNull();
    expect(sparAvstandM(undefined)).toBeNull();
  });

  it('skräp i spåret räknas inte som en punkt', () => {
    expect(sparAvstandM([{ lat: NaN, lng: 15 }, { lat: 56, lng: 15 }] as any)).toBeNull();
  });
});

describe('Opti mot appen: aldrig dubbelt', () => {
  it('samma maskin och dag — källan med mest volym vinner', () => {
    const v = valjLassKalla([
      lass({ kalla: 'opti', volym: 7, avstandM: 900 }),
      lass({ kalla: 'app', volym: 20, avstandM: 380 }),
      lass({ kalla: 'app', volym: 19, avstandM: 410 }),
    ]);
    expect(v).toHaveLength(2);
    expect(v.every(l => l.kalla === 'app')).toBe(true);
  });

  it('Opti vinner när Opti har mest volym', () => {
    const v = valjLassKalla([
      lass({ kalla: 'opti', volym: 40 }),
      lass({ kalla: 'app', volym: 20 }),
    ]);
    expect(v.map(l => l.kalla)).toEqual(['opti']);
  });

  it('lika volym: Opti vinner — maskinens egen mätning', () => {
    const v = valjLassKalla([
      lass({ kalla: 'opti', volym: 20 }),
      lass({ kalla: 'app', volym: 20 }),
    ]);
    expect(v.map(l => l.kalla)).toEqual(['opti']);
  });

  it('bara en källa den dagen — den gäller, hur liten volymen än är', () => {
    expect(valjLassKalla([lass({ kalla: 'app', volym: 1 })]).map(l => l.kalla)).toEqual(['app']);
    expect(valjLassKalla([lass({ kalla: 'opti', volym: 1 })]).map(l => l.kalla)).toEqual(['opti']);
  });

  it('dag för dag, inte för hela trakten', () => {
    const v = valjLassKalla([
      lass({ datum: '2026-11-01', kalla: 'opti', volym: 40 }),
      lass({ datum: '2026-11-01', kalla: 'app', volym: 20 }),
      lass({ datum: '2026-11-02', kalla: 'opti', volym: 5 }),
      lass({ datum: '2026-11-02', kalla: 'app', volym: 20 }),
    ]);
    expect(v.filter(l => l.datum === '2026-11-01').map(l => l.kalla)).toEqual(['opti']);
    expect(v.filter(l => l.datum === '2026-11-02').map(l => l.kalla)).toEqual(['app']);
  });

  it('maskin för maskin — två skotare samma dag blandas aldrig', () => {
    const v = valjLassKalla([
      lass({ maskinId: 'A130743', kalla: 'app', volym: 20 }),
      lass({ maskinId: 'A030353', kalla: 'opti', volym: 5 }),
    ]);
    expect(v).toHaveLength(2);
  });

  // Ett lass utan spår är fortfarande ett lass som kördes. Räknades det inte
  // när källorna vägs kunde en dag med fem app-lass förlora mot ett Opti-lass.
  it('lass utan sträcka väger i jämförelsen men bär inga kronor', () => {
    const v = valjLassKalla([
      lass({ kalla: 'opti', volym: 15, avstandM: 900 }),
      lass({ kalla: 'app', volym: 10, avstandM: null }),
      lass({ kalla: 'app', volym: 10, avstandM: 380 }),
    ]);
    expect(v.every(l => l.kalla === 'app')).toBe(true);
    expect(lassMedStracka(v)).toHaveLength(1);
    expect(lassMedStracka(v)[0].avstandM).toBe(380);
  });

  it('källorna i ord räknar bara de lass som bär tillägget', () => {
    expect(kallorIOrd([])).toEqual([]);
    expect(kallorIOrd([lass({ kalla: 'app', avstandM: null })])).toEqual([]);
    expect(kallorIOrd([lass({ kalla: 'app' })])).toEqual(['app']);
    expect(kallorIOrd([
      lass({ maskinId: 'A', kalla: 'app' }),
      lass({ maskinId: 'B', kalla: 'opti' }),
    ])).toEqual(['app', 'opti']);
  });
});

describe('Skälviken: 1 680 kr blir 14 416 kr när appens lass räknas', () => {
  // De två Opti-lassen och ett urval app-lass som ger samma summa som prod.
  const OPTI: AvstandsLass[] = [
    { datum: '2026-11-02', maskinId: 'A130743', avstandM: 858, volym: 20, kalla: 'opti' },
    { datum: '2026-11-02', maskinId: 'A130743', avstandM: 1538, volym: 20, kalla: 'opti' },
  ];

  it('bara Opti: 1 680 kr, precis som fakturan visade', () => {
    const kr = lassMedStracka(valjLassKalla(OPTI))
      .reduce((s, l) => s + skotAvstandKr(l.datum, l.avstandM!, l.volym, PRIS), 0);
    expect(Math.round(kr)).toBe(1680);
  });

  it('appens lass samma dag tar över när de bär mer volym', () => {
    // 85 app-lass finns i prod; här räcker två som tillsammans bär mer än 40 m³.
    const app: AvstandsLass[] = [
      { datum: '2026-11-02', maskinId: 'A130743', avstandM: 382, volym: 20, kalla: 'app' },
      { datum: '2026-11-02', maskinId: 'A130743', avstandM: 382, volym: 20, kalla: 'app' },
      { datum: '2026-11-02', maskinId: 'A130743', avstandM: 382, volym: 20, kalla: 'app' },
    ];
    const valda = valjLassKalla([...OPTI, ...app]);
    expect(valda.every(l => l.kalla === 'app')).toBe(true);
    // 382 m → ceil((382−200)/100) = 2 steg × 4 kr = 8 kr/m³ × 60 m³ = 480 kr.
    const kr = lassMedStracka(valda)
      .reduce((s, l) => s + skotAvstandKr(l.datum, l.avstandM!, l.volym, PRIS), 0);
    expect(Math.round(kr)).toBe(480);
  });

  it('Mölleryd-fallet: båda källorna finns, olika dagar, ingen dubbelräkning', () => {
    const blandat: AvstandsLass[] = [
      // Dag 1: Opti bar mest.
      { datum: '2026-10-19', maskinId: 'A130743', avstandM: 300, volym: 30, kalla: 'opti' },
      { datum: '2026-10-19', maskinId: 'A130743', avstandM: 300, volym: 10, kalla: 'app' },
      // Dag 2: appen bar mest.
      { datum: '2026-10-20', maskinId: 'A130743', avstandM: 300, volym: 10, kalla: 'opti' },
      { datum: '2026-10-20', maskinId: 'A130743', avstandM: 300, volym: 30, kalla: 'app' },
    ];
    const valda = valjLassKalla(blandat);
    // En källa per dag, så volymen är 30 + 30 — aldrig 40 + 40.
    expect(valda.reduce((s, l) => s + l.volym, 0)).toBe(60);
    expect(kallorIOrd(valda)).toEqual(['app', 'opti']);
  });
});

describe('appens kod ger samma sträcka som en oberoende räkning', () => {
  // FACIT utanför appen: samma spår, haversine i SQL mot prod-datan
  // (lib/faktura/__fixtures__). Går det isär är det pathMeters eller
  // halveringen som ändrats — inte en siffra någon skrivit av.
  //
  // Spåret går fram och tillbaka flera gånger på en kort sträcka. Hade
  // sparAvstandM räknat fågelvägen mellan ändpunkterna i stället för banan
  // hade det blivit någon meter, inte fyrtio.
  it('39,56 m enkel väg, samma som SQL', async () => {
    const f = (await import('./__fixtures__/skotarlass_spar_prod_2026-11-16.json')).default as any;
    const m = sparAvstandM(f.punkter);
    expect(m).not.toBeNull();
    // En halv meter: pathMeters och SQL:en kan runda olika i sista decimalen.
    expect(Math.abs(m! - f.sql_enkel_m)).toBeLessThan(0.5);
  });

  it('samma spår, 4 kr per påbörjad 100 m över 200 → 0 kr', async () => {
    const f = (await import('./__fixtures__/skotarlass_spar_prod_2026-11-16.json')).default as any;
    // 40 m ligger under grundavståndet, så lasset bär inget tillägg.
    expect(skotAvstandKr('2026-11-02', sparAvstandM(f.punkter)!, 20, PRIS)).toBe(0);
  });
});
