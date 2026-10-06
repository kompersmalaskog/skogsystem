// @vitest-environment jsdom
// Förarlistans fem frågor (inkl. ofiltrerad objekt_geometri) får köras EN gång per mount — även när föräldern
// skickar ett NYTT forareFilter-objekt vid varje rendering (planeringssidan ritas om i takt med GPS/timers).
// Regression: dep på objektet körde om effekten ~2 ggr/s (2026-10-06, 18 738 anrop från en maskindator).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act, useState } from 'react';

const anrop: { tabell: string; signal: AbortSignal | undefined }[] = [];

// Tunn query-builder: tråd-bar (await) + de metoder komponenten kedjar. Svarar tomt.
function bygg(tabell: string) {
  const post = { tabell, signal: undefined as AbortSignal | undefined };
  anrop.push(post);
  const b: any = {
    select: () => b, order: () => b, gte: () => b, is: () => b,
    abortSignal: (s: AbortSignal) => { post.signal = s; return b; },
    then: (ok: (v: any) => any, fel?: (e: any) => any) =>
      Promise.resolve({ data: [], error: null }).then(ok, fel),
  };
  return b;
}
vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => bygg(t) } }));
vi.mock('@/lib/gpsKalla', () => ({ hamtaEnGpsFix: () => new Promise(() => {}) }));

import ObjektValjare from './ObjektValjare';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const antal = (t: string) => anrop.filter((a) => a.tabell === t).length;

let tryck: () => void = () => {};
function Foralder({ id }: { id: string }) {
  const [, setN] = useState(0);
  tryck = () => setN((n) => n + 1);
  // Nytt objekt vid VARJE rendering — precis som planering/page.tsx.
  return <ObjektValjare onSelectObjekt={() => {}} onNavigera={() => {}} forareFilter={{ medarbetareId: id }} />;
}

async function montera(id: string) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  await act(async () => { root.render(<Foralder id={id} />); });
  return { root };
}

beforeEach(() => { anrop.length = 0; });

describe('ObjektValjare — förarlistans hämtning', () => {
  it('EN hämtning trots nytt forareFilter-objekt vid varje rendering', async () => {
    await montera('m1');
    expect(antal('objekt_geometri')).toBe(1);
    for (let i = 0; i < 10; i++) await act(async () => { tryck(); });
    expect(antal('objekt_geometri')).toBe(1);
    for (const t of ['dim_maskin', 'medarbetare', 'hyttspar', 'fakt_lass']) expect(antal(t)).toBe(1);
  });

  it('ändrat medarbetareId hämtar om, och den gamla hämtningen avbryts', async () => {
    const { root } = await montera('m1');
    const forsta = anrop.filter((a) => a.tabell === 'objekt_geometri')[0];
    expect(forsta.signal?.aborted).toBe(false);
    await act(async () => { root.render(<Foralder id="m2" />); });
    expect(antal('objekt_geometri')).toBe(2);
    expect(forsta.signal?.aborted).toBe(true);
  });

  it('avmontering avbryter pågående hämtning', async () => {
    const { root } = await montera('m1');
    const sig = anrop.filter((a) => a.tabell === 'objekt_geometri').map((a) => a.signal);
    expect(sig[0]?.aborted).toBe(false);
    await act(async () => { root.unmount(); });
    expect(sig[0]?.aborted).toBe(true);
  });
});
