// @vitest-environment jsdom
// EN kommentarruta överallt: ljusare än kortet och 19 px text — samma värden som designens tokens (ingen egen stil i en kopia).
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { KommentarVisning } from './KommentarRuta';
import { FARG, TYP } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let el: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); el?.remove(); rot = null; el = null; });
async function visa(node: React.ReactNode) {
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el);
  await act(async () => { rot!.render(node as any); });
}
// Det webbläsaren gör av ett värde (jsdom normaliserar färger): jämför mot en referens med samma stil.
const sa = (prop: 'background' | 'fontSize', varde: string) => { const r = document.createElement('div'); (r.style as any)[prop] = varde; return (r.style as any)[prop] as string; };

describe('KommentarVisning — samma ruta på alla ställen', () => {
  it('rutan är ljusare än kortet (FARG.upphojt) och texten är 19 px', async () => {
    await visa(<KommentarVisning vida text={'Obs tjärdal enligt karta. Lämna ca 50-70 tallar per ha.'} meningar />);
    const ruta = el!.querySelector<HTMLElement>('[data-testid="kartkort-kommentar-vida"]')!;
    expect(ruta.style.background).toBe(sa('background', FARG.upphojt));
    expect(ruta.style.background).not.toBe(sa('background', FARG.kort));
    const text = el!.querySelector<HTMLElement>('[data-testid="kartkort-kommentar-text"]')!;
    expect(text.style.fontSize).toBe(sa('fontSize', `${TYP.kommentar.fontSize}px`));
    expect(TYP.kommentar.fontSize).toBe(19);
  });
  it('Vidas direktiv: etiketten i blått och en numrerad punkt per mening — texten helt, aldrig avklippt', async () => {
    const T = 'Obs tjärdal enligt karta. Lämna ca 50-70 tallar per ha . Lämna fina ekar och några bokar. Två hänsynsområde enligt karta. Gräns mot reservat. En del fällning.';
    await visa(<KommentarVisning vida text={T} meningar />);
    expect(el!.querySelectorAll('[data-testid="kartkort-kommentar-punkt"]')).toHaveLength(6);
    expect(el!.querySelector<HTMLElement>('[data-testid="kartkort-kommentar-kalla"]')!.textContent).toBe('Vida · traktdirektiv');
    expect(el!.textContent).toContain('En del fällning.');
    expect(el!.textContent).not.toContain('Läs allt');
    const ruta = el!.querySelector<HTMLElement>('[data-testid="kartkort-kommentar-vida"]')!;
    expect(ruta.style.overflow).toBe('');
    expect(ruta.innerHTML).not.toMatch(/line-clamp|max-height/i);
  });
});
