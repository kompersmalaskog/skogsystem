// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Behorighet, Person } from '@/lib/cert/behorighet';

const spara = vi.fn(async (..._a: any[]) => {});
vi.mock('@/lib/cert/data', () => ({
  BUCKET: 'utbildningsbevis',
  signeraIntyg: async (p: string) => `https://signerad/${p}`,
  sparaPerson: (...a: any[]) => spara(...a),
}));
vi.mock('@/lib/markeringFoto', () => ({ komprimeraMarkeringFoto: async () => new Blob(['x'], { type: 'image/jpeg' }) }));

import Behorigheter from './Behorigheter';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(URL as any).createObjectURL = () => 'blob:ny';
(URL as any).revokeObjectURL = () => {};

const IDAG = '2026-11-11';
const plus = (d: number) => new Date(Date.UTC(2026, 10, 11 + d)).toISOString().slice(0, 10);
const b = (p: Partial<Behorighet>): Behorighet => ({
  typId: 't-syn', seKrav: '3.1.1', namn: 'SYN avverkning', giltighetManader: 60,
  bevisId: 'b1', kursdatum: '2024-01-10', giltigTill: plus(400), intygPath: null, uppladdadSe: false, ...p,
});
const hlr = (p: Partial<Behorighet>) => b({ typId: 't-hlr', seKrav: '3.1.10', namn: 'Första hjälpen / HLR', giltighetManader: 24, bevisId: 'b2', ...p });
const VAXLAR = [{ typId: 't-adr', seKrav: '3.1.9', namn: 'ADR 1.3', giltighetManader: 60, etikett: 'Kör farligt gods' }];

function rita(personer: Person[], onSparat = () => {}) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  act(() => root.render(<Behorigheter data={{ personer, vaxlar: VAXLAR }} idag={IDAG} skapadAv="admin-1" onSparat={onSparat} />));
  return div;
}
const knapp = (text: string) => [...document.querySelectorAll('button')].find(k => k.textContent?.trim() === text) as HTMLButtonElement;
function skriv(input: HTMLInputElement, v: string) {
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { s.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => { document.body.innerHTML = ''; spara.mockClear(); });

describe('Cert › Behörigheter', () => {
  it('svaret överst, etiketter i ord, och utgånget sorteras överst', () => {
    const div = rita([
      { id: 'a', namn: 'Anna', behorigheter: [b({}), hlr({})] },
      { id: 's', namn: 'Stefan', behorigheter: [b({}), hlr({ giltigTill: plus(40) })] },
      { id: 'z', namn: 'Zeke', behorigheter: [b({ giltigTill: plus(-2) }), hlr({ bevisId: null, giltigTill: null })] },
    ]);
    expect(div.querySelector('h2')?.textContent).toBe('1 intyg har gått ut');
    const rader = [...div.querySelectorAll('[data-cert-person]')];
    expect(rader.map(r => r.getAttribute('data-cert-person'))).toEqual(['z', 's', 'a']);
    expect(rader[0].textContent).toContain('SYN · utgången');
    expect(rader[0].textContent).toContain('HLR · saknas');
    expect(rader[1].textContent).toContain('HLR · 40 dagar');
    expect(rader[1].querySelector('[data-cert-etikett="snart"]')).not.toBeNull();
    expect([...rader[2].querySelectorAll('[data-cert-etikett]')].map(e => e.textContent)).toEqual(['SYN', 'HLR']);
  });

  it('89 dagar är gult, 91 dagar är OK', () => {
    const div = rita([{ id: 'a', namn: 'Anna', behorigheter: [b({ giltigTill: plus(89) }), hlr({ giltigTill: plus(91) })] }]);
    expect(div.querySelector('[data-cert-etikett="snart"]')?.textContent).toBe('SYN · 89 dagar');
    expect(div.querySelector('[data-cert-etikett="ok"]')?.textContent).toBe('HLR');
  });

  it('tomt läge säger vad man gör', () => {
    const div = rita([{ id: 'a', namn: 'Anna', behorigheter: [b({ bevisId: null, kursdatum: null, giltigTill: null })] }]);
    expect(div.textContent).toContain('Inga intyg än');
    expect(div.textContent).toContain('Tryck på en förare och fota kursintyget.');
  });

  it('arket: Spara är grå tills något ändrats, kursdatum fyller i giltig till, och fotot följer med', async () => {
    const sparat = vi.fn();
    const div = rita([{ id: 'a', namn: 'Anna', behorigheter: [b({ bevisId: null, kursdatum: null, giltigTill: null })] }], sparat);
    act(() => (div.querySelector('[data-cert-person="a"]') as HTMLButtonElement).click());
    expect(knapp('Spara').disabled).toBe(true);

    // Foto utan kursdatum räcker inte
    const kamera = document.querySelector('[data-cert-kamera]') as HTMLInputElement;
    expect(kamera.getAttribute('capture')).toBe('environment');
    Object.defineProperty(kamera, 'files', { value: [new File(['x'], 'i.jpg', { type: 'image/jpeg' })], configurable: true });
    await act(async () => { kamera.dispatchEvent(new Event('change', { bubbles: true })); });
    await tick();
    expect(document.querySelector('[data-cert-intyg="bild"]')?.getAttribute('src')).toBe('blob:ny');
    expect(knapp('Spara').disabled).toBe(true);
    expect(document.body.textContent).toContain('Fyll i kursdatum för att spara');

    const [kurs, till] = [...document.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
    skriv(kurs, '2026-03-15');
    expect(till.value).toBe('2031-03-15');
    expect(knapp('Spara').disabled).toBe(false);

    await act(async () => { knapp('Spara').click(); });
    await tick();
    expect(spara).toHaveBeenCalledTimes(1);
    const [personId, andringar, krav, av] = spara.mock.calls[0];
    expect(personId).toBe('a');
    expect(andringar[0].f).toMatchObject({ kursdatum: '2026-03-15', giltigTill: '2031-03-15', nyttFoto: true });
    expect(andringar[0].foto).toBeInstanceOf(Blob);
    expect(krav).toEqual([]);
    expect(av).toBe('admin-1');
    expect(sparat).toHaveBeenCalled();
  });

  it('ett sparat foto syns som miniatyr', async () => {
    const div = rita([{ id: 'a', namn: 'Anna', behorigheter: [b({ intygPath: 'cert/a/t-syn-1.jpg' })] }]);
    act(() => (div.querySelector('[data-cert-person="a"]') as HTMLButtonElement).click());
    await tick();
    expect(document.querySelector('[data-cert-intyg="bild"]')?.getAttribute('src')).toBe('https://signerad/cert/a/t-syn-1.jpg');
  });

  it('"Kör farligt gods" lägger till ADR och sparas som krav', async () => {
    const div = rita([{ id: 'a', namn: 'Anna', behorigheter: [b({})] }]);
    act(() => (div.querySelector('[data-cert-person="a"]') as HTMLButtonElement).click());
    expect(document.body.textContent).not.toContain('ADR 1.3 · SE-krav 3.1.9');
    const vaxel = document.querySelector('[role="switch"][aria-label="Kör farligt gods"]') as HTMLElement;
    act(() => vaxel.click());
    expect(document.body.textContent).toContain('ADR 1.3 · SE-krav 3.1.9');
    await act(async () => { knapp('Spara').click(); });
    await tick();
    expect(spara.mock.calls[0][2]).toEqual([{ typId: 't-adr', pa: true }]);
  });

  it('att ta bort ett intyg kräver en bekräftelse', () => {
    const div = rita([{ id: 'a', namn: 'Anna', behorigheter: [b({})] }]);
    act(() => (div.querySelector('[data-cert-person="a"]') as HTMLButtonElement).click());
    act(() => knapp('Ta bort intyget').click());
    expect(knapp('Spara').disabled).toBe(true);
    act(() => knapp('Ja, ta bort').click());
    expect(document.body.textContent).toContain('Intyget tas bort när du sparar');
    expect(knapp('Spara').disabled).toBe(false);
  });
});
