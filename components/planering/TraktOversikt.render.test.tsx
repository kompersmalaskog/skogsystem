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
  it('ordningen: larm, fara, gäller hela trakten, sedan kartans färger — natur, kultur, blött, att göra, bra att veta; tom färg ritas inte', async () => {
    await montera(<TraktOversikt {...props({ faror: ['Kraftledning'], markeringar: [
      mark('3', 'landing', 'Avlägg'), mark('5', 'stonewall', 'Stenmur', '', 'linje'), mark('6', 'treetocut', 'Träd att avverka'), mark('7', 'naturecorner', 'Naturhörna'),
    ] })} />);
    const ord = [...q('oversikt-innehall')!.children].map((e) => e.getAttribute('data-testid')).filter(Boolean);
    expect(ord.slice(0, 3)).toEqual(['oversikt-larm', 'oversikt-faror', 'oversikt-trakten']);
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
  it('"Kör upp och backa" är EN rad under Att göra: en pil flyger dit direkt, flera fälls ut på plats; ingen stapel i menyn', async () => {
    const ytor: string[] = [];
    const pil = (n: number) => ({ nyckel: `korupp:${n}`, bricka: 'Kör upp och backa', typ: '', grupp: 'ovrigt' as const, text: 'Brant', osedd: n === 1 });
    await montera(<TraktOversikt {...props({ korUpp: [pil(1)], onYta: (n) => { ytor.push(n); } })} />);
    expect(q('oversikt-stapel')).toBeNull();
    const rad = q('oversikt-farg-att_gora')!.querySelector<HTMLElement>('[data-testid="oversikt-korupp-rad"]')!;
    expect(rad.textContent).toContain('Kör upp och backa 1');
    expect(rad.querySelector('[data-testid="oversikt-nytt"]')).not.toBeNull();
    act(() => { rad.click(); });
    expect(ytor).toEqual(['korupp:1']);
    act(() => { rot?.unmount(); }); ruta?.remove();
    await montera(<TraktOversikt {...props({ korUpp: [pil(1), pil(2)], onYta: (n) => { ytor.push(n); } })} />);
    expect(q('oversikt-korupp-rad')!.textContent).toContain('Kör upp och backa 2');
    expect(qa('yta-rad').length).toBe(0);
    act(() => { q('oversikt-korupp-rad')!.click(); });
    expect(qa('yta-rad').length).toBe(2);
    act(() => { qa('yta-rad')[1].click(); });
    expect(ytor).toEqual(['korupp:1', 'korupp:2']);
  });
  it('inga målbilder på raderna (de finns under Alla symboler och färger och på kortet)', async () => {
    await montera(<TraktOversikt {...props({ markeringar: [mark('5', 'stonewall', 'Stenmur', '', 'linje'), mark('3', 'landing', 'Avlägg')] })} />);
    expect(q('oversikt-malbild')).toBeNull();
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

// ── VIKTIGT (Martin 2026-11-23): överst, under Fara, med hela kommentaren; aldrig två gånger ────────────────────────────────────────
describe('Hela trakten — Viktigt', () => {
  const viktig = (id: string, typ: string, namn: string, viktigt: string, text = '', slag: KartMarkering['slag'] = 'zon'): KartMarkering =>
    ({ ...mark(id, typ, namn, '', slag), kommentarer: [{ id: 'kk' + id, text, viktigt, forfattare: 'Martin · idag 08:00' }] });

  it('en egen sektion "Viktigt" står direkt efter Fara och före "Gäller hela trakten"; gul rubrik, raden gul med ⚠, Övrigt under', async () => {
    await montera(<TraktOversikt {...props({ faror: ['Kraftledning'], markeringar: [viktig('9', 'protected', 'Hänsynsyta', 'Kör inte över bäcken', 'Bron håller inte.')] })} />);
    const ordning = [...q('oversikt-innehall')!.children].map((e) => e.getAttribute('data-testid'));
    expect(ordning.indexOf('oversikt-viktigt')).toBeGreaterThan(ordning.indexOf('oversikt-faror'));
    expect(ordning.indexOf('oversikt-viktigt')).toBeLessThan(ordning.indexOf('oversikt-trakten'));
    const sek = q('oversikt-viktigt')!;
    expect(sek.textContent).toContain('Viktigt');
    expect(sek.querySelector('[data-testid="viktigt-text"]')!.textContent).toBe('Kör inte över bäcken');
    expect(sek.querySelector('[data-testid="oversikt-kart-text"]')!.textContent).toBe('Bron håller inte.');
  });

  it('utan Viktigt finns ingen sektion', async () => {
    await montera(<TraktOversikt {...props()} />);
    expect(q('oversikt-viktigt')).toBeNull();
  });

  it('en sak med Viktigt står BARA i Viktigt-sektionen — inte också bland sorterna längre ned', async () => {
    const m = viktig('9', 'protected', 'Hänsynsyta', 'Kör inte över bäcken', 'Bron håller inte.');
    await montera(<TraktOversikt {...props({ markeringar: [m, mark('3', 'landing', 'Avlägg')] })} />);
    expect(qa('oversikt-kart-9')).toHaveLength(1);
    expect(q('oversikt-viktigt')!.contains(q('oversikt-kart-9'))).toBe(true);
    expect(ruta!.textContent!.match(/Bron håller inte\./g)).toHaveLength(1);
  });

  it('ett tryck på raden öppnar kortet (samma som en rad på kartan)', async () => {
    const m = viktig('9', 'protected', 'Hänsynsyta', 'Kör inte över bäcken');
    const oppna = vi.fn();
    await montera(<TraktOversikt {...props({ markeringar: [m], onOppna: oppna })} />);
    act(() => { q('oversikt-kart-9')!.click(); });
    expect(oppna).toHaveBeenCalledWith(expect.objectContaining({ id: '9' }));
  });

  it('en fara med Viktigt står kvar under Fara (med Viktigt i gult överst på raden), inte i Viktigt-sektionen', async () => {
    const fara = viktig('7', 'powerline', 'El-ledning', 'Ledningen hänger lågt', '', 'symbol');
    await montera(<TraktOversikt {...props({ markeringar: [fara] })} />);
    expect(q('oversikt-viktigt')).toBeNull();
    expect(q('oversikt-faror')!.querySelector('[data-testid="viktigt-text"]')!.textContent).toBe('Ledningen hänger lågt');
  });

  it('en Viktigt-rad på själva trakten (traktdel/område) står i Viktigt, och bara där', async () => {
    await montera(<TraktOversikt {...props({ helaTrakten: [
      { id: 'k1', text: 'Träden som ska sparas är märkta med röd färg.', forfattare: 'Martin · i går 16:20' },
      { id: 'k2', text: '', viktigt: 'Grinden är låst – koden finns hos Joacim', forfattare: 'Joacim · idag 07:10' },
    ] })} />);
    expect(q('oversikt-viktigt-trakten')!.textContent).toContain('Grinden är låst');
    expect(q('oversikt-veta')!.textContent).toContain('märkta med röd färg');
    expect(q('oversikt-veta')!.textContent).not.toContain('Grinden är låst');
    // Bara kommentaren utan Viktigt står kvar under "Gäller hela trakten" (annars blev det en tom ruta till).
    expect(qa('oversikt-trakten-text')).toHaveLength(1);
  });
});

describe('Hela trakten — vägarna nära gränsen', () => {
  it('en rad "Väg 538 · låg risk ✓" och ett tryck öppnar riskbedömningen för vägens ägare', async () => {
    const oppnade: string[] = [];
    await montera(<TraktOversikt {...props({ vagar: { rader: [{ nyckel: 'ref:538', agare: 'a', rubrik: 'Väg 538', risk: 'lag' as const, status: 'låg risk ✓', farg: '#30d158' }], onOppna: (a: string) => { oppnade.push(a); } } })} />);
    const rad = qa('vag-risk-rad');
    expect(rad).toHaveLength(1);
    expect(rad[0].textContent).toContain('Väg 538 · låg risk ✓');
    act(() => { rad[0].click(); });
    expect(oppnade).toEqual(['a']);
  });
  it('ingen väg = ingen rad', async () => {
    await montera(<TraktOversikt {...props()} />);
    expect(qa('vag-risk-rad')).toHaveLength(0);
  });
});
