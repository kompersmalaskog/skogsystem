// @vitest-environment jsdom
// Skotarens lassvyer renderade på riktigt: kortet efter lossning, Ändra lasset, kvar, färdigskotad, morgonkort, avläggets "skotat hit" och pillen med kvar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import React, { act } from 'react';
import { NyttAvlaggKort } from './NyttAvlaggKort';
import { LossaKnapp } from './LossaKnapp';
import { AndraLassArk } from './AndraLassArk';
import { SIFFRA_BREDD, SPARR_MS, TANGENT_SPARR_MS } from './StegKnapp';
import { andraRad as andraRadModell } from '@/lib/skotarLass/lassModell';
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

describe('LossaKnapp', () => {
  const A2: Avlagg = { id: 'vida:2', nummer: '2', kalla: 'vida', lat: 56.6, lng: 15.8 };
  it('"Lossa · Avlägg 2" — en stor knapp (≥ 56 px) som ger ETT anrop per tryck', async () => {
    const vidTryck = vi.fn();
    await visa(<LossaKnapp avlagg={A2} vidTryck={vidTryck} />);
    expect(q('lossa-knapp')?.textContent).toBe('Lossa · Avlägg 2');
    expect(parseFloat((q('lossa-knapp') as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(56);
    await tryck('lossa-knapp');
    expect(vidTryck).toHaveBeenCalledTimes(1);
  });
  it('två avlägg nära varandra: båda erbjuds som val ("Lossa · Avlägg 2" / "Lossa · Avlägg 01-2"), valet skickas med och inget gissas', async () => {
    const A012: Avlagg = { id: 'vida:01-2', nummer: '01-2', kalla: 'vida', lat: 56.6003, lng: 15.8 };
    const vidTryck = vi.fn();
    await visa(<LossaKnapp avlagg={A2} val={[A2, A012]} vidTryck={vidTryck} />);
    expect(q('lossa-knapp')).toBeNull();   // ingen ensam "standardknapp" som gissar
    expect(q('lossa-val-vida:2')?.textContent).toBe('Lossa · Avlägg 2');
    expect(q('lossa-val-vida:01-2')?.textContent).toBe('Lossa · Avlägg 01-2');
    for (const id of ['lossa-val-vida:2', 'lossa-val-vida:01-2']) expect(parseFloat((q(id) as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(56);
    await tryck('lossa-val-vida:01-2');
    expect(vidTryck).toHaveBeenCalledTimes(1);
    expect(vidTryck).toHaveBeenCalledWith('vida:01-2');
  });
  it('knappen gör inget av sig själv: inga anrop utan tryck, även efter lång tid', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    try {
      const vidTryck = vi.fn();
      await visa(<LossaKnapp avlagg={A2} vidTryck={vidTryck} />);
      await act(async () => { vi.advanceTimersByTime(60 * 60_000); });
      expect(vidTryck).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('ligger ovanför kortet nertill ("Nytt avlägg här?"), inte under det', async () => {
    const kort = document.createElement('div');
    kort.setAttribute('data-nertill-kort', '');
    kort.getBoundingClientRect = () => ({ height: 120, width: 300, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) });
    document.body.appendChild(kort);
    try {
      await visa(<LossaKnapp avlagg={A2} vidTryck={vi.fn()} />);
      expect((q('skotar-nedre-rad') as HTMLElement).style.bottom).toContain('128px');   // kortets 120 px + 8 px luft
    } finally { kort.remove(); }
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
  it('ett nytt lass (utkast) har ingen "ta bort lasset": Avbryt kastar det', async () => {
    await rendera(lass(), { utkast: true });
    expect(q('andra-ta-bort')).toBeNull();
    expect(q('andra-avbryt')).not.toBeNull();
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
    expect(siffra.textContent).toBe('10 m³');   // mängden har sin enhet: "Kubb 305" + "17 m³", aldrig "305 17"
  });
  it('namnen i två nivåer: sortimentet vitt/semibold, mottagaren grå', async () => {
    await rendera({ valbara: [...valbara, { nyckel: 'k', namn: 'Timmer: Vislanda_195_1-2_V3', m3: 0 }] });
    const rad = (q('andra-rad-talltimmer') as HTMLElement).querySelectorAll('span span');
    expect(rad[0].textContent).toBe('Talltimmer'); expect((rad[0] as HTMLElement).style.fontWeight).toBe('600');   // klartext, aldrig "Tall_V3"
    expect(rad).toHaveLength(1);                                                                                     // ingen mottagare känd → ingen grå rad
    const tillagg = (q('tillagg-k') as HTMLElement).textContent ?? '';
    expect(tillagg).toContain('Timmer'); expect(tillagg).toContain('Vislanda');
    expect(tillagg).not.toMatch(/195|_V3|1-2/);
  });

  describe('ETT TRYCK = ETT STEG (Martin i Elefanten 26/10: + hoppade 1 → 3 eller 4)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    const vanta = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });
    const klick = (id: string) => act(async () => { (q(id) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // Händelserna en pekskärm skickar för ETT tryck: pointerdown, (tiden fingret ligger kvar), pointerup, pointerout/leave, click.
    const pekskarmsTryck = async (id: string, hallMs: number) => {
      const e = q(id) as HTMLElement;
      await act(async () => { e.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
      await vanta(hallMs);
      await act(async () => {
        e.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
        e.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
        e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    };

    it('ett tryck på pekskärmen (pointerdown → pointerup → pointerout → click) ger EXAKT ett steg — förut två (1 → 3)', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await pekskarmsTryck('plus-talltimmer', 80);
      expect(onRad).toHaveBeenCalledTimes(1);
      expect(onRad.mock.calls[0][1]).toBe(1);
    });
    it('ett långt tryck (tummen vilar 2 s i en skakande hytt) ger ETT steg — ingen håll-in-upprepning', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await pekskarmsTryck('plus-talltimmer', 2000);
      expect(onRad).toHaveBeenCalledTimes(1);
      await pekskarmsTryck('minus-talltimmer', 600);
      expect(onRad).toHaveBeenCalledTimes(2);
      expect(onRad.mock.calls[1][1]).toBe(-1);
    });
    it('hålls fingret nere händer inget alls förrän klicket kommer (inget steg på nedtryck, inga timers)', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await act(async () => { (q('plus-talltimmer') as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })); });
      await vanta(5000);
      expect(onRad).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
    it('snabba dubbeltryck (300 ms emellan) ger två steg', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await klick('plus-talltimmer'); await vanta(300); await klick('plus-talltimmer');
      expect(onRad).toHaveBeenCalledTimes(2);
    });
    it('simulerad studs: två klick inom 50 ms ger ETT steg; efter spärren (250 ms) räknas nästa tryck', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await klick('plus-talltimmer'); await vanta(50); await klick('plus-talltimmer');
      expect(onRad).toHaveBeenCalledTimes(1);
      await vanta(SPARR_MS);
      await klick('plus-talltimmer');
      expect(onRad).toHaveBeenCalledTimes(2);
    });
    it('spärren gäller PER KNAPP: − direkt efter + räknas', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await klick('plus-talltimmer'); await vanta(20); await klick('minus-talltimmer');
      expect(onRad.mock.calls.map((c) => c[1])).toEqual([1, -1]);
    });
    it('tangentbord/hjälpmedel: en aktivering = ett steg', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await klick('minus-talltimmer');
      expect(onRad).toHaveBeenCalledTimes(1);
    });
    it('knapparna sitter still: siffran har FAST bredd (samma för 9 och 10, tabellsiffror), − och + är 56 px med avstånd emellan', async () => {
      const mått = async (m3: number) => {
        const l = lass(); l.delar[0].rader = [{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3 }];
        await rendera({ lass: l });
        const g = (id: string) => { const e = q(id) as HTMLElement; return { w: e.style.width, minW: e.style.minWidth, maxW: e.style.maxWidth, h: e.style.height, shrink: e.style.flexShrink, grow: e.style.flexGrow }; };
        const rad = q('andra-rad-talltimmer') as HTMLElement;
        return { minus: g('minus-talltimmer'), siffra: g('andra-siffra-talltimmer'), plus: g('plus-talltimmer'), gap: rad.style.gap, ordning: Array.from(rad.children).map((c) => (c as HTMLElement).dataset.testid ?? 'namn'), tabell: (q('andra-siffra-talltimmer') as HTMLElement).style.fontVariantNumeric };
      };
      const nio = await mått(9); const tio = await mått(10); const hundra = await mått(100); const tusen = await mått(1000);
      expect(tio).toEqual(nio); expect(hundra).toEqual(nio); expect(tusen).toEqual(nio);
      expect(nio.siffra.w).toBe(`${SIFFRA_BREDD}px`); expect(nio.siffra.minW).toBe(nio.siffra.w); expect(nio.siffra.maxW).toBe(nio.siffra.w);
      expect(nio.siffra.shrink).toBe('0'); expect(nio.minus.shrink).toBe('0'); expect(nio.plus.shrink).toBe('0');
      expect(nio.minus.w).toBe('56px'); expect(nio.plus.w).toBe('56px'); expect(nio.minus.h).toBe('56px');
      expect(parseFloat(nio.gap)).toBeGreaterThanOrEqual(12);
      expect(nio.ordning).toEqual(['namn', 'minus-talltimmer', 'andra-siffra-talltimmer', 'plus-talltimmer']);
      expect(nio.tabell).toBe('tabular-nums');
    });
  });

  describe('tryck på siffran öppnar en stor sifferknappsats (ersätter värdet, inget tangentbord från systemet)', () => {
    const siffror = async (...tangenter: string[]) => { for (const t of tangenter) { await tryck(`siffer-${t}`); await act(async () => { await new Promise((r) => setTimeout(r, TANGENT_SPARR_MS + 10)); }); } };
    it('platta med 0–9, radera och Klar, alla minst 56 px; inget input-fält (inget Windows-/iOS-tangentbord)', async () => {
      await rendera();
      await tryck('andra-siffra-talltimmer');
      expect(q('siffer-platta')).not.toBeNull();
      expect(div.querySelector('input, textarea')).toBeNull();
      for (const t of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'radera']) expect(px((q(`siffer-${t}`) as HTMLElement).style.height), t).toBeGreaterThanOrEqual(56);
      expect(px((q('siffer-klar') as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(56);
      expect(px((q('siffer-avbryt') as HTMLElement).style.height)).toBeGreaterThanOrEqual(56);
    });
    it('det man skriver ERSÄTTER värdet: dagens 10 visas dämpat, första siffran byter ut det; Klar skickar skillnaden som ETT steg', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await tryck('andra-siffra-talltimmer');
      expect(q('siffer-visning')?.textContent).toContain('10');
      expect(q('siffer-visning')?.getAttribute('data-ersatter')).toBe('ja');
      await siffror('2', '5');
      expect(q('siffer-visning')?.textContent).toContain('25');
      expect(q('siffer-visning')?.textContent).not.toContain('1025');
      await tryck('siffer-klar');
      expect(onRad).toHaveBeenCalledTimes(1);
      expect(onRad.mock.calls[0][1]).toBe(15);   // 25 − 10
      expect(q('siffer-platta')).toBeNull();
      expect(q('andra-rad-talltimmer')).not.toBeNull();   // tillbaka i lasskortet
    });
    it('radera tar bort sista siffran; max fyra siffror; 0 tar bort raden (delta = −värdet)', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await tryck('andra-siffra-talltimmer');
      await siffror('1', '2', '3');
      await tryck('siffer-radera');
      expect(q('siffer-visning')?.textContent).toContain('12');
      await siffror('3', '4', '5', '6');
      expect(q('siffer-visning')?.textContent).toContain('1234');
      expect(q('siffer-visning')?.textContent).not.toContain('12345');
      await siffror('radera', 'radera', 'radera', 'radera', '0');
      await tryck('siffer-klar');
      expect(onRad.mock.calls[0][1]).toBe(-10);
    });
    it('Klar utan att ha skrivit något och Avbryt ändrar inget', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await tryck('andra-siffra-talltimmer'); await tryck('siffer-klar');
      expect(onRad).not.toHaveBeenCalled(); expect(q('siffer-platta')).toBeNull();
      await tryck('andra-siffra-talltimmer'); await siffror('3', '0'); await tryck('siffer-avbryt');
      expect(onRad).not.toHaveBeenCalled(); expect(q('siffer-platta')).toBeNull(); expect(q('andra-rad-talltimmer')).not.toBeNull();
    });
    it('samma värde som förut ger inget steg', async () => {
      const onRad = vi.fn();
      await rendera({ onRad });
      await tryck('andra-siffra-talltimmer'); await siffror('1', '0'); await tryck('siffer-klar');
      expect(onRad).not.toHaveBeenCalled();
    });
    it('studs på en tangent (två klick inom 50 ms) ger EN siffra', async () => {
      await rendera();
      await tryck('andra-siffra-talltimmer');
      await tryck('siffer-7'); await tryck('siffer-7');
      expect(q('siffer-visning')?.textContent).toContain('7');
      expect(q('siffer-visning')?.textContent).not.toContain('77');
    });
  });

  describe('− ner till 0 tar bort raden, och den ligger åter under "Lägg till"', () => {
    // Det riktiga arket med den riktiga lassmodellen och ett tillstånd som hos sidan: inget förfalskat.
    const NU = Date.parse('2026-10-19T12:00:00Z');
    function Tillstand({ start }: { start: Lass }) {
      const [l, setL] = React.useState(start);
      return <AndraLassArk lass={l} delNr={1} avlagg={[A2, A3]}
        valbara={[{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 0 }, { nyckel: 'granmassa', namn: 'Massa: Gran_V3', m3: 0 }]}
        onRad={(rad, d) => setL((x) => andraRadModell(x, 1, rad, d, NU))}
        onAvlagg={vi.fn()} onKlar={vi.fn()} onAvbryt={vi.fn()} onTaBort={vi.fn()} />;
    }
    it('1 m³ kvar → − → raden är borta (ingen egen ta-bort-knapp) och sortimentet finns under Lägg till', async () => {
      const l = lass(); l.delar[0].rader = [{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 1 }];
      await visa(<Tillstand start={l} />);
      expect(q('andra-rad-talltimmer')).not.toBeNull();
      expect(q('tillagg-talltimmer')).toBeNull();
      await tryck('minus-talltimmer');
      expect(q('andra-rad-talltimmer')).toBeNull();
      expect(q('tillagg-talltimmer')).not.toBeNull();
      expect(div.textContent).not.toMatch(/ta bort (raden|sortiment)/i);
      expect(q('andra-summa')?.textContent).toContain('0');
    });
    it('en gång till + från Lägg till: raden är tillbaka med 1 m³', async () => {
      const l = lass(); l.delar[0].rader = [{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 1 }];
      await visa(<Tillstand start={l} />);
      await tryck('minus-talltimmer'); await tryck('tillagg-talltimmer');
      expect(q('andra-siffra-talltimmer')?.textContent).toBe('1 m³');
    });
    it('trycken är minst 56 px: − och +, siffran, Lägg till-knapparna och Fler sortiment…', async () => {
      await visa(<Tillstand start={lass()} />);
      for (const id of ['minus-talltimmer', 'plus-talltimmer', 'andra-siffra-talltimmer', 'tillagg-granmassa', 'tillagg-fler', 'andra-klar', 'andra-avbryt']) {
        const e = q(id) as HTMLElement;
        const h = px(e.style.minHeight || e.style.height);
        expect(h, id).toBeGreaterThanOrEqual(56);
      }
    });
  });

  describe('Lägg till: rutnät', () => {
    it('2–3 kolumner, knappar ≥ 48 px; högst 8 direkt och "Fler sortiment…" som visar resten', async () => {
      await rendera({ valbara: [...valbara, ...sortiment(12)] });
      const grid = q('tillagg-grid') as HTMLElement;
      expect(grid.style.display).toBe('grid');
      expect(grid.style.gridTemplateColumns).toContain('minmax(150px');   // 640 px bred → 3 kolumner, 390 px → 2
      expect(div.querySelectorAll('[data-testid^="tillagg-s"]')).toHaveLength(8);
      for (const b of Array.from(div.querySelectorAll<HTMLElement>('[data-testid^="tillagg-s"]'))) expect(px(b.style.minHeight)).toBeGreaterThanOrEqual(48);
      expect(q('tillagg-fler')?.textContent).toContain('Fler sortiment…');
      expect(q('tillagg-fler')?.textContent).toContain('(4)');
      await tryck('tillagg-fler');
      expect(div.querySelectorAll('[data-testid^="tillagg-s"]')).toHaveLength(12);
      expect(q('tillagg-fler')).toBeNull();
    });
    it('åtta eller färre: "Fler sortiment…" finns ändå — hela listan är alltid ett tryck bort', async () => {
      await rendera({ valbara: [...valbara, ...sortiment(8)] });
      expect(div.querySelectorAll('[data-testid^="tillagg-s"]')).toHaveLength(8);
      expect(q('tillagg-fler')?.textContent).toContain('Fler sortiment…');
    });
    it('ett tryck lägger till 1 m³ av sortimentet', async () => {
      const onRad = vi.fn();
      await rendera({ valbara: [...valbara, ...sortiment(3)], onRad });
      await tryck('tillagg-s1');
      expect(onRad).toHaveBeenCalledWith(expect.objectContaining({ nyckel: 's1' }), 1);
    });
  });

  describe('Sortimentlistan är aldrig tom (Skälviken: inget skördat än)', () => {
    const tomtLass = () => { const l = lass({ status: 'vantar_forare' }); l.delar[0].rader = []; return l; };
    const reserv = [{ nyckel: 'gran timmer · urshult', namn: 'Gran timmer · Urshult', m3: 0 }, { nyckel: 'massa · björk', namn: 'Massa · Björk', m3: 0 }];

    it('trakt utan skördat: listan visas (reserven), texten "lägg till nedan" stämmer, och Klar går att trycka efter ett val', async () => {
      // Hooken ger reserven som primära när inget är skördat: här den första ur objektets sortiment.
      const onKlar = vi.fn(); const onRad = vi.fn();
      await rendera({ lass: tomtLass(), valbara: reserv, alla: reserv, onKlar, onRad });
      expect(q('andra-rad-talltimmer')).toBeNull();
      expect(div.textContent).toContain('Inga sortiment ännu — lägg till nedan.');
      expect(q('tillagg-grid')).not.toBeNull();
      expect(q('tillagg-gran timmer · urshult')).not.toBeNull();
      expect((q('andra-klar') as HTMLButtonElement).disabled).toBe(true);
      await tryck('tillagg-gran timmer · urshult');
      expect(onRad).toHaveBeenCalledWith(expect.objectContaining({ nyckel: 'gran timmer · urshult' }), 1);
      // …och när valet gjort lasset bekräftbart (rad på lasset) går Klar att trycka.
      const med = lass({ status: 'vantar_forare' });
      await rendera({ lass: med, valbara: reserv, alla: reserv, onKlar });
      await tryck('andra-klar');
      expect(onKlar).toHaveBeenCalledTimes(1);
    });
    it('korta listan tom men hela finns: "Fler sortiment…" visar den — föraren fastnar aldrig', async () => {
      await rendera({ lass: tomtLass(), valbara: [], alla: reserv });
      expect(q('sortiment-saknas')).toBeNull();
      expect(q('tillagg-gran timmer · urshult')).toBeNull();
      expect(q('tillagg-fler')?.textContent).toContain('Fler sortiment…');
      await tryck('tillagg-fler');
      expect(q('tillagg-gran timmer · urshult')).not.toBeNull();
      expect(q('tillagg-massa · björk')).not.toBeNull();
    });
    it('"Fler sortiment…" lägger de övriga EFTER de primära, utan dubbletter', async () => {
      await rendera({ lass: tomtLass(), valbara: [reserv[0]], alla: [reserv[0], reserv[1]] });
      expect(div.querySelectorAll('[data-testid^="tillagg-"][data-testid$="urshult"], [data-testid="tillagg-massa · björk"]')).toHaveLength(1);
      await tryck('tillagg-fler');
      const ids = Array.from(div.querySelectorAll('[data-testid^="tillagg-"]')).map((e) => e.getAttribute('data-testid')).filter((t) => t !== 'tillagg-grid');
      expect(ids).toEqual(['tillagg-gran timmer · urshult', 'tillagg-massa · björk']);
    });
    it('"Fler sortiment…" finns alltid, också när allt redan syns', async () => {
      await rendera({ lass: tomtLass(), valbara: [reserv[0]], alla: [reserv[0]] });
      expect(q('tillagg-fler')?.textContent).toContain('Fler sortiment…');
    });
    it('ingenting kunde läsas: det står, med Försök igen — aldrig "lägg till nedan" om det inte finns något nedan', async () => {
      const onLasOm = vi.fn();
      await rendera({ lass: tomtLass(), valbara: [], alla: [], onLasOm });
      expect(div.textContent).not.toContain('lägg till nedan');
      expect(q('sortiment-saknas')).not.toBeNull();
      expect(q('tillagg-fler')).toBeNull();
      await tryck('tillagg-lasom');
      expect(onLasOm).toHaveBeenCalledTimes(1);
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
      expect(delar[0].textContent).toBe('Timmer');   // klartext: aldrig kodmärkena 195 / 1-2 / _V3
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
      expect(q('kvar-lass-sortiment')?.textContent).toBe('Talltimmer: 10 m³ · Tallkubb: 5 m³ · Massaved björk: 3 m³ · 18 m³ totalt');   // mängden skild från namnet: "Kubb 305: 17 m³", aldrig "305 17"
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
    it('Lossa-knappen och Nytt avlägg-frågan', async () => {
      await visa(<LossaKnapp avlagg={A2} vidTryck={vi.fn()} />);
      expect(smaTexter()).toEqual([]);
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
    expect(q('fardigskotad-text')?.textContent).toMatch(/Enligt skördaren ~130 m³ kvar – Talltimmer ~90, Massaved gran ~40/);
    await tryck('fardigskotad-karta'); await tryck('fardigskotad-anda');
    expect(onK).toHaveBeenCalled(); expect(onB).toHaveBeenCalled();
    const litet = farduskotatKontroll(beraknaKvar([{ nyckel: 'talltimmer', namn: 'T', m3: 100 }], [lass({ status: 'bekraftat', delar: [{ ...lass().delar[0], rader: [{ nyckel: 'talltimmer', namn: 'T', m3: 99 }] }] })]));
    await visa(<FardigskotadKort kontroll={litet} klar={false} onKarta={vi.fn()} onBekrafta={onB} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad')?.getAttribute('data-fraga')).toBe('nej');
    expect(q('fardigskotad-ja')).not.toBeNull();
  });
  it('FardigskotadKort på en trakt utan skördat säger det, och har ingen knapp som färdigskotar', async () => {
    await visa(<FardigskotadKort kontroll={null} ingetSkordat klar={false} onKarta={vi.fn()} onBekrafta={vi.fn()} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad-inget')?.textContent).toMatch(/inte skördat något på trakten än/);
    expect(q('fardigskotad-ja')).toBeNull();
    expect(q('fardigskotad-anda')).toBeNull();
    await visa(<FardigskotadKort kontroll={null} klar={false} onKarta={vi.fn()} onBekrafta={vi.fn()} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad-inget')?.textContent).toMatch(/Skördaren är inte läst än/);
  });
  it('FardigskotadKort utan läst skördare lovar ingenting', async () => {
    await visa(<FardigskotadKort kontroll={null} klar={false} onKarta={vi.fn()} onBekrafta={vi.fn()} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad-ja')).toBeNull();
    expect(q('fardigskotad')?.textContent).toContain('inte läst');
  });
  it('Morgonkort och väderlista', async () => {
    const ok = vi.fn();
    await visa(<><MorgonKortVy kort={{ rubrik: 'Idag', rader: ['Brandrisk 3 idag'] }} onOk={ok} /><VaderLista dagar={[{ datum: '2026-10-20', regnMm: 12, tempMax: 9, tempMin: 3, symbol: 19 }]} laddar={false} /></>);
    expect(q('morgonkort')?.textContent).toContain('Brandrisk 3 idag');
    expect(q('vader-lista')?.textContent).toContain('12 mm');
    await tryck('morgonkort-ok');
    expect(ok).toHaveBeenCalled();
  });
  it('VaderLista: tre dagar med dag, ikon, temperatur och mm — Idag och I morgon, torr dag är 0 mm, saknad dag är –', async () => {
    const dagar = [
      { datum: '2026-10-19', regnMm: 0.2, tempMax: 11.4, tempMin: 4.6, symbol: 1 },
      { datum: '2026-10-20', regnMm: 12.4, tempMax: 9, tempMin: 3, symbol: 19 },
      { datum: '2026-10-21', regnMm: null, tempMax: null, tempMin: null, symbol: null },
    ];
    await visa(<VaderLista dagar={dagar} laddar={false} idag="2026-10-19" />);
    const rader = Array.from(document.querySelectorAll('[data-testid="vader-dag"]')).map((r) => r.textContent);
    expect(rader).toHaveLength(3);
    expect(rader[0]).toContain('Idag');
    expect(rader[0]).toContain('5–11°');
    expect(rader[0]).toContain('0 mm');
    expect(rader[1]).toContain('I morgon');
    expect(rader[1]).toContain('12 mm');
    expect(rader[2]).toContain('ons 21 okt');
    expect(rader[2]).toContain('–');
    expect(q('vader-ikon-sol')).not.toBeNull();
    expect(q('vader-ikon-regn')).not.toBeNull();
    // Ikonerna har ingen egen färg: de ärver textfärgen (currentColor), bara systemets färger finns i raderna.
    const svgar = Array.from(document.querySelectorAll('[data-testid="vader-lista"] svg'));
    expect(svgar.length).toBe(2);
    for (const sv of svgar) { expect(sv.getAttribute('stroke')).toBe('currentColor'); expect(sv.getAttribute('fill')).toBe('none'); }
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
