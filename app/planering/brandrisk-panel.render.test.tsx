// @vitest-environment jsdom
// Brandriskpanelen i ny design (2026-11-16): svaret i ord först, färgerna ur appens regler, rader som fälls ut en i taget.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { FARG } from '@/lib/design/tokens';

const hamta = vi.fn();
vi.mock('../../lib/smhi-brandrisk', () => ({ fetchSmhiFwi: (...a: unknown[]) => hamta(...a) }));
import BrandriskPanel from './brandrisk-panel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NU = new Date(2026, 6, 14, 15, 10); // tisdag 14 juli kl 15:10
const iso = (d: Date) => d.toISOString().split('T')[0];
const timmar = (topp: number) => Array.from({ length: 24 }, (_, h) => (h >= 14 && h <= 17 ? topp : h >= 10 && h <= 20 ? Math.max(1, topp - 1) : 1));
const dagData = (i: number, namn: string, niva: number, regn = false) => ({ date: iso(new Date(NU.getTime() + i * 864e5)), dayName: namn, fwiIndex: niva, fwi: niva * 5, peakHour: 15, temp: '24°', wind: '↗ 6 m/s', windLevel: '', humidity: 'Torr luft', humLevel: 'dry', rain: regn, hourlyIdx: timmar(niva) });
const DATA = (niva: number) => ({ hourly: [], daily: [dagData(0, 'Tis', niva), dagData(1, 'Ons', 5), dagData(2, 'Tor', 2, true)], currentIdx: niva, currentFwi: 19, peakIdx: niva, peakFwi: 19, peakHour: 15, lowestIdx: 1, lowestStartHour: 0, lowestEndHour: 9, todayHourlyIdx: timmar(niva), location: '', updatedAt: NU.toISOString() });

const bas = () => ({
  lat: 56.6, lon: 15.8, objektNamn: 'Skälviken', koordFranObjekt: true, eldningsforbud: false, onEldningsforbudChange: vi.fn(),
  brandKontakter: { uppdragsgivareNamn: '', uppdragsgivareTel: '', forsakringsbolag: '', forsakringsnummer: '', raddningstjanstNamn: '', raddningstjanstTel: '' }, onKontakterChange: vi.fn(),
  brandTillbud: [], brandNewTillbud: { datum: '', beskrivning: '', atgard: '', rapporteradTill: '', photoData: '' }, onNewTillbudChange: vi.fn(), onSaveTillbud: vi.fn(),
  brandEfterkontroll: { datum: '', noteringar: '', kvitterad: false }, onEfterkontrollChange: vi.fn(),
  brandUtrustning: [true, false, true, false], onUtrustningChange: vi.fn(),
  larmLat: '56.65', larmLng: '15.85', larmBeskrivning: 'Bommen vid ladan', larmKalla: 'td' as const, larmBekraftad: false,
  brandLarmChecklista: [false, false, false, false, false], onLarmChecklistaChange: vi.fn(),
});

let rot: Root; let el: HTMLDivElement;
const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
async function rita(props: Partial<ReturnType<typeof bas>> = {}, niva = 4) {
  hamta.mockResolvedValue(DATA(niva));
  const p = { ...bas(), ...props };
  await act(async () => { rot.render(<BrandriskPanel {...p} />); });
  await act(async () => { await Promise.resolve(); });
  return p;
}
const tryck = async (n: Element | null) => { await act(async () => { (n as HTMLElement).click(); }); };

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NU); hamta.mockReset(); el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el); });
afterEach(() => { act(() => rot.unmount()); el.remove(); vi.useRealTimers(); });

describe('Brandriskpanelen', () => {
  it('svaret står i ord överst, före allt annat — ingen stor siffra, inget FWI på första skärmen', async () => {
    await rita();
    const svar = q('brand-svar')!;
    expect(svar.querySelector('h2')!.textContent).toBe('Stor brandrisk');
    expect(svar.textContent).toContain('Skälviken · just nu kl 15');
    expect(svar.textContent).toContain('Nivå 4');
    expect(svar.textContent).toContain('Farligast just nu – till kl 17');
    expect(svar.textContent).toContain('Lättar efter kl 17');
    expect(el.firstElementChild!.firstElementChild).toBe(svar);
    expect(el.textContent).not.toContain('FWI');
  });

  it('veckan: en rad per dag med ordet bredvid pricken, idag först; låg nivå dämpad', async () => {
    await rita();
    expect(q('brand-dag-0')!.textContent).toContain('Idag · Stor');
    expect(q('brand-dag-1')!.textContent).toContain('Ons · Mycket stor');
    expect(q('brand-dag-2')!.textContent).toContain('Tor · Liten · regn');
    expect(q('brand-dag-1')!.textContent).toContain('topp kl 15');
    expect(q('brand-dag-0')!.textContent).toContain('vind'); // idag är vald från start
    expect(q('brand-dag-1')!.textContent).not.toContain('vind');
  });

  it('tryck på en dag byter timmarna till den dagen och visar dess väder; svaret överst gäller fortfarande idag', async () => {
    await rita();
    await tryck(q('brand-dag-1'));
    expect(q('brand-dag-1')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('brand-dag-1')!.textContent).toContain('24° · vind ↗ 6 m/s · torr luft');
    expect(el.querySelector('section[aria-label="Onsdag timme för timme"]')).not.toBeNull();
    expect(q('brand-band')!.textContent).toContain('Väntad topp: mycket stor brandrisk efter lunch.');
    expect(q('brand-svar')!.querySelector('h2')!.textContent).toBe('Stor brandrisk');
  });

  it('timbandet: 24 tryckbara timmar på 44 px i nivåns färg; ett tryck säger nivån i ord', async () => {
    await rita();
    const celler = Array.from(q('brand-band')!.querySelectorAll('button'));
    expect(celler).toHaveLength(24);
    expect(celler.every((c) => c.style.height === '44px')).toBe(true);
    const rgb = (hex: string) => { const d = document.createElement('i'); d.style.background = hex; return d.style.background; };
    expect(celler[15].style.background).toBe(rgb(FARG.orange));
    expect(celler[2].style.background).toBe(rgb(FARG.text3));
    await tryck(celler[15]);
    expect(q('brand-timme')!.textContent).toBe('Kl 15: stor brandrisk · nivå 4');
  });

  it('rubriken över beredskapen byter med nivån; samråd bara från stor, utrustning bara från måttlig', async () => {
    await rita();
    expect(el.querySelector('section[aria-label="Vad gör vi vid stor brandrisk?"]')).not.toBeNull();
    expect(q('brand-samrad')).not.toBeNull();
    expect(q('brand-rad-utrustning')!.textContent).toContain('2 av 4');
    act(() => rot.unmount()); rot = createRoot(el);
    await rita({}, 2);
    expect(el.querySelector('section[aria-label="Vad gör vi vid liten brandrisk?"]')).not.toBeNull();
    expect(q('brand-samrad')).toBeNull();
    expect(q('brand-rad-utrustning')).toBeNull();
  });

  it('raderna fälls ut en i taget', async () => {
    await rita();
    expect(q('brand-inne-larm')).toBeNull();
    await tryck(q('brand-rad-larm'));
    expect(q('brand-inne-larm')!.textContent).toContain('56.65°N, 15.85°E');
    expect(q('brand-inne-larm')!.textContent).toContain('inte kontrollerad på plats');
    expect(q('brand-inne-larm')!.textContent).toContain('Bommen vid ladan');
    await tryck(q('brand-rad-utrustning'));
    expect(q('brand-inne-larm')).toBeNull();
    expect(q('brand-inne-utrustning')).not.toBeNull();
    await tryck(q('brand-rad-utrustning'));
    expect(q('brand-inne-utrustning')).toBeNull();
  });

  it('skrivningarna går till samma mottagare som förut', async () => {
    const p = await rita();
    await tryck(q('brand-eldningsforbud'));
    expect(p.onEldningsforbudChange).toHaveBeenCalledWith(true);
    await tryck(q('brand-rad-utrustning'));
    await tryck(q('brand-inne-utrustning')!.querySelectorAll('[role="checkbox"]')[1]);
    expect(p.onUtrustningChange).toHaveBeenCalledWith([true, true, true, false]);
    await tryck(q('brand-rad-efterkontroll'));
    await tryck(q('brand-efterkontroll-knapp'));
    expect(p.onEfterkontrollChange).toHaveBeenCalledWith({ datum: '', noteringar: '', kvitterad: true });
    await tryck(q('brand-rad-tillbud'));
    await tryck(q('brand-spara-tillbud'));
    expect(p.onSaveTillbud).toHaveBeenCalledTimes(1);
  });

  it('eldningsförbud sägs i rött under svaret', async () => {
    await rita({ eldningsforbud: true });
    expect(q('brand-forbud-rad')!.textContent).toBe('Eldningsförbud råder');
  });

  it('FWI står bara under "Vad betyder nivåerna?"', async () => {
    await rita();
    await tryck(q('brand-rad-nivaer'));
    expect(q('brand-inne-nivaer')!.textContent).toContain('FWI 19');
    expect(q('brand-inne-nivaer')!.textContent).toContain('5E · Extrem');
  });

  it('går SMHI inte att läsa visas ingen nivå — bara felet och Försök igen', async () => {
    hamta.mockRejectedValue(new Error('nät'));
    const fel = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => { rot.render(<BrandriskPanel {...bas()} />); });
    await act(async () => { await Promise.resolve(); });
    expect(q('brand-fel')!.textContent).toContain('Kunde inte hämta brandrisken');
    expect(q('brand-svar')).toBeNull();
    fel.mockRestore();
  });

  it('inga egna färger eller textstorlekar i filen — allt ur tokens', () => {
    const kod = readFileSync('app/planering/brandrisk-panel.tsx', 'utf8');
    expect(kod).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(kod).not.toMatch(/rgba?\(/);
    expect(kod).not.toMatch(/fontSize\s*:/);
    expect(kod).not.toMatch(/fontWeight\s*:/);
  });
});
