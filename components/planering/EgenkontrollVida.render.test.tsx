// @vitest-environment jsdom
// Egenkontroll till Vida: föraren ser bara sina frågor, ett tryck sparar, en avvikelse kräver en rad, appens svar ligger bakom en rad.
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import EgenkontrollVida, { egenkontrollRad } from './EgenkontrollVida';
import { byggEgenkontroll, type Svar, type VidaFraga } from '@/lib/vidaEgenkontroll';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const q = (sektion: string, fraga: string, ...a: string[]): VidaFraga => ({ sektion, fraga, svarsalternativ: a.map((t) => ({ text: t.replace(/!$/, ''), larmar: t.endsWith('!') })) });
const MALL: VidaFraga[] = [
  q('5 Avverkningsplanering', 'Fanns samtliga trakthandlingar för att utföra arbetet på ett korrekt och säkert sätt?', 'Ja', 'Nej!'),
  q('5 Avverkningsplanering', 'Var beståndsgränser och nödvändig hänsyn utmärkt i fält?', 'Ja', 'Nej!'),
  q('99Slutresultat', 'Är trakten avverkad utan körskador?', 'Ja', 'Nej!'),
  q('99Slutresultat', 'Uppfyller avverkningen Vidas krav?', 'Ja', 'Nej!'),
];
const FAKTA = { cert: 'FSC PEFC', grot: false, evighetstrad: 0, evighetstradKrav: null };

function visa(roll: 'skordare' | 'skotare' | null, svar: Record<string, Svar> = {}) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  const onSvara = vi.fn(async () => true);
  act(() => root.render(<EgenkontrollVida objektNamn="Edestad" lage="ok" modell={byggEgenkontroll(MALL, FAKTA, svar)} roll={roll} svar={svar} fel={null}
    onSvara={onSvara} onLasOm={() => {}} onTillbaka={() => {}} onStang={() => {}} />));
  return { cont, onSvara };
}
const hitta = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe('förarens vy', () => {
  it('skördaren ser bara sina frågor och ett tryck sparar', () => {
    const { cont, onSvara } = visa('skordare');
    expect(hitta(cont, 'ek-svar')!.textContent).toContain('0 av 1');
    expect(hitta(cont, 'ek-fraga-grans')).not.toBeNull();
    expect(hitta(cont, 'ek-fraga-korskador')).toBeNull();
    act(() => hitta(cont, 'ek-knapp-grans-ok')!.click());
    expect(onSvara).toHaveBeenCalledWith('grans', 'ok', null);
  });

  it('en avvikelse visar ett fält och räknas inte som klar utan en rad', () => {
    const { cont } = visa('skotare', { korskador: { varde: 'av' } });
    expect(hitta(cont, 'ek-kommentar-korskador')).not.toBeNull();
    expect(hitta(cont, 'ek-svar')!.textContent).toContain('0 av 1');
    const k = visa('skotare', { korskador: { varde: 'av', kommentar: 'Spår vid bäcken' } });
    expect(hitta(k.cont, 'ek-svar')!.textContent).toContain('Klart');
  });

  it('appens svar ligger dolda bakom en rad', () => {
    const { cont } = visa('skordare');
    expect(cont.textContent).not.toContain('Traktdirektiv och karta importerade');
    act(() => hitta(cont, 'ek-appen-rad')!.click());
    expect(cont.textContent).toContain('Traktdirektiv och karta importerade');
  });
});

it('planeraren ser Vidas hela formulär och att inget skickas', () => {
  const { cont } = visa(null, { grans: { varde: 'ok' }, korskador: { varde: 'ok' } });
  expect(cont.querySelectorAll('[data-testid="ek-vida-rad"]')).toHaveLength(4);
  expect(hitta(cont, 'ek-vida-svar')!.textContent).toContain('Inga avvikelser');
  expect(hitta(cont, 'ek-vida-svar')!.textContent).toContain('skickas inte till Vida');
});

it('raden på kortet', () => {
  const m = byggEgenkontroll(MALL, FAKTA, {});
  expect(egenkontrollRad(m, 'skordare', {})!.under).toBe('0 av 1 frågor');
  expect(egenkontrollRad(m, 'skordare', { grans: { varde: 'ok' } })!.under).toBe('✓ Klar');
  expect(egenkontrollRad(null, 'skordare', {})).toBeNull();
});
