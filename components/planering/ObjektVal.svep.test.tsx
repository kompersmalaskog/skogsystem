// @vitest-environment jsdom
// Välj ett objekt → kartan sveper in på traktgränsen. De riktiga delarna (ObjektLista, useObjektPrickar, useObjektFlyg) sammansatta som i planeringssidan,
// med en låtsaskarta och ett låtsas-geometrisvar. Planeringssidan själv (22 000 rader) monteras inte; kopplingen vaktas i lib/objektKarta.vakter.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useEffect, useState } from 'react';
import { laggKarta } from '@/lib/hooks/karta.testhjalp';

const h = vi.hoisted(() => ({ rader: [] as any[], gps: { giltig: true, lat: 56.4, lng: 14.7 } as any }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabell: string) => ({
      select: () => {
        const svar = () => (tabell === 'objekt' ? { data: h.rader, error: null } : { data: [], error: null });
        const b: any = {
          then: (ok: any, nej: any) => Promise.resolve(svar()).then(ok, nej), order: () => b, is: () => b,
          range: (fran: number, till: number) => Promise.resolve({ data: (svar().data as any[]).slice(fran, till + 1), error: null }),
        };
        return b;
      },
    }),
  },
}));
vi.mock('@/lib/gpsKalla', () => ({ hamtaEnGpsFix: () => Promise.resolve(h.gps) }));

import ObjektLista from './ObjektLista';
import { sattBredd } from './PlusRad.testhjalp';
import { useObjektPrickar } from '@/lib/hooks/useObjektPrickar';
import { useObjektFlyg } from '@/lib/hooks/useObjektFlyg';
import { FLYG_MS, FLYG_PADDING, flygEasing, objektStartKamera, traktGrans } from '@/lib/objektFlyg';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RADER = [
  { id: 'bag', namn: 'Bågskyttebanan RP J-Hus- 25', status: 'pagaende', typ: 'slutavverkning', lat: 56.41, lng: 14.71 },
  { id: 'e', namn: 'Ekeby', status: 'planerad', typ: 'slutavverkning', lat: 56.45, lng: 14.75 },
  { id: 'n', namn: 'Ingen gräns', status: 'planerad', typ: 'gallring', lat: 56.5, lng: 14.9 },
];
const yta = (lat: number, lng: number, halvM: number, lager = 'L_TRAKTDEL') => {
  const dLat = halvM / 110540, dLng = halvM / (111320 * Math.cos((lat * Math.PI) / 180));
  return { properties: { _lager: lager }, geometry: { type: 'Polygon', coordinates: [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]] } };
};
// Bågskyttebanan har en jättelik fastighetsyta i leveransen — det som förut gav en regional zoom med trakten som en fläck.
const GEO: Record<string, any> = {
  bag: { features: [yta(56.41, 14.71, 200), yta(56.6, 14.2, 30000, 'L_FASTIGHET')] },
  e: { features: [yta(56.45, 14.75, 250)] },
};

let rot: Root | null = null;
const flush = async () => { for (let i = 0; i < 14; i++) await act(async () => { await Promise.resolve(); }); };
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const klicka = (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };

// Sidans delar, sammansatta som i planeringssidan: valjObjektUrLista, hooken för prickar, hooken för svepet och ett geometrisvar som kommer efter en stund.
function Sida({ karta, start }: { karta: any; start?: any }) {
  const [valt, setValt] = useState<any>(start ?? null);
  const [oppen, setOppen] = useState(false);
  const [prickar, setPrickar] = useState<any>(null);
  const [hamtadFor, setHamtadFor] = useState<string | null>(null);
  const [geo, setGeo] = useState<any>(null);
  const { markeraVal } = useObjektPrickar({ map: karta, aktiv: oppen, prickar: oppen ? prickar : null, aterstall: true });
  useObjektFlyg({ map: karta, aktiv: true, objekt: valt, geometriHamtadFor: hamtadFor, geometri: geo });
  useEffect(() => {
    if (!valt) return;
    let av = false;
    setTimeout(() => { if (!av) { setGeo(GEO[valt.id] ?? null); setHamtadFor(valt.id); } }, 200);   // geometrisvaret kommer efter en stund
    return () => { av = true; };
  }, [valt?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const valj = (o: any) => { setOppen(false); if (valt?.id === o.id) return; markeraVal(); setValt(o); };
  return (
    <>
      <button data-testid="oppna" onClick={() => setOppen(true)} />
      <span data-testid="valt">{valt?.id ?? ''}</span>
      <ObjektLista oppen={oppen} kanStangas valtId={valt?.id ?? null} onValj={valj} onNavigera={() => {}} onStang={() => setOppen(false)} onPrickar={setPrickar} kartaTryck />
    </>
  );
}

async function montera(karta: any, start?: any) {
  const d = document.createElement('div'); document.body.appendChild(d); rot = createRoot(d);
  await act(async () => { rot!.render(<Sida karta={karta} start={start} />); });
  await flush();
}
const oppna = async () => { klicka(q('oppna')); await flush(); act(() => { vi.advanceTimersByTime(50); }); await flush(); };
const avancera = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); await flush(); };
const klickPrick = (karta: any, xy: [number, number]) => act(() => {
  karta.container.dispatchEvent(new MouseEvent('pointerdown', { clientX: xy[0], clientY: xy[1], bubbles: true }));
  karta.canvas.dispatchEvent(new MouseEvent('click', { clientX: xy[0], clientY: xy[1], bubbles: true, cancelable: true }));
});
const sistaFit = (k: any) => k.fitBounds.mock.calls[k.fitBounds.mock.calls.length - 1];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  h.rader = RADER; sattBredd(390); (window as any).innerHeight = 800;
  (globalThis as any).fetch = vi.fn(async () => ({ json: async () => ({ routes: [{ distance: 20000 }] }) }));
});
afterEach(async () => { await act(async () => { rot?.unmount(); }); rot = null; document.body.innerHTML = ''; vi.useRealTimers(); });

describe('välj via RAD → kartan sveper in på trakten', () => {
  it('översikt först, sedan (när geometrin kommit) fitBounds på traktgränsen — inte alla features, inte översikten kvar', async () => {
    const karta = laggKarta(); await montera(karta);
    await oppna();
    expect(karta.fitBounds).toHaveBeenCalledTimes(1);                 // översikten över prickarna
    klicka(q('objekt-rad-bag')); await flush();
    expect(q('valt')!.textContent).toBe('bag');
    expect(karta.fitBounds).toHaveBeenCalledTimes(1);                 // geometrin har inte kommit: inget svep än, ingen återgång heller
    expect(karta.easeTo).not.toHaveBeenCalled();
    await avancera(250);
    expect(karta.fitBounds).toHaveBeenCalledTimes(2);
    const [gran, opt] = sistaFit(karta);
    expect(gran).toEqual(traktGrans(GEO.bag));                         // runt TRAKTGRÄNSEN …
    expect(gran[1][1] - gran[0][1]).toBeLessThan(0.01);               // … inte runt den 60 km stora fastighetsytan
    expect(opt).toMatchObject({ duration: FLYG_MS, padding: FLYG_PADDING, easing: flygEasing });
    expect(karta.easeTo).not.toHaveBeenCalled();                      // och kameran går inte "tillbaka" till vyn före listan
  });
});

describe('välj via PRICK → samma svep', () => {
  it('tryck på Ekebys prick → objektet valt och svepet på Ekebys traktgräns', async () => {
    const karta = laggKarta([{ id: 'e', x: 100, y: 200, prio: 2 }]); await montera(karta);
    await oppna();
    klickPrick(karta, [102, 203]); await flush();
    expect(q('valt')!.textContent).toBe('e');
    await avancera(250);
    expect(sistaFit(karta)[0]).toEqual(traktGrans(GEO.e));
    expect(karta.easeTo).not.toHaveBeenCalled();
  });
});

describe('saknas traktgräns', () => {
  it('in på objektets koordinat på öppningsnivån (zoom 16), samma mjuka svep', async () => {
    const karta = laggKarta(); await montera(karta);
    await oppna();
    klicka(q('objekt-rad-n')); await flush(); await avancera(250);
    const sista = karta.easeTo.mock.calls[karta.easeTo.mock.calls.length - 1][0];
    expect(sista).toMatchObject({ center: [14.9, 56.5], zoom: objektStartKamera(RADER[2])!.zoom, duration: FLYG_MS, easing: flygEasing });
    expect(sista.zoom).toBe(16);
  });
});

describe('öppna direkt (Planering öppnar senaste objektet)', () => {
  it('objektet är valt från start → svepet på traktgränsen så fort geometrin kommit, utan att listan öppnats', async () => {
    const karta = laggKarta(); await montera(karta, RADER[1]);
    expect(karta.fitBounds).not.toHaveBeenCalled();                   // geometrin är inte här än
    await avancera(250);
    expect(karta.fitBounds).toHaveBeenCalledTimes(1);
    expect(sistaFit(karta)[0]).toEqual(traktGrans(GEO.e));
  });
  it('objekt utan traktgräns som öppnas direkt: koordinaten på öppningsnivån', async () => {
    const karta = laggKarta(); await montera(karta, RADER[2]); await avancera(250);
    expect(karta.easeTo.mock.calls[0][0]).toMatchObject({ center: [14.9, 56.5], zoom: 16 });
  });
  it('ett svep per objekt: en omladdad geometri sveper inte igen', async () => {
    const karta = laggKarta(); await montera(karta, RADER[1]); await avancera(250);
    expect(karta.fitBounds).toHaveBeenCalledTimes(1);
    await avancera(2000);
    expect(karta.fitBounds).toHaveBeenCalledTimes(1);
  });
});

describe('stängs listan UTAN val: tillbaka till vyn man hade', () => {
  it('× → kameran som före listan, och inget svep', async () => {
    const karta = laggKarta(); await montera(karta, RADER[0]); await avancera(250);     // objektet öppet och svept
    karta.fitBounds.mockClear(); karta.easeTo.mockClear();
    karta.kamera = { center: { lng: 14.71, lat: 56.41 }, zoom: 15.4, bearing: 0, pitch: 50 };
    await oppna();
    karta.kamera = { center: { lng: 14.9, lat: 56.5 }, zoom: 7.4, bearing: 0, pitch: 0 };   // översikten
    klicka(q('objekt-lista-stang')); await flush();
    expect(karta.easeTo).toHaveBeenCalledTimes(1);
    expect(karta.easeTo.mock.calls[0][0]).toMatchObject({ center: [14.71, 56.41], zoom: 15.4, pitch: 50 });
    await avancera(2000);
    expect(karta.fitBounds).toHaveBeenCalledTimes(1);                 // bara översiktens egen — inget svep till något objekt
  });
  it('samma objekt valt igen: tillbaka till vyn man hade (inget nytt svep)', async () => {
    const karta = laggKarta(); await montera(karta, RADER[0]); await avancera(250);
    karta.fitBounds.mockClear();
    await oppna();
    klicka(q('objekt-rad-bag')); await flush(); await avancera(500);
    expect(karta.easeTo).toHaveBeenCalledTimes(1);                    // återgången
    expect(karta.fitBounds).toHaveBeenCalledTimes(1);                 // bara översiktens
  });
});

describe('objekt efter objekt', () => {
  it('A → B → A: varje val ger ett svep på det objektets trakt', async () => {
    const karta = laggKarta(); await montera(karta, RADER[0]); await avancera(250);
    await oppna(); klicka(q('objekt-rad-e')); await flush(); await avancera(250);
    expect(sistaFit(karta)[0]).toEqual(traktGrans(GEO.e));
    await oppna(); klicka(q('objekt-rad-bag')); await flush(); await avancera(250);
    expect(sistaFit(karta)[0]).toEqual(traktGrans(GEO.bag));
  });
});
