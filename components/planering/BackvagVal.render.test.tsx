// @vitest-environment jsdom
// Backväg i markeringsmenyn: den RIKTIGA komponenten renderad. På/av-raden, EN fråga (vilken ände), en valfri orsak. Sidans handler är efterbildad
// (medBackvag på markeringen), så vad som sparas på vägen är vad testet läser.
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import { BackvagVal } from './BackvagVal';
import { lasBackvag, medBackvag, type Backvag } from '@/lib/backvag';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null; let el: HTMLElement | null = null;
afterEach(async () => { await act(async () => { rot?.unmount(); }); el?.remove(); rot = null; });

async function visa(start: Record<string, unknown>) {
  const sparat: Array<Record<string, unknown>> = [];
  function Sida() {
    const [m, setM] = useState<Record<string, unknown>>(start);
    return <BackvagVal backvag={lasBackvag(m)} onAndra={(bv: Backvag | null) => { const ny = medBackvag(m, bv); sparat.push(ny); setM(ny); }} />;
  }
  el = document.createElement('div'); document.body.appendChild(el);
  rot = createRoot(el);
  await act(async () => { rot!.render(<Sida />); });
  return sparat;
}
const q = (id: string) => el!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const klick = async (id: string) => { await act(async () => { q(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

describe('Backväg i markeringsmenyn', () => {
  it('en vanlig väg: bara raden Backväg (av) — ingen ände- eller orsakfråga', async () => {
    await visa({ id: 1, lineType: 'mainRoad' });
    expect(q('backvag-brytare')!.getAttribute('aria-checked')).toBe('false');
    expect(q('backvag-text')!.textContent).toBe('Man kör in och måste backa ut');
    expect(q('backvag-ande-start')).toBeNull();
    expect(q('backvag-orsak-sten')).toBeNull();
  });
  it('slå på → hindret i slutet förvalt, orsak ej satt; kortet säger "Backväg – backa ut"', async () => {
    const sparat = await visa({ id: 1, lineType: 'mainRoad', farg: 'red' });
    await klick('backvag-brytare');
    expect(sparat.at(-1)).toEqual({ id: 1, lineType: 'mainRoad', farg: 'red', backvag: { ande: 'slut' } });   // vägens färg rörs inte
    expect(q('backvag-brytare')!.getAttribute('aria-checked')).toBe('true');
    expect(q('backvag-text')!.textContent).toBe('Backväg – backa ut');
    expect(q('backvag-ande-slut')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('backvag-ande-start')!.getAttribute('aria-pressed')).toBe('false');
  });
  it('byt ände med ett tryck; orsaken (EN åt gången) syns i texten; tryck igen tar bort orsaken; orsaken följer med när änden byts', async () => {
    const sparat = await visa({ id: 1, lineType: 'sideRoadBlue', backvag: { ande: 'slut' } });
    await klick('backvag-ande-start');
    expect(sparat.at(-1)!.backvag).toEqual({ ande: 'start' });
    await klick('backvag-orsak-sten');
    expect(sparat.at(-1)!.backvag).toEqual({ ande: 'start', orsak: 'sten' });
    expect(q('backvag-text')!.textContent).toBe('Backväg – backa ut · Sten');
    await klick('backvag-orsak-brant');                                        // EN åt gången: Brant ersätter Sten
    expect(sparat.at(-1)!.backvag).toEqual({ ande: 'start', orsak: 'brant' });
    await klick('backvag-ande-slut');
    expect(sparat.at(-1)!.backvag).toEqual({ ande: 'slut', orsak: 'brant' });
    await klick('backvag-orsak-brant');                                        // tryck igen = ingen orsak
    expect(sparat.at(-1)!.backvag).toEqual({ ande: 'slut' });
    expect(q('backvag-text')!.textContent).toBe('Backväg – backa ut');
  });
  it('orsakerna är Sten · Brant · Blött · Annat och ingen fritext finns', async () => {
    await visa({ id: 1, lineType: 'mainRoad', backvag: { ande: 'slut' } });
    const orsaker = Array.from(el!.querySelectorAll('[data-testid^="backvag-orsak-"]')).map((b) => b.textContent);
    expect(orsaker).toEqual(['Sten', 'Brant', 'Blött', 'Annat']);
    expect(el!.querySelector('input, textarea')).toBeNull();
  });
  it('slå av → fältet tas bort från vägen (som före backväg) och frågorna försvinner', async () => {
    const sparat = await visa({ id: 1, lineType: 'mainRoad', backvag: { ande: 'start', orsak: 'blott' } });
    await klick('backvag-brytare');
    expect(sparat.at(-1)).toEqual({ id: 1, lineType: 'mainRoad' });
    expect('backvag' in sparat.at(-1)!).toBe(false);
    expect(q('backvag-ande-start')).toBeNull();
  });
});
