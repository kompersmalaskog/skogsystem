// @vitest-environment jsdom
// Riskbedömningen renderad på riktigt: planerarens steg i "Klar med trakten?" (med de riktiga funktionerna i lib/riskbedomning som "databas")
// och förarens väg — raden på ⓘ-kortet, listan och "Jag har läst".
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));

import KlarMedTrakten from './KlarMedTrakten';
import { klarProps } from './KlarMedTrakten.testhjalp';
import { ForarRisker, riskRadUnder } from './Risker';
import ObjektKortEnkel from './ObjektKortEnkel';
import {
  RISK_TOM, aktuellaRisker, aterstallForslag, borttagnaForslag, foreslaRisker, forarRisk, godkann, laggTillEgen, riskLage, riskUnderlag, taBortEgen, taBortForslag, type Riskbedomning,
} from '@/lib/riskbedomning';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let el: HTMLElement | null = null;
const q = (id: string) => el!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const klicka = (x: Element | null) => { expect(x, 'elementet finns').not.toBeNull(); act(() => { (x as HTMLElement).click(); }); };
const skriv = (x: HTMLInputElement, v: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(x, v);
  x.dispatchEvent(new Event('input', { bubbles: true }));
});
const montera = (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el); act(() => { rot!.render(n); }); };
afterEach(() => { act(() => rot?.unmount()); el?.remove(); rot = null; el = null; });

const FORSLAG = foreslaRisker({ markeringar: [{ slag: 'symbol', typ: 'powerline' }], vidaKraftledning: false, terrang: 'brant', barighet: null, manuellFallning: false });

/** Sidans roll: bedömningen är "databasen", trycken ändrar den. */
function Planerare({ spar }: { spar: { rb: Riskbedomning } }) {
  const [rb, setRb] = useState<Riskbedomning>(RISK_TOM);
  const satt = (x: Riskbedomning) => { spar.rb = x; setRb(x); };
  const lista = aktuellaRisker(FORSLAG, rb);
  const godk = riskLage(lista, rb) === 'godkand';
  return (
    <KlarMedTrakten {...klarProps({})} namn="Skälviken" startVy={{ v: 'steg', flode: { typ: 'ett', steg: 'risker', till: 'kort' } }}
      risker={{
        lista, borttagna: borttagnaForslag(FORSLAG, rb), godkand: godk, godkandText: godk ? 'Martin 1 nov' : null, lasta: [], lastaFel: false,
        onTaBort: (n) => satt(n.startsWith('egen:') ? taBortEgen(rb, n.slice(5)) : taBortForslag(rb, n)),
        onAterstall: (n) => satt(aterstallForslag(rb, n)),
        onLaggTill: (r, a) => { const ny = laggTillEgen(rb, 'x1', r, a); if (ny) satt(ny); },
        onStammer: () => satt(godkann(rb, lista, 'm1', '2026-11-01T10:00:00Z')),
      }} />
  );
}

describe('planerarens steg', () => {
  it('appens förslag står med vad och vad man gör; "Gäller inte" flyttar ner, Ta tillbaka flyttar upp', () => {
    const spar = { rb: RISK_TOM };
    montera(<Planerare spar={spar} />);
    expect(q('risk-kraftledning')!.textContent).toContain('Fäll aldrig mot ledningen');
    expect(q('risk-kraftledning')!.textContent).toContain('Från kartan');
    expect(q('risk-brant')!.textContent).toContain('Från förutsättningarna');
    klicka(q('risk-brant-bort'));
    expect(q('risk-brant')).toBeNull();
    expect(q('risk-bort-brant')).not.toBeNull();
    klicka(q('risk-bort-brant-tillbaka'));
    expect(q('risk-brant')).not.toBeNull();
  });

  it('en egen risk kräver båda fälten och hamnar sist', () => {
    const spar = { rb: RISK_TOM };
    montera(<Planerare spar={spar} />);
    klicka(q('risker-lagg-till'));
    skriv(q('risker-ny-risk') as HTMLInputElement, 'Allmän väg vid avlägget');
    expect((q('risker-ny-lagg') as HTMLButtonElement).disabled).toBe(true);
    skriv(q('risker-ny-atgard') as HTMLInputElement, 'Varningsskylt när vi lastar');
    klicka(q('risker-ny-lagg'));
    expect(q('risk-egen:x1')!.textContent).toContain('Varningsskylt när vi lastar');
    expect(q('risk-egen:x1')!.textContent).toContain('Tillagd av planeraren');
    expect(spar.rb.egna).toHaveLength(1);
  });

  it('Stämmer sparar godkännandet av exakt listan', () => {
    const spar = { rb: RISK_TOM };
    montera(<Planerare spar={spar} />);
    klicka(q('klar-risker-stammer'));
    expect(spar.rb.godkand?.underlag).toBe(riskUnderlag(aktuellaRisker(FORSLAG, RISK_TOM)));
  });
});

describe('föraren', () => {
  const lista = aktuellaRisker(FORSLAG, RISK_TOM);
  const rb = godkann(RISK_TOM, lista, 'm1', '2026-11-01T10:00:00Z');

  it('raden är orange tills listan är läst, grön efteråt; ingen bedömning = dämpad rad som inte går att trycka', () => {
    expect(riskRadUnder(forarRisk(lista, rb, []).risker, false)).toEqual({ text: '2 risker · Läs innan du börjar', ton: 'orange' });
    expect(riskRadUnder(lista, true)).toEqual({ text: '2 risker · Läst ✓', ton: 'gron' });
    expect(riskRadUnder(null, false).ton).toBe('dampad');
  });

  it('raden på kortet öppnar listan; utan bedömning är raden ingen knapp', () => {
    let oppnad = 0;
    const bas = {
      namn: 'Skälviken', under: 'Slutavverkning', andel: null, onStang: () => {}, faror: [], grot: null, tillForaren: [], brand: null, onBrand: () => {},
      ytor: [], onYta: () => {}, knappar: [], onKnapp: () => {}, larm: { satt: false, koordinat: '', beskrivning: '', onVisa: () => {} }, dokument: null, onMer: () => {},
    };
    montera(<ObjektKortEnkel {...bas} risker={{ ...riskRadUnder(lista, false), onOppna: () => { oppnad++; } }} />);
    expect(q('kort-risker-under')!.textContent).toBe('2 risker · Läs innan du börjar');
    klicka(q('kort-risker-rad'));
    expect(oppnad).toBe(1);
    act(() => rot!.unmount());
    montera(<ObjektKortEnkel {...bas} risker={{ ...riskRadUnder(null, false), onOppna: null }} />);
    expect(q('kort-risker-rad')!.tagName).toBe('DIV');
    expect(q('kort-risker-under')!.textContent).toBe('Riskbedömningen är inte gjord än');
  });

  it('listan visar vad och vad man gör; "Jag har läst" byts mot "Läst ✓"', () => {
    let last = false; let tryck = 0;
    const Vy = () => {
      const [l, setL] = useState(last);
      return <ForarRisker objektNamn="Skälviken" risker={lista} last={l} sparFel={false} onLast={() => { tryck++; setL(true); }} onTillbaka={() => {}} onStang={() => {}} />;
    };
    montera(<Vy />);
    expect(q('forar-risker-lista')!.textContent).toContain('Kör rakt upp och ner');
    klicka(q('forar-risker-las'));
    expect(tryck).toBe(1);
    expect(q('forar-risker-las')).toBeNull();
    expect(q('forar-risker-last')!.textContent).toBe('Läst ✓');
  });
});

import RiskKortHytt from './RiskKortHytt';
import { riskKortLedigt } from '@/lib/instruktioner/ordning';

describe('riskkortet i hytten', () => {
  const lista = aktuellaRisker(FORSLAG, RISK_TOM);

  it('visar riskerna och vad man gör direkt i kortet; "Jag har läst" kvitterar', () => {
    let tryck = 0;
    montera(<RiskKortHytt risker={lista} top="0px" sparar={false} fel={false} onLast={() => { tryck++; }} />);
    expect(q('risk-kort-under')!.textContent).toBe('2 risker · Läs innan du börjar');
    expect(q('risk-kort-lista')!.textContent).toContain('Kör rakt upp och ner');
    klicka(q('risk-kort-las'));
    expect(tryck).toBe(1);
  });

  it('medan det sparas finns ingen knapp att trycka två gånger; ett fel sägs', () => {
    montera(<RiskKortHytt risker={lista} top="0px" sparar fel onLast={() => {}} />);
    expect(q('risk-kort-las')).toBeNull();
    expect(q('risk-kort-sparar')).not.toBeNull();
    expect(q('risk-kort-fel')!.textContent).toBe('Kunde inte spara. Försök igen.');
  });

  it('ordningen: fara, lossning och besök går före; inget att läsa = inget kort', () => {
    const bas = { harOlasta: true, larmVisas: false, lossningVisas: false, besokVisas: false };
    expect(riskKortLedigt(bas)).toBe(true);
    expect(riskKortLedigt({ ...bas, harOlasta: false })).toBe(false);
    expect(riskKortLedigt({ ...bas, larmVisas: true })).toBe(false);
    expect(riskKortLedigt({ ...bas, lossningVisas: true })).toBe(false);
    expect(riskKortLedigt({ ...bas, besokVisas: true })).toBe(false);
  });
});
