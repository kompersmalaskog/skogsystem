// @vitest-environment jsdom
// Hela trakten — det föraren läser när han börjar (Martin 2026-11-05: "allt utskrivet", "så enkelt att ett barn förstår direkt").
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import TraktOversikt, { type TraktOversiktProps } from './TraktOversikt';
import ObjektKortEnkel from './ObjektKortEnkel';
import { tillForaren, type KartMarkering } from '@/lib/objektKort';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));
vi.mock('./BrandriskRad', () => ({ default: () => null }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let ruta: HTMLElement | null = null;
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => [...ruta!.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
async function montera(el: React.ReactElement) {
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
  await act(async () => { rot!.render(el); });
}
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });

const mark = (id: string, typ: string, namn: string, comment = '', slag: KartMarkering['slag'] = 'symbol'): KartMarkering =>
  ({ id, slag, typ, namn, comment, lat: 57, lng: 15, skapad: null, ordning: Number(id) } as KartMarkering);

function props(o: Partial<TraktOversiktProps> = {}): TraktOversiktProps {
  return {
    namn: 'Bondeskog AU 2026', under: 'Slutavverkning · PEFC · 2,5 ha',
    larm: { satt: true, koordinat: '56.81234, 15.12345', beskrivning: 'Vid avlägget', onVisa: () => {} },
    faror: [], risker: [], skydd: { lage: 'inga', rader: [] }, brand: null, onBrand: () => {},
    cert: { text: 'PEFC: alla 26 evighetsträd och 8 högstubbar är utsatta – spara dem.', klar: true }, onCert: () => {},
    tillForaren: tillForaren({ vida: 'Säljaren behåller lövet. Kolla hur många tallar vi ska lämna.' }),
    helaTrakten: [{ id: 'k1', text: 'Träden som ska sparas är märkta med röd färg.', forfattare: 'Martin · i går 16:20' }],
    infor: [{ id: 'band-skotare', etikett: 'Band skotare', text: 'Ja · 1 par' }],
    markeringar: [
      mark('1', 'eternitytree', 'Evighetsträd'), mark('2', 'eternitytree', 'Evighetsträd'),
      mark('3', 'landing', 'Avlägg'),
      { ...mark('4', 'path', 'Stig', '', 'linje'), kommentarer: [{ id: 'kk4', text: 'Kör och fäll inte på denna stigen', forfattare: 'Martin' }] },
    ],
    miljo: [{ id: 'evighetstrad', namn: 'Evighetsträd', antal: 26, krav: 26, uppfyllt: true }],
    ikon: () => <span />, objektId: 'o1', nya: new Set(['4']), nyaTexter: new Set(),
    last: false, onLast: async () => true, onOppna: () => {}, onFoto: () => {}, onMer: () => {}, onStang: () => {},
    ...o,
  };
}

describe('Hela trakten', () => {
  it('larmkoordinaten står FÖRST, före allt annat', async () => {
    await montera(<TraktOversikt {...props()} />);
    const innehall = q('oversikt-innehall')!;
    expect(innehall.firstElementChild!.getAttribute('data-testid')).toBe('oversikt-larm');
    expect(q('oversikt-larm')!.textContent).toContain('Om något händer – ring 112');
    expect(q('oversikt-larm')!.textContent).toContain('56.81234, 15.12345');
  });
  it('larmraden öppnar "Om något händer": koordinaten stort, täckningsraden, Visa på kartan, och ‹ Hela trakten tillbaka', async () => {
    let visa = 0;
    await montera(<TraktOversikt {...props({ larm: { satt: true, koordinat: '56.81234, 15.12345', beskrivning: 'Vid avlägget', onVisa: () => { visa++; } } })} />);
    act(() => { q('oversikt-larm-rad')!.click(); });
    expect(visa).toBe(0);
    expect(q('larm-koordinat')!.textContent).toBe('56.81234, 15.12345');
    expect(q('larm-beskrivning')!.textContent).toBe('Vid avlägget');
    expect(q('larm-tackning')!.textContent).toContain('täckning');
    expect(ruta!.textContent).not.toMatch(/kontrollera|kontrollerad/i);
    act(() => { q('larm-visa')!.click(); });
    expect(visa).toBe(1);
    act(() => { q('info-tillbaka')!.click(); });
    expect(q('oversikt-larm')).not.toBeNull();
  });
  it('larmkoordinat saknas → raden öppnar ingenting', async () => {
    await montera(<TraktOversikt {...props({ larm: { satt: false, koordinat: '', beskrivning: '', onVisa: () => {} } })} />);
    act(() => { q('oversikt-larm-rad')!.click(); });
    expect(q('larm-vy')).toBeNull();
  });
  it('all text är UTSKRIVEN: Vidas text, trakten och kommentaren på kartan — aldrig "1 med text"', async () => {
    await montera(<TraktOversikt {...props()} />);
    expect(q('oversikt-veta')!.textContent).toContain('Säljaren behåller lövet');
    expect(q('oversikt-veta')!.textContent).toContain('märkta med röd färg');
    expect(q('oversikt-pa-kartan')!.textContent).toContain('Kör och fäll inte på denna stigen');
    expect(ruta!.textContent).not.toMatch(/med text/);
    expect(ruta!.textContent).not.toMatch(/saker på kartan/);
  });
  it('certifieringen säger i ord vad han ska göra, och det som saknar text är EN rad (utan det cert-raden redan säger)', async () => {
    await montera(<TraktOversikt {...props()} />);
    expect(q('oversikt-cert')!.textContent).toContain('PEFC: alla 26 evighetsträd och 8 högstubbar är utsatta – spara dem.');
    expect(q('oversikt-utan-text')!.textContent).toBe('Utan textAvlägg 1');
  });
  it('faror och skyddade områden: röda/orange rader när de finns, annars en bock så han vet att det är kollat', async () => {
    await montera(<TraktOversikt {...props()} />);
    expect(q('oversikt-faror')).toBeNull();
    expect(q('oversikt-inga-faror')!.textContent).toContain('Inga faror');
    expect(q('oversikt-inga-skydd')).not.toBeNull();
    act(() => { rot!.unmount(); }); ruta!.remove();
    await montera(<TraktOversikt {...props({ faror: ['Kraftledning'], skydd: { lage: 'finns', rader: [{ namn: 'Vattenskyddsområde', text: 'Ingen tankning' }] } })} />);
    expect(q('oversikt-faror')!.textContent).toContain('Kraftledning');
    expect(q('oversikt-skydd')!.textContent).toContain('Vattenskyddsområde');
    expect(q('oversikt-skydd')!.textContent).toContain('Ingen tankning');
  });
  it('analysen aldrig körd → det sägs, aldrig "inga skyddade områden"', async () => {
    await montera(<TraktOversikt {...props({ skydd: { lage: 'inte', rader: [] } })} />);
    expect(q('oversikt-inga-skydd')).toBeNull();
    expect(q('oversikt-skydd-okant')!.textContent).toContain('inte kontrollerade');
  });
  it('riskerna står med risk och åtgärd', async () => {
    await montera(<TraktOversikt {...props({ risker: [{ nyckel: 'ledning', risk: 'Kraftledning i norr', atgard: 'Fäll aldrig mot ledningen', kalla: 'karta' }] })} />);
    expect(q('oversikt-risker')!.textContent).toContain('Kraftledning i norr');
    expect(q('oversikt-risker')!.textContent).toContain('Fäll aldrig mot ledningen');
  });
  it('en rad på kartan öppnar kortet för just den saken; det nya är märkt', async () => {
    const oppnade: string[] = [];
    await montera(<TraktOversikt {...props({ onOppna: (m) => oppnade.push(m.id) })} />);
    expect(q('oversikt-kart-4')!.querySelector('[data-testid="oversikt-nytt"]')).not.toBeNull();
    act(() => { q('oversikt-kart-4')!.click(); });
    expect(oppnade).toEqual(['4']);
  });
  it('"Jag har läst allt" sparar kvittot och stänger; går det inte att spara stannar listan och säger det', async () => {
    let stangd = 0; let ok = false;
    await montera(<TraktOversikt {...props({ onLast: async () => ok, onStang: () => { stangd++; } })} />);
    expect(q('oversikt-last')!.textContent).toBe('Jag har läst allt');
    await act(async () => { q('oversikt-last')!.click(); });
    expect(stangd).toBe(0);
    expect(q('oversikt-fel')).not.toBeNull();
    ok = true;
    await act(async () => { q('oversikt-last')!.click(); });
    expect(stangd).toBe(1);
  });
  it('redan läst → knappen heter "Till kartan" och sparar inget', async () => {
    let sparat = 0; let stangd = 0;
    await montera(<TraktOversikt {...props({ last: true, onLast: async () => { sparat++; return true; }, onStang: () => { stangd++; } })} />);
    expect(q('oversikt-last')!.textContent).toBe('Till kartan');
    await act(async () => { q('oversikt-last')!.click(); });
    expect(sparat).toBe(0);
    expect(stangd).toBe(1);
  });
  it('"Mer om trakten" finns längst ner', async () => {
    let mer = 0;
    await montera(<TraktOversikt {...props({ onMer: () => { mer++; } })} />);
    act(() => { q('oversikt-mer')!.click(); });
    expect(mer).toBe(1);
    expect(qa('oversikt-kart-text').length).toBe(1);
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
