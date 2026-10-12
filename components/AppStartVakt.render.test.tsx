// @vitest-environment jsdom
/**
 * RENDERINGSKONTROLL för startvakten (components/AppStartVakt): monterar den på riktigt i jsdom med fejkad router och fejkad
 * dim_maskin, och kör varje väg in i appen som en maskindator/telefon:
 *   maskin vald → /planering · serial utan maskin → frågan · ingen serial → ingenting (menyn) · ?meny=1 · /oversikt bara
 *   vid app-START · läsfel → text + knappar (aldrig svart) · omdirigeringen som aldrig sker → felskärm på 8 s.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockPath = '/';
const replace = vi.fn();
let dimResultat: { data: any; error: any } = { data: [], error: null };
let dimVantar: Promise<{ data: any; error: any }> | null = null;   // ett löfte som ännu inte landat (registret laddar)

vi.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ replace }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => dimVantar ?? Promise.resolve(dimResultat) }) },
}));

import AppStartVakt from './AppStartVakt';

// Riktiga rader ur dim_maskin (prod 2026-10-05)
const REGISTER = [
  { maskin_id: 'A030353', visningsnamn: 'Wisent', modell: 'Wisent2015', maskin_typ: 'Forwarder', aktiv_till: null },
  { maskin_id: 'A110148', visningsnamn: 'Elefant AF', modell: 'Elephant King AF', maskin_typ: 'Forwarder', aktiv_till: '2026-07-08' },
  { maskin_id: 'A130743', visningsnamn: 'Elefant 26', modell: 'Elephant King 2026', maskin_typ: 'Forwarder', aktiv_till: null },
  { maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Giant', modell: 'PONSSE Scorpion Giant 8W', maskin_typ: 'Harvester', aktiv_till: null },
];

let container: HTMLDivElement;
let root: Root;

async function montera() {
  await act(async () => { root.render(<AppStartVakt />); });
  await flush();   // låt registerhämtningen/getPorts landa
}
// Töm mikrokön ordentligt (getPorts → then → avgor, och supabase-löftet → setState tar flera varv).
async function flush() { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); }
const finns = (testid: string) => !!container.querySelector(`[data-testid="${testid}"]`);
const sattUrl = (s: string) => window.history.replaceState({}, '', s);

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  mockPath = '/'; replace.mockClear();
  dimResultat = { data: REGISTER, error: null };
  dimVantar = null;
  delete (navigator as any).serial;
  sattUrl('/');
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

describe('startsidan "/"', () => {
  it('MASKIN VALD → /planering (omdirigerar), ritar svart täckskikt i väntan — aldrig appens meny', async () => {
    localStorage.setItem('enhet_maskin_id', 'A130743');
    await montera();
    expect(replace).toHaveBeenCalledWith('/planering');
    expect(finns('svart-innehall')).toBe(true);        // StartSvartSkarm (gran syns efter 1 s utan JS)
    expect(finns('vilken-maskin')).toBe(false);
  });

  it('maskin vald men serial-flaggan borta → fortfarande /planering (enheten ÄR en maskindator)', async () => {
    localStorage.setItem('enhet_maskin_id', 'A130743');
    await montera();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('SERIAL UTAN MASKIN → helskärmsfrågan med aktiva maskiner som stora knappar (Elefant AF, avförd, saknas)', async () => {
    localStorage.setItem('gps-serial-vald', '1');
    await montera();
    expect(replace).not.toHaveBeenCalled();
    expect(finns('vilken-maskin')).toBe(true);
    expect(container.textContent).toContain('Vilken maskin är det här?');
    expect(finns('maskinval-A130743')).toBe(true);
    expect(finns('maskinval-PONS20SDJAA270231')).toBe(true);
    expect(finns('maskinval-A030353')).toBe(true);
    expect(finns('maskinval-A110148')).toBe(false);
    expect(container.querySelector('[data-testid="maskinval-A130743"]')!.textContent).toContain('Elefant 26');
    expect(container.querySelector('[data-testid="maskinval-A130743"]')!.textContent).toContain('Skotare');
    expect(container.querySelector('[data-testid="maskinval-PONS20SDJAA270231"]')!.textContent).toContain('Skördare');
  });

  it('tryck på en maskin → valet SPARAS (enhet_maskin_id) och appen går till /planering; frågan kommer inte tillbaka', async () => {
    localStorage.setItem('gps-serial-vald', '1');
    await montera();
    await act(async () => { (container.querySelector('[data-testid="maskinval-A130743"]') as HTMLButtonElement).click(); });
    expect(localStorage.getItem('enhet_maskin_id')).toBe('A130743');
    expect(replace).toHaveBeenCalledWith('/planering');
    // nästa start: maskin vald → ingen fråga, direkt /planering
    act(() => root.unmount()); root = createRoot(container); replace.mockClear();
    await montera();
    expect(finns('vilken-maskin')).toBe(false);
    expect(replace).toHaveBeenCalledWith('/planering');
  });

  it('SPARAD GPS-PORT (flaggan borta men webbläsaren har beviljat en port) → frågan', async () => {
    (navigator as any).serial = { getPorts: async () => [{}] };
    await montera();
    expect(finns('vilken-maskin')).toBe(true);
  });

  it('INGEN SERIAL (telefon, vanlig dator) → ingenting ritas: appens meny, som idag', async () => {
    await montera();
    expect(container.innerHTML).toBe('');
    expect(replace).not.toHaveBeenCalled();
  });

  it('Web Serial finns men ingen port beviljad och ingen maskin → ingenting (meny)', async () => {
    (navigator as any).serial = { getPorts: async () => [] };
    await montera();
    expect(container.innerHTML).toBe('');
    expect(replace).not.toHaveBeenCalled();
  });

  it('?meny=1 ("Till appen") → ingen omdirigering ens med maskin vald, och det gäller resten av sessionen', async () => {
    localStorage.setItem('enhet_maskin_id', 'A130743');
    sattUrl('/?meny=1');
    await montera();
    expect(replace).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
    // senare besök på "/" utan parametern i samma session studsar inte heller
    act(() => root.unmount()); root = createRoot(container); sattUrl('/');
    await montera();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('frågan är aldrig en återvändsgränd', () => {
  it('"Till appen" stänger frågan, sätter sessionsflaggor och nästa besök frågar inte igen i sessionen', async () => {
    localStorage.setItem('gps-serial-vald', '1');
    await montera();
    await act(async () => { (container.querySelector('[data-testid="maskinfraga-till-appen"]') as HTMLButtonElement).click(); });
    expect(finns('vilken-maskin')).toBe(false);
    expect(sessionStorage.getItem('maskin_fraga_hoppad_v1')).toBe('1');
    expect(localStorage.getItem('enhet_maskin_id')).toBeNull();      // inget val sparades
    act(() => root.unmount()); root = createRoot(container);
    await montera();
    expect(finns('vilken-maskin')).toBe(false);
  });

  it('dim_maskin gick inte att läsa → TEXT + Försök igen + Till appen (inte svart, inte "inga maskiner")', async () => {
    dimResultat = { data: null, error: { message: 'nät' } };
    localStorage.setItem('gps-serial-vald', '1');
    await montera();
    expect(finns('vilken-maskin')).toBe(true);
    expect(container.textContent).toContain('Maskinerna gick inte att hämta');
    expect(container.textContent).toContain('Försök igen');
    expect(finns('maskinfraga-till-appen')).toBe(true);
    expect(container.textContent).not.toContain('Inga aktiva maskiner');
  });

  it('"Försök igen" hämtar om och visar maskinerna när nätet är tillbaka', async () => {
    dimResultat = { data: null, error: { message: 'nät' } };
    localStorage.setItem('gps-serial-vald', '1');
    await montera();
    dimResultat = { data: REGISTER, error: null };
    const knapp = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Försök igen') as HTMLButtonElement;
    await act(async () => { knapp.click(); });
    await flush();
    expect(finns('maskinval-A130743')).toBe(true);
  });

  it('tomt register → säger att inga aktiva maskiner finns (och Till appen)', async () => {
    dimResultat = { data: [], error: null };
    localStorage.setItem('gps-serial-vald', '1');
    await montera();
    expect(container.textContent).toContain('Inga aktiva maskiner');
    expect(finns('maskinfraga-till-appen')).toBe(true);
  });

  it('laddar registret: TEXT från första stund ("Hämtar maskiner…"), inte svart — och maskinerna dyker upp när det landar', async () => {
    let landa: (v: any) => void = () => {};
    dimVantar = new Promise((res) => { landa = res; });
    localStorage.setItem('gps-serial-vald', '1');
    await montera();
    expect(finns('vilken-maskin')).toBe(true);
    expect(container.textContent).toContain('Hämtar maskiner…');
    expect(finns('maskinval-A130743')).toBe(false);
    await act(async () => { landa({ data: REGISTER, error: null }); await Promise.resolve(); });
    expect(container.textContent).not.toContain('Hämtar maskiner…');
    expect(finns('maskinval-A130743')).toBe(true);
  });
});

describe('/oversikt (PWA:ns start_url)', () => {
  it('app-START på /oversikt med maskin vald → /planering (annars slår punkt 1 aldrig till för en installerad app)', async () => {
    localStorage.setItem('enhet_maskin_id', 'A130743');
    mockPath = '/oversikt';
    await montera();
    expect(replace).toHaveBeenCalledWith('/planering');
  });

  it('NAVIGERAR någon till /oversikt mitt i en session får hen översikten (ingen studs)', async () => {
    localStorage.setItem('enhet_maskin_id', 'A130743');
    mockPath = '/arbetsrapport';
    await montera();                                    // första bedömningen: ingen start-sida → inget
    expect(replace).not.toHaveBeenCalled();
    mockPath = '/oversikt';
    await act(async () => { root.render(<AppStartVakt />); });
    expect(replace).not.toHaveBeenCalled();
  });

  it('en OMLADDNING av /oversikt i samma session är ingen app-start', async () => {
    localStorage.setItem('enhet_maskin_id', 'A130743');
    sessionStorage.setItem('app_start_sett_v1', '1');
    mockPath = '/oversikt';
    await montera();
    expect(replace).not.toHaveBeenCalled();
  });

  it('andra sidor rörs aldrig, inte ens med maskin vald', async () => {
    localStorage.setItem('enhet_maskin_id', 'A130743');
    for (const p of ['/planering', '/maskin', '/arbetsrapport']) {
      act(() => root.unmount()); root = createRoot(container); sessionStorage.clear(); mockPath = p;
      await montera();
      expect(replace).not.toHaveBeenCalled();
      expect(container.innerHTML).toBe('');
    }
  });
});

describe('omdirigeringen som aldrig sker', () => {
  it('efter 8 s utan att /planering tar över: FELSKÄRM med text och knappar (aldrig svart för evigt)', async () => {
    vi.useFakeTimers();
    localStorage.setItem('enhet_maskin_id', 'A130743');
    await montera();
    expect(finns('svart-innehall')).toBe(true);
    expect(finns('maskin-fel')).toBe(false);
    await act(async () => { vi.advanceTimersByTime(9000); });
    expect(finns('maskin-fel')).toBe(true);
    expect(container.textContent).toContain('Det gick inte att öppna maskinläget');
    expect(container.textContent).toContain('Försök igen');
    expect(container.textContent).toContain('Till appen');
  });
});
