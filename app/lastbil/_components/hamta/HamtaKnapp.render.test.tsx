// @vitest-environment jsdom
// "Fortsätt hämta X": databasen styr (förarens öppna flytt, Lassat inom 12 h), utkastet på enheten visar bara rätt steg, läsfel och
// äldre än 12 h ger den vanliga knappen, och knappen öppnar aldrig flödet av sig själv.

import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nyFakeDb, type FakeDb } from './fakeSupabase';
import { KLOCKA, scenario } from './hamtaScenario';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mock = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/supabase', async () => {
  const { fakeSupabase, nyFakeDb } = await import('./fakeSupabase');
  mock.db = nyFakeDb();
  return { supabase: fakeSupabase(mock.db) };
});

import HamtaKnapp from './HamtaKnapp';
import { UTKAST_NYCKEL, nyttUtkast, sparaUtkast, type Utkast } from './flode';
import { designCss } from '@/lib/design/tokens';

const db = (): FakeDb => mock.db;
let rot: ReturnType<typeof createRoot> | null = null;
let start: number;

const vanta = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const sel = (s: string) => document.querySelector(s) as HTMLElement | null;
const knapp = () => sel('[data-hamta-start]')!.textContent;
const rad = () => sel('[data-hamta-pagar]')?.textContent ?? null;

const OPPEN = { id: 'f-oppen', maskin_id: 'PONS20SDJAA270231', extern_maskin: null, kund: null, medarbetare_id: 'm-1', starttid: '2026-10-19T09:50:00Z', hamtad_tid: '2026-10-19T10:10:00Z', sluttid: null, avbruten: false };
const utkast = (o: Partial<Utkast> = {}): Utkast => ({ ...nyttUtkast('2026-10-19T09:40:00Z'), maskinId: 'PONS20SDJAA270231', ...o });

async function montera(forareId: string | null = 'm-1') {
  rot = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => { rot!.render(<div><style>{designCss}</style><HamtaKnapp forareId={forareId} aktiv onStart={() => { start++; }} /></div>); });
  await vanta(10);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(KLOCKA));
  const d = db();
  d.tabeller = scenario(); d.skrivningar = []; d.lasfel = new Set(); d.skrivfel = new Set(); d.rpc = []; d.nastaId = 1;
  start = 0;
  try { localStorage.clear(); } catch { /* */ }
});
afterEach(async () => {
  if (rot) await act(async () => { rot!.unmount(); });
  rot = null; document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('Fortsätt hämta X', () => {
  it('utkast finns + öppen flytt: "Fortsätt hämta Giant", steget ur utkastet', async () => {
    db().tabeller.maskin_flytt = [{ ...OPPEN }];
    sparaUtkast(utkast({ steg: 'dest', flyttId: 'f-oppen', lassatTid: OPPEN.hamtad_tid, dest: { namn: 'Vällust RP', lat: 56.47, lng: 14.87, objektId: 'obj-vallust', platsId: null, kalla: 'objekt', verkstad: false } }));
    await montera();
    expect(knapp()).toBe('Fortsätt hämta Giant');
    expect(rad()).toBe('Lassat 12:10 · På väg till Vällust RP');
    expect(sel('[data-hamta-start]')!.getAttribute('style')).toMatch(/background: (rgb\(255, 255, 255\)|#fff)/);   // fortfarande sidans EN primärknapp
  });

  it('bara databasen (inget utkast): "Fortsätt hämta Giant · Lassat 12:10 · Vart ska den?"', async () => {
    db().tabeller.maskin_flytt = [{ ...OPPEN }];
    await montera();
    expect(knapp()).toBe('Fortsätt hämta Giant');
    expect(rad()).toBe('Lassat 12:10 · Vart ska den?');
  });

  it('en annan förares öppna flytt räknas inte', async () => {
    db().tabeller.maskin_flytt = [{ ...OPPEN, medarbetare_id: 'm-9' }];
    await montera();
    expect(knapp()).toBe('Hämta en maskin');
  });

  it('en avbruten eller avslutad flytt räknas inte', async () => {
    db().tabeller.maskin_flytt = [{ ...OPPEN, avbruten: true }, { ...OPPEN, id: 'f-klar', sluttid: '2026-10-19T10:20:00Z' }];
    await montera();
    expect(knapp()).toBe('Hämta en maskin');
    expect(rad()).toBeNull();
  });

  it('varken flytt eller utkast: den vanliga knappen, ingen rad', async () => {
    await montera();
    expect(knapp()).toBe('Hämta en maskin');
    expect(rad()).toBeNull();
  });

  it('äldre än 12 h: den vanliga knappen — den gamla öppna flytten visas inte som pågående', async () => {
    db().tabeller.maskin_flytt = [{ ...OPPEN, starttid: '2026-10-18T20:00:00Z', hamtad_tid: '2026-10-18T20:10:00Z' }];     // 14 h sedan
    sparaUtkast(utkast({ steg: 'kor', flyttId: 'f-oppen' }), Date.parse(KLOCKA) - 13 * 3600 * 1000);                         // utkastet också >12 h
    await montera();
    expect(knapp()).toBe('Hämta en maskin');
    expect(rad()).toBeNull();
  });

  it('läsfel (flytten eller maskinnamnen): den vanliga knappen, aldrig en gissning', async () => {
    db().tabeller.maskin_flytt = [{ ...OPPEN }];
    db().lasfel = new Set(['maskin_flytt']);
    await montera();
    expect(knapp()).toBe('Hämta en maskin');
    expect(rad()).toBeNull();
    await act(async () => { rot!.unmount(); }); rot = null; document.body.innerHTML = '';
    db().lasfel = new Set(['dim_maskin']);
    await montera();
    expect(knapp()).toBe('Hämta en maskin');
  });

  it('utan öppen flytt men med utkast i Vart ska X? / Vägen hem (yngre än 12 h): "Fortsätt …" ur utkastet', async () => {
    sparaUtkast(utkast({ steg: 'dest', lossad: { tid: '2026-10-19T10:15:00Z', namn: 'Vällust RP' } }));
    await montera();
    expect(knapp()).toBe('Fortsätt hämta Giant');
    expect(rad()).toBe('Lossad på Vällust RP · Vägen hem');
  });

  it('utkast i maskinvalet eller i Hämtar X utan öppen flytt räknas inte', async () => {
    sparaUtkast(utkast({ steg: 'kor' }));
    await montera();
    expect(knapp()).toBe('Hämta en maskin');
  });

  it('knappen öppnar aldrig flödet av sig själv och skriver ingenting; ett tryck startar det EN gång', async () => {
    db().tabeller.maskin_flytt = [{ ...OPPEN }];
    await montera();
    expect(start).toBe(0);
    expect(db().skrivningar).toHaveLength(0);
    await act(async () => { sel('[data-hamta-start]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(start).toBe(1);
  });

  it('databasens flytt hör inte till utkastet: utkastet rensas vid tryck så flödet tar upp flytten', async () => {
    db().tabeller.maskin_flytt = [{ ...OPPEN }];
    sparaUtkast(utkast({ steg: 'hem', flyttId: 'f-annan' }));
    await montera();
    expect(rad()).toBe('Lassat 12:10 · Vart ska den?');
    await act(async () => { sel('[data-hamta-start]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(localStorage.getItem(UTKAST_NYCKEL)).toBeNull();
  });

  it('utkastet som hör till flytten behålls vid tryck (flödet visar rätt steg)', async () => {
    db().tabeller.maskin_flytt = [{ ...OPPEN }];
    sparaUtkast(utkast({ steg: 'dest', flyttId: 'f-oppen' }));
    await montera();
    await act(async () => { sel('[data-hamta-start]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(localStorage.getItem(UTKAST_NYCKEL)).not.toBeNull();
  });
});
