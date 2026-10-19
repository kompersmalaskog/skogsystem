// @vitest-environment jsdom
// Skotarens lassrapportering (lib/hooks/useSkotarLass) i React med simulerade GPS-fixar och klocka. Samma hook som sidan kör; kön är den riktiga
// (lib/skotarLass/ko) över ett minneslager, servern är en låtsas som kan vara otillgänglig.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const server = vi.hoisted(() => ({ online: true, skickade: [] as any[] }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/objektNummer', () => ({ hamtaAltNummer: async () => [], hogarObjektIds: (vo: string) => [vo] }));
vi.mock('@/lib/skotarLass/koKopplad', async () => {
  const ko = await import('@/lib/skotarLass/ko');
  const lyssnare = new Set<() => void>();
  const ny = () => ko.skapaLassKo({
    lager: ko.skapaMinnesKoLager(),
    paForandring: () => lyssnare.forEach((f) => f()),
    skickaLass: async (l) => { if (!server.online) return false; server.skickade.push(l); return true; },
    skickaAvslut: async () => server.online,
  });
  let k = ny();
  return {
    aterstallKo: () => { k = ny(); },
    hamtaLassKo: async () => k,
    prenumereraLassKo: (f: () => void) => { lyssnare.add(f); return () => lyssnare.delete(f); },
    sparaLass: async (l: any) => { await k.spara(l); void k.kor(); },
    begarFardigskotad: async (o: string) => { await k.begarAvslut(o, new Date().toISOString()); void k.kor(); },
    lasLassForObjekt: async (o: string) => ({ lass: await k.lassForObjekt(o), fran: 'lokalt' as const }),
    lasAvslut: async () => null,
    lasSkordat: async () => [{ nyckel: 'tall', namn: 'Tall', m3: 100 }, { nyckel: 'massa', namn: 'Massa', m3: 50 }],
  };
});

import { useSkotarLass, type SkotarLassIn, type SkotarLassVy } from './useSkotarLass';

const M = 1 / 111320;
const BAS = { lat: 56.6, lng: 15.8 };
const nord = (m: number) => ({ lat: BAS.lat + m * M, lon: BAS.lng });
const VIDA = [{ nummer: '2', lat: BAS.lat, lng: BAS.lng }];

let root: Root; let div: HTMLDivElement;
let vy: SkotarLassVy;
let position: { lat: number; lon: number } | null = null;
const skapade: Array<{ lat: number; lng: number; nummer: string }> = [];

let extraNu: Partial<SkotarLassIn> | undefined;
function Harness({ extra }: { extra?: Partial<SkotarLassIn> }) {
  extra = extra ?? extraNu;
  vy = useSkotarLass({
    aktiv: true, objekt: { id: 'o1', vo: '555', namn: 'Trakten' }, maskinId: 'A030353', medarbetareId: 'm1', position,
    vida: VIDA, egna: [], hamtaVagar: () => [], skapaEgetAvlagg: (lat, lng, nummer) => { skapade.push({ lat, lng, nummer }); return '123'; }, ...extra,
  });
  return null;
}

const visa = async (extra?: Partial<SkotarLassIn>) => { extraNu = extra; await act(async () => { root.render(<Harness />); }); };
/** Står på en plats i `sek` sekunder (en fix varannan sekund, med litet brus). */
async function stå(nordM: number, sek: number) {
  for (let t = 0; t <= sek; t += 2) {
    position = nord(nordM + (t % 4 === 0 ? 0 : 0.4));
    await act(async () => { vi.advanceTimersByTime(2000); root.render(<Harness />); });
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-19T08:00:00Z'));
  server.online = true; server.skickade = []; skapade.length = 0; position = null; extraNu = undefined;
  (await import('@/lib/skotarLass/koKopplad') as any).aterstallKo();
  div = document.createElement('div'); document.body.appendChild(div); root = createRoot(div);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  await visa();
});
afterEach(async () => { await act(async () => { root.unmount(); }); div.remove(); vi.useRealTimers(); });

describe('lossning → lass', () => {
  it('första lasset: kortet väntar på föraren (bekräftar sig inte självt)', async () => {
    await stå(5, 40);
    expect(vy.lass).toHaveLength(1);
    expect(vy.lass[0].status).toBe('vantar_forare');
    expect(vy.kort?.fas).toBe('forare');
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(vy.lass[0].status).toBe('vantar_forare');
  });

  it('föraren fyller i och trycker Klar → bekräftat, skickat, kvar räknas', async () => {
    await stå(5, 40);
    const id = vy.lass[0].id;
    await act(async () => { vy.oppnaAndra(id); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.andraRad(1, { nyckel: 'massa', namn: 'Massa' }, +5); });
    await act(async () => { vy.stangAndra(true); });
    expect(vy.lass[0].status).toBe('bekraftat');
    expect(vy.lass[0].bekraftadAv).toBe('forare');
    expect(server.skickade.at(-1).id).toBe(id);
    expect(vy.kvar?.rader.find((r) => r.nyckel === 'tall')?.kvar).toBe(90);
    expect(vy.sammanfattning?.kvarText).toBe('Kvar ~135 m³');
  });

  it('andra lasset fylls i som förra och bekräftar sig självt när linjen fyllts (10 s)', async () => {
    await stå(5, 40);
    await act(async () => { vy.oppnaAndra(vy.lass[0].id); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    await stå(400, 70);    // kör iväg och lastar (kranpaus utanför avlägg)
    await stå(5, 32);      // tillbaka vid avlägget (30 s stilla utlöser lossningen; kortet hinner inte bekräfta sig)
    expect(vy.lass).toHaveLength(2);
    const l2 = vy.lass.find((l) => l.lassNummer === 2)!;
    expect(l2.delar[0].rader).toEqual([{ nyckel: 'tall', namn: 'Tall', m3: 10 }]);
    expect(vy.kort?.fas).toBe('auto');
    expect(l2.status).toBe('foreslaget');
    await act(async () => { vi.advanceTimersByTime(10_500); });
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('bekraftat');
    expect(vy.lass.find((l) => l.lassNummer === 2)!.bekraftadAv).toBe('auto');
    expect(vy.kort).toBeNull();
  });

  it('Avbryt i Ändra återställer lasset', async () => {
    await stå(5, 40);
    await act(async () => { vy.oppnaAndra(vy.lass[0].id); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +7); });
    expect(vy.lass[0].delar[0].rader).toHaveLength(1);
    await act(async () => { vy.avbrytAndra(); });
    expect(vy.lass[0].delar[0].rader).toHaveLength(0);
    expect(vy.andra).toBeNull();
  });

  it('utan täckning: allt sparas lokalt, inget kastas, skickas när nätet kommer', async () => {
    server.online = false;
    await stå(5, 40);
    await act(async () => { vy.oppnaAndra(vy.lass[0].id); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    expect(vy.lass[0].status).toBe('bekraftat');
    expect(server.skickade).toHaveLength(0);
    server.online = true;
    const { hamtaLassKo } = await import('@/lib/skotarLass/koKopplad');
    await act(async () => { await (await hamtaLassKo()).kor(); });
    expect(server.skickade.at(-1).status).toBe('bekraftat');
  });
});

describe('nytt avlägg och tvetydighet', () => {
  it('stopp långt från avlägg och skördarspår → "Nytt avlägg här?"; Ja skapar ett eget avlägg och ett lass dit', async () => {
    const linje = [{ vag: 's0', linje: [{ lat: BAS.lat + 600 * M, lng: BAS.lng + 0.01 }, { lat: BAS.lat + 700 * M, lng: BAS.lng + 0.01 }] }];
    await visa({ hamtaVagar: () => linje });
    await stå(300, 100);
    expect(vy.nyttAvlagg).not.toBeNull();
    await act(async () => { vy.svaraNyttAvlagg(true); });
    expect(skapade).toHaveLength(1);
    expect(skapade[0].nummer).toBe('3');   // efter Vidas avlägg 2
    expect(vy.lass).toHaveLength(1);
    expect(vy.lass[0].delar[0].avlaggId).toBe('egen:123');
  });
  it('Nej ställer inte frågan igen på samma plats', async () => {
    const linje = [{ vag: 's0', linje: [{ lat: BAS.lat + 600 * M, lng: BAS.lng + 0.01 }, { lat: BAS.lat + 700 * M, lng: BAS.lng + 0.01 }] }];
    await visa({ hamtaVagar: () => linje });
    await stå(300, 100);
    await act(async () => { vy.svaraNyttAvlagg(false); });
    await stå(300, 200);
    expect(vy.nyttAvlagg).toBeNull();
    expect(skapade).toHaveLength(0);
  });
  it('två avlägg nära varandra: föraren väljer, kortet bekräftar inte självt', async () => {
    await visa({ vida: [{ nummer: '2', lat: BAS.lat, lng: BAS.lng }, { nummer: '3', lat: BAS.lat + 25 * M, lng: BAS.lng }] });
    await stå(10, 40);
    expect(vy.kort?.fas).toBe('avlagg_val');
    expect(vy.lass[0].delar[0].avlaggId).toBeNull();
    await act(async () => { vy.valjAvlagg(vy.lass[0].id, 1, vy.avlagg[1]); });
    expect(vy.lass[0].delar[0].avlaggNummer).toBe('3');
  });
});

describe('minne mellan dagar', () => {
  it('en lossning från i går är ingen "förra lossning": första lossningen vid samma avlägg i dag blir ett nytt lass, inte en ignorerad upprepning', async () => {
    const { hamtaLassKo } = await import('@/lib/skotarLass/koKopplad');
    const k = await hamtaLassKo();
    await k.spara({
      id: 'igar', objektId: 'o1', voNummer: '555', maskinId: 'A030353', medarbetareId: null, lassNummer: 1, datum: '2026-10-18', status: 'bekraftat', bekraftadAv: 'forare', bekraftadTid: null,
      sparPunkter: [], vagar: [], skapad: '2026-10-18T10:00:00.000Z', andrad: '2026-10-18T10:00:00.000Z',
      delar: [{ delNr: 1, avlaggId: 'vida:2', avlaggNummer: '2', lossadTid: '2026-10-18T10:00:00.000Z', lat: BAS.lat, lng: BAS.lng, rader: [{ nyckel: 'tall', namn: 'Tall', m3: 9 }] }],
    });
    // Appen startas om i dag (ny montering över samma lager): detektorn läser in sin start ur det som ligger lokalt.
    await act(async () => { root.unmount(); });
    root = createRoot(div);
    await visa();
    await stå(5, 40);
    const nytt = vy.lass.find((l) => l.id !== 'igar');
    expect(nytt).toBeDefined();
    expect(nytt!.lassNummer).toBe(2);
    expect(nytt!.delar).toHaveLength(1);
    expect(vy.lass.find((l) => l.id === 'igar')!.delar).toHaveLength(1);
  });
});

describe('inaktivt', () => {
  it('aktiv=false: ingen upptäckt, inget lass', async () => {
    await visa({ aktiv: false });
    await stå(5, 60);
    expect(vy.lass).toHaveLength(0);
  });
});
