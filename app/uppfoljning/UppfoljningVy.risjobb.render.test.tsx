// @vitest-environment jsdom
// VAKT: ett risjobb följs upp som ETT EGET OBJEKT, inte som en volymsiffra.
// Förut visade detaljvyn bara "Ris hämtat: X m³fub" + källhyggen för ett risjobb
// — allt utkörnings-följeslag (snitt/dag, m³/G15h, lass/G15h, snittlass,
// skotningsavstånd, lass per dag) var bortspärrat med `!risjobb`. Siffrorna RÄKNAS
// redan (samma transform som skotaren), så det handlade bara om att sluta dölja
// dem och rama in dem som utkörning. Det här testet låser att de syns och att
// skördar-framtällningen hålls borta (ett risjobb har ingen skördare).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Ris-grenen renderar Kallhyggen, som läser useRouter — harnessen monterar ingen
// app-router, så den mockas. Kallhyggen hämtar sen sina data via supabase; vi
// bryr oss bara om att vyn renderar risjobbets hjälte och sektioner.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
}));

// Kallhyggen hämtar källhyggen via grot-koppling (→ supabase). Vi testar hjälten
// och sektionerna, inte källhygges-listan, så den stubbas till ett tomt svar.
vi.mock('@/lib/grot-koppling', () => ({
  hamtaKallhyggen: async () => ({ ok: true, hyggen: [], message: '' }),
}));

import UppfoljningVy, { type UppfoljningData } from './UppfoljningVy';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const idag = new Date().toISOString().slice(0, 10);

// Ett risjobb (grotSkotning = true → arRisjobb). Ingen skördare; forwardern kör
// ut riset och rapporterar lass i m³fub. 450 m³ utkört på 3 dagar.
const risjobb = (over: Partial<UppfoljningData>): UppfoljningData => ({
  objektNamn: 'GROT Brokamåla', objektId: '11271883', typ: 'grot' as any,
  areal: 6.1, agare: 'Vida', status: 'pagaende',
  volym: 480, skordat: 0, skotat: 450, kvarPct: 0,
  maskiner: [], skordareModell: null, skordareStart: null,
  skordareSlut: null, skordareLastDate: null, operatorSkordare: null,
  skotareModell: 'Elefant 26', operatorSkotare: 'Daniel', skotareStart: '2026-10-28',
  skotareSlut: null, skotareLastDate: idag,
  prodSkordarePerDag: [] as any,
  avvikelser: [], skotatArManuell: false,
  grotSkotning: true,
  skordareG15h: 0, skordareG0: 0, skordareTomgang: 0, skordareKortaStopp: 0, skordareKortStoppRaa: 0, skordareRast: 0, skordareAvbrott: 0,
  skotareG15h: 16, skotareG0: 14, skotareTomgang: 1, skotareKortaStopp: 0.5, skotareRast: 0, skotareAvbrott: 0.5,
  skordareM3G15h: 0, skordareStammarG15h: 0, skordareMedelstam: 0, skotareM3G15h: 28, skotareLassG15h: 2.1, skotareSnittlass: 18, skotningsavstand: 250,
  tradslag: [], sortiment: [{ namn: 'Energived', m3: 450 }],
  dieselTotalt: 150, dieselPerM3: 0.33, skordareL: 0, skordareL_M3: 0, skordareL_G15h: 0,
  skotareL: 150, skotareL_M3: 0.33, skotareL_G15h: 9, dieselSkordare: [], dieselSkotare: [],
  avbrottSkordare: [], avbrottSkotareTotalt: '0,5 h', avbrottSkordare_totalt: '0 h', avbrottSkotare: [],
  antalLass: 25, snittlassM3: 18, lassG15h: 2.1,
  lassPerDag: [
    { datum: '2026-10-28', m3: 160, lass: 9 },
    { datum: '2026-10-29', m3: 150, lass: 8 },
    { datum: idag, m3: 140, lass: 8 },
  ] as any,
  skordareBalG15h: 0, skotareBalG15h: 28,
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

describe('Risjobb följs upp som eget objekt', () => {
  it('visar utkörd volym, snitt/dag och forwarder-följeslaget', () => {
    const text = rendera(risjobb({}));
    // Hjälten: "Ris utkört" + volym + snitt/dag + på trakten.
    expect(text).toContain('Ris utkört');
    expect(text).toContain('450');
    expect(text).toContain('Snitt/dag');
    expect(text).toContain('På trakten');
    // Utkörnings-följeslaget som förut var bortspärrat för risjobb. Sektionerna
    // är hopfällda i jsdom (ingen layout → ingen rutnäts-media-query), så vi
    // låser att titlarna OCH teaser-talet (m³/G15h) finns — det bevisar att
    // Produktivitet avslöjas med forwarder-data, inte att den är tom.
    expect(text).toContain('Produktivitet');
    expect(text).toContain('m³/G15h');
    // Per-dag-sektionen ska heta "Utkört per dag" för ett risjobb, inte "Produktion per dag".
    expect(text).toContain('Utkört per dag');
    expect(text).not.toContain('Produktion per dag');
  });

  it('visar INGEN skördar-framtällning (ett risjobb har ingen skördare)', () => {
    const text = rendera(risjobb({}));
    expect(text).not.toContain('Skördat');
    expect(text).not.toContain('Skördare klar');
    // Trädslag-sektionen (skördarmätt virke) hålls borta för ris.
    expect(text).not.toContain('Trädslag & sortiment');
  });

  it('tom-tillstånd: inga lass → "Inga lass registrerade än", ingen snitt/dag-rad', () => {
    const text = rendera(risjobb({ skotat: 0, lassPerDag: [] as any, skotareM3G15h: 0, skotareLassG15h: 0, skotareSnittlass: 0, skotningsavstand: 0, skotareG15h: 0 }));
    expect(text).toContain('Inga lass registrerade än');
    expect(text).not.toContain('Snitt/dag');
  });
});
