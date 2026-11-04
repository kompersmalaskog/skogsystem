// @vitest-environment jsdom
// Kemikalier renderas på riktigt: svaret, de som saknar blad först, EN knapp som öppnar bladet, admin lägger till och bockar av året.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

let jag: { id: string; roll: 'admin' | 'forare' } = { id: 'm', roll: 'admin' };
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: jag, loading: false }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/markeringFoto', () => ({ komprimeraMarkeringFoto: async (f: File) => f }));

let lista: any[] | null = [];
const tillagda: unknown[][] = [];
const lankar: string[] = [];
vi.mock('@/lib/arbetsmiljo/kemikalier', async (orig) => ({
  ...(await orig<typeof import('@/lib/arbetsmiljo/kemikalier')>()),
  hamtaKemikalier: async () => lista,
  laggTill: async (...a: unknown[]) => { tillagda.push(a.slice(1)); return null; },
  bladLank: async (_sb: unknown, s: string) => { lankar.push(s); return `https://signerad.example/${s}`; },
  bytBlad: async (...a: unknown[]) => { bytta.push(a.slice(1)); return null; },
}));
const gjort: unknown[][] = [];
let gjorda: any[] = [];
vi.mock('@/lib/arbetsmiljo/arshjul', async (orig) => ({
  ...(await orig<typeof import('@/lib/arbetsmiljo/arshjul')>()),
  hamtaGjorda: async () => gjorda,
  markeraGjord: async (...a: unknown[]) => { gjort.push(a.slice(1)); return null; },
}));
let lasSvar: any = { ok: false, olaslig: true };
let sokSvar: any = { status: 'inget' };
const sokningar: unknown[][] = [];
const bytta: unknown[][] = [];
vi.mock('@/lib/arbetsmiljo/hittaBlad', () => ({
  lasEtikettApi: async () => lasSvar,
  sokBladApi: async (...a: unknown[]) => { sokningar.push(a); return sokSvar; },
}));
import Kemikalier from './Kemikalier';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let el: HTMLDivElement;
beforeEach(() => {
  jag = { id: 'm', roll: 'admin' }; lasSvar = { ok: false, olaslig: true }; sokSvar = { status: 'inget' }; sokningar.length = 0; bytta.length = 0; tillagda.length = 0; lankar.length = 0; gjort.length = 0; gjorda = [];
  lista = [
    { id: 'a', namn: 'Hydraulolja', varFinns: 'Giant', sdbSokvag: 'a/1.pdf', sdbTid: '2026-11-01T10:00:00Z' },
    { id: 'b', namn: 'Avfettning', varFinns: null, sdbSokvag: null, sdbTid: null },
  ];
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
});
afterEach(() => { act(() => root.unmount()); el.remove(); });
const vanta = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const klick = async (s: string) => { await act(async () => { q(s)!.click(); }); await vanta(); };
const skriv = async (etikett: string, v: string) => {
  const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent === etikett)!;
  const falt = document.getElementById(label.getAttribute('for')!) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(falt, v); falt.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('Kemikalier', () => {
  it('svaret säger vad som saknas, och det som saknar blad står först', async () => {
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    expect(q('[data-testid="kem-svar"]')!.textContent).toBe('1 saknar säkerhetsblad');
    const rader = Array.from(document.querySelectorAll('[data-kem]')).map(e => e.getAttribute('data-kem'));
    expect(rader).toEqual(['b', 'a']);
    expect(q('[data-kem="b"]')!.textContent).toContain('Saknas');
    expect(q('[data-kem="b"]')!.textContent).toContain('Var den finns är inte ifyllt');
  });

  it('ett tryck på en produkt ger EN knapp som öppnar bladet', async () => {
    const w = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(w as never);
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem="a"]');
    await klick('[data-kem-oppna]');
    expect(lankar).toEqual(['a/1.pdf']);
    expect(w.location.href).toBe('https://signerad.example/a/1.pdf');
  });

  it('föraren ser listan och kan öppna bladet, men inte bocka av året eller ta bort', async () => {
    jag = { id: 'f', roll: 'forare' };
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    expect(q('[data-kem-ny]')).not.toBeNull();
    expect(q('[data-kem-genomgang]')).toBeNull();
    await klick('[data-kem="b"]');
    expect(q('[data-kem-oppna]')).toBeNull();
    expect(document.body.textContent).toContain('Arbetsledningen ordnar det');
    expect(q('[data-kem-bort]')).toBeNull();
  });

  it('föraren lägger till det hen köpt, med foto på etiketten, och får veta att arbetsledningen ordnar bladet', async () => {
    jag = { id: 'f', roll: 'forare' };
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem-ny]');
    const bild = new File(['x'], 'burk.jpg', { type: 'image/jpeg' });
    const inp = document.querySelector('input[accept="image/*"]') as HTMLInputElement;
    expect(inp.getAttribute('capture')).toBe('environment');
    Object.defineProperty(inp, 'files', { value: [bild], configurable: true });
    await act(async () => { inp.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(q('[data-kem-fotorad]')!.textContent).toContain('burk.jpg');
    await skriv('Vad heter den?', 'Biohyd 46');
    await klick('[data-kem-spara]');
    expect(tillagda).toHaveLength(1);
    expect(tillagda[0].slice(0, 3)).toEqual(['Biohyd 46', '', null]);
    expect(tillagda[0][3]).toBe(bild);
    expect(q('[data-kem-kvitto]')!.textContent).toContain('Arbetsledningen ordnar säkerhetsbladet');
  });

  it('fotot på etiketten syns i produkten', async () => {
    lista![0] = { ...lista![0], etikettSokvag: 'a/etikett-1.jpg' };
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem="a"]');
    expect((q('[data-kem-foto]') as HTMLImageElement).src).toBe('https://signerad.example/a/etikett-1.jpg');
  });

  it('?id= (pushen) öppnar produkten', async () => {
    window.history.replaceState(null, '', '/kemikalier?id=b');
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    window.history.replaceState(null, '', '/');
    expect(document.body.textContent).toContain('Avfettning');
    expect(q('[data-kem-bort]')).not.toBeNull();
  });

  it('länken till riskbedömningen för kemikalier finns för alla', async () => {
    jag = { id: 'f', roll: 'forare' };
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    expect(q('[data-kem-risk]')!.getAttribute('href')).toBe('/riskbedomning?typ=kemikalier');
  });

  it('admin lägger till en produkt; Lägg till är grå tills den har ett namn', async () => {
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem-ny]');
    expect((q('[data-kem-spara]') as HTMLButtonElement).disabled).toBe(true);
    await skriv('Vad heter den?', 'Kedjeolja');
    await skriv('Var finns den?', 'Verkstaden');
    await klick('[data-kem-spara]');
    expect(tillagda).toEqual([['Kedjeolja', 'Verkstaden', null, null]]);
  });

  it('årets genomgång bockar av årshjulets punkt Kemikalierna', async () => {
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem-genomgang]');
    expect(gjort).toHaveLength(1);
    expect(gjort[0][1]).toBe('kemikalier');
  });

  it('läsfel säger det med Försök igen, aldrig en tom lista', async () => {
    lista = null;
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    expect(q('[data-testid="kem-svar"]')!.textContent).toBe('Kunde inte läsa kemikalierna');
    expect(document.body.textContent).toContain('Försök igen');
  });

  const fota = async () => {
    const bild = new File(['x'], 'burk.jpg', { type: 'image/jpeg' });
    const inp = document.querySelector('input[accept="image/*"]') as HTMLInputElement;
    Object.defineProperty(inp, 'files', { value: [bild], configurable: true });
    await act(async () => { inp.dispatchEvent(new Event('change', { bubbles: true })); });
    await vanta();
  };

  it('ett foto räcker: appen läser namnet, letar upp bladet och frågar om det är rätt', async () => {
    jag = { id: 'f', roll: 'forare' };
    const blad = new File(['%PDF'], 'sdb.pdf', { type: 'application/pdf' });
    lasSvar = { ok: true, etikett: { namn: 'Hydraway HVXA 46', tillverkare: 'Statoil' } };
    sokSvar = { status: 'hittad', fil: blad, kalla: 'statoil.se', namnStammer: true };
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem-ny]');
    await fota();
    expect(sokningar).toEqual([['Hydraway HVXA 46', 'Statoil']]);
    expect(q('[data-kem-sok="hittad"]')!.textContent).toContain('statoil.se');
    await klick('[data-kem-ratt]');
    expect(q('[data-kem-bladet]')!.textContent).toContain('Från statoil.se');
    await klick('[data-kem-spara]');
    expect(tillagda[0][0]).toBe('Hydraway HVXA 46');
    expect(tillagda[0][2]).toBe(blad);
    expect(q('[data-kem-kvitto]')!.textContent).not.toContain('Arbetsledningen');
  });

  it('ett namn föraren redan skrivit skrivs aldrig över', async () => {
    lasSvar = { ok: true, etikett: { namn: 'Fel namn', tillverkare: null } };
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem-ny]');
    await skriv('Vad heter den?', 'Biohyd 46');
    await fota();
    expect(sokningar).toEqual([['Biohyd 46', null]]);
  });

  it('fel blad, eller inget blad: ett färdigt mejl till leverantören', async () => {
    lasSvar = { ok: true, etikett: { namn: 'Biohyd 46', tillverkare: null } };
    sokSvar = { status: 'hittad', fil: new File(['%PDF'], 'x.pdf'), kalla: 'okand.se', namnStammer: false };
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem-ny]');
    await fota();
    expect(q('[data-kem-sok="hittad"]')!.textContent).toContain('kolla att det är rätt produkt');
    await klick('[data-kem-fel]');
    expect(q('[data-kem-sok="inget"]')!.textContent).toContain('Hittade inget');
    expect(q('[data-kem-mejl]')).not.toBeNull();
    await klick('[data-kem-spara]');
    expect(tillagda[0][2]).toBeNull(); // fel blad sparas aldrig
  });

  it('admin letar upp bladet för en produkt som saknar det, och sparar det med ett tryck', async () => {
    const blad = new File(['%PDF'], 'sdb.pdf', { type: 'application/pdf' });
    sokSvar = { status: 'hittad', fil: blad, kalla: 'kemetyl.se', namnStammer: true };
    await act(async () => { root.render(<Kemikalier />); }); await vanta();
    await klick('[data-kem="b"]');
    await klick('[data-kem-leta]');
    expect(sokningar).toEqual([['Avfettning', null]]);
    await klick('[data-kem-ratt]');
    expect(bytta).toEqual([['b', blad]]);
  });
});
