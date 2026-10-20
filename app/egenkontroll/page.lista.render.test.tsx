// @vitest-environment jsdom
//
// Egenkontrollens lista (PR 5): beslutskortet, månadens stickprov, Påbörjade och Klara som egna rader, länken till allt annat.
// Hela sidan i jsdom; läsningarna, positionen och vägavståndet styrs av testet.
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  lista: null as unknown as () => Promise<unknown>,
  stickprov: null as unknown as () => Promise<unknown>,
  vag: {} as Record<string, number>,
  position: null as unknown,
  pushade: [] as string[],
  navigerade: [] as unknown[],
  antalLaddningar: 0,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (u: string) => h.pushade.push(u) }) }));
// Flikraden finns inte i egenkontrollen. Mocken ritar en synlig markör (inte null) så att en återinförd <BottomNav /> fäller testerna nedan.
vi.mock('@/components/BottomNav', () => ({ default: () => <nav data-testid="bottennav" /> }));
vi.mock('./useEnPosition', () => ({ useEnPosition: () => h.position }));
vi.mock('@/lib/hooks/useVagavstand', () => ({ useVagavstand: () => h.vag }));
vi.mock('@/lib/navigera', async () => {
  const a = await vi.importActual<Record<string, unknown>>('@/lib/navigera');
  return { ...a, startaNavigering: (o: unknown) => { h.navigerade.push(o); return true; } };
});
vi.mock('@/lib/egenkontroll', async () => {
  const a = await vi.importActual<Record<string, unknown>>('@/lib/egenkontroll');
  return { ...a, hamtaVantande: () => { h.antalLaddningar++; return h.lista(); }, hamtaStickprov: () => h.stickprov() };
});

import Page from './page';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Rundstatus = 'ej_startad' | 'pagaende' | 'klar';
let nr = 0;
function rad(namn: string, rundstatus: Rundstatus, avslutat: string, extra: Record<string, unknown> = {}) {
  nr++;
  return {
    objekt_id: `o-${namn}`, namn, avslutat, rundstatus, egenkontroll_id: rundstatus === 'ej_startad' ? null : `e${nr}`,
    antalPunkter: rundstatus === 'ej_startad' ? 0 : 13, antalSaknade: 0, antalBesvarade: rundstatus === 'pagaende' ? 4 : 0,
    antalAvvikelser: 0, antalBattre: 0, klarDatum: rundstatus === 'klar' ? '2026-10-15T10:00:00Z' : null,
    lat: 56.4 + nr * 0.01, lng: 14.8, typ: 'slutavverkning', areal: 4.2, ...extra,
  };
}
const oversikt = (rader: ReturnType<typeof rad>[], antalUtanDatum = 0) => ({ rader, antalVantande: rader.filter((r) => r.rundstatus !== 'klar').length, antalUtanDatum });

const kandidat = (id: string) => ({ id, namn: id, typ: 'slutavverkning', lat: 56.4, lng: 14.8, avslutat: '2026-10-05T10:00:00Z' });
function dragning(valdaNamn: string[], extra: Record<string, unknown> = {}) {
  return {
    manad: '2026-11-01', kalla_manad: '2026-10-01', dragen_vid: '2026-11-01T06:05:00Z', fro: 'f', algoritm_version: 2, troskel_km: 15, max_antal: 3,
    kandidater: ['a', 'b', 'c', 'd', 'e', 'f'].map(kandidat), ankare_index: 0, ankare_objekt_id: `o-${valdaNamn[0]}`, ankare_forsok: 1,
    valda: valdaNamn.map((n, i) => ({ objekt_id: `o-${n}`, namn: n, ordning: i + 1, km_fran_ankare: i })), spridning_km: 14.8, forklaring: 'full', ...extra,
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const stilla = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function vantaTills(villkor: () => boolean, beskrivning: string, tidsgransMs = 3000) {
  const slut = Date.now() + tidsgransMs;
  while (!villkor()) {
    if (Date.now() > slut) throw new Error(`Väntade ${tidsgransMs} ms men det hände aldrig: ${beskrivning}`);
    await stilla();
  }
}
async function montera() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Page)); });
}
const q = (sel: string) => host!.querySelector(sel) as HTMLElement | null;
const tid = (id: string) => q(`[data-testid="${id}"]`);
const text = () => host!.textContent ?? '';
const klicka = async (el: HTMLElement | null) => { expect(el, 'elementet att klicka på').not.toBeNull(); await act(async () => { el!.click(); }); };
async function montera_och_vanta() { await montera(); await vantaTills(() => !text().includes('Hämtar egenkontrollerna'), 'listan laddad'); }

const MED_POSITION = { lat: 56.4, lng: 14.8 };
const UTAN_POSITION = null;

beforeEach(() => {
  nr = 0; h.vag = {}; h.position = MED_POSITION; h.pushade = []; h.navigerade = []; h.antalLaddningar = 0;
  h.stickprov = async () => null;
});
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

describe('listan före första dragningen', () => {
  beforeEach(() => {
    h.lista = async () => oversikt([
      rad('Bromåla', 'ej_startad', '2026-08-10T10:00:00Z'), rad('Nyare', 'ej_startad', '2026-10-01T10:00:00Z'),
      rad('Påbörjad 1', 'pagaende', '2026-09-01T10:00:00Z'), rad('Klar 1', 'klar', '2026-05-01T10:00:00Z'),
    ], 3);
  });

  it('kortet är ett beslut: det som väntat längst, med avstånd, väntetid, typ, hektar — och "Starta ›"', async () => {
    h.vag = { 'o-Påbörjad 1': 3 };
    await montera_och_vanta();
    const kort = tid('beslutskort')!;
    // Påbörjade rundor går före (färdigställ innan du börjar nytt): ingen dragning → påbörjade först.
    expect(kort.textContent).toContain('Påbörjad 1');
    expect(kort.textContent).toContain('Fortsätt ›');
    expect(kort.textContent).toContain('3,0 km');
    expect(kort.textContent).toMatch(/väntat \d+ dagar/);
    expect(kort.textContent).toContain('Slutavverkning · 4,2 ha · 13 punkter');
  });

  it('säger när stickprovet börjar i stället för att tiga, och visar ingen "Den här månaden"', async () => {
    await montera_och_vanta();
    expect(text()).toContain('Månadens stickprov dras första gången 1 november.');
    expect(tid('manad')).toBeNull();
  });

  it('kategorierna har ETT ord och ett antal; "Starta på ett annat objekt" finns eftersom det finns objekt utan runda', async () => {
    await montera_och_vanta();
    expect(tid('kategori-påbörjade')!.textContent).toMatch(/^Påbörjade \(1\)/);
    expect(tid('kategori-klara')!.textContent).toMatch(/^Klara \(1\)/);
    expect(tid('kategori-starta-på-ett-annat-objekt')).not.toBeNull();
    expect(text()).toContain('3 äldre objekt saknar avslutsdatum');
  });

  it('raderna visar ALDRIG "N av M" eller "Pågår" — den siffran hör hemma inne i rundan', async () => {
    await montera_och_vanta();
    await klicka(tid('kategori-påbörjade'));
    expect(text()).not.toMatch(/\d+ av \d+/);
    expect(text()).not.toContain('Pågår');
    expect(tid('rad-o-Påbörjad 1')!.textContent).toContain('Påbörjad');
  });
});

describe('listan med en dragning', () => {
  beforeEach(() => {
    h.lista = async () => oversikt([
      rad('Dragen A', 'ej_startad', '2026-10-05T10:00:00Z'), rad('Dragen B', 'pagaende', '2026-10-06T10:00:00Z'), rad('Dragen C', 'klar', '2026-10-07T10:00:00Z'),
      rad('Gammal påbörjad', 'pagaende', '2026-08-01T10:00:00Z'), rad('Gammal klar', 'klar', '2026-05-01T10:00:00Z'), rad('Annat', 'ej_startad', '2026-07-01T10:00:00Z'),
    ]);
    h.stickprov = async () => dragning(['Dragen A', 'Dragen B', 'Dragen C']);
  });

  it('"Den här månaden" visar de dragna i dragningens ordning, hur många som är kvar, klusterraden och när det drogs', async () => {
    await montera_och_vanta();
    const manad = tid('manad')!;
    expect(manad.textContent).toContain('Den här månaden');
    expect(manad.textContent).toContain('2 kvar');
    const ordning = [...manad.querySelectorAll('[data-testid^="rad-"]')].map((e) => e.getAttribute('data-testid'));
    expect(ordning).toEqual(['rad-o-Dragen A', 'rad-o-Dragen B', 'rad-o-Dragen C']);
    expect(tid('kluster-rad')!.textContent).toBe('3 objekt · 14,8 km mellan de som ligger längst isär');
    expect(tid('dragen')!.textContent).toBe('Dragen 1 nov · förra månaden hade 6 objekt');
    expect(tid('forklaring')).toBeNull();   // blev det tre finns inget att förklara
  });

  it('kortet föredrar en påbörjad DRAGEN runda — före en dragen som inte är startad och före en gammal påbörjad', async () => {
    await montera_och_vanta();
    expect(tid('beslutskort')!.textContent).toContain('Dragen B');
    expect(tid('beslutskort')!.textContent).toContain('Fortsätt ›');
  });

  it('ett dragen objekt ligger på ETT ställe: antalet i Påbörjade och Klara räknar bara de som inte ingår i dragningen', async () => {
    await montera_och_vanta();
    expect(tid('kategori-påbörjade')!.textContent).toMatch(/^Påbörjade \(1\)/);
    expect(tid('kategori-klara')!.textContent).toMatch(/^Klara \(1\)/);
  });

  it('färre än tre: förklaringen står i klartext', async () => {
    h.stickprov = async () => dragning(['Dragen A', 'Dragen B'], { forklaring: 'for_langt', spridning_km: 5.2 });
    await montera_och_vanta();
    expect(tid('forklaring')!.textContent).toBe('Resten av förra månadens objekt ligger mer än 15 km från de dragna.');
    expect(tid('kluster-rad')!.textContent).toBe('2 objekt · 5,2 km mellan de som ligger längst isär');
  });

  it('en tom månad säger varför och visar ingen tom ruta', async () => {
    h.stickprov = async () => dragning([], { forklaring: 'inga_objekt', kandidater: [], spridning_km: null, ankare_objekt_id: null, ankare_forsok: null });
    await montera_och_vanta();
    expect(tid('manad')).toBeNull();
    expect(tid('forklaring')!.textContent).toBe('Inga objekt avslutades förra månaden.');
  });

  it('klar dragning → "Alla klara" och kortet tar det som väntat längst bland de påbörjade', async () => {
    h.lista = async () => oversikt([
      rad('Dragen A', 'klar', '2026-10-05T10:00:00Z'), rad('Gammal påbörjad', 'pagaende', '2026-08-01T10:00:00Z'), rad('Annat', 'ej_startad', '2026-07-01T10:00:00Z'),
    ]);
    h.stickprov = async () => dragning(['Dragen A']);
    await montera_och_vanta();
    expect(tid('manad')!.textContent).toContain('Alla klara');
    expect(tid('beslutskort')!.textContent).toContain('Gammal påbörjad');
  });
});

describe('kategorier som saknar innehåll finns inte', () => {
  it('inga påbörjade och inga klara → ingen kategorirad; inga ostartade → ingen länk', async () => {
    h.lista = async () => oversikt([rad('Ensam', 'ej_startad', '2026-10-01T10:00:00Z')]);
    h.stickprov = async () => dragning(['Ensam']);
    await montera_och_vanta();
    expect(tid('kategorier')).toBeNull();
    expect(tid('kategori-starta-på-ett-annat-objekt')).toBeNull();
  });

  it('inget alls → "Inget väntar på egenkontroll."', async () => {
    h.lista = async () => oversikt([]);
    await montera_och_vanta();
    expect(tid('inget-att-gora')!.textContent).toContain('Inget väntar på egenkontroll.');
  });
});

describe('Starta på ett annat objekt', () => {
  const lista = () => oversikt([
    rad('Nyast', 'ej_startad', '2026-10-02T10:00:00Z'), rad('Äldst', 'ej_startad', '2026-06-02T10:00:00Z'), rad('Mellan', 'ej_startad', '2026-08-02T10:00:00Z'),
    rad('Gallring 1', 'ej_startad', '2026-07-02T10:00:00Z', { typ: 'gallring' }),
    rad('GROT-jobb', 'ej_startad', '2026-01-01T10:00:00Z', { typ: 'grot' }),
  ]);

  it('listar längst väntat först, med typväljare när det finns två typer (flest förvald)', async () => {
    h.lista = async () => lista();
    await montera_och_vanta();
    await klicka(tid('kategori-starta-på-ett-annat-objekt'));
    expect(tid('underrubrik')!.textContent).toBe('Starta på ett annat objekt');
    expect(tid('typ-slutavverkning')!.getAttribute('aria-selected')).toBe('true');
    expect([...host!.querySelectorAll('[data-testid^="rad-"]')].map((e) => e.getAttribute('data-testid'))).toEqual(['rad-o-Äldst', 'rad-o-Mellan', 'rad-o-Nyast']);
    await klicka(tid('typ-gallring'));
    expect([...host!.querySelectorAll('[data-testid^="rad-"]')].map((e) => e.getAttribute('data-testid'))).toEqual(['rad-o-Gallring 1']);
  });

  it('GROT går inte att starta: den listas inte, och ingen rad pekar på det man inte kan göra', async () => {
    h.lista = async () => lista();
    await montera_och_vanta();
    expect(text()).not.toContain('annan typ');
    expect(text()).not.toContain('GROT');
    await klicka(tid('kategori-starta-på-ett-annat-objekt'));
    expect(text()).not.toContain('GROT-jobb');
    expect(text()).not.toContain('annan typ');
  });

  it('en enda typ → ingen väljare', async () => {
    h.lista = async () => oversikt([rad('A', 'ej_startad', '2026-06-02T10:00:00Z'), rad('B', 'ej_startad', '2026-06-03T10:00:00Z')]);
    await montera_och_vanta();
    await klicka(tid('kategori-starta-på-ett-annat-objekt'));
    expect(q('[role="tablist"]')).toBeNull();
  });

  it('tillbaka går till huvudlistan', async () => {
    h.lista = async () => lista();
    await montera_och_vanta();
    await klicka(tid('kategori-starta-på-ett-annat-objekt'));
    await klicka(tid('tillbaka'));
    expect(tid('beslutskort')).not.toBeNull();
  });
});

describe('avstånd, bilknapp och öppna objektet', () => {
  beforeEach(() => {
    h.lista = async () => oversikt([rad('Ett', 'ej_startad', '2026-08-10T10:00:00Z')]);
    h.stickprov = async () => dragning(['Ett']);
  });

  it('vägavstånd utan ~, fågelväg med ~, och inget avstånd alls utan position', async () => {
    h.vag = { 'o-Ett': 12.34 };
    await montera_och_vanta();
    expect(tid('rad-o-Ett')!.textContent).toContain('12,3 km');
    expect(tid('rad-o-Ett')!.textContent).not.toContain('~');
  });

  it('fågelväg visas med ~ i väntan på vägavståndet', async () => {
    await montera_och_vanta();
    expect(tid('rad-o-Ett')!.textContent).toMatch(/~\d/);
  });

  it('utan position: inget avstånd gissas, men bilknappen står kvar', async () => {
    h.position = UTAN_POSITION;
    await montera_och_vanta();
    expect(tid('rad-o-Ett')!.textContent).not.toMatch(/km|~/);
    expect(tid('bil-o-Ett')).not.toBeNull();
  });

  it('tryck på raden öppnar objektet; tryck på bilen startar navigeringen och öppnar INTE objektet', async () => {
    await montera_och_vanta();
    await klicka(tid('bil-o-Ett'));
    expect(h.navigerade).toHaveLength(1);
    expect(h.pushade).toEqual([]);
    await klicka(tid('rad-o-Ett'));
    expect(h.pushade).toEqual(['/egenkontroll/o-Ett']);
  });

  it('objekt utan plats: ingen bilknapp', async () => {
    h.lista = async () => oversikt([rad('Ett', 'ej_startad', '2026-08-10T10:00:00Z', { lat: null, lng: null })]);
    await montera_och_vanta();
    expect(tid('bil-o-Ett')).toBeNull();
  });
});

describe('ingen flikrad: listan går ut via hemknappen i toppfältet, inte via en bottennavigation', () => {
  const medRader = () => oversikt([rad('Ett', 'ej_startad', '2026-08-10T10:00:00Z'), rad('Pågår', 'pagaende', '2026-09-01T10:00:00Z')]);

  it('varken när listan laddas', async () => {
    h.lista = () => new Promise(() => {});
    await montera();
    expect(text()).toContain('Hämtar egenkontrollerna');
    expect(tid('bottennav')).toBeNull();
  });

  it('huvudlistan', async () => {
    h.lista = async () => medRader();
    await montera_och_vanta();
    expect(tid('bottennav')).toBeNull();
  });

  it('underlistan (Påbörjade, Starta på ett annat objekt)', async () => {
    h.lista = async () => medRader();
    await montera_och_vanta();
    await klicka(tid('kategori-påbörjade'));
    expect(tid('underrubrik')).not.toBeNull();
    expect(tid('bottennav')).toBeNull();
  });

  it('felläget', async () => {
    h.lista = async () => { throw new Error('nät'); };
    await montera_och_vanta();
    expect(tid('lista-fel')).not.toBeNull();
    expect(tid('bottennav')).toBeNull();
  });
});

describe('fel säger det', () => {
  it('listan går inte att läsa → fel med Försök igen, aldrig en tom lista', async () => {
    let antal = 0;
    h.lista = async () => { antal++; if (antal === 1) throw new Error('nät'); return oversikt([rad('Ett', 'ej_startad', '2026-08-10T10:00:00Z')]); };
    await montera_och_vanta();
    expect(tid('lista-fel')!.textContent).toContain('nät');
    expect(tid('inget-att-gora')).toBeNull();
    await klicka([...host!.querySelectorAll('button')].find((b) => b.textContent === 'Försök igen') as HTMLElement);
    await vantaTills(() => tid('beslutskort') !== null, 'listan efter Försök igen');
  });

  it('stickprovet går inte att läsa → eget fel, och listan finns kvar (ett fel tar inte ner det andra)', async () => {
    h.lista = async () => oversikt([rad('Ett', 'ej_startad', '2026-08-10T10:00:00Z')]);
    h.stickprov = async () => { throw new Error('rpc nere'); };
    await montera_och_vanta();
    expect(tid('stickprov-fel')!.textContent).toContain('rpc nere');
    expect(tid('beslutskort')).not.toBeNull();
    expect(text()).not.toContain('dras första gången');   // ett fel är inte "inget stickprov än"
  });
});
