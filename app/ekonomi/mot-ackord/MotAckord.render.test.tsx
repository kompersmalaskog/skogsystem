// @vitest-environment jsdom
// Ackord-fliken (barnregeln): det som kan gå sönder tyst — svaret som inte står
// först, ett fackord på första skärmen, en växel som visar en annan summa än de
// andra, en rad vars ark inte öppnas, eller menyn som får fler än fem flikar.
// Layouten (bredd, sidomeny från 1100 px) mäts i riktig Chromium, inte här.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MaskinDel, ObjektRad, JamforelseData } from '@/lib/ekonomi/objektJamforelse';

const push = vi.fn();
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: () => undefined }), usePathname: () => '/ekonomi/mot-ackord' }));

const del = (maskin_id: string, roll: MaskinDel['roll'], ackord: number, timpeng: number, timmar = 40): MaskinDel => ({
  maskin_id, roll, volym: 500, ackord, timpeng, timmar, timpris: 1000, forestlinkKr: 0, manuellTid: false,
});
const obj = (id: string, namn: string, klass: number | null, maskiner: MaskinDel[]): ObjektRad => ({
  objekt_id: id, namn, volym: 1000, medelstam: klass ?? 0.3, klass,
  ackord: maskiner.reduce((s, d) => s + d.ackord, 0), timpeng: maskiner.reduce((s, d) => s + d.timpeng, 0),
  diff: 0, krPerM3: null, egenSkotning: false, ejJamforbarOrsak: null,
  grund: [{ label: 'Skördad volym', text: '1 000 m³fub', manuell: false }, { label: 'Medelstam', text: '0,25 m³ · manuell', manuell: true }],
  maskiner,
});

let data: JamforelseData;
vi.mock('@/lib/ekonomi/objektJamforelse', async (orig) => ({
  ...(await orig<typeof import('@/lib/ekonomi/objektJamforelse')>()),
  hamtaObjektJamforelse: vi.fn(async () => data),
}));

// Mätningarna bredvid räkningen (körspår, lass, flyttar) läses ur databasen —
// här är de svar testet bestämmer.
let cyklerSvar = new Map<string, any>();
let mattSvar: any = { tider: null, lass: null, flyttar: 0 };
vi.mock('@/lib/ekonomi/lasVarfor', () => ({
  lasCykler: vi.fn(async () => cyklerSvar),
  lasSkogMatt: vi.fn(async () => mattSvar),
}));

import MotAckordClient from './MotAckordClient';
import { skogRader, krText } from '@/lib/ekonomi/ackordVy';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function montera() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(MotAckordClient)); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return host;
}
const text = () => (host?.textContent || '').replace(/ /g, ' ');
const knapp = (t: string) => [...document.querySelectorAll('button')].find(b => (b.textContent || '').replace(/ /g, ' ').includes(t)) as HTMLButtonElement;
async function tryck(el: Element) { await act(async () => { (el as HTMLElement).click(); }); }

beforeEach(() => {
  window.history.replaceState(null, '', '/ekonomi/mot-ackord');
  data = {
    rader: [
      obj('a', 'Jeppshoka', 0.25, [del('GIANT', 'skördare', 21000, 0), del('WISENT', 'skotare', 12156, 0)]),
      obj('b', 'Kvarnen', 0.3, [del('GIANT', 'skördare', 1000, 4000), del('WISENT', 'skotare', 0, 3160)]),
    ],
    ejJamforbara: [{ namn: 'Rössmåla', orsak: '2,5 h saknar timpris' }],
    vantarNamn: ['Björkebo', 'Rödby'],
    timpengAntal: 0,
    maskinNamnMap: { GIANT: { namn: 'Scorpion Giant', typ: 'Harvester' }, WISENT: { namn: 'Wisent', typ: 'Forwarder' } },
  };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null; host = null;
});

describe('Ackord — svar först', () => {
  it('frågan, Ja och summan av raderna i ord', async () => {
    await montera();
    expect(text()).toContain('Tjänade vi mer på att få betalt per kubik?');
    expect(text()).toContain('Ja');
    // 33 156 − 6 160 = 26 996
    expect(text()).toContain('26 996 kr mer');
    expect(text()).toContain('2 skogar är inte klara än och är inte med');
  });

  it('inga fackord på första skärmen', async () => {
    await montera();
    const forsta = text();
    for (const ord of ['timpeng', 'm³fub', 'G15', 'medelstam', 'kr/m³', 'volymvägd', 'Över timpeng']) {
      expect(forsta.toLowerCase()).not.toContain(ord.toLowerCase());
    }
  });

  it('en rad per skog, mest pengar först, ordet mer/mindre står', async () => {
    await montera();
    const rader = [...document.querySelectorAll('[data-rad="skog"]')].map(r => r.textContent!.replace(/ /g, ' '));
    expect(rader).toHaveLength(2);
    expect(rader[0]).toContain('Jeppshoka');
    expect(rader[0]).toContain('33 156 kr mer');
    expect(rader[1]).toContain('6 160 kr mindre');
  });

  it('Klass och Maskin visar samma summa överst', async () => {
    await montera();
    await tryck(knapp('Klass'));
    expect(document.querySelectorAll('[data-rad="klass"]').length).toBe(2);
    expect(text()).toContain('26 996 kr mer');
    await tryck(knapp('Maskin'));
    const m = [...document.querySelectorAll('[data-rad="maskin"]')].map(r => r.textContent!.replace(/ /g, ' '));
    expect(m.join('|')).toContain('Scorpion Giant');
    // Giant 21 000 − 3 000 = 18 000; Wisent 12 156 − 3 160 = 8 996; summa 26 996
    expect(m.join('|')).toContain('18 000 kr mer');
    expect(m.join('|')).toContain('8 996 kr mer');
    expect(text()).toContain('26 996 kr mer');
    expect(window.location.search).toBe('?vy=maskin');
  });

  it('?vy=klass (från gamla Per klass) öppnar Klass', async () => {
    window.history.replaceState(null, '', '/ekonomi/mot-ackord?vy=klass');
    await montera();
    expect(document.querySelectorAll('[data-rad="klass"]').length).toBe(2);
  });
});

describe('Ackord — arken', () => {
  it('tryck på en skog: maskinerna summerar till skogens tal, siffrorna bakom ett tryck', async () => {
    await montera();
    await tryck(document.querySelector('[data-rad="skog"]')!);
    const ark = document.querySelector('[role="dialog"]')!;
    const t = ark.textContent!.replace(/ /g, ' ');
    expect(t).toContain('Jeppshoka');
    expect(t).toContain('21 000 kr mer');
    expect(t).toContain('12 156 kr mer');
    expect(t).not.toContain('Skördad volym');
    const iArket = [...ark.querySelectorAll('button')].find(b => b.textContent!.includes('Visa alla siffror'))!;
    await tryck(iArket);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Skördad volym');
  });

  it('Inte med: väntande och ej jämförbara går att öppna med orsak', async () => {
    await montera();
    await tryck(knapp('Går inte att jämföra'));
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('2,5 h saknar timpris');
  });

  it('tom period: ärligt svar, inga rader', async () => {
    data = { ...data, rader: [], vantarNamn: [], ejJamforbara: [] };
    await montera();
    expect(text()).toContain('Inget att jämföra');
    expect(document.querySelectorAll('[data-rad]').length).toBe(0);
  });
});

describe('Ackord — varför', () => {
  const minusSkog = () => obj('b', 'Kvarnen', 0.3, [
    { ...del('GIANT', 'skördare', 30000, 20000, 20), pris: { volymAckord: 500, grundKrPerM3: 60, tillaggKrPerM3: 0, avstandKr: 0, undantagKr: 0 } },
    { ...del('WISENT', 'skotare', 24000, 40000, 40), pris: { volymAckord: 500, grundKrPerM3: 44, tillaggKrPerM3: 0, avstandKr: 2000, undantagKr: 0 } },
  ]);
  const medDetalj = (o: ObjektRad): ObjektRad => ({
    ...o,
    detalj: {
      voNummer: 'b', avraknad: '2026-11-13', stammar: 0, tillagg: [{ etikett: 'Krönt', belopp: 1.5, mottagare: 'skordare' }],
      avstand: { manuellM: 300, lassM: null, regel: { grundavstand_m: 200, kr_per_100m: 4 } },
      skotadManuell: false, terrangKr: 0, dieselBas: 19.5, massa3mKr: 10,
    },
  });
  const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

  beforeEach(() => {
    cyklerSvar = new Map();
    mattSvar = { tider: null, lass: null, flyttar: 0 };
    data = { ...data, rader: [data.rader[0], medDetalj(minusSkog())] };
  });

  it('listan: en grå orsaksrad bara på skogen som går minus', async () => {
    await montera();
    const rader = [...document.querySelectorAll('[data-rad="skog"]')].map(r => r.textContent!.replace(/\s/g, ' '));
    expect(rader[0]).not.toContain('under –');
    expect(rader[1]).toContain('Skotaren under – 13 m³/h, behöver 21');
  });

  it('talet överst i arket är talet i listan, för varje skog', async () => {
    await montera();
    // Listan är sorterad med mest pengar först — samma ordning som skogRader ger.
    const facit = skogRader(data.rader);
    for (let i = 0; i < facit.length; i++) {
      const rad = document.querySelectorAll('[data-rad="skog"]')[i];
      expect(rad.textContent!.replace(/\s/g, ' ')).toContain(krText(facit[i].kr).replace(/\s/g, ' '));
      await tryck(rad);
      await flush();
      expect(document.querySelector('[data-skog-kr]')!.textContent!.replace(/\s/g, ' ').trim()).toBe(krText(facit[i].kr).replace(/\s/g, ' '));
      await tryck([...document.querySelector('[role="dialog"]')!.querySelectorAll('button')].find(b => b.textContent === 'Klar')!);
    }
  });

  it('utan körspår: det körda avståndet och tiden per lass visas inte, och flytten som saknas sägs', async () => {
    await montera();
    await tryck(document.querySelectorAll('[data-rad="skog"]')[1]);
    await flush();
    const ark = document.querySelector('[role="dialog"]')!;
    const t = ark.textContent!.replace(/\s/g, ' ');
    expect(t).not.toContain('kört');
    expect(t).not.toContain('Per lass');
    expect(t).not.toContain('Snittlass');
    expect(t).toContain('Ingen flytt är registrerad hit');
    expect(t).toContain('Dieselklausulen är inte räknad');
    expect(ark.querySelector('[data-orange]')!.getAttribute('data-varfor')).toBe('takt:WISENT');
    expect(ark.querySelectorAll('[data-maskinkort]').length).toBe(2);
    expect(t).toContain('Gemensamt');
  });

  it('med körspår: avståndet blir den orange raden när det förklarar mest', async () => {
    // 700 m = 5 steg × 4 kr = 20 kr/m³ × 500 = 10 000 mot räknade 2 000: 8 000 av skotarens 16 000 … och resten 8 000.
    // 900 m = 7 steg = 14 000: 12 000 av minuset — mer än skotarens egna 4 000.
    cyklerSvar = new Map([['b', { lass: 30, medCykel: 30, volym: 500, volymMedCykel: 500, cykelM: 1800, enkelVagM: 900, hemMedLassM: null, vidAvlaggetM: null, ytterstM: null, utan: {} }]]);
    mattSvar = { tider: { lass: 30, lastaMin: 25, koraMin: 20, avlaggMin: 10 }, lass: { lass: 30, snittM3: 16.7, breddade: 0 }, flyttar: 1 };
    await montera();
    expect(document.querySelectorAll('[data-rad="skog"]')[1].textContent!.replace(/\s/g, ' ')).toContain('Skotningsavståndet – kört 900 m, räknat 300 m');
    await tryck(document.querySelectorAll('[data-rad="skog"]')[1]);
    await flush();
    const ark = document.querySelector('[role="dialog"]')!;
    expect(ark.querySelector('[data-orange]')!.getAttribute('data-varfor')).toBe('avstand');
    const t = ark.textContent!.replace(/\s/g, ' ');
    expect(t).toContain('Per lass: lastar ca 25 min · kör ca 20 min · avlägg ca 10 min');
    expect(t).toContain('Snittlass 16,7 m³ · kördes smal');
    expect(t).not.toContain('Ingen flytt är registrerad hit');
  });
});

describe('Ackord — bara admin', () => {
  it('sidan skickar bort alla som inte är admin innan något ritas', async () => {
    const { readFileSync } = await import('node:fs');
    const sida = readFileSync('app/ekonomi/mot-ackord/page.tsx', 'utf8');
    expect(sida).toMatch(/medarbetare\.roll !== "admin"\)\) \{\s*redirect\(/);
    expect(sida.indexOf('redirect("/arbetsrapport")')).toBeLessThan(sida.indexOf('<MotAckordClient'));
  });
});

describe('Ekonomins meny', () => {
  it('fem flikar, Ackord vald, Priser och Inställningar under Mer', async () => {
    await montera();
    const tabbar = [...document.querySelectorAll('[role="tablist"]')].find(t => t.textContent!.includes('Översikt'))!;
    const etikett = (b: Element) => b.lastElementChild!.textContent;
    const flikar = [...tabbar.querySelectorAll('[role="tab"]')].map(etikett);
    expect(flikar).toEqual(['Översikt', 'Ackord', 'Resultat', 'Faktura', 'Mer']);
    expect(etikett(tabbar.querySelector('[aria-selected="true"]')!)).toBe('Ackord');
    await tryck([...tabbar.querySelectorAll('[role="tab"]')].find(b => etikett(b) === 'Mer')!);
    const ark = document.querySelector('[role="dialog"][aria-label="Mer"]')!;
    expect(ark.querySelector('a[href="/ekonomi/prislista"]')).not.toBeNull();
    expect(ark.querySelector('a[href="/ekonomi/installningar"]')).not.toBeNull();
  });
});
