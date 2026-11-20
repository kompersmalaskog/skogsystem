// @vitest-environment jsdom
// Strecket över det som inte gäller i Vidas text (Martin 2026-11-05): läsläget och planerarens "Stryk det som inte gäller".
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import { KommentarVisning } from './KommentarRuta';
import { vaxlaStruken, type Struken } from '@/lib/vidaStruket';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BONDESKOG = 'Säljaren behåller lövet.3 m. kolla hur många tallar vi ska lämna.';
let rot: Root | null = null; let el: HTMLDivElement;
const montera = async (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el); await act(async () => { rot!.render(n); }); };
afterEach(() => { act(() => rot?.unmount()); el?.remove(); rot = null; });

function Planerare() {
  const [s, setS] = useState<Struken[]>([]);
  return <KommentarVisning vida meningar text={BONDESKOG} struket={s} onVaxla={(d) => setS((f) => vaxlaStruken(f, d, 'Martin', '2026-11-05T17:50:00Z'))} />;
}

describe('Vidas text med streck', () => {
  it('föraren: utan streck ser texten ut som förut; inga knappar', async () => {
    await montera(<KommentarVisning vida meningar text={BONDESKOG} />);
    expect(el.textContent).toContain(BONDESKOG);
    expect(el.querySelector('button')).toBeNull();
  });

  it('föraren: den strukna delen står kvar, med streck och vem och när', async () => {
    await montera(<KommentarVisning vida meningar text={BONDESKOG} struket={[{ del: 'kolla hur många tallar vi ska lämna.', av: 'Martin', at: '2026-11-05T17:50:00Z' }]} />);
    const struken = el.querySelector('[data-struken]') as HTMLElement;
    expect(struken.textContent).toBe('kolla hur många tallar vi ska lämna.');
    expect(struken.style.textDecoration).toBe('line-through');
    expect(el.textContent).toContain('Säljaren behåller lövet.');
    expect(el.textContent).toContain('Struket 5 nov av Martin');
    expect(el.querySelector('button')).toBeNull();
  });

  it('planeraren: Stryk det som inte gäller → en rad per del → Stryk → Klar; ett tryck till tar tillbaka', async () => {
    await montera(<Planerare />);
    await act(async () => { (el.querySelector('[data-testid=vida-streck-andra]') as HTMLButtonElement).click(); });
    const delar = () => [...el.querySelectorAll('[data-testid=vida-streck-del]')] as HTMLButtonElement[];
    expect(delar().map((d) => d.textContent)).toEqual(['Säljaren behåller lövet.Stryk', '3 m.Stryk', 'kolla hur många tallar vi ska lämna.Stryk']);
    await act(async () => { delar()[2].click(); });
    expect(delar()[2].textContent).toContain('Ta tillbaka');
    expect(delar()[2].getAttribute('aria-pressed')).toBe('true');
    await act(async () => { ([...el.querySelectorAll('button')].find((b) => b.textContent === 'Klar') as HTMLButtonElement).click(); });
    expect(el.querySelector('[data-struken]')?.textContent).toBe('kolla hur många tallar vi ska lämna.');
    await act(async () => { (el.querySelector('[data-testid=vida-streck-andra]') as HTMLButtonElement).click(); });
    await act(async () => { delar()[2].click(); });
    await act(async () => { ([...el.querySelectorAll('button')].find((b) => b.textContent === 'Klar') as HTMLButtonElement).click(); });
    expect(el.querySelector('[data-struken]')).toBeNull();
  });
});
