// @vitest-environment jsdom
// "Den här har en kommentar – radera ändå?" (Martin 2026-11-26): frågan visar kommentarens text (Viktigt-raden i orange överst), Avbryt är förvalt (fokuserad, primär) och Radera
// är röd text. Stänger med Avbryt, Esc och tryck utanför utan att radera; bara Radera ändå raderar.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import RaderaKommentarFraga from './RaderaKommentarFraga';
import { FARG, KNAPP } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const norm = (prop: 'background' | 'color', v: string) => { const d = document.createElement('div'); d.style[prop] = v; return d.style[prop]; };
const t = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const klick = (el: Element | null) => act(() => { (el as HTMLElement).click(); });

function visa(onAvbryt = vi.fn(), onRadera = vi.fn()) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  act(() => {
    root.render(<RaderaKommentarFraga onAvbryt={onAvbryt} onRadera={onRadera}
      rader={[{ id: '1', text: 'Kör sakta vid bron', viktigt: null, forfattare: 'Test · i går 11:00' }, { id: '2', text: '', viktigt: 'Bro smal – kör mitt på', forfattare: 'Martin · idag 08:00' }]} />);
  });
  return { onAvbryt, onRadera };
}
beforeEach(() => { document.body.innerHTML = ''; });

describe('RaderaKommentarFraga', () => {
  it('säger frågan, visar kommentarernas text och Viktigt-raden i orange', () => {
    visa();
    expect(t('radera-kommentar-fraga')!.textContent).toBe('Den här har en kommentar – radera ändå?');
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('Kör sakta vid bron');
    expect(txt).toContain('Bro smal – kör mitt på');
    expect(t('viktigt-rad')!.style.color).toBe('rgb(255, 159, 10)');
    expect(FARG.orange.toLowerCase()).toBe('#ff9f0a');
  });
  it('Avbryt är förvalt: fokuserad och primär (vit); Radera är röd destruktiv text', () => {
    visa();
    const avbryt = t('radera-kommentar-avbryt') as HTMLButtonElement; const ja = t('radera-kommentar-ja') as HTMLButtonElement;
    expect(document.activeElement).toBe(avbryt);
    expect(avbryt.style.background).toBe(norm('background', KNAPP.primar.background as string));
    expect(ja.style.color).toBe(norm('color', KNAPP.destruktiv.color as string));
    expect(ja.textContent).toBe('Radera ändå');
  });
  it('Avbryt, Esc och tryck utanför raderar inte; Radera ändå gör det', () => {
    const a = visa();
    klick(t('radera-kommentar-avbryt')); expect(a.onAvbryt).toHaveBeenCalledTimes(1); expect(a.onRadera).not.toHaveBeenCalled();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); expect(a.onAvbryt).toHaveBeenCalledTimes(2); expect(a.onRadera).not.toHaveBeenCalled();
    klick(document.querySelector('[role="dialog"]')); expect(a.onAvbryt).toHaveBeenCalledTimes(3); expect(a.onRadera).not.toHaveBeenCalled();
    klick(t('radera-kommentar-ja')); expect(a.onRadera).toHaveBeenCalledTimes(1);
  });
});
