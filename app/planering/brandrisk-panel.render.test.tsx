// @vitest-environment jsdom
// Brandriskpanelen (2026-11-16, "så lätt att ett barn förstår det direkt"): första skärmen är fyra saker, allt annat bakom Mer.
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
const DATA = (niva: number) => ({ hourly: [], daily: [dagData(0, 'Tis', niva), dagData(1, 'Ons', 5), dagData(2, 'Tor', 2, true), dagData(3, 'Fre', 1), dagData(4, 'Lör', 1), dagData(5, 'Sön', 1), dagData(6, 'Mån', 1)], currentIdx: niva, currentFwi: 19, peakIdx: niva, peakFwi: 19, peakHour: 15, lowestIdx: 1, lowestStartHour: 0, lowestEndHour: 9, todayHourlyIdx: timmar(niva), location: '', updatedAt: NU.toISOString() });

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
  it('första skärmen är FYRA saker: svaret, veckan, Gör så här och Om det börjar brinna — plus Mer', async () => {
    await rita();
    const start = q('brand-vy-start')!;
    expect(Array.from(start.children).map((n) => (n as HTMLElement).dataset.testid ?? (n.querySelector('[data-testid]') as HTMLElement | null)?.dataset.testid))
      .toEqual(['brand-svar', 'brand-vecka', 'brand-gor', 'brand-rad-brinner', 'brand-rad-mer']);
    expect(start.querySelectorAll('button')).toHaveLength(7); // fem dagar, brinner, Mer
  });

  it('svaret sägs EN gång: nivån i ord och en mening — ingen siffra, inget FWI, ingen hjälptext', async () => {
    await rita();
    const svar = q('brand-svar')!;
    expect(svar.querySelector('h2')!.textContent).toBe('Stor brandrisk');
    expect(q('brand-svar-rad')!.textContent).toBe('Farligast nu, till kl 17.');
    expect(q('brand-ovan')).toBeNull();
    const text = q('brand-vy-start')!.textContent!;
    expect(text.match(/brandrisk/gi)).toHaveLength(1);
    for (const bort of ['FWI', 'Nivå', 'Tryck', 'topp kl', 'vind']) expect(text, bort).not.toContain(bort);
  });

  it('veckan är EN rad med fem prickar; ordet finns för skärmläsare; ett tryck byter svaret till den dagen', async () => {
    await rita();
    const dagar = Array.from(q('brand-vecka')!.querySelectorAll('button'));
    expect(dagar.map((d) => d.textContent)).toEqual(['Idag', 'Ons', 'Tor', 'Fre', 'Lör']);
    expect(dagar[1].getAttribute('aria-label')).toBe('Onsdag: Mycket stor brandrisk');
    expect(dagar.every((d) => parseInt(d.style.minHeight, 10) >= 44)).toBe(true);
    await tryck(q('brand-dag-1'));
    expect(q('brand-dag-1')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('brand-ovan')!.textContent).toBe('Onsdag');
    expect(q('brand-svar')!.querySelector('h2')!.textContent).toBe('Mycket stor brandrisk');
    expect(q('brand-svar-rad')!.textContent).toBe('Farligast kl 14 till 17.');
  });

  it('Gör så här: bara det som gäller vid nivån — stor risk två rader, 5E tre', async () => {
    await rita();
    expect(q('brand-gor')!.textContent).toBe('Gör så härSläckare, kratta och spade medPrata med uppdragsgivaren först');
    act(() => rot.unmount()); rot = createRoot(el);
    await rita({}, 6);
    expect(q('brand-gor')!.textContent).toContain('Inga band');
  });

  it('en vanlig novemberdag: "Liten brandrisk · Inget särskilt att göra." och ingen Gör så här', async () => {
    await rita({}, 2);
    expect(q('brand-svar')!.querySelector('h2')!.textContent).toBe('Liten brandrisk');
    expect(q('brand-svar-rad')!.textContent).toBe('Inget särskilt att göra.');
    expect(q('brand-gor')).toBeNull();
    expect(q('brand-rad-brinner')).not.toBeNull();
  });

  it('eldningsförbud sägs i rött under svaret och ger utrustningsraden även vid liten risk', async () => {
    await rita({ eldningsforbud: true }, 2);
    expect(q('brand-forbud-rad')!.textContent).toBe('Eldningsförbud råder');
    expect(q('brand-gor')!.textContent).toContain('Släckare, kratta och spade med');
  });

  it('Om det börjar brinna: Ring 112, larmkoordinaten och vad man säger; ‹ Brandrisk går tillbaka', async () => {
    const p = await rita();
    await tryck(q('brand-rad-brinner'));
    const vy = q('brand-vy-brinner')!;
    expect(vy.querySelector('h2')!.textContent).toBe('Ring 112');
    expect(q('brand-koordinat')!.textContent).toBe('56.65°N, 15.85°E');
    expect(vy.textContent).toContain('Platsen är inte kontrollerad på plats');
    expect(vy.textContent).toContain('Bommen vid ladan');
    await tryck(vy.querySelectorAll('[role="checkbox"]')[0]);
    expect(p.onLarmChecklistaChange).toHaveBeenCalledWith([true, false, false, false, false]);
    await tryck(q('brand-tillbaka'));
    expect(q('brand-vy-start')).not.toBeNull();
  });

  it('Mer rymmer resten, som rader som fälls ut en i taget', async () => {
    await rita();
    await tryck(q('brand-rad-mer'));
    const rader = Array.from(q('brand-vy-mer')!.querySelectorAll('[data-testid^="brand-rad-"]')).map((n) => (n as HTMLElement).dataset.testid);
    expect(rader).toEqual(['brand-rad-timmar', 'brand-rad-utrustning', 'brand-rad-kontakter', 'brand-rad-tillbud', 'brand-rad-efterkontroll', 'brand-rad-nivaer', 'brand-rad-kallor']);
    await tryck(q('brand-rad-timmar'));
    const celler = Array.from(q('brand-band')!.querySelectorAll('button'));
    expect(celler).toHaveLength(24);
    expect(celler.every((c) => c.style.height === '44px')).toBe(true);
    const rgb = (hex: string) => { const d = document.createElement('i'); d.style.background = hex; return d.style.background; };
    expect(celler[15].style.background).toBe(rgb(FARG.orange));
    expect(celler[2].style.background).toBe(rgb(FARG.text3));
    await tryck(celler[15]);
    expect(q('brand-timme')!.textContent).toBe('Kl 15: stor brandrisk');
    await tryck(q('brand-rad-nivaer'));
    expect(q('brand-inne-timmar')).toBeNull();
    expect(q('brand-inne-nivaer')!.textContent).toContain('FWI 19');
    expect(q('brand-inne-nivaer')!.textContent).toContain('5E · Extrem');
  });

  it('skrivningarna går till samma mottagare som förut', async () => {
    const p = await rita();
    await tryck(q('brand-rad-mer'));
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

  it('prognosen gäller kartans mitt när trakten saknar koordinat — det sägs', async () => {
    await rita({ koordFranObjekt: false });
    expect(q('brand-ovan')!.textContent).toBe('Gäller kartans mitt');
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
