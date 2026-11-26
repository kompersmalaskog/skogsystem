// @vitest-environment jsdom
// STAPLADE YTOR (Martin 2026-11-23): ligger flera ytor över varandra under ett tryck (Hänsyn 3 och en fornlämningsyta) visas ALLA i samma kort, var och en med eget huvud,
// Viktigt-rad, kommentarer och kommentarsfält. En enda yta → kortet ser ut precis som förut (ingen stapeldel).
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KartKort, type KartKortProps } from './KartKort';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const bas = (namn: string, grupp: string, viktigt: string | null): Omit<KartKortProps, 'onStang' | 'fler' | 'tillbaka' | 'testid'> => ({
  ikon: <span>ikon</span>, namn, grupp: grupp as any, larmRegel: 'Larmar alltid', mening: `${namn} – mening`,
  kommentarer: viktigt ? [{ id: namn, text: '', viktigt, forfattare: 'Daniel · i går 16:20', vantar: false, kanAndra: false, kanRadera: false } as any] : [],
  kanKommentera: true, kanViktigt: true, onLaggKommentar: () => {}, onAndraKommentar: () => {}, onRaderaKommentar: () => {}, foton: [], onLaggTillFoto: () => {},
});
function visa(fler?: KartKortProps['fler']) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  act(() => { root.render(<KartKort {...bas('Lämning', 'kultur', 'Kör inte över muren')} onStang={() => {}} fler={fler} />); });
}
const alla = (id: string) => Array.from(document.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
beforeEach(() => { document.body.innerHTML = ''; });

describe('KartKort — stapel av överlappande ytor', () => {
  it('en enda yta: ingen stapeldel, ett kommentarsfält, kortet är som förut', () => {
    visa();
    expect(alla('kartkort-stapel-del')).toHaveLength(0);
    expect(alla('viktigt-rad')).toHaveLength(1);
  });
  it('två ytor: första i huvudkortet, andra som egen stapeldel med eget huvud, Viktigt-rad och kommentarsfält; bara EN stäng-knapp', () => {
    visa([bas('Hänsyn 3', 'natur', 'Lämna kantzonen')]);
    const delar = alla('kartkort-stapel-del');
    expect(delar).toHaveLength(1);
    expect(delar[0].textContent).toContain('Hänsyn 3');
    expect(delar[0].querySelector('[data-testid="viktigt-rad"]')?.textContent).toContain('Lämna kantzonen');
    expect(document.body.textContent).toContain('Lämning');
    expect(alla('viktigt-rad')).toHaveLength(2);
    expect(document.querySelectorAll('button[aria-label="Stäng"]')).toHaveLength(1);
    // varje del har sitt eget Kommentar-fält (knapp)
    expect(Array.from(document.querySelectorAll('button')).filter((b) => /Kommentar/.test(b.textContent || '')).length).toBe(2);
  });
  it('tre ytor ger två stapeldelar i given ordning', () => {
    visa([bas('Hänsyn 3', 'natur', null), bas('Övrigt 4', 'info', null)]);
    expect(alla('kartkort-stapel-del').map((e) => e.textContent!.includes('Hänsyn 3') ? 'h' : e.textContent!.includes('Övrigt 4') ? 'o' : '?')).toEqual(['h', 'o']);
  });
});
