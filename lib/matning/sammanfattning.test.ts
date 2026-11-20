// Sammanfattningens omdöme, och synkens bokföring.
//
// Talen räknas i SQL. Det som räknas här är hur de ska LÄSAS — och den
// bokföring som avgör om sammanfattningen alls får något att räkna på.

import { describe, expect, it, vi } from 'vitest';

// Supabase-klienten skapas vid import och kräver env-nycklar. Funktionerna som
// prövas här är rena — de rör aldrig databasen — så klienten stubbas bort i
// stället för att lägga riktiga nycklar i testmiljön.
vi.mock('../supabase', () => ({ supabase: {} }));

import { spridningsText, type Sammanfattning } from './sammanfattning';
import { nastaPunktNummer, osynkadeAntal, type MattPunkt, type PagaendeMatning } from './lager';
import { avslutaMatning, renumreraOsynkade } from './sparande';

function sam(over: Partial<Sammanfattning>): Sammanfattning {
  return {
    matning_id: 'm1',
    objekt_uuid: 'o1',
    datum: '2026-08-26',
    relaskop_faktor: 1,
    punkter_totalt: 10,
    punkter_slutna: 10,
    punkter_ofullstandiga: 0,
    medel_grundyta: 20,
    spridning: 2,
    lagsta: 17,
    hogsta: 23,
    ...over,
  };
}

describe('spridningsText', () => {
  it('säger ifrån under två punkter i stället för att visa en lugnande nolla', () => {
    expect(spridningsText(sam({ punkter_slutna: 1, spridning: null }))).toMatch(/För få punkter/);
    expect(spridningsText(sam({ punkter_slutna: 0, spridning: null }))).toMatch(/För få punkter/);
  });

  it('läser spridningen mot medlet, inte i absoluta tal', () => {
    // Samma spridning, 4 m²/ha. Kring 12 är det mycket, kring 40 är det lite.
    // Det är hela skälet till att variationskoefficienten används.
    const trangt = spridningsText(sam({ medel_grundyta: 40, spridning: 4 }));
    const spritt = spridningsText(sam({ medel_grundyta: 12, spridning: 4 }));
    expect(trangt).toMatch(/Jämnt bestånd/);
    expect(spritt).toMatch(/Stor spridning/);
    expect(trangt).not.toBe(spritt);
  });

  it('normal variation ligger mellan trösklarna', () => {
    expect(spridningsText(sam({ medel_grundyta: 20, spridning: 4 }))).toMatch(/Normal variation/);
  });

  it('gissar inte när medlet saknas eller är noll', () => {
    expect(spridningsText(sam({ medel_grundyta: null }))).toMatch(/kunde inte räknas/);
    expect(spridningsText(sam({ medel_grundyta: 0 }))).toMatch(/kunde inte räknas/);
    expect(spridningsText(sam({ spridning: null }))).toMatch(/kunde inte räknas/);
  });
});

function punkt(nr: number, synkad: boolean): MattPunkt {
  return {
    punkt_nummer: nr,
    lat: null, lng: null, matt_lat: null, matt_lng: null,
    gps_noggrannhet_m: null, varv_grader: 360, matt_tid: null,
    trad: [], synkad,
  };
}

function matning(punkter: MattPunkt[], dbHogsta = 0): PagaendeMatning {
  return {
    lokal_id: 'lokal-1', matning_id: null, objekt_id: 'o1', objekt_namn: 'Testtrakten',
    datum: '2026-09-29', relaskop_faktor: 1, synfalt_grader: 65, enhet: null,
    db_hogsta_punkt: dbHogsta, tidigare_grundytor: [], punkter, synkad: false,
  };
}

describe('synkens bokföring', () => {
  it('räknar bara det som inte nått databasen', () => {
    expect(osynkadeAntal(matning([punkt(1, true), punkt(2, false), punkt(3, false)]))).toBe(2);
    expect(osynkadeAntal(matning([punkt(1, true)]))).toBe(0);
    expect(osynkadeAntal(null)).toBe(0);
  });

  it('behandlar en punkt utan synkflagga som osparad, aldrig som sparad', () => {
    // Mätningar som ligger kvar från före det här fältet fanns saknar flaggan.
    // Att tolka det som "sparad" vore att tyst släppa dem.
    const gammal = matning([{ ...punkt(1, false), synkad: undefined }]);
    expect(osynkadeAntal(gammal)).toBe(1);
  });

  it('vägrar avsluta trakten så länge punkter väntar', async () => {
    // Att avsluta stänger mätningen i databasen. Görs det med punkter kvar
    // lokalt skulle de aldrig nå fram — mätningen är stängd och lagret rensat.
    const r = await avslutaMatning(matning([punkt(1, true), punkt(2, false)]));
    expect(r.status).toBe('osynkat');
    expect(r.status === 'osynkat' && r.kvar).toBe(1);
    expect((await avslutaMatning(null)).status).toBe('avslutad');
  });
});

describe('punktnumreringen över flera pass', () => {
  it('fortsätter efter det som redan ligger i databasen', () => {
    // Mätning under körning återupptas. Började numreringen om på 1 varje pass
    // vore två olika punkter "punkt 1" i samma mätning.
    expect(nastaPunktNummer(matning([], 7))).toBe(8);
    expect(nastaPunktNummer(matning([punkt(8, true)], 7))).toBe(9);
    expect(nastaPunktNummer(matning([]))).toBe(1);
  });

  it('räknar om osynkade punkter som krockar med databasen', () => {
    // Mätt utan täckning: lokalt 1-2, medan databasen redan har 1-5.
    const ut = renumreraOsynkade([punkt(1, false), punkt(2, false)], 5);
    expect(ut.map((p) => p.punkt_nummer)).toEqual([6, 7]);
  });

  it('rör inte punkter som redan ligger i databasen', () => {
    const ut = renumreraOsynkade([punkt(3, true), punkt(1, false)], 0);
    expect(ut.map((p) => p.punkt_nummer)).toEqual([3, 4]);
    expect(ut[0]).toEqual(punkt(3, true));
  });

  it('behåller nummer som redan är höga nog', () => {
    const ut = renumreraOsynkade([punkt(9, false), punkt(10, false)], 5);
    expect(ut.map((p) => p.punkt_nummer)).toEqual([9, 10]);
  });
});
