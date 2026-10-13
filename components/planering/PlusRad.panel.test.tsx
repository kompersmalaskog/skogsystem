// @vitest-environment jsdom
// PLUS-ARKET som panel på bred skärm: skärmens BREDD styr (< 900 px ark nerifrån, ≥ 900 px panel från höger), SAMMA komponent.
// Verkligt DOM-beteende (jsdom), inte textvakter. "Under 900 px oförändrat" jämförs mot golden-filer som genererades ur MAINS PlusRad/PlusArk
// (före panelen) med samma testhjälp — HTML:en ska vara bit för bit densamma.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PlusRad } from './PlusRad';
import { PlusArk } from './PlusArk';
import { montera, renderaHtml, sattBredd, Styrd, type Monterad, type Spion } from './PlusRad.testhjalp';
import { createRoot } from 'react-dom/client';
import { PANEL_BREDD_PX, PANEL_MIN_BREDD_PX, plusLage } from '@/lib/plusArk';
import { RORELSE } from '@/lib/design/tokens';

const lasFil = (rel: string) => readFileSync(resolve(process.cwd(), 'components/planering', rel), 'utf8');
const golden = (n: string) => lasFil(`__fixtures__/${n}.html`);
const avancera = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const q = (m: Monterad, id: string) => m.behallare.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const klicka = (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };
const ut = RORELSE.byte + 100;   // glid-ut + marginal

let m: Monterad | null = null;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { m?.avmontera(); m = null; vi.useRealTimers(); });

describe('bredden avgör — lib/plusArk.plusLage', () => {
  it('899 px = ark, 900 px = panel', () => {
    expect(plusLage(PANEL_MIN_BREDD_PX - 1)).toBe('ark');
    expect(plusLage(PANEL_MIN_BREDD_PX)).toBe('panel');
    expect([390, 768, 899].map(plusLage)).toEqual(['ark', 'ark', 'ark']);
    expect([900, 1280, 1440].map(plusLage)).toEqual(['panel', 'panel', 'panel']);
  });
});

describe('under 900 px: arket är OFÖRÄNDRAT mot main (HTML bit för bit)', () => {
  it.each([
    ['main_ark_390_symboler', 390, 'symboler'],
    ['main_ark_390_rita', 390, 'rita'],
    ['main_ark_390_lager', 390, 'lager'],
    ['main_ark_800_symboler', 800, 'symboler'],
  ] as const)('%s', (fil, bredd, flik) => {
    sattBredd(bredd);
    expect(renderaHtml(PlusRad, flik, (ms) => vi.advanceTimersByTime(ms))).toBe(golden(fil));
  });
  it('dockan är oförändrad mot main i båda lägena (390 och 1280)', () => {
    sattBredd(390);
    expect(renderaHtml(PlusRad, null, (ms) => vi.advanceTimersByTime(ms))).toBe(golden('main_docka_390'));
    sattBredd(1280);
    expect(renderaHtml(PlusRad, null, (ms) => vi.advanceTimersByTime(ms))).toBe(golden('main_docka_1280'));
  });
  it('arket försvinner direkt vid stängning (ingen glid-ut under 900 px)', () => {
    sattBredd(390);
    m = montera(PlusRad, 'symboler'); avancera(50);
    expect(q(m, 'plus-alla-panel')).not.toBeNull();
    klicka(q(m, 'plus-alla-stang'));
    expect(m.behallare.innerHTML).toBe('');
  });
});

describe.each([[1280, 800], [1440, 900]])('%i×%i: panelen från höger', (bredd) => {
  beforeEach(() => sattBredd(bredd));

  it('stängd från början: plus → Alla öppnar panelen (samma komponent, samma flikar)', () => {
    m = montera(PlusRad, null); avancera(50);
    expect(q(m, 'plus-alla-panel')).toBeNull();   // bara dockan
    klicka(q(m, 'plus-alla'));
    avancera(50);
    const p = q(m, 'plus-alla-panel')!;
    expect(p.getAttribute('data-lage')).toBe('panel');
    expect(p.getAttribute('data-oppen')).toBe('1');
    expect(q(m, 'plus-ark-grepp')).toBeNull();   // inget drag-grepp: en panel är inte ett ark
    expect(Array.from(m.behallare.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual(['Symboler', 'Rita & mät', 'Lager']);
    expect(q(m, 'plus-ark-redigera')).not.toBeNull();
  });

  it('panelen: höger sida, ~380 px, full höjd med marginal, rundade hörn, glider in utan studs — och ingen mörk bakgrund', () => {
    m = montera(PlusRad, 'symboler');
    const p = q(m, 'plus-alla-panel')!;
    expect(p.style.right).toBe('8px');
    // jsdom tolkar inte min()/calc(env()) och släpper dem — bredd och marginaler (top/bottom) läses därför ur källan nedan.
    expect(PANEL_BREDD_PX).toBe(380);
    expect(lasFil('PlusArk.tsx')).toContain('width: `min(${PANEL_BREDD_PX}px, calc(100vw - ${2 * AVSTAND.s}px))`');
    expect(lasFil('PlusArk.tsx')).toContain("top: `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.s}px)`, right: AVSTAND.s, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${AVSTAND.s}px)`");
    expect(p.style.borderRadius).toBe('16px');
    expect(p.style.transform).toContain('translateX(calc(100%'); // utanför skärmen vid montering…
    avancera(50);
    expect(p.style.transform).toBe('translateX(0)');           // …och inne efter en bildruta
    expect(p.style.transition).toBe(`transform ${RORELSE.byte}ms ${RORELSE.kurva}`);
    expect(RORELSE.byte).toBeGreaterThanOrEqual(200);
    expect(RORELSE.byte).toBeLessThanOrEqual(250);
    expect(RORELSE.kurva).toBe('cubic-bezier(0.2, 0, 0, 1)');  // y1 ≤ 1 → inget överskjut
    const fangst = q(m, 'plus-bakgrund')!;
    expect(fangst.style.background).toBe('');                   // osynlig fångst, inget mörkt lager över kartan
    expect(fangst.style.backgroundColor).toBe('');
    expect(fangst.style.opacity).toBe('');
  });

  it.each([
    ['en symbol', 'plus-alla-symbol:wet'],
    ['Rita linje', 'plus-rita-linje'],
    ['Mät sträcka', 'plus-rita-strackan'],
  ])('att välja %s glider panelen undan direkt', (_n, id) => {
    m = montera(PlusRad, id.startsWith('plus-rita') ? 'rita' : 'symboler'); avancera(50);
    const p = q(m, 'plus-alla-panel')!;
    klicka(q(m, id));
    expect(p.getAttribute('data-oppen')).toBe('0');            // direkt, samma tick som valet
    expect(p.style.transform).toContain('translateX(calc(100%');
    expect(p.getAttribute('aria-hidden')).toBe('true');
    expect(p.style.pointerEvents).toBe('none');
    expect(q(m, 'plus-bakgrund')).toBeNull();                  // kartan fri direkt: ingen fångst som tar trycket
    avancera(ut);
    expect(q(m, 'plus-alla-panel')).toBeNull();                // borta ur DOM när rörelsen är klar
    expect(m.spion.post.length + m.spion.rita.length).toBe(1);
  });

  it('× stänger', () => {
    m = montera(PlusRad, 'symboler'); avancera(50);
    klicka(q(m, 'plus-alla-stang'));
    expect(q(m, 'plus-alla-panel')!.getAttribute('data-oppen')).toBe('0');
    expect(m.spion.stang).toBe(1);
    avancera(ut);
    expect(q(m, 'plus-alla-panel')).toBeNull();
  });

  it('Esc stänger — och lyssnar inte längre efter att den glidit undan', () => {
    m = montera(PlusRad, 'symboler'); avancera(50);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(q(m, 'plus-alla-panel')!.getAttribute('data-oppen')).toBe('0');
    expect(m.spion.stang).toBe(1);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(m.spion.stang).toBe(1);
  });

  it('tryck/klick på kartan stänger (men inte i samma stund som den öppnades — långtryckets släpp)', () => {
    m = montera(PlusRad, 'symboler'); avancera(50);
    klicka(q(m, 'plus-bakgrund'));
    expect(q(m, 'plus-alla-panel')!.getAttribute('data-oppen')).toBe('1');   // < 450 ms efter monteringen: ignoreras
    avancera(500);
    klicka(q(m, 'plus-bakgrund'));
    expect(q(m, 'plus-alla-panel')!.getAttribute('data-oppen')).toBe('0');
    expect(m.spion.stang).toBe(1);
    avancera(ut);
    expect(q(m, 'plus-alla-panel')).toBeNull();
  });

  it('ett lager-tryck stänger inte panelen (som i arket)', () => {
    m = montera(PlusRad, 'lager'); avancera(50);
    klicka(q(m, 'plus-lager-bakgrund-lm'));
    expect(q(m, 'plus-alla-panel')!.getAttribute('data-oppen')).toBe('1');
  });

  it('Redigera finns och fungerar i panelen (samma komponent): dockkortet visas, Klar stänger Redigera', () => {
    m = montera(PlusRad, 'symboler'); avancera(50);
    klicka(q(m, 'plus-ark-redigera'));
    expect(q(m, 'plus-ark-dockkort')).not.toBeNull();
    klicka(q(m, 'plus-ark-klar'));
    expect(q(m, 'plus-ark-dockkort')).toBeNull();
    expect(q(m, 'plus-alla-panel')!.getAttribute('data-oppen')).toBe('1');
  });
});

describe('bredden avgörs VARJE gång plus öppnas', () => {
  // Samma PlusRad-instans hela tiden (ingen ny nyckel) — så provet fångar att läget läses vid öppningen och inte bara vid första renderingen.
  const upplagg = (start: string) => {
    const behallare = document.createElement('div');
    document.body.appendChild(behallare);
    const rot = createRoot(behallare);
    const spion: Spion = { post: [], stang: 0, rita: [] };
    const visa = (oppen: boolean) => act(() => { rot.render(<Styrd Komp={PlusRad} oppen={oppen} start={start} spion={spion} />); });
    const lage = () => behallare.querySelector('[data-testid="plus-alla-panel"]')?.getAttribute('data-lage') ?? (behallare.querySelector('[data-testid="plus-ark-grepp"]') ? 'ark' : 'inget');
    return { visa, lage, behallare, avmontera: () => { act(() => rot.unmount()); behallare.remove(); } };
  };

  it('stängd på bred skärm, fönstret smalnar (iPad vrids), nästa öppning = ark', () => {
    sattBredd(1280);
    const u = upplagg('symboler');
    u.visa(true); avancera(50);
    expect(u.lage()).toBe('panel');
    u.visa(false); avancera(ut);
    expect(u.behallare.innerHTML).toBe('');
    sattBredd(820);                       // vriden iPad / ändrat fönster medan menyn är stängd
    u.visa(true); avancera(50);
    expect(u.lage()).toBe('ark');
    u.avmontera();
  });

  it('stängd på smal skärm, fönstret breddas, nästa öppning = panel — och den glider ut som vanligt', () => {
    sattBredd(820);
    const u = upplagg('symboler');
    u.visa(true); avancera(50);
    expect(u.lage()).toBe('ark');
    u.visa(false);
    expect(u.behallare.innerHTML).toBe('');
    sattBredd(1180);
    u.visa(true); avancera(50);
    expect(u.lage()).toBe('panel');
    expect(u.behallare.querySelector('[data-testid="plus-alla-panel"]')!.getAttribute('data-oppen')).toBe('1');
    u.visa(false);                        // nästa stängning ska animeras igen (utglidet nollställs vid öppningen)
    expect(u.behallare.querySelector('[data-testid="plus-alla-panel"]')!.getAttribute('data-oppen')).toBe('0');
    avancera(ut);
    expect(u.behallare.innerHTML).toBe('');
    u.avmontera();
  });

  it('byte MEDAN den är öppen behövs inte: ramen ligger fast tills nästa öppning (ingen omkoppling mitt i)', () => {
    sattBredd(1280);
    const u = upplagg('symboler');
    u.visa(true); avancera(50);
    expect(u.lage()).toBe('panel');
    sattBredd(700);
    act(() => { window.dispatchEvent(new Event('resize')); });
    avancera(50);
    expect(u.lage()).toBe('panel');
    u.avmontera();
  });

  it('en panel som glider ut byter inte ram om bredden ändras under utglidningen', () => {
    sattBredd(1280);
    const u = upplagg('symboler');
    u.visa(true); avancera(50);
    u.visa(false);
    sattBredd(600);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(u.lage()).toBe('panel');
    expect(u.behallare.querySelector('[data-testid="plus-alla-panel"]')!.getAttribute('data-oppen')).toBe('0');
    avancera(ut);
    expect(u.behallare.innerHTML).toBe('');
    u.avmontera();
  });
});

describe('samma komponent — ingen kopia', () => {
  it('PlusRad renderar PlusArk i båda lägena och bara lage skiljer', () => {
    const rad = lasFil('PlusRad.tsx');
    expect((rad.match(/<PlusArk\b/g) || []).length).toBe(1);
    expect(rad).toContain('lage={lage}');
    expect(rad).toContain('plusLage(window.innerWidth)');
    expect(rad).not.toContain("addEventListener('resize'");   // läget läses vid öppningen, inte via lyssnare
    const ark = lasFil('PlusArk.tsx');
    expect((ark.match(/export function PlusArk/g) || []).length).toBe(1);
    expect((ark.match(/data-testid="plus-alla-panel"/g) || []).length).toBe(2);   // ramen: en för panelen, en för arket — innehållet (rubrikRad/innehallRad) delas
    expect((ark.match(/\{rubrikRad\}/g) || []).length).toBe(2);
    expect((ark.match(/\{innehallRad\}/g) || []).length).toBe(2);
    expect(PlusArk).toBeTypeOf('function');
  });
});
