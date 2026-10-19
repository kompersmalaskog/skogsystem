// @vitest-environment jsdom
// Skotarens lassvyer renderade på riktigt: kortet efter lossning, Ändra lasset, kvar, färdigskotad, morgonkort, avläggets "skotat hit" och pillen med kvar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { LossningsKort, NyttAvlaggKort } from './LossningsKort';
import { AndraLassArk } from './AndraLassArk';
import { KvarArk } from './KvarArk';
import { FardigskotadKort } from './FardigskotadKort';
import { MorgonKortVy, VaderLista } from './VaderMorgon';
import { AvlaggSkotatSektion } from './AvlaggSkotatSektion';
import { KorvyObjektPill } from '../KorvyObjektPill';
import { beraknaKvar, farduskotatKontroll, kvarSammanfattning } from '@/lib/skotarLass/kvar';
import { skotatTillAvlagg } from '@/lib/skotarLass/avlaggStat';
import type { Avlagg, Lass } from '@/lib/skotarLass/typer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let div: HTMLDivElement;
beforeEach(() => { div = document.createElement('div'); document.body.appendChild(div); root = createRoot(div); });
afterEach(async () => { await act(async () => { root.unmount(); }); div.remove(); });
const visa = async (el: React.ReactElement) => { await act(async () => { root.render(el); }); };
const q = (id: string) => div.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const tryck = async (id: string) => { const e = q(id); if (!e) throw new Error(`saknas: ${id}`); await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

const A2: Avlagg = { id: 'vida:2', nummer: '2', kalla: 'vida', lat: 56.6, lng: 15.8 };
const A3: Avlagg = { id: 'vida:3', nummer: '3', kalla: 'vida', lat: 56.6001, lng: 15.8 };
const lass = (over: Partial<Lass> = {}): Lass => ({
  id: 'l7', objektId: 'o', voNummer: '555', maskinId: 'M', medarbetareId: null, lassNummer: 7, datum: '2026-10-19', status: 'foreslaget', bekraftadAv: null, bekraftadTid: null,
  sparPunkter: [], vagar: [], skapad: '2026-10-19T08:00:00.000Z', andrad: '2026-10-19T08:00:00.000Z',
  delar: [{ delNr: 1, avlaggId: 'vida:2', avlaggNummer: '2', lossadTid: '2026-10-19T12:12:00.000Z', lat: 56.6, lng: 15.8,
    rader: [{ nyckel: 'tallkubb', namn: 'Kubb: Tall_V3', m3: 5 }, { nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 10 }, { nyckel: 'bjorkmassa', namn: 'Massa: Bjork_V3', m3: 3 }] }],
  ...over,
});

describe('LossningsKort', () => {
  it('auto: rubrik, sortiment störst först, summa, Ändra och en linje som fylls på 10 s', async () => {
    const onAndra = vi.fn();
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 1, fas: 'auto', start: 1 }} lass={lass()} avlagg={[A2]} onAndra={onAndra} onFyllI={vi.fn()} onValjAvlagg={vi.fn()} onTaBort={vi.fn()} />);
    expect(q('lossningskort')?.textContent).toContain('Lass 7 lossat → Avlägg 2');
    expect(q('lossningskort')?.textContent).toContain('18 m³');
    expect(q('lossningskort')?.textContent).toMatch(/Timmer.*10.*Kubb.*5.*Massa.*3/);
    expect((q('lossning-linje') as HTMLElement).style.transition).toContain('10000ms');
    await tryck('lossning-andra');
    expect(onAndra).toHaveBeenCalledTimes(1);
  });
  it('forare: ingen linje, stor knapp "Fyll i"', async () => {
    const onFyllI = vi.fn();
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 1, fas: 'forare', start: 1 }} lass={lass({ status: 'vantar_forare' })} avlagg={[A2]} onAndra={vi.fn()} onFyllI={onFyllI} onValjAvlagg={vi.fn()} onTaBort={vi.fn()} />);
    expect(q('lossning-linje')).toBeNull();
    await tryck('lossning-fyll-i');
    expect(onFyllI).toHaveBeenCalled();
  });
  it('del 2 heter "Lass 7 · del 2"', async () => {
    const l = lass(); l.delar.push({ delNr: 2, avlaggId: 'vida:3', avlaggNummer: '3', lossadTid: '2026-10-19T12:20:00.000Z', lat: 56.6001, lng: 15.8, rader: [] });
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 2, fas: 'forare', start: 1 }} lass={l} avlagg={[A2, A3]} onAndra={vi.fn()} onFyllI={vi.fn()} onValjAvlagg={vi.fn()} onTaBort={vi.fn()} />);
    expect(q('lossningskort')?.textContent).toContain('Lass 7 · del 2 lossat → Avlägg 3');
  });
  it('avlagg_val: stora knappar med möjliga avlägg', async () => {
    const onValj = vi.fn();
    const l = lass(); l.delar[0].avlaggId = null; l.delar[0].avlaggNummer = null;
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 1, fas: 'avlagg_val', start: 1 }} lass={l} avlagg={[A2, A3]} onAndra={vi.fn()} onFyllI={vi.fn()} onValjAvlagg={onValj} onTaBort={vi.fn()} />);
    await tryck('avlagg-val-3');
    expect(onValj).toHaveBeenCalledWith(A3);
  });
  it('alla tryckytor är minst 56 px höga', async () => {
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 1, fas: 'forare', start: 1 }} lass={lass({ status: 'vantar_forare' })} avlagg={[A2]} onAndra={vi.fn()} onFyllI={vi.fn()} onValjAvlagg={vi.fn()} onTaBort={vi.fn()} />);
    for (const b of Array.from(div.querySelectorAll('button'))) expect(parseInt((b as HTMLElement).style.minHeight || '0', 10) >= 56 || parseInt((b as HTMLElement).style.minWidth || '0', 10) >= 56).toBe(true);
  });
});

describe('NyttAvlaggKort', () => {
  it('Ja / Nej', async () => {
    const svar = vi.fn();
    await visa(<NyttAvlaggKort fraga={{ lat: 1, lng: 2, ts: 3 }} nummer="4" onSvar={svar} />);
    expect(q('nytt-avlagg-kort')?.textContent).toContain('Nytt avlägg här?');
    expect(q('nytt-avlagg-kort')?.textContent).toContain('Avlägg 4');
    await tryck('nytt-avlagg-ja'); await tryck('nytt-avlagg-nej');
    expect(svar.mock.calls).toEqual([[true], [false]]);
  });
});

describe('AndraLassArk', () => {
  const valbara = [{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 0 }, { nyckel: 'granmassa', namn: 'Massa: Gran_V3', m3: 0 }, { nyckel: 'ved_markagare', namn: 'Ved markägare', m3: 0 }];
  const rendera = (l: Lass, fn: Partial<Parameters<typeof AndraLassArk>[0]> = {}) => visa(
    <AndraLassArk lass={l} delNr={1} avlagg={[A2, A3]} valbara={valbara} onRad={vi.fn()} onAvlagg={vi.fn()} onKlar={vi.fn()} onAvbryt={vi.fn()} onTaBort={vi.fn()} {...fn} />);
  it('summan överst, en rad per sortiment med − och +, tillägg för det som saknas inkl. Ved markägare', async () => {
    await rendera(lass());
    expect(q('andra-summa')?.textContent).toContain('18');
    expect(q('andra-rad-talltimmer')).not.toBeNull();
    expect(q('tillagg-granmassa')).not.toBeNull();
    expect(q('tillagg-ved_markagare')?.textContent).toContain('Ved markägare');
    expect(q('tillagg-talltimmer')).toBeNull();   // finns redan på lasset
  });
  it('+ och − ger ett m³ i taget', async () => {
    const onRad = vi.fn();
    await rendera(lass(), { onRad });
    await tryck('plus-talltimmer'); await tryck('minus-talltimmer'); await tryck('tillagg-granmassa');
    expect(onRad.mock.calls.map((c) => c[1])).toEqual([1, -1, 1]);
  });
  it('Klar är grå utan sortiment/avlägg och aktiv när lasset går att bekräfta', async () => {
    const tomt = lass({ status: 'vantar_forare' }); tomt.delar[0].rader = [];
    await rendera(tomt);
    expect((q('andra-klar') as HTMLButtonElement).disabled).toBe(true);
    await rendera(lass());
    expect((q('andra-klar') as HTMLButtonElement).disabled).toBe(false);
  });
  it('avlägget går att byta; ta bort kräver bekräftelse', async () => {
    const onAvlagg = vi.fn(); const onTaBort = vi.fn();
    await rendera(lass(), { onAvlagg, onTaBort });
    await tryck('andra-avlagg'); await tryck('andra-avlagg-3');
    expect(onAvlagg).toHaveBeenCalledWith(A3);
    await tryck('andra-ta-bort');
    expect(onTaBort).not.toHaveBeenCalled();
    await tryck('andra-ta-bort-ja');
    expect(onTaBort).toHaveBeenCalled();
  });
  it('Avbryt och Klar', async () => {
    const onAvbryt = vi.fn(); const onKlar = vi.fn();
    await rendera(lass(), { onAvbryt, onKlar });
    await tryck('andra-avbryt'); await tryck('andra-klar');
    expect(onAvbryt).toHaveBeenCalled(); expect(onKlar).toHaveBeenCalled();
  });
});

describe('AndraLassArk: stor pekskärm i en skakande hytt', () => {
  const sortiment = (n: number) => Array.from({ length: n }, (_, i) => ({ nyckel: `s${i}`, namn: `Massa: Sort${i}_V3`, m3: 0 }));
  const valbara = [{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 0 }];
  const rendera = (fn: Partial<Parameters<typeof AndraLassArk>[0]> = {}) => visa(
    <AndraLassArk lass={lass()} delNr={1} avlagg={[A2, A3]} valbara={valbara} onRad={vi.fn()} onAvlagg={vi.fn()} onKlar={vi.fn()} onAvbryt={vi.fn()} onTaBort={vi.fn()} {...fn} />);
  const pekare = async (id: string, typ: 'pointerdown' | 'pointerup' | 'pointercancel') => {
    const e = q(id); if (!e) throw new Error(`saknas: ${id}`);
    await act(async () => { e.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); });
  };
  const px = (v: string | number | undefined) => parseFloat(String(v ?? '0'));

  it('arket är centrerat och ca 640 px brett (full bredd minus marginal på smal skärm)', async () => {
    await rendera();
    const panel = q('andra-lass') as HTMLElement;
    expect(panel.style.maxWidth).toBe('640px');
    expect(panel.style.width).toBe('100%');
    const ram = panel.parentElement as HTMLElement;
    expect(ram.style.justifyContent).toBe('center');
    expect(px(ram.style.paddingLeft)).toBeGreaterThan(0);   // marginal mot skärmkanten när skärmen är smalare än arket
  });
  it('rader ≥ 56 px, − och + minst 48×48, siffran 22–24 px fet', async () => {
    await rendera();
    expect(px((q('andra-rad-talltimmer') as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(56);
    for (const id of ['minus-talltimmer', 'plus-talltimmer']) {
      const b = q(id) as HTMLElement;
      expect(px(b.style.width)).toBeGreaterThanOrEqual(48); expect(px(b.style.height)).toBeGreaterThanOrEqual(48);
    }
    const siffra = q('andra-siffra-talltimmer') as HTMLElement;
    expect(px(siffra.style.fontSize)).toBeGreaterThanOrEqual(22); expect(px(siffra.style.fontSize)).toBeLessThanOrEqual(24);
    expect(siffra.style.fontWeight).toBe('700');
    expect(siffra.textContent).toBe('10');
  });
  it('namnen i två nivåer: sortimentet vitt/semibold, mottagaren grå', async () => {
    await rendera({ valbara: [...valbara, { nyckel: 'k', namn: 'Timmer: Vislanda_195_1-2_V3', m3: 0 }] });
    const rad = (q('andra-rad-talltimmer') as HTMLElement).querySelectorAll('span span');
    expect(rad[0].textContent).toBe('Timmer'); expect((rad[0] as HTMLElement).style.fontWeight).toBe('600');
    expect(rad[1].textContent?.trim()).toBe('Tall');
    const tillagg = (q('tillagg-k') as HTMLElement).textContent ?? '';
    expect(tillagg).toContain('Timmer 195 1-2'); expect(tillagg).toContain('Vislanda');
  });

  describe('håll in − / +', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    it('ett steg direkt, upprepning medan man håller, stopp när man släpper', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await pekare('plus-talltimmer', 'pointerdown');
      expect(onRad).toHaveBeenCalledTimes(1);
      await act(async () => { vi.advanceTimersByTime(300); });
      expect(onRad).toHaveBeenCalledTimes(1);   // ännu ingen upprepning
      await act(async () => { vi.advanceTimersByTime(100 + 120 * 5); });
      expect(onRad.mock.calls.length).toBeGreaterThanOrEqual(6);
      expect(onRad.mock.calls.every((c) => c[1] === 1)).toBe(true);
      await pekare('plus-talltimmer', 'pointerup');
      const efter = onRad.mock.calls.length;
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onRad).toHaveBeenCalledTimes(efter);
      // webbläsaren skickar ett klick efter släppet — det får inte ge ett extra steg
      await tryck('plus-talltimmer');
      expect(onRad).toHaveBeenCalledTimes(efter);
    });
    it('minus räknar neråt; efter ca 1,5 s går det snabbare; avbrutet tryck stoppar', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await pekare('minus-talltimmer', 'pointerdown');
      await act(async () => { vi.advanceTimersByTime(1500); });
      const vid15 = onRad.mock.calls.length;
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(onRad.mock.calls.length - vid15).toBeGreaterThanOrEqual(8);   // 50 ms-takt (långsam takt hade gett ~4)
      expect(onRad.mock.calls.every((c) => c[1] === -1)).toBe(true);
      await pekare('minus-talltimmer', 'pointercancel');
      const stopp = onRad.mock.calls.length;
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(onRad).toHaveBeenCalledTimes(stopp);
    });
  });

  describe('tryck på siffran skriver värdet direkt', () => {
    const skriv = async (v: string) => {
      const f = q('andra-siffra-talltimmer-falt') as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(f, v);
        f.dispatchEvent(new Event('input', { bubbles: true }));
      });
      return f;
    };
    it('Enter sparar: skillnaden mot dagens värde skickas som ett steg', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await tryck('andra-siffra-talltimmer');
      const f = await skriv('25');
      expect(f.getAttribute('inputmode')).toBe('numeric');
      await act(async () => { f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(onRad).toHaveBeenCalledTimes(1);
      expect(onRad.mock.calls[0][1]).toBe(15);   // 25 − 10
      expect(q('andra-siffra-talltimmer-falt')).toBeNull();
    });
    it('bara siffror; tomt fält och Esc ändrar inget; 0 tar bort raden (delta = −värdet)', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await tryck('andra-siffra-talltimmer');
      let f = await skriv('1a2b');
      expect(f.value).toBe('12');
      await skriv('');
      await act(async () => { f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(onRad).not.toHaveBeenCalled();
      await tryck('andra-siffra-talltimmer');
      f = await skriv('30');
      await act(async () => { f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(onRad).not.toHaveBeenCalled();
      await tryck('andra-siffra-talltimmer');
      await skriv('0');
      await act(async () => { (q('andra-siffra-talltimmer-falt') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(onRad.mock.calls[0][1]).toBe(-10);
    });
  });

  describe('Lägg till: rutnät', () => {
    it('2–3 kolumner, knappar ≥ 48 px; högst 8 direkt och en "Fler ›"-knapp som visar resten', async () => {
      await rendera({ valbara: [...valbara, ...sortiment(12)] });
      const grid = q('tillagg-grid') as HTMLElement;
      expect(grid.style.display).toBe('grid');
      expect(grid.style.gridTemplateColumns).toContain('minmax(150px');   // 640 px bred → 3 kolumner, 390 px → 2
      expect(div.querySelectorAll('[data-testid^="tillagg-s"]')).toHaveLength(8);
      for (const b of Array.from(div.querySelectorAll<HTMLElement>('[data-testid^="tillagg-s"]'))) expect(px(b.style.minHeight)).toBeGreaterThanOrEqual(48);
      expect(q('tillagg-fler')?.textContent).toContain('Fler (4)');
      await tryck('tillagg-fler');
      expect(div.querySelectorAll('[data-testid^="tillagg-s"]')).toHaveLength(12);
      expect(q('tillagg-fler')).toBeNull();
    });
    it('åtta eller färre: ingen Fler-knapp', async () => {
      await rendera({ valbara: [...valbara, ...sortiment(8)] });
      expect(div.querySelectorAll('[data-testid^="tillagg-s"]')).toHaveLength(8);
      expect(q('tillagg-fler')).toBeNull();
    });
    it('ett tryck lägger till 1 m³ av sortimentet', async () => {
      const onRad = vi.fn();
      await rendera({ valbara: [...valbara, ...sortiment(3)], onRad });
      await tryck('tillagg-s1');
      expect(onRad).toHaveBeenCalledWith(expect.objectContaining({ nyckel: 's1' }), 1);
    });
  });

  it('avlägget överst med Byt ›, totalen uppe till höger, Avbryt/Klar nederst — kvar', async () => {
    await rendera();
    expect(q('andra-avlagg')?.textContent).toContain('Byt ›');
    expect(q('andra-summa')?.textContent).toContain('18');
    expect(q('andra-avbryt')).not.toBeNull(); expect(q('andra-klar')).not.toBeNull();
  });
});

describe('Kvar, färdigskotad, väder, avlägg', () => {
  const skordat = [{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 100 }, { nyckel: 'granmassa', namn: 'Massa: Gran_V3', m3: 40 }];
  const bekr = [lass({ status: 'bekraftat' })];
  it('KvarArk: kvar per sortiment, klar-dag-text, Idag och lista som öppnar ett lass', async () => {
    const kvar = beraknaKvar(skordat, bekr);
    const sam = kvarSammanfattning(kvar, bekr, '2026-10-19');
    const onLass = vi.fn();
    await visa(<KvarArk kvar={kvar} sammanfattning={sam} dagens={bekr} idagText="Idag: 1 lass · 18 m³" vantande={2} onLass={onLass} onStang={vi.fn()} />);
    expect(q('kvar-ark')?.textContent).toContain('Klar-dag visas när trakten har skotats två dagar.');
    expect(q('kvar-ark')?.textContent).toContain('Idag: 1 lass · 18 m³');
    expect(q('kvar-ark')?.textContent).toContain('2 väntar på att skickas');
    await tryck('kvar-idag'); await tryck('kvar-lass-7');
    expect(onLass).toHaveBeenCalledWith(bekr[0]);
  });
  describe('KvarArk: läsbar i hytten', () => {
    const mk = (n: string, m3: number) => ({ nyckel: n, namn: `Timmer: ${n}_V3`, m3 });
    const nio = [mk('Vislanda_195_1-2', 200), mk('Vislanda Tall', 80), mk('Aa', 70), mk('Bb', 60), mk('Cc', 50), mk('Dd', 40), mk('Ee', 30), mk('Ff', 20), { nyckel: 'unclassified', namn: 'Unclassified', m3: 1 }];
    const visaKvar = async (kvar: ReturnType<typeof beraknaKvar>, dagens: Lass[] = []) =>
      visa(<KvarArk kvar={kvar} sammanfattning={kvarSammanfattning(kvar, dagens, '2026-10-19')} dagens={dagens} idagText="Idag: 0 lass · 0 m³" vantande={0} onLass={vi.fn()} onStang={vi.fn()} />);
    it('högst sex sortiment på egen rad, resten samlat som "Övrigt ~X m³ ›" som fälls ut', async () => {
      await visaKvar(beraknaKvar(nio, []));
      expect(div.querySelectorAll('[data-testid^="kvar-rad-"]')).toHaveLength(6);
      expect(q('kvar-ovrigt')?.textContent).toContain('Övrigt');
      expect(q('kvar-ovrigt')?.textContent).toContain('~');
      expect(q('kvar-ovrigt-lista')).toBeNull();
      await tryck('kvar-ovrigt');
      expect(div.querySelectorAll('[data-testid="kvar-ovrigt-lista"] [data-testid^="kvar-rad-"]')).toHaveLength(2);   // Ee och Ff
    });
    it('"Unclassified" visas aldrig för föraren — varken på egen rad eller i den utfällda listan', async () => {
      await visaKvar(beraknaKvar(nio, []));
      await tryck('kvar-ovrigt');
      expect(q('kvar-ark')?.textContent?.toLowerCase()).not.toContain('unclassified');
      expect(q('kvar-ovrigt')?.textContent).toContain('~');   // 1 m³ Unclassified + Ee + Ff räknas i Övrigt
    });
    it('sortimentet vitt/semibold och mottagaren grå efter', async () => {
      await visaKvar(beraknaKvar([{ nyckel: 'a', namn: 'Timmer: Vislanda_195_1-2_V3', m3: 50 }], []));
      const rad = q('kvar-rad-a') as HTMLElement;
      const delar = rad.querySelectorAll('span span');
      expect(delar[0].textContent).toBe('Timmer 195 1-2');
      expect(delar[1].textContent?.trim()).toBe('Vislanda');
      expect((delar[0] as HTMLElement).style.fontWeight).toBe('600');
      expect((delar[1] as HTMLElement).style.color).not.toBe((delar[0] as HTMLElement).style.color);
    });
    it('skotat mer än skördat: "✓ klart", aldrig "över" eller minus', async () => {
      const kvar = beraknaKvar([{ nyckel: 'a', namn: 'Timmer: A_V3', m3: 10 }, { nyckel: 'b', namn: 'Timmer: B_V3', m3: 100 }], [lass({ status: 'bekraftat', delar: [{ ...lass().delar[0], rader: [{ nyckel: 'a', namn: 'Timmer: A_V3', m3: 25 }] }] })]);
      await visaKvar(kvar);
      expect(q('kvar-rad-a')?.querySelector('[data-klart="ja"]')).not.toBeNull();
      expect(q('kvar-rad-b')?.querySelector('[data-klart="ja"]')).toBeNull();
      const txt = q('kvar-ark')?.textContent ?? '';
      expect(txt).toContain('klart');
      expect(txt).not.toMatch(/över/);
      expect(txt).not.toMatch(/−|-\d/);
    });
    it('lassrader i två rader: "Lass 1 · 16:59 · Avlägg 01-2" och sortimenten under', async () => {
      const l = lass({ lassNummer: 1, status: 'bekraftat', delar: [{ ...lass().delar[0], avlaggNummer: '01-2', lossadTid: '2026-10-19T14:59:00.000Z' }] });
      await visaKvar(beraknaKvar(skordat, [l]), [l]);
      await tryck('kvar-idag');
      expect(q('kvar-lass-rubrik')?.textContent).toBe('Lass 1 · 16:59 · Avlägg 01-2');
      expect(q('kvar-lass-sortiment')?.textContent).toBe('Timmer 10 · Kubb 5 · Massa 3 · 18 m³');
    });
    it('allt innehåll är minst 17 px (bara små versaler-rubriker får vara 13 px)', async () => {
      const l = lass({ status: 'bekraftat' });
      await visaKvar(beraknaKvar(nio, [l]), [l]);
      await tryck('kvar-ovrigt'); await tryck('kvar-idag');
      const smaa: string[] = [];
      div.querySelectorAll<HTMLElement>('*').forEach((e) => {
        const f = parseFloat(e.style.fontSize || '');
        const harText = Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        if (harText && f && f < 17) smaa.push(`${f}px: ${e.textContent}`);
      });
      expect(smaa).toEqual([]);
    });
  });
  describe('textstorlek i skotarläget: minst 17 px för allt föraren läser', () => {
    // Små versaler-rubriker (uppercase) får vara 13 px — inget innehåll.
    const smaTexter = (): string[] => {
      const ut: string[] = [];
      div.querySelectorAll<HTMLElement>('*').forEach((e) => {
        const f = parseFloat(e.style.fontSize || '');
        const harText = Array.from(e.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        if (harText && f && f < 17 && e.style.textTransform !== 'uppercase') ut.push(`${f}px: ${e.textContent}`);
      });
      return ut;
    };
    it('lasskortet (auto, fyll i, välj avlägg) och Nytt avlägg-frågan', async () => {
      for (const fas of ['auto', 'forare', 'avlagg_val'] as const) {
        await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 1, fas, start: 1 }} lass={lass()} avlagg={[A2, A3]} onAndra={vi.fn()} onFyllI={vi.fn()} onValjAvlagg={vi.fn()} onTaBort={vi.fn()} />);
        expect(smaTexter(), fas).toEqual([]);
      }
      await visa(<NyttAvlaggKort fraga={{ lat: 1, lng: 1, ts: 1 }} nummer="3" onSvar={vi.fn()} />);
      expect(smaTexter()).toEqual([]);
    });
    it('avläggskortet (skotat hit, med och utan lass)', async () => {
      const stat = skotatTillAvlagg([lass({ status: 'bekraftat' })], 'vida:2');
      await visa(<AvlaggSkotatSektion nummer="2" objektNamn="Trakten" stat={stat} kalla="vida" />);
      expect(smaTexter()).toEqual([]);
      await visa(<AvlaggSkotatSektion nummer="9" objektNamn="Trakten" stat={skotatTillAvlagg([], 'egen:9')} kalla="egen" />);
      expect(smaTexter()).toEqual([]);
    });
    it('Ändra lass, Färdigskotad och väder', async () => {
      await visa(<AndraLassArk lass={lass()} delNr={1} avlagg={[A2, A3]} valbara={[{ nyckel: 'kubb', namn: 'Kubb: Tall_V3', m3: 0 }]} onRad={vi.fn()} onAvlagg={vi.fn()} onKlar={vi.fn()} onAvbryt={vi.fn()} onTaBort={vi.fn()} />);
      expect(smaTexter()).toEqual([]);
      const kv = beraknaKvar([{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 100 }], []);
      await visa(<FardigskotadKort kontroll={farduskotatKontroll(kv)} klar={false} onKarta={vi.fn()} onBekrafta={vi.fn()} onAvbryt={vi.fn()} />);
      expect(smaTexter()).toEqual([]);
      await visa(<VaderLista dagar={[]} laddar={false} />);
      expect(smaTexter()).toEqual([]);
    });
  });
  it('FardigskotadKort: fråga vid stor skillnad, annars bekräftelse', async () => {
    const stor = farduskotatKontroll(beraknaKvar(skordat, [lass({ status: 'bekraftat' })]));
    expect(stor.ok).toBe(false);
    const onB = vi.fn(); const onK = vi.fn();
    await visa(<FardigskotadKort kontroll={stor} klar={false} onKarta={onK} onBekrafta={onB} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad')?.getAttribute('data-fraga')).toBe('ja');
    expect(q('fardigskotad-text')?.textContent).toMatch(/Enligt skördaren ~130 m³ kvar – Timmer ~90, Massa ~40/);
    await tryck('fardigskotad-karta'); await tryck('fardigskotad-anda');
    expect(onK).toHaveBeenCalled(); expect(onB).toHaveBeenCalled();
    const litet = farduskotatKontroll(beraknaKvar([{ nyckel: 'talltimmer', namn: 'T', m3: 100 }], [lass({ status: 'bekraftat', delar: [{ ...lass().delar[0], rader: [{ nyckel: 'talltimmer', namn: 'T', m3: 99 }] }] })]));
    await visa(<FardigskotadKort kontroll={litet} klar={false} onKarta={vi.fn()} onBekrafta={onB} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad')?.getAttribute('data-fraga')).toBe('nej');
    expect(q('fardigskotad-ja')).not.toBeNull();
  });
  it('FardigskotadKort utan läst skördare lovar ingenting', async () => {
    await visa(<FardigskotadKort kontroll={null} klar={false} onKarta={vi.fn()} onBekrafta={vi.fn()} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad-ja')).toBeNull();
    expect(q('fardigskotad')?.textContent).toContain('inte läst');
  });
  it('Morgonkort och väderlista', async () => {
    const ok = vi.fn();
    await visa(<><MorgonKortVy kort={{ rubrik: 'Idag', rader: ['Brandrisk 3 idag'] }} onOk={ok} /><VaderLista dagar={[{ datum: '2026-10-20', regnMm: 12, tempMax: 9, tempMin: 3 }]} laddar={false} /></>);
    expect(q('morgonkort')?.textContent).toContain('Brandrisk 3 idag');
    expect(q('vader-lista')?.textContent).toContain('12 mm');
    await tryck('morgonkort-ok');
    expect(ok).toHaveBeenCalled();
  });
  it('VaderLista utan data säger det', async () => {
    await visa(<VaderLista dagar={[]} laddar={false} />);
    expect(q('vader-lista')?.textContent).toContain('Väder saknas just nu.');
  });
  it('AvlaggSkotatSektion: m³, per sortiment, antal lass, senast, "Från Vida"', async () => {
    const stat = skotatTillAvlagg([lass({ status: 'bekraftat' })], 'vida:2');
    await visa(<AvlaggSkotatSektion nummer="2" objektNamn="Trakten" stat={stat} kalla="vida" />);
    const t = q('avlagg-skotat')?.textContent ?? '';
    expect(t).toContain('Avlägg 2 · skotat hit 18 m³');
    expect(t).toContain('1 lass · senast 14:12');
    expect(t).toContain('Från Vida');
    await visa(<AvlaggSkotatSektion nummer="9" objektNamn="Trakten" stat={skotatTillAvlagg([], 'vida:9')} kalla="egen" />);
    expect(q('avlagg-skotat')?.textContent).toContain('Inget skotat hit än.');
    expect(q('avlagg-skotat')?.textContent).not.toContain('Från Vida');
  });
});

describe('KorvyObjektPill med kvar', () => {
  const pillProps = { namn: 'Trakten', hogstubbar: { antal: 0, krav: null, status: 'ingen' as const }, evighetstrad: { antal: 0, krav: null, status: 'ingen' as const }, ikonHogstubbe: null, ikonEvighetstrad: null, onNamn: vi.fn(), onHogstubbe: vi.fn(), onEvighetstrad: vi.fn() };
  it('visar "Kvar ~121 m³ · Klar ~onsdag" bredvid namnet; tryck på kvar-delen, inte namnet, öppnar kvar', async () => {
    const onKvar = vi.fn(); const onNamn = vi.fn();
    await visa(<KorvyObjektPill {...pillProps} onNamn={onNamn} smal={false} kvar={{ text: 'Kvar ~121 m³', klar: 'Klar ~onsdag', onTryck: onKvar }} />);
    expect(q('korvy-pill-kvar')?.textContent).toBe('Kvar ~121 m³· Klar ~onsdag');
    await tryck('korvy-pill-kvar');
    expect(onKvar).toHaveBeenCalled(); expect(onNamn).not.toHaveBeenCalled();
    await tryck('korvy-pill-namn');
    expect(onNamn).toHaveBeenCalled();
  });
  it('utan kvar är pillen oförändrad', async () => {
    await visa(<KorvyObjektPill {...pillProps} smal={false} />);
    expect(q('korvy-pill-kvar')).toBeNull();
  });
  it('skotare (visaRaknare=false): inga skördarräknare, bara namn | Kvar · Klar', async () => {
    await visa(<KorvyObjektPill {...pillProps} smal={false} visaRaknare={false} kvar={{ text: 'Kvar ~121 m³', klar: 'Klar ~onsdag', onTryck: vi.fn() }} />);
    expect(q('korvy-pill-hogstubbar')).toBeNull();
    expect(q('korvy-pill-evighetstrad')).toBeNull();
    expect(q('korvy-pill-namn')?.textContent).toContain('Trakten');
    expect(q('korvy-pill-kvar')?.textContent).toBe('Kvar ~121 m³· Klar ~onsdag');
  });
  it('namnet öppnar objektinfon och har ingen pil ⌄ (objekt byts med hemknappen)', async () => {
    const onNamn = vi.fn();
    await visa(<KorvyObjektPill {...pillProps} onNamn={onNamn} smal={false} visaRaknare={false} />);
    expect(q('korvy-pill-byt')).toBeNull();
    expect(q('korvy-pill-namn')?.getAttribute('aria-label')).toContain('objektinfo');
    await tryck('korvy-pill-namn');
    expect(onNamn).toHaveBeenCalled();
  });
  it('skotare utan läsbar kvar: bara namnet — aldrig skördarräknare och aldrig ett påhittat 0', async () => {
    await visa(<KorvyObjektPill {...pillProps} smal={false} visaRaknare={false} kvar={null} />);
    expect(q('korvy-pill-hogstubbar')).toBeNull();
    expect(q('korvy-pill-kvar')).toBeNull();
    expect(q('korvy-pill-namn')).not.toBeNull();
  });
  it('skördare: räknarna är kvar som förut', async () => {
    await visa(<KorvyObjektPill {...pillProps} smal={false} />);
    expect(q('korvy-pill-hogstubbar')).not.toBeNull();
    expect(q('korvy-pill-evighetstrad')).not.toBeNull();
  });
  it('telefon: kvar-delen ligger under namnraden', async () => {
    await visa(<KorvyObjektPill {...pillProps} smal kvar={{ text: 'Kvar ~121 m³', klar: null, onTryck: vi.fn() }} />);
    expect((q('korvy-objektpill') as HTMLElement).style.flexDirection).toBe('column');
  });
});
