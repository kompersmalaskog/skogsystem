// @vitest-environment jsdom
// "Filer utan objekt" i /redigering: de fyra riktiga filerna (2026-10-14), Koppla till objekt, ärlig sparning och läsfel.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const M = 'PONS20SDJAA270231';
const h = vi.hoisted(() => ({
  hpr: [] as any[], objekt: [] as any[], alias: [] as any[], ign: [] as any[],
  fel: {} as Record<string, any>,            // tabell → felobjekt (läsning)
  insertFel: null as any, insertSynsEj: false, inserts: [] as any[],
  ignFel: null as any, ignSynsEj: false, ignInserts: [] as any[],
  updateFel: null as any, updates: [] as any[], deleteFel: null as any, byteKolumnSaknas: false, n: 0,
}));

// Liten minnesdatabas som beter sig som PostgREST nog för kortet: select/insert/update/delete med eq/is, unika nycklar.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabell: string) => {
      const rader = (): any[] => (tabell === 'hpr_filer' ? h.hpr : tabell === 'objekt' ? h.objekt : tabell === 'objekt_alt_nummer' ? h.alias : tabell === 'hpr_ignorerad' ? h.ign : []);
      const bygg = (op: 'select' | 'update' | 'delete', kolumner = '', patch: any = null) => {
        const filter: Array<(r: any) => boolean> = [];
        const traffar = () => rader().filter((r) => filter.every((f) => f(r)));
        const lasfel = () => {
          if (h.fel[tabell]) return h.fel[tabell];
          if (tabell === 'objekt_alt_nummer' && h.byteKolumnSaknas && kolumner.includes('byte_till')) return { code: '42703', message: 'column objekt_alt_nummer.byte_till does not exist' };
          return null;
        };
        const klar = (): any => {
          if (op === 'select') { const e = lasfel(); return e ? { data: null, error: e } : { data: traffar().map((r) => ({ ...r })), error: null }; }
          if (op === 'update') {
            if (h.updateFel) return { data: null, error: h.updateFel };
            const t = traffar(); t.forEach((r) => { Object.assign(r, patch); h.updates.push({ tabell, patch, id: r.id }); });
            return { data: t.map((r) => ({ id: r.id })), error: null };
          }
          if (h.deleteFel) return { data: null, error: h.deleteFel };
          const t = traffar(); const idn = new Set(t); const kvar = rader().filter((r) => !idn.has(r)); rader().length = 0; rader().push(...kvar);
          return { data: t.map((r) => ({ id: r.id, nyckel: r.nyckel })), error: null };
        };
        const b: any = {
          eq: (k: string, v: any) => { filter.push((r) => r[k] === v); return b; },
          is: (k: string, v: any) => { filter.push((r) => (r[k] ?? null) === v); return b; },
          order: () => b,
          range: (fran: number, till: number) => { const r = klar(); return Promise.resolve(r.error ? r : { data: r.data.slice(fran, till + 1), error: null }); },
          select: () => Promise.resolve(klar()),
          then: (ok: any, nej: any) => Promise.resolve(klar()).then(ok, nej),
        };
        return b;
      };
      return {
        select: (kolumner: string) => bygg('select', kolumner),
        update: (patch: any) => bygg('update', '', patch),
        delete: () => bygg('delete'),
        insert: (rad: any) => ({
          select: () => {
            if (tabell === 'objekt_alt_nummer') {
              h.inserts.push(rad);
              if (h.insertFel) return Promise.resolve({ data: null, error: h.insertFel });
              if (h.alias.some((a) => a.nummer === rad.nummer && (a.maskin_id ?? null) === (rad.maskin_id ?? null))) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
              const ny = { id: `a${++h.n}`, ...rad };
              if (!h.insertSynsEj) h.alias.push(ny);
              return Promise.resolve({ data: [{ id: ny.id }], error: null });
            }
            if (tabell === 'hpr_ignorerad') {
              h.ignInserts.push(rad);
              if (h.ignFel) return Promise.resolve({ data: null, error: h.ignFel });
              if (!h.ignSynsEj) h.ign.push({ ...rad });
              return Promise.resolve({ data: [{ nyckel: rad.nyckel }], error: null });
            }
            return Promise.resolve({ data: null, error: { message: 'okänd tabell' } });
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

beforeEach(() => {
  h.hpr = FILER.map((f) => ({ ...f })); h.objekt = OBJEKT.map((o) => ({ ...o })); h.alias = []; h.ign = []; h.fel = {};
  h.insertFel = null; h.insertSynsEj = false; h.inserts = []; h.ignFel = null; h.ignSynsEj = false; h.ignInserts = [];
  h.updateFel = null; h.updates = []; h.deleteFel = null; h.byteKolumnSaknas = false; h.n = 0;
});
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

// Läget efter att importen bytt objektets nummer (Bågskyttebanan: 11166440 → 11271849; gamla numret hade ingen maskindata)
const efterByte = () => {
  h.hpr = [{ ...FILER[0] }];
  h.objekt = OBJEKT.map((o) => (o.id === 'u-bagskytt' ? { ...o, vo_nummer: '11271849' } : { ...o }));
  h.alias = [{ id: 'a-byte', objekt_id: 'u-bagskytt', nummer: '11166440', maskin_id: null, kalla: 'namn', byte_till: '11271849' }];
};
const bagskytt = () => h.objekt.find((o) => o.id === 'u-bagskytt');

describe('Bytte nummer — importen bytte objekt.vo_nummer', () => {
  it('syns som en rad "Bytte nummer: <objekt> <gammalt> → <nytt>" med Ångra — och filen räknas som kopplad (inte i listan över okopplade)', async () => {
    efterByte();
    await montera();
    expect(q('okoppl-rubrik')!.textContent).toContain('1 objekt bytte nummer');
    expect(q('okoppl-rubrik')!.textContent).not.toContain('hör inte till något objekt');
    klicka(q('okoppl-rubrik'));
    expect(q('okoppl-byte-text')!.textContent).toBe('Bytte nummer: Bågskyttebanan RP J-Hus- 25 11166440 → 11271849');
    expect(q('okoppl-angra-a-byte')).not.toBeNull();
    expect(radIdn()).toEqual([]);
  });

  it('Ångra återställer: objekt.vo_nummer tillbaka till det gamla, bytesraden bort, nya numret sparat som vanligt extra nummer', async () => {
    efterByte();
    await oppna();
    await act(async () => { q('okoppl-angra-a-byte')!.click(); });
    await flush();
    expect(bagskytt().vo_nummer).toBe('11166440');                                         // återställt
    expect(h.alias.find((a) => a.id === 'a-byte')).toBeUndefined();                        // bytesraden borta
    expect(h.alias).toHaveLength(1);
    expect(h.alias[0]).toMatchObject({ objekt_id: 'u-bagskytt', nummer: '11271849', maskin_id: null, kalla: 'manuell' });   // så nästa fil inte byter igen
    expect(h.alias[0].byte_till).toBeUndefined();
    // filen (nr 11271849) är fortfarande kopplad — via det extra numret — så inget återstår att visa
    expect(q('okoppl-kort')).toBeNull();
  });

  it('Ångra när numret ändrats sedan bytet: rör ingenting och säger det', async () => {
    efterByte();
    bagskytt().vo_nummer = '11999999';
    await oppna();
    await act(async () => { q('okoppl-angra-a-byte')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('har ändrats sedan bytet');
    expect(bagskytt().vo_nummer).toBe('11999999');
    expect(h.alias.map((a) => a.id)).toEqual(['a-byte']);
  });

  it('Ångra när uppdateringen inte går igenom: extra numret som skrevs rullas tillbaka — inget halvt tillstånd', async () => {
    efterByte();
    h.updateFel = { code: '42501', message: 'permission denied' };
    await oppna();
    await act(async () => { q('okoppl-angra-a-byte')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('inget återställdes');
    expect(bagskytt().vo_nummer).toBe('11271849');
    expect(h.alias.map((a) => a.id)).toEqual(['a-byte']);                                  // det nya extra numret är borttaget igen
  });

  it('bytesraden kunde inte tas bort → säger det, och ett andra Ångra slutför (idempotent)', async () => {
    efterByte();
    h.deleteFel = { code: 'X', message: 'nät' };
    await oppna();
    await act(async () => { q('okoppl-angra-a-byte')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('tryck Ångra igen');
    expect(bagskytt().vo_nummer).toBe('11166440');                                         // numret är redan återställt
    h.deleteFel = null;
    await act(async () => { q('okoppl-angra-a-byte')!.click(); });
    await flush();
    expect(h.alias.find((a) => a.id === 'a-byte')).toBeUndefined();
    expect(h.alias.filter((a) => a.nummer === '11271849')).toHaveLength(1);                // inget dubbelt extra nummer
    expect(bagskytt().vo_nummer).toBe('11166440');
  });

  it('byte och okopplade filer i samma kort: rubriken räknar båda', async () => {
    efterByte();
    h.hpr = [{ ...FILER[0] }, { ...FILER[2] }, { ...FILER[3] }];
    await oppna();
    expect(q('okoppl-rubrik')!.textContent).toContain('2 filer hör inte till något objekt · 1 bytte nummer');
    expect(radIdn()).toHaveLength(2);
    expect(q('okoppl-byte-text')).not.toBeNull();
  });

  it('andra migrationen ej körd (byte_till saknas): listan visas som förut, utan byten', async () => {
    h.byteKolumnSaknas = true;
    await oppna();
    expect(radIdn()).toHaveLength(4);
    expect(q('okoppl-byte-text')).toBeNull();
  });
});

describe('Ignorera', () => {
  it('Ignorera döljer jobbet — men filen finns kvar i databasen och markeringen sparas', async () => {
    await oppna();
    await act(async () => { q('okoppl-ignorera-PONS20SDJAA270231:k7')!.click(); });
    await flush();
    expect(h.ignInserts).toEqual([{ nyckel: `${M}:k7` }]);
    expect(h.hpr).toHaveLength(4);                                                         // hpr_filer rörs aldrig
    expect(radIdn()).toHaveLength(3);
    expect(radIdn()).not.toContain(`${M}:k7`);
    expect(q('okoppl-rubrik')!.textContent).toContain('3 filer hör inte till något objekt');
  });

  it('"Visa ignorerade (1)" tar fram dem igen, och "Visa igen" lägger tillbaka dem', async () => {
    h.ign = [{ nyckel: `${M}:k7` }];
    await oppna();
    expect(radIdn()).toHaveLength(3);
    expect(q('okoppl-visa-ignorerade')!.textContent).toBe('Visa ignorerade (1)');
    klicka(q('okoppl-visa-ignorerade'));
    expect(q('okoppl-visa-ignorerade')!.textContent).toBe('Dölj ignorerade (1)');
    expect(radIdn()).toHaveLength(4);                                                      // synliga + den ignorerade
    expect(q(`okoppl-rad-${M}:k7`)!.textContent).toContain('Flyttobjekt');
    expect(q(`okoppl-ignorera-${M}:k7`)).toBeNull();                                       // ignorerad rad har Visa igen i stället
    await act(async () => { q(`okoppl-visaigen-${M}:k7`)!.click(); });
    await flush();
    expect(h.ign).toEqual([]);
    expect(q('okoppl-visa-ignorerade')).toBeNull();
    expect(radIdn()).toHaveLength(4);
    expect(q(`okoppl-ignorera-${M}:k7`)).not.toBeNull();
  });

  it('är allt ignorerat finns kortet kvar (så de går att ta fram), med rubriken "Inga filer utan objekt"', async () => {
    h.ign = FILER.map((f) => ({ nyckel: f.objekt_nyckel }));
    await montera();
    expect(q('okoppl-rubrik')!.textContent).toContain('Inga filer utan objekt');
    expect(q('okoppl-rubrik')!.textContent).toContain('4 ignorerade filer');
    klicka(q('okoppl-rubrik'));
    expect(radIdn()).toEqual([]);
    klicka(q('okoppl-visa-ignorerade'));
    expect(radIdn()).toHaveLength(4);
  });

  it('fil utan nyckel ignoreras på filnamnet (fil:<filnamn>)', async () => {
    h.hpr = [{ filnamn: 'Gammal fil.hpr', objekt_nyckel: null, fil_datum: null, stammar_count: 5 }];
    await oppna();
    await act(async () => { q('okoppl-ignorera-Gammal fil.hpr')!.click(); });
    await flush();
    expect(h.ignInserts).toEqual([{ nyckel: 'fil:Gammal fil.hpr' }]);
    expect(radIdn()).toEqual([]);
  });

  it('en ignorerad nyckel som senare kopplas (extra nummer) försvinner ur listan på riktigt', async () => {
    h.ign = [{ nyckel: `${M}:11271849` }];
    h.alias = [{ id: 'a1', objekt_id: 'u-bagskytt', nummer: '11271849', maskin_id: null }];
    await montera();
    expect(q('okoppl-kort')!.textContent).not.toContain('Bågskyttebanan');
  });

  it('sparfel: säger det och döljer ingenting', async () => {
    h.ignFel = { code: '42501', message: 'permission denied' };
    await oppna();
    await act(async () => { q('okoppl-ignorera-PONS20SDJAA270231:k7')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('Kunde inte ignorera — inget sparades');
    expect(radIdn()).toHaveLength(4);
  });

  it('migrationen ej körd (hpr_ignorerad saknas): listan visas och Ignorera säger varför det inte går', async () => {
    h.fel.hpr_ignorerad = { code: '42P01', message: 'relation "public.hpr_ignorerad" does not exist' };
    h.ignFel = { code: '42P01', message: 'relation does not exist' };
    await oppna();
    expect(radIdn()).toHaveLength(4);
    await act(async () => { q('okoppl-ignorera-PONS20SDJAA270231:k7')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('migrationen är inte körd');
  });

  it('ignorera "syntes inte vid omläsning" → säger det i stället för att låtsas', async () => {
    h.ignSynsEj = true;
    await oppna();
    await act(async () => { q('okoppl-ignorera-PONS20SDJAA270231:k7')!.click(); });
    await flush();
    expect(q('okoppl-meddelande')!.textContent).toContain('syntes inte vid omläsning');
    expect(radIdn()).toHaveLength(4);
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
