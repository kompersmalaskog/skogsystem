// @vitest-environment jsdom
// Skotarens lassrapportering (lib/hooks/useSkotarLass) i React med simulerade GPS-fixar och klocka. Samma hook som sidan kör; kön är den riktiga
// (lib/skotarLass/ko) över ett minneslager, servern är en låtsas som kan vara otillgänglig.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

const server = vi.hoisted(() => ({ online: true, skickade: [] as any[], avslutOpti: [] as any[], begart: [] as Array<{ torr: boolean; opti: Record<string, number> | undefined }> }));
const opti = vi.hoisted(() => ({ lass: [] as any[] | null, avslutad: false as boolean | null }));

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
  server.online = true; server.skickade = []; server.avslutOpti = []; server.begart = []; opti.lass = []; opti.avslutad = false; skapade.length = 0; position = null; extraNu = undefined;
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

  it('första lasset: när han kört ut ur zonen väntar kortet på föraren (Fyll i) och bekräftar sig aldrig självt', async () => {
    await lossa(200);
    await korIvag();
    expect(vy.kort?.fas).toBe('forare');
    await act(async () => { vi.advanceTimersByTime(300_000); });
    expect(vy.lass[0].status).toBe('vantar_forare');
    expect(vy.kort?.fas).toBe('forare');
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

  it('andra lasset fylls i som förra och bekräftar sig självt först när han stått still ≥ 5 min och kört ut ur zonen', async () => {
    await forstaLassetKlart();
    await lossa(200);
    const l2 = vy.lass.find((l) => l.lassNummer === 2)!;
    expect(l2.delar[0].rader).toEqual([{ nyckel: 'tall', namn: 'Tall', m3: 10 }]);
    expect(l2.status).toBe('foreslaget');
    expect(vy.kort?.fas).toBe('lossar');
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('foreslaget');   // ingen 10 s-timer
    await lossa(300);                                    // totalt över 5 min stilla
    await korIvag(20);                                   // precis utanför zonen i 20 s → lossningen tar slut (kvittot hinner inte försvinna)
    const efter = vy.lass.find((l) => l.lassNummer === 2)!;
    expect(efter.status).toBe('bekraftat');
    expect(efter.bekraftadAv).toBe('auto');
    expect(vy.kort?.fas).toBe('klar');
    await act(async () => { vi.advanceTimersByTime(6_500); });
    expect(vy.kort).toBeNull();                           // kvittot försvinner av sig självt, lasset är redan bekräftat
  });

  it('en kort lossning (under 5 min) väntar på ett tryck: Stämmer bekräftar, och lasset syns i "väntar på dig" när kortet är borta', async () => {
    await forstaLassetKlart();
    await lossa(215);
    await korIvag();
    const l2 = vy.lass.find((l) => l.lassNummer === 2)!;
    expect(l2.status).toBe('vantar_forare');
    expect(vy.kort?.fas).toBe('kontroll');
    expect(vy.vantarPaDig).toHaveLength(0);               // kortet visar det redan
    await act(async () => { vy.avbrytKort(); });
    expect(vy.vantarPaDig.map((l) => l.lassNummer)).toEqual([2]);
    await act(async () => { vy.stammer(l2.id); });
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
  it('trycket gäller som bekräftelse: ett förifyllt lass bekräftar sig när han kört ut, även efter bara någon minut', async () => {
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
    expect(vy.lass.find((l) => l.lassNummer === 2)!.status).toBe('bekraftat');
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
    expect(vy.kort?.fas).toBe('forare');   // första lasset på trakten bekräftar sig aldrig självt
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

describe('inaktivt', () => {
  it('aktiv=false: ingen upptäckt, inget lass', async () => {
    await visa({ aktiv: false });
    await stå(5, 400);
    expect(vy.lass).toHaveLength(0);
  });
});
