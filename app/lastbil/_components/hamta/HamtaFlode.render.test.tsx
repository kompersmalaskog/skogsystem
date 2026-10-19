// @vitest-environment jsdom
// Hämta en maskin från början till slut — HELA flödet monterat (jsdom, tabellfake som filtrerar och loggar skrivningar). Testet kontrollerar
// vad som SKRIVS (payloads och filter), inte bara vad som syns: en kvittorad utan rad i databasen är precis det felet flödet inte får ha.
// Hooks ligger före tidiga returer; övergången laddar → klar → varje steg fångar "Rendered more/fewer hooks".

import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nyFakeDb, type FakeDb } from './fakeSupabase';
import { KLOCKA, LBC, OBJEKT, scenario } from './hamtaScenario';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mock = vi.hoisted(() => ({ sheet: null as any, db: null as any, gps: null as null | { lat: number; lng: number; accuracy: number }, routingKm: 48, gpsFel: false }));

vi.mock('@/lib/supabase', async () => {
  const { fakeSupabase } = await import('./fakeSupabase');
  mock.db = (await import('./fakeSupabase')).nyFakeDb();
  return { supabase: fakeSupabase(mock.db) };
});

// Sheeten "Flytten" har sin egen renderingstest (app/lastbil/lastbil.render.test.tsx); här testas bara att Hämta-flödet öppnar den för admin.
vi.mock('../FlyttSheet', () => ({
  default: (p: any) => {
    mock.sheet = p;
    return <div data-flyttsheet data-flytt-id={p.flyttId} data-namn={p.namn}><button type="button" onClick={p.onStang}>Stäng sheet</button></div>;
  },
}));

import HamtaFlode from './HamtaFlode';
import { UTKAST_NYCKEL } from './flode';
import { KARTAPP_NYCKEL } from './kartapp';
import { designCss } from '@/lib/design/tokens';

const db = (): FakeDb => mock.db;
let rot: ReturnType<typeof createRoot> | null = null;
let ruta: HTMLElement;
let avslut: string[];

const vanta = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const text = () => { const k = document.body.cloneNode(true) as HTMLElement; k.querySelectorAll('style').forEach(x => x.remove()); return k.textContent ?? ''; };
const knapp = (re: RegExp | string, inom: ParentNode = document) => {
  const k = Array.from(inom.querySelectorAll('button, a')).find(b => (typeof re === 'string' ? (b.textContent ?? '').trim() === re : re.test((b.textContent ?? '').trim()))) as HTMLElement | undefined;
  if (!k) throw new Error(`Hittar ingen knapp "${re}". Texten: ${text().slice(0, 600)}`);
  return k;
};
const klicka = async (el: Element) => { await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await vanta(); };
const tryck = async (re: RegExp | string, inom?: ParentNode) => klicka(knapp(re, inom));
const sel = (s: string) => document.querySelector(s) as HTMLElement | null;
const skriv = (tabell: string, op?: 'insert' | 'update') => db().skrivningar.filter(s => s.tabell === tabell && (!op || s.op === op));

/** Lassat trycks vid maskinen (annars frågar appen "Stämmer platsen?"); testets GPS flyttas sedan dit nästa steg ska ske. */
const lassaNara = async () => {
  const gps = mock.gps;
  mock.gps = { lat: 56.545, lng: 14.745, accuracy: 6 };
  await tryck(/^Lassat$/);
  mock.gps = gps;
};

async function montera(utkastRaw?: string, props: { arAdmin?: boolean; namn?: string } = {}) {
  if (utkastRaw) localStorage.setItem(UTKAST_NYCKEL, utkastRaw);
  ruta = document.createElement('div');
  document.body.appendChild(ruta);
  rot = createRoot(ruta);
  await act(async () => { rot!.render(<div><style>{designCss}</style><HamtaFlode onAvsluta={t => avslut.push(t)} {...props} /></div>); });
  await vanta(10);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(KLOCKA));
  const d = db();
  d.tabeller = scenario(); d.skrivningar = []; d.lasfel = new Set(); d.skrivfel = new Set(); d.rpc = []; d.nastaId = 1; d.användare = { id: 'u-1', email: 'forare@example.se' };
  mock.gps = { lat: 56.545, lng: 14.745, accuracy: 8 }; mock.routingKm = 48; mock.gpsFel = false;
  avslut = [];
  try { localStorage.clear(); } catch { /* */ }
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (ok: any, fel: any) => { if (mock.gpsFel || !mock.gps) fel({ code: 2, message: 'Position ej tillgänglig' }); else ok({ coords: { latitude: mock.gps.lat, longitude: mock.gps.lng, accuracy: mock.gps.accuracy }, timestamp: Date.now() }); } },
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/routing')) return { ok: true, json: async () => ({ km: mock.routingKm, minutes: 55 }) };
    return { ok: false, json: async () => ({}) };
  }));
});
afterEach(async () => {
  if (rot) await act(async () => { rot!.unmount(); });
  rot = null; document.body.innerHTML = '';
  vi.unstubAllGlobals(); vi.useRealTimers();
  delete (navigator as any).userAgent; delete (navigator as any).maxTouchPoints;
});

describe('steg 1 — vilken maskin?', () => {
  it('listan: Arbetsrapportens radmönster — namn, EN rad (trakten), avstånd och chevron; närmast lastbilen först', async () => {
    await montera();
    expect(text()).toContain('Vilken maskin hämtar du?');
    expect(sel('h1')!.parentElement!.textContent).toContain('Närmast lastbilen först');
    const rader = Array.from(document.querySelectorAll('[data-maskin]')).map(r => r.getAttribute('data-maskin'));
    // H8E (≈ 3,5 km) närmast, sedan de på Bågskyttebanan/Vällust, 810E längst bort
    expect(rader[0]).toBe('R64428');
    expect(rader).toHaveLength(5);
    expect(rader.indexOf('JD810E')).toBe(4);
    const giant = sel('[data-maskin="PONS20SDJAA270231"]')!;
    expect(giant.querySelector('[data-trakt]')!.textContent).toBe('Bågskyttebanan RP');
    expect(giant.textContent).toMatch(/9,8 km/);
    expect(giant.querySelector('[data-osaker]')).toBeNull();
    // chevron i raden, ingen navigera-pil, ingen färgad prick
    expect(giant.textContent).toContain('chevron_right');
    expect(giant.textContent).not.toContain('navigation');
    expect(giant.querySelector('span[aria-hidden][style*="border-radius: 50%"]')).toBeNull();
  });

  it('raden bär inte typ, källa eller klockslag: ingen "Skördare/Skotare", ingen "GPS …", inget "≈"', async () => {
    await montera();
    const t = Array.from(document.querySelectorAll('[data-maskin]')).map(r => r.textContent).join(' | ');
    expect(t).not.toMatch(/Skördare|Skotare|GPS|≈|står på/);
    expect(t).not.toMatch(/\d\d:\d\d/);
  });

  it('topprad: bara Avbryt till vänster — ingen "Hämta en maskin" uppe till höger, i något steg', async () => {
    mock.gps = { lat: 56.5452, lng: 14.7451, accuracy: 6 };
    await montera();
    const topp = () => sel('[data-hamta-avbryt]')!.parentElement!.textContent;
    expect(topp()).toBe('Avbryt');                                   // Vilken maskin?
    await tryck(/^Giant/);
    expect(topp()).toBe('Avbryt');                                   // Hämtar X
    await tryck(/^Öppna i /); await tryck('Vart ska Giant?');
    expect(topp()).toBe('Avbryt');                                   // Vart ska X?
    await tryck(/^Vällust RP/); await tryck(/^Öppna i /); await tryck('Vägen hem till LBC');
    expect(topp()).toBe('Avbryt');                                   // Vägen hem
    expect(text().match(/Hämta en maskin/g)).toBeNull();
  });

  it('fotnoten "Avstånden är fågelväg." visas när avstånd visas — och döljs när inget avstånd visas', async () => {
    await montera();
    expect(text().match(/Avstånden är fågelväg\./g)).toHaveLength(1);
    await act(async () => { rot!.unmount(); }); rot = null; document.body.innerHTML = '';
    db().tabeller.lastbil_logg = []; mock.gpsFel = true;           // varken bil eller telefon: inga avstånd
    await montera();
    expect(document.querySelectorAll('[data-maskin]')).toHaveLength(5);
    expect(text()).not.toContain('Avstånden är fågelväg');
    expect(text()).toContain('Avstånd saknas');
  });

  it('"Maskin som inte är vår" ligger i ett eget kort under listan med micro-rubriken "Annan"; fotnoten står en gång', async () => {
    await montera();
    const rubriker = Array.from(document.querySelectorAll('h3')).map(h => h.textContent);
    expect(rubriker).toEqual(['Maskiner', 'Annan']);
    const annan = document.querySelector('section[aria-label="Annan"]')!;
    expect(annan.querySelector('[data-rad="extern"]')!.textContent).toContain('Maskin som inte är vår');
    expect(document.querySelector('section[aria-label="Maskiner"] [data-rad="extern"]')).toBeNull();
    expect(text().match(/Avstånden är fågelväg\./g)).toHaveLength(1);
    expect(text()).not.toContain('Kartappen visar vägen');
  });

  it('810E: positionen är 12 dygn gammal — orange tidsrad "Plats osäker · senast 7 okt" under trakten', async () => {
    await montera();
    const r = sel('[data-maskin="JD810E"]')!;
    expect(r.querySelector('[data-trakt]')!.textContent).toBe('Älmehult gallring');
    const o = r.querySelector('[data-osaker]') as HTMLElement;
    expect(o.textContent).toBe('Plats osäker · senast 7 okt');
    expect(o.getAttribute('style')).toContain('rgb(255, 159, 10)');
    expect(document.querySelectorAll('[data-osaker]')).toHaveLength(1);   // tidsraden visas BARA för den osäkra
  });

  it('H8E: en GPS-punkt från igår är inte osäker — ingen tidsrad', async () => {
    await montera();
    const r = sel('[data-maskin="R64428"]')!;
    expect(r.querySelector('[data-trakt]')!.textContent).toBe('Sandåsen gallring');
    expect(r.querySelector('[data-osaker]')).toBeNull();
  });

  it('läsfel på maskinerna är ett fel med Försök igen — aldrig en tom lista', async () => {
    db().lasfel.add('dim_maskin');
    await montera();
    expect(text()).toContain('Kunde inte läsa maskinerna just nu.');
    expect(sel('[data-maskin]')).toBeNull();
    expect(knapp('Försök igen')).toBeTruthy();
  });

  it('en positionsläsning som faller gör inte listan tom — den säger det', async () => {
    db().lasfel.add('detalj_gps_spar');
    await montera();
    expect(document.querySelectorAll('[data-maskin]')).toHaveLength(5);
    expect(text()).toContain('Några maskiners platser gick inte att läsa');
  });

  it('bilens position äldre än en timme → sorterat på telefonens GPS, och inget skrivs ut om det', async () => {
    db().tabeller.lastbil_logg = [{ vin: 'VIN1', lat: 56.460, lng: 14.703, tidpunkt: '2026-10-19T08:00:00Z', odometer_m: 1, bransle_ml: 1 }];
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 8 };   // telefonen står på Vällust
    await montera();
    const rader = Array.from(document.querySelectorAll('[data-maskin]')).map(r => r.getAttribute('data-maskin'));
    expect(rader[0]).toBe('A030353');   // Wisent står på Vällust — närmast telefonen, inte närmast LBC
    expect(sel('h1')!.parentElement!.textContent).toContain('Närmast lastbilen först');
    expect(text()).not.toMatch(/telefon|dig först|gammal|bilens plats/);
  });

  it('bilens position en halvtimme gammal räknas som färsk — sorterat på bilen', async () => {
    db().tabeller.lastbil_logg = [{ vin: 'VIN1', lat: 56.460, lng: 14.703, tidpunkt: '2026-10-19T10:00:00Z', odometer_m: 1, bransle_ml: 1 }];
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 8 };
    await montera();
    expect(document.querySelector('[data-maskin]')!.getAttribute('data-maskin')).toBe('R64428');
  });

  it('varken bil eller telefon → inga avstånd, och det står', async () => {
    db().tabeller.lastbil_logg = []; mock.gpsFel = true;
    await montera();
    expect(text()).toContain('Avstånd saknas');
    expect(document.querySelectorAll('[data-maskin]')).toHaveLength(5);
  });

  it('en maskin utan någon position står kvar i listan, utan avstånd och med uppmaningen att peka ut platsen', async () => {
    db().tabeller.detalj_gps_spar = []; db().tabeller.hyttspar = []; db().tabeller.maskin_position = [];
    await montera();
    const r = sel('[data-maskin="JD810E"]')!;
    expect(r.querySelector('[data-trakt]')!.textContent).toBe('Plats saknas');
    expect(r.textContent).not.toMatch(/\d km/);
  });

  it('läsfel på maskinerna är ett fel med Försök igen — aldrig en tom lista', async () => {
    db().lasfel.add('dim_maskin');
    await montera();
    expect(text()).toContain('Kunde inte läsa maskinerna just nu.');
    expect(sel('[data-maskin]')).toBeNull();
    expect(knapp('Försök igen')).toBeTruthy();
  });

  it('en positionsläsning som faller gör inte listan tom — den säger det', async () => {
    db().lasfel.add('detalj_gps_spar');
    await montera();
    expect(document.querySelectorAll('[data-maskin]')).toHaveLength(5);
    expect(text()).toContain('Några maskiners platser gick inte att läsa');
  });

  it('bilens position saknas helt → sorterat på telefonens GPS, underrubriken oförändrad', async () => {
    db().tabeller.lastbil_logg = [];
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 8 };
    await montera();
    expect(sel('h1')!.parentElement!.textContent).toContain('Närmast lastbilen först');
    expect(document.querySelector('[data-maskin]')!.getAttribute('data-maskin')).toBe('A030353');
  });
});

describe('steg 2 — hämtar maskinen', () => {
  it('tryck på maskinen → Hämtar Giant; primärknappen är en kartlänk mot maskinens position och byter innebörd efter tryck', async () => {
    await montera();
    await tryck(/^Giant/);
    expect(text()).toContain('Hämtar Giant');
    const a = sel('[data-kartknapp="kor"]') as HTMLAnchorElement;
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=56.545000,14.745000&travelmode=driving');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.textContent).toBe('Öppna i Google Maps');
    await klicka(a);
    expect(sel('[data-kartknapp="kor"]')).toBeNull();
    expect(knapp('Vart ska Giant?')).toBeTruthy();
    // inget har skrivits till databasen av att välja maskin och öppna kartan
    expect(db().skrivningar).toHaveLength(0);
  });

  it('Hämtar X följer maskinlistans mönster: ingen underrubrik, ingen prick, ingen ≈, "17 km bort", EN primär och EN sekundär knapp', async () => {
    mock.gps = { lat: 56.5452, lng: 14.7451, accuracy: 6 };
    await montera();
    await tryck(/^Giant/);
    expect(sel('h1')!.parentElement!.querySelectorAll('p')).toHaveLength(0);                 // ingen underrubrik under "Hämtar Giant"
    expect(document.querySelector('span[aria-hidden][style*="border-radius: 50%"]')).toBeNull();   // ingen färgad prick
    const t = text();
    expect(t).not.toMatch(/≈|GPS|frivilligt|Jag vet vägen|Välj en annan maskin|Utpekad/);
    expect(sel('[data-avstand]')!.textContent).toMatch(/^\d+(,\d)? km bort$/);
    expect(t).toContain('Bilen känner av lastningen själv om du inte trycker.');
    const primar = sel('[data-kartknapp="kor"]')!;
    const sekundar = sel('[data-lassa]')!;
    expect(primar.textContent).toBe('Öppna i Google Maps');
    expect(sekundar.textContent).toBe('Lassat');
    expect(primar.getAttribute('style')).toMatch(/background: (rgb\(255, 255, 255\)|#fff)/);
    expect(sekundar.getAttribute('style')).toMatch(/border: 1px solid/);                     // kantlinje: ser tryckbar ut
    expect(sel('[data-vidare]')).toBeNull();
    expect(sel('[data-byt-maskin]')).toBeNull();
  });

  it('tidsraden på kortet står BARA när positionen är osäker (orange, som i listan)', async () => {
    await montera();
    await tryck(/^Giant/);
    expect(sel('[data-osaker]')).toBeNull();                                                  // Giant har färsk position
    await tryck('Avbryt');
    await montera();
    await tryck(/^810E/);
    expect(sel('[data-osaker]')!.textContent).toMatch(/^Plats osäker/);
    expect(sel('[data-osaker]')!.getAttribute('style')).toMatch(/color: (rgb\(255, 159, 10\)|#ff9f0a)/i);
  });

  it('Lassat gör "Vart ska X?" till primärknappen — utan "Jag vet vägen" finns annars bara kartan som väg vidare', async () => {
    await montera();
    await tryck(/^Giant/);
    expect(knapp(/^Öppna i /)).toBeTruthy();
    await tryck(/^Lassat$/);
    expect(sel('[data-kartknapp="kor"]')).toBeNull();
    expect(knapp('Vart ska Giant?')).toBeTruthy();
  });

  it('Lassa: skriver flyttraden med förarens GPS som Från, tar över/skapar dagen och visar ✓ Lassat med Ändra', async () => {
    mock.gps = { lat: 56.5452, lng: 14.7451, accuracy: 6 };
    await montera();
    await tryck(/^Giant/);
    await tryck(/^Lassat$/);
    const f = skriv('maskin_flytt', 'insert');
    expect(f).toHaveLength(1);
    expect(f[0].varden).toMatchObject({ maskin_id: 'PONS20SDJAA270231', extern_maskin: null, fran_lat: 56.5452, fran_lng: 14.7451, forare: 'Martin Test', medarbetare_id: 'm-1', fran_objekt_id: 'obj-bagskytte' });
    expect(f[0].varden.flyttdag_id).toBeTruthy();
    expect(skriv('flyttdag', 'insert')).toHaveLength(1);
    expect(skriv('flyttdag', 'insert')[0].varden).toMatchObject({ vin: 'VIN1', medarbetare_id: 'm-1' });
    expect(sel('[data-kvitto="lassat"]')!.textContent).toMatch(/Lassat 12:30/);
    expect(sel('[data-lassa]')).toBeNull();
  });

  it('Lassa → Ändra tar bort lastningen: flytten avbryts (inte raderas) och knappen Lassa är tillbaka', async () => {
    await montera();
    await tryck(/^Giant/);
    await tryck(/^Lassat$/);
    await tryck('Ändra', sel('[data-kvitto="lassat"]')!);
    const u = skriv('maskin_flytt', 'update');
    expect(u).toHaveLength(1);
    expect(u[0].varden).toMatchObject({ avbruten: true });
    expect(u[0].varden.sluttid).toBeTruthy();
    expect(sel('[data-kvitto="lassat"]')).toBeNull();
    expect(sel('[data-lassa]')).toBeTruthy();
  });

  it('Lassa långt från maskinens plats → frågan "Stämmer platsen?"; båda svaren sparar, med olika punkt', async () => {
    mock.gps = { lat: LBC.lat, lng: LBC.lng, accuracy: 8 };   // föraren står vid LBC, Giant står 11 km bort
    await montera();
    await tryck(/^Giant/);
    await tryck(/^Lassat$/);
    expect(text()).toContain('Stämmer platsen?');
    expect(text()).toMatch(/Din plats ligger \d+ km från där Bågskyttebanan RP ska stå/);
    expect(skriv('maskin_flytt')).toHaveLength(0);   // ingenting sparat innan svaret
    await tryck(/^Använd Bågskyttebanan RPs plats|^Använd .*plats$/);
    expect(skriv('maskin_flytt', 'insert')[0].varden).toMatchObject({ fran_lat: 56.545, fran_lng: 14.745 });
  });

  it('Lassa utan GPS sparar ingenting och säger varför', async () => {
    mock.gpsFel = true;
    await montera();
    await tryck(/^Giant/);
    await tryck(/^Lassat$/);
    expect(skriv('maskin_flytt')).toHaveLength(0);
    expect(text()).toMatch(/Position ej tillgänglig/);
    expect(sel('[data-lassa]')).toBeTruthy();
  });

  it('skrivfel på flytten är ett fel — ingen kvittorad', async () => {
    db().skrivfel.add('maskin_flytt');
    await montera();
    await tryck(/^Giant/);
    await tryck(/^Lassat$/);
    expect(text()).toContain('Kunde inte spara lastningen');
    expect(sel('[data-kvitto="lassat"]')).toBeNull();
  });

  it('en maskin utan position: "Var står den?" → trakten blir där den står och kartlänken pekar dit', async () => {
    db().tabeller.maskin_position = []; db().tabeller.hyttspar = []; db().tabeller.detalj_gps_spar = [];
    await montera();
    await tryck(/^810E/);
    expect((sel('[data-kartknapp="kor"]') as HTMLButtonElement).disabled).toBe(true);
    await tryck(/Platsen saknas/);
    await tryck(/Älmehult gallring/, sel('[role="dialog"]')!);
    const a = sel('[data-kartknapp="kor"]') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toContain('destination=56.560000,14.620000');
    expect(text()).toContain('Älmehult gallring');
    expect(sel('[data-osaker]')).toBeNull();                       // en plats föraren pekat ut är aldrig osäker
  });

  it('draftet överlever en omladdning: samma steg, samma maskin', async () => {
    await montera();
    await tryck(/^Giant/);
    await tryck(/^Lassat$/);
    await act(async () => { rot!.unmount(); }); rot = null; document.body.innerHTML = '';
    await montera();
    expect(text()).toContain('Hämtar Giant');
    expect(sel('[data-kvitto="lassat"]')).toBeTruthy();
  });
});

describe('steg 3 — vart ska den?', () => {
  const tillDest = async () => { await montera(); await tryck(/^Giant/); await tryck(/^Öppna i /); await tryck('Vart ska Giant?'); };

  it('trakter som väntar på en skördare överst; tilldelad den här maskinen först; avslutade göms', async () => {
    await tillDest();
    expect(text()).toContain('Vart ska Giant?');
    const rubriker = Array.from(document.querySelectorAll('h3')).map(h => h.textContent);
    expect(rubriker).toEqual(['Väntar på maskinen', 'Andra trakter', 'Platser']);
    const vantar = Array.from(document.querySelector('section[aria-label="Väntar på maskinen"]')!.querySelectorAll('[data-dest]')).map(r => r.getAttribute('data-dest'));
    expect(vantar[0]).toBe('o:obj-bagskytte');             // planerad för Giant (alfabetiskt före Kroksjömåla)
    expect(vantar).toContain('o:obj-skalviken');           // ingen skördare ännu
    expect(vantar).not.toContain('o:obj-sandasen');        // H8E står där
    expect(sel('[data-dest="o:obj-ostrahoka"]')).toBeNull();   // avslutad
  });

  it('sök hittar även en avslutad trakt', async () => {
    await tillDest();
    const inp = document.querySelector('input[aria-label="Sök trakt eller plats"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(inp, 'hoka');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(sel('[data-dest="o:obj-ostrahoka"]')).toBeTruthy();
    expect(text()).toContain('Avslutade trakter');
  });

  it('vald trakt: bock, kartlänk mot dess koordinat, och inget skrivs', async () => {
    await tillDest();
    await tryck(/^Vällust RP/);
    expect(sel('[data-dest="o:obj-vallust"]')!.getAttribute('aria-selected')).toBe('true');
    const a = sel('[data-kartknapp="dest"]') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toContain('destination=56.470000,14.870000');
    expect(db().skrivningar).toHaveLength(0);
  });

  it('en bekräftad larmkoordinat (avlägget) går före trakten', async () => {
    Object.assign(db().tabeller.objekt.find(o => o.id === 'obj-vallust'), { larmkoordinat_lat: 56.4801, larmkoordinat_lng: 14.8602, larmkoordinat_bekraftad: true });
    await tillDest();
    await tryck(/^Vällust RP/);
    expect((sel('[data-kartknapp="dest"]') as HTMLAnchorElement).getAttribute('href')).toContain('destination=56.480100,14.860200');
  });

  it('Lassat av här (efter Lassa): avslutar flytten med GPS som Till, räknar km/fakturerbar, sparar maskinens position och visar kvittot', async () => {
    mock.gps = { lat: 56.545, lng: 14.745, accuracy: 6 };
    await montera();
    await tryck(/^Giant/); await lassaNara(); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/);
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 5 };   // framme på Vällust
    await tryck(/^Lassat av här/);
    const u = skriv('maskin_flytt', 'update').find(s => s.varden.sluttid && !s.varden.avbruten)!;
    expect(u.varden).toMatchObject({
      till_objekt_id: 'obj-vallust', till_plats_id: null, till_lat: 56.4702, till_lng: 14.8701, koord_kalla: 'gps',
      flytt_km: 48, fakturerbar: true, flytt_typ: 'produktion', kund: null,
    });
    expect(u.filter).toContainEqual(['id', 'eq', skriv('maskin_flytt', 'insert')[0].varden.id ?? u.filter[0][2]]);
    const pos = skriv('maskin_position', 'insert');
    expect(pos).toHaveLength(1);
    expect(pos[0].varden).toMatchObject({ maskin_id: 'PONS20SDJAA270231', lat: 56.4702, lng: 14.8701 });
    expect(sel('[data-kvitto="lossad"]')!.textContent).toContain('Giant lossad på Vällust RP');
  });

  it('under 30 km är flytten inte fakturerbar (EN regel, fakturerbarEffektiv)', async () => {
    mock.routingKm = 12;
    await montera();
    await tryck(/^Giant/); await lassaNara(); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/);
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 5 };
    await tryck(/^Lassat av här/);
    const u = skriv('maskin_flytt', 'update').find(s => s.varden.sluttid && !s.varden.avbruten)!;
    expect(u.varden).toMatchObject({ flytt_km: 12, fakturerbar: false });
  });

  it('verkstad som mål → service, aldrig fakturerbar', async () => {
    await montera();
    await tryck(/^Giant/); await lassaNara(); await tryck('Vart ska Giant?');
    await tryck(/^Verkstan Karlskrona/);
    mock.gps = { lat: 56.1601, lng: 15.5901, accuracy: 5 };
    await tryck(/^Lassat av här/);
    const u = skriv('maskin_flytt', 'update').find(s => s.varden.sluttid && !s.varden.avbruten)!;
    expect(u.varden).toMatchObject({ till_plats_id: 'pl-verkstan', till_objekt_id: null, flytt_typ: 'service', fakturerbar: false });
  });

  it('Lassat av här på fel plats (GPS långt från trakten) → frågan; "Använd trakten" sparar traktens koordinat', async () => {
    await montera();
    await tryck(/^Giant/); await lassaNara(); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/);
    mock.gps = { lat: 56.545, lng: 14.745, accuracy: 6 };   // fortfarande vid lastplatsen
    await tryck(/^Lassat av här/);
    expect(text()).toContain('Stämmer platsen?');
    expect(skriv('maskin_flytt', 'update').filter(s => s.varden.sluttid && !s.varden.avbruten)).toHaveLength(0);
    await tryck(/^Använd .*plats$/);
    const u = skriv('maskin_flytt', 'update').find(s => s.varden.sluttid && !s.varden.avbruten)!;
    expect(u.varden).toMatchObject({ till_lat: 56.47, till_lng: 14.87, koord_kalla: 'objekt' });
  });

  it('utan GPS gäller traktens koordinat', async () => {
    await montera();
    await tryck(/^Giant/); await lassaNara(); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/);
    mock.gpsFel = true;
    await tryck(/^Lassat av här/);
    const u = skriv('maskin_flytt', 'update').find(s => s.varden.sluttid && !s.varden.avbruten)!;
    expect(u.varden).toMatchObject({ till_lat: 56.47, till_lng: 14.87, koord_kalla: 'objekt' });
  });

  it('Lassat av utan Lassa och med färsk position: flytten skapas först, med maskinens plats som Från, sedan avslutas den', async () => {
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 5 };
    await montera();
    await tryck(/^Giant/); await tryck(/^Öppna i /); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/); await tryck(/^Lassat av här/);
    const ins = skriv('maskin_flytt', 'insert');
    expect(ins).toHaveLength(1);
    expect(ins[0].varden).toMatchObject({ fran_lat: 56.545, fran_lng: 14.745 });
    expect(skriv('maskin_flytt', 'update').some(s => s.varden.sluttid && s.varden.till_lat === 56.4702)).toBe(true);
  });

  it('Lassat av utan Lassa och med osäker position: ingenting skapas, appen ber om Lassa eller en utpekad plats', async () => {
    await montera();
    await tryck(/^810E/); await tryck(/^Öppna i /); await tryck('Vart ska 810E?');
    await tryck(/^Vällust RP/);
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 5 };
    await tryck(/^Lassat av här/);
    expect(skriv('maskin_flytt')).toHaveLength(0);
    expect(text()).toMatch(/Tryck Lassa först/);
  });

  it('förare: "Ändra" på lossad förklarar att en avslutad flytt rättas av admin — den ändrar inget', async () => {
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 5 };
    await montera();
    await tryck(/^Giant/); await lassaNara(); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/); await tryck(/^Lassat av här/);
    const antal = db().skrivningar.length;
    await tryck('Ändra', sel('[data-kvitto="lossad"]')!);
    expect(text()).toMatch(/rättas av admin/);
    expect(sel('[data-flyttsheet]')).toBeNull();
    expect(db().skrivningar).toHaveLength(antal);
  });
});

describe('samma regler i alla steg: ingen prick, inget ≈, EN primär knapp, högst EN sekundär', () => {
  const regler = () => {
    const t = text();
    expect(t).not.toMatch(/≈|frivilligt|Jag vet vägen|Välj en annan maskin/);
    expect(document.querySelector('span[aria-hidden][style*="border-radius: 50%"]')).toBeNull();
    const stil = (b: Element) => b.getAttribute('style') ?? '';
    const alla = Array.from(document.querySelectorAll('button, a')).filter(b => !b.closest('[role="dialog"]') && !b.hasAttribute('disabled'));
    const primara = alla.filter(b => /background: (rgb\(255, 255, 255\)|#fff)/.test(stil(b)));
    const sekundara = alla.filter(b => /border: 1px solid/.test(stil(b)));
    expect(primara.length).toBeLessThanOrEqual(1);
    expect(sekundara.length).toBeLessThanOrEqual(1);
    return { primar: primara[0]?.textContent, sekundar: sekundara[0]?.textContent };
  };

  it('Hämtar → Vart ska → Vägen hem', async () => {
    mock.gps = { lat: 56.545, lng: 14.745, accuracy: 6 };
    await montera();
    await tryck(/^Giant/);
    expect(regler()).toEqual({ primar: 'Öppna i Google Maps', sekundar: 'Lassat' });
    await tryck(/^Lassat$/);
    expect(regler()).toEqual({ primar: 'Vart ska Giant?', sekundar: undefined });          // kvittot ✓ Lassat ersätter knappen
    await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/);
    expect(regler()).toEqual({ primar: 'Öppna i Google Maps', sekundar: 'Lassat av här' });
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 5 };
    await tryck(/^Öppna i /);
    expect(regler()).toEqual({ primar: 'Vägen hem till LBC', sekundar: 'Lassat av här' });
    await tryck(/^Lassat av här/);
    expect(regler()).toEqual({ primar: 'Vägen hem till LBC', sekundar: undefined });
    await tryck('Vägen hem till LBC');
    expect(regler()).toEqual({ primar: 'Öppna i Google Maps', sekundar: 'Klar' });
    await tryck(/^Öppna i /);
    expect(regler()).toEqual({ primar: 'Klar', sekundar: 'Öppna i Google Maps igen' });
  });
});

describe('steg 4 — vägen hem och Klar', () => {
  async function tillHem(opt: { lassa?: boolean } = {}) {
    mock.gps = { lat: 56.545, lng: 14.745, accuracy: 6 };
    await montera();
    await tryck(/^Giant/);
    if (opt.lassa !== false) await tryck(/^Lassat$/); else await tryck(/^Öppna i /);
    await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/);
    await tryck(/^Öppna i /);
    await tryck('Vägen hem till LBC');
  }

  it('kartlänken mot LBC (hemmabasen), och dagens hemresa startas', async () => {
    await tillHem();
    expect(text()).toContain('Vägen hem till LBC');
    expect((sel('[data-kartknapp="hem"]') as HTMLAnchorElement).getAttribute('href')).toContain('destination=56.459000,14.702000');
    const hem = skriv('flyttdag', 'update').find(s => s.varden.hemresa_start_tid);
    expect(hem).toBeTruthy();
  });

  it('Klar med bilen hemma: rundan stängs med mätt hemresa, utkastet rensas och flödet avslutas', async () => {
    await tillHem();
    await tryck('Klar');
    const stang = skriv('flyttdag', 'update').find(s => s.varden.status === 'avslutad')!;
    expect(stang.varden).toMatchObject({ status: 'avslutad', slut_lat: 56.459, slut_lng: 14.702 });
    expect(stang.varden.sluttid).toBeTruthy();
    expect(avslut).toEqual(['Rundan är avslutad.']);
    expect(localStorage.getItem(UTKAST_NYCKEL)).toBeNull();
  });

  it('Klar med bilen långt från basen: frågan "Bilen är inte hemma än" — inget stängs; "Nej, jag kör vidare" lämnar rundan öppen', async () => {
    await tillHem();
    db().tabeller.lastbil_logg = [{ vin: 'VIN1', lat: 56.585, lng: 14.702, tidpunkt: '2026-10-19T10:29:00Z', odometer_m: 1, bransle_ml: 1 }];
    await tryck('Klar');
    expect(sel('[data-framme-varning]')).toBeTruthy();
    expect(sel('[data-framme-varning]')!.textContent).toContain('Bilen är inte hemma än');
    expect(skriv('flyttdag', 'update').some(s => s.varden.status === 'avslutad')).toBe(false);
    await tryck('Nej, jag kör vidare');
    expect(sel('[data-framme-varning]')).toBeNull();
    expect(skriv('flyttdag', 'update').some(s => s.varden.status === 'avslutad')).toBe(false);
    expect(avslut).toEqual([]);
  });

  it('"Ja, avsluta ändå" stänger rundan som förut', async () => {
    await tillHem();
    db().tabeller.lastbil_logg = [{ vin: 'VIN1', lat: 56.585, lng: 14.702, tidpunkt: '2026-10-19T10:29:00Z', odometer_m: 1, bransle_ml: 1 }];
    await tryck('Klar');
    await tryck('Ja, avsluta ändå');
    expect(skriv('flyttdag', 'update').some(s => s.varden.status === 'avslutad')).toBe(true);
    expect(avslut).toEqual(['Rundan är avslutad.']);
  });

  it('läget går inte att avgöra (bilens position för gammal) → ingen fråga, rundan stängs som förut', async () => {
    await tillHem();
    db().tabeller.lastbil_logg = [{ vin: 'VIN1', lat: 56.585, lng: 14.702, tidpunkt: '2026-10-19T08:00:00Z', odometer_m: 1, bransle_ml: 1 }];
    await tryck('Klar');
    expect(sel('[data-framme-varning]')).toBeNull();
    expect(skriv('flyttdag', 'update').some(s => s.varden.status === 'avslutad')).toBe(true);
  });

  it('Klar utan att något tryckts (ingen runda öppnad av föraren): inget stängs, flödet avslutas med en ärlig rad', async () => {
    await montera();
    await tryck(/^Giant/); await tryck(/^Öppna i /); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/); await tryck(/^Öppna i /); await tryck('Vägen hem till LBC');
    await tryck('Klar');
    expect(skriv('flyttdag')).toHaveLength(0);
    expect(avslut).toEqual(['Klart. Rundan avslutas när bilen står hemma.']);
  });

  it('skrivfel när rundan ska stängas är ett fel — flödet avslutas inte', async () => {
    await tillHem();
    db().skrivfel.add('flyttdag');
    await tryck('Klar');
    expect(text()).toContain('Kunde inte avsluta dagen');
    expect(avslut).toEqual([]);
  });
});

describe('Avbryt, extern maskin, cron-runda och kartapp', () => {
  it('Avbryt efter Lassa avbryter den öppna flytten och rensar utkastet', async () => {
    await montera();
    await tryck(/^Giant/); await lassaNara();
    await tryck('Avbryt');
    expect(skriv('maskin_flytt', 'update').some(s => s.varden.avbruten === true)).toBe(true);
    expect(localStorage.getItem(UTKAST_NYCKEL)).toBeNull();
    expect(avslut).toEqual(['']);
  });

  it('Avbryt i listan skriver ingenting', async () => {
    await montera();
    await tryck('Avbryt');
    expect(db().skrivningar).toHaveLength(0);
    expect(avslut).toEqual(['']);
  });

  it('maskin som inte är vår: namn OCH kund krävs; flytten sparas som kunduppdrag med extern_maskin och kund', async () => {
    await montera();
    await tryck(/^Maskin som inte är vår/);
    const ark = sel('[role="dialog"]')!;
    expect((knapp('Hämta den', ark) as HTMLButtonElement).disabled).toBe(true);
    const satt = async (etikett: string, v: string) => {
      const inp = ark.querySelector(`input[aria-label="${etikett}"]`) as HTMLInputElement;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); });
    };
    await satt('Maskinens namn', 'Skotare Anderssons');
    expect((knapp('Hämta den', ark) as HTMLButtonElement).disabled).toBe(true);   // kund saknas
    await satt('Kund', 'Vida');
    await tryck('Hämta den', ark);
    expect(text()).toContain('Hämtar Skotare Anderssons');
    await tryck(/Platsen saknas|Var står den/);
    await tryck(/^Älmehult gallring/, sel('[role="dialog"]')!);
    mock.gps = { lat: 56.56, lng: 14.62, accuracy: 6 };
    await tryck(/^Lassat$/);
    expect(skriv('maskin_flytt', 'insert')[0].varden).toMatchObject({ maskin_id: null, extern_maskin: 'Skotare Anderssons' });
    await tryck('Vart ska Skotare Anderssons?');
    await tryck(/^Vällust RP/);
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 6 };
    await tryck(/^Lassat av här/);
    const u = skriv('maskin_flytt', 'update').find(s => s.varden.sluttid && !s.varden.avbruten)!;
    expect(u.varden).toMatchObject({ flytt_typ: 'kunduppdrag', kund: 'Vida', fakturerbar: true });
    expect(skriv('maskin_position')).toHaveLength(0);   // andras maskiner spåras aldrig
  });

  it('Lassa tar över den öppna runda cron:en startade (ingen andra runda skapas)', async () => {
    db().tabeller.flyttdag = [{ id: 'dag-auto', starttid: '2026-10-19T09:00:00Z', sluttid: null, medarbetare_id: null, auto_skapad: true, vin: 'VIN1', start_lat: 56.459, start_lng: 14.702 }];
    await montera();
    await tryck(/^Giant/); await lassaNara();
    expect(skriv('flyttdag', 'insert')).toHaveLength(0);
    const tag = skriv('flyttdag', 'update').find(s => s.varden.auto_skapad === false)!;
    expect(tag.varden).toMatchObject({ forare: 'Martin Test', medarbetare_id: 'm-1', auto_skapad: false });
    expect(skriv('maskin_flytt', 'insert')[0].varden.flyttdag_id).toBe('dag-auto');
  });

  it('en runda som cron stängde för mindre än en timme sedan: frågan ställs, "Fortsätt rundan" återöppnar den', async () => {
    db().tabeller.flyttdag = [{ id: 'dag-stangd', starttid: '2026-10-19T08:00:00Z', sluttid: '2026-10-19T10:00:00Z', medarbetare_id: null, auto_avslutad_av: 'cron', auto_skapad: true, status: 'avslutad' }];
    await montera();
    await tryck(/^Giant/); await lassaNara();
    expect(text()).toContain('Fortsätta rundan?');
    expect(skriv('maskin_flytt')).toHaveLength(0);
    await tryck('Fortsätt rundan');
    expect(skriv('flyttdag', 'update').some(s => s.varden.sluttid === null && s.varden.status === 'pagaende')).toBe(true);
    expect(skriv('maskin_flytt', 'insert')).toHaveLength(1);
  });

  it('en öppen flytt förarens redan har (appen stängdes) tas upp där den slutade, utan utkast', async () => {
    db().tabeller.maskin_flytt = [{ id: 'f-oppen', maskin_id: 'PONS20SDJAA270231', extern_maskin: null, kund: null, medarbetare_id: 'm-1', starttid: '2026-10-19T09:50:00Z', hamtad_tid: '2026-10-19T10:10:00Z', sluttid: null, avbruten: false }];
    await montera();
    expect(text()).toContain('Hämtar Giant');
    expect(sel('[data-kvitto="lassat"]')!.textContent).toMatch(/Lassat 12:10/);
  });

  it('kartappsvalet visas inte på en enhet utan Apple Kartor', async () => {
    await montera();
    await tryck(/^Giant/);
    expect(sel('[data-kartapp-rad]')).toBeNull();
    expect(localStorage.getItem(KARTAPP_NYCKEL)).toBeNull();
  });

  it('på en iPhone: Apple Kartor förvald, djuplänken är maps://, och valet kan bytas och sparas per enhet', async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
    await montera();
    await tryck(/^Giant/);
    const a = sel('[data-kartknapp="kor"]') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('maps://?daddr=56.545000,14.745000&dirflg=d');
    expect(a.textContent).toBe('Öppna i Kartor');
    expect(a.getAttribute('target')).toBeNull();
    await tryck(/Kartapp: Apple Kartor/);
    await tryck(/^Google Maps/, sel('[role="dialog"]')!);
    expect(localStorage.getItem(KARTAPP_NYCKEL)).toBe('google');
    expect((sel('[data-kartknapp="kor"]') as HTMLAnchorElement).getAttribute('href')).toContain('google.com/maps/dir');
  });
});

describe('steg 3 — efter Lassat av här', () => {
  it('primärknappen är Vägen hem även om kartappen aldrig öppnats på steget (föraren är framme)', async () => {
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 5 };
    await montera();
    await tryck(/^Giant/); await lassaNara(); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/);
    await tryck(/^Lassat av här/);
    expect(sel('[data-kartknapp="dest"]')).toBeNull();
    expect(knapp('Vägen hem till LBC')).toBeTruthy();
    expect(sel('[data-vidare]')).toBeNull();
  });

  it('handlingsraden (primärknapp, Lassat av här, kvitto) ligger i EN fast fot — aldrig under en lång lista', async () => {
    await montera();
    await tryck(/^Giant/); await tryck(/^Öppna i /); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/);
    const fot = sel('[data-hamta-fot]')!;
    expect(fot.getAttribute('style')).toContain('sticky');
    expect(fot.querySelector('[data-kartknapp="dest"]')).toBeTruthy();
    expect(fot.querySelector('[data-lossa]')).toBeTruthy();
  });
});

describe('steg 4 — Klar blir primärknapp när kartappen öppnats', () => {
  it('före kartan: Öppna i Kartor är primär och Klar tertiär; efter: Klar primär och kartlänken kvar som "igen"', async () => {
    mock.gps = { lat: 56.545, lng: 14.745, accuracy: 6 };
    await montera();
    await tryck(/^Giant/); await tryck(/^Öppna i /); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/); await tryck(/^Öppna i /); await tryck('Vägen hem till LBC');
    const primar = (el: HTMLElement) => el.getAttribute('style')!.includes('background: rgb(255, 255, 255)') || el.getAttribute('style')!.includes('background: #fff');
    expect(primar(sel('[data-kartknapp="hem"]')!)).toBe(true);
    expect(primar(sel('[data-klar]')!)).toBe(false);
    await klicka(sel('[data-kartknapp="hem"]')!);
    expect(primar(sel('[data-klar]')!)).toBe(true);
    const igen = sel('[data-kartknapp="hem"]') as HTMLAnchorElement;
    expect(igen.textContent).toBe('Öppna i Google Maps igen');
    expect(igen.getAttribute('href')).toContain('destination=56.459000,14.702000');
    await tryck('Klar');
    expect(avslut).toEqual(['Klart. Rundan avslutas när bilen står hemma.']);
  });
});

describe('"Ändra" på ✓ lossad — admin rättar i sheeten "Flytten"', () => {
  const lossa = async (props: { arAdmin?: boolean; namn?: string }) => {
    mock.gps = { lat: 56.4702, lng: 14.8701, accuracy: 5 };
    await montera(undefined, props);
    await tryck(/^Giant/); await lassaNara(); await tryck('Vart ska Giant?');
    await tryck(/^Vällust RP/); await tryck(/^Lassat av här/);
  };

  it('admin: öppnar FlyttSheet på just den här flytten, med adminens namn, och visar inte förklaringstexten', async () => {
    await lossa({ arAdmin: true, namn: 'Joacim Ringberg' });
    const flyttId = skriv('maskin_flytt', 'insert')[0].varden.id ?? db().tabeller.maskin_flytt[0].id;
    const antal = db().skrivningar.length;
    await tryck('Ändra', sel('[data-kvitto="lossad"]')!);
    const sh = sel('[data-flyttsheet]')!;
    expect(sh).toBeTruthy();
    expect(sh.getAttribute('data-flytt-id')).toBe(db().tabeller.maskin_flytt[0].id);
    expect(sh.getAttribute('data-namn')).toBe('Joacim Ringberg');
    expect(text()).not.toMatch(/rättas av admin/);
    expect(db().skrivningar).toHaveLength(antal);   // att öppna sheeten skriver inget
    expect(flyttId).toBeTruthy();
  });

  it('admin: Stäng går tillbaka till kvittot utan ändring', async () => {
    await lossa({ arAdmin: true });
    await tryck('Ändra', sel('[data-kvitto="lossad"]')!);
    await tryck('Stäng sheet');
    expect(sel('[data-flyttsheet]')).toBeNull();
    expect(sel('[data-kvitto="lossad"]')!.textContent).toContain('Giant lossad på Vällust RP');
  });

  it('admin: efter en rättning säger kvittot var flytten NU är lossad (läst ur flytten) och toasten från sheeten visas', async () => {
    await lossa({ arAdmin: true });
    await tryck('Ändra', sel('[data-kvitto="lossad"]')!);
    // sheeten har rättat Till i databasen (ratta_flytt) och rapporterar klart
    Object.assign(db().tabeller.maskin_flytt[0], { till_objekt_id: 'obj-skalviken', till_plats_id: null });
    await act(async () => { mock.sheet.onKlar('Flytten är rättad.'); });
    await vanta();
    expect(sel('[data-flyttsheet]')).toBeNull();
    expect(sel('[data-ratt-kvitto]')!.textContent).toBe('Flytten är rättad.');
    expect(sel('[data-kvitto="lossad"]')!.textContent).toContain('Giant lossad på Skälviken RP J-Hus');
  });

  it('admin: strök sheeten flytten (avbruten) är lossningen borta ur flödet', async () => {
    await lossa({ arAdmin: true });
    await tryck('Ändra', sel('[data-kvitto="lossad"]')!);
    Object.assign(db().tabeller.maskin_flytt[0], { avbruten: true });
    await act(async () => { mock.sheet.onKlar('Flytten är struken.'); });
    await vanta();
    expect(sel('[data-kvitto="lossad"]')).toBeNull();
    expect(sel('[data-lossa]')).toBeTruthy();
  });

  it('admin: faller bara FAKTURA-delen visas felet från sheeten på sidan', async () => {
    await lossa({ arAdmin: true });
    await tryck('Ändra', sel('[data-kvitto="lossad"]')!);
    await act(async () => { mock.sheet.onDelvis('Flytten är rättad, men kunden sparades inte.'); });
    await vanta();
    expect(text()).toContain('Flytten är rättad, men kunden sparades inte.');
  });
});
