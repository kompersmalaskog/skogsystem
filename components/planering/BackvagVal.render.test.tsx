// @vitest-environment jsdom
// Backväg i markeringsmenyn: den RIKTIGA komponenten renderad. På/av-raden och EN fråga (vilken ände) — ingen orsak. Sidans handler är efterbildad
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
  it('en vanlig väg: bara raden "Backväg" med växeln av — ingen ände-fråga, ingen förklaringstext', async () => {
    await visa({ id: 1, lineType: 'mainRoad' });
    expect(q('backvag-brytare')!.getAttribute('aria-checked')).toBe('false');
    expect(q('backvag-text')!.textContent).toBe('Backväg');
    expect(q('backvag-ande-start')).toBeNull();
    expect(el!.textContent).toBe('Backväg');
  });
  it('slå på → hindret i slutet förvalt; kortet säger bara "Backväg"; vägens färg rörs inte', async () => {
    const sparat = await visa({ id: 1, lineType: 'mainRoad', farg: 'red' });
    await klick('backvag-brytare');
    expect(sparat.at(-1)).toEqual({ id: 1, lineType: 'mainRoad', farg: 'red', backvag: { ande: 'slut' } });
    expect(q('backvag-brytare')!.getAttribute('aria-checked')).toBe('true');
    expect(q('backvag-text')!.textContent).toBe('Backväg');
    expect(q('backvag-ande-slut')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('backvag-ande-start')!.getAttribute('aria-pressed')).toBe('false');
  });
  it('byt ände med ett tryck (och tillbaka) — det enda som lagras är änden', async () => {
    const sparat = await visa({ id: 1, lineType: 'sideRoadBlue', backvag: { ande: 'slut' } });
    await klick('backvag-ande-start');
    expect(sparat.at(-1)!.backvag).toEqual({ ande: 'start' });
    await klick('backvag-ande-slut');
    expect(sparat.at(-1)!.backvag).toEqual({ ande: 'slut' });
  });
  it('INGEN orsak: inga orsakknappar, ingen text och inga inmatningsfält — bara växel och Början/Slutet', async () => {
    await visa({ id: 1, lineType: 'mainRoad', backvag: { ande: 'slut' } });
    expect(el!.querySelector('[data-testid^="backvag-orsak-"]')).toBeNull();
    expect(el!.querySelector('input, textarea')).toBeNull();
    expect(el!.textContent).not.toMatch(/Sten|Brant|Blött|Annat|Orsak/);
    const knappar = Array.from(el!.querySelectorAll('button')).map((b) => b.getAttribute('data-testid'));
    expect(knappar).toEqual(['backvag-brytare', 'backvag-ande-start', 'backvag-ande-slut']);
  });
  it('slå av → fältet tas bort från vägen (som före backväg) och frågan försvinner', async () => {
    const sparat = await visa({ id: 1, lineType: 'mainRoad', backvag: { ande: 'start' } });
    await klick('backvag-brytare');
    expect(sparat.at(-1)).toEqual({ id: 1, lineType: 'mainRoad' });
    expect('backvag' in sparat.at(-1)!).toBe(false);
    expect(q('backvag-ande-start')).toBeNull();
  });
});
