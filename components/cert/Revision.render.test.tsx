// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Krav } from '@/lib/cert/krav';

const sparaKrav = vi.fn(async () => {});
vi.mock('@/lib/cert/data', () => ({ sparaKrav: (...a: unknown[]) => sparaKrav(...(a as [])) }));

import Revision from './Revision';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const tryck = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click(); });
const knapp = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const vaxel = (namn: string) => document.querySelector(`[role="switch"][aria-label="${namn}"]`);
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

const k = (o: Partial<Krav>): Krav => ({
  kravNr: '1.1.1', namn: 'Korrekta företagsuppgifter', sektionNr: 1, sektion: 'Företagsansvar', gallerOss: 'Ja',
  underlag: 'Registreringsbevis', hurOfta: 'Vid förändring', varFinns: 'Bolagsverket', klar: false, uppladdadSe: false, gallerNu: true, kalla: null, ...o,
});
const data = {
  krav: [
    k({}), k({ kravNr: '1.1.2', namn: 'Följer lagar', klar: true }), k({ kravNr: '1.2.1', namn: 'F-skatt', klar: true, uppladdadSe: true }),
    k({ kravNr: '1.4.1', namn: 'Korrekta tillstånd', gallerOss: 'Nej', varFinns: 'Inga utländska anställda' }),
    k({ kravNr: '1.5.9', namn: 'Bortaliggning', gallerOss: 'Om aktuellt', klar: true, uppladdadSe: true }),
    k({ kravNr: '3.1.10', namn: 'Första hjälpen och HLR', sektionNr: 3, sektion: 'Kompetens', kalla: 'utbildning' }),
    k({ kravNr: '4.1.1', namn: 'Mer än ett led', sektionNr: 4, sektion: 'Underentreprenörer', klar: true, uppladdadSe: true }),
  ],
  utb: { '3.1.10': { typId: 'hlr', antal: 7, giltiga: 5, medIntyg: 5, uppladdade: 2 } },
};

beforeEach(() => { document.body.innerHTML = ''; sparaKrav.mockClear(); });

function visa(sektion: number | null = null) {
  const onSektion = vi.fn(); const onSparat = vi.fn();
  const div = document.createElement('div'); document.body.appendChild(div);
  act(() => createRoot(div).render(<Revision data={data} sektion={sektion} onSektion={onSektion} onSparat={onSparat} />));
  return { onSektion, onSparat };
}

describe('Cert — översikten', () => {
  it('svaret överst och en rad per sektion med "N kvar" eller "Klart"', () => {
    const { onSektion } = visa();
    expect(document.querySelector('h2')!.textContent).toBe('3 saker kvar till revisionen');
    const rader = [...document.querySelectorAll('[data-cert-sektion]')].map(e => e.textContent!.replace('chevron_right', ''));
    expect(rader).toEqual(['Företagsansvar2 kvar', 'Kompetens1 kvar', 'UnderentreprenörerKlart']);
    expect(document.querySelector('[data-cert-person]')).toBeNull(); // ingen personlista: den bor i Utbildning
    tryck(document.querySelector('[data-cert-sektion="3"]'));
    expect(onSektion).toHaveBeenCalledWith(3);
  });
});

describe('Cert — en sektion', () => {
  it('kraven som gäller oss med status i ord; de som inte gäller ligger bakom en rad', () => {
    visa(1);
    const status = [...document.querySelectorAll('[data-cert-krav]')].map(e => `${e.getAttribute('data-cert-krav')} ${e.getAttribute('data-cert-status')}`);
    expect(status).toEqual(['1.1.1 saknas', '1.1.2 ej_uppladdat', '1.2.1 klart', '1.5.9 klart']);
    // Saknas är grått; orange bara på "Inte uppladdat hos SE"
    const farg = (nr: string) => (document.querySelector(`[data-cert-krav="${nr}"] span[style*="color"]`) as HTMLElement).style.color;
    expect(farg('1.1.1')).toBe(farg('1.2.1'));
    expect(farg('1.1.2')).not.toBe(farg('1.1.1'));
    expect(document.querySelector('[data-cert-krav="1.1.2"]')!.textContent).toContain('Inte uppladdat hos SE');
    expect(document.body.textContent).not.toContain('Korrekta tillstånd');
    expect(knapp('1 gäller inte er')).toBeTruthy();
    tryck(knapp('1 gäller inte er'));
    expect(document.body.textContent).toContain('Korrekta tillstånd');
  });

  it('arket: Spara är grå tills något ändrats, och sparar bockarna', async () => {
    const { onSparat } = visa(1);
    tryck(document.querySelector('[data-cert-krav="1.1.1"]'));
    expect(document.body.textContent).toContain('Registreringsbevis');
    expect(knapp('Spara').disabled).toBe(true);
    tryck(vaxel('Klart'));
    expect(knapp('Spara').disabled).toBe(false);
    tryck(vaxel('Klart')); // tillbaka = inget ändrat
    expect(knapp('Spara').disabled).toBe(true);
    tryck(vaxel('Klart'));
    tryck(vaxel('Uppladdat hos SE'));
    tryck(knapp('Spara'));
    await tick();
    expect(onSparat).toHaveBeenCalled();
    expect(sparaKrav).toHaveBeenCalledWith('1.1.1', { klar: true, uppladdadSe: true });
  });

  it('ett krav ur Utbildning har ingen Klart-växel: läget och en knapp till Utbildning', () => {
    visa(3);
    tryck(document.querySelector('[data-cert-krav="3.1.10"]'));
    expect(vaxel('Klart')).toBeNull();
    expect(knapp('Spara')).toBeUndefined();
    expect(document.querySelector('[data-cert-utb]')!.textContent).toContain('5 av 7 har HLR');
    expect([...document.querySelectorAll('a')].find(a => a.textContent === 'Öppna Utbildning')!.getAttribute('href')).toBe('/utbildning/typ/hlr');
  });

  it('"Om aktuellt": växeln Gäller oss just nu sparas, och ett avstängt krav går att öppna igen under gäller inte', async () => {
    visa(1);
    tryck(document.querySelector('[data-cert-krav="1.5.9"]'));
    expect(vaxel('Gäller oss just nu')!.getAttribute('aria-checked')).toBe('true');
    tryck(vaxel('Gäller oss just nu'));
    expect(vaxel('Klart')).toBeNull(); // gäller inte: inga bockar att sätta
    tryck(knapp('Spara'));
    await tick();
    expect(sparaKrav).toHaveBeenCalledWith('1.5.9', { klar: true, uppladdadSe: true, gallerNu: false });
  });

  it('ett krav som alltid gäller har ingen sådan växel', () => {
    visa(1);
    tryck(document.querySelector('[data-cert-krav="1.1.1"]'));
    expect(vaxel('Gäller oss just nu')).toBeNull();
  });
});
