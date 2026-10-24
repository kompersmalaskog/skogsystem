// @vitest-environment jsdom
// Starta jobb renderas på riktigt (CLAUDE.md: "Rendera innan leverans"). Vaktar Martins krav 2026-10-24:
//  - läget på varje P-VO syns i ORD i listan (Tagen/Ledig/Startad utan data/Klar), grupperat;
//  - ett jobb visar numret stort, läget och vilken maskin som saknas (egen skotning: skotaren väntas inte);
//  - Nytt jobb: Skotning bara för slutavverkning/gallring, Hör till bara för GROT, och skapa är inaktiv utan position;
//  - ett maskinobjekt får INTE ett VO av ett tryck — det kräver bekräftelsen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  data: {} as Record<string, any[]>,
  fel: {} as Record<string, { message: string } | undefined>,
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabell: string) => {
      const filter: ((r: any) => boolean)[] = [];
      const svar = () => (h.fel[tabell] ? { data: null, error: h.fel[tabell] } : { data: (h.data[tabell] ?? []).filter((r) => filter.every((f) => f(r))), error: null });
      const b: any = {
        select: () => b, order: () => b, limit: () => b, eq: () => b, is: () => b, not: () => b,
        or: (uttryck: string) => { if (uttryck.includes('vo_nummer.is.null')) filter.push((r) => !r.vo_nummer); return b; },
        like: (kol: string, m: string) => { const p = m.replace('%', ''); filter.push((r) => String(r[kol] ?? '').startsWith(p)); return b; },
        in: (kol: string, v: any[]) => { filter.push((r) => v.includes(r[kol])); return b; },
        update: () => b, insert: () => b,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (res: any, rej: any) => Promise.resolve(svar()).then(res, rej),
      };
      return b;
    },
    rpc: (...a: any[]) => h.rpc(...a),
  },
}));
vi.mock('@/components/starta/PlatsKarta', () => ({ default: () => <div data-testid="karta" />, KARTA_START: { lat: 56.4, lng: 14.7 } }));
vi.mock('@/lib/enhetMaskin', () => ({ hamtaEnhetMaskin: () => null }));
vi.mock('@/lib/gpsKalla', () => ({ hamtaEnGpsFix: () => Promise.resolve(null) }));

import StartaJobbPage from './page';

function prod() {
  h.data = {
    objekt: [
      { id: 'o25', namn: 'Görgen Gustafsson Trolleboda', vo_nummer: 'P-1025', typ: 'slutavverkning', status: 'pagaende', ursprung: 'privat', egen_skotning: true },
      { id: 'o23', namn: 'Kroksjömåla Grot', vo_nummer: 'P-1023', typ: 'grot', status: 'pagaende', ursprung: 'privat', dim_objekt_id: '880808' },
      { id: 'o22', namn: 'Utan data', vo_nummer: 'P-1022', typ: 'gallring', status: 'pagaende', ursprung: 'privat' },
      { id: 'o17', namn: 'Kompersmåla väggata', vo_nummer: 'P-1017', typ: null, status: 'oplanerad', ursprung: null },
      { id: 'o24', namn: 'Ljuvadal', vo_nummer: 'P-1024', typ: 'gallring', status: 'avslutat', ursprung: 'privat' },
    ],
    dim_objekt: [
      { objekt_id: '880808', vo_nummer: '880808', maskin_id: 'A030353', start_date: '2026-10-06 15:08:41' },
      { objekt_id: 'R64428_53', vo_nummer: 'P-1025', maskin_id: 'R64428', start_date: '2026-10-23 10:36:00' },
      { objekt_id: 'X_1', vo_nummer: null, object_name: 'Maskinens jobb', maskin_id: 'R64428', start_date: '2026-10-22' },
    ],
    objekt_alt_nummer: [],
    hyttspar: [],
    dim_maskin: [
      { maskin_id: 'R64428', visningsnamn: 'H8E -26', maskin_typ: 'Harvester' },
      { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder' },
    ],
  };
  h.fel = {};
}

let container: HTMLDivElement;
let root: Root;

async function vanta(villkor: () => boolean, max = 60) {
  for (let i = 0; i < max && !villkor(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
}
async function montera() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<StartaJobbPage />); });
  await vanta(() => !text().includes('Läser jobben'));
}
const text = () => document.body.textContent ?? '';
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
async function tryck(el: HTMLElement | null) {
  expect(el).not.toBeNull();
  await act(async () => { el!.click(); });
  await act(async () => { await Promise.resolve(); });
}
const knappMedText = (t: string) => Array.from(document.body.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === t) as HTMLElement | undefined ?? null;

beforeEach(() => { prod(); h.rpc.mockReset(); window.history.replaceState(null, '', '/starta-jobb'); });
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; });

describe('listan — läget i ord', () => {
  it('grupperar Pågående, Lediga, Klara (hopfälld) och säger vem som tagit numret', async () => {
    await montera();
    expect(text()).toContain('Pågående');
    expect(q('[data-testid="jobb-P-1025"]')!.textContent).toContain('Tagen · H8E -26 · sedan 23 okt');
    expect(q('[data-testid="jobb-P-1023"]')!.textContent).toContain('Tagen · Wisent · sedan 6 okt');
    const utan = q('[data-testid="jobb-P-1022"] [data-lage]')!;
    expect(utan.textContent).toBe('Startad — ingen maskin har skickat data');
    expect(utan.getAttribute('data-lage')).toBe('ingen_data');
    expect(q('[data-testid="jobb-P-1017"]')!.textContent).toContain('Ledig · inte inknappad i någon maskin');
    // Klara är hopfälld: raden finns inte förrän man trycker
    expect(q('[data-testid="jobb-P-1024"]')).toBeNull();
    await tryck(Array.from(document.body.querySelectorAll('h3 button')).find((b) => (b.textContent || '').includes('Klara')) as HTMLElement);
    expect(q('[data-testid="jobb-P-1024"]')!.textContent).toContain('Klar');
  });

  it('ett läsfel i maskindatan är ett fel — aldrig "Ledig"', async () => {
    h.fel.hyttspar = { message: 'nät' };
    await montera();
    expect(text()).toContain('Kunde inte läsa om numren är inknappade');
    expect(text()).not.toContain('Ledig · inte inknappad');
  });
});

describe('ett jobb', () => {
  it('visar numret, läget och att skotaren inte väntas vid egen skotning', async () => {
    await montera();
    await tryck(q('[data-testid="jobb-P-1025"]'));
    expect(q('[data-testid="vo-nummer"]')!.textContent).toBe('P-1025');
    expect(q('[data-testid="vo-lage"]')!.textContent).toBe('Tagen · H8E -26 · sedan 23 okt');
    expect(text()).toContain('Egen skotning — inga filer väntas');
    expect(q('[data-testid="planera"]')!.getAttribute('href')).toBe('/planering?objekt=o25');
  });
  it('GROT: en maskin, ingen skotningsrad', async () => {
    await montera();
    await tryck(q('[data-testid="jobb-P-1023"]'));
    expect(text()).toContain('Wisent');
    expect(text()).not.toContain('Skotning');
    expect(text()).not.toContain('Ingen skotare');
  });
});

describe('Nytt jobb', () => {
  it('Skotning bara för virkesjobb, Hör till bara för GROT, och skapa är inaktiv utan position', async () => {
    await montera();
    await tryck(q('[data-testid="nytt-jobb"]'));
    expect(text()).toContain('Skotning');
    expect(text()).not.toContain('Hör till objekt');
    await tryck(q('[data-testid="val-grot"]'));
    expect(text()).not.toContain('Vi skotar');
    expect(text()).toContain('Hör till objekt');
    expect(text()).toContain('Skriv ett namn');
    const namn = q('input[name="namn"]') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(namn, 'Trolleboda grot');
      namn.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(text()).toContain('Välj var jobbet är');
    await tryck(q('[data-testid="skapa"]'));
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('maskinobjekt utan VO', () => {
  it('ett tryck på raden ger INGET VO — det kräver Ge VO-nummer', async () => {
    await montera();
    await tryck(q('[data-testid="maskinobjekt-rad"]'));
    await tryck(q('[data-testid="maskinobjekt-X_1"]'));
    expect(h.rpc).not.toHaveBeenCalled();
    expect(text()).toContain('Det går inte att ångra');
    expect(knappMedText('Ge VO-nummer')).not.toBeNull();
  });
});
