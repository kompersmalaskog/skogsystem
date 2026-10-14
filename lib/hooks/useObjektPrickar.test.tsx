// @vitest-environment jsdom
// Prickarna på kartan medan objektlistan är öppen: lager, kameran, trycken och återgången — med en låtsaskarta (inget MapLibre i jsdom).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useObjektPrickar, MIN_ZOOM_OVERSIKT } from './useObjektPrickar';
import { laggKarta } from './karta.testhjalp';
import { PRICK_KALLA, PRICK_LAGER, type KartPrick, type KartPrickar } from '../objektKarta';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const prick = (id: string, p: Partial<KartPrick> = {}): KartPrick => ({ id, namn: id, lat: 56.4, lng: 14.7, farg: 'gron', har: false, prio: 1, ...p });
const prickar = (nyckel: string, lista: KartPrick[], valj = vi.fn()): KartPrickar => ({ prickar: lista, nyckel, valj });

let rot: Root | null = null;
let ut: { markeraVal: () => void } | null = null;
type P = { map: any; aktiv: boolean; prickar: KartPrickar | null; aterstall?: boolean };
function Prov(p: P) {
  ut = useObjektPrickar({ map: p.map, aktiv: p.aktiv, prickar: p.prickar, aterstall: p.aterstall ?? true });
  return null;
}
const rendera = async (p: P) => { await act(async () => { rot!.render(<Prov {...p} />); }); };
const nerOchKlick = (karta: any, ner: [number, number], upp: [number, number] = ner, mal?: Element) => {
  act(() => {
    karta.container.dispatchEvent(new MouseEvent('pointerdown', { clientX: ner[0], clientY: ner[1], bubbles: true }));
    (mal ?? karta.canvas).dispatchEvent(new MouseEvent('click', { clientX: upp[0], clientY: upp[1], bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  const d = document.createElement('div'); document.body.appendChild(d); rot = createRoot(d);
});
afterEach(() => { act(() => { rot?.unmount(); }); rot = null; document.body.innerHTML = ''; vi.useRealTimers(); });

describe('inaktiv (maskinläge, /maskin, körvy öppnar aldrig listan)', () => {
  it('rör ingenting på kartan: inga lager, inga lyssnare, ingen kamera', async () => {
    const karta = laggKarta();
    const add = vi.spyOn(karta.container, 'addEventListener');
    await rendera({ map: karta, aktiv: false, prickar: prickar('aktiva', [prick('a')]) });
    expect(add).not.toHaveBeenCalled();
    expect(karta.lager).toEqual([]);
    expect(Object.keys(karta.kallor)).toEqual([]);
    expect(karta.fitBounds).not.toHaveBeenCalled();
    expect(karta.easeTo).not.toHaveBeenCalled();
  });
  it('utan karta (ännu inte redo) händer inget', async () => {
    await rendera({ map: null, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    expect(ut).not.toBeNull();
  });
});

describe('öppen lista: prickar och zoom', () => {
  it('lagren läggs till, prickarna skrivs till källan och kartan zoomar ut över alla — utan 3D-lutning', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: null });
    expect(karta.fitBounds).not.toHaveBeenCalled();             // inga prickar än (objekten läses)
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a', { lat: 56.3, lng: 14.6 }), prick('b', { lat: 56.6, lng: 14.9 })]) });
    expect(karta.lager).toEqual([PRICK_LAGER.ring, PRICK_LAGER.prick, PRICK_LAGER.namn]);
    expect(karta.kallor[PRICK_KALLA].data.features).toHaveLength(2);
    expect(karta.fitBounds).toHaveBeenCalledTimes(1);
    const [gr, opt] = karta.fitBounds.mock.calls[0];
    expect(gr).toEqual([[14.6, 56.3], [14.9, 56.6]]);
    expect(opt).toMatchObject({ pitch: 0, bearing: 0 });
    expect(opt.maxZoom).toBeLessThanOrEqual(13);
  });

  it('telefon: nedre halvan är täckt av arket → nedre padding ≥ halva höjden', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    expect(karta.fitBounds.mock.calls[0][1].padding.bottom).toBeGreaterThanOrEqual(400);
  });

  it('bred skärm: höger sida är täckt av panelen → höger padding ≥ panelens bredd', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    const pad = karta.fitBounds.mock.calls[0][1].padding;
    expect(pad.right).toBeGreaterThanOrEqual(380);
    expect(pad.bottom).toBeLessThan(100);
  });

  it('samma mängd igen (färger/avstånd trillar in): data uppdateras men kameran lämnas ifred', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a', { farg: 'gra' }), prick('b')]) });
    expect(karta.fitBounds).toHaveBeenCalledTimes(1);
    expect(karta.kallor[PRICK_KALLA].data.features).toHaveLength(2);
  });

  it('Avslutade öppnas / typ byts (ny nyckel) → kameran passas om efter de nya prickarna', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    await rendera({ map: karta, aktiv: true, prickar: prickar('avslutade:slutavverkning', [prick('x', { lat: 56.9 })]) });
    expect(karta.fitBounds).toHaveBeenCalledTimes(2);
    expect(karta.kallor[PRICK_KALLA].data.features.map((f: any) => f.properties.id)).toEqual(['x']);
  });
});

describe('utzoomningens tak (kartans minZoom 8 räcker inte med arket över nedre halvan)', () => {
  it('sänks medan listan är öppen och kommer tillbaka när kameran landat efter en återgång', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    expect(karta.minZoom).toBe(MIN_ZOOM_OVERSIKT);
    expect(MIN_ZOOM_OVERSIKT).toBeLessThan(8);
    await rendera({ map: karta, aktiv: false, prickar: null });
    expect(karta.easeTo).toHaveBeenCalledTimes(1);
    expect(karta.minZoom).toBe(MIN_ZOOM_OVERSIKT);        // ännu inte: kameran är på väg tillbaka
    act(() => { karta.sparadeEfter.moveend(); });
    expect(karta.minZoom).toBe(8);
  });
  it('efter ett val (ingen återgång) kommer taket tillbaka direkt', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    act(() => { ut!.markeraVal(); });
    await rendera({ map: karta, aktiv: false, prickar: null });
    expect(karta.minZoom).toBe(8);
  });
  it('inaktiv: taket rörs aldrig', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: false, prickar: null });
    expect(karta.setMinZoom).not.toHaveBeenCalled();
  });
});

describe('tryck på kartan', () => {
  it('tryck på en prick = raden: valj(id) och klicket når inte kartans övriga lager', async () => {
    const karta = laggKarta([{ id: 'pa', x: 100, y: 200, prio: 1 }]);
    const valj = vi.fn(); const efter = vi.fn();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('pa')], valj) });
    document.addEventListener('click', efter);          // allt ovanför kartan i trädet ska inte heller se klicket
    karta.canvasBeh.addEventListener('click', efter);   // kartans egna lyssnare (MapLibres lager) ska inte se det
    nerOchKlick(karta, [102, 203]);
    expect(valj).toHaveBeenCalledWith('pa');
    expect(efter).not.toHaveBeenCalled();
    document.removeEventListener('click', efter);
  });

  it('flera prickar nära fingret → den närmaste', async () => {
    const karta = laggKarta([{ id: 'langt', x: 120, y: 200 }, { id: 'nara', x: 104, y: 201 }]);
    const valj = vi.fn();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('nara'), prick('langt')], valj) });
    nerOchKlick(karta, [100, 200]);
    expect(valj).toHaveBeenCalledWith('nara');
  });

  it('tryck på tom karta gör ingenting — varken väljer eller stänger (hooken har inget sätt att stänga listan), även långt efter öppningen', async () => {
    const karta = laggKarta([]);
    const valj = vi.fn();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')], valj) });
    nerOchKlick(karta, [50, 50]);
    act(() => { vi.advanceTimersByTime(5000); });
    nerOchKlick(karta, [50, 50]);
    expect(valj).not.toHaveBeenCalled();
  });

  it('kartan går att använda fritt: dubbeltryck, nyp/drag (touch + pekare) och scrollhjul når kartans egna lyssnare orörda', async () => {
    const karta = laggKarta([]);
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    const sett: string[] = [];
    for (const typ of ['dblclick', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup', 'wheel']) {
      karta.canvasBeh.addEventListener(typ, () => sett.push(typ));
    }
    act(() => {
      for (const typ of ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mouseup', 'wheel', 'dblclick']) {
        karta.canvas.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
      }
    });
    expect(sett.sort()).toEqual(['dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointermove', 'pointerup', 'touchend', 'touchmove', 'touchstart', 'wheel'].sort());
  });

  it('en panorering som råkar sluta i ett klick varken väljer eller gör något', async () => {
    const karta = laggKarta([{ id: 'pa', x: 150, y: 150 }]);
    const valj = vi.fn();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('pa')], valj) });
    nerOchKlick(karta, [10, 10], [150, 150]);
    expect(valj).not.toHaveBeenCalled();
  });

  it('inget objekt valt (aterstall=false): prickarna går att trycka på, tom karta gör ingenting, och ingen kameraåtergång vid avmontering', async () => {
    const karta = laggKarta([{ id: 'pa', x: 100, y: 200 }]);
    const valj = vi.fn();
    await rendera({ map: karta, aktiv: true, aterstall: false, prickar: prickar('aktiva', [prick('pa')], valj) });
    nerOchKlick(karta, [100, 200]);
    expect(valj).toHaveBeenCalledWith('pa');
    karta.queryRenderedFeatures.mockReturnValue([]);
    nerOchKlick(karta, [300, 300]);
    expect(valj).toHaveBeenCalledTimes(1);
    await rendera({ map: karta, aktiv: false, aterstall: false, prickar: null });
    expect(karta.easeTo).not.toHaveBeenCalled();
  });

  it('klick utanför kartans canvas (kartkontroller, HTML-markörer) rörs inte', async () => {
    const karta = laggKarta([{ id: 'pa', x: 100, y: 200 }]);
    const valj = vi.fn(); const efter = vi.fn();
    const knapp = document.createElement('button'); karta.container.appendChild(knapp);
    knapp.addEventListener('click', efter);
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('pa')], valj) });
    nerOchKlick(karta, [100, 200], [100, 200], knapp);
    expect(valj).not.toHaveBeenCalled();
    expect(efter).toHaveBeenCalledTimes(1);
  });
});

describe('stängd lista', () => {
  it('stängd utan val: prickarna bort och kartan tillbaka till kameran den hade', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    karta.kamera = { center: { lng: 14.0, lat: 57.0 }, zoom: 9, bearing: 0, pitch: 0 };   // kartan har zoomat ut (och fingret har rört den)
    await rendera({ map: karta, aktiv: false, prickar: null });
    expect(karta.easeTo).toHaveBeenCalledTimes(1);
    expect(karta.easeTo.mock.calls[0][0]).toMatchObject({ center: [14.9, 56.5], zoom: 15, bearing: 20, pitch: 45 });
    expect(karta.kallor[PRICK_KALLA].data.features).toEqual([]);
  });

  it('stängd efter att ett objekt valts: ingen återgång (objektets egen centrering tar kameran)', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    act(() => { ut!.markeraVal(); });
    await rendera({ map: karta, aktiv: false, prickar: null });
    expect(karta.easeTo).not.toHaveBeenCalled();
    expect(karta.kallor[PRICK_KALLA].data.features).toEqual([]);
  });

  it('nästa öppning börjar om: ett tidigare val lever inte kvar, och kameran sparas på nytt', async () => {
    const karta = laggKarta();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    act(() => { ut!.markeraVal(); });
    await rendera({ map: karta, aktiv: false, prickar: null });
    karta.kamera = { center: { lng: 15.5, lat: 56.1 }, zoom: 12, bearing: 0, pitch: 50 };
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    await rendera({ map: karta, aktiv: false, prickar: null });
    expect(karta.easeTo.mock.calls[0][0]).toMatchObject({ center: [15.5, 56.1], zoom: 12, pitch: 50 });
    expect(karta.fitBounds).toHaveBeenCalledTimes(2);   // passas om vid varje öppning
  });

  it('lyssnarna tas bort när listan stängs (trycket når kartan igen)', async () => {
    const karta = laggKarta();
    const efter = vi.fn();
    await rendera({ map: karta, aktiv: true, prickar: prickar('aktiva', [prick('a')]) });
    await rendera({ map: karta, aktiv: false, prickar: null });
    karta.canvasBeh.addEventListener('click', efter);
    nerOchKlick(karta, [10, 10]);
    expect(efter).toHaveBeenCalledTimes(1);
  });
});
