// @vitest-environment jsdom
// "Filer utan objekt" i /redigering: de fyra riktiga filerna (2026-10-14), Koppla till objekt, ärlig sparning och läsfel.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const M = 'PONS20SDJAA270231';
const h = vi.hoisted(() => ({
  hpr: [] as any[], objekt: [] as any[], alias: [] as any[],
  fel: {} as Record<string, any>,            // tabell → felobjekt (läsning)
  insertFel: null as any, insertSynsEj: false, inserts: [] as any[],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabell: string) => {
      const rader = () => (tabell === 'hpr_filer' ? h.hpr : tabell === 'objekt' ? h.objekt : tabell === 'objekt_alt_nummer' ? h.alias : []);
      return {
        select: () => {
          const svar = () => (h.fel[tabell] ? { data: null, error: h.fel[tabell] } : { data: rader(), error: null });
          const b: any = {
            order: () => b,
            range: (fran: number, till: number) => {
              const r: any = svar();
              return Promise.resolve(r.error ? r : { data: r.data.slice(fran, till + 1), error: null });
            },
          };
          return b;
        },
        insert: (rad: any) => ({
          select: () => {
            h.inserts.push(rad);
            if (h.insertFel) return Promise.resolve({ data: null, error: h.insertFel });
            if (!h.insertSynsEj) h.alias.push({ ...rad });
            return Promise.resolve({ data: [{ id: 'ny' }], error: null });
          },
        }),
      };
    },
  },
}));

import OkopplFilerKort from './OkopplFilerKort';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const FILER = [
  { filnamn: `Bågskyttebanan RP J-Hus- 25_${M}_20261013082121.hpr`, objekt_nyckel: `${M}:11271849`, fil_datum: '2026-10-13T08:00:00Z', stammar_count: 900 },
  { filnamn: `Mölleryd RP J-Hus -25_${M}_20261013091500.hpr`, objekt_nyckel: `${M}:11271883`, fil_datum: '2026-10-13T09:00:00Z', stammar_count: 700 },
  { filnamn: `Gallring Vällust_${M}_20261013101010.hpr`, objekt_nyckel: `${M}:k132`, fil_datum: '2026-10-13T10:00:00Z', stammar_count: 300 },
  { filnamn: `Flyttobjekt_${M}_20261013111111.hpr`, objekt_nyckel: `${M}:k7`, fil_datum: '2026-10-13T11:00:00Z', stammar_count: 2 },
];
const OBJEKT = [
  { id: 'u-bagskytt', namn: 'Bågskyttebanan RP J-Hus- 25', vo_nummer: '11166440' },
  { id: 'u-molleryd', namn: 'Mölleryd RP J-Hus -25', vo_nummer: '11166477' },
  { id: 'u-vallust', namn: 'Vällust RP M-R -25', vo_nummer: '11200001' },
];

let rot: Root | null = null;
let beh: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 15; i++) await act(async () => { await Promise.resolve(); }); };
const q = (id: string) => beh!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const klicka = (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };
const radIdn = () => Array.from(beh!.querySelectorAll('[data-testid^="okoppl-rad-"]')).map((e) => e.getAttribute('data-testid')!.replace('okoppl-rad-', ''));
async function skriv(el: HTMLInputElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function montera() {
  beh = document.createElement('div');
  document.body.appendChild(beh);
  rot = createRoot(beh);
  await act(async () => { rot!.render(<OkopplFilerKort maskiner={{ [M]: 'Giant' }} />); });
  await flush();
}
async function oppna() { await montera(); klicka(q('okoppl-rubrik')); }

beforeEach(() => { h.hpr = FILER.map((f) => ({ ...f })); h.objekt = OBJEKT.map((o) => ({ ...o })); h.alias = []; h.fel = {}; h.insertFel = null; h.insertSynsEj = false; h.inserts = []; });
afterEach(async () => { await act(async () => { rot?.unmount(); }); beh?.remove(); rot = null; });

describe('de fyra riktiga filerna', () => {
  it('utan extra nummer syns alla fyra: rubriken räknar dem och säger varför det spelar roll', async () => {
    await montera();
    expect(q('okoppl-rubrik')!.textContent).toContain('4 filer hör inte till något objekt');
    expect(q('okoppl-rubrik')!.textContent).toContain('Skotaren ser inga högar');
    klicka(q('okoppl-rubrik'));
    expect(radIdn()).toHaveLength(4);
    expect(q('okoppl-rad-PONS20SDJAA270231:k7')!.textContent).toContain('Flyttobjekt');
    expect(q('okoppl-rad-PONS20SDJAA270231:11271849')!.textContent).toContain('Bågskyttebanan RP J-Hus- 25');
    expect(q('okoppl-rad-PONS20SDJAA270231:11271849')!.textContent).toContain('Giant');         // maskinens namn, inte id
    expect(q('okoppl-rad-PONS20SDJAA270231:11271849')!.textContent).toContain('2026-10-13');
    expect(q('okoppl-rad-PONS20SDJAA270231:11271849')!.textContent).toContain('nr 11271849');
  });

  it('efter importens namnkoppling (två extra nummer) återstår Vällust och Flyttobjekt — och syns', async () => {
    h.alias = [
      { objekt_id: 'u-bagskytt', nummer: '11271849', maskin_id: null },
      { objekt_id: 'u-molleryd', nummer: '11271883', maskin_id: null },
    ];
    await oppna();
    expect(q('okoppl-rubrik')!.textContent).toContain('2 filer hör inte till något objekt');
    expect(radIdn().sort()).toEqual([`${M}:k132`, `${M}:k7`].sort());
  });

  it('inga okopplade filer → kortet syns inte alls', async () => {
    h.hpr = [{ ...FILER[0], objekt_nyckel: `${M}:11166440` }];       // numret ÄR objektets vo_nummer
    await montera();
    expect(q('okoppl-kort')).toBeNull();
    expect(q('okoppl-fel')).toBeNull();
  });
});

describe('Koppla till objekt', () => {
  it('Bågskyttebanan: samma namn föreslås överst ("Troligast") — och ingenting annat föreslås förrän man söker', async () => {
    await oppna();
    klicka(q('okoppl-koppla-PONS20SDJAA270231:11271849'));
    expect(beh!.textContent).toContain('Troligast');
    const objekt = Array.from(beh!.querySelectorAll('[data-testid^="okoppl-objekt-"]')).map((e) => e.getAttribute('data-testid')!.replace('okoppl-objekt-', ''));
    expect(objekt).toEqual(['u-bagskytt']);
  });

  it('Vällust: inget objekt har samma namn → man söker, väljer, bekräftar; raden som skrivs är k-numret med maskinen', async () => {
    await oppna();
    klicka(q('okoppl-koppla-PONS20SDJAA270231:k132'));
    expect(beh!.textContent).toContain('Inget objekt har samma namn');
    await skriv(q('okoppl-sok') as HTMLInputElement, 'vällust');
    klicka(q('okoppl-objekt-u-vallust'));
    expect(q('okoppl-bekrafta-text')!.textContent).toContain('k132');
    expect(q('okoppl-bekrafta-text')!.textContent).toContain('Vällust RP M-R -25');
    await act(async () => { q('okoppl-bekrafta')!.click(); });
    await flush();
    expect(h.inserts).toEqual([{
      objekt_id: 'u-vallust', nummer: 'k132', maskin_id: M, kalla: 'manuell', filnamn: `Gallring Vällust_${M}_20261013101010.hpr`,
    }]);
    // läst tillbaka: Vällust är borta ur listan, Flyttobjekt och de två andra står kvar
    expect(radIdn()).not.toContain(`${M}:k132`);
    expect(radIdn()).toHaveLength(3);
    expect(q('okoppl-rubrik')!.textContent).toContain('3 filer hör inte till något objekt');
  });

  it('kontraktsnummer sparas utan maskin', async () => {
    await oppna();
    klicka(q('okoppl-koppla-PONS20SDJAA270231:11271883'));
    klicka(q('okoppl-objekt-u-molleryd'));
    await act(async () => { q('okoppl-bekrafta')!.click(); });
    await flush();
    expect(h.inserts[0]).toMatchObject({ objekt_id: 'u-molleryd', nummer: '11271883', maskin_id: null, kalla: 'manuell' });
  });

  it('Flyttobjekt går att koppla om Martin vill, men ingenting skrivs utan bekräftelse', async () => {
    await oppna();
    klicka(q('okoppl-koppla-PONS20SDJAA270231:k7'));
    await skriv(q('okoppl-sok') as HTMLInputElement, 'älmehult');
    expect(h.inserts).toEqual([]);
    expect(q('okoppl-bekrafta')).toBeNull();                                 // inget objekt valt → ingen bekräftelseknapp
  });

  it('sparfel: säger det, ingenting försvinner ur listan', async () => {
    h.insertFel = { message: 'permission denied', code: '42501' };
    await oppna();
    klicka(q('okoppl-koppla-PONS20SDJAA270231:k132'));
    await skriv(q('okoppl-sok') as HTMLInputElement, 'vällust');
    klicka(q('okoppl-objekt-u-vallust'));
    await act(async () => { q('okoppl-bekrafta')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('Kunde inte koppla — inget sparades');
    expect(radIdn()).toHaveLength(4);
  });

  it('numret är redan kopplat (unik) → eget meddelande', async () => {
    h.insertFel = { message: 'duplicate key', code: '23505' };
    await oppna();
    klicka(q('okoppl-koppla-PONS20SDJAA270231:k132'));
    await skriv(q('okoppl-sok') as HTMLInputElement, 'vällust');
    klicka(q('okoppl-objekt-u-vallust'));
    await act(async () => { q('okoppl-bekrafta')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('redan kopplat');
  });

  it('insert "lyckades" men raden syns inte vid omläsning → säger det i stället för att låtsas', async () => {
    h.insertSynsEj = true;
    await oppna();
    klicka(q('okoppl-koppla-PONS20SDJAA270231:k132'));
    await skriv(q('okoppl-sok') as HTMLInputElement, 'vällust');
    klicka(q('okoppl-objekt-u-vallust'));
    await act(async () => { q('okoppl-bekrafta')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('syntes inte vid omläsning');
    expect(radIdn()).toContain(`${M}:k132`);
  });
});

describe('ärliga lägen', () => {
  it('läsfel på hpr_filer: säger det och erbjuder Försök igen — ser inte ut som "inga okopplade"', async () => {
    h.fel.hpr_filer = { message: 'nät', code: 'X' };
    await montera();
    expect(q('okoppl-fel')!.textContent).toContain('Kunde inte läsa filerna');
    expect(q('okoppl-kort')).toBeNull();
    h.fel = {};
    await act(async () => { (q('okoppl-fel')!.querySelector('button') as HTMLElement).click(); });
    await flush();
    expect(q('okoppl-kort')).not.toBeNull();
  });

  it('läsfel på objekt: samma', async () => {
    h.fel.objekt = { message: 'nät', code: 'X' };
    await montera();
    expect(q('okoppl-fel')).not.toBeNull();
  });

  it('migrationen ej körd (tabellen saknas): listan visas ändå, och Koppla säger varför det inte går', async () => {
    h.fel.objekt_alt_nummer = { message: 'relation "public.objekt_alt_nummer" does not exist', code: '42P01' };
    h.insertFel = { message: 'relation does not exist', code: '42P01' };
    await oppna();
    expect(radIdn()).toHaveLength(4);
    klicka(q('okoppl-koppla-PONS20SDJAA270231:k132'));
    await skriv(q('okoppl-sok') as HTMLInputElement, 'vällust');
    klicka(q('okoppl-objekt-u-vallust'));
    await act(async () => { q('okoppl-bekrafta')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('migrationen är inte körd');
  });

  it('annat läsfel på extra nummer är ett läsfel (en dold koppling får inte se ut som en okopplad fil)', async () => {
    h.fel.objekt_alt_nummer = { message: 'permission denied', code: '42501' };
    await montera();
    expect(q('okoppl-fel')).not.toBeNull();
  });

  it('fil utan nyckel försvinner inte: den visas men kan inte kopplas här', async () => {
    h.hpr = [{ filnamn: 'Gammal fil.hpr', objekt_nyckel: null, fil_datum: null, stammar_count: 5 }];
    await oppna();
    expect(radIdn()).toEqual(['Gammal fil.hpr']);
    expect(beh!.textContent).toContain('kan inte kopplas här');
    expect(beh!.querySelector('[data-testid^="okoppl-koppla-"]')).toBeNull();
  });
});

describe('källvakter', () => {
  const kort = readFileSync(resolve(__dirname, 'OkopplFilerKort.tsx'), 'utf8');
  const redigering = readFileSync(resolve(__dirname, '../../app/redigering/RedigeringClient.tsx'), 'utf8');
  it('kortet är monterat i /redigering, bredvid de andra larmen', () => {
    expect(redigering).toContain("import OkopplFilerKort from '@/components/redigering/OkopplFilerKort'");
    expect(redigering).toContain('<OkopplFilerKort maskiner={maskiner} />');
  });
  it('tokens, inga färgliteraler eller egna textstorlekar', () => {
    expect(kort).toContain("from '@/lib/design/tokens'");
    expect(kort).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(kort).not.toMatch(/fontSize\s*:\s*\d/);
    expect(kort).not.toMatch(/rgba?\(/);
  });
  it('hooks före alla tidiga returer', () => {
    const forstaReturn = kort.indexOf("if (status === 'laddar') return null;");
    for (const hook of ['useState(', 'useMemo(', 'useCallback(', 'useEffect(']) {
      const sista = kort.lastIndexOf(hook, forstaReturn);
      expect(sista).toBeGreaterThan(-1);
    }
    expect(kort.slice(forstaReturn)).not.toMatch(/\buse(State|Memo|Callback|Effect)\(/);
  });
});
