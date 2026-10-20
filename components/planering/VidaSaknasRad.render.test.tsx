// @vitest-environment jsdom
// Hämtfel på Vidas lager → raden syns (och är ett fel, inte "ingen geometri"); lyckad hämtning → raden borta. Samma kedja som sidan: lasVidaLager +
// useVidaLagerFel + VidaSaknasRad, med fejkad hämtning och fejkad klocka.
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VidaSaknasRad } from './VidaSaknasRad';
import { arVidaVo, lasVidaLager } from '@/lib/larm/vidaLager';
import { VIDA_FORSOK_MS, useVidaLagerFel } from '@/lib/hooks/useVidaLagerFel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let ruta: HTMLElement | null = null;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; vi.useRealTimers(); });

type Svar = { data: any; error: any };
function Provkorning({ objektId, hamta, vo = '11166440', forny }: { objektId: string; hamta: () => Promise<Svar>; vo?: string; forny?: () => Promise<unknown> }) {
  const vida = useVidaLagerFel(objektId);
  useEffect(() => {
    let avbruten = false;
    void lasVidaLager(hamta, { forvantas: arVidaVo(vo), forny }).then((s) => { if (!avbruten) vida.rapportera(s.status); });
    return () => { avbruten = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objektId, vida.forsok]);
  return vida.fel ? <VidaSaknasRad top="0px" /> : <div data-testid="inget" />;
}
const montera = async (el: React.ReactElement) => { ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta); await act(async () => { rot!.render(el); }); };
const rad = () => ruta!.querySelector('[data-testid="vida-saknas-rad"]');
const GEO = { data: { geometri: { features: [{ id: 1 }] } }, error: null };

describe('"Vidas lager saknas" — rad vid hämtfel', () => {
  it('hämtfel → raden syns med texten; sedan lyckad hämtning → raden borta', async () => {
    const hamta = vi.fn<() => Promise<Svar>>()
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
      .mockResolvedValue(GEO);
    await montera(<Provkorning objektId="o1" hamta={hamta} />);
    expect(rad()).not.toBeNull();
    expect(rad()!.textContent).toBe('Vidas lager saknas – kraftledning och hänsyn larmar inte');
    expect(rad()!.getAttribute('role')).toBe('status');
    await act(async () => { await vi.advanceTimersByTimeAsync(VIDA_FORSOK_MS); });
    expect(hamta).toHaveBeenCalledTimes(2);
    expect(rad()).toBeNull();
  });
  it('hämtfel som består: raden står kvar och ett nytt försök görs var 15:e sekund', async () => {
    const hamta = vi.fn<() => Promise<Svar>>().mockResolvedValue({ data: null, error: { message: 'timeout' } });
    await montera(<Provkorning objektId="o1" hamta={hamta} />);
    for (let i = 0; i < 3; i++) await act(async () => { await vi.advanceTimersByTimeAsync(VIDA_FORSOK_MS); });
    expect(hamta).toHaveBeenCalledTimes(4);
    expect(rad()).not.toBeNull();
  });
  it('ett P-VO-jobb utan geometri (svar utan fel) är "saknas" på riktigt: ingen rad', async () => {
    await montera(<Provkorning objektId="o1" vo="P-1018" hamta={async () => ({ data: null, error: null })} />);
    expect(rad()).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(VIDA_FORSOK_MS * 3); });
    expect(rad()).toBeNull();
  });
  it('lyckad hämtning från början: ingen rad, och inga fler försök', async () => {
    const hamta = vi.fn<() => Promise<Svar>>().mockResolvedValue(GEO);
    await montera(<Provkorning objektId="o1" hamta={hamta} />);
    expect(rad()).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(VIDA_FORSOK_MS * 3); });
    expect(hamta).toHaveBeenCalledTimes(1);
  });
  it('nätet kommer tillbaka: nytt försök direkt, utan att vänta på timern', async () => {
    const hamta = vi.fn<() => Promise<Svar>>().mockResolvedValueOnce({ data: null, error: { message: 'offline' } }).mockResolvedValue(GEO);
    await montera(<Provkorning objektId="o1" hamta={hamta} />);
    expect(rad()).not.toBeNull();
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(hamta).toHaveBeenCalledTimes(2);
    expect(rad()).toBeNull();
  });
  it('byte av objekt släpper felet för förra trakten', async () => {
    const hamta = vi.fn<() => Promise<Svar>>().mockResolvedValueOnce({ data: null, error: { message: 'x' } }).mockResolvedValue(GEO);
    await montera(<Provkorning objektId="o1" hamta={hamta} />);
    expect(rad()).not.toBeNull();
    await act(async () => { rot!.render(<Provkorning objektId="o2" hamta={hamta} />); });
    expect(rad()).toBeNull();
  });
});

describe('tomt svar utan fel: Vida-trakt vs P-VO', () => {
  const TOMT = async (): Promise<Svar> => ({ data: null, error: null });
  it('numeriskt vo + tomt svar → raden syns (och består, med nytt försök)', async () => {
    const hamta = vi.fn(TOMT);
    await montera(<Provkorning objektId="o1" vo="11166440" hamta={hamta} />);
    expect(rad()).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(VIDA_FORSOK_MS); });
    expect(hamta.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(rad()).not.toBeNull();
  });
  it('P-VO + tomt svar → ingen rad (tomt = saknas på riktigt)', async () => {
    const hamta = vi.fn(TOMT);
    await montera(<Provkorning objektId="o1" vo="P-1018" hamta={hamta} />);
    expect(rad()).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(VIDA_FORSOK_MS * 3); });
    expect(rad()).toBeNull();
    expect(hamta).toHaveBeenCalledTimes(1);
  });
  it('numeriskt vo, utgången session: tomt → förnyas → geometri kommer → raden syns aldrig', async () => {
    const hamta = vi.fn<() => Promise<Svar>>().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValue(GEO);
    const forny = vi.fn().mockResolvedValue({});
    await montera(<Provkorning objektId="o1" vo="11166440" hamta={hamta} forny={forny} />);
    expect(forny).toHaveBeenCalledTimes(1);
    expect(rad()).toBeNull();
  });
});

describe('sidan: kopplingen (källvakt)', () => {
  const sida = readFileSync(join(process.cwd(), 'app/planering/page.tsx'), 'utf8');
  it('hämtningen går genom lasVidaLager och fel rapporteras — det gamla "error || !fc" som slog ihop fel och saknas är borta', () => {
    expect(sida).toContain('lasVidaLager(');
    expect(sida).toContain('vidaFel.rapportera(svar.status)');
    expect(sida).not.toMatch(/if \(error \|\| !fc \|\|/);
    expect(sida).toContain('vidaFel.forsok');   // nytt försök är ett beroende för hämtningen
    expect(sida).toContain('forvantas: arVidaVo((valtObjekt as any).vo_nummer)');   // Vida-trakt: tomt = fel; P-VO: tomt = saknas
    expect(sida).toContain('forny: fornyaSessionVida');
    expect(sida).toContain('skapaFornyare(() => supabase.auth.refreshSession())');
  });
  it('raden visas i körvyn och skotarläget (korvyActive), och larmkortet flyttas under den', () => {
    expect(sida).toMatch(/\{korvyActive && vidaFel\.fel && \(\s*<VidaSaknasRad/);
    expect(sida).toContain('vidaFel.fel ? VIDA_RAD_HOJD_PX');
  });
});
