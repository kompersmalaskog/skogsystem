// @vitest-environment jsdom
// Objektlistan i planeringsvyn (ark under 900 px, panel från 900 px): gruppering efter status, rad och km-knapp, stängning, rörelse.
// Verkligt DOM-beteende (jsdom) med en fake supabase/GPS/OSRM. Planeringssidan själv monteras inte (22 000 rader).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const h = vi.hoisted(() => ({ rader: [] as any[], fel: false }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve(h.fel ? { data: null, error: { message: 'nät' } } : { data: h.rader, error: null }) }) }) },
}));
vi.mock('@/lib/gpsKalla', () => ({ hamtaEnGpsFix: () => Promise.resolve({ giltig: true, lat: 56.4, lng: 14.7 }) }));

import ObjektLista from './ObjektLista';
import { sattBredd } from './PlusRad.testhjalp';
import { RORELSE } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RADER = [
  { id: 'v', namn: 'Vällust RP M-R -25', status: 'avslutat', typ: 'slutavverkning', bolag: 'Södra', volym: 900, lat: 56.5, lng: 14.8, ar: 2025, manad: 11, avslutad_timestamp: '2026-09-01T10:00:00Z' },
  { id: 'e', namn: 'Ekeby', status: 'planerad', typ: 'slutavverkning', bolag: 'Södra', volym: 1200, lat: 56.45, lng: 14.75, ar: 2026, manad: 10 },
  { id: 'g', namn: 'GROT Hjorthult', status: 'planerad', typ: 'grot', bolag: 'Vida', volym: 80, lat: 56.9, lng: 15.1 },
  { id: 'p', namn: 'Gallring Sjö', status: 'pagaende', typ: 'gallring', bolag: 'Södra', volym: 300, lat: 56.41, lng: 14.71 },
  { id: 'n', namn: 'Energi Norra', status: 'pagaende', typ: 'energiklippning', lat: 57.0, lng: 14.0 },
  { id: 'o', namn: 'Privat jobb', status: null, typ: 'gallring' },
  { id: 'a2', namn: 'Äldre avslutat', status: 'avslutat', typ: 'gallring', avslutad_timestamp: '2026-01-01T10:00:00Z' },
];

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
// setTimeout är fejkad (fake timers) — vänta bara på mikrotasks (fake supabase/GPS/OSRM svarar direkt).
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); }); };
const avancera = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const q = (id: string) => behallare!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const klicka = (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };

type Props = { oppen?: boolean; kanStangas?: boolean; valtId?: string | null };
const spion = { valj: [] as string[], nav: [] as string[], stang: 0 };
async function montera(p: Props = {}) {
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
  rot = createRoot(behallare);
  await visa(p);
}
async function visa(p: Props) {
  await act(async () => {
    rot!.render(<ObjektLista oppen={p.oppen ?? true} kanStangas={p.kanStangas ?? true} valtId={p.valtId ?? null}
      onValj={(o) => spion.valj.push(o.id)} onNavigera={(o) => spion.nav.push(o.id)} onStang={() => { spion.stang += 1; }} />);
  });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  h.rader = RADER; h.fel = false;
  spion.valj = []; spion.nav = []; spion.stang = 0;
  sattBredd(1280);
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    const m = /;(-?[\d.]+),(-?[\d.]+)\?/.exec(url);    // OSRM: …/lng,lat;lng,lat?  — vägavstånd = 1 000 × (lat − 56,4)·100 m, bara för att ge ett känt tal
    const lat = m ? parseFloat(m[2]) : 56.4;
    return { json: async () => ({ routes: [{ distance: Math.round((lat - 56.4) * 100 * 1000 + 19800) }] }) };
  });
});
afterEach(async () => { await act(async () => { rot?.unmount(); }); behallare?.remove(); rot = null; vi.useRealTimers(); });

describe('grupperna utgår från status', () => {
  it('Pågår först (grön prick), sedan Planerade och Oplanerade (grå prick); Avslutade är EN rad längst ner', async () => {
    await montera();
    const rubriker = Array.from(behallare!.querySelectorAll('[data-testid^="objekt-grupp-"]')).map((e) => e.textContent);
    expect(rubriker).toEqual(['Pågår', 'Planerade', 'Oplanerade']);
    const ordning = Array.from(behallare!.querySelectorAll('[data-testid^="objekt-rad-"]')).map((e) => e.getAttribute('data-testid')!.replace('objekt-rad-', ''));
    expect(ordning.slice(0, 2).sort()).toEqual(['n', 'p']);                  // Pågår
    expect(ordning.slice(2, 4).sort()).toEqual(['e', 'g']);                  // Planerade
    expect(ordning[4]).toBe('o');                                            // Oplanerade
    expect(ordning).toHaveLength(5);
    expect(q('objekt-lista-avslutade')!.textContent).toContain('Avslutade');
    expect(q('objekt-lista-avslutade')!.textContent).toContain('(2)');
    // prickar: Pågår = grön, övriga = grå
    const prickar = (id: string) => q(`objekt-rad-${id}`)!.querySelector('[data-testid^="objekt-prick-"]')!.getAttribute('data-testid');
    expect(prickar('p')).toBe('objekt-prick-gron');
    expect(prickar('n')).toBe('objekt-prick-gron');
    expect(prickar('e')).toBe('objekt-prick-gra');
    expect(prickar('o')).toBe('objekt-prick-gra');
  });

  it('Vällust RP M-R -25 (avslutat) syns ALDRIG under Planerade — bara under Avslutade, även med planerad månad satt', async () => {
    await montera();
    expect(q('objekt-rad-v')).toBeNull();
    klicka(q('objekt-lista-avslutade'));
    expect(q('objekt-rad-v')).not.toBeNull();
    expect(q('objekt-rad-a2')).not.toBeNull();
    expect(q('objekt-rad-e')).toBeNull();                                    // aktiva syns inte i Avslutade-vyn
    expect(q('objekt-lista')!.textContent).toContain('Avslutade');
    klicka(q('objekt-lista-tillbaka'));
    expect(q('objekt-rad-e')).not.toBeNull();
    expect(q('objekt-rad-v')).toBeNull();
  });

  it('GROT och energiklippning syns bland de aktiva; inga typknappar eller flikar', async () => {
    await montera();
    expect(q('objekt-rad-g')!.textContent).toContain('GROT Hjorthult');
    expect(q('objekt-rad-g')!.textContent).toContain('Grot');
    expect(q('objekt-rad-n')!.textContent).toContain('Energiklippning');
    const knappar = Array.from(behallare!.querySelectorAll('button')).map((b) => b.textContent);
    for (const typ of ['Alla', 'Slutavverkning', 'Gallring']) expect(knappar).not.toContain(typ);
    expect(behallare!.querySelector('[role="tab"]')).toBeNull();
    expect(behallare!.querySelector('[aria-pressed]')).toBeNull();
  });

  it('inom gruppen närmast först (km ur GPS-positionen)', async () => {
    await montera();
    const planerade = Array.from(behallare!.querySelectorAll('[data-testid^="objekt-rad-"]')).map((e) => e.getAttribute('data-testid')!.replace('objekt-rad-', '')).filter((i) => ['e', 'g'].includes(i));
    expect(planerade).toEqual(['e', 'g']);                                   // Ekeby 0,05° bort, GROT Hjorthult 0,5° bort
  });
});

describe('raden', () => {
  it('namn (fet) och under den typ · källa · m³', async () => {
    await montera();
    const rad = q('objekt-rad-e')!;
    expect(rad.textContent).toContain('Ekeby');
    expect(rad.textContent).toContain('Slutavverkning · Södra · 1 200 m³');
    expect(q('objekt-rad-n')!.textContent).toContain('Energiklippning');      // ingen källa/volym → bara typ, inget "–"
  });

  it('knappen till höger visar avståndet med decimalkomma och bil — och startar navigeringen, inte objektet', async () => {
    await montera();
    const km = q('objekt-km-e')!;
    expect(km.textContent).toMatch(/\d+,\d km/);
    expect(km.querySelector('svg')).not.toBeNull();
    klicka(km);
    expect(spion.nav).toEqual(['e']);
    expect(spion.valj).toEqual([]);
  });

  it('tryck på resten av raden öppnar objektet direkt (och startar ingen navigering)', async () => {
    await montera();
    klicka(q('objekt-rad-e'));
    expect(spion.valj).toEqual(['e']);
    expect(spion.nav).toEqual([]);
  });

  it('ingen koordinat → ingen km-knapp; raden går ändå att öppna', async () => {
    await montera();
    expect(q('objekt-km-o')).toBeNull();
    klicka(q('objekt-rad-o'));
    expect(spion.valj).toEqual(['o']);
  });

  it('det öppna objektet markeras (aria-current)', async () => {
    await montera({ valtId: 'e' });
    expect(q('objekt-rad-e')!.getAttribute('aria-current')).toBe('true');
    expect(q('objekt-rad-g')!.getAttribute('aria-current')).toBeNull();
  });
});

describe('sökning', () => {
  it('filtrerar på namn, källa och typ; tom träff säger vad som söktes', async () => {
    await montera();
    const sok = q('objekt-lista-sok') as HTMLInputElement;
    const skriv = (v: string) => act(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(sok, v); sok.dispatchEvent(new Event('input', { bubbles: true })); });
    skriv('eke');
    expect(q('objekt-rad-e')).not.toBeNull();
    expect(q('objekt-rad-g')).toBeNull();
    skriv('vida');
    expect(q('objekt-rad-g')).not.toBeNull();
    expect(q('objekt-rad-e')).toBeNull();
    skriv('xyz');
    expect(q('objekt-lista-innehall')!.textContent).toContain('Inget objekt matchar "xyz"');
  });
});

describe('tomma tillstånd', () => {
  it('inga objekt alls förklarar varför och vad som fyller listan', async () => {
    h.rader = [];
    await montera();
    expect(q('objekt-lista-innehall')!.textContent).toContain('Inga objekt ännu');
  });
  it('hämtfel säger vad man gör', async () => {
    h.fel = true;
    await montera();
    expect(q('objekt-lista-innehall')!.textContent).toContain('öppna den igen');
  });
});

describe('ark under 900 px, panel från 900 px — samma regel som plus-arket', () => {
  it.each([[1280, 'panel'], [1440, 'panel'], [900, 'panel'], [899, 'ark'], [390, 'ark']] as const)('%i px → %s', async (bredd, lage) => {
    sattBredd(bredd);
    await montera();
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe(lage);
    await avancera(50);
    const st = q('objekt-lista')!.style;
    if (lage === 'panel') { expect(st.right).toBe('8px'); expect(st.transform).toBe('translateX(0)'); }
    else { expect(st.bottom).toBe('0px'); expect(st.transform).toBe('translateY(0)'); expect(st.borderRadius).toBe('16px 16px 0 0'); }
  });

  it('samma rörelse som plus-arket: RORELSE.byte med RORELSE.kurva (inget överskjut), och ingen mörk bakgrund över kartan', async () => {
    await montera();
    await avancera(50);
    expect(q('objekt-lista')!.style.transition).toBe(`transform ${RORELSE.byte}ms ${RORELSE.kurva}`);
    expect(RORELSE.kurva).toBe('cubic-bezier(0.2, 0, 0, 1)');
    const fangst = q('objekt-lista-bakgrund')!;
    expect(fangst.style.background).toBe('');
    expect(fangst.style.opacity).toBe('');
  });

  it('bredden läses vid varje öppning (stängd på bred → smal → nästa öppning = ark)', async () => {
    await montera();
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe('panel');
    await visa({ oppen: false });
    await avancera(RORELSE.byte + 100);
    expect(q('objekt-lista')).toBeNull();
    sattBredd(820);
    await visa({ oppen: true });
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe('ark');
  });
});

describe('stängning', () => {
  it('× stänger', async () => {
    await montera();
    klicka(q('objekt-lista-stang'));
    expect(spion.stang).toBe(1);
  });
  it('Esc stänger', async () => {
    await montera();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(spion.stang).toBe(1);
  });
  it('tryck på kartan stänger — men inte i samma stund som listan öppnades (spöktryck)', async () => {
    await montera();
    klicka(q('objekt-lista-bakgrund'));
    expect(spion.stang).toBe(0);
    await avancera(500);
    klicka(q('objekt-lista-bakgrund'));
    expect(spion.stang).toBe(1);
  });
  it('utan valt objekt är listan det enda som finns: ingen ×, ingen fångst, Esc stänger inget', async () => {
    await montera({ kanStangas: false });
    expect(q('objekt-lista-stang')).toBeNull();
    expect(q('objekt-lista-bakgrund')).toBeNull();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(spion.stang).toBe(0);
  });
  it('stängd (oppen=false) glider den ut och försvinner ur DOM; Esc lyssnar inte längre', async () => {
    await montera();
    await visa({ oppen: false });
    expect(q('objekt-lista')!.getAttribute('data-oppen')).toBe('0');
    expect(q('objekt-lista')!.style.transform).toContain('translateX(calc(100%');
    expect(q('objekt-lista')!.style.pointerEvents).toBe('none');
    expect(q('objekt-lista-bakgrund')).toBeNull();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(spion.stang).toBe(0);
    await avancera(RORELSE.byte + 100);
    expect(q('objekt-lista')).toBeNull();
  });
  it('monterad stängd (sidan lämnar den monterad) ritar ingenting', async () => {
    await montera({ oppen: false });
    expect(behallare!.innerHTML).toBe('');
  });
  it('varje öppning börjar rent: tom sökning och aktiva objekt', async () => {
    await montera();
    klicka(q('objekt-lista-avslutade'));
    expect(q('objekt-lista')!.textContent).toContain('Avslutade');
    await visa({ oppen: false });
    await avancera(RORELSE.byte + 100);
    await visa({ oppen: true });
    expect(q('objekt-rad-e')).not.toBeNull();
    expect((q('objekt-lista-sok') as HTMLInputElement).value).toBe('');
  });
});

describe('källvakt: designtokens, inga literaler', () => {
  it('ObjektLista importerar tokens och har inga färgliteraler eller egna textstorlekar', () => {
    const kalla = readFileSync(resolve(process.cwd(), 'components/planering/ObjektLista.tsx'), 'utf8');
    expect(kalla).toContain("from '@/lib/design/tokens'");
    expect(kalla.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(kalla.match(/fontSize:\s*\d/g)).toBeNull();
  });
});
