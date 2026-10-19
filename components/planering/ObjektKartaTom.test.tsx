// @vitest-environment jsdom
// Planeringsvyn utan valt objekt (första gången, eller objektet är borttaget): kartan med alla objekt som prickar och listan ovanpå —
// aldrig en svart tom yta. Listan går inte att stänga, men kartan syns och prickarna går att trycka på. Verkligt DOM-beteende (jsdom) med en
// låtsaskarta; planeringssidan själv monteras inte (22 000 rader).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { laggKarta } from '@/lib/hooks/karta.testhjalp';

const h = vi.hoisted(() => ({
  rader: [] as any[], karta: null as any, kartaProps: null as any,
  gps: { giltig: true, lat: 56.4, lng: 14.7 } as any,
}));
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
// MapLibreMap laddas dynamiskt (ssr: false). Låtsasversionen ger tillbaka testets karta när den "laddats" och noterar vad sidan bad om.
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: () => function FakeMapLibre(props: any) {
      h.kartaProps = props;
      React.useEffect(() => { props.onMapReady(h.karta); return () => props.onMapRemoved?.(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
      return React.createElement('div', { 'data-testid': 'fake-maplibre' });
    },
  };
});

import ObjektKartaTom from './ObjektKartaTom';
import { sattBredd } from './PlusRad.testhjalp';
import { PRICK_KALLA, tomKartaStil } from '@/lib/objektKarta';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RADER = [
  { id: 'e', namn: 'Ekeby', status: 'planerad', typ: 'slutavverkning', lat: 56.45, lng: 14.75 },
  { id: 'p', namn: 'Gallring Sjö', status: 'pagaende', typ: 'gallring', lat: 56.41, lng: 14.71 },
  { id: 'v', namn: 'Vällust', status: 'avslutat', typ: 'slutavverkning', lat: 56.5, lng: 14.8, avslutad_timestamp: '2026-09-01T10:00:00Z' },
  { id: 'o', namn: 'Utan koordinat', status: 'planerad', typ: 'gallring' },
];

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); }); };
const avancera = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const spion = { valj: [] as string[] };
const nerOchKlick = (ner: [number, number]) => act(() => {
  h.karta.container.dispatchEvent(new MouseEvent('pointerdown', { clientX: ner[0], clientY: ner[1], bubbles: true }));
  h.karta.canvas.dispatchEvent(new MouseEvent('click', { clientX: ner[0], clientY: ner[1], bubbles: true, cancelable: true }));
});

async function montera(kartlager?: 'satellite' | 'lantmateriet' | 'terrain' | 'osm') {
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
  rot = createRoot(behallare);
  await act(async () => { rot!.render(<ObjektKartaTom onValj={(o) => spion.valj.push(o.id)} onNavigera={() => {}} kartlager={kartlager} />); });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  h.rader = RADER; h.gps = { giltig: true, lat: 56.4, lng: 14.7 };
  h.karta = laggKarta([]);
  spion.valj = [];
  sattBredd(1280);
  (globalThis as any).fetch = vi.fn(async () => ({ json: async () => ({ routes: [{ distance: 20000 }] }) }));
});
afterEach(async () => { await act(async () => { rot?.unmount(); }); behallare?.remove(); rot = null; document.body.innerHTML = ''; vi.useRealTimers(); });

describe('utan valt objekt: kartan syns, aldrig en svart tom yta', () => {
  it('en karta med Lantmäteriets bas monteras (inte en svart yta med text) och listan ligger ovanpå — Flygfoto som standard', async () => {
    await montera();
    expect(q('planering-utan-objekt-karta')).not.toBeNull();
    expect(q('fake-maplibre')).not.toBeNull();
    expect(h.kartaProps.mapStyle).toEqual(tomKartaStil('satellite'));
    expect(h.kartaProps.mapStyle.layers.map((l: any) => l.id)).toContain('satellite-layer');
    expect(q('objekt-lista')).not.toBeNull();
    expect(q('objekt-lista')!.getAttribute('data-oppen')).toBe('1');
  });

  it('alla aktiva objekt med koordinat blir prickar på kartan, kameran zoomar ut över dem', async () => {
    await montera();
    const features = h.karta.kallor[PRICK_KALLA].data.features;
    expect(features.map((f: any) => f.properties.id).sort()).toEqual(['e', 'p']);      // avslutat och utan koordinat ritas inte
    expect(features.find((f: any) => f.properties.id === 'p').properties.farg).toBe('#30d158');   // Pågår = grön
    expect(h.karta.fitBounds).toHaveBeenCalledTimes(1);
    expect(h.karta.fitBounds.mock.calls[0][0]).toEqual([[14.71, 56.41], [14.75, 56.45]]);
  });

  it('listan går inte att stänga: ingen ×, ingen fångst över kartan, Esc gör inget', async () => {
    await montera();
    expect(q('objekt-lista-stang')).toBeNull();
    expect(q('objekt-lista-bakgrund')).toBeNull();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(q('objekt-lista')!.getAttribute('data-oppen')).toBe('1');
  });

  it('telefon: listan är ett ark på nedre halvan; bred skärm: en panel från höger — och kartan syns bredvid/ovanför', async () => {
    sattBredd(390);
    await montera();
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe('ark');
    expect(q('objekt-lista')!.style.height).toBe('50%');
    expect(h.karta.fitBounds.mock.calls[0][1].padding.bottom).toBeGreaterThanOrEqual(400);
    await act(async () => { rot!.unmount(); }); behallare!.remove();
    h.karta = laggKarta([]);
    sattBredd(1280);
    await montera();
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe('panel');
    expect(h.karta.fitBounds.mock.calls[0][1].padding.right).toBeGreaterThanOrEqual(380);
  });

  it('prickarna går att trycka på: tryck på en prick = raden → objektet öppnas', async () => {
    h.karta = laggKarta([{ id: 'p', x: 100, y: 200, prio: 1 }]);
    await montera();
    await avancera(500);
    nerOchKlick([103, 202]);
    expect(spion.valj).toEqual(['p']);
  });

  it('tryck på tom karta gör ingenting (inget att gå tillbaka till); listan ligger kvar', async () => {
    await montera();
    await avancera(500);
    nerOchKlick([300, 300]);
    expect(spion.valj).toEqual([]);
    expect(q('objekt-lista')!.getAttribute('data-oppen')).toBe('1');
  });

  it('telefon, inget objekt valt: arket går att dra upp till nästan full höjd, men ned stänger det inte (inget att gå tillbaka till)', async () => {
    sattBredd(390);
    await montera();
    const grepp = q('objekt-lista-grepp')!;
    const peka = (typ: string, y: number) => act(() => { grepp.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true, clientY: y })); });
    await peka('pointerdown', 500); await peka('pointermove', 300); await peka('pointerup', 300);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('hel');
    await peka('pointerdown', 100); await peka('pointermove', 400); await peka('pointerup', 400);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('halv');
    await peka('pointerdown', 100); await peka('pointermove', 400); await peka('pointerup', 400);
    expect(q('objekt-lista')!.getAttribute('data-oppen')).toBe('1');
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('halv');
  });

  it('kartan går att använda fritt (panorera, nyp, dubbeltryck): inget ligger som fångst över den, och dubbeltryck når kartan', async () => {
    await montera();
    let dbl = 0;
    h.karta.canvasBeh.addEventListener('dblclick', () => { dbl++; });
    act(() => { h.karta.canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })); });
    expect(dbl).toBe(1);
  });

  it('kartan går att panorera och zooma: inget ligger som fångst över den (listan är bara arket/panelen)', async () => {
    await montera();
    expect(document.querySelectorAll('[data-testid="objekt-lista-bakgrund"]')).toHaveLength(0);
  });

  it('Avslutade-vyn visar bara den valda typens avslutade på kartan', async () => {
    await montera();
    act(() => { q('objekt-lista-avslutade')!.click(); });
    await flush();
    const ids = h.karta.kallor[PRICK_KALLA].data.features.map((f: any) => f.properties.id);
    expect(ids).toEqual(['v']);
  });

  it('utan objekt alls: kartan ligger kvar (utan prickar), listan säger det', async () => {
    h.rader = [];
    await montera();
    expect(q('planering-utan-objekt-karta')).not.toBeNull();
    expect(h.karta.kallor[PRICK_KALLA]?.data?.features ?? []).toEqual([]);
    expect(h.karta.fitBounds).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Inga objekt ännu');
  });
});

describe('kartan utan objekt följer användarens kartlager', () => {
  it.each([['satellite', 'satellite-layer'], ['lantmateriet', 'lm-layer'], ['terrain', 'terrain-layer'], ['osm', 'osm-layer']] as const)('%s → %s', async (lager, lagerId) => {
    await montera(lager);
    expect(h.kartaProps.mapStyle.layers.map((l: any) => l.id)).toEqual(['bg', lagerId]);
    expect(Object.keys(h.kartaProps.mapStyle.sources)).toHaveLength(1);
  });
});

describe('sidan: tomläget är kopplat dit det ska', () => {
  const sida = readFileSync(resolve(__dirname, '../../app/planering/page.tsx'), 'utf8');
  it('tomläget visar kartan (ObjektKartaTom) när listan ska visas — bara den svarta "Hämtar objekt…"-ytan medan minnet/adressen läses', () => {
    const i = sida.indexOf('// Visa objektväljaren om inget objekt är valt');
    const block = sida.slice(i, i + 2600);
    expect(block).toMatch(/visaListan \? \(\s*(\/\/[^\n]*\n\s*)*<ObjektKartaTom kartlager=\{mapType\} onValj=\{maskinlage \? valjObjektIMaskin : valjObjektUrLista\}/);
    expect(block).toMatch(/Hämtar objekt…/);
    expect(block).not.toMatch(/<ObjektLista oppen kanStangas=\{false\}/);   // den bara-listan-på-svart-vägen är borta
  });
});
