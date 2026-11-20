// @vitest-environment jsdom
// VAKT: detaljvyns hero-status per maskin. Skälviken har EN dim_objekt-rad
// (på skotarens maskin) där SKÖRDNINGENS end_date/skordning_avslutad ligger,
// medan skotning_avslutad är null — skotaren är INTE klar. Buggen (#1080) var
// att useUppfoljningList matade `skotareEntry.end_date` in i skotareSlut, så
// hero:n sa "Skotaren klar" fast 648 av 1725 m³ var skotat.
//
// status.ts är korrekt: skotareSlut satt ⇒ stKlar ⇒ "Skotaren klar". Felet var
// VILKET värde hooken gav skotareSlut. Det här testet låser kontraktet i båda
// riktningar: ett slutdatum GER "klar", null GER "kör" — så den dag någon åter
// matar end_date in i skotareSlut syns det som "Skotaren klar" på en oskotad
// trakt och ett test faller.
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import UppfoljningVy, { type UppfoljningData } from './UppfoljningVy';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const idag = new Date().toISOString().slice(0, 10);

// Skälviken, pågående: skördaren klar (slutdatum satt), skotaren kör (648/1725).
const skalviken = (over: Partial<UppfoljningData>): UppfoljningData => ({
  objektNamn: 'Skälviken RP J-Hus -25', objektId: '11271860', typ: 'slutavverkning' as any,
  areal: 8.8, agare: 'Vida', status: 'pagaende',
  volym: 1734, skordat: 1725, skotat: 648, kvarPct: 62,
  maskiner: [], skordareModell: 'Scorpion Giant', skordareStart: '2026-10-20',
  skordareSlut: '2026-10-28', skordareLastDate: '2026-10-28', operatorSkordare: 'Stefan Karlsson',
  skotareModell: 'Elefant 26', operatorSkotare: 'Daniel', skotareStart: '2026-10-26',
  skotareSlut: null, skotareLastDate: idag,
  prodSkordarePerDag: [{ datum: '2026-10-27', m3: 400 }, { datum: '2026-10-28', m3: 400 }] as any,
  avvikelser: [], skotatArManuell: false,
  skordareG15h: 8, skordareG0: 7, skordareTomgang: 0.5, skordareKortaStopp: 0.5, skordareKortStoppRaa: 0.5, skordareRast: 0, skordareAvbrott: 0.8,
  skotareG15h: 8, skotareG0: 7, skotareTomgang: 0.5, skotareKortaStopp: 0.5, skotareRast: 0, skotareAvbrott: 0.5,
  skordareM3G15h: 39, skordareStammarG15h: 20, skordareMedelstam: 0.3, skotareM3G15h: 30, skotareLassG15h: 2, skotareSnittlass: 20,
  tradslag: [{ namn: 'Gran', pct: 73 }, { namn: 'Tall', pct: 27 }], sortiment: [{ namn: 'Timmer', m3: 1000 }],
  dieselTotalt: 400, dieselPerM3: 0.48, skordareL: 300, skordareL_M3: 0.48, skordareL_G15h: 13,
  skotareL: 100, skotareL_M3: 0.4, skotareL_G15h: 12, dieselSkordare: [], dieselSkotare: [],
  avbrottSkordare: [], avbrottSkotareTotalt: '0,5 h', avbrottSkordare_totalt: '0,8 h', avbrottSkotare: [],
  antalLass: 32, snittlassM3: 20, lassG15h: 2, skotningsavstand: 300,
  lassPerDag: [
    { datum: '2026-10-26', m3: 20 }, { datum: '2026-10-27', m3: 180 },
    { datum: '2026-10-28', m3: 148 }, { datum: '2026-10-30', m3: 140 }, { datum: idag, m3: 160 },
  ] as any,
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

describe('Detaljvyns skotarstatus', () => {
  it('skotareSlut = null (fixat): skotaren KÖR, aldrig "klar"', () => {
    const text = rendera(skalviken({ skotareSlut: null }));
    expect(text).toContain('Skotaren kör');
    expect(text).not.toContain('Skotaren klar');
    // Skördaren ÄR klar (slutdatum satt) — den raden ska stå kvar.
    expect(text).toContain('Skördaren klar');
  });

  it('skotareSlut satt (kontraktet): ett slutdatum GER "Skotaren klar"', () => {
    // Bevisar att status.ts är korrekt och att felet låg i vilket värde hooken
    // gav skotareSlut. Hooken får ALDRIG mata end_date hit (bara skotning_avslutad).
    const text = rendera(skalviken({ skotareSlut: '2026-10-28' }));
    expect(text).toContain('Skotaren klar');
    expect(text).not.toContain('Skotaren kör');
  });
});
