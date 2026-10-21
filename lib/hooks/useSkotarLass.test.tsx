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

/** Kör bort från avlägget (115 m, utanför zonen) i `sek` sekunder: lossningen tar slut. */
const korIvag = (sek = 30) => stå(120, sek);
/** Lossar i `sek` sekunder vid avlägget (en lossning börjar efter 3 min, lasset skapas då). */
const lossa = (sek = 200) => stå(5, sek);

describe('lossning → lass', () => {
  it('3 min stilla vid avlägget: ett lass och kortet "Lossar" som står kvar — ingen timer tar bort det medan han lossar', async () => {
    await lossa(200);
    expect(vy.lass).toHaveLength(1);
    expect(vy.kort?.fas).toBe('lossar');
    await lossa(600);   // tio minuter till vid avlägget
    expect(vy.kort?.fas).toBe('lossar');
    expect(vy.lass).toHaveLength(1);
    expect(vy.lass[0].status).toBe('vantar_forare');   // första lasset: bekräftar sig aldrig självt
  });

  it('under 3 min stilla (passage, plocka rent) ger inget lass och ingen ruta', async () => {
    await lossa(120);
    expect(vy.lass).toHaveLength(0);
    expect(vy.kort).toBeNull();
  });

  it('lämnar han avlägget utan att svara försvinner kortet och lasset ligger i "väntar på dig" — det bekräftar sig aldrig självt', async () => {
    await lossa(200);
    expect(vy.vantarPaDig).toHaveLength(0);   // kortet visar det medan han lossar
    await korIvag();
    expect(vy.kort).toBeNull();
    expect(vy.lass[0].status).toBe('vantar_forare');
    expect(vy.vantarPaDig.map((l) => l.lassNummer)).toEqual([1]);
    await act(async () => { vi.advanceTimersByTime(30 * 60_000); });
    expect(vy.lass[0].status).toBe('vantar_forare');
    expect(vy.lass[0].bekraftadAv).toBeNull();
  });

  it('föraren fyller i och trycker Klar → bekräftat, skickat, kvar räknas', async () => {
    await lossa(200);
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
    expect(vy.kort?.fas).toBe('lossar');   // lossningen pågår fortfarande: kortet kommer tillbaka när Ändra stängs
  });

  /** Ett bekräftat första lass, och föraren har kört ut: nästa cykel börjar om 11 min. */
  async function forstaLassetKlart() {
    await lossa(200);
    await act(async () => { vy.oppnaAndra(vy.lass[0].id); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    await korIvag();
    await stå(120, 11 * 60);
  }

  it('andra lasset fylls i som förra men bekräftas ALDRIG av sig självt — inte efter 15 min stilla och utkörd heller; först Stämmer bekräftar', async () => {
    await forstaLassetKlart();
    await lossa(200);
    const l2 = vy.lass.find((l) => l.lassNummer === 2)!;
    expect(l2.delar[0].rader).toEqual([{ nyckel: 'tall', namn: 'Tall', m3: 10 }]);
    expect(l2.status).toBe('foreslaget');
    expect(vy.kort?.fas).toBe('lossar');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('foreslaget');   // ingen 10 s-timer
    await lossa(800);                                    // totalt 15 min stilla med förifyllt lass
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('foreslaget');
    expect(vy.kort?.fas).toBe('lossar');                  // frågan står kvar
    await act(async () => { vy.stammer(l2.id); });        // ett tryck
    const efter = vy.lass.find((l) => l.lassNummer === 2)!;
    expect(efter.status).toBe('bekraftat');
    expect(efter.bekraftadAv).toBe('forare');
    expect(vy.kort?.fas).toBe('klar');
    await act(async () => { vi.advanceTimersByTime(6_500); });
    expect(vy.kort).toBeNull();                           // kvittot försvinner av sig självt, lasset är redan bekräftat
    await korIvag(20);                                    // lossningen tar slut: inget mer händer med lasset
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('bekraftat');
  });

  it('andra lasset: lämnar han utan att trycka ligger det förifyllda lasset i "väntar på dig" (inte bekräftat)', async () => {
    await forstaLassetKlart();
    await lossa(500);
    await korIvag();
    const l2 = vy.lass.find((l) => l.lassNummer === 2)!;
    expect(l2.status).toBe('vantar_forare');
    expect(l2.delar[0].rader).toEqual([{ nyckel: 'tall', namn: 'Tall', m3: 10 }]);
    expect(vy.kort).toBeNull();
    expect(vy.vantarPaDig.map((l) => l.lassNummer)).toEqual([2]);
  });

  it('Stämmer på raden i "väntar på dig" bekräftar lasset som förare', async () => {
    await forstaLassetKlart();
    await lossa(215);
    await korIvag();
    const l2 = vy.lass.find((l) => l.lassNummer === 2)!;
    expect(l2.status).toBe('vantar_forare');
    expect(vy.kort).toBeNull();
    expect(vy.vantarPaDig.map((l) => l.lassNummer)).toEqual([2]);
    await act(async () => { vy.stammer(l2.id); });
    expect(vy.lass.find((l) => l.lassNummer === 2)!.bekraftadAv).toBe('forare');
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('bekraftat');
    expect(vy.vantarPaDig).toHaveLength(0);
  });

  it('står maskinen still igen inom 10 min efter lossningen är det samma lossning — inget nytt lass', async () => {
    await lossa(200);
    await korIvag();
    await stå(120, 120);   // 2 min ute
    await lossa(250);      // tillbaka och still igen
    expect(vy.lass).toHaveLength(1);
  });

  it('Det var ingen lossning (✕) släpper cykelregeln: nästa äkta lossning blir ett lass', async () => {
    await lossa(200);
    await act(async () => { vy.strykLass(vy.lass[0].id); });
    expect(vy.lass[0].status).toBe('struket');
    expect(vy.oppen).toBeNull();
    await korIvag();
    await lossa(200);
    expect(vy.lass.filter((l) => l.status !== 'struket')).toHaveLength(1);
    expect(vy.kort?.fas).toBe('lossar');
  });

  it('Avbryt i Ändra bekräftar inget: lasset är som förut (ett förslag stannar förslag medan han lossar)', async () => {
    await forstaLassetKlart();
    await lossa(200);
    const l2 = vy.lass.find((l) => l.lassNummer === 2)!;
    await act(async () => { vy.oppnaAndra(l2.id); });
    await act(async () => { vy.avbrytAndra(); });
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('foreslaget');
    expect(vy.lass.find((l) => l.lassNummer === 2)!.bekraftadAv).toBeNull();
    expect(vy.kort?.fas).toBe('lossar');
  });

  it('Avbryt i Ändra efter att lossningen tog slut: lasset väntar på föraren, inte kvar som förslag', async () => {
    await forstaLassetKlart();
    await lossa(200);
    const l2 = vy.lass.find((l) => l.lassNummer === 2)!;
    await act(async () => { vy.oppnaAndra(l2.id); });
    await korIvag();
    await act(async () => { vy.avbrytAndra(); });
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('vantar_forare');
    expect(vy.vantarPaDig.map((l) => l.lassNummer)).toEqual([2]);
  });

  it('Avbryt i Ändra återställer lasset', async () => {
    await lossa(200);
    await act(async () => { vy.oppnaAndra(vy.lass[0].id); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +7); });
    expect(vy.lass[0].delar[0].rader).toHaveLength(1);
    await act(async () => { vy.avbrytAndra(); });
    expect(vy.lass[0].delar[0].rader).toHaveLength(0);
    expect(vy.andra).toBeNull();
  });

  it('utan täckning: allt sparas lokalt, inget kastas, skickas när nätet kommer', async () => {
    server.online = false;
    await lossa(200);
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

describe('Lossa här (reservknappen när upptäckten missar)', () => {
  it('ett tryck ger ett lass vid närmaste avlägg, utan att maskinen stått still', async () => {
    await stå(10, 10);
    await act(async () => { vy.lossaHar(); });
    expect(vy.lass).toHaveLength(1);
    expect(vy.lass[0].delar[0].avlaggId).toBe('vida:2');
    expect(vy.kort?.fas).toBe('lossar');
    expect(vy.oppen).not.toBeNull();
  });
  it('trycker man igen medan lossningen pågår blir det inget nytt lass', async () => {
    await stå(10, 10);
    await act(async () => { vy.lossaHar(); });
    await act(async () => { vy.lossaHar(); });
    expect(vy.lass).toHaveLength(1);
  });
  it('Lossa här är bara ett lass som börjat: det bekräftas inte heller av sig självt', async () => {
    await lossa(200);
    await act(async () => { vy.oppnaAndra(vy.lass[0].id); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    await korIvag();
    await stå(120, 11 * 60);
    await stå(10, 20);
    await act(async () => { vy.lossaHar(); });
    const l2 = vy.lass.find((l) => l.lassNummer === 2)!;
    expect(l2.status).toBe('foreslaget');
    await stå(10, 60);
    await korIvag();
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('vantar_forare');
    expect(vy.kort).toBeNull();
  });
  it('utan avlägg på trakten ställs frågan "Nytt avlägg här?" på platsen', async () => {
    await visa({ vida: [] });
    await stå(10, 10);
    await act(async () => { vy.lossaHar(); });
    expect(vy.nyttAvlagg).not.toBeNull();
    expect(vy.lass).toHaveLength(0);
  });
});

describe('lass som väntar på föraren syns', () => {
  it('ett lass i vantar_forare som ligger kvar från tidigare (lass 2 från 09:57) visas i "väntar på dig" när appen öppnas', async () => {
    const { hamtaLassKo } = await import('@/lib/skotarLass/koKopplad');
    await (await hamtaLassKo()).spara({
      id: 'hangande', objektId: 'o1', voNummer: '555', maskinId: 'A030353', medarbetareId: null, lassNummer: 2, datum: '2026-10-19', status: 'vantar_forare', bekraftadAv: null, bekraftadTid: null,
      sparPunkter: [], vagar: [], skapad: '2026-10-19T07:57:03.000Z', andrad: '2026-10-19T07:57:03.000Z',
      delar: [{ delNr: 1, avlaggId: 'vida:2', avlaggNummer: '2', lossadTid: '2026-10-19T07:56:32.000Z', lat: BAS.lat, lng: BAS.lng, rader: [] }],
    });
    await act(async () => { root.unmount(); });
    root = createRoot(div);
    await visa();
    expect(vy.kort).toBeNull();
    expect(vy.vantarPaDig.map((l) => l.id)).toEqual(['hangande']);
    await act(async () => { vy.strykLass('hangande'); });
    expect(vy.vantarPaDig).toHaveLength(0);
  });
  it('ett förslag vars lossning aldrig tog slut (appen stängdes) bekräftar inte sig självt utan väntar på föraren', async () => {
    const { hamtaLassKo } = await import('@/lib/skotarLass/koKopplad');
    await (await hamtaLassKo()).spara({
      id: 'avbrutet', objektId: 'o1', voNummer: '555', maskinId: 'A030353', medarbetareId: null, lassNummer: 3, datum: '2026-10-19', status: 'foreslaget', bekraftadAv: null, bekraftadTid: null,
      sparPunkter: [], vagar: [], skapad: '2026-10-19T07:57:03.000Z', andrad: '2026-10-19T07:57:03.000Z',
      delar: [{ delNr: 1, avlaggId: 'vida:2', avlaggNummer: '2', lossadTid: '2026-10-19T07:56:32.000Z', lat: BAS.lat, lng: BAS.lng, rader: [{ nyckel: 'tall', namn: 'Tall', m3: 10 }] }],
    });
    await act(async () => { root.unmount(); });
    root = createRoot(div);
    await visa();
    expect(vy.lass.find((l) => l.id === 'avbrutet')!.status).toBe('vantar_forare');
    expect(vy.vantarPaDig.map((l) => l.id)).toEqual(['avbrutet']);
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
    await stå(10, 200);
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
    await stå(5, 200);
    const nytt = vy.lass.find((l) => l.id !== 'igar');
    expect(nytt).toBeDefined();
    expect(nytt!.lassNummer).toBe(2);
    expect(nytt!.delar).toHaveLength(1);
    expect(vy.lass.find((l) => l.id === 'igar')!.delar).toHaveLength(1);
  });
});

describe('torrkörning (testläget)', () => {
  it('Provkör lossning ger ett lass vid avlägget, förifyllt kort för föraren — och inget skickas', async () => {
    await visa({ torr: true });
    await act(async () => { vy.provkorLossning('vida:2'); });
    expect(vy.lass).toHaveLength(1);
    expect(vy.lass[0].delar[0].avlaggId).toBe('vida:2');
    expect(vy.kort?.fas).toBe('lossar');   // lossningen pågår tills nästa Provkör-tryck ("kör ut ur zonen")
    expect(vy.oppen).not.toBeNull();
    await act(async () => { vy.provkorLossning('vida:2'); });
    expect(vy.oppen).toBeNull();
    expect(vy.kort).toBeNull();   // obesvarat: kortet försvinner, lasset ligger i "väntar på dig"
    expect(vy.vantarPaDig).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(server.skickade).toHaveLength(0);
  });
  it('lasset och Ändra fungerar som i maskinen, men Färdigskotad skickas aldrig', async () => {
    await visa({ torr: true });
    await act(async () => { vy.provkorLossning(null); });   // närmaste/första avlägg
    const id = vy.lass[0].id;
    await act(async () => { vy.oppnaAndra(id); });
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
    expect(vy.lass).toHaveLength(0);
  });
  it('torrlass hamnar aldrig i den riktiga kön', async () => {
    await visa({ torr: true });
    await act(async () => { vy.provkorLossning('vida:2'); });
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
    const id = vy.lass[0].id;
    await act(async () => { vy.oppnaAndra(id); });
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
  it('aktiv=false: ingen upptäckt, inget lass', async () => {
    await visa({ aktiv: false });
    await stå(5, 400);
    expect(vy.lass).toHaveLength(0);
  });
});

// ── Lossa här: avlägget mitt på stoppet, och flytten mot snittet av lossningarna (Martin 2026-10-20) ──────────────────────────────────────────────────────
describe('Lossa här skapar avlägg mitt på stoppet', () => {
  it('inom 50 m från ett avlägg: ett lass där, ingen fråga', async () => {
    await stå(40, 20);
    await act(async () => { vy.lossaHar(); });
    expect(vy.nyttAvlagg).toBeNull();
    expect(vy.lass).toHaveLength(1);
    expect(vy.lass[0].delar[0].avlaggId).toBe('vida:2');
  });
  it('längre än 50 m från alla avlägg: frågan "Nytt avlägg här?" märkt via Lossa här — inget lass förrän han svarat', async () => {
    await stå(200, 20);
    await act(async () => { vy.lossaHar(); });
    expect(vy.nyttAvlagg?.via).toBe('lossa_har');
    expect(vy.lass).toHaveLength(0);
  });
  it('platsen är mitten på stoppet (medelvärdet av de senaste fixarna), och Ja skapar ett märkt avlägg + ett lass där', async () => {
    // fixar växlar mellan 200,0 och 204,0 m: stoppets mitt är 202 m
    for (let t = 0; t <= 40; t += 2) { position = nord(200 + (t % 4 === 0 ? 0 : 4)); await act(async () => { vi.advanceTimersByTime(2000); root.render(<Harness />); }); }
    await act(async () => { vy.lossaHar(); });
    expect((vy.nyttAvlagg!.lat - BAS.lat) / M).toBeCloseTo(202, 0);
    await act(async () => { vy.svaraNyttAvlagg(true); });
    expect(skapade).toHaveLength(1);
    expect(skapade[0].via).toBe('lossa_har');
    expect((skapade[0].lat - BAS.lat) / M).toBeCloseTo(202, 0);
    expect(vy.lass).toHaveLength(1);
    expect(vy.lass[0].delar[0].avlaggId).toBe('egen:123');
  });
  it('rör sig maskinen (fixarna spänner över mer än 25 m) gäller senaste fixen, inte ett medelvärde mitt emellan', async () => {
    for (let t = 0; t <= 40; t += 2) { position = nord(200 + t * 2); await act(async () => { vi.advanceTimersByTime(2000); root.render(<Harness />); }); }
    await act(async () => { vy.lossaHar(); });
    expect((vy.nyttAvlagg!.lat - BAS.lat) / M).toBeCloseTo(280, 0);
  });
  it('ett avlägg som inte skapats via Lossa här får ingen märkning ("Nytt avlägg här?" från detektorn)', async () => {
    await visa({ vida: [] });
    await stå(300, 130);   // långt stopp utanför alla avlägg, ingen skördarspår känd → frågan kommer inte av sig själv
    expect(vy.nyttAvlagg).toBeNull();
  });
});

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
  it('inte medan en lossning pågår vid avlägget — först när maskinen lämnat det', async () => {
    const flytta = vi.fn();
    // två bekräftade lass vid avlägget (200 m), och maskinen står nu där och lossar: lass 3 bekräftas mitt i lossningen
    await montera([lassVid(1, 'egen:123', 215), lassVid(2, 'egen:123', 215)], [{ ...EGET, viaLossaHar: true }], { flyttaEgetAvlagg: flytta });
    await stå(200, 200);
    expect(vy.oppen).not.toBeNull();
    const id = vy.lass.find((l) => l.status !== 'bekraftat')!.id;
    await act(async () => { vy.oppnaAndra(id); });
    await act(async () => { vy.andraRad(1, { nyckel: 'tall', namn: 'Tall' }, +10); });
    await act(async () => { vy.stangAndra(true); });
    expect(vy.lass.filter((l) => l.status === 'bekraftat')).toHaveLength(3);
    expect(flytta).not.toHaveBeenCalled();            // lossningen pågår fortfarande
    await stå(260, 30);                                 // kör ut ur zonen
    expect(vy.oppen).toBeNull();
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
  it('strukna lass 1 → nästa lass heter 1; Stämmer på ett lass och sedan ett nytt → 2', async () => {
    await lossa(200);
    expect(vy.lass.map((l) => l.lassNummer)).toEqual([1]);
    await act(async () => { vy.strykLass(vy.lass[0].id); });
    await korIvag(60);
    await stå(5, 700);   // > 10 min senare, ny lossning vid avlägget
    const levande = vy.lass.filter((l) => l.status !== 'struket');
    expect(levande).toHaveLength(1);
    expect(levande[0].lassNummer).toBe(1);   // inte 2
    expect(vy.lass).toHaveLength(2);         // det strukna ligger kvar som struket
  });
});

describe('Lägg till: mest använda på trakten först', () => {
  const omstart = async () => { await act(async () => { root.unmount(); }); root = createRoot(div); await visa(); };
  it('sortimentet föraren använt mest på trakten ligger först; lasset som ändras just nu räknas inte (knapparna byter inte plats under fingret)', async () => {
    sort.skordat = [{ nyckel: 'tall', namn: 'Tall', m3: 100 }, { nyckel: 'massa', namn: 'Massa', m3: 50 }, { nyckel: 'kubb', namn: 'Kubb', m3: 20 }];
    await omstart();
    expect(vy.valbara.map((r) => r.nyckel)).toEqual(['tall', 'massa', 'kubb']);   // inget använt än: skördat störst först
    await lossa(200);
    const id = vy.lass[0].id;
    await act(async () => { vy.oppnaAndra(id, 1); });
    for (let i = 0; i < 3; i++) await act(async () => { vy.andraRad(1, { nyckel: 'kubb', namn: 'Kubb' }, 1); });
    expect(vy.valbara.map((r) => r.nyckel)).toEqual(['tall', 'massa', 'kubb']);   // lasset under ändring räknas inte med
    await act(async () => { vy.stangAndra(true); });
    expect(vy.valbara.map((r) => r.nyckel)[0]).toBe('kubb');                      // klart: kubb är nu det mest använda på trakten
  });
});
