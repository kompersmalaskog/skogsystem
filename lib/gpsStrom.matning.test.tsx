// @vitest-environment jsdom
// MÄTNING av GPS-strömmen före och efter strypningen (lib/gpsStrypning), genom den RIKTIGA källan (lib/gpsKalla: serial-loopen, NMEA-tolken, hubben) och en
// React-komponent som gör som planeringssidan: ett nytt positionsobjekt i state för varje fix. Strömmen är en MODELL av en multi-GNSS-mottagare (Quectel via
// Eltima, "GPS-källa" i CLAUDE.md): per sekund GGA + RMC + VTG + GLL, fyra GSA och åtta GSV = 16 giltiga rader. Ingen rå ström från Wisent finns att tillgå
// från bygget — siffrorna här visar mekanismen; Wisent-siffrorna mäts i appen (Inställningar › GPS-källa › Mät GPS-strömmen).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Profiler, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { perSekund } from './gpsStrom';

const rad = (kropp: string) => { let cs = 0; for (let i = 0; i < kropp.length; i++) cs ^= kropp.charCodeAt(i); return '$' + kropp + '*' + cs.toString(16).toUpperCase().padStart(2, '0'); };
const sekund = (tidMs: number, steg: number) => {
  const d = new Date(tidMs); const p = (n: number) => String(n).padStart(2, '0');
  const t = `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.00`;
  const dat = `${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${p(d.getUTCFullYear() % 100)}`;
  const lat = (5621.387889 + steg * 0.0003).toFixed(6);
  const rader = [
    `GNGGA,${t},${lat},N,01502.992016,E,1,09,0.7,102.6,M,36.0,M,,`,
    `GNRMC,${t},A,${lat},N,01502.992016,E,0.4,72.9,${dat},1.7,E,A,V`,
    `GNVTG,72.9,T,71.2,M,0.4,N,0.7,K,A`,
    `GNGLL,${lat},N,01502.992016,E,${t},A,A`,
    ...['GP', 'GL', 'GA', 'PQ'].map((x) => `${x}GSA,A,3,04,05,09,12,,,,,,,,,1.3,0.7,1.1`),
    ...['GP', 'GP', 'GP', 'GL', 'GL', 'GA', 'GA', 'PQ'].map((x, i) => `${x}GSV,3,${(i % 3) + 1},10,04,43,170,31,05,14,060,29,09,50,310,33,12,22,201,27`),
  ];
  return rader.map(rad).join('\r\n') + '\r\n';
};
const RADER_PER_SEKUND = 16;

function kontrollerbarPort() {
  const koa: string[] = []; let vantar: ((r: { value?: Uint8Array; done: boolean }) => void) | null = null; let avbruten = false;
  const port = { open: async () => {}, close: async () => {}, readable: { getReader: () => ({
    read: () => new Promise<{ value?: Uint8Array; done: boolean }>((res) => {
      if (avbruten) return res({ done: true });
      const nasta = koa.shift(); if (nasta != null) return res({ value: new TextEncoder().encode(nasta), done: false });
      vantar = res;
    }),
    cancel: async () => { avbruten = true; vantar?.({ done: true }); },
    releaseLock() {},
  }) } };
  const skicka = (t: string) => { if (vantar) { const v = vantar; vantar = null; v({ value: new TextEncoder().encode(t), done: false }); } else koa.push(t); };
  return { port, skicka };
}

const SEKUNDER = 30;
/** `styckad`: varje mening kommer som egen läsning i egen uppgift (som en port som levererar små bitar); annars en hel sekund i ett svep. */
async function kor(strypning: boolean, styckad: boolean) {
  vi.resetModules();
  const g = await import('./gpsKalla');
  const s = await import('./gpsStrom');
  s.sattStrypning(strypning);
  const { port, skicka } = kontrollerbarPort();
  vi.stubGlobal('navigator', { serial: { getPorts: async () => [port] } });
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'gps-serial-vald' ? '1' : null), setItem() {}, removeItem() {} });
  let renderingar = 0; let positioner = 0;
  function Sida() {
    const [, setPos] = useState<{ lat: number; lon: number } | null>(null);
    useEffect(() => { const h = g.startaGpsKalla((fix) => { if (fix.giltig && fix.lat != null && fix.lng != null) { positioner++; setPos({ lat: fix.lat, lon: fix.lng }); } }); return () => h.stop(); }, []);
    return null;
  }
  const div = document.createElement('div'); const root = createRoot(div);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => { root.render(<Profiler id="s" onRender={() => { renderingar++; }}><Sida /></Profiler>); });
  await vi.waitFor(() => expect(true).toBe(true));
  await act(async () => { await Promise.resolve(); });
  s.stromNollstall(); renderingar = 0; positioner = 0;
  const tick = () => new Promise<void>((res) => setTimeout(res, 0));
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;   // riktig batchning: React slår ihop uppdateringar som sker i samma uppgift, inte mellan uppgifter
  for (let i = 0; i < SEKUNDER; i++) {
    vi.setSystemTime(new Date('2026-10-22T08:00:00Z').getTime() + i * 1000);
    const text = sekund(Date.now() - 300, i);
    if (styckad) { for (const mening of text.split('\r\n').filter(Boolean)) { skicka(mening + '\r\n'); await tick(); await tick(); } }
    else { skicka(text); await tick(); await tick(); }
  }
  await tick(); await tick();
  const r = s.stromLas();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => { root.unmount(); });
  s.sattStrypning(true);
  return { ...perSekund({ ...r, positioner, renderingar }, SEKUNDER * 1000), radrPerSek: RADER_PER_SEKUND };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('GPS-strömmen före och efter strypningen (modell av en multi-GNSS-ström, riktig källa)', () => {
  it('utan strypning: varje giltig rad blir en fix; med strypning: en per sekund — och omrenderingarna följer', async () => {
    const foreStyckad = await kor(false, true);
    const efterStyckad = await kor(true, true);
    const foreSvep = await kor(false, false);
    const efterSvep = await kor(true, false);
    // eslint-disable-next-line no-console
    console.log('GPS-STRÖM (30 s, 16 rader/s)', JSON.stringify({ foreStyckad, efterStyckad, foreSvep, efterSvep }));
    for (const f of [foreStyckad, foreSvep]) { expect(f.rader).toBeGreaterThanOrEqual(RADER_PER_SEKUND - 1); expect(f.fixar).toBeGreaterThanOrEqual(RADER_PER_SEKUND - 1); expect(f.positioner).toBeGreaterThanOrEqual(RADER_PER_SEKUND - 1); }
    for (const e of [efterStyckad, efterSvep]) { expect(e.rader).toBeGreaterThanOrEqual(RADER_PER_SEKUND - 1); expect(e.fixar).toBeLessThanOrEqual(1.1); expect(e.positioner).toBeLessThanOrEqual(1.1); expect(e.renderingar).toBeLessThanOrEqual(1.1); }
    expect(foreStyckad.renderingar).toBeGreaterThanOrEqual(RADER_PER_SEKUND - 1);
  });
});
