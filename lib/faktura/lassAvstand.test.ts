// Skotningsavståndet ur BÅDA lasskällorna, och priset ur det.
//
// TVÅ SAKER VAKTAS HÄR:
//
// 1. ALLA lass räknas, inte bara Optis. Skälvikens två Opti-lass (858 och
//    1 538 m halva körsträckan) är längre än samtliga 85 app-lass. Fakturan
//    såg bara dem och landade på 0,97 kr/m³fub. Prod 2026-11-16: Skälviken
//    85 app-lass mot 2 Opti, Mölleryd 38 mot 8, Arvidstorp 14 mot 0.
//
// 2. PRISET SÄTTS EN GÅNG, på traktens avstånd och traktens volym — aldrig
//    per lass. Ett lass utan mätt sträcka ska inte dra ner tillägget: 15 av
//    Skälvikens 85 lass saknar cykel, och per-lass-prissättning gav därför
//    7,52 kr/m³fub i stället för 12.
//
// FACIT ÄR DE TVÅ TRAKTER DÄR MARTIN SATT AVSTÅNDET FÖR HAND OCH VIDA
// BETALADE — se blocket "facit" längst ner.
import { describe, it, expect } from 'vitest';
import { valjLassKalla, lassMedStracka, kallorIOrd, avstandsTillagg, fordelaPaSkotare, optiTillAvstandsLass, type AvstandsLass } from './lassAvstand';
import { readFileSync } from 'node:fs';
import { skotAvstandKr } from '@/lib/ekonomi/acord';
import { pathMeters } from '@/lib/geoMat';
import { skotningsavstandM } from '@/lib/skotningsavstand';

/** Spår → enkel väg. Samma två steg som lassCykel gör på hyttspårets cykel. */
const banaEnkelVag = (punkter: { lat: number; lng: number }[]) =>
  skotningsavstandM(pathMeters(punkter.map(p => [p.lng, p.lat] as [number, number])));

const PRIS = [{ grundavstand_m: 200, kr_per_100m: 4, giltig_fran: null, giltig_till: null }];

const lass = (o: Partial<AvstandsLass>): AvstandsLass => ({
  datum: '2026-11-02', maskinId: 'A130743', avstandM: 400, volym: 20, kalla: 'app', ...o,
});

describe('banan → skotningsavstånd enkel väg', () => {
  // Två punkter ~111,2 m isär i latitud (0,001°) ger ~55,6 m enkel väg.
  it('halveras, för en cykel är ut OCH tillbaka', () => {
    const m = banaEnkelVag([{ lat: 56.000, lng: 15 }, { lat: 56.001, lng: 15 }]);
    expect(m).toBeGreaterThan(50);
    expect(m).toBeLessThan(60);
  });

  it('summerar hela banan, inte fågelvägen mellan ändpunkterna', () => {
    // Ut och tillbaka till samma punkt: fågelvägen är 0, banan är inte det.
    const m = banaEnkelVag([
      { lat: 56.000, lng: 15 }, { lat: 56.002, lng: 15 }, { lat: 56.000, lng: 15 },
    ]);
    expect(m).toBeGreaterThan(200);
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

describe('Skälviken: appens lass tar över när de bär mer volym', () => {
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
  // Spåret går fram och tillbaka flera gånger på en kort sträcka. Hade banan
  // räknats som fågelvägen mellan ändpunkterna hade det blivit någon meter,
  // inte fyrtio. Beviset gäller `pathMeters` + halveringen, oavsett vilken
  // källa spåret kommer ur — samma två steg som lassCykel gör på cykeln.
  it('39,56 m enkel väg, samma som SQL', async () => {
    const f = (await import('./__fixtures__/skotarlass_spar_prod_2026-11-16.json')).default as any;
    const m = banaEnkelVag(f.punkter);
    expect(m).not.toBeNull();
    // En halv meter: pathMeters och SQL:en kan runda olika i sista decimalen.
    expect(Math.abs(m - f.sql_enkel_m)).toBeLessThan(0.5);
  });

  it('samma spår, 4 kr per påbörjad 100 m över 200 → 0 kr', async () => {
    const f = (await import('./__fixtures__/skotarlass_spar_prod_2026-11-16.json')).default as any;
    // 40 m ligger under grundavståndet, så lasset bär inget tillägg.
    expect(skotAvstandKr('2026-11-02', banaEnkelVag(f.punkter), 20, PRIS)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// EN räkning för fakturan och Ekonomi › Ackord (2026-11-22). Förut räknade
// Ackord bara Optis lass: Arvidstorp (0 Opti-lass, 19 app-lass med mätt
// cykel) stod på 0 kr i Ackord men fick tillägg på fakturan.
// ─────────────────────────────────────────────────────────────────────────

describe('avstandsTillagg — samma tal som fakturan', () => {
  const PRISLISTA = [{ grundavstand_m: 300, kr_per_100m: 4, giltig_fran: '2026-01-01', giltig_till: null }];
  const app = (datum: string, m: number | null, volym: number, maskinId = 'A130743'): AvstandsLass =>
    ({ datum, maskinId, avstandM: m, volym, kalla: 'app' });

  it('bara app-lass (Arvidstorp): tillägget räknas, inte 0 kr', () => {
    const t = avstandsTillagg({
      opti: [], app: [app('2026-11-10', 516, 20), app('2026-11-11', 516, 20)],
      manuellM: null, skordadVolym: 627.7, uppslag: '2026-11-18', avstList: PRISLISTA,
    });
    // 516 m: 3 påbörjade 100 m över 300 m = 12 kr/m³ — på TRAKTENS volym,
    // inte på de 40 m³ lassen bär (Martin 2026-11-25).
    expect(t.kr).toBeCloseTo(12 * 627.7, 6);
    expect(t.grund).toBe('lass');
    expect(t.perMaskin).toBeNull();
    expect(t.lassSnittM).toBe(516);
  });

  it('traktens avstånd är VOLYMVIKTAT, aldrig ett snitt av snitt', () => {
    // Ett stort lass långt ut och tre små nära avlägget. Viktat:
    // (1200·60 + 200·30) / 90 = 866,7 m → 24 kr/m³fub (grundavstånd 300).
    // Snitt av snitt: (1200 + 200·3) / 4 = 450 m → 8 kr. Ett snitt av snitt
    // hade kostat 16 kr/m³fub på en trakt där lassen är olika stora.
    const t = avstandsTillagg({
      opti: [],
      app: [
        app('2026-11-01', 1200, 60),
        app('2026-11-02', 200, 10),
        app('2026-11-03', 200, 10),
        app('2026-11-04', 200, 10),
      ],
      manuellM: null, skordadVolym: 1000, uppslag: '2026-11-13', avstList: PRISLISTA,
    });
    expect(t.lassSnittM).toBeCloseTo(866.67, 1);
    expect(t.lassSnittM).not.toBeCloseTo(450, 0);
    expect(t.kr).toBe(24 * 1000);
  });

  it('ett omätt lass drar INTE ner tillägget', () => {
    // Skälvikens fall: 15 av 85 lass saknar cykel. Förut summerades priset per
    // lass och delades på trakten, så de 15 bar 0 kr och tillägget blev 7,52
    // kr/m³fub i stället för 12. Nu räknas de inte alls.
    const med = [app('2026-11-10', 414, 20), app('2026-11-11', 414, 20)];
    const utan = app('2026-11-12', null, 20);
    const bara = avstandsTillagg({
      opti: [], app: med,
      manuellM: null, skordadVolym: 1000, uppslag: '2026-11-13', avstList: PRISLISTA,
    });
    const ocksaUtan = avstandsTillagg({
      opti: [], app: [...med, utan],
      manuellM: null, skordadVolym: 1000, uppslag: '2026-11-13', avstList: PRISLISTA,
    });
    expect(ocksaUtan.kr).toBe(bara.kr);
    expect(ocksaUtan.lassSnittM).toBe(414);
  });

  it('handsatt avstånd går före lassen och räknas på skördad volym', () => {
    const t = avstandsTillagg({
      opti: [], app: [app('2026-11-10', 900, 20)],
      manuellM: 450, skordadVolym: 1725, uppslag: '2026-11-13', avstList: PRISLISTA,
    });
    expect(t.kr).toBe(skotAvstandKr('2026-11-13', 450, 1725, PRISLISTA));
    expect(t.grund).toBe('manuell');
    expect(t.perMaskin).toBeNull();
    // Lassens meter finns kvar att visa bredvid ("lassen säger …").
    expect(t.lassSnittM).toBe(900);
  });

  it('samma dag i båda källorna: den med mest volym, aldrig summan', () => {
    // Appen har 200 m³ mot Optis 40 och vinner dagen. Appens 400 m ger 4
    // kr/m³fub; Optis 2 000 ÷ 2 = 1 000 m hade gett 28. Summan av källorna
    // hade gett ett avstånd mellan dem — också fel.
    const opti = optiTillAvstandsLass([{ datum: '2026-10-20', maskin_id: 'A130743', korstracka_m: 2000, volym_m3sub: 40 }]);
    const t = avstandsTillagg({
      opti, app: [app('2026-10-20', 400, 200)],
      manuellM: null, skordadVolym: 1000, uppslag: '2026-10-26', avstList: PRISLISTA,
    });
    expect(t.lassSnittM).toBe(400);
    expect(t.kr).toBe(4 * 1000);
  });

  it('inga lass och inget handsatt: 0 kr och det sägs', () => {
    const t = avstandsTillagg({ opti: [], app: [], manuellM: null, skordadVolym: 500, uppslag: '2026-11-01', avstList: PRISLISTA });
    expect(t).toMatchObject({ kr: 0, grund: 'inga', lassSnittM: null });
  });
});

describe('fordelaPaSkotare — totalen är alltid fakturans', () => {
  it('kronorna hamnar på skotaren som körde lassen', () => {
    const ut = fordelaPaSkotare({ kr: 900, perMaskin: new Map([['A', 600], ['B', 300]]) },
      [{ maskinId: 'A', volym: 100 }, { maskinId: 'B', volym: 900 }]);
    expect(ut.get('A')).toBe(600);
    expect(ut.get('B')).toBe(300);
  });

  it('handsatt avstånd delas efter volym', () => {
    const ut = fordelaPaSkotare({ kr: 1000, perMaskin: null },
      [{ maskinId: 'A', volym: 300 }, { maskinId: 'B', volym: 700 }]);
    expect(ut.get('A')).toBeCloseTo(300);
    expect(ut.get('B')).toBeCloseTo(700);
  });

  it('kronor från en maskin utan skotarvolym här delas — de tappas inte', () => {
    const ut = fordelaPaSkotare({ kr: 500, perMaskin: new Map([['A', 200], ['JD810E', 300]]) },
      [{ maskinId: 'A', volym: 100 }]);
    expect(ut.get('A')).toBe(500);
  });

  it('ingen skotare med volym: inget att lägga kronorna på', () => {
    expect(fordelaPaSkotare({ kr: 500, perMaskin: null }, [{ maskinId: 'A', volym: 0 }]).size).toBe(0);
  });
});

describe('vakt: Ackord och fakturan räknar avståndet på ETT ställe', () => {
  const kod = (f: string) => readFileSync(f, 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  it('objektJamforelse använder fakturans funktion och räknar inget eget tillägg', () => {
    const k = kod('lib/ekonomi/objektJamforelse.ts');
    expect(k).toContain('avstandsTillagg(');
    expect(k).toContain('lasLassCykel(');
    expect(k).not.toMatch(/skotAvstandKr\(/);
    expect(k).not.toMatch(/skotavstandVagtAuto\(/);
  });
  it('fakturan använder samma funktion', () => {
    expect(kod('lib/faktura/hamtaUnderlag.ts')).toContain('avstandsTillagg(');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// FACIT: de två trakter där Martin satt avståndet för hand och Vida betalade.
//
// Det är det enda facit som finns för VILKET mått tillägget ska räknas på.
// Allt mätt i prod 2026-11-25 (skotar_lass_cykel, volymviktat per trakt):
//
//   trakt       handsatt  volym m³fub   ut till virket  transportvägen  halva cykeln
//   Skälviken      450 m      1 746,35          414,4           613,3         738,6
//   Edestad        350 m        588,53          366,5           472,0         556,7
//
// Med 200 m fria och 4 kr per påbörjad 100 m:
//
//   Skälviken   handsatt 12 kr → 20 956 kr   ut 12 ✓   transport 20   halva 24
//   Edestad     handsatt  8 kr →  4 708 kr   ut  8 ✓   transport 12   halva 16
//
// Avståndet UT reproducerar båda fakturorna exakt. De andra två måtten
// stämmer inte med en enda faktura Vida betalat — de hade gett 34 920 och
// 41 913 kr på Skälviken i stället för 20 956.
//
// ÄNDRAS NÅGOT HÄR ÄR DET EN PRISÄNDRING MOT KUND, inte en kodrättning.
// ─────────────────────────────────────────────────────────────────────────
describe('facit: avståndet ut ger samma kronor som Vida betalade', () => {
  const PRIS_2026 = [{ grundavstand_m: 200, kr_per_100m: 4, giltig_fran: '2025-06-03', giltig_till: null }];
  const SKALVIKEN = 1746.35;
  const EDESTAD = 588.53;

  /** En trakt där alla lass har samma mätta avstånd — snittet är det talet. */
  const matt = (avstandM: number, volym: number) => avstandsTillagg({
    opti: [], app: [1, 2, 3].map(i => lass({
      datum: `2026-11-0${i}`, avstandM, volym: volym / 3,
    })),
    manuellM: null, skordadVolym: volym, uppslag: '2026-11-13', avstList: PRIS_2026,
  });

  const handsatt = (m: number, volym: number) => avstandsTillagg({
    opti: [], app: [], manuellM: m,
    skordadVolym: volym, uppslag: '2026-11-13', avstList: PRIS_2026,
  });

  it('Skälviken: handsatt 450 m och mätt 414,4 m ger båda 20 956 kr', () => {
    const h = handsatt(450, SKALVIKEN);
    expect(h.kr).toBeCloseTo(12 * SKALVIKEN, 6);
    expect(Math.round(h.kr)).toBe(20956);

    const m = matt(414.4, SKALVIKEN);
    expect(m.lassSnittM).toBeCloseTo(414.4, 6);
    expect(Math.round(m.kr)).toBe(20956);
  });

  it('Edestad: handsatt 350 m och mätt 366,5 m ger båda 4 708 kr', () => {
    const h = handsatt(350, EDESTAD);
    expect(h.kr).toBeCloseTo(8 * EDESTAD, 6);
    expect(Math.round(h.kr)).toBe(4708);

    expect(Math.round(matt(366.5, EDESTAD).kr)).toBe(4708);
  });

  it('halva cykeln och transportvägen hade gett andra tal än fakturan', () => {
    // Inte avrundningsfel — andra mått på samma körning.
    expect(Math.round(matt(738.6, SKALVIKEN).kr)).toBe(41912);  // 24 kr/m³fub
    expect(Math.round(matt(613.3, SKALVIKEN).kr)).toBe(34927);  // 20
    expect(Math.round(matt(556.7, EDESTAD).kr)).toBe(9416);     // 16
    expect(Math.round(matt(472.0, EDESTAD).kr)).toBe(7062);     // 12
  });

  it('ett lass utan mätt cykel ändrar inte traktens pris', () => {
    // Skälviken har 15 av 85 lass utan cykel. Räknades priset per lass bar de
    // 0 kr och drog tillägget till 7,52 kr/m³fub i stället för 12.
    const utan = avstandsTillagg({
      opti: [],
      app: [
        ...[1, 2, 3].map(i => lass({ datum: `2026-11-0${i}`, avstandM: 414.4, volym: SKALVIKEN / 3 })),
        lass({ datum: '2026-11-04', avstandM: null, volym: 400 }),
      ],
      manuellM: null, skordadVolym: SKALVIKEN, uppslag: '2026-11-13', avstList: PRIS_2026,
    });
    expect(Math.round(utan.kr)).toBe(20956);
  });
});
