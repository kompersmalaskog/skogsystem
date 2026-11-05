// @vitest-environment jsdom
// Besökssidan (markägaren), hyttens orange kort och planerarens SMS-rad — monterade på riktigt i jsdom.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('next/dynamic', () => ({ default: () => (p: any) => <div data-testid="karta-stub" data-maskiner={p.data.maskiner.length} data-motorsag={p.data.motorsag.length} data-prickar={(p.data.prickar ?? []).length} /> }));

const hook = vi.hoisted(() => ({ ut: {} as any }));
vi.mock('@/lib/hooks/useBesokPlanerare', () => ({ useBesokPlanerare: () => hook.ut }));

import BesokKlient from './BesokKlient';
import BesokKortHytt from './BesokKortHytt';
import BesokPlanerare from './BesokPlanerare';
import { HUVUDREGEL, SKOTARARK_TEXT } from '@/lib/besok/sakerhet';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let el: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); el?.remove(); rot = null; el = null; vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* */ } });
async function visa(node: React.ReactNode) {
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el);
  await act(async () => { rot!.render(node as any); });
}
const q = (id: string) => el!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const tryck = async (x: Element | null) => { await act(async () => { (x as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const skriv = async (inp: HTMLInputElement, v: string) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const TOKEN = 'T'.repeat(40);
const ID = '11111111-1111-4111-8111-111111111111';
const TID = new Date(Date.now() + 10 * 60000).toISOString();          // besöket pågår (inom besökstiden + eftertiden)
const KVITT = new Date(Date.now() + 20 * 60000).toISOString();
const SKOG = {
  intro: 'Din skog är FSC- och PEFC-certifierad. Då sparar vi träd åt naturen, och du får ersättning för det.',
  rader: [
    { id: 'evighetstrad', namn: 'Evighetsträd', varfor: 'Får aldrig avverkas', varde: '41 av 73', malbild: 'evighetstrad', forklaring: 'Grova och gamla träd som står kvar för alltid.', krav: 'Kravet: minst 10 per hektar', karta: true },
    { id: 'toppar', namn: 'Grova toppar', varfor: 'Ligger kvar med flit – inte slarv', varde: null, malbild: null, forklaring: 'En del grova toppar lämnas på hygget.', krav: 'Ingår i certifieringens krav på död ved', karta: false },
  ],
  prickar: [{ typ: 'evighetstrad', lat: 56.35, lng: 15.05 }, { typ: 'evighetstrad', lat: 56.351, lng: 15.05 }],
  kantzon: [],
  ved: { text: '3 m · Björk · vid avlägget', plats: null },
};
const vy = (extra: Record<string, any> = {}) => ({
  ok: true, namn: 'Skälviken', utforare: 'Kompersmåla Skog avverkar åt Vida',
  framsteg: { procent: 62, klartCa: 'fredag', text: '62 % klart · klart ca fredag', forklaring: 'Räknat på de senaste 5 dagarna med arbete.' },
  gran: null, mitt: { lat: 56.35, lng: 15.05 },
  maskiner: [{ roll: 'skordare', lat: 56.35, lng: 15.05, tid: '2026-10-22T11:42:00Z' }, { roll: 'skotare', lat: 56.351, lng: 15.051, tid: '2026-10-22T11:40:00Z' }],
  roller: ['skordare', 'skotare'], motorsag: [], harMotorsag: true, ringM: { skordare: 70, skotare: 20, motorsag: 40 },
  uppdaterad: '2026-10-22T11:42:00Z', besok: null, skog: SKOG, ring: { namn: 'Martin', telefon: '070-111 22 33' }, ...extra,
});
const svar = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('markägarens länk: Din skog', () => {
  let anrop: { url: string; init?: any }[];
  let nastaVy: any;
  beforeEach(() => {
    anrop = []; nastaVy = vy();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      anrop.push({ url, init });
      return svar(200, nastaVy);
    }));
  });

  it('uppifrån: namn, "avverkar åt Vida", gul rad medan maskinerna arbetar, % klart (aldrig klart-datum), kartan UTAN maskiner, knappen', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    expect(q('besok-namn')!.textContent).toBe('Skälviken');
    expect(el!.textContent).toContain('Kompersmåla Skog avverkar åt Vida');
    expect(q('besok-arbetar')!.textContent).toContain('Maskiner arbetar här – anmäl dig innan du går ut');
    expect(q('besok-framsteg')!.textContent).toBe('62 % klart');
    expect(el!.textContent).not.toMatch(/klart ca|fredag/);
    expect(q('karta-stub')!.getAttribute('data-maskiner')).toBe('0');
    expect(q('karta-stub')!.getAttribute('data-prickar')).toBe('2');
    expect(q('besok-huvudregel')).toBeNull();                  // säkerheten bor i besöket, inte på Din skog
    expect(q('besok-kommer')!.textContent).toBe('Jag kommer på besök');
    expect(el!.textContent).not.toMatch(/röta|m³|förare/i);
  });

  it('inga maskiner igång: ingen gul rad', async () => {
    nastaVy = vy({ maskiner: [], roller: [] });
    await visa(<BesokKlient token={TOKEN} />);
    expect(q('besok-arbetar')).toBeNull();
  });

  it('"Därför står träden kvar": intro, "Hittills", raderna med antal, FSC/PEFC-raden — och ingen sektion utan cert', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    const sek = q('besok-skogen')!;
    expect(sek.textContent).toContain('Därför står träden kvar');
    expect(sek.textContent).toContain(SKOG.intro);
    expect(sek.textContent).toContain('Hittills – siffrorna växer medan vi avverkar');
    expect(q('besok-skograd-evighetstrad')!.textContent).toContain('41 av 73');
    expect(q('besok-skograd-toppar')!.textContent).toContain('Ligger kvar med flit – inte slarv');
    await tryck(q('besok-cert'));
    expect(q('besok-certark')!.textContent).toContain('Vida köper certifierat virke');
    act(() => { rot!.unmount(); }); el!.remove();
    nastaVy = vy({ skog: { ...SKOG, intro: null, rader: [], prickar: [] } });
    await visa(<BesokKlient token={TOKEN} />);
    expect(q('besok-skogen')).toBeNull();
  });

  it('tryck på en rad: ark med "Så ska det se ut"-bilden, förklaringen, kravet och kartan med bara den saken; ingen "Inte så här"', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    await tryck(q('besok-skograd-evighetstrad'));
    const ark = q('besok-skogark-evighetstrad')!;
    expect(ark.querySelector('[data-testid="besok-skogark-bild"] svg')).not.toBeNull();
    expect(ark.textContent).toContain('Kravet: minst 10 per hektar');
    expect(ark.textContent).toContain('Prickarna visar ungefärlig plats');
    expect(ark.textContent).not.toContain('Inte så här');
    expect(ark.querySelector('[data-testid="karta-stub"]')!.getAttribute('data-prickar')).toBe('2');
  });

  it('en rad utan målbild och karta: bara text', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    await tryck(q('besok-skograd-toppar'));
    const ark = q('besok-skogark-toppar')!;
    expect(ark.querySelector('svg')).toBeNull();
    expect(ark.querySelector('[data-testid="karta-stub"]')).toBeNull();
  });

  it('Din ved bara när den är beställd', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    expect(q('besok-ved')!.textContent).toContain('3 m · Björk · vid avlägget');
    act(() => { rot!.unmount(); }); el!.remove();
    nastaVy = vy({ skog: { ...SKOG, ved: null } });
    await visa(<BesokKlient token={TOKEN} />);
    expect(q('besok-ved')).toBeNull();
  });

  it('avslutat objekt (410) och okänd länk (404) har egna, tomma sidor', async () => {
    (fetch as any).mockImplementation(async () => svar(410, { ok: false, fel: 'Arbetet på trakten är avslutat' }));
    await visa(<BesokKlient token={TOKEN} />);
    expect(el!.textContent).toContain('Arbetet är klart');
    act(() => { rot!.unmount(); }); el!.remove();
    (fetch as any).mockImplementation(async () => svar(404, { ok: false, fel: 'Länken finns inte' }));
    await visa(<BesokKlient token={TOKEN} />);
    expect(el!.textContent).toContain('Länken finns inte');
  });
});

describe('markägarens länk: besöket i tre steg', () => {
  let anrop: { url: string; init?: any }[];
  let nastaVy: any;
  beforeEach(() => {
    anrop = []; nastaVy = vy();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      anrop.push({ url, init });
      if (url.includes('/anmal')) return svar(200, { ok: true, id: ID, besokstid: TID });
      if (url.includes('/gatt')) return svar(200, { ok: true });
      if (url.includes('besok=')) return svar(200, { ...nastaVy, besok: { id: ID, besokstid: TID, gatt: null, kvitteringar: nastaVy.besok?.kvitteringar ?? [], ...(nastaVy.besok?.maskiner ? { maskiner: nastaVy.besok.maskiner } : {}) } });
      return svar(200, nastaVy);
    }));
  });

  it('steg 1: huvudregeln, "Här just nu", maskinerna på kartan — Fortsätt först efter "Jag har läst"', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    await tryck(q('besok-kommer'));
    const regel = q('besok-huvudregel')!;
    expect(regel.textContent).toContain(HUVUDREGEL.rubrik);
    HUVUDREGEL.steg.forEach((s) => expect(regel.textContent).toContain(s));
    expect(el!.querySelectorAll('[data-testid^="besok-rad-"]')).toHaveLength(3);
    expect(q('besok-rad-skotare')!.tagName).toBe('BUTTON');
    expect(q('besok-rad-skordare')!.tagName).toBe('DIV');
    expect(q('karta-stub')!.getAttribute('data-maskiner')).toBe('2');
    await tryck(q('besok-vidare'));
    expect(q('besok-steg-anmal')).toBeNull();                 // inte läst än
    expect(getComputedStyle(q('besok-vidare')!).pointerEvents).toBe('none');
    await tryck(q('besok-last'));
    expect(q('besok-last')!.getAttribute('aria-checked')).toBe('true');
    await tryck(q('besok-vidare'));
    expect(q('besok-steg-anmal')).not.toBeNull();
    expect(el!.textContent).not.toMatch(/olycka|farlig|döda vinkeln/i);
  });

  it('den gula raden leder också till steg 1; skotarraden öppnar arket med bilden och EN mening', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    await tryck(q('besok-arbetar'));
    await tryck(q('besok-rad-skotare'));
    const ark = q('besok-skotarark')!;
    expect(ark.querySelector('svg')).not.toBeNull();
    expect(ark.querySelector('p')!.textContent).toBe(SKOTARARK_TEXT);
  });

  async function tillSteg2() {
    await visa(<BesokKlient token={TOKEN} />);
    await tryck(q('besok-kommer'));
    await tryck(q('besok-last'));
    await tryck(q('besok-vidare'));
  }

  it('steg 2 → 3: Skicka avstängd tills namn och telefon finns, skickar rätt innehåll och visar läget per maskin', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await tillSteg2();
    const skicka = () => q('besok-skicka') as HTMLButtonElement;
    expect(getComputedStyle(skicka()).pointerEvents).toBe('none');
    const falt = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
    await skriv(falt[0], 'Anna Svensson');
    await skriv(falt[1], '070');
    expect(getComputedStyle(skicka()).pointerEvents).toBe('none');
    await skriv(falt[1], '070-123 45 67');
    await tryck(skicka());
    expect(JSON.parse(anrop.find((a) => a.url.includes('/anmal'))!.init.body)).toEqual({ namn: 'Anna Svensson', telefon: '070-123 45 67', nar: 'nu' });
    expect(q('besok-steg-under')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(`besok_anmalan_v1:${TOKEN}`)!).id).toBe(ID);
    nastaVy = vy({ besok: { id: ID, besokstid: TID, kvitteringar: [{ roll: 'skordare', tid: KVITT }], maskiner: [{ etikett: 'Skördaren Scorpion', roll: 'skordare', tid: KVITT }, { etikett: 'Skotaren Wisent', roll: 'skotare', tid: null }] } });
    await act(async () => { vi.advanceTimersByTime(16000); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    vi.useRealTimers();
    expect(Array.from(el!.querySelectorAll('[data-testid="besok-kvittens"]')).map((n) => n.textContent)).toEqual(['✓ Skördaren Scorpion har sett att du kommer']);
    expect(Array.from(el!.querySelectorAll('[data-testid="besok-ej-sett"]')).map((n) => n.textContent)).toEqual(['Skotaren Wisent: föraren har inte sett dig än – gå inte in, ring oss']);
    expect(q('besok-ring')!.textContent).toContain('Martin');
    expect(q('besok-ring')!.textContent).toContain('070-111 22 33');
    expect(el!.textContent).not.toMatch(/PONS20|A030353|R64428/);
  });

  it('"Välj tid" kräver ett klockslag; serverns fel visas och steget stannar', async () => {
    (fetch as any).mockImplementation(async (url: string) => (url.includes('/anmal') ? svar(429, { ok: false, fel: 'För många anmälningar just nu — försök igen om en stund' }) : svar(200, nastaVy)));
    await tillSteg2();
    const falt = () => Array.from(document.querySelectorAll<HTMLInputElement>('input'));
    await skriv(falt()[0], 'Anna'); await skriv(falt()[1], '0701234567');
    await tryck(Array.from(document.querySelectorAll('[role="tab"]')).find((t) => t.textContent === 'Välj tid')!);
    expect(getComputedStyle(q('besok-skicka')!).pointerEvents).toBe('none');
    await skriv(falt().find((i) => i.type === 'time')!, '14:30');
    await tryck(q('besok-skicka'));
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('För många anmälningar');
    expect(q('besok-steg-anmal')).not.toBeNull();
  });

  it('tillbaka till länken under ett pågående besök: steg 3 direkt', async () => {
    localStorage.setItem(`besok_anmalan_v1:${TOKEN}`, JSON.stringify({ id: ID }));
    await visa(<BesokKlient token={TOKEN} />);
    expect(q('besok-steg-under')).not.toBeNull();
    await tryck(q('besok-tillbaka'));
    expect(q('besok-kommer')!.textContent).toBe('Ditt besök');
    expect(q('besok-arbetar')).toBeNull();                    // besöket är redan anmält
  });

  it('ett besök som är över öppnar Din skog, inte steg 3', async () => {
    localStorage.setItem(`besok_anmalan_v1:${TOKEN}`, JSON.stringify({ id: ID }));
    (fetch as any).mockImplementation(async (url: string) => svar(200, { ...nastaVy, besok: { id: ID, besokstid: TID, gatt: '2026-10-22T12:00:00Z', kvitteringar: [] } }));
    await visa(<BesokKlient token={TOKEN} />);
    expect(q('besok-steg-under')).toBeNull();
    expect(q('besok-kommer')!.textContent).toBe('Jag kommer på besök');
  });

  it('"Jag har gått härifrån": skickar besökets id, glömmer anmälan och visar ett tack på Din skog', async () => {
    localStorage.setItem(`besok_anmalan_v1:${TOKEN}`, JSON.stringify({ id: ID }));
    await visa(<BesokKlient token={TOKEN} />);
    expect(el!.textContent).toContain('Då vet förarna att du har gått');
    await tryck(q('besok-gatt'));
    const post = anrop.find((a) => a.url.includes('/gatt'))!;
    expect(post.url).toBe(`/api/besok/${TOKEN}/gatt`);
    expect(JSON.parse(post.init.body)).toEqual({ id: ID });
    expect(localStorage.getItem(`besok_anmalan_v1:${TOKEN}`)).toBeNull();
    expect(q('besok-kvitto')!.textContent).toContain('Förarna vet att du har gått');
    expect(q('besok-steg-under')).toBeNull();
  });
});

describe('hyttens orange kort', () => {
  const b = { id: 'b1', namn: 'Anna Svensson', telefon: '070-123 45 67', besokstid: '2026-10-22T12:30:00Z' };
  it('"Besök: <namn> kommer ca 14:30", knappen "Ring Anna" bredvid Uppfattat (båda ≥ 56 px), textraden "Stäng av när du ser hen" (ingen knapp), +N till', async () => {
    const f = vi.fn();
    await visa(<BesokKortHytt top="12px" besok={b} fler={2} sparar={false} fel={null} onUppfattat={f} />);
    expect(q('besok-kort-rubrik')!.textContent).toMatch(/^Besök: Anna Svensson kommer (ca \d\d:\d\d|nu)$/);
    const ring = q('besok-kort-ring') as HTMLAnchorElement;
    expect(ring.tagName).toBe('A');
    expect(ring.textContent).toBe('Ring Anna');
    expect(ring.getAttribute('href')).toBe('tel:0701234567');
    expect(q('besok-kort-tel')).toBeNull();   // numret är en knapp nu, inte en liten länk
    expect(q('besok-kort-fler')!.textContent).toBe('+2 besök till');
    expect(parseInt(ring.style.minHeight)).toBeGreaterThanOrEqual(56);
    expect(parseInt((q('besok-kort-uppfattat') as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(56);
    // bredvid varandra: samma rad, ring före Uppfattat
    expect(ring.parentElement).toBe(q('besok-kort-uppfattat')!.parentElement);
    expect(ring.nextElementSibling).toBe(q('besok-kort-uppfattat'));
    expect(q('besok-kort-stang-av')!.textContent).toBe('Stäng av när du ser hen');
    expect(q('besok-kort-stang-av')!.tagName).toBe('DIV');   // en textrad, inte en knapp
    expect(el!.querySelectorAll('button, a')).toHaveLength(2);   // kortet har bara två knappar: Ring och Uppfattat
    expect(q('besok-kort')!.style.background).toBe('rgb(255, 159, 10)');
    await tryck(q('besok-kort-uppfattat'));
    expect(f).toHaveBeenCalledTimes(1);
    await tryck(q('besok-kort-stang-av'));
    expect(f).toHaveBeenCalledTimes(1);   // ett tryck på textraden gör ingenting
  });
  it('en lång knapptext kortas – knappen växer aldrig ur kortet', async () => {
    await visa(<BesokKortHytt top="12px" besok={{ ...b, namn: 'Maximiliane-Alexandra von Sjöstedt' }} fler={0} sparar={false} fel={null} onUppfattat={() => {}} />);
    const ring = q('besok-kort-ring') as HTMLElement;
    expect(ring.textContent).toBe('Ring Maximiliane-Alexandra');
    expect(ring.style.overflow).toBe('hidden');
    expect(ring.style.textOverflow).toBe('ellipsis');
  });
  it('medan det sparas: Uppfattat är avstängt och säger det; fel visas', async () => {
    await visa(<BesokKortHytt top="12px" besok={b} fler={0} sparar fel="Kunde inte spara — försök igen." onUppfattat={() => {}} />);
    expect((q('besok-kort-uppfattat') as HTMLButtonElement).disabled).toBe(true);
    expect(q('besok-kort-uppfattat')!.textContent).toBe('Sparar …');
    expect(el!.textContent).toContain('Kunde inte spara');
    expect(q('besok-kort-fler')).toBeNull();
  });
});

describe('planerarens kort: Skicka till markägaren', () => {
  // Datum och klockslag i texterna räknas mot "nu": klockan fryses så testet inte beror på vilken dag det körs.
  const props = { objektId: 'o1', status: 'planerad', markagare: 'Kerstin Olsson', markagareTel: '070-003 82 94', fastighet: 'HÅLABÄCK 1:13', planeradStart: '2026-10-23', faktiskStart: null, pagaendeStartad: null };
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-22T14:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });
  const grund = () => ({
    laddat: true, migrering: true, fel: null, lank: { token: TOKEN, aktiv: true }, besok: [], kvittenser: [], sms: [], maskinNamn: {}, personNamn: { m1: 'Martin Lindqvist' },
    avsandare: { id: 'm1', namn: 'Martin Lindqvist', telefon: '070-111 22 33' }, sattAktiv: vi.fn(async () => null), loggaSms: vi.fn(async () => null), laddaOm: vi.fn(),
  });
  beforeEach(() => { hook.ut = grund(); vi.stubGlobal('navigator', { ...navigator, userAgent: 'iPhone', maxTouchPoints: 5 }); });
  const sms = (handelse: string, tid = '2026-10-22T11:00:00Z') => ({ id: handelse, oppnad_av: 'm1', oppnad_at: tid, mottagare_namn: null, mottagare_nummer: null, handelse });

  it('öppnar Meddelanden med mottagare och text ifyllda, loggar öppnandet — skickar ingenting själv', async () => {
    const nav = vi.fn();
    await visa(<BesokPlanerare {...props} navigera={nav} origin="https://app.test" />);
    await tryck(q('kort-besok-sms'));
    expect(nav).toHaveBeenCalledTimes(1);
    const href = nav.mock.calls[0][0] as string;
    expect(href.startsWith('sms:0700038294&body=')).toBe(true);
    const text = decodeURIComponent(href.split('body=')[1]);
    expect(text).toContain('Hej Kerstin!');
    expect(text).toContain(`https://app.test/besok/${TOKEN}`);
    expect(text).toContain('Hålabäck 1:13 i morgon');
    expect(text).toContain('Martin, Kompersmåla Skog\n070-111 22 33');
    expect(hook.ut.loggaSms).toHaveBeenCalledWith({ avsandareId: 'm1', mottagareNamn: 'Kerstin', mottagareNummer: '0700038294', handelse: 'oppnad' });
  });
  it('saknas markägarens nummer: tomt mottagarfält och en rad som säger att planeraren skriver det själv', async () => {
    const nav = vi.fn();
    await visa(<BesokPlanerare {...props} markagareTel={null} navigera={nav} origin="https://app.test" />);
    expect(q('kort-besok-sms')!.textContent).toContain('nummer saknas — du skriver det själv');
    await tryck(q('kort-besok-sms'));
    expect((nav.mock.calls[0][0] as string).startsWith('sms:&body=')).toBe(true);
  });
  it('avstängd länk, avslutad trakt eller ingen länk än: ingenting öppnas', async () => {
    const nav = vi.fn();
    hook.ut = { ...grund(), lank: { token: TOKEN, aktiv: false } };
    await visa(<BesokPlanerare {...props} navigera={nav} />);
    await tryck(q('kort-besok-sms'));
    expect(nav).not.toHaveBeenCalled();
    expect(q('kort-besok-sms')!.textContent).toContain('Länken är avstängd');
    act(() => { rot!.unmount(); }); el!.remove();
    hook.ut = grund();
    await visa(<BesokPlanerare {...props} status="avslutat" navigera={nav} />);
    await tryck(q('kort-besok-sms'));
    expect(nav).not.toHaveBeenCalled();
    act(() => { rot!.unmount(); }); el!.remove();
    hook.ut = { ...grund(), lank: null };
    await visa(<BesokPlanerare {...props} navigera={nav} />);
    await tryck(q('kort-besok-sms'));
    expect(nav).not.toHaveBeenCalled();
  });
  it('visar när SMS:et senast öppnades och av vem – och att det INTE är bekräftat skickat', async () => {
    hook.ut = { ...grund(), sms: [sms('oppnad')] };
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-sms')!.textContent).toContain('Öppnat 13:00 av Martin – inte bekräftat skickat');
  });
  it('efter att Meddelanden öppnats frågas "Skickade du SMS:et?" – Ja loggar skickad, Nej loggar ej_skickad', async () => {
    hook.ut = { ...grund(), sms: [sms('oppnad')] };
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-sms-fraga')!.textContent).toContain('Skickade du SMS:et?');
    await tryck(q('kort-besok-sms-ja'));
    expect(hook.ut.loggaSms).toHaveBeenLastCalledWith({ avsandareId: 'm1', mottagareNamn: 'Kerstin', mottagareNummer: '0700038294', handelse: 'skickad' });
    await tryck(q('kort-besok-sms-nej'));
    expect(hook.ut.loggaSms).toHaveBeenLastCalledWith({ avsandareId: 'm1', mottagareNamn: 'Kerstin', mottagareNummer: '0700038294', handelse: 'ej_skickad' });
  });
  it('frågan ligger kvar tills den är besvarad (även efter en omladdning – den härleds ur loggen) och försvinner när den är det', async () => {
    hook.ut = { ...grund(), sms: [sms('kopierad')] };
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-sms-fraga')).not.toBeNull();
    act(() => { rot!.unmount(); }); el!.remove();
    hook.ut = { ...grund(), sms: [sms('skickad', '2026-10-22T11:05:00Z'), sms('kopierad')] };
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-sms-fraga')).toBeNull();
    expect(q('kort-besok-sms')!.textContent).toContain('Skickat 13:05 av Martin');
    act(() => { rot!.unmount(); }); el!.remove();
    hook.ut = { ...grund(), sms: [sms('ej_skickad', '2026-10-22T11:05:00Z'), sms('oppnad')] };
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-sms-fraga')).toBeNull();
    expect(q('kort-besok-sms')!.textContent).toContain('Inte skickat');
  });
  it('ingen fråga när inget har öppnats, och inte för en avslutad trakt', async () => {
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-sms-fraga')).toBeNull();
    act(() => { rot!.unmount(); }); el!.remove();
    hook.ut = { ...grund(), sms: [sms('oppnad')] };
    await visa(<BesokPlanerare {...props} status="avslutat" />);
    expect(q('kort-besok-sms-fraga')).toBeNull();
  });
  it('PÅ DATOR öppnas ingen sms:-länk: knappen heter "Kopiera SMS-text och länk", texten (med länken) kopieras och "kopierad" loggas', async () => {
    const nav = vi.fn(); const kop = vi.fn(async (_t: string) => {});
    await visa(<BesokPlanerare {...props} mobil={false} navigera={nav} kopiera={kop} origin="https://app.test" />);
    expect(q('kort-besok-sms')!.textContent).toContain('Kopiera SMS-text och länk');
    expect(q('kort-besok-sms')!.textContent).not.toContain('Skicka till markägaren');
    await tryck(q('kort-besok-sms'));
    expect(nav).not.toHaveBeenCalled();
    expect(kop).toHaveBeenCalledTimes(1);
    const text = kop.mock.calls[0][0] as string;
    expect(text).toContain('Hej Kerstin!');
    expect(text).toContain(`https://app.test/besok/${TOKEN}`);
    expect(hook.ut.loggaSms).toHaveBeenCalledWith({ avsandareId: 'm1', mottagareNamn: 'Kerstin', mottagareNummer: '0700038294', handelse: 'kopierad' });
    expect(q('kort-besok')!.textContent).toContain('Kopierat');
  });
  it('går kopieringen inte: inget loggas och planeraren får veta det', async () => {
    const kop = vi.fn(async () => { throw new Error('nej'); });
    await visa(<BesokPlanerare {...props} mobil={false} kopiera={kop} origin="https://app.test" />);
    await tryck(q('kort-besok-sms'));
    expect(hook.ut.loggaSms).not.toHaveBeenCalled();
    expect(q('kort-besok')!.textContent).toContain('Kunde inte kopiera');
  });
  it('mobil/dator avgörs ur webbläsaren när inget är angivet', async () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 });
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-sms')!.textContent).toContain('Kopiera SMS-text och länk');
  });
  it('saknar planeraren eget nummer används företagets i SMS:et; saknas båda står en rad som säger det INNAN man skickar', async () => {
    const kop = vi.fn(async (_t: string) => {});
    hook.ut = { ...grund(), avsandare: { id: 'm1', namn: 'Martin Lindqvist', telefon: null } };
    await visa(<BesokPlanerare {...props} mobil={false} kopiera={kop} foretagTelefon="0470-12 345" origin="https://app.test" />);
    expect(q('kort-besok-nummer-saknas')).toBeNull();
    await tryck(q('kort-besok-sms'));
    expect(kop.mock.calls[0][0].trimEnd().endsWith('0470-12 345')).toBe(true);
    act(() => { rot!.unmount(); }); el!.remove();
    await visa(<BesokPlanerare {...props} mobil={false} kopiera={kop} foretagTelefon="" origin="https://app.test" />);
    expect(q('kort-besok-nummer-saknas')!.textContent).toContain('Admin › Medarbetare');
  });
  it('länken på/av och "Visa som markägaren"', async () => {
    const sida = vi.fn();
    await visa(<BesokPlanerare {...props} oppnaSida={sida} origin="https://app.test" />);
    expect(q('kort-besok-lank-lage')!.textContent).toBe('På');
    await tryck(q('kort-besok-lank'));
    expect(hook.ut.sattAktiv).toHaveBeenCalledWith(false);
    await tryck(q('kort-besok-sida'));
    expect(sida).toHaveBeenCalledWith(`https://app.test/besok/${TOKEN}`);
  });
  it('loggen: alla anmälningar med vilken maskin som tryckt Uppfattat och när', async () => {
    hook.ut = { ...grund(), maskinNamn: { M1: 'Giant' }, besok: [{ id: 'b1', namn: 'Anna', telefon: '070-1', besokstid: '2026-10-22T12:30:00Z', skapad_at: '2026-10-22T11:10:00Z' }, { id: 'b2', namn: 'Per', telefon: '070-2', besokstid: '2026-10-22T13:30:00Z', skapad_at: '2026-10-22T11:20:00Z' }],
      kvittenser: [{ besok_id: 'b1', maskin_id: 'M1', roll: 'skordare', forare_id: 'm1', kvitterad_at: '2026-10-22T11:52:00Z', testlage: false }], personNamn: { m1: 'Martin Lindqvist' } };
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-logg')!.textContent).toContain('Besök (2)');
    await tryck(q('kort-besok-logg'));
    const rader = Array.from(el!.querySelectorAll('[data-testid="kort-besok-logg-rad"]')).map((r) => r.textContent);
    expect(rader).toHaveLength(2);
    expect(rader[1]).toContain('Anna');
    expect(rader[1]).toContain('✓ Giant · Martin · 13:52');
    expect(rader[0]).toContain('Ingen maskin har kvitterat än');
  });
  it('migrationen ej körd: ett ärligt besked i stället för en tom logg', async () => {
    hook.ut = { ...grund(), migrering: false };
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-migrering')!.textContent).toContain('inte aktiverad i databasen');
  });
});
