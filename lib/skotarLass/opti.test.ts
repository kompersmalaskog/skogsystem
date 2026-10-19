import { describe, expect, it } from 'vitest';
import { appStartPerMaskin, fordelaOpti, optiForAvslut, kodKlass, namnNyckel, optiPerDag, raknadeOptiLass, type OptiLass } from './opti';
import { beraknaKvar, kvarSammanfattning, kvarVy, skalningsfaktorer, skotningPerDag } from './kvar';
import type { SkordatSortiment } from './sortiment';
import type { Lass } from './typer';

const T = (iso: string) => Date.parse(iso);
const opti = (maskinId: string, datum: string, nr: number, iso: string | null, rader: Array<[string, string | null, number]>): OptiLass => ({
  maskinId, datum, lassNummer: nr, tidMs: iso ? T(iso) : null, volymM3: rader.reduce((s, r) => s + r[2], 0),
  rader: rader.map(([namn, kundkod, m3]) => ({ namn, kundkod, m3 })),
});
const appLass = (maskinId: string, iso: string, rader: Array<[string, number]>, status: Lass['status'] = 'bekraftat', nr = 1): Lass => ({
  id: `${maskinId}-${iso}-${nr}`, objektId: 'o', voNummer: null, maskinId, medarbetareId: null, lassNummer: nr, datum: iso.slice(0, 10), status,
  bekraftadAv: 'forare', bekraftadTid: null, sparPunkter: [], vagar: [], skapad: iso, andrad: iso,
  delar: [{ delNr: 1, avlaggId: 'vida:1', avlaggNummer: '01-2', lossadTid: iso, lat: 0, lng: 0, rader: rader.map(([nyckel, m3]) => ({ nyckel, namn: nyckel, m3 })) }],
});
const S = (nyckel: string, m3: number, kundkoder: string[] = [], namn = nyckel): SkordatSortiment => ({ nyckel, namn, m3, kundkoder });

describe('övergången Opti → appen (ingen dubbelräkning)', () => {
  const skordat = [S('tall', 100, ['011-X']), S('massa', 50, ['100-1'])];
  const ol = [
    opti('W', '2026-10-13', 1, '2026-10-13T08:00:00Z', [['Tall_V3', '011-X', 30]]),
    opti('W', '2026-10-14', 2, '2026-10-14T08:00:00Z', [['Tall_V3', '011-X', 20]]),
    opti('W', '2026-10-19', 3, '2026-10-19T13:00:00Z', [['Tall_V3', '011-X', 10]]),   // efter appens start: appen har det lasset
  ];
  it('Opti före appens första lass räknas, Opti efter räknas inte', () => {
    const app = [appLass('W', '2026-10-19T12:00:00Z', [['tall', 15]])];
    const k = beraknaKvar(skordat, app, ol);
    expect(k.rader.find((r) => r.nyckel === 'tall')).toMatchObject({ skotatOpti: 50, skotatApp: 15, skotat: 65, kvar: 35 });
  });
  it('en maskin utan app-lass räknas helt med Opti', () => {
    const k = beraknaKvar(skordat, [], ol);
    expect(k.rader.find((r) => r.nyckel === 'tall')).toMatchObject({ skotatOpti: 60, skotatApp: 0, kvar: 40 });
  });
  it('per maskin: en annan maskins Opti-lass påverkas inte av att W börjat i appen', () => {
    const app = [appLass('W', '2026-10-13T00:00:00Z', [['tall', 1]])];   // W började före alla sina Opti-lass → W:s Opti räknas inte alls
    const ol2 = [...ol, opti('E', '2026-10-19', 1, '2026-10-19T13:00:00Z', [['Tall_V3', '011-X', 5]])];
    const k = beraknaKvar(skordat, app, ol2);
    expect(k.rader.find((r) => r.nyckel === 'tall')).toMatchObject({ skotatOpti: 5, skotatApp: 1 });
  });
  it('ett struket app-lass startar ingen övergång (appen har inte rapporterat något)', () => {
    expect(appStartPerMaskin([appLass('W', '2026-10-19T12:00:00Z', [['tall', 15]], 'struket')]).size).toBe(0);
    expect(beraknaKvar(skordat, [appLass('W', '2026-10-19T12:00:00Z', [['tall', 15]], 'struket')], ol).rader.find((r) => r.nyckel === 'tall')?.skotatOpti).toBe(60);
  });
  it('första app-lass = det tidigaste av maskinens lass (inte det senast skapade)', () => {
    const m = appStartPerMaskin([appLass('W', '2026-10-19T14:00:00Z', [['tall', 1]], 'bekraftat', 2), appLass('W', '2026-10-19T10:00:00Z', [['tall', 1]], 'foreslaget', 1)]);
    expect(m.get('W')).toBe(T('2026-10-19T10:00:00Z'));
  });
  it('Opti-lass utan tid avgörs av dagen: före appens första dag räknas, samma dag inte', () => {
    const start = new Map([['W', T('2026-10-19T12:00:00Z')]]);
    const utanTid = [opti('W', '2026-10-18', 1, null, [['x', null, 5]]), opti('W', '2026-10-19', 2, null, [['x', null, 7]])];
    expect(raknadeOptiLass(utanTid, start).map((o) => o.lassNummer)).toEqual([1]);
  });
  it('lossning exakt vid appens start räknas inte (appen äger tidpunkten)', () => {
    const start = new Map([['W', T('2026-10-19T12:00:00Z')]]);
    expect(raknadeOptiLass([opti('W', '2026-10-19', 1, '2026-10-19T12:00:00Z', [])], start)).toEqual([]);
  });
});

describe('Opti-sortiment → skördarens sortiment', () => {
  it('samma kundkod: direkt', () => {
    const per = fordelaOpti([S('a', 100, ['012-VVI']), S('b', 100, ['011-VVI'])], [opti('W', 'd', 1, null, [['Urshult 1-2_V3', '012-VVI', 40]])]);
    expect(per.get('a')).toBe(40); expect(per.get('b')).toBeUndefined();
  });
  it('samma namn utan grupp, version och &/o', () => {
    expect(namnNyckel('Massa: BmavFall_V3')).toBe(namnNyckel('BmavFall_V3'));
    expect(namnNyckel('kubb: BERGoBERG EK-KUBB_V3')).toBe(namnNyckel('BERG&BERG EK-KUBB_V3'));
    const per = fordelaOpti([S('massa bmavfall', 90, [], 'Massa: BmavFall_V3')], [opti('W', 'd', 1, null, [['BmavFall_V3', null, 40]])]);
    expect(per.get('massa bmavfall')).toBe(40);
  });
  it('kundkodens klass när koden inte finns hos skördaren (Engved 509 → 539)', () => {
    expect(kodKlass('509-1')).toBe('energi'); expect(kodKlass('539-1')).toBe('energi'); expect(kodKlass('100-1')).toBe('1'); expect(kodKlass(null)).toBeNull();
    const per = fordelaOpti([S('gran', 10, ['539-1']), S('lov', 50, ['539-1'])], [opti('W', 'd', 1, null, [['EngvedFallGran_V3', '509-1', 30]])]);
    expect((per.get('gran') ?? 0) + (per.get('lov') ?? 0)).toBe(30);
    expect(per.get('lov')).toBe(30);   // mest kvar först
  });
  it('skotat mer än skördat i sin grupp försvinner — aldrig minus och aldrig in i en annan klass', () => {
    const per = fordelaOpti([S('tall', 10, ['011-X']), S('massa', 100, ['100-1'])], [opti('W', 'd', 1, null, [['T', '011-X', 40]])]);
    expect(per.get('tall')).toBe(10); expect(per.get('massa')).toBeUndefined();
  });
  it('utan kod eller klass fylls sortimentet med mest kvar', () => {
    const per = fordelaOpti([S('a', 5), S('b', 50)], [opti('W', 'd', 1, null, [['Okänt', null, 20]])]);
    expect(per.get('b')).toBe(20);
  });
});

describe('Vällust (prod 2026-10-19): skotad trakt visar inte 505 m³ kvar', () => {
  // Skördat (Ponsse) och Opti-lass (Wisent) ur prod, avrundat.
  const skordat: SkordatSortiment[] = [
    S('timmer: vislanda_195_1-2_v3', 193.3, ['012-VVI'], 'Timmer: Vislanda_195_1-2_V3'),
    S('timmer: vislanda tall_v3', 74.9, ['011-VVI'], 'Timmer: Vislanda Tall_V3'),
    S('massa: bmavfall_v3', 86.2, ['100-1'], 'Massa: BmavFall_V3'),
    S('energi: engved3möv löv_v3', 46.2, ['539-1'], 'Energi: Engved3mÖvLöv_V3'),
    S('massa: bokmav3mv3', 45, ['136-1'], 'Massa: Bokmav3mV3'),
    S('kubb: alvesta305_v3', 35.3, ['262-VAL'], 'Kubb: Alvesta305_V3'),
    S('kubb: bergoberg ek-kubb_v3', 34.7, ['018-BOB-2', '018-BOB'], 'kubb: BERGoBERG EK-KUBB_V3'),
    S('energi: engved3mgran_v3', 8.5, ['539-1'], 'Energi: Engved3mGran_V3'),
    S('massa: björkmavfall_v3', 2.4, ['104-1'], 'Massa: BjörkmavFall_V3'),
    S('kubb: alvesta275_v3', 1.9, ['261-VAL'], 'Kubb: Alvesta275_V3'),
    S('energi: avkapgran_v3', 1.2, ['432-2'], 'Energi: AvkapGran_V3'),
    S('unclassified', 0.9, [], 'Unclassified'),
  ];
  const rad = (namn: string, kod: string, m3: number): [string, string, number] => [namn, kod, m3];
  const ol = [opti('A030353', '2026-10-15', 1, '2026-10-15T08:00:00Z', [
    rad('Urshult 494_V3', '011-VUR', 77.5), rad('Urshult 1-2_V3', '012-VUR-2', 200.5), rad('BmavFall_V3', '100-1', 89), rad('KärstimmerEk_V3', '018-KHR', 57),
    rad('Bokmavfall_V3', '106-1', 54.5), rad('EngvedFallGran_V3', '509-1', 49.5), rad('Alvesta305_V3', '262-VAL', 35), rad('BERG&BERG Ek A-KUBB_V3', '018-BOB', 35),
    rad('Grovbok_V3', '186-1', 22), rad('BERG&BERG EK-KUBB_V3', '018-BOB-2', 20), rad('EngvedFallÖvLöv_V3', '509-1', 4), rad('BjörkmavFall_V3', '104-1', 2.5), rad('Alvesta275_V3', '261-VAL', 2),
  ])];

  it('utan app-lass: kvar några m³, inte 505', () => {
    const k = beraknaKvar(skordat, [], ol);
    expect(k.kvarTotal).toBeLessThan(10);
    expect(k.rader.find((r) => r.nyckel === 'timmer: vislanda_195_1-2_v3')).toMatchObject({ klart: true, kvar: 0 });
    expect(kvarSammanfattning(k, [], '2026-10-19', ol).kvarText).toMatch(/^Kvar ~\d m³$/);
  });
  it('appens första lass efter Opti ändrar inget (Opti-lassen ligger före)', () => {
    const app = [appLass('A030353', '2026-10-19T14:00:00Z', [['timmer: vislanda tall_v3', 5]])];
    const utan = beraknaKvar(skordat, [], ol).kvarTotal;
    expect(beraknaKvar(skordat, app, ol).kvarTotal).toBeLessThanOrEqual(utan);
  });
  it('Kvar-listan: högst sex rader + Övrigt, Unclassified aldrig med eget namn', () => {
    const vy = kvarVy(beraknaKvar(skordat, [], ol));
    expect(vy.synliga.length).toBeLessThanOrEqual(6);
    expect(vy.synliga.some((r) => r.oklassat)).toBe(false);
    expect(vy.ovrigt?.rader.some((r) => r.oklassat)).toBe(true);
  });
});

describe('klar-dag direkt på pågående trakter', () => {
  it('takten räknas också ur Opti-lassen (före appens start)', () => {
    const ol = [
      opti('W', '2026-10-15', 1, '2026-10-15T08:00:00Z', [['x', null, 100]]),
      opti('W', '2026-10-16', 1, '2026-10-16T08:00:00Z', [['x', null, 140]]),
    ];
    const dagar = skotningPerDag([], ol);
    expect(dagar).toEqual([{ datum: '2026-10-15', m3: 100 }, { datum: '2026-10-16', m3: 140 }]);
    const k = beraknaKvar([S('x', 500)], [], ol);   // 260 skotat, 240 kvar
    expect(kvarSammanfattning(k, [], '2026-10-19', ol).klarText).toMatch(/^Klar ~/);
    expect(kvarSammanfattning(k, [], '2026-10-19', []).klarText).toBeNull();   // utan Opti: ingen takt
  });
  it('Opti efter appens start räknas inte in i takten (annars dubbelt)', () => {
    const ol = [opti('W', '2026-10-19', 1, '2026-10-19T13:00:00Z', [['x', null, 100]])];
    const app = [appLass('W', '2026-10-19T12:00:00Z', [['x', 50]])];
    expect(optiPerDag(raknadeOptiLass(ol, appStartPerMaskin(app)))).toEqual([]);
    expect(skotningPerDag(app, ol)).toEqual([{ datum: '2026-10-19', m3: 50 }]);
  });
});

describe('optiForAvslut — Opti-volymen Färdigskotad drar av', () => {
  const skordat = [S('tall', 100, ['011-X']), S('massa', 50, ['100-1'])];
  const ol = [
    opti('W', '2026-10-13', 1, '2026-10-13T08:00:00Z', [['Tall_V3', '011-X', 30]]),
    opti('W', '2026-10-14', 2, '2026-10-14T08:00:00Z', [['Tall_V3', '011-X', 20], ['Massa_V3', '100-1', 8]]),
    opti('W', '2026-10-19', 3, '2026-10-19T13:00:00Z', [['Tall_V3', '011-X', 10]]),   // efter appens start: appen har det lasset
  ];
  it('bara Opti-lassen före maskinens första app-lass, fördelade på skördarens sortiment', () => {
    const app = [appLass('W', '2026-10-19T12:00:00Z', [['tall', 15]])];
    expect(optiForAvslut(skordat, ol, app)).toEqual({ tall: 50, massa: 8 });
  });
  it('trakt som började i appen (inga Opti-lass) → tomt, hela skördat är appens mål', () => {
    expect(optiForAvslut(skordat, [], [appLass('W', '2026-10-19T12:00:00Z', [['tall', 15]])])).toEqual({});
  });
  it('maskin utan app-lass: allt Opti räknas', () => {
    expect(optiForAvslut(skordat, ol, [])).toEqual({ tall: 60, massa: 8 });
  });
  it('Opti + appens skalade lass = skördat (hela kedjan, samma tal som kvar-räkningen)', () => {
    const app = [appLass('W', '2026-10-19T12:00:00Z', [['tall', 15]])];
    const o = optiForAvslut(skordat, ol, app);
    const s = skalningsfaktorer(skordat, app, o);
    expect(o.tall + 15 * s.faktorer.tall).toBeCloseTo(100, 9);
    expect(beraknaKvar(skordat, app, ol).rader.find((r) => r.nyckel === 'tall')!.skotatOpti).toBe(o.tall);   // kvar-räkningen och avslutet drar av samma Opti
  });
});
