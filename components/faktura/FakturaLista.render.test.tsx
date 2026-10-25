// @vitest-environment jsdom
// Faktureringsvyns lista: ETT stort tal när listan är skärmen, en tyst rad när den
// är sidokolumn, inga tomma kort, och de väntande trakterna bakom EN rad.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import FakturaLista from './FakturaLista';
import { byggListVy, type OversiktsRad } from '@/lib/faktura/listaVy';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({
  usePathname: () => '/ekonomi/fakturaunderlag',
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const bas: OversiktsRad = {
  vo_nummer: '0', namn: 'Trakt', bolag: 'Vida', fortnox_kundnr: 1,
  avtalsform: 'ackord', tillstand: 'klar', avrakningsdatum: '2026-10-01',
  objekt_antal: 1, volym_m3fub: 100, g15h: 10,
  hinder: null, hinder_typ: null, saknar_objektrad: false,
  har_maskindata: true, debiterbart_arbete_tim: 0,
  debiterbart_arbete_poster: 0, manuell_skotartid_tim: 0,
};
const rad = (o: Partial<OversiktsRad>): OversiktsRad => ({ ...bas, ...o });

let root: Root | null = null;
let el: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  el?.remove();
  el = null;
});

function rita(rader: OversiktsRad[], utanTrakt: { poster: number; timmar: number } | null = null) {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => { root!.render(<FakturaLista vy={byggListVy(rader, utanTrakt)} />); });
  return el;
}

// Element, inte HTMLElement: querySelector ger Element och vi läser bara textContent.
const text = (n: Element) => (n.textContent ?? '').replace(/[  ]/g, ' ');

describe('FakturaLista — ett tal per skärm', () => {
  it('det stora talet står i blocket som bara syns på telefon/iPad', () => {
    const ut = rita([rad({ vo_nummer: '1' }), rad({ vo_nummer: '2' })]);
    const smal = ut.querySelector('.fa-bara-smal')!;
    // TYP.tal är 32 px — det är skärmens huvudsiffra.
    const tal = Array.from(smal.querySelectorAll('p')).find(p => p.style.fontSize === '32px')!;
    expect(tal.textContent).toBe('2');
    expect(text(smal)).toContain('Vad ska faktureras?');
    expect(text(smal)).toContain('trakter klara att fakturera');
  });

  it('sidokolumnen har INGET 32-px-tal — annars står två huvudtal på samma skärm', () => {
    const ut = rita([rad({ vo_nummer: '1' })]);
    const bred = ut.querySelector('.fa-bara-bred')!;
    expect(bred.querySelectorAll('[style*="font-size: 32px"]').length).toBe(0);
    expect(text(bred)).toContain('1 trakt klar att fakturera');
  });
});

describe('FakturaLista — inga tomma kort', () => {
  it('utan något att göra ritas ingen "Vad ska du göra?"-sektion', () => {
    const ut = rita([rad({ vo_nummer: '1' })]);
    expect(ut.querySelector('[aria-label="Vad ska du göra?"]')).toBeNull();
    expect(ut.querySelector('[aria-label="Vad väntar?"]')).toBeNull();
    expect(ut.querySelector('[aria-label="Manuellt arbete som inte kan faktureras än"]')).toBeNull();
  });

  it('inget klart ritar ingen månadssektion och ingen rubrik', () => {
    const ut = rita([rad({ vo_nummer: '1', tillstand: 'pagar', avrakningsdatum: null })]);
    expect(text(ut)).not.toContain('Vad är klart att fakturera?');
  });

  it('en sak att göra ger sektionen och knappen till genomgången', () => {
    const ut = rita([
      rad({ vo_nummer: 'c1', tillstand: 'atgard', hinder_typ: 'kontraktsnr', saknar_objektrad: true }),
    ]);
    expect(ut.querySelector('[aria-label="Vad ska du göra?"]')).not.toBeNull();
    expect(text(ut)).toContain('1 saknar kontraktsnummer');
    expect(Array.from(ut.querySelectorAll('button')).map(b => b.textContent))
      .toContain('Gå igenom dem');
  });

  it('bara traillertimmar att göra ger INGEN genomgångsknapp (den gäller kontraktsnummer)', () => {
    const ut = rita([rad({ vo_nummer: 't1', tillstand: 'atgard', hinder_typ: 'traillertimmar' })]);
    expect(Array.from(ut.querySelectorAll('button')).map(b => b.textContent))
      .not.toContain('Gå igenom dem');
  });
});

describe('FakturaLista — det som väntar', () => {
  const manga = [
    ...Array.from({ length: 32 }, (_, k) => rad({ vo_nummer: `p${k}`, tillstand: 'pagar', avrakningsdatum: null })),
    ...Array.from({ length: 2 }, (_, k) => rad({ vo_nummer: `e${k}`, tillstand: 'ej_paborjad', avrakningsdatum: null })),
  ];

  it('34 väntande trakter ligger bakom EN rad, inte 34', () => {
    const ut = rita(manga);
    const sektion = ut.querySelector('[aria-label="Vad väntar?"]')!;
    expect(text(sektion)).toContain('34 trakter väntar');
    // En rad i kortet, inte 34.
    expect(sektion.querySelectorAll('[style*="min-height: 44px"]').length).toBeLessThan(3);
  });

  it('en trakt med debiterbart arbete syns med sitt tal och sin orsak — aldrig i den dämpade högen', () => {
    const ut = rita([
      ...manga,
      rad({ vo_nummer: '11271860', namn: 'Skälviken RP J-Hus -25', tillstand: 'ej_paborjad', avrakningsdatum: null, debiterbart_arbete_tim: 16.47 }),
      rad({ vo_nummer: '11277905', namn: 'Arvidstorp RP J-Hus -25', tillstand: 'ej_paborjad', avrakningsdatum: null, har_maskindata: false, debiterbart_arbete_tim: 8.88 }),
    ]);
    const sektion = ut.querySelector('[aria-label="Manuellt arbete som inte kan faktureras än"]')!;
    const t = text(sektion);
    expect(t).toContain('Skälviken RP J-Hus -25');
    expect(t).toContain('16,47');
    expect(t).toContain('Ingen maskin har rapporterat');
    expect(t).toContain('Arvidstorp RP J-Hus -25');
    expect(t).toContain('Trakten har ingen maskindata alls');
    // Och de räknas inte en andra gång i den dämpade högen.
    expect(text(ut.querySelector('[aria-label="Vad väntar?"]')!)).toContain('34 trakter väntar');
  });
});

describe('FakturaLista — raderna leder till trakten', () => {
  it('varje klar trakt är en länk till sin egen adress', () => {
    const ut = rita([rad({ vo_nummer: '11226833', namn: 'Brokamåla 15 V-H avd 20 -25', volym_m3fub: 2187 })]);
    const lank = ut.querySelector('a[href="/ekonomi/fakturaunderlag/11226833"]')!;
    expect(lank).not.toBeNull();
    expect(text(lank as HTMLElement)).toContain('Brokamåla 15 V-H avd 20 -25');
    expect(text(lank as HTMLElement)).toContain('2 187');
  });

  it('månadsrubriken står över kortet', () => {
    const ut = rita([rad({ vo_nummer: '1', avrakningsdatum: '2026-10-19' })]);
    expect(ut.querySelector('[aria-label="Oktober 2026"]')).not.toBeNull();
  });
});
