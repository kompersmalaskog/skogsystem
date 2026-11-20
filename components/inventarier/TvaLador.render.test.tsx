// @vitest-environment jsdom
// Två lådor och QR-koderna, renderat på riktigt mot databasen i minnet (fakeDb.testStod.ts):
//   1. Sågkedjan läggs upp som "Två lådor" → inget att beställa → Reservlådan påbörjad → 1 att beställa → Beställd →
//      Kommit in → borta. Ingen räknar något.
//   2. QR-koden på reservlådan (/i/<id>) anmäler direkt, EN gång: en andra skanning säger "Redan anmäld" och anmäler inte
//      igen. Ångra nollar. En etikett på något som räknas öppnar radens ark i stället — en skanning räknar aldrig ned.
//   3. Etikettsidan väljer förbrukningen i förväg och skriver ut en QR-kod per vald rad.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fakeKlient, grunddata, nyFakeDb, type FakeDb } from './fakeDb.testStod';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ db: null as any, roll: 'admin' as 'admin' | 'forare', push: [] as string[], replace: [] as string[] }));

vi.mock('@/lib/supabase', async () => {
  const { fakeKlient: fk } = await import('./fakeDb.testStod');
  return {
    supabase: {
      from: (t: string) => fk(h.db).from(t),
      rpc: (n: string, a: any) => fk(h.db).rpc(n, a),
    },
  };
});
vi.mock('@/lib/CurrentMedarbetareContext', () => ({
  useCurrentMedarbetare: () => ({ medarbetare: { id: 'martin', namn: 'Martin Lindqvist', roll: h.roll, maskin_id: null, partner_user_id: null }, loading: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (u: string) => h.push.push(u), replace: (u: string) => h.replace.push(u) }),
}));

import InventarierStart from './InventarierStart';
import PlatsSida from './PlatsSida';
import Skanning from './Skanning';
import Etiketter from './Etiketter';

let container: HTMLDivElement;
let root: Root;

async function vanta() {
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
}
/** Talet tonar över (Tillstand, RORELSE.byte 250 ms + intoning) — vänta in övergången på riktigt. */
async function vantaOvergang() {
  await act(async () => { await new Promise(r => setTimeout(r, 600)); });
  await vanta();
}
async function montera(el: JSX.Element) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(el); });
  await vanta();
}
async function bytTill(el: JSX.Element) {
  await act(async () => { root.render(el); });
  await vanta();
}
const text = () => document.body.textContent ?? '';
const db = (): FakeDb => h.db;

async function klicka(el: Element | null | undefined) {
  if (!el) throw new Error('Hittade inget att trycka på');
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await vanta();
}
function knapp(t: string): HTMLElement {
  const alla = Array.from(document.body.querySelectorAll('button, a')) as HTMLElement[];
  const k = alla.find(b => (b.textContent ?? '').trim() === t) ?? alla.find(b => (b.textContent ?? '').includes(t));
  if (!k) throw new Error(`Ingen knapp "${t}". Sidan: ${text().slice(0, 400)}`);
  return k;
}
function arInaktiv(el: HTMLElement) { return el.style.pointerEvents === 'none'; }
async function skriv(etikett: string, varde: string) {
  const label = Array.from(document.body.querySelectorAll('label')).find(l => (l.textContent ?? '').trim() === etikett);
  if (!label) throw new Error(`Inget fält "${etikett}"`);
  const input = document.getElementById(label.htmlFor) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, varde);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await vanta();
}

beforeEach(() => {
  h.db = nyFakeDb(grunddata());
  h.roll = 'admin';
  h.push = []; h.replace = [];
  // jsdom kör requestAnimationFrame med en annan klocka än performance.now(), så uppräkningen (useRaknaUpp) hinner aldrig
  // fram här. "Minska rörelse" byter talet direkt — samma väg som en användare med den inställningen får.
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as any;
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  document.body.innerHTML = '';
});


const kedja = { id: 'kedja', namn: 'Sågkedja 3/8 .404', typ: 'forbrukning', enhet: 'st', leverantor: 'Kedjeman', artikelnr: '21LP', anteckning: null, aktiv: true, maskin_id: null, sitter_pa: null };
const tvaLadorRad = { id: 'r-kedja', artikel_id: 'kedja', plats_id: 'hall', hylla: null, antal: null, min_antal: null, bestalld_tid: null, uppdaterad: '', tva_lador: true, reserv_oppnad_tid: null, reserv_oppnad_av: null };

describe('Två lådor', () => {
  it('läggs upp som Två lådor → Reservlådan påbörjad → Beställd → Kommit in → borta, utan att något räknas', async () => {
    await montera(<PlatsSida platsId="hall" />);
    await klicka(knapp('Lägg till'));
    await skriv('Vad är det?', 'Sågkedja 3/8 .404');
    await klicka(document.querySelector('[data-typ="tva_lador"]'));
    expect(document.querySelector('[data-falt="antal"]')).toBeNull();
    await klicka(document.querySelector('[data-testid="lagg-till"]'));
    const r = db().tabeller.inventarie_rad[0];
    expect(r).toMatchObject({ tva_lador: true, antal: null, min_antal: null });
    expect(document.querySelector(`[data-rad="${r.id}"]`)?.textContent).toContain('Två lådor');

    await bytTill(<InventarierStart key="start" />);
    await vantaOvergang();
    expect(text()).toContain('Inget att beställa');

    // Inne i appen: samma sak som QR-koden.
    await skriv('Var finns det?', 'sågkedja');
    await klicka(document.querySelector(`[data-traff="${r.id}"]`));
    expect(document.querySelector('[data-testid="tva-lador-status"]')?.textContent).toBe('Två lådor · första lådan används');
    expect(document.querySelector('[data-testid="tog-1"]')).toBeNull();
    await klicka(document.querySelector('[data-testid="reserv-paborjad"]'));
    expect(db().tabeller.inventarie_rad[0].reserv_oppnad_tid).not.toBeNull();

    await skriv('Var finns det?', '');
    await vantaOvergang();
    expect(document.querySelector('[data-testid="att-bestalla-tal"]')?.textContent).toContain('1');
    const rad = document.querySelector(`[data-bestall="${r.id}"]`)!;
    expect(rad.textContent).toContain('Reservlådan påbörjad');
    expect(rad.textContent).toContain('av Martin');
    expect(rad.textContent).not.toContain('kvar');

    await klicka(rad);
    expect(document.querySelector('[data-testid="reserv-status"]')?.textContent).toContain('Reservlådan påbörjad');
    await klicka(document.querySelector('[data-testid="bestalld"]'));
    await klicka(document.querySelector(`[data-bestall="${r.id}"]`));
    expect(text()).not.toContain('blir ');            // inget antal att fylla i
    const kommit = document.querySelector('[data-testid="kommit-in"]') as HTMLElement;
    expect(arInaktiv(kommit)).toBe(false);
    await klicka(kommit);
    expect(db().tabeller.inventarie_rad[0]).toMatchObject({ antal: null, bestalld_tid: null, reserv_oppnad_tid: null });
    await vantaOvergang();
    expect(text()).toContain('Inget att beställa');
    expect(db().logg.map(l => l.handelse)).toEqual(['reserv_oppnad', 'bestalld', 'kommit_in']);
  });
});

describe('QR-koden /i/<id>', () => {
  beforeEach(() => {
    db().tabeller.inventarie_artikel.push(kedja);
    db().tabeller.inventarie_rad.push({ ...tvaLadorRad });
  });

  it('reservlådan: en skanning anmäler EN gång — en andra säger "Redan anmäld" och anmäler inte igen', async () => {
    await montera(<Skanning radId="r-kedja" />);
    expect(document.querySelector('[data-testid="skanning-klar"]')?.textContent).toContain('Beställs');
    expect(text()).toContain('Sågkedja 3/8 .404');
    expect(text()).toContain('Maskinhallen');
    expect(db().rpcAnrop.filter(a => a.namn === 'inventarie_reserv_oppnad')).toHaveLength(1);

    await bytTill(<Skanning key="igen" radId="r-kedja" />);
    expect(document.querySelector('[data-testid="skanning-besked"]')?.textContent).toMatch(/^Reservlådan anmäldes 21 okt av Martin\. Inget nytt skickat\.$/);
    expect(document.querySelector('[data-testid="skanning-angra"]')).toBeNull();
    expect(db().logg.filter(l => l.handelse === 'reserv_oppnad')).toHaveLength(1);
  });

  it('Ångra nollar anmälan', async () => {
    await montera(<Skanning radId="r-kedja" />);
    await klicka(document.querySelector('[data-testid="skanning-angra"]'));
    expect(document.querySelector('[data-testid="skanning-angrat"]')).not.toBeNull();
    expect(db().tabeller.inventarie_rad[0].reserv_oppnad_tid).toBeNull();
  });

  it('en etikett på något som räknas öppnar radens ark — skanningen räknar aldrig ned', async () => {
    db().tabeller.inventarie_rad[0] = { ...tvaLadorRad, tva_lador: false, antal: 7, min_antal: 6 };
    await montera(<Skanning radId="r-kedja" />);
    expect(h.replace).toEqual(['/inventarier?rad=r-kedja']);
    expect(db().rpcAnrop).toHaveLength(0);
    expect(db().tabeller.inventarie_rad[0].antal).toBe(7);
  });

  it('en borttagen rad: säger det, och skickar ingenting', async () => {
    await montera(<Skanning radId="finns-inte" />);
    expect(document.querySelector('[data-testid="skanning-saknas"]')?.textContent).toContain('Etiketten pekar inte på något längre');
    expect(db().rpcAnrop).toHaveLength(0);
  });

  it('ett fel från databasen visas, och Försök igen anmäler', async () => {
    db().felPa.inventarie_reserv_oppnad = 'Ingen kontakt. Försök igen när du har täckning.';
    await montera(<Skanning radId="r-kedja" />);
    expect(document.querySelector('[data-testid="skanning-fel"]')?.textContent).toContain('Ingen kontakt');
    await klicka(knapp('Försök igen'));
    expect(document.querySelector('[data-testid="skanning-klar"]')).not.toBeNull();
  });
});

describe('Etiketter', () => {
  it('förbrukningen är förvald, utrustningen inte; en QR-kod per vald rad i utskriften', async () => {
    db().tabeller.inventarie_artikel.push(kedja,
      { id: 'olja', namn: 'Kedjeolja', typ: 'forbrukning', enhet: 'dunk', leverantor: null, artikelnr: null, anteckning: null, aktiv: true, maskin_id: null, sitter_pa: null },
      { id: 'knack', namn: 'Mutterknackare', typ: 'utrustning', enhet: 'st', leverantor: null, artikelnr: null, anteckning: null, aktiv: true, maskin_id: null, sitter_pa: null });
    db().tabeller.inventarie_rad.push({ ...tvaLadorRad },
      { ...tvaLadorRad, id: 'r-olja', artikel_id: 'olja', tva_lador: false, antal: 3, min_antal: 2 },
      { ...tvaLadorRad, id: 'r-knack', artikel_id: 'knack', plats_id: 'lbc', tva_lador: false });
    await montera(<Etiketter />);
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    await vanta();

    const val = (id: string) => document.querySelector(`[data-etikett-val="${id}"]`)!.getAttribute('aria-checked');
    expect([val('r-kedja'), val('r-olja'), val('r-knack')]).toEqual(['true', 'true', 'false']);
    expect(document.querySelector('[data-etikett-val="r-kedja"]')?.textContent).toContain('RESERVLÅDA · skanna när du börjar på den');
    expect(knapp('Skriv ut').textContent).toBe('Skriv ut 2 etiketter');
    expect(document.querySelectorAll('[data-etikett] svg')).toHaveLength(2);

    await klicka(document.querySelector('[data-etikett-val="r-knack"]'));
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    await vanta();
    expect(knapp('Skriv ut').textContent).toBe('Skriv ut 3 etiketter');
    expect(document.querySelector('[data-etikett="r-knack"]')?.textContent).toContain('Skanna: var den hör hemma');
  });
});
