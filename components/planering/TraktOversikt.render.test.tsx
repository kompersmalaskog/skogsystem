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
  it('Vidas text och trakten står UTSKRIVNA under "Gäller hela trakten"; texten på en sak på kartan står som EN kort rad på sorten', async () => {
    await montera(<TraktOversikt {...props()} />);
    expect(q('oversikt-veta')!.textContent).toContain('Säljaren behåller lövet');
    expect(q('oversikt-veta')!.textContent).toContain('märkta med röd färg');
    expect(q('oversikt-trakten')!.contains(q('oversikt-veta'))).toBe(true);
    const stig = ruta!.querySelector<HTMLElement>('[data-testid^="oversikt-sort-"][data-testid*="path"]')!;
    expect(stig.querySelector('[data-testid="oversikt-sort-under"]')!.textContent).toBe('Kör och fäll inte på denna stigen');
    expect(ruta!.textContent).not.toMatch(/saker på kartan/);
  });
  it('certifieringen är EN rad under "Gäller hela trakten" — högstubbar och evighetsträd räknas inte här (de står i namnfältet på kartan)', async () => {
    let cert = 0;
    await montera(<TraktOversikt {...props({ certLage: { lage: 'cert', namn: 'PEFC' }, onCert: () => { cert++; }, miljo: [
      { id: 'evighetstrad', namn: 'Evighetsträd', antal: 1, krav: 11, uppfyllt: false },
      { id: 'hogstubbar', namn: 'Högstubbar', antal: 0, krav: 4, uppfyllt: false },
    ] })} />);
    expect(q('oversikt-trakten')!.contains(q('oversikt-cert-rad'))).toBe(true);
    expect(q('oversikt-cert-rad')!.textContent).toContain('PEFC-certifierad');
    expect(ruta!.textContent).not.toMatch(/1 av 11|0 av 4|Evighetsträd|Högstubbar/);
    act(() => { q('oversikt-cert-rad')!.click(); });
    expect(cert).toBe(1);
  });
  it('ordningen: larm, gäller hela trakten, fara, sedan kartans färger — natur, kultur, blött, att göra, bra att veta; tom färg ritas inte', async () => {
    await montera(<TraktOversikt {...props({ faror: ['Kraftledning'], markeringar: [
      mark('3', 'landing', 'Avlägg'), mark('5', 'stonewall', 'Stenmur', '', 'linje'), mark('6', 'treetocut', 'Träd att avverka'), mark('7', 'naturecorner', 'Naturhörna'),
    ] })} />);
    const ord = [...q('oversikt-innehall')!.children].map((e) => e.getAttribute('data-testid')).filter(Boolean);
    expect(ord.slice(0, 3)).toEqual(['oversikt-larm', 'oversikt-trakten', 'oversikt-faror']);
    const farger = ord.filter((t) => t!.startsWith('oversikt-farg-'));
    expect(farger).toEqual(farger.slice().sort((a, b) => ['natur', 'kultur', 'blott', 'att_gora', 'info'].indexOf(a!.slice(14)) - ['natur', 'kultur', 'blott', 'att_gora', 'info'].indexOf(b!.slice(14))));
    expect(farger).toContain('oversikt-farg-kultur');
    expect(farger).toContain('oversikt-farg-info');
    expect(farger).not.toContain('oversikt-farg-blott');
    expect(q('oversikt-farg-kultur')!.textContent).toContain('Stenmur');
    expect(q('oversikt-farg-info')!.textContent).toContain('Avlägg');
  });
  it('riskraden "Varning" står inte en gång till när varningen redan står under farorna', async () => {
    const risker = [{ nyckel: 'varning', risk: 'Varning på kartan – läs texten', atgard: '', kalla: 'karta', allvarlig: true }] as any;
    await montera(<TraktOversikt {...props({ risker, markeringar: [{ ...mark('9', 'warning', 'Varning'), kommentarer: [{ id: 'k9', text: 'Döda träd', forfattare: 'Martin' }] }] })} />);
    expect(q('oversikt-faror')!.textContent).toContain('Döda träd');
    expect(q('oversikt-risker')).toBeNull();
  });
  it('larmraden visar koordinaten och avståndet i fågelväg — aldrig avläggets kod', async () => {
    const visning = { satt: true, koordinat: '56.81234, 15.12345', namn: 'inback skbv', narmast: null, fagelvag: '340 m fågelväg', valjSjalv: false, platser: [], kontroll: null };
    await montera(<TraktOversikt {...props({ larm: { satt: true, koordinat: '56.81234, 15.12345', beskrivning: '', onVisa: () => {}, visning } })} />);
    expect(q('oversikt-larm-koordinat')!.textContent).toBe('56.81234, 15.12345');
    expect(q('oversikt-larm')!.textContent).toContain('340 m fågelväg');
    expect(q('oversikt-larm')!.textContent).not.toContain('inback');
  });
  it('faror och skyddade områden: röda/orange rader när de finns, annars en bock så han vet att det är kollat', async () => {
    await montera(<TraktOversikt {...props()} />);
    expect(q('oversikt-faror')).toBeNull();
    expect(q('oversikt-kollat')!.textContent).toContain('inga faror');
    expect(q('oversikt-kollat')!.textContent).toContain('inga skyddade områden');
    act(() => { rot!.unmount(); }); ruta!.remove();
    await montera(<TraktOversikt {...props({ faror: ['Kraftledning'], skydd: { lage: 'finns', rader: [{ namn: 'Vattenskyddsområde', text: 'Ingen tankning' }] } })} />);
    expect(q('oversikt-faror')!.textContent).toContain('Kraftledning');
    expect(q('oversikt-skydd')!.textContent).toContain('Vattenskyddsområde');
    expect(q('oversikt-skydd')!.textContent).toContain('Ingen tankning');
  });
  it('analysen aldrig körd → det sägs, aldrig "inga skyddade områden"', async () => {
    await montera(<TraktOversikt {...props({ skydd: { lage: 'inte', rader: [] } })} />);
    expect(q('oversikt-kollat')?.textContent ?? '').not.toContain('skyddade');
    expect(q('oversikt-skydd-okant')!.textContent).toContain('inte kontrollerade');
  });
  it('riskerna står med risk och åtgärd', async () => {
    await montera(<TraktOversikt {...props({ risker: [{ nyckel: 'ledning', risk: 'Kraftledning i norr', atgard: 'Fäll aldrig mot ledningen', kalla: 'karta', allvarlig: true }] })} />);
    expect(q('oversikt-risker')!.textContent).toContain('Kraftledning i norr');
    expect(q('oversikt-risker')!.textContent).toContain('Fäll aldrig mot ledningen');
  });
  it('en ensam sak öppnar kortet för just den saken; det nya är märkt', async () => {
    const oppnade: string[] = [];
    await montera(<TraktOversikt {...props({ onOppna: (m) => oppnade.push(m.id) })} />);
    const stig = ruta!.querySelector<HTMLElement>('[data-testid^="oversikt-sort-"][data-testid*="path"]')!;
    expect(stig.querySelector('[data-testid="oversikt-nytt"]')).not.toBeNull();
    act(() => { stig.querySelector<HTMLElement>('[data-testid="oversikt-sort-rad"]')!.click(); });
    expect(oppnade).toEqual(['4']);
  });
  it('"Börja köra" sparar kvittot och stänger; går det inte att spara stannar listan och säger det', async () => {
    let stangd = 0; let ok = false;
    await montera(<TraktOversikt {...props({ onLast: async () => ok, onStang: () => { stangd++; } })} />);
    expect(q('oversikt-last')!.textContent).toBe('Börja köra');
    await act(async () => { q('oversikt-last')!.click(); });
    expect(stangd).toBe(0);
    expect(q('oversikt-fel')).not.toBeNull();
    ok = true;
    await act(async () => { q('oversikt-last')!.click(); });
    expect(stangd).toBe(1);
  });
  it('redan läst → ingen Börja köra-knapp, bara krysset (Martin 2026-11-12)', async () => {
    await montera(<TraktOversikt {...props({ last: true })} />);
    expect(q('oversikt-last')).toBeNull();
  });
  it('stapeln under namnet och "Kör upp och backa" under Att göra; ett tryck flyger dit', async () => {
    const ytor: string[] = [];
    await montera(<TraktOversikt {...props({ andel: 0.58, korUpp: [{ nyckel: 'korupp:1', bricka: 'Kör upp och backa', typ: '', grupp: 'ovrigt', text: 'Brant', osedd: true }], onYta: (n) => { ytor.push(n); } })} />);
    expect(q('oversikt-stapel')!.getAttribute('aria-valuenow')).toBe('58');
    const rad = q('oversikt-farg-att_gora')!.querySelector<HTMLElement>('[data-testid="yta-rad"]')!;
    expect(rad.textContent).toContain('Kör upp och backa');
    await act(async () => { rad.click(); });
    expect(ytor).toEqual(['korupp:1']);
  });
  it('VARJE SORT står som EN rad, också utan text: "Stenmur 3" under Kultur med "1 med text", och flera öppnar sorten på kartan', async () => {
    const sorter: string[] = []; const oppnade: string[] = [];
    await montera(<TraktOversikt {...props({
      markeringar: [mark('11', 'stonewall', 'Stenmur', '', 'linje'), mark('12', 'stonewall', 'Stenmur', '', 'linje'), mark('13', 'stonewall', 'Stenmur', 'Gammal mur', 'linje'), mark('3', 'landing', 'Avlägg')],
      onSort: (n) => { sorter.push(n); }, onOppna: (m) => { oppnade.push(m.id); },
    })} />);
    const sten = ruta!.querySelector<HTMLElement>('[data-testid^="oversikt-sort-"][data-testid*="stonewall"]');
    expect(sten).not.toBeNull();
    expect(sten!.textContent).toContain('Stenmur 3');
    expect(q('oversikt-farg-kultur')!.contains(sten)).toBe(true);
    expect(sten!.querySelector('[data-testid="oversikt-sort-under"]')!.textContent).toBe('1 med text');
    expect(sten!.textContent).not.toContain('Gammal mur');   // texten står på kortet, inte i menyn
    act(() => { sten!.querySelector('button')!.click(); });
    expect(sorter.length).toBe(1);
    act(() => { q('oversikt-sort-symbol-landing')!.querySelector('button')!.click(); });
    expect(oppnade).toEqual(['3']);
  });
  it('bro och jakttorn står under Bra att veta; jakttornet med "slå inte sönder" och aldrig som fara', async () => {
    await montera(<TraktOversikt {...props({ markeringar: [mark('21', 'bridge', 'Bro'), mark('22', 'huntingtower', 'Jakttorn'), mark('23', 'huntingtower', 'Jakttorn')] })} />);
    const info = q('oversikt-farg-info')!;
    expect(info.textContent).toContain('Bro');
    const torn = ruta!.querySelector<HTMLElement>('[data-testid*="huntingtower"]')!;
    expect(info.contains(torn)).toBe(true);
    expect(torn.textContent).toContain('slå inte sönder');
    expect(q('oversikt-faror')).toBeNull();
  });
  it('certifieringen står ALLTID: inte certifierad, och okänd i orange', async () => {
    await montera(<TraktOversikt {...props({ cert: null, certLage: { lage: 'ingen', namn: '' } })} />);
    expect(q('oversikt-cert-ingen')!.textContent).toContain('Inte certifierad');
    act(() => { rot?.unmount(); }); ruta?.remove();
    await montera(<TraktOversikt {...props({ cert: null, certLage: { lage: 'okand', namn: '' } })} />);
    expect(q('oversikt-cert-okand')!.textContent).toContain('Certifiering saknas – fråga planeraren');
  });
  it('"Mer om trakten" finns längst ner', async () => {
    let mer = 0;
    await montera(<TraktOversikt {...props({ onMer: () => { mer++; } })} />);
    act(() => { q('oversikt-mer')!.click(); });
    expect(mer).toBe(1);
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
