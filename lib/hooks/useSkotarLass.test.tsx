// @vitest-environment jsdom
// Skotarens lassrapportering (lib/hooks/useSkotarLass) i React med simulerade GPS-fixar och klocka. Samma hook som sidan kör; kön är den riktiga
// (lib/skotarLass/ko) över ett minneslager, servern är en låtsas som kan vara otillgänglig.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const server = vi.hoisted(() => ({ online: true, skickade: [] as any[], avslutOpti: [] as any[], begart: [] as Array<{ torr: boolean; opti: Record<string, number> | undefined }> }));
const opti = vi.hoisted(() => ({ lass: [] as any[] | null, avslutad: false as boolean | null }));
type SkordatRad = { nyckel: string; namn: string; m3: number };
const SKORDAT_STANDARD: SkordatRad[] = [{ nyckel: 'tall', namn: 'Tall', m3: 100 }, { nyckel: 'massa', namn: 'Massa', m3: 50 }];
// Sortimentkällorna: skördat (SKORDAT_STANDARD som standard; [] = skördaren läst men inget skördat; null = kunde inte läsas),
// objektets egna sortiment och senaste 12 månaderna.
const sort = vi.hoisted(() => ({ skordat: undefined as SkordatRad[] | null | undefined, objekt: [] as string[] | null, historik: null as any[] | null }));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/objektNummer', () => ({ hamtaAltNummer: async () => [], hogarObjektIds: (vo: string) => [vo] }));
vi.mock('@/lib/skotarLass/koKopplad', async () => {
  const ko = await import('@/lib/skotarLass/ko');
  const lyssnare = new Set<() => void>();
  const ny = () => ko.skapaLassKo({
    lager: ko.skapaMinnesKoLager(),
    paForandring: () => lyssnare.forEach((f) => f()),
    skickaLass: async (l) => { if (!server.online) return false; server.skickade.push(l); return true; },
    skickaAvslut: async (_o: string, opti: any) => { if (server.online) server.avslutOpti.push(opti); return server.online; },
  });
  // Torrkörningens kö (som i koKopplad): egen, i minnet, skickar aldrig.
  const nyTorr = () => ko.skapaLassKo({ lager: ko.skapaMinnesKoLager(), paForandring: () => lyssnare.forEach((f) => f()), skickaLass: async () => true, skickaAvslut: async () => true });
  let k = ny();
  let kTorr = nyTorr();
  return {
    aterstallKo: () => { k = ny(); kTorr = nyTorr(); },
    hamtaLassKo: async (torr?: boolean) => (torr ? kTorr : k),
    prenumereraLassKo: (f: () => void) => { lyssnare.add(f); return () => lyssnare.delete(f); },
    sparaLass: async (l: any, torr?: boolean) => { const q = torr ? kTorr : k; await q.spara(l); if (!torr) void k.kor(); },
    begarFardigskotad: async (o: string, torr?: boolean, optiAv?: Record<string, number>) => { server.begart.push({ torr: !!torr, opti: optiAv }); const q = torr ? kTorr : k; await q.begarAvslut(o, new Date().toISOString(), optiAv); if (!torr) void k.kor(); },
    lasLassForObjekt: async (o: string, torr?: boolean) => ({ lass: await (torr ? kTorr : k).lassForObjekt(o), fran: 'lokalt' as const }),
    lasAvslut: async () => null,
    lasOptiLass: async () => opti.lass,
    lasSkotningAvslutad: async () => opti.avslutad,
    lasSkordat: async () => (sort.skordat === undefined ? SKORDAT_STANDARD : sort.skordat),
    lasObjektSortiment: async () => sort.objekt,
    lasSortimentHistorik: async () => sort.historik,
    lasSortimentKlass: async () => false,
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
const skapade: Array<{ lat: number; lng: number; nummer: string; via?: string }> = [];

let extraNu: Partial<SkotarLassIn> | undefined;
function Harness({ extra }: { extra?: Partial<SkotarLassIn> }) {
  extra = extra ?? extraNu;
  vy = useSkotarLass({
    aktiv: true, objekt: { id: 'o1', vo: '555', namn: 'Trakten' }, maskinId: 'A030353', medarbetareId: 'm1', position,
    vida: VIDA, egna: [], hamtaVagar: () => [], skapaEgetAvlagg: (lat, lng, nummer, via) => { skapade.push({ lat, lng, nummer, via }); return '123'; }, ...extra,
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
  server.online = true; server.skickade = []; server.avslutOpti = []; server.begart = []; opti.lass = []; opti.avslutad = false; sort.skordat = undefined; sort.objekt = []; sort.historik = null; skapade.length = 0; position = null; extraNu = undefined;
  (await import('@/lib/skotarLass/koKopplad') as any).aterstallKo();
  div = document.createElement('div'); document.body.appendChild(div); root = createRoot(div);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  await visa();
});
afterEach(async () => { await act(async () => { root.unmount(); }); div.remove(); vi.useRealTimers(); });

/** Kör bort från avlägget (115 m, utanför zonen) i `sek` sekunder. */
const korIvag = (sek = 30) => stå(120, sek);
/** Står vid avlägget (5 m från punkten, inom zonen) i `sek` sekunder. */
const vidAvlagg = (sek = 20) => stå(5, sek);

const LASS_BAS = {
  objektId: 'o1', voNummer: '555', maskinId: 'A030353', medarbetareId: null, datum: '2026-10-19', bekraftadAv: 'forare', bekraftadTid: '2026-10-19T07:00:00.000Z',
  sparPunkter: [], vagar: [], skapad: '2026-10-19T07:00:00.000Z', andrad: '2026-10-19T07:00:00.000Z',
};
const gammaltLass = (nr: number, over: Record<string, unknown> = {}, rader = [{ nyckel: 'tall', namn: 'Tall', m3: 12 }, { nyckel: 'massa', namn: 'Massa', m3: 6 }]) => ({
  ...LASS_BAS, id: `g${nr}`, lassNummer: nr, status: 'bekraftat',
  delar: [{ delNr: 1, avlaggId: 'vida:2', avlaggNummer: '2', lossadTid: `2026-10-19T0${nr}:00:00.000Z`, lat: BAS.lat, lng: BAS.lng, rader }], ...over,
});
/** Lägger lass i kön och monterar om hooken (som när appen öppnas med lass från tidigare). */
async function medLass(lass: any[], extra: Partial<SkotarLassIn> = {}) {
  const { hamtaLassKo } = await import('@/lib/skotarLass/koKopplad');
  for (const l of lass) await (await hamtaLassKo(extra.torr)).spara(l);
  await act(async () => { root.unmount(); });
  root = createRoot(div);
  await visa(extra);
}
const sparade = async () => (await (await (await import('@/lib/skotarLass/koKopplad')).hamtaLassKo(false)).lassForObjekt('o1')) as any[];

describe('appen frågar aldrig: ett lass börjar bara med ett tryck', () => {
  it('10 min stilla vid avlägget (förr: en "lossning" med kort) ger inget lass, inget utkast och inget kort — bara knappen', async () => {
    await vidAvlagg(600);
    expect(vy.lass).toHaveLength(0);
    expect(vy.utkast).toBeNull();
    expect(vy.andra).toBeNull();
    expect(vy.nyttAvlagg).toBeNull();
    expect(vy.lossaKnapp?.id).toBe('vida:2');
    expect(await sparade()).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(server.skickade).toHaveLength(0);
  });
  it('två avlägg inom zonen (Mölleryd: "2" och "01-2"): båda blir val, ingen gissning, och det valda avlägget får utkastet', async () => {
    await visa({ vida: [{ nummer: '2', lat: BAS.lat, lng: BAS.lng }, { nummer: '01-2', lat: BAS.lat + 30 * M, lng: BAS.lng }] });
    await stå(4, 4);
    expect(vy.iZon?.tvetydigt).toBe(true);
    expect(vy.lossaVal.map((a) => a.nummer)).toEqual(['2', '01-2']);   // närmast först
    await act(async () => { vy.lossaVidAvlagg('vida:01-2'); });
    expect(vy.andraLass?.delar[0].avlaggId).toBe('vida:01-2');   // inte det närmaste: föraren valde
    expect(vy.lossaKnapp).toBeNull();
  });
  it('Klar sparar den inloggade medarbetaren på lasset (och skickar den till servern)', async () => {
    await visa({ medarbetareId: 'm-klar' });
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    const s = await sparade();
    expect(s).toHaveLength(1);
    expect(s[0].medarbetareId).toBe('m-klar');
    expect(s[0].bekraftadAv).toBe('forare');
    expect(server.skickade.at(-1)?.medarbetareId).toBe('m-klar');
  });
  it('testläget: en position som skickas om var 3:e sekund håller knappen kvar i minuten, utan omskickning försvinner den efter 10 s', async () => {
    const vid = { lat: BAS.lat, lon: BAS.lng };
    position = { ...vid }; await visa(); await act(async () => { vi.advanceTimersByTime(1); });
    expect(vy.lossaKnapp?.id).toBe('vida:2');
    for (let i = 0; i < 20; i++) { await act(async () => { vi.advanceTimersByTime(3000); }); position = { ...vid }; await visa(); }
    expect(vy.lossaKnapp?.id).toBe('vida:2');   // 60 s senare: fortfarande där
    await act(async () => { vi.advanceTimersByTime(12_000); });
    expect(vy.lossaKnapp).toBeNull();            // slutar omskicken → knappen går (ingen gammal position blir kvar)
  });
  it('ett id som inte är ett av alternativen gör ingenting', async () => {
    await visa({ vida: [{ nummer: '2', lat: BAS.lat, lng: BAS.lng }, { nummer: '01-2', lat: BAS.lat + 30 * M, lng: BAS.lng }] });
    await stå(4, 4);
    await act(async () => { vy.lossaVidAvlagg('vida:99'); });
    expect(vy.utkast).toBeNull();
    expect(vy.lossaVal).toHaveLength(2);
  });
  it('ett ensamt avlägg ger EN knapp (lossaVal har bara det)', async () => {
    await vidAvlagg(4);
    expect(vy.lossaVal.map((a) => a.id)).toEqual(['vida:2']);
  });
  it('lång paus utanför alla avlägg (förr: "Nytt avlägg här?") frågar inte och ger ingen knapp', async () => {
    await visa({ vida: [] });
    await stå(300, 300);
    expect(vy.nyttAvlagg).toBeNull();
    expect(vy.lossaKnapp).toBeNull();
    expect(vy.lass).toHaveLength(0);
  });
  it('knappen syns bara i avläggets zon och försvinner när han kör därifrån', async () => {
    expect(vy.lossaKnapp).toBeNull();
    await vidAvlagg(4);
    expect(vy.lossaKnapp?.id).toBe('vida:2');
    await stå(40, 4);   // 40 m: fortfarande inom zonen (50 m)
    expect(vy.lossaKnapp?.id).toBe('vida:2');
    await korIvag(6);    // 120 m: utanför
    expect(vy.lossaKnapp).toBeNull();
    expect(vy.iZon).toBeNull();
  });
  it('knappen kräver en färsk fix: tystnar GPS:en försvinner den, vi hittar inte på att maskinen står kvar', async () => {
    await vidAvlagg(4);
    expect(vy.lossaKnapp).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(vy.lossaKnapp).toBeNull();
  });
  it('tryck på knappen: lasskortet öppnas med utkastet — inget är sparat, inget skickat, och det räknas inte som skotat', async () => {
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    expect(vy.andra).not.toBeNull();
    expect(vy.utkast).not.toBeNull();
    expect(vy.andraLass?.delar[0].avlaggId).toBe('vida:2');
    expect(vy.lass).toHaveLength(0);
    expect(await sparade()).toHaveLength(0);
    expect(vy.lossaKnapp).toBeNull();   // en knapp åt gången: kortet har platsen
    await act(async () => { vi.advanceTimersByTime(15 * 60_000); });
    expect(vy.utkast?.status).not.toBe('bekraftat');   // ingen timer bekräftar något
    expect(server.skickade).toHaveLength(0);
  });
  it('sortimenten är ifyllda som förra lasset; första lasset på trakten börjar tomt', async () => {
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    expect(vy.andraLass?.delar[0].rader).toEqual([]);
    await act(async () => { vy.avbrytAndra(); });
    await medLass([gammaltLass(1)]);
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    expect(vy.andraLass?.lassNummer).toBe(2);
    expect(vy.andraLass?.delar[0].rader.map((r) => [r.nyckel, r.m3])).toEqual([['tall', 12], ['massa', 6]]);
  });
  it('Klar: lasset bekräftas av föraren och sparas — först nu finns det, och det skickas', async () => {
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +15); });
    expect(await sparade()).toHaveLength(0);   // under redigeringen sparas inget
    await act(async () => { vy.stangAndra(true); });
    expect(vy.andra).toBeNull();
    expect(vy.utkast).toBeNull();
    expect(vy.lass).toHaveLength(1);
    expect(vy.lass[0]).toMatchObject({ status: 'bekraftat', bekraftadAv: 'forare', lassNummer: 1 });
    expect(vy.lass[0].delar[0].rader).toEqual([{ nyckel: 'tall', namn: 'Tall', m3: 15 }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(server.skickade.map((l) => l.id)).toContain(vy.lass[0].id);
    expect(vy.kvar).not.toBeNull();
  });
  it('Klar utan sortiment går inte: ett tomt lass kan inte bekräftas', async () => {
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    await act(async () => { vy.stangAndra(true); });
    expect(vy.lass).toHaveLength(0);
    expect(vy.andra).not.toBeNull();   // kortet står kvar
  });
  it('Avbryt kastar utkastet: inget lass sparas, och knappen finns kvar för ett nytt försök', async () => {
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +15); });
    await act(async () => { vy.avbrytAndra(); });
    expect(vy.andra).toBeNull();
    expect(vy.utkast).toBeNull();
    expect(vy.lass).toHaveLength(0);
    expect(await sparade()).toHaveLength(0);
    expect(vy.lossaKnapp?.id).toBe('vida:2');
  });
  it('efter Klar göms knappen medan han står kvar vid avlägget (ingen dubbelregistrering) och kommer tillbaka först när han kört därifrån och kommer igen', async () => {
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    await vidAvlagg(20);
    expect(vy.lossaKnapp).toBeNull();
    await korIvag(8);
    expect(vy.lossaKnapp).toBeNull();
    await vidAvlagg(6);
    expect(vy.lossaKnapp?.id).toBe('vida:2');
  });
  it('dubbeltryck ger ett utkast, inte två', async () => {
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); vy.lossaVidAvlagg(); });
    expect(vy.utkast).not.toBeNull();
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +5); });
    await act(async () => { vy.stangAndra(true); });
    expect(vy.lass).toHaveLength(1);
  });
  it('två avlägg nära varandra: knappen föreslår det närmaste, Byt avlägg i kortet väljer det andra', async () => {
    const tva = [{ nummer: '2', lat: BAS.lat, lng: BAS.lng }, { nummer: '3', lat: BAS.lat + 30 * M, lng: BAS.lng }];
    await visa({ vida: tva });
    await stå(8, 4);
    expect(vy.iZon?.tvetydigt).toBe(true);
    expect(vy.lossaKnapp?.id).toBe('vida:2');
    await act(async () => { vy.lossaVidAvlagg(); });
    await act(async () => { vy.valjAvlagg(vy.andraLass!.id, 1, vy.avlagg.find((a) => a.id === 'vida:3')!); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +5); });
    await act(async () => { vy.stangAndra(true); });
    expect(vy.lass[0].delar[0].avlaggId).toBe('vida:3');
  });
  it('Det var ingen lossning (ta bort) på ett sparat lass stryker det som förut', async () => {
    await medLass([gammaltLass(1)]);
    await act(async () => { vy.oppnaAndra('g1'); });
    await act(async () => { vy.strykLass('g1'); });
    expect(vy.lass.find((l) => l.id === 'g1')?.status).toBe('struket');
    expect(vy.andra).toBeNull();
  });
  it('Avbryt på ett sparat lass återställer det till hur det var när Ändra öppnades', async () => {
    await medLass([gammaltLass(1)]);
    await act(async () => { vy.oppnaAndra('g1'); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +30); });
    await act(async () => { vy.avbrytAndra(); });
    expect(vy.lass.find((l) => l.id === 'g1')!.delar[0].rader.find((r) => r.nyckel === 'tall')!.m3).toBe(12);
  });
  it('utan täckning: Klar sparar lokalt, inget kastas, och lasset skickas när nätet kommer', async () => {
    server.online = false;
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(server.skickade).toHaveLength(0);
    expect(vy.lass).toHaveLength(1);
    server.online = true;
    const { hamtaLassKo } = await import('@/lib/skotarLass/koKopplad');
    await act(async () => { await (await hamtaLassKo()).kor(); });
    expect(server.skickade.at(-1).status).toBe('bekraftat');
  });
});

describe('gamla obesvarade lass rörs inte', () => {
  it('ett lass som väntar på föraren och ett förslag från den gamla automatiken ligger kvar oförändrade — inget bekräftas, strukes eller flyttas när appen öppnas', async () => {
    const vantar = gammaltLass(1, { status: 'vantar_forare', bekraftadAv: null, bekraftadTid: null });
    const forslag = gammaltLass(2, { status: 'foreslaget', bekraftadAv: null, bekraftadTid: null });
    await medLass([vantar, forslag]);
    await act(async () => { vi.advanceTimersByTime(20 * 60_000); });
    const ko = await sparade();
    expect(ko.find((l) => l.id === 'g1')).toMatchObject({ status: 'vantar_forare', andrad: vantar.andrad });
    expect(ko.find((l) => l.id === 'g2')).toMatchObject({ status: 'foreslaget', andrad: forslag.andrad });
    expect(vy.utkast).toBeNull();
    expect(vy.andra).toBeNull();
  });
});

describe('+ › Registrera lass (där inget avlägg finns)', () => {
  it('inom 50 m från ett avlägg: ett utkast där, ingen fråga', async () => {
    await stå(40, 20);
    await act(async () => { vy.registreraLass(); });
    expect(vy.nyttAvlagg).toBeNull();
    expect(vy.utkast).not.toBeNull();
    expect(vy.andraLass?.delar[0].avlaggId).toBe('vida:2');
    expect(vy.lass).toHaveLength(0);   // inget sparat förrän Klar
  });
  it('längre än 50 m från alla avlägg: frågan "Nytt avlägg här?" märkt via Registrera lass — inget utkast förrän han svarat', async () => {
    await stå(200, 20);
    await act(async () => { vy.registreraLass(); });
    expect(vy.nyttAvlagg?.via).toBe('lossa_har');
    expect(vy.utkast).toBeNull();
    expect(vy.lass).toHaveLength(0);
  });
  it('Nej gör ingenting', async () => {
    await stå(200, 20);
    await act(async () => { vy.registreraLass(); });
    await act(async () => { vy.svaraNyttAvlagg(false); });
    expect(skapade).toHaveLength(0);
    expect(vy.nyttAvlagg).toBeNull();
    expect(vy.utkast).toBeNull();
  });
  it('platsen är mitten på stoppet (medelvärdet av de senaste fixarna), och Ja skapar ett märkt avlägg + ett utkast där', async () => {
    // fixar växlar mellan 200,0 och 204,0 m: stoppets mitt är 202 m
    for (let t = 0; t <= 40; t += 2) { position = nord(200 + (t % 4 === 0 ? 0 : 4)); await act(async () => { vi.advanceTimersByTime(2000); root.render(<Harness />); }); }
    await act(async () => { vy.registreraLass(); });
    expect((vy.nyttAvlagg!.lat - BAS.lat) / M).toBeCloseTo(202, 0);
    await act(async () => { vy.svaraNyttAvlagg(true); });
    expect(skapade).toHaveLength(1);
    expect(skapade[0].via).toBe('lossa_har');
    expect((skapade[0].lat - BAS.lat) / M).toBeCloseTo(202, 0);
    expect(vy.utkast).not.toBeNull();
    expect(vy.andraLass?.delar[0].avlaggId).toBe('egen:123');
  });
  it('rör sig maskinen (fixarna spänner över mer än 25 m) gäller senaste fixen, inte ett medelvärde mitt emellan', async () => {
    for (let t = 0; t <= 40; t += 2) { position = nord(200 + t * 2); await act(async () => { vi.advanceTimersByTime(2000); root.render(<Harness />); }); }
    await act(async () => { vy.registreraLass(); });
    expect((vy.nyttAvlagg!.lat - BAS.lat) / M).toBeCloseTo(280, 0);
  });
});

describe('torrkörning (testläget)', () => {
  it('Provkör lossning öppnar lasskortet vid avlägget som ett riktigt tryck — och inget skickas', async () => {
    await visa({ torr: true });
    await act(async () => { vy.provkorLossning('vida:2'); });
    expect(vy.utkast).not.toBeNull();
    expect(vy.andraLass?.delar[0].avlaggId).toBe('vida:2');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(server.skickade).toHaveLength(0);
  });
  it('lasskortet fungerar som i maskinen, men Färdigskotad skickas aldrig', async () => {
    await visa({ torr: true });
    await act(async () => { vy.provkorLossning(null); });   // närmaste/första avlägg
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    expect(vy.lass[0].status).toBe('bekraftat');
    await act(async () => { await vy.fardigskotad(); });
    expect(vy.avslut).not.toBeNull();   // vyn visar Färdigskotad …
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(server.skickade).toHaveLength(0);   // … men ingenting når servern
  });
  it('utan torr gör Provkör ingenting (förarna kan aldrig provköra)', async () => {
    await visa({ torr: false });
    await act(async () => { vy.provkorLossning('vida:2'); });
    expect(vy.utkast).toBeNull();
    expect(vy.lass).toHaveLength(0);
  });
  it('torrlass hamnar aldrig i den riktiga kön', async () => {
    await visa({ torr: true });
    await act(async () => { vy.provkorLossning('vida:2'); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    const ko = await import('@/lib/skotarLass/koKopplad');
    expect(await (await ko.hamtaLassKo(false)).lassForObjekt('o1')).toHaveLength(0);
    expect(await (await ko.hamtaLassKo(true)).lassForObjekt('o1')).toHaveLength(1);
  });
});

describe('kvar med Opti-lass', () => {
  it('Opti före appens start räknas med; kvar visas först när Opti-lassen är lästa', async () => {
    opti.lass = [{ maskinId: 'A030353', datum: '2026-10-18', lassNummer: 1, tidMs: Date.parse('2026-10-18T10:00:00Z'), volymM3: 60, rader: [{ namn: 'Tall', kundkod: null, m3: 60 }] }];
    await visa({ objekt: { id: 'o9', vo: '555', namn: 'Trakten' } });  // ny trakt → allt läses om med de nya svaren
    await act(async () => { await Promise.resolve(); });
    expect(vy.kvar?.rader.find((r) => r.nyckel === 'tall')).toMatchObject({ skordat: 100, skotatOpti: 60, kvar: 40 });
  });
  it('kunde inte läsa Opti-lassen → ingen kvar (aldrig en gissning på halva underlaget)', async () => {
    opti.lass = null;
    await visa({ objekt: { id: 'o9', vo: '555', namn: 'Trakten' } });  // ny trakt → allt läses om med de nya svaren
    await act(async () => { await Promise.resolve(); });
    expect(vy.kvar).toBeNull();
    expect(vy.sammanfattning).toBeNull();
  });
  it('skotningen redan avslutad (skotning_avslutad satt) → ingen kvar', async () => {
    opti.avslutad = true;
    await visa({ objekt: { id: 'o9', vo: '555', namn: 'Trakten' } });  // ny trakt → allt läses om med de nya svaren
    await act(async () => { await Promise.resolve(); });
    expect(vy.kvar).toBeNull();
    expect(vy.skotningAvslutad).toBe(true);
  });
});

describe('Färdigskotad på en trakt som började i Opti', () => {
  const optiLass = () => [{ maskinId: 'A030353', datum: '2026-10-18', lassNummer: 1, tidMs: Date.parse('2026-10-18T10:00:00Z'), volymM3: 60, rader: [{ namn: 'Tall', kundkod: null, m3: 60 }] }];
  it('skickar med Opti-volymen före appens start (så servern skalar appens lass mot skördat − Opti) och skalar vyn likadant', async () => {
    opti.lass = optiLass();
    await visa({ torr: true, objekt: { id: 'o9', vo: '555', namn: 'Trakten' } });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vy.provkorLossning('vida:2'); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    const appTall = vy.lass[0].delar[0].rader.find((r) => r.nyckel === 'tall')!.m3;
    await act(async () => { await vy.fardigskotad(); });
    expect(server.begart).toHaveLength(1);
    expect(server.begart[0].opti).toEqual({ tall: 60 });
    // Opti 60 + appens skalade tall = skördat 100
    expect(60 + appTall * vy.avslut!.faktorer.tall).toBeCloseTo(100, 9);
    expect(server.skickade).toHaveLength(0);   // torrkörning: ingenting når servern
  });
  it('trakt utan Opti-lass: ingen Opti dras av', async () => {
    opti.lass = [];
    await visa({ torr: true, objekt: { id: 'o9', vo: '555', namn: 'Trakten' } });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vy.provkorLossning('vida:2'); });
    await act(async () => { await vy.fardigskotad(); });
    expect(server.begart[0].opti).toEqual({});
  });
  it('kunde inte läsa Opti-lassen → Färdigskotad skickas inte (skalningen vore fel)', async () => {
    opti.lass = null;
    await visa({ torr: true, objekt: { id: 'o9', vo: '555', namn: 'Trakten' } });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vy.provkorLossning('vida:2'); });
    await act(async () => { await vy.fardigskotad(); });
    expect(server.begart).toHaveLength(0);
    expect(vy.avslut).toBeNull();
  });
});

describe('trakt utan skördat (inte påbörjad)', () => {
  const laddaOm = async (skordat: typeof sort.skordat) => { sort.skordat = skordat; await visa({ objekt: { id: 'o-ny', vo: '777', namn: 'Skälviken' } }); await act(async () => { await Promise.resolve(); }); };
  it('skördaren är läst men har inget skördat → ingen Kvar (aldrig "Kvar ~0 m³" som säger att trakten är klar)', async () => {
    await laddaOm([]);
    expect(vy.skordatLaddat).toBe(true);
    expect(vy.kvar).toBeNull();
    expect(vy.sammanfattning).toBeNull();
    expect(vy.ingetSkordat).toBe(true);
  });
  it('rader med noll m³ räknas som inget skördat', async () => {
    await laddaOm([{ nyckel: 'tall', namn: 'Tall', m3: 0 }]);
    expect(vy.kvar).toBeNull();
    expect(vy.ingetSkordat).toBe(true);
  });
  it('Färdigskotad skickas aldrig för en trakt utan skördat', async () => {
    await laddaOm([]);
    await act(async () => { await vy.fardigskotad(); });
    expect(server.begart).toHaveLength(0);
    expect(vy.avslut).toBeNull();
  });
  it('med skördat visas Kvar som förut, och ingetSkordat är falskt', async () => {
    await laddaOm(SKORDAT_STANDARD);
    expect(vy.kvar?.kvarTotal).toBe(150);
    expect(vy.sammanfattning?.kvarText).toBe('Kvar ~150 m³');
    expect(vy.ingetSkordat).toBe(false);
  });
  it('skördaren kunde inte läsas (null) är något annat än tomt: ingen Kvar, men inte heller "inget skördat"', async () => {
    await laddaOm(null);
    expect(vy.kvar).toBeNull();
    expect(vy.ingetSkordat).toBe(false);
  });
});

describe('inaktivt', () => {
  it('aktiv=false: ingen zon, ingen knapp, inget lass', async () => {
    await visa({ aktiv: false });
    await stå(5, 400);
    expect(vy.lossaKnapp).toBeNull();
    expect(vy.lass).toHaveLength(0);
  });
});

// ── Flytten mot snittet av lossningarna (Martin 2026-10-20) ──────────────────────────────────────────────────────
describe('avlägg skapade via Lossa här flyttas mot snittet av lossningarna', () => {
  const lassVid = (nr: number, avlaggId: string, nordM: number, over: Record<string, unknown> = {}) => ({
    id: `b${nr}`, objektId: 'o1', voNummer: '555', maskinId: 'A030353', medarbetareId: null, lassNummer: nr, datum: '2026-10-19', status: 'bekraftat', bekraftadAv: 'forare', bekraftadTid: '2026-10-19T07:00:00.000Z',
    sparPunkter: [], vagar: [], skapad: '2026-10-19T07:00:00.000Z', andrad: '2026-10-19T07:00:00.000Z',
    delar: [{ delNr: 1, avlaggId, avlaggNummer: '1', lossadTid: `2026-10-19T0${nr}:00:00.000Z`, lat: BAS.lat + nordM * M, lng: BAS.lng, rader: [{ nyckel: 'tall', namn: 'Tall', m3: 10 }] }], ...over,
  });
  const EGET = { id: '123', lat: BAS.lat + 200 * M, lng: BAS.lng, nummer: '1' };
  async function montera(lass: any[], egna: any[], extra: Partial<SkotarLassIn> = {}) {
    const { hamtaLassKo } = await import('@/lib/skotarLass/koKopplad');
    for (const l of lass) await (await hamtaLassKo(extra.torr)).spara(l);
    await act(async () => { root.unmount(); });
    root = createRoot(div);
    await visa({ vida: [], egna, ...extra });
  }

  it('efter 3 bekräftade lass flyttas avlägget till snittet (200 → 215 m norr)', async () => {
    const flytta = vi.fn();
    await montera([lassVid(1, 'egen:123', 210), lassVid(2, 'egen:123', 215), lassVid(3, 'egen:123', 220)], [{ ...EGET, viaLossaHar: true }], { flyttaEgetAvlagg: flytta });
    expect(flytta).toHaveBeenCalledTimes(1);
    expect(flytta.mock.calls[0][0]).toBe('123');
    expect((flytta.mock.calls[0][1] - BAS.lat) / M).toBeCloseTo(215, 0);
  });
  it('bara två lass: ingen flytt', async () => {
    const flytta = vi.fn();
    await montera([lassVid(1, 'egen:123', 210), lassVid(2, 'egen:123', 220)], [{ ...EGET, viaLossaHar: true }], { flyttaEgetAvlagg: flytta });
    expect(flytta).not.toHaveBeenCalled();
  });
  it('struket och obekräftat lass räknas inte', async () => {
    const flytta = vi.fn();
    await montera([lassVid(1, 'egen:123', 210), lassVid(2, 'egen:123', 215), lassVid(3, 'egen:123', 220, { status: 'struket' }), lassVid(4, 'egen:123', 220, { status: 'vantar_forare', bekraftadAv: null })], [{ ...EGET, viaLossaHar: true }], { flyttaEgetAvlagg: flytta });
    expect(flytta).not.toHaveBeenCalled();
  });
  it('ett eget avlägg som INTE skapats via Lossa här (handsatt, planerarens) flyttas aldrig — inte heller Vidas', async () => {
    const flytta = vi.fn();
    await montera([lassVid(1, 'egen:123', 215), lassVid(2, 'egen:123', 215), lassVid(3, 'egen:123', 215), lassVid(4, 'vida:2', 30), lassVid(5, 'vida:2', 30), lassVid(6, 'vida:2', 30)], [EGET], { flyttaEgetAvlagg: flytta, vida: VIDA as any });
    expect(flytta).not.toHaveBeenCalled();
  });
  it('snittet nära där avlägget redan står (< 8 m) flyttar inget — markeringen hoppar inte för varje lass', async () => {
    const flytta = vi.fn();
    await montera([lassVid(1, 'egen:123', 203), lassVid(2, 'egen:123', 204), lassVid(3, 'egen:123', 205)], [{ ...EGET, viaLossaHar: true }], { flyttaEgetAvlagg: flytta });
    expect(flytta).not.toHaveBeenCalled();
  });
  it('torrkörningen (testläget) flyttar aldrig något', async () => {
    const flytta = vi.fn();
    await montera([lassVid(1, 'egen:123', 215), lassVid(2, 'egen:123', 215), lassVid(3, 'egen:123', 215)], [{ ...EGET, viaLossaHar: true }], { flyttaEgetAvlagg: flytta, torr: true });
    expect(flytta).not.toHaveBeenCalled();
  });
  it('inte medan maskinen står i avläggets zon — först när den lämnat det', async () => {
    const flytta = vi.fn();
    // två bekräftade lass vid avlägget (200 m); maskinen står nu där, registrerar lass 3 och blir stående
    await montera([lassVid(1, 'egen:123', 215), lassVid(2, 'egen:123', 215)], [{ ...EGET, viaLossaHar: true }], { flyttaEgetAvlagg: flytta });
    await stå(200, 8);
    expect(vy.lossaKnapp?.id).toBe('egen:123');
    await act(async () => { vy.lossaVidAvlagg(); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    expect(vy.lass.filter((l) => l.status === 'bekraftat')).toHaveLength(3);
    expect(flytta).not.toHaveBeenCalled();            // maskinen står fortfarande i zonen
    await stå(260, 8);                                  // kör ut ur zonen
    expect(vy.iZon).toBeNull();
    expect(flytta).toHaveBeenCalledTimes(1);
  });
});

describe('sortimentlistan i Ändra är aldrig tom (Skälviken: skotaren börjar innan något är skördat)', () => {
  /** beforeEach har redan monterat med standardkällorna: montera om, så källorna läses på nytt. */
  const omstart = async () => { await act(async () => { root.unmount(); }); root = createRoot(div); await visa(); };
  it('skördat finns: traktens egna sortiment först, reserven bara i "alla"', async () => {
    sort.objekt = ['Gran timmer · Urshult']; sort.historik = [{ nyckel: 'bmavfall_v3', namn: 'BmavFall_V3', antal: 9 }];
    await omstart();
    expect(vy.valbara.map((r) => r.nyckel)).toEqual(['tall', 'massa']);
    expect(vy.allaSortiment.map((r) => r.nyckel)).toEqual(['tall', 'massa', 'gran timmer · urshult', 'bmavfall_v3', 'ved_markagare']);
  });
  it('inget skördat än: objektets sortiment gäller', async () => {
    sort.skordat = []; sort.objekt = ['Gran timmer · Urshult', 'Massa · Björk']; sort.historik = [{ nyckel: 'bmavfall_v3', namn: 'BmavFall_V3', antal: 9 }];
    await omstart();
    expect(vy.sortimentKalla).toBe('objekt');
    expect(vy.valbara.map((r) => r.namn)).toEqual(['Gran timmer · Urshult', 'Massa · Björk']);
  });
  it('inget skördat och inga objektsortiment (privat jobb): de mest använda senaste 12 månaderna', async () => {
    sort.skordat = []; sort.objekt = []; sort.historik = [{ nyckel: 'b', namn: 'B', antal: 2 }, { nyckel: 'a', namn: 'A', antal: 7 }];
    await omstart();
    expect(vy.sortimentKalla).toBe('historik');
    expect(vy.valbara.map((r) => r.nyckel)).toEqual(['a', 'b']);
  });
  it('kan ingenting läsas finns ändå Ved markägare i "alla", och lasOmSortiment läser om', async () => {
    sort.skordat = []; sort.objekt = null; sort.historik = null;
    await omstart();
    expect(vy.valbara).toEqual([]);
    expect(vy.allaSortiment.map((r) => r.nyckel)).toEqual(['ved_markagare']);
    sort.historik = [{ nyckel: 'a', namn: 'A', antal: 1 }];
    await act(async () => { vy.lasOmSortiment(); });
    expect(vy.valbara.map((r) => r.nyckel)).toEqual(['a']);
  });
});

describe('lassnumret räknar inte strukna lass (Bågskyttebanan: nästa hette "Lass 3" fast ett var struket)', () => {
  /** Tryck på Lossa, lägg 10 m³ tall, Klar. */
  async function registrera() {
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
  }
  it('strukna lass 1 → nästa lass heter 1; ett nytt efter ett bekräftat → 2', async () => {
    await registrera();
    expect(vy.lass.map((l) => l.lassNummer)).toEqual([1]);
    await act(async () => { vy.strykLass(vy.lass[0].id); });
    await korIvag(20);
    await registrera();
    const levande = vy.lass.filter((l) => l.status !== 'struket');
    expect(levande).toHaveLength(1);
    expect(levande[0].lassNummer).toBe(1);   // inte 2
    expect(vy.lass).toHaveLength(2);         // det strukna ligger kvar som struket
    await korIvag(20);
    await registrera();
    expect(vy.lass.filter((l) => l.status !== 'struket').map((l) => l.lassNummer).sort()).toEqual([1, 2]);
  });
});

describe('Lägg till: mest använda på trakten först', () => {
  const omstart = async () => { await act(async () => { root.unmount(); }); root = createRoot(div); await visa(); };
  it('sortimentet föraren använt mest på trakten ligger först; lasset som ändras just nu räknas inte (knapparna byter inte plats under fingret)', async () => {
    sort.skordat = [{ nyckel: 'tall', namn: 'Tall', m3: 100 }, { nyckel: 'massa', namn: 'Massa', m3: 50 }, { nyckel: 'kubb', namn: 'Kubb', m3: 20 }];
    await omstart();
    expect(vy.valbara.map((r) => r.nyckel)).toEqual(['tall', 'massa', 'kubb']);   // inget använt än: skördat störst först
    await vidAvlagg(4);
    await act(async () => { vy.lossaVidAvlagg(); });
    for (let i = 0; i < 3; i++) await act(async () => { vy.andraRad(1, { nyckel: 'kubb', namn: 'Kubb' }, 1); });
    expect(vy.valbara.map((r) => r.nyckel)).toEqual(['tall', 'massa', 'kubb']);   // lasset under ändring räknas inte med
    await act(async () => { vy.stangAndra(true); });
    expect(vy.valbara.map((r) => r.nyckel)[0]).toBe('kubb');                      // klart: kubb är nu det mest använda på trakten
  });
});
