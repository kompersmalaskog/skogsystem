// @vitest-environment jsdom
// Inventarievyn renderas på riktigt (CLAUDE.md: "Rendera innan leverans") mot en databas i minnet med samma regler
// som databasfunktionerna (fakeDb.testStod.ts). Testerna är uppdragets "Klart när":
//   1. Sågkedjan 7, min 6 → Tog 1 två gånger → under Att beställa → Beställd → Kommit in 6 → 11 och borta. Fyra rader i loggen.
//   2. Stefans bil läggs till, en mutterknackare läggs där, "mutter" hittar den. Flyttas till Wisents depåskåp → sök visar det.
//   3. Hydraulslangen till Wisents hjularm: "wisent hjularm" hittar den.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fakeKlient, grunddata, nyFakeDb, type FakeDb } from './fakeDb.testStod';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ db: null as any, roll: 'admin' as 'admin' | 'forare' }));

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

import InventarierStart from './InventarierStart';
import PlatsSida from './PlatsSida';

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

describe('Inventarier — att beställa', () => {
  beforeEach(() => {
    db().tabeller.inventarie_artikel.push({ id: 'kedja', namn: 'Sågkedja 3/8 .404', typ: 'forbrukning', enhet: 'st', leverantor: 'Kedjeman', artikelnr: '21LP', anteckning: null, aktiv: true, maskin_id: null, sitter_pa: null });
    db().tabeller.inventarie_rad.push({ id: 'r-kedja', artikel_id: 'kedja', plats_id: 'hall', hylla: '3', antal: 7, min_antal: 6, bestalld_tid: null, uppdaterad: '' });
  });

  it('Tog 1 två gånger → under min → Beställd → Kommit in 6 → 11 och borta; fyra rader i loggen', async () => {
    await montera(<InventarierStart />);
    expect(text()).toContain('Inget att beställa');

    // Två uttag ur hallen (via sökningen, som en förare som letar).
    for (const vantat of [6, 5]) {
      await skriv('Var finns det?', 'sågkedja');
      await klicka(document.querySelector('[data-traff="r-kedja"]'));
      expect(text()).toContain('kvar · min 6');
      await klicka(document.querySelector('[data-testid="tog-1"]'));
      expect(db().tabeller.inventarie_rad[0].antal).toBe(vantat);
      expect(text()).toContain(`Tog 1 · ${vantat} kvar`);
    }

    // Under min: talet och raden.
    await skriv('Var finns det?', '');
    await vantaOvergang();
    expect(document.querySelector('[data-testid="att-bestalla-tal"]')?.textContent).toContain('1');
    expect(text()).toContain('att beställa');
    const rad = document.querySelector('[data-bestall="r-kedja"]')!;
    expect(rad.textContent).toContain('5 kvar');
    expect(rad.textContent).toContain('min 6');

    // Beställd: raden ligger kvar dämpad, talet räknar den inte.
    await klicka(rad);
    expect(text()).toContain('Kedjeman');
    await klicka(document.querySelector('[data-testid="bestalld"]'));
    expect(db().tabeller.inventarie_rad[0].bestalld_tid).not.toBeNull();
    await vantaOvergang();
    expect(text()).toContain('Inget att beställa');
    expect(document.querySelector('[data-testid="att-bestalla-tal"]')).toBeNull();
    expect(document.querySelector('[data-bestall="r-kedja"]')?.textContent).toContain('Beställd');

    // Kommit in: förifyllt upp till min (1), skriv 6 → blir 11.
    await klicka(document.querySelector('[data-bestall="r-kedja"]'));
    expect(text()).toContain('blir 6 · min 6');
    await skriv('Antal', '6');
    expect(text()).toContain('blir 11 · min 6');
    await klicka(document.querySelector('[data-testid="kommit-in"]'));
    expect(db().tabeller.inventarie_rad[0].antal).toBe(11);
    expect(db().tabeller.inventarie_rad[0].bestalld_tid).toBeNull();
    expect(document.querySelector('[data-bestall="r-kedja"]')).toBeNull();

    expect(db().logg.map(l => l.handelse)).toEqual(['uttag', 'uttag', 'bestalld', 'kommit_in']);
  });

  it('ett fel från databasen visas i arket som det är, och inget räknas som sparat', async () => {
    db().felPa.inventarie_ta_ut = 'Logga in för att ta ut';
    await montera(<InventarierStart />);
    await skriv('Var finns det?', 'kedja');
    await klicka(document.querySelector('[data-traff="r-kedja"]'));
    await klicka(document.querySelector('[data-testid="tog-1"]'));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Logga in för att ta ut');
    expect(db().tabeller.inventarie_rad[0].antal).toBe(7);
    expect(document.querySelector('[data-testid="kvitto"]')).toBeNull();
  });

  it('pushens länk ?rad=<id> öppnar radens ark direkt', async () => {
    db().tabeller.inventarie_rad[0].antal = 5;
    window.history.replaceState(null, '', '/inventarier?rad=r-kedja');
    await montera(<InventarierStart />);
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Sågkedja 3/8 .404');
    expect(document.querySelector('[data-testid="bestalld"]')).not.toBeNull();
    expect(window.location.search).toBe('');
  });
});

describe('Inventarier — var finns det?', () => {
  it('Stefans bil → mutterknackare → "mutter" hittar den → flytt till Wisents skåp syns i sökningen', async () => {
    await montera(<InventarierStart />);

    // Ny plats (admin): Stefans bil.
    await klicka(knapp('Ny plats'));
    await skriv('Namn', 'Stefans bil');
    await klicka(document.querySelector('[data-platstyp="bil"]'));
    await klicka(document.querySelector('[data-testid="spara-plats"]'));
    const bil = db().tabeller.inventarie_plats.find(p => p.namn === 'Stefans bil')!;
    expect(bil.typ).toBe('bil');
    expect(text()).toContain('Bilar');

    // Platsvyn: tom med förklaring, sedan Lägg till.
    await bytTill(<PlatsSida platsId={bil.id} />);
    expect(document.querySelector('[data-testid="tom"]')?.textContent).toContain('så slipper någon ringa och fråga');
    expect(document.querySelector('[data-testid="kollad"]')?.textContent).toBe('Aldrig kollad');
    await klicka(document.querySelector('[data-testid="lagg-till-knapp"]'));
    const laggTill = document.querySelector('[data-testid="lagg-till"]') as HTMLElement;
    expect(arInaktiv(laggTill)).toBe(true);
    await skriv('Vad är det?', 'Mutterknackare');
    expect(arInaktiv(document.querySelector('[data-testid="lagg-till"]') as HTMLElement)).toBe(false);
    await klicka(document.querySelector('[data-testid="lagg-till"]'));
    const mutter = db().tabeller.inventarie_artikel.find(a => a.namn === 'Mutterknackare')!;
    expect(mutter.typ).toBe('utrustning');
    expect(db().tabeller.inventarie_rad.find(r => r.artikel_id === mutter.id)?.antal).toBeNull();

    // Stämmer.
    await klicka(document.querySelector('[data-testid="stammer"]'));
    expect(document.querySelector('[data-testid="kollad"]')?.textContent).toContain('Senast kollad 21 okt av Martin');

    // Sök.
    await bytTill(<InventarierStart />);
    await skriv('Var finns det?', 'mutter');
    const traff = document.querySelector('[data-traff]')!;
    expect(traff.textContent).toContain('Mutterknackare');
    expect(traff.textContent).toContain('Stefans bil');

    // Flytta till Wisents depåskåp.
    await klicka(traff);
    await klicka(knapp('Flytta'));
    await klicka(document.querySelector('[data-flytta-till="skap-w"]'));
    expect(text()).toContain('Flyttad till Depåskåp Wisent');
    await skriv('Var finns det?', 'mutter');
    expect(document.querySelector('[data-traff]')?.textContent).toContain('Depåskåp Wisent');
    expect(db().logg.some(l => l.handelse === 'flytt' && l.till_plats_id === 'skap-w')).toBe(true);
  });

  it('ingen träff: säger det och erbjuder Lägg till med namnet ifyllt', async () => {
    await montera(<InventarierStart />);
    await skriv('Var finns det?', 'Momentnyckel');
    expect(document.querySelector('[data-testid="ingen-traff"]')?.textContent).toContain('Ingen Momentnyckel registrerad');
    await klicka(knapp('Lägg till'));
    const falt = Array.from(document.querySelectorAll('input')).find(i => (i as HTMLInputElement).value === 'Momentnyckel');
    expect(falt).toBeTruthy();
    // Platsen saknas: Lägg till är grå tills en plats är vald.
    expect(arInaktiv(document.querySelector('[data-testid="lagg-till"]') as HTMLElement)).toBe(true);
    await klicka(knapp('Plats'));
    await klicka(document.querySelector('[data-plats="lbc"]'));
    await klicka(document.querySelector('[data-testid="lagg-till"]'));
    const r = db().tabeller.inventarie_rad.find(x => x.plats_id === 'lbc');
    expect(r).toBeTruthy();
  });

  it('hydraulslangen till Wisents hjularm: "wisent hjularm" hittar den, Giants slang gör det inte', async () => {
    db().tabeller.inventarie_artikel.push(
      { id: 'sl-w', namn: 'Hydraulslang', typ: 'utrustning', enhet: 'st', leverantor: null, artikelnr: null, anteckning: null, aktiv: true, maskin_id: 'A030353', sitter_pa: 'Hjularm vänster' },
      { id: 'sl-g', namn: 'Hydraulslang', typ: 'utrustning', enhet: 'st', leverantor: null, artikelnr: null, anteckning: null, aktiv: true, maskin_id: 'PONS20SDJAA270231', sitter_pa: 'Hjularm vänster' },
    );
    db().tabeller.inventarie_rad.push(
      { id: 'r-sl-w', artikel_id: 'sl-w', plats_id: 'hall', hylla: null, antal: null, min_antal: null, bestalld_tid: null, uppdaterad: '' },
      { id: 'r-sl-g', artikel_id: 'sl-g', plats_id: 'lbc', hylla: null, antal: null, min_antal: null, bestalld_tid: null, uppdaterad: '' },
    );
    await montera(<InventarierStart />);
    await skriv('Var finns det?', 'wisent hjularm');
    const traffar = Array.from(document.querySelectorAll('[data-traff]'));
    expect(traffar.map(t => t.getAttribute('data-traff'))).toEqual(['r-sl-w']);
    expect(traffar[0].textContent).toContain('Hydraulslang · Hjularm vänster');
    expect(traffar[0].textContent).toContain('Wisent · Maskinhallen');
  });

  it('ny slang: Till maskin + Sitter på föreslår det som skrivits förut för samma maskin', async () => {
    db().tabeller.inventarie_artikel.push(
      { id: 'sl-w', namn: 'Hydraulslang', typ: 'utrustning', enhet: 'st', leverantor: null, artikelnr: null, anteckning: null, aktiv: true, maskin_id: 'A030353', sitter_pa: 'Hjularm vänster' },
    );
    await montera(<PlatsSida platsId="hall" />);
    await klicka(document.querySelector('[data-testid="lagg-till-knapp"]'));
    await skriv('Vad är det?', 'Hydraulslang 1/2');
    await klicka(knapp('Till maskin'));
    await klicka(knapp('Wisent'));
    await skriv('Sitter på (valfritt)', 'hjul');
    await klicka(knapp('Hjularm vänster'));
    await klicka(document.querySelector('[data-testid="lagg-till"]'));
    const ny = db().tabeller.inventarie_artikel.find(a => a.namn === 'Hydraulslang 1/2')!;
    expect(ny.maskin_id).toBe('A030353');
    expect(ny.sitter_pa).toBe('Hjularm vänster');
  });
});

describe('Inventarier — förare', () => {
  it('en förare ser inte "Ny plats"', async () => {
    h.roll = 'forare';
    await montera(<InventarierStart />);
    expect(text()).not.toContain('Ny plats');
    expect(text()).toContain('Maskinhallen');
  });
});
