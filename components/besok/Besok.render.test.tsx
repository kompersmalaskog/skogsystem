// @vitest-environment jsdom
// Besökssidan (markägaren), hyttens orange kort och planerarens SMS-rad — monterade på riktigt i jsdom.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('next/dynamic', () => ({ default: () => (p: any) => <div data-testid="karta-stub" data-maskiner={p.data.maskiner.length} data-motorsag={p.data.motorsag.length} /> }));

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
const vy = (extra: Record<string, any> = {}) => ({
  ok: true, namn: 'Skälviken', utforare: 'Kompersmåla Skog åt Vida',
  framsteg: { procent: 62, klartCa: 'fredag', text: '62 % klart · klart ca fredag' },
  gran: null, mitt: { lat: 56.35, lng: 15.05 },
  maskiner: [{ roll: 'skordare', lat: 56.35, lng: 15.05, tid: '2026-10-22T11:42:00Z' }, { roll: 'skotare', lat: 56.351, lng: 15.051, tid: '2026-10-22T11:40:00Z' }],
  roller: ['skordare', 'skotare'], motorsag: [], harMotorsag: true, ringM: { skordare: 70, skotare: 20, motorsag: 40 },
  uppdaterad: '2026-10-22T11:42:00Z', besok: null, ...extra,
});
const svar = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('besökssidan', () => {
  let anrop: { url: string; init?: any }[];
  let nastaVy: any;
  beforeEach(() => {
    anrop = []; nastaVy = vy();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      anrop.push({ url, init });
      if (url.includes('/anmal')) return svar(200, { ok: true, id: '11111111-1111-4111-8111-111111111111', besokstid: '2026-10-22T11:42:00Z' });
      if (url.includes('besok=')) return svar(200, { ...nastaVy, besok: { id: '11111111-1111-4111-8111-111111111111', besokstid: '2026-10-22T11:42:00Z', kvitteringar: nastaVy.besok?.kvitteringar ?? [] } });
      return svar(200, nastaVy);
    }));
  });

  it('uppifrån: traktnamn, utförare, framsteg, huvudregeln, "Här just nu", kartan och knappen', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    expect(q('besok-namn')!.textContent).toBe('Skälviken');
    expect(el!.textContent).toContain('Kompersmåla Skog åt Vida');
    expect(q('besok-framsteg')!.textContent).toBe('62 % klart · klart ca fredag');
    const regel = q('besok-huvudregel')!;
    expect(regel.textContent).toContain(HUVUDREGEL.rubrik);
    HUVUDREGEL.steg.forEach((s) => expect(regel.textContent).toContain(s));
    expect(q('karta-stub')!.getAttribute('data-maskiner')).toBe('2');
    expect(q('besok-uppdaterad')!.textContent).toBe('Uppdaterad 13:42');
    expect(q('besok-kommer')!.textContent).toBe('Jag kommer på besök');
    // ordning i dokumentet: huvudregel före "Här just nu" före kartan
    const alla = Array.from(el!.querySelectorAll('[data-testid]')).map((n) => n.getAttribute('data-testid'));
    expect(alla.indexOf('besok-huvudregel')).toBeLessThan(alla.indexOf('besok-har-just-nu'));
    expect(alla.indexOf('besok-har-just-nu')).toBeLessThan(alla.indexOf('karta-stub'));
  });

  it('"Här just nu": bara det som finns, max tre rader — och ingen annan säkerhetstext på sidan', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    expect(el!.querySelectorAll('[data-testid^="besok-rad-"]')).toHaveLength(3);
    expect(q('besok-rad-skotare')!.textContent).toContain('Gå aldrig bakom skotaren eller mellan skotaren och virkeshögen');
    expect(q('besok-rad-skordare')!.textContent).toContain('Träd kan falla åt alla håll');
    expect(q('besok-rad-motorsag')!.textContent).toContain('Någon fäller med motorsåg här');
    // Bara skotarraden går att trycka på
    expect(q('besok-rad-skotare')!.tagName).toBe('BUTTON');
    expect(q('besok-rad-skordare')!.tagName).toBe('DIV');
    expect(q('besok-rad-motorsag')!.tagName).toBe('DIV');
    // Hela sidans text: inga andra säkerhetsmeningar än huvudregeln och raderna
    const text = el!.textContent!;
    expect(text).not.toMatch(/olycka|risk|varning|farlig|skada|döda vinkeln|reflexväst.*reflexväst/i);
  });

  it('inga maskiner på trakten: inga rader, ingen maskin på kartan, ärlig text', async () => {
    nastaVy = vy({ maskiner: [], roller: [], harMotorsag: false });
    await visa(<BesokKlient token={TOKEN} />);
    expect(q('besok-har-just-nu')).toBeNull();
    expect(q('besok-huvudregel')).not.toBeNull();   // huvudregeln finns alltid
    expect(q('besok-uppdaterad')!.textContent).toContain('Inga maskiner är igång på trakten just nu');
  });

  it('tryck på skotarraden öppnar arket: bilden och EN mening — inga nya regler', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    await tryck(q('besok-rad-skotare'));
    const ark = q('besok-skotarark')!;
    expect(ark.querySelector('svg')).not.toBeNull();
    expect(ark.querySelector('p')!.textContent).toBe(SKOTARARK_TEXT);
    expect(ark.querySelectorAll('p')).toHaveLength(1);
    await tryck(q('besok-rad-skordare'));   // skördarraden gör inget
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it('anmälan: Skicka är avstängd tills namn och telefon finns, skickar rätt innehåll, visar "väntar på föraren" och sedan kvitteringen', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });   // bara pollningen styrs; löften och övrig tid är på riktigt
    await visa(<BesokKlient token={TOKEN} />);
    await tryck(q('besok-kommer'));
    const skicka = () => q('besok-skicka') as HTMLButtonElement;
    expect(getComputedStyle(skicka()).pointerEvents).toBe('none');
    const falt = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
    await skriv(falt[0], 'Anna Svensson');
    await skriv(falt[1], '070-123 45 67');
    expect(getComputedStyle(skicka()).pointerEvents).not.toBe('none');
    await tryck(skicka());
    const post = anrop.find((a) => a.url.includes('/anmal'))!;
    expect(post.url).toBe(`/api/besok/${TOKEN}/anmal`);
    expect(JSON.parse(post.init.body)).toEqual({ namn: 'Anna Svensson', telefon: '070-123 45 67', nar: 'nu' });
    expect(q('besok-vantar')!.textContent).toBe('Skickat · väntar på föraren');
    expect(JSON.parse(localStorage.getItem(`besok_anmalan_v1:${TOKEN}`)!).id).toBe('11111111-1111-4111-8111-111111111111');
    // nästa läsning bär kvitteringen
    nastaVy = vy({ besok: { id: '11111111-1111-4111-8111-111111111111', besokstid: '2026-10-22T11:42:00Z', kvitteringar: [{ roll: 'skordare', tid: '2026-10-22T11:52:00Z' }] } });
    await act(async () => { vi.advanceTimersByTime(16000); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    vi.useRealTimers();
    expect(Array.from(el!.querySelectorAll('[data-testid="besok-kvittens"]')).map((n) => n.textContent)).toEqual(['✓ Skördaren har sett det 13:52']);
    expect(q('besok-vantar')).toBeNull();
  });

  it('"Välj tid" kräver ett klockslag', async () => {
    await visa(<BesokKlient token={TOKEN} />);
    await tryck(q('besok-kommer'));
    const falt = () => Array.from(document.querySelectorAll<HTMLInputElement>('input'));
    await skriv(falt()[0], 'Anna'); await skriv(falt()[1], '0701234567');
    await tryck(Array.from(document.querySelectorAll('[role="tab"]')).find((t) => t.textContent === 'Välj tid')!);
    expect(getComputedStyle(q('besok-skicka')!).pointerEvents).toBe('none');
    const tid = falt().find((i) => i.type === 'time')!;
    await skriv(tid, '14:30');
    expect(getComputedStyle(q('besok-skicka')!).pointerEvents).not.toBe('none');
  });

  it('serverns fel visas och anmälan stannar öppen', async () => {
    (fetch as any).mockImplementation(async (url: string) => (url.includes('/anmal') ? svar(429, { ok: false, fel: 'För många anmälningar just nu — försök igen om en stund' }) : svar(200, nastaVy)));
    await visa(<BesokKlient token={TOKEN} />);
    await tryck(q('besok-kommer'));
    const falt = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
    await skriv(falt[0], 'Anna'); await skriv(falt[1], '0701234567');
    await tryck(q('besok-skicka'));
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('För många anmälningar');
    expect(q('besok-skicka')).not.toBeNull();
  });

  it('avslutat objekt (410) och okänd länk (404) har egna, tomma sidor', async () => {
    (fetch as any).mockImplementation(async () => svar(410, { ok: false, fel: 'Arbetet på trakten är avslutat' }));
    await visa(<BesokKlient token={TOKEN} />);
    expect(el!.textContent).toContain('Arbetet är klart');
    expect(q('besok-huvudregel')).toBeNull();
    act(() => { rot!.unmount(); }); el!.remove();
    (fetch as any).mockImplementation(async () => svar(404, { ok: false, fel: 'Länken finns inte' }));
    await visa(<BesokKlient token={TOKEN} />);
    expect(el!.textContent).toContain('Länken finns inte');
  });
});

describe('hyttens orange kort', () => {
  const b = { id: 'b1', namn: 'Anna Svensson', telefon: '070-123 45 67', besokstid: '2026-10-22T12:30:00Z' };
  it('"Besök: <namn> kommer ca 14:30", telefon, Uppfattat ≥ 56 px, +N till', async () => {
    const f = vi.fn();
    await visa(<BesokKortHytt top="12px" besok={b} fler={2} sparar={false} fel={null} onUppfattat={f} />);
    expect(q('besok-kort-rubrik')!.textContent).toMatch(/^Besök: Anna Svensson kommer (ca \d\d:\d\d|nu)$/);
    expect(q('besok-kort-tel')!.getAttribute('href')).toBe('tel:0701234567');
    expect(q('besok-kort-fler')!.textContent).toBe('+2 besök till');
    expect(parseInt((q('besok-kort-uppfattat') as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(56);
    expect(q('besok-kort')!.style.background).toBe('rgb(255, 159, 10)');
    await tryck(q('besok-kort-uppfattat'));
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('medan det sparas: knappen är avstängd och säger det; fel visas', async () => {
    await visa(<BesokKortHytt top="12px" besok={b} fler={0} sparar fel="Kunde inte spara — försök igen." onUppfattat={() => {}} />);
    expect((q('besok-kort-uppfattat') as HTMLButtonElement).disabled).toBe(true);
    expect(q('besok-kort-uppfattat')!.textContent).toBe('Sparar …');
    expect(el!.textContent).toContain('Kunde inte spara');
    expect(q('besok-kort-fler')).toBeNull();
  });
});

describe('planerarens kort: Skicka till markägaren', () => {
  const props = { objektId: 'o1', status: 'planerad', markagare: 'Kerstin Olsson', markagareTel: '070-003 82 94', fastighet: 'HÅLABÄCK 1:13', planeradStart: '2026-10-23', faktiskStart: null, pagaendeStartad: null };
  const grund = () => ({
    laddat: true, migrering: true, fel: null, lank: { token: TOKEN, aktiv: true }, besok: [], kvittenser: [], sms: [], maskinNamn: {}, personNamn: { m1: 'Martin Lindqvist' },
    avsandare: { id: 'm1', namn: 'Martin Lindqvist', telefon: '070-111 22 33' }, sattAktiv: vi.fn(async () => null), loggaSms: vi.fn(async () => null), laddaOm: vi.fn(),
  });
  beforeEach(() => { hook.ut = grund(); vi.stubGlobal('navigator', { ...navigator, userAgent: 'iPhone', maxTouchPoints: 5 }); });

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
    expect(hook.ut.loggaSms).toHaveBeenCalledWith({ avsandareId: 'm1', mottagareNamn: 'Kerstin', mottagareNummer: '0700038294' });
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
  it('visar när SMS:et senast öppnades och av vem', async () => {
    hook.ut = { ...grund(), sms: [{ id: 's', oppnad_av: 'm1', oppnad_at: '2026-10-22T11:00:00Z', mottagare_namn: null, mottagare_nummer: null }] };
    await visa(<BesokPlanerare {...props} />);
    expect(q('kort-besok-sms')!.textContent).toContain('Öppnat 13:00 av Martin');
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
