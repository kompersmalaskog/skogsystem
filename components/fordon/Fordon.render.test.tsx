// @vitest-environment jsdom
// Fordon (/kontroller) renderas på riktigt (CLAUDE.md: "Rendera innan leverans") mot ett API i minnet.
//   1. Listan: svaret först (ETT tal), Gör nu / Snart / Datum saknas, "Senare" hopfälld, alla fordon per sort. Ingen service.
//   2. Fordonet: svaret i ord, EN vit knapp, kontrollerna. Registrera: Spara grå tills det som krävs finns;
//      cisternkontroll (inget intervall) kräver nästa datum. Skickar rätt typ och kontroll till API:t.
//   3. Ändra fordon finns (förut gick ett fordon inte att ändra eller ta bort), och Ta bort bekräftas i arket.
//   4. En förare ser inga knappar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }), usePathname: () => '/kontroller' }));

import FordonLista from './FordonLista';
import FordonSida from './FordonSida';

function k(id: string, typ: string, nasta_forfall: string | null, extra: Record<string, unknown> = {}) {
  return { id, typ, aktiv: true, nasta_forfall, intervall_manader: 12, intervall_timmar: null, intervall_km: null, senast_utford: null, senast_matarstallning: null, nasta_matarvarde: null, ...extra };
}
const RESURSER = [
  { id: 'volvo', namn: 'Volvo FH', typ: 'lastbil', regnr: 'ABC123', marke: 'Volvo', modell: 'FH16', arsmodell: 2016, matarstallning: 412000, anteckning: null,
    kontroll: [k('k1', 'besiktning', '2026-10-25'), k('k2', 'forsakring', '2026-11-20'), k('k9', 'service', '2026-01-01')] },
  { id: 'slap', namn: 'Kilafors', typ: 'slap', regnr: 'GHI789', marke: null, modell: null, arsmodell: null, matarstallning: null, anteckning: null,
    kontroll: [k('k3', 'besiktning', '2027-05-14')] },
  { id: 'tank', namn: 'Dieseltanken', typ: 'cistern', regnr: null, marke: null, modell: null, arsmodell: null, matarstallning: null, anteckning: null,
    kontroll: [k('k4', 'cisternkontroll', null, { intervall_manader: null })] },
];

let anrop: { url: string; metod: string; body: any }[] = [];
function svara(data: any, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) } as Response);
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 6, 12, 0, 0));
  anrop = []; push.mockReset();
  (globalThis as any).fetch = vi.fn((url: string, init?: RequestInit) => {
    const metod = init?.method ?? 'GET';
    anrop.push({ url, metod, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url === '/api/resurs' && metod === 'GET') return svara({ ok: true, resurs: RESURSER });
    const m = url.match(/^\/api\/resurs\/(\w+)$/);
    if (m && metod === 'GET') return svara({ ok: true, resurs: RESURSER.find(r => r.id === m[1]) });
    if (m && (metod === 'PATCH' || metod === 'DELETE')) return svara({ ok: true, resurs: RESURSER.find(r => r.id === m[1]) });
    if (url.startsWith('/api/handelse?')) return svara({ ok: true, forslag: [], handelser: [{ id: 'h1', typ: 'service', benamning: null, datum: '2026-03-01', kostnad: 4500 }] });
    if (url === '/api/handelse' && metod === 'POST') return svara({ ok: true });
    return svara({ ok: false, error: 'okänd' }, 404);
  });
});

let container: HTMLDivElement;
let root: Root;
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.useRealTimers(); });

async function vanta() { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); }
async function montera(el: JSX.Element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(el); });
  await vanta();
}
const text = () => document.body.textContent ?? '';
async function klicka(el: Element | null | undefined) {
  if (!el) throw new Error('Hittade inget att trycka på');
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await vanta();
}
async function skriv(input: HTMLInputElement, varde: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, varde);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await vanta();
}
const knapp = (t: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === t);

describe('Listan', () => {
  it('svaret först, sedan grupperna — ingen service, inga flikar, inga chips', async () => {
    await montera(<FordonLista kanRedigera />);
    expect(container.querySelector('[data-testid="fordon-tal"]')?.textContent).toContain('behöver göras nu');
    expect(container.querySelector('[data-testid="fordon-tal"]')?.textContent).toContain('1 till snart');
    const lagen = [...container.querySelectorAll('[data-punkt]')].map(e => `${e.getAttribute('data-punkt')}:${e.getAttribute('data-lage')}`);
    expect(lagen).toEqual(['k1:forsenad', 'k2:snart', 'k4:saknar']);
    expect(text()).toContain('Försenad');
    expect(text()).not.toContain('Service');
    expect(knapp('Att göra')).toBeUndefined();
    expect(knapp('Bilar')).toBeUndefined();
    // Senare är hopfälld och fälls ut på plats.
    expect(container.querySelector('[data-punkt="k3"]')).toBeNull();
    await klicka(container.querySelector('[data-testid="visa-senare"]'));
    expect(container.querySelector('[data-punkt="k3"]')).not.toBeNull();
    // Alla fordon per sort.
    expect(text()).toContain('Bilar och lastbilar');
    expect(text()).toContain('Tankar');
    expect(container.querySelectorAll('[data-fordon]').length).toBe(3);
  });

  it('Lägg till fordon: Spara grå tills typ och namn finns', async () => {
    await montera(<FordonLista kanRedigera />);
    await klicka(container.querySelector('[data-testid="lagg-till-fordon"]'));
    const spara = document.querySelector('[data-testid="spara-fordon"]') as HTMLButtonElement;
    expect(spara.disabled).toBe(true);
    await klicka(document.querySelector('[data-typ="slap"]'));
    await skriv(document.querySelector('input[name="namn"]') as HTMLInputElement, 'Nya släpet');
    expect((document.querySelector('[data-testid="spara-fordon"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('en förare ser inga knappar', async () => {
    await montera(<FordonLista kanRedigera={false} />);
    expect(container.querySelector('[data-testid="lagg-till-fordon"]')).toBeNull();
  });
});

describe('Ett fordon', () => {
  it('svaret i ord, EN vit knapp, registrera besiktning skickar rätt typ och kontroll', async () => {
    await montera(<FordonSida id="volvo" kanRedigera />);
    expect(text()).toContain('Besiktning är försenad');
    expect(text()).toContain('Skulle gjorts 25 oktober 2026');
    expect(text()).not.toContain('Service'.toUpperCase());
    // Ett tryck på kontrollen öppnar Registrera med den vald.
    await klicka(container.querySelector('[data-kontrollrad="k1"]'));
    const spara = document.querySelector('[data-testid="spara-registrering"]') as HTMLButtonElement;
    expect(spara.disabled).toBe(false);
    expect(text()).toContain('Nästa gång: 6 november 2027');
    await klicka(spara);
    const post = anrop.find(a => a.url === '/api/handelse' && a.metod === 'POST')!;
    expect(post.body).toMatchObject({ resurs_id: 'volvo', kontroll_id: 'k1', typ: 'besiktning', datum: '2026-11-06', nasta_forfall: null });
  });

  it('cisternkontroll utan intervall: Spara grå tills nästa datum finns', async () => {
    await montera(<FordonSida id="tank" kanRedigera />);
    expect(text()).toContain('Datum saknas');
    await klicka(container.querySelector('[data-testid="registrera"]'));
    const spara = () => document.querySelector('[data-testid="spara-registrering"]') as HTMLButtonElement;
    expect(spara().disabled).toBe(true);
    await skriv(document.querySelector('input[name="nasta"]') as HTMLInputElement, '2032-11-06');
    expect(spara().disabled).toBe(false);
    await klicka(spara());
    const post = anrop.find(a => a.url === '/api/handelse' && a.metod === 'POST')!;
    expect(post.body).toMatchObject({ typ: 'cisternkontroll', kontroll_id: 'k4', nasta_forfall: '2032-11-06' });
  });

  it('Ändra fordon finns, och Ta bort bekräftas i arket innan något skickas', async () => {
    await montera(<FordonSida id="slap" kanRedigera />);
    await klicka(container.querySelector('[data-testid="andra-fordon"]'));
    expect(text()).toContain('Ändra fordon');
    expect((document.querySelector('[data-testid="spara-fordon"]') as HTMLButtonElement).disabled).toBe(true);
    await klicka(document.querySelector('[data-testid="ta-bort-fordon"]'));
    expect(anrop.some(a => a.metod === 'DELETE')).toBe(false);
    expect(text()).toContain('Ta bort Kilafors?');
    await klicka(document.querySelector('[data-testid="bekrafta-ta-bort"]'));
    expect(anrop.some(a => a.metod === 'DELETE' && a.url === '/api/resurs/slap')).toBe(true);
    expect(push).toHaveBeenCalledWith('/kontroller');
  });

  it('en förare ser varken Registrera eller Ändra', async () => {
    await montera(<FordonSida id="volvo" kanRedigera={false} />);
    expect(container.querySelector('[data-testid="registrera"]')).toBeNull();
    expect(container.querySelector('[data-testid="andra-fordon"]')).toBeNull();
    expect(text()).not.toContain('4 500 kr');
  });
});
