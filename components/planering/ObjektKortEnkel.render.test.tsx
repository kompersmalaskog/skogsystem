// @vitest-environment jsdom
// ⓘ-kortet för föraren (maskinläget) — bara tre delar, så att ett barn förstår direkt: namn + framsteg, "Det här gäller här", en grupp rader längst ner.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ObjektKortEnkel, { type ObjektKortEnkelProps } from './ObjektKortEnkel';
import { YtaPaminnelseVy } from './YtaPaminnelse';
import { InstruktionKortVy } from './InstruktionKort';
import { KommentarVisning } from './KommentarRuta';
import { tillForaren, framstegRad, grotRad } from '@/lib/objektKort';
import { GRUPPER } from '@/lib/larm/grupper';
import { OVRIGT_YTA_STIL } from '@/lib/ytaStil';
import type { YtaRad } from '@/lib/ytaRader';
import type { Paminnelse } from '@/lib/instruktioner/instruktioner';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));
vi.mock('@/lib/smhi-brandrisk', () => ({ fetchSmhiFwi: vi.fn(async () => ({ daily: [] })) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let ruta: HTMLElement | null = null;
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => Array.from(ruta!.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
async function montera(el: React.ReactElement) {
  ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta);
  await act(async () => { rot!.render(el); });
}
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });

const DIREKTIV = 'Obs tjärdal enligt karta. Lämna ca 50-70 tallar per ha . Lämna fina ekar och några bokar. Två hänsynsområde enligt karta. Gräns mot reservat, gäller den mindre avv i öster. En del fällning pga brant terräng.';
const RADER: YtaRad[] = [
  { nyckel: 'hansyn:1', bricka: 'Hänsyn 1', typ: 'Kant mot vatten', grupp: 'natur', text: 'kantzon lämnas på ca 10-15 m där endast gran avverkas.', osedd: true },
  { nyckel: 'hansyn:2', bricka: 'Hänsyn 2', typ: 'Sumpskog', grupp: 'natur', text: null, osedd: false },
  { nyckel: 'hansyn:4', bricka: 'Övrigt 4', typ: '', grupp: 'ovrigt', text: 'avverkning av frötallar.', osedd: true },
];
const spion = { yta: [] as string[], stang: 0, mer: 0, karta: 0, larm: 0, sett: 0, knapp: [] as string[] };
function props(o: Partial<ObjektKortEnkelProps> = {}): ObjektKortEnkelProps {
  return {
    namn: 'Hålabäck au 2025', under: 'Slutavverkning · 2,5 av 5,2 ha klart', andel: 2.5 / 5.2, onStang: () => { spion.stang++; },
    faror: [], grot: null, tillForaren: tillForaren({ vida: DIREKTIV }), direktivSett: null, brand: null, onBrand: () => {},
    ytor: RADER, onYta: (n) => { spion.yta.push(n); }, knappar: [], onKnapp: (id) => { spion.knapp.push(id); },
    larm: { satt: true, koordinat: '56.40012, 14.70123', beskrivning: '', onVisa: () => { spion.larm++; } },
    onKarta: () => { spion.karta++; }, dokument: { antal: 3, chips: <span data-testid="dok-chips">chips</span> }, onMer: () => { spion.mer++; },
    ...o,
  };
}
beforeEach(() => { spion.yta = []; spion.stang = 0; spion.mer = 0; spion.karta = 0; spion.larm = 0; spion.sett = 0; spion.knapp = []; });

describe('ObjektKortEnkel — överst: namn, framsteg, grön stapel', () => {
  it('namnet stort, "Slutavverkning · 2,5 av 5,2 ha klart" under, grön stapel med rätt andel, ✕ stänger', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    expect(q('info-titel')!.textContent).toBe('Hålabäck au 2025');
    expect(q('info-undertitel')!.textContent).toBe('Slutavverkning · 2,5 av 5,2 ha klart');
    const stapel = q('kort-stapel')!;
    expect(stapel.getAttribute('role')).toBe('progressbar');
    expect(stapel.getAttribute('aria-valuenow')).toBe('48');
    expect(q('kort-stapel-fyll')!.style.width).toBe('48%');
    expect(q('kort-stapel-fyll')!.style.background).not.toBe('');
    act(() => { q('info-stang')!.click(); });
    expect(spion.stang).toBe(1);
  });
  it('ingen mätning (andel null): ingen stapel — aldrig en tom som ser ut som 0 % klart', async () => {
    await montera(<ObjektKortEnkel {...props({ andel: null, under: 'Slutavverkning · 5,2 ha' })} />);
    expect(q('kort-stapel')).toBeNull();
    expect(q('info-undertitel')!.textContent).toBe('Slutavverkning · 5,2 ha');
  });
});

describe('ObjektKortEnkel — "Det här gäller här"', () => {
  it('rubriken är vanlig text (inte små versaler) och kommer före allt annat innehåll', async () => {
    await montera(<ObjektKortEnkel {...props({ faror: ['Brant terräng'] })} />);
    const h = q('kort-galler-rubrik')!;
    expect(h.textContent).toBe('Det här gäller här');
    expect(h.style.textTransform).toBe('');
    const ordning = Array.from(q('kort-innehall')!.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'));
    expect(ordning.indexOf('kort-galler-rubrik')).toBeLessThan(ordning.indexOf('kort-faror'));
  });
  it('ordning: Faror (röda, först) → GROT → Vidas direktiv → en rad per yta → längst ner raderna', async () => {
    await montera(<ObjektKortEnkel {...props({ faror: ['Brant terräng'], grot: 'GROT tas ut – lägg riset i högar' })} />);
    const ids = Array.from(q('kort-innehall')!.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'));
    const pos = (id: string) => ids.indexOf(id);
    expect(pos('kort-faror')).toBeLessThan(pos('kort-grot'));
    expect(pos('kort-grot')).toBeLessThan(pos('kort-till-foraren'));
    expect(pos('kort-till-foraren')).toBeLessThan(pos('kort-ytor'));
    expect(pos('kort-ytor')).toBeLessThan(pos('kort-uppdrag'));
    expect(q('kort-faror')!.textContent).toContain('Faror: Brant terräng');
  });
  it('GROT: en egen rad bara när trakten har GROT (ingen rad annars)', async () => {
    await montera(<ObjektKortEnkel {...props({ grot: grotRad(true, 'skordare') })} />);
    expect(q('kort-grot')!.textContent).toContain('GROT tas ut – lägg riset i högar');
    act(() => { rot!.unmount(); }); ruta!.remove();
    await montera(<ObjektKortEnkel {...props({ grot: grotRad(true, 'skotare') })} />);
    expect(q('kort-grot')!.textContent).toContain('GROT tas ut – kör inte på rishögarna');
    act(() => { rot!.unmount(); }); ruta!.remove();
    await montera(<ObjektKortEnkel {...props({ grot: grotRad(false, 'skordare') })} />);
    expect(q('kort-grot')).toBeNull();
  });
  it('Vidas traktdirektiv: etikett "Hela trakten · Vida", numrerade punkter, allt synligt (inget "Läs allt"), ingen flygning vid tryck', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    const post = q('kort-post-vida')!;
    expect(q('kartkort-kommentar-kalla')!.textContent).toBe('Hela trakten · Vida');
    expect(post.querySelectorAll('[data-testid="kartkort-kommentar-punkt"]')).toHaveLength(6);
    expect(post.textContent).toContain('En del fällning pga brant terräng.');
    expect(ruta!.textContent).not.toContain('Läs allt');
    act(() => { post.click(); });
    expect(spion.yta).toEqual([]);
  });
  it('planerarens text står under, märkt "Hela trakten · Planerare"', async () => {
    await montera(<ObjektKortEnkel {...props({ tillForaren: tillForaren({ vida: 'Vidas text.', anteckningar: 'Ring Stefan.' }) })} />);
    const etiketter = qa('kartkort-kommentar-kalla').map((e) => e.textContent);
    expect(etiketter).toEqual(['Hela trakten · Vida', 'Hela trakten · Planerare']);
  });
  it('direktivets "Sett" visas tills det setts', async () => {
    const sett = () => { spion.sett++; };
    await montera(<ObjektKortEnkel {...props({ direktivSett: { sedd: false, onSett: sett } })} />);
    act(() => { q('kort-direktiv-sett')!.click(); });
    expect(spion.sett).toBe(1);
    act(() => { rot!.unmount(); }); ruta!.remove();
    await montera(<ObjektKortEnkel {...props({ direktivSett: { sedd: true, onSett: sett } })} />);
    expect(q('kort-direktiv-sett')).toBeNull();
  });
});

describe('ObjektKortEnkel — en rad per yta, kartans namn som bricka', () => {
  it('raden: [bricka] typ + första punkten på en rad (avkortas med …); Övrigt utan upprepad typ', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    const rader = qa('yta-rad');
    expect(rader).toHaveLength(3);
    expect(rader[0].querySelector('[data-testid="yta-bricka"]')!.textContent).toBe('Hänsyn 1');
    expect(rader[0].querySelector('[data-testid="yta-rad-typ"]')!.textContent).toBe('Kant mot vatten');
    const text = rader[0].querySelector<HTMLElement>('[data-testid="yta-rad-text"]')!;
    expect(text.textContent).toBe('kantzon lämnas på ca 10-15 m där endast gran avverkas.');
    expect(text.style.whiteSpace).toBe('nowrap'); expect(text.style.textOverflow).toBe('ellipsis'); expect(text.style.overflow).toBe('hidden');
    expect(rader[1].querySelector('[data-testid="yta-rad-text"]')).toBeNull();      // en yta utan text finns ändå
    expect(rader[2].querySelector('[data-testid="yta-rad-typ"]')).toBeNull();       // Övrigt upprepar inte sitt namn
    expect(rader[2].querySelector('[data-testid="yta-bricka"]')!.textContent).toBe('Övrigt 4');
  });
  it('brickan har gruppens färg: Natur grön, Övrigt vit — ur samma källor som kartan', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    const farg = (el: Element) => (el as HTMLElement).style.background;
    const ref = (c: string) => { const d = document.createElement('div'); d.style.background = c; return d.style.background; };
    const brickor = qa('yta-bricka');
    expect(farg(brickor[0])).toBe(ref(GRUPPER.natur.farg));
    expect(farg(brickor[2])).toBe(ref(OVRIGT_YTA_STIL.farg));
    expect(brickor[0].getAttribute('data-grupp')).toBe('natur');
    expect(brickor[2].getAttribute('data-grupp')).toBe('ovrigt');
  });
  it('osedda har en liten blå prick (med ord för skärmläsare), sedda inte', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    const rader = qa('yta-rad');
    expect(rader.map((r) => r.getAttribute('data-osedd'))).toEqual(['ja', 'nej', 'ja']);
    expect(rader.map((r) => !!r.querySelector('[data-testid="yta-osedd"]'))).toEqual([true, false, true]);
    expect(rader[0].querySelector('[data-testid="yta-osedd"]')!.getAttribute('aria-label')).toBe('Inte sedd');
  });
  it('tryck på raden → onYta(nyckel) — kartan flyger dit', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    act(() => { qa('yta-rad')[2].click(); });
    act(() => { qa('yta-rad')[0].click(); });
    expect(spion.yta).toEqual(['hansyn:4', 'hansyn:1']);
  });
  it('inget alls att visa: en ärlig rad, aldrig en tom lista', async () => {
    await montera(<ObjektKortEnkel {...props({ ytor: [], tillForaren: [], faror: [], grot: null })} />);
    expect(q('kort-galler-tomt')!.textContent).toBe('Inget särskilt att tänka på här.');
    expect(q('kort-ytor')).toBeNull();
  });
});

describe('ObjektKortEnkel — längst ner EN grupp rader, och bort med det som inte hör hit', () => {
  it('"Om något händer – ring 112" med larmkoordinaten · Kartans färger · Dokument (N) · Mer — i den ordningen i ETT kort', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    const grupp = q('kort-uppdrag')!;
    const ids = Array.from(grupp.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'));
    expect(ids.filter((i) => ['kort-larm', 'kort-vad-betyder-kartan', 'kort-dokument', 'kort-mer'].includes(i!))).toEqual(['kort-larm', 'kort-vad-betyder-kartan', 'kort-dokument', 'kort-mer']);
    expect(q('kort-larm')!.textContent).toContain('Om något händer – ring 112');
    expect(q('kort-larm-koordinat')!.textContent).toBe('Larmkoordinat 56.40012, 14.70123');
    expect(q('kort-vad-betyder-kartan')!.textContent).toBe('Kartans färger');
    expect(q('kort-dokument')!.textContent).toContain('Dokument (3)');
    expect(q('kort-mer')!.textContent).toContain('Mer');
    act(() => { q('kort-larm')!.click(); q('kort-vad-betyder-kartan')!.click(); q('kort-mer')!.click(); });
    expect([spion.larm, spion.karta, spion.mer]).toEqual([1, 1, 1]);
  });
  it('Dokument fälls ut på plats', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    expect(q('dok-chips')).toBeNull();
    act(() => { q('kort-dokument')!.click(); });
    expect(q('dok-chips')).not.toBeNull();
  });
  it('larmkoordinaten saknas: 112-raden finns ändå, och säger ärligt att koordinaten inte är satt', async () => {
    await montera(<ObjektKortEnkel {...props({ larm: { satt: false, koordinat: '', beskrivning: '', onVisa: () => {} } })} />);
    expect(q('kort-larm')!.textContent).toContain('Om något händer – ring 112');
    expect(q('kort-larm')!.textContent).toContain('Larmkoordinat ej satt');
  });
  it('BORT för föraren: m³-/produktionschips och "På trakten · N markeringar"; ingen "Larmplats inte kontrollerad"', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    expect(q('kort-brickor')).toBeNull();
    expect(q('kort-pa-trakten')).toBeNull();
    expect(q('kort-instruktioner')).toBeNull();      // raderna ligger i kortet — ingen egen "Instruktioner på trakten"-rad
    expect(q('kort-larm-status')).toBeNull();
    expect(ruta!.textContent).not.toMatch(/m³|På trakten|Larmplats/);
  });
  it('knapprad bara när det finns knappar', async () => {
    await montera(<ObjektKortEnkel {...props()} />);
    expect(q('kort-knappar')).toBeNull();
    act(() => { rot!.unmount(); }); ruta!.remove();
    await montera(<ObjektKortEnkel {...props({ knappar: [{ id: 'skotning', etikett: 'Skotning' }] })} />);
    act(() => { q('kort-knapp-skotning')!.click(); });
    expect(spion.knapp).toEqual(['skotning']);
  });
});

describe('lib/objektKort — GROT-raden och framstegsraden', () => {
  it('GROT: bara när trakten har GROT och maskinens roll är känd', () => {
    expect(grotRad(true, 'skordare')).toBe('GROT tas ut – lägg riset i högar');
    expect(grotRad(true, 'skotare')).toBe('GROT tas ut – kör inte på rishögarna');
    expect(grotRad(true, null)).toBeNull();
    expect(grotRad(false, 'skordare')).toBeNull();
    expect(grotRad(null, 'skotare')).toBeNull();
  });
  it('framsteg: "2,5 av 5,2 ha klart" + andel; utan mätning bara arealen och ingen andel; klart över 100 % kläms', () => {
    expect(framstegRad({ typ: 'Slutavverkning', arealHa: 5.24, klartHa: 2.45 })).toEqual({ text: 'Slutavverkning · 2,5 av 5,2 ha klart', andel: 2.45 / 5.24 });
    expect(framstegRad({ typ: 'Slutavverkning', arealHa: 5.24, klartHa: null })).toEqual({ text: 'Slutavverkning · 5,2 ha', andel: null });
    expect(framstegRad({ typ: 'Slutavverkning', arealHa: null, klartHa: 1 })).toEqual({ text: 'Slutavverkning', andel: null });
    expect(framstegRad({ typ: 'Gallring', arealHa: 4, klartHa: 4.6 })).toMatchObject({ andel: 1 });
    expect(framstegRad({ typ: 'Gallring', arealHa: 4, klartHa: 0 })).toEqual({ text: 'Gallring · 0 av 4 ha klart', andel: 0 });
  });
});

describe('InstruktionKortVy — samma rubrik som listan, och påminnelsens hela instruktion utan Sett', () => {
  const instr = { ref: 'vida:hansyn:1', text: 'kantzon lämnas på ca 10-15 m.', hash: 'h', kalla: 'vida' as const, forfattare: null, vantar: false };
  const kort = { nyckel: 'hansyn:1', namn: 'Hänsyn 1 · Kant mot vatten', avlagg: false, instruktioner: [instr], fler: 0, bricka: 'Hänsyn 1', typ: 'Kant mot vatten', brickaGrupp: 'natur' as const };
  it('rubriken är brickan + typen (som i listan), inte "<namn> – instruktioner"', async () => {
    await montera(<InstruktionKortVy kort={kort} top="10px" onSett={() => {}} />);
    expect(q('instruktion-bricka')!.textContent).toBe('Hänsyn 1');
    expect(q('instruktion-typ')!.textContent).toBe('Kant mot vatten');
    expect(q('instruktion-rubrik')!.getAttribute('aria-label')).toBe('Hänsyn 1 · Kant mot vatten');
    expect(ruta!.textContent).not.toContain('– instruktioner');
    expect(q('instruktion-sett')).not.toBeNull();
  });
  it('utan Sett (tryck på påminnelsen): hela instruktionen, "Du är i området", Stäng i stället för Sett', async () => {
    const stang = vi.fn();
    await montera(<InstruktionKortVy kort={kort} top="10px" utanSett={{ onStang: stang }} />);
    expect(q('instruktion-sett')).toBeNull();
    expect(q('instruktion-under')!.textContent).toBe('Du är i området');
    act(() => { q('instruktion-stang')!.click(); });
    expect(stang).toHaveBeenCalledTimes(1);
  });
});

describe('YtaPaminnelseVy — pill, sedan bricka', () => {
  const p = (fas: 'full' | 'bricka'): Paminnelse => ({ nyckel: 'hansyn:4', namn: 'Övrigt 4', avlagg: false, bricka: 'Övrigt 4', typ: '', brickaGrupp: 'ovrigt', text: 'avverkning av frötallar.', instruktioner: [], fas, kvarMs: fas === 'full' ? 7000 : 0 });
  it('hela pillen: bricka + kort text + ›; efter 10 s bara brickan (samma element krymper, texten tonas bort)', async () => {
    const tryck = vi.fn();
    await montera(<YtaPaminnelseVy paminnelse={p('full')} top="10px" onTryck={tryck} />);
    const knapp = q('yta-paminnelse')!;
    expect(knapp.getAttribute('data-fas')).toBe('full');
    expect(q('yta-paminnelse-bricka')!.textContent).toBe('Övrigt 4');
    expect(q('yta-paminnelse-text')!.textContent).toBe('avverkning av frötallar.');
    expect(q('yta-paminnelse-text')!.style.opacity).toBe('1');
    expect(knapp.getAttribute('aria-label')).toContain('avverkning av frötallar.');
    await act(async () => { rot!.render(<YtaPaminnelseVy paminnelse={p('bricka')} top="10px" onTryck={tryck} />); });
    expect(q('yta-paminnelse')).toBe(knapp);                                     // samma element: krympningen är en övergång, inte ett utbyte
    expect(knapp.getAttribute('data-fas')).toBe('bricka');
    expect(q('yta-paminnelse-text')!.style.opacity).toBe('0');
    expect(q('yta-paminnelse-text')!.style.maxWidth).toBe('0px');
    expect(q('yta-paminnelse-text')!.getAttribute('aria-hidden')).toBe('true');
    expect(q('yta-paminnelse-bricka')!.textContent).toBe('Övrigt 4');            // brickan ligger kvar
  });
  it('krympningen är en mjuk övergång (inte ett hopp), och ingen övergång vid "minska rörelser"', async () => {
    await montera(<YtaPaminnelseVy paminnelse={p('full')} top="10px" onTryck={() => {}} />);
    expect(q('yta-paminnelse-text')!.style.transition).toContain('max-width');
    expect(q('yta-paminnelse')!.style.transition).toContain('padding');            // pillen själv krymper också (bakgrund och kant tonar bort mjukt)
    expect(q('yta-paminnelse')!.style.transition).toContain('background-color');
    act(() => { rot!.unmount(); }); ruta!.remove();
    (window as any).matchMedia = (s: string) => ({ matches: /reduce/.test(s), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    await montera(<YtaPaminnelseVy paminnelse={p('full')} top="10px" onTryck={() => {}} />);
    expect(q('yta-paminnelse-text')!.style.transition === 'none' || q('yta-paminnelse-text')!.style.transition === '').toBe(true);
    delete (window as any).matchMedia;
  });
  it('inget ljud och ingen knapp i pillen: ett enda tryckbart element, tryck = hela instruktionen', async () => {
    const tryck = vi.fn();
    await montera(<YtaPaminnelseVy paminnelse={p('bricka')} top="10px" onTryck={tryck} />);
    expect(ruta!.querySelectorAll('button')).toHaveLength(1);
    act(() => { q('yta-paminnelse')!.click(); });
    expect(tryck).toHaveBeenCalledTimes(1);
  });
});

describe('KommentarVisning — etiketten för hela trakten', () => {
  it('Vidas direktiv kan heta "Hela trakten · Vida"; standard är oförändrad', async () => {
    await montera(<><KommentarVisning vida text="a. B." meningar vidaEtikett="Hela trakten · Vida" /><KommentarVisning vida text="c" /></>);
    expect(qa('kartkort-kommentar-kalla').map((e) => e.textContent)).toEqual(['Hela trakten · Vida', 'Vida · traktdirektiv']);
  });
});
