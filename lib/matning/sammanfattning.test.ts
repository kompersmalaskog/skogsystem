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
import { osynkadeAntal, type MattPunkt, type PagaendeMatning } from './lager';
import { avslutaMatning } from './sparande';

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

function matning(punkter: MattPunkt[]): PagaendeMatning {
  return {
    lokal_id: 'lokal-1', matning_id: null, objekt_id: 'o1', datum: '2026-08-26',
    relaskop_faktor: 1, synfalt_grader: 65, enhet: null, punkter, synkad: false,
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

  it('vägrar avsluta trakten så länge punkter väntar', () => {
    expect(avslutaMatning(matning([punkt(1, true), punkt(2, false)]))).toBe(false);
    expect(avslutaMatning(matning([punkt(1, true), punkt(2, true)]))).toBe(true);
    expect(avslutaMatning(null)).toBe(true);
  });
});
