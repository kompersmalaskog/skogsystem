// @vitest-environment jsdom
// Den delade uppföljningsmenyn: tre klickbara typ-kort som filtrerar listan,
// per-skotare-gruppering, grot-kortet (schablon) och avslutade. Vakt mot att
// korten blir döda rutor igen (de MÅSTE filtrera) och mot att grot försvinner.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { UppfoljningObjekt } from './lib/transform';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let data: UppfoljningObjekt[] = [];
vi.mock('./hooks/useUppfoljningList', async () => {
  const faktisk = await vi.importActual<typeof import('./hooks/useUppfoljningList')>('./hooks/useUppfoljningList');
  return { ...faktisk, useUppfoljningList: () => ({ objekt: data, loading: false, error: null }) };
});

import UppfoljningMeny from './UppfoljningMeny';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Objekt med rimliga default — override det testet bryr sig om.
const obj = (over: Partial<UppfoljningObjekt>): UppfoljningObjekt => ({
  vo_nummer: 'VO1', namn: 'Objekt', typ: 'slutavverkning', agare: '', areal: 0,
  skordareModell: null, skordareStart: null, skordareSlut: null, skordareObjektId: null, skordareObjektIds: [],
  skordareModellMaskinId: null, volymSkordare: 1000, stammar: 0,
  skotareModell: null, skotareStart: null, skotareSlut: null, skotareObjektId: null, skotareObjektIds: [],
  skotareModellMaskinId: null, volymSkotare: 0, skotatArManuell: false, skotarG15Manuell: 0,
  sistaAvverkning: '2026-10-01', tilldeladSkotare: 'Elefant 26', antalLass: 1, dieselTotal: 0, dagar: null,
  status: 'pagaende', skordningAvslutad: false, skotningAvslutad: false, egenSkotning: false, grotSkotning: false,
  grotAnpassad: false, grotHamtad: null, skotareKalla: 'tilldelad', skotareAvvikelse: null, risskotningPagar: false,
  skordareLastDate: null, skotareLastDate: null, externSkotning: false, externForetag: '', externPrisTyp: 'm3',
  externPris: 0, externAntal: 0, maskiner: [], kvarPct: 0,
  ...over,
} as unknown as UppfoljningObjekt);

let rot: Root | null = null;
let be: HTMLElement | null = null;
beforeEach(() => { data = []; push.mockReset(); try { sessionStorage.clear(); } catch {} });
afterEach(() => { act(() => { rot?.unmount(); }); be?.remove(); rot = null; be = null; });

async function montera() {
  be = document.createElement('div'); document.body.appendChild(be);
  rot = createRoot(be);
  await act(async () => { rot!.render(<UppfoljningMeny />); });
}
const text = () => be!.textContent || '';
const knappMedText = (t: string) => Array.from(be!.querySelectorAll('button')).find(b => (b.textContent || '').includes(t));
async function klick(el: Element) { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }

describe('UppfoljningMeny', () => {
  it('visar titel, tre typ-kort och per-skotare-gruppen', async () => {
    data = [
      obj({ vo_nummer: 'A', namn: 'Slutavv Ett', typ: 'slutavverkning', volymSkordare: 1000, volymSkotare: 200, tilldeladSkotare: 'Elefant 26' }),
      obj({ vo_nummer: 'B', namn: 'Gallring Ett', typ: 'gallring', volymSkordare: 100, volymSkotare: 35, tilldeladSkotare: '810E' }),
    ];
    await montera();
    expect(text()).toContain('Uppföljning');
    expect(knappMedText('Slutavv.')).toBeTruthy();
    expect(knappMedText('Gallring')).toBeTruthy();
    expect(knappMedText('Grot')).toBeTruthy();
    expect(text()).toContain('Elefant 26');
    expect(text()).toContain('Slutavv Ett');
    expect(text()).toContain('Gallring Ett');
  });

  it('typ-kortet FILTRERAR listan (inte en död ruta)', async () => {
    data = [
      obj({ vo_nummer: 'A', namn: 'Slutavv Ett', typ: 'slutavverkning', volymSkordare: 1000, volymSkotare: 200 }),
      obj({ vo_nummer: 'B', namn: 'Gallring Ett', typ: 'gallring', volymSkordare: 100, volymSkotare: 35 }),
    ];
    await montera();
    expect(text()).toContain('Gallring Ett');
    await klick(knappMedText('Slutavv.')!);
    // Efter filter på slutavverkning: gallringsobjektet är borta ur listan.
    expect(text()).toContain('Slutavv Ett');
    expect(text()).not.toContain('Gallring Ett');
    expect(text()).toContain('Visa alla typer');
  });

  it('grot-kortet visar schablon och filtrerar till ris-listan', async () => {
    data = [
      obj({ vo_nummer: 'A', namn: 'Slutavv Ett', typ: 'slutavverkning', volymSkordare: 1000, volymSkotare: 200 }),
      obj({ vo_nummer: 'G', namn: 'Grotobjekt', typ: 'slutavverkning', volymSkordare: 1000, grotAnpassad: true, grotHamtad: null }),
    ];
    await montera();
    // Grot-kortet syns (schablon ≈ 350 vid 0,35 × 1000) och är märkt schablon.
    expect(text()).toContain('schablon');
    await klick(knappMedText('Grot')!);
    expect(text()).toContain('Ris kvar på hygget');
    expect(text()).toContain('Grotobjekt');
  });
});
