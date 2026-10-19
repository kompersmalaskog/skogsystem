// @vitest-environment jsdom
// Dokumentet pa objektets helsida (Oversikt) med observationer: de star under en EGEN rubrik, med foto,
// position och kommentar, och raknas inte in i planens antal. Skrivskyddat - inga knappar.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const punkt = (id: string, over: Record<string, any> = {}) => ({
  id, egenkontroll_id: 'r1', ordning: 1, del: 'plan', grupp: 'Hänsyn', kalla: 'markering', markering_id: null,
  markering_marker_id: null, punkt_typ: 'wet', rubrik: `Punkt ${id}`, antal_planerat: null, geometri_snapshot: null,
  plan_kommentar: null, status: 'ok', avvikelse_typ: null, kommentar: null, varde_foreslaget: null, varde_bekraftat: null,
  lat: null, lng: null, besvarad: '2026-10-17T08:00:00Z', ...over,
});
const obs = (id: string, over: Record<string, any> = {}) => punkt(id, {
  ordning: 0, del: 'observation', kalla: 'observation', grupp: null, rubrik: 'Observation', punkt_typ: null,
  status: 'bra', avvikelse_typ: 'korspar', lat: 56.05, lng: 14.05, besvarad: '2026-10-17T09:00:00Z', ...over,
});

let vyn: any;
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    hamtaRunda: async () => vyn,
    hamtaProvytor: async () => [],
    hamtaFoton: async () => [{ id: 'f1', egenkontroll_id: 'r1', punkt_id: 'o1', provyta_id: null, sokvag: 'r1/o1.jpg', tackningsgrad: null, lat: null, lng: null, tagen: null, skapad: '2026-10-17T09:00:00Z' }],
  };
});
vi.mock('@/lib/egenkontrollfoto', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontrollfoto')>();
  return { ...verklig, signeraFoto: async (s: string) => `https://signerad/${s}` };
});
vi.mock('@/app/egenkontroll/Forutsattningar', () => ({ default: () => null }));

import ObjektEgenkontroll from './ObjektEgenkontroll';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function montera() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(ObjektEgenkontroll, { objektId: 'ob1' })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

const KLAR = { id: 'r1', objekt_id: 'ob1', status: 'klar', startad: '2026-10-17T07:00:00Z', klar: '2026-10-17T12:00:00Z', vader: null, maskiner: null, objekt_typ: 'slutavverkning', utford_av: 'Martin' };

describe('oversiktens dokument', () => {
  it('observationerna star under en egen rubrik med foto, position och kommentar', async () => {
    vyn = { egenkontroll: KLAR, punkter: [punkt('p1')], observationer: [obs('o1', { kommentar: 'Rishög som ligger perfekt' }), obs('o2', { status: 'avvikelse', avvikelse_typ: 'stubbhojd' })] };
    await montera();
    const t = document.body.textContent ?? '';
    expect(t).toContain('Observationer · 2');
    expect(t).toContain('Rishög som ligger perfekt');
    expect(t).toContain('56.0500, 14.0500');
    expect(document.querySelectorAll('img[src="https://signerad/r1/o1.jpg"]')).toHaveLength(1);
  });

  it('planens antal ar oforandrade: 1 punkt, 0 avvikelser, aven med en observation som ar en Avvikelse', async () => {
    vyn = { egenkontroll: KLAR, punkter: [punkt('p1')], observationer: [obs('o2', { status: 'avvikelse', avvikelse_typ: 'stubbhojd' })] };
    await montera();
    const t = document.body.textContent ?? '';
    expect(t).toContain('1 punkter');
    expect(t).toContain('0 avvikelser');
  });

  it('skrivskyddat: inga knappar for att andra en observation', async () => {
    vyn = { egenkontroll: KLAR, punkter: [punkt('p1')], observationer: [obs('o1')] };
    await montera();
    expect(Array.from(document.querySelectorAll('button')).some((b) => /Ändra/.test(b.getAttribute('aria-label') ?? ''))).toBe(false);
  });

  it('inga observationer: ingen rubrik', async () => {
    vyn = { egenkontroll: KLAR, punkter: [punkt('p1')], observationer: [] };
    await montera();
    expect(document.body.textContent).not.toContain('Observationer');
  });

  it('en pagaende runda raknar bara planpunkterna ("1 av 2 punkter besvarade")', async () => {
    vyn = {
      egenkontroll: { ...KLAR, status: 'pagaende', klar: null },
      punkter: [punkt('p1'), punkt('p2', { status: null })],
      observationer: [obs('o1'), obs('o2')],
    };
    await montera();
    expect(document.body.textContent).toContain('1 av 2 punkter besvarade');
  });
});
