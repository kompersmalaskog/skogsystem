// @vitest-environment jsdom
// Överblicken när maskinen börjar på en trakt (Martin 2026-11-04, Stefan på Bondeskog): allt på EN sida, "Börja köra" längst ner.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import TraktOversikt, { type TraktOversiktProps } from './TraktOversikt';
import ObjektKortEnkel from './ObjektKortEnkel';
import { tillForaren, type KartMarkering } from '@/lib/objektKort';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let ruta: HTMLElement | null = null;
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
async function montera(el: React.ReactElement) {
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
  await act(async () => { rot!.render(el); });
}
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });

const mark = (id: string, typ: string, namn: string, comment = '', slag: KartMarkering['slag'] = 'symbol'): KartMarkering =>
  ({ id, slag, typ, namn, comment, lat: 57, lng: 15, skapad: null, ordning: Number(id) } as KartMarkering);

function props(o: Partial<TraktOversiktProps> = {}): TraktOversiktProps {
  return {
    namn: 'Bondeskog au 2026', under: 'Slutavverkning · PEFC · 2,5 ha', faror: ['Kraftledning'],
    tillForaren: tillForaren({ vida: 'Lämna kantzon mot bäcken. Spara grova ekar.' }),
    infor: [{ id: 'band-skordare', etikett: 'Band skördare', text: 'Ja' }, { id: 'ved', etikett: 'Ved till markägaren', text: 'vid avlägget' }],
    markeringar: [mark('1', 'eternitytree', 'Evighetsträd', 'Grov ek'), mark('2', 'eternitytree', 'Evighetsträd'), mark('3', 'warning', 'Varning', 'Brunn')],
    miljo: [], ytor: [], ikon: () => <span />, nya: new Set(['2']), nyaTexter: new Set(),
    onRad: () => {}, onBorja: () => {}, onStang: () => {},
    ...o,
  };
}

describe('TraktOversikt', () => {
  it('namn, raden under, meningen, faror (Vidas och våra), direktivet, inför jobbet och vad som finns på kartan', async () => {
    await montera(<TraktOversikt {...props()} />);
    expect(q('info-titel')!.textContent).toBe('Bondeskog au 2026');
    expect(q('info-undertitel')!.textContent).toBe('Slutavverkning · PEFC · 2,5 ha');
    expect(q('oversikt-mening')!.textContent).toBe('2 faror · 2 saker inför jobbet · 2 saker på kartan, 2 med text');
    expect(q('oversikt-faror')!.textContent).toContain('Kraftledning');
    expect(q('oversikt-faror')!.textContent).toContain('Varning');
    expect(q('oversikt-till-foraren')!.textContent).toContain('Lämna kantzon mot bäcken');
    expect(q('oversikt-infor')!.textContent).toContain('Band skördare');
    const pa = q('oversikt-pa-trakten')!;
    expect(pa.textContent).toContain('Evighetsträd');
    expect(pa.textContent).toContain('1 med text');
    expect(pa.querySelector('[data-testid="oversikt-nytt"]')).not.toBeNull();   // nr 2 är nytt sedan sist
  });
  it('inget som avviker → ingen Inför jobbet-rubrik; inga faror → "Inga faror" i meningen och ingen ruta', async () => {
    await montera(<TraktOversikt {...props({ faror: [], infor: [], markeringar: [mark('1', 'eternitytree', 'Evighetsträd')], nya: new Set() })} />);
    expect(q('oversikt-infor')).toBeNull();
    expect(q('oversikt-faror')).toBeNull();
    expect(q('oversikt-mening')!.textContent).toBe('Inga faror · 1 sak på kartan');
    expect(q('oversikt-nytt')).toBeNull();
  });
  it('en rad öppnar den sorten (alla markeras på kartan); Börja köra är knappen längst ner', async () => {
    const rad: string[] = []; let borja = 0;
    await montera(<TraktOversikt {...props({ onRad: (n) => rad.push(n), onBorja: () => { borja++; } })} />);
    const knapp = ruta!.querySelector<HTMLElement>('[data-testid^="oversikt-rad-"]')!;
    act(() => { knapp.click(); });
    expect(rad).toHaveLength(1);
    expect(q('oversikt-borja')!.textContent).toBe('Börja köra');
    act(() => { q('oversikt-borja')!.click(); });
    expect(borja).toBe(1);
  });
  it('förarens kort har raden "Visa hela trakten" när överblicken finns', async () => {
    let n = 0;
    await montera(<ObjektKortEnkel namn="X" under="" andel={null} onStang={() => {}} faror={[]} grot={null} tillForaren={[]} brand={null} onBrand={() => {}}
      ytor={[]} onYta={() => {}} knappar={[]} onKnapp={() => {}} larm={{ satt: false, koordinat: '', beskrivning: '', onVisa: () => {} }} dokument={null} onMer={() => {}}
      onOversikt={() => { n++; }} />);
    act(() => { q('kort-visa-hela')!.click(); });
    expect(n).toBe(1);
  });
});
