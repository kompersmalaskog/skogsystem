// @vitest-environment jsdom
// VAKT: grot-raden på ett grot-anpassat AVVERKNINGSobjekt. Ett hygge kan vara
// färdigavverkat och färdigskotat och ändå ha riset kvar på hygget — och då får
// det inte se "Klart" ut utan vidare. En tyst rad i ord säger om riset är hämtat
// eller ligger kvar, byggd på grot_hamtad (grot_status är opålitlig, bygg inget
// på den). Raden visas i BÅDE pågående och Klart-läge. Den visas ALDRIG på ett
// risjobb (det följs upp som eget objekt) eller på ett objekt utan grot.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Risjobb-fallet renderar Kallhyggen (useRouter + grot-koppling → supabase).
// Vi bryr oss bara om att grot-raden undertrycks, inte om källhygges-listan.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
}));
vi.mock('@/lib/grot-koppling', () => ({
  hamtaKallhyggen: async () => ({ ok: true, hyggen: [], message: '' }),
}));

import UppfoljningVy, { type UppfoljningData } from './UppfoljningVy';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const idag = new Date().toISOString().slice(0, 10);

// Ett grot-anpassat slutavverkningsobjekt (producerar ris). grotAnpassad = true,
// grotSkotning = false (det är INTE själva risjobbet). Default: riset kvar.
const hygge = (over: Partial<UppfoljningData>): UppfoljningData => ({
  objektNamn: 'Brokamåla au 2025', objektId: '11271870', typ: 'slutavverkning' as any,
  areal: 6.1, agare: 'Vida', status: 'pagaende',
  volym: 900, skordat: 880, skotat: 400, kvarPct: 55,
  maskiner: [], skordareModell: 'Scorpion Giant', skordareStart: '2026-10-20',
  skordareSlut: '2026-10-28', skordareLastDate: '2026-10-28', operatorSkordare: 'Stefan',
  skotareModell: 'Elefant 26', operatorSkotare: 'Daniel', skotareStart: '2026-10-26',
  skotareSlut: null, skotareLastDate: idag,
  prodSkordarePerDag: [{ datum: '2026-10-28', m3: 400 }] as any,
  avvikelser: [], skotatArManuell: false,
  grotSkotning: false, grotAnpassad: true, grotHamtad: null,
  skordareG15h: 8, skordareG0: 7, skordareTomgang: 0.5, skordareKortaStopp: 0.5, skordareKortStoppRaa: 0.5, skordareRast: 0, skordareAvbrott: 0.8,
  skotareG15h: 8, skotareG0: 7, skotareTomgang: 0.5, skotareKortaStopp: 0.5, skotareRast: 0, skotareAvbrott: 0.5,
  skordareM3G15h: 39, skordareStammarG15h: 20, skordareMedelstam: 0.3, skotareM3G15h: 30, skotareLassG15h: 2, skotareSnittlass: 20, skotningsavstand: 300,
  tradslag: [{ namn: 'Gran', pct: 73 }, { namn: 'Tall', pct: 27 }] as any, sortiment: [{ namn: 'Timmer', m3: 600 }],
  dieselTotalt: 400, dieselPerM3: 0.48, skordareL: 300, skordareL_M3: 0.48, skordareL_G15h: 13,
  skotareL: 100, skotareL_M3: 0.4, skotareL_G15h: 12, dieselSkordare: [], dieselSkotare: [],
  avbrottSkordare: [], avbrottSkotareTotalt: '0,5 h', avbrottSkordare_totalt: '0,8 h', avbrottSkotare: [],
  antalLass: 20, snittlassM3: 20, lassG15h: 2,
  lassPerDag: [{ datum: idag, m3: 160 }] as any,
  skordareBalG15h: 39, skotareBalG15h: 30,
  ...over,
});

let rot: Root | null = null;
let be: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); be?.remove(); rot = null; be = null; });

function rendera(data: UppfoljningData): string {
  be = document.createElement('div'); document.body.appendChild(be);
  rot = createRoot(be);
  act(() => { rot!.render(<UppfoljningVy data={data} />); });
  return be.textContent || '';
}

// Schablon: skordat 880 × 0,35 = 308 m³fub ris, märkt "ca" (gissning, ej mätt).
describe('Grot-raden på ett avverkningsobjekt', () => {
  it('ris kvar: visar mängden (ca 308 m³fub) + "ligger kvar på hygget"', () => {
    const text = rendera(hygge({ grotHamtad: null }));
    expect(text).toContain('ca 308 m³fub');
    expect(text).toContain('ligger kvar på hygget');
    expect(text).not.toContain('hämtat');
  });

  it('ris hämtat: visar mängden + "hämtat <datum>"', () => {
    const text = rendera(hygge({ grotHamtad: '2026-10-28' }));
    expect(text).toContain('ca 308 m³fub');
    expect(text).toContain('hämtat 28 okt');
    expect(text).not.toContain('ligger kvar på hygget');
  });

  it('mängden är en SCHABLON, aldrig mätt: alltid märkt "ca"', () => {
    // Skyddar mot att talet läses som uppmätt utkört ris. Utfallet bor på GROT-objektet.
    const text = rendera(hygge({ grotHamtad: null }));
    expect(text).toContain('ca ');
  });

  // (Grot-raden visas bara när skordat > 0 — Svaret bailar till StatusRad utan
  // skördad volym, så "ca 0 m³fub" kan aldrig uppstå. Skablon-basen finns alltid.)

  it('KÄRNAN: färdigavverkat och färdigskotat hygge med ris kvar visar "Klart" OCH ris-raden', () => {
    // Objektet är klart (avslutat, allt skotat) men riset ligger kvar — raden
    // visas i Klart-läge så hygget inte ser helt färdigt ut.
    const text = rendera(hygge({ status: 'avslutat', skotat: 880, kvarPct: 0, skotareSlut: '2026-10-30', grotHamtad: null }));
    expect(text).toContain('Klart');
    expect(text).toContain('ca 308 m³fub');
    expect(text).toContain('ligger kvar på hygget');
  });

  it('inte grot-anpassat: ingen grot-rad', () => {
    const text = rendera(hygge({ grotAnpassad: false, grotHamtad: null }));
    expect(text).not.toContain('ligger kvar på hygget');
    expect(text).not.toContain('Ris: ca');
  });

  it('risjobb: ingen grot-rad (risjobbet följs upp som eget objekt)', () => {
    // grotSkotning = true ⇒ arRisjobb ⇒ raden undertrycks även om grotAnpassad är satt.
    const text = rendera(hygge({ grotSkotning: true, grotAnpassad: true, skordat: 0, grotHamtad: null }));
    expect(text).not.toContain('ligger kvar på hygget');
    expect(text).not.toContain('Ris: ca');
  });
});
