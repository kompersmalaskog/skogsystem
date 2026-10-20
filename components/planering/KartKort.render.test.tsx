// @vitest-environment jsdom
// KartKort: EN kortkomponent för allt på kartan. Prövar uppbyggnaden (namn · grupp, larmregel, mening), kommentaren (skriva, ändra, fel) och fotot (lägga till).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KartKort, KartKortNederst, type KartKortProps } from './KartKort';
import { larmRegelText } from '@/lib/larm/grupper';
import { traktKortBetydelse, vidaLinjeKort, linjeKort, symbolDef, ytaForklaring } from '@/lib/symboler';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function visa(p: Partial<KartKortProps> = {}) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  const props: KartKortProps = {
    ikon: <span>ikon</span>, namn: 'Kraftledning', grupp: 'fara', larmRegel: 'Larmar alltid', mening: 'Kraftledning – håll avstånd och fäll inte åt det hållet.',
    kalla: 'Linje · Vida', kommentar: { text: '' }, kanSkriva: true, onSparaKommentar: async () => null, foton: [], onLaggTillFoto: () => {}, onStang: () => {}, ...p,
  };
  act(() => { root.render(<KartKort {...props} />); });
  return { cont, root };
}
const t = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const klick = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
function skriv(el: HTMLTextAreaElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => { set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
beforeEach(() => { document.body.innerHTML = ''; });

describe('KartKort — uppbyggnad', () => {
  it('namn · grupp, larmregeln i klartext och EN mening', () => {
    visa();
    expect(t('kartkort-namn')!.textContent).toBe('Kraftledning · Fara');
    expect(t('kartkort-larmregel')!.textContent).toBe('Larmar alltid');
    expect(t('kartkort-mening')!.textContent).toContain('håll avstånd');
    expect(t('kartkort-kalla')!.textContent).toBe('Linje · Vida');
  });

  it('samma uppbyggnad för symbol, linje, yta och Vidas objekt: samma delar i samma ordning', () => {
    const fall: [string, KartKortProps['grupp'], string, string | null][] = [
      ['El-ledning (symbol)', symbolDef('powerline').grupp, larmRegelText({ grupp: symbolDef('powerline').grupp, typ: 'powerline' }), symbolDef('powerline').forklaring],
      ['Stenmur (linje)', linjeKort('stonewall').grupp, larmRegelText({ grupp: linjeKort('stonewall').grupp }), linjeKort('stonewall').forklaring],
      ['Hänsyn (yta)', ytaForklaring('protected')!.grupp, larmRegelText({ grupp: ytaForklaring('protected')!.grupp, forbjuden: true }), ytaForklaring('protected')!.forklaring],
      ['Kraftledning (Vida)', vidaLinjeKort('Kraftledning').grupp, 'Larmar alltid', vidaLinjeKort('Kraftledning').forklaring],
      ['Avlägg (Vida)', traktKortBetydelse({ kategori: 'punkt' }).grupp, 'Larmar inte', traktKortBetydelse({ kategori: 'punkt' }).forklaring],
    ];
    const ordning: string[][] = [];
    for (const [namn, grupp, regel, mening] of fall) {
      document.body.innerHTML = '';
      visa({ namn, grupp, larmRegel: regel, mening });
      ordning.push(Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid')!).filter((x) => x.startsWith('kartkort')));
      expect(t('kartkort-larmregel')!.textContent, namn).toBe(regel);
    }
    for (const o of ordning.slice(1)) expect(o).toEqual(ordning[0]);
    expect(ordning[0]).toEqual(expect.arrayContaining(['kartkort-namn', 'kartkort-larmregel', 'kartkort-mening', 'kartkort-kommentar', 'kartkort-foton', 'kartkort-stang']));
  });

  it('typspecifikt innehåll hamnar före kommentaren; åtgärder (Nederst) efter fotona', () => {
    const cont = document.createElement('div'); document.body.appendChild(cont);
    const root = createRoot(cont);
    act(() => {
      root.render(
        <KartKort ikon={null} namn="X" grupp="info" larmRegel="Larmar inte" mening={null} kommentar={{ text: '' }} kanSkriva onSparaKommentar={() => null} foton={[]} onLaggTillFoto={() => {}} onStang={() => {}}>
          <div data-testid="del">särskilt</div>
          <KartKortNederst><div data-testid="nederst">åtgärder</div></KartKortNederst>
        </KartKort>,
      );
    });
    const ids = Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'));
    expect(ids.indexOf('del')).toBeLessThan(ids.indexOf('kartkort-kommentar'));
    expect(ids.indexOf('kartkort-foton')).toBeLessThan(ids.indexOf('nederst'));
  });
});

describe('KartKort — kommentaren', () => {
  it('går att skriva och spara; sparas med den trimmade texten', async () => {
    const spara = vi.fn(async () => null);
    visa({ onSparaKommentar: spara });
    expect(t('kartkort-kommentar-tom')).not.toBeNull();
    klick(t('kartkort-kommentar-andra'));
    skriv(t('kartkort-kommentar-falt') as HTMLTextAreaElement, '  Hänger lågt vid vägen ');
    await act(async () => { klick(t('kartkort-kommentar-spara')); });
    expect(spara).toHaveBeenCalledWith('Hänger lågt vid vägen');
    expect(t('kartkort-kommentar-falt')).toBeNull();                       // tillbaka i visningsläget
  });

  it('en befintlig kommentar visas med vem/när och går att ändra', () => {
    visa({ kommentar: { text: 'Hänger lågt', meta: 'Martin · 2026-10-20' } });
    expect(t('kartkort-kommentar-text')!.textContent).toBe('Hänger lågt');
    expect(t('kartkort-kommentar')!.textContent).toContain('Martin · 2026-10-20');
    klick(t('kartkort-kommentar-andra'));
    expect((t('kartkort-kommentar-falt') as HTMLTextAreaElement).value).toBe('Hänger lågt');
  });

  it('misslyckas sparningen står felet kvar och fältet stängs inte (inget tyst tapp)', async () => {
    visa({ onSparaKommentar: async () => 'Kunde inte spara — försök igen.' });
    klick(t('kartkort-kommentar-andra'));
    skriv(t('kartkort-kommentar-falt') as HTMLTextAreaElement, 'text');
    await act(async () => { klick(t('kartkort-kommentar-spara')); });
    expect(t('kartkort-kommentar-fel')!.textContent).toBe('Kunde inte spara — försök igen.');
    expect((t('kartkort-kommentar-falt') as HTMLTextAreaElement).value).toBe('text');
  });

  it('Avbryt kastar utkastet', () => {
    visa({ kommentar: { text: 'gammal' } });
    klick(t('kartkort-kommentar-andra'));
    skriv(t('kartkort-kommentar-falt') as HTMLTextAreaElement, 'ny');
    klick(t('kartkort-kommentar-avbryt'));
    expect(t('kartkort-kommentar-text')!.textContent).toBe('gammal');
  });

  it('den som inte får skriva ser kommentaren men ingen knapp; objekt utan stabil nyckel har ingen kommentarsplats', () => {
    visa({ kanSkriva: false, kommentar: { text: 'bara läsning' } });
    expect(t('kartkort-kommentar-text')!.textContent).toBe('bara läsning');
    expect(t('kartkort-kommentar-andra')).toBeNull();
    document.body.innerHTML = '';
    visa({ kommentar: null });
    expect(t('kartkort-kommentar')).toBeNull();
  });
});

describe('KartKort — foto', () => {
  it('"Lägg till foto" anropar anroparens flöde; finns ett foto heter knappen "Byt foto"', () => {
    const lagg = vi.fn();
    visa({ onLaggTillFoto: lagg });
    klick(t('kartkort-foto-lagg-till'));
    expect(lagg).toHaveBeenCalledTimes(1);
    expect(t('kartkort-foto-lagg-till')!.textContent).toBe('Lägg till foto');
    document.body.innerHTML = '';
    visa({ foton: [{ id: 'f1', node: <img alt="Foto" src="x.jpg" />, text: 'Stolpe 3' }] });
    expect(document.querySelectorAll('[data-testid="kartkort-foto"]')).toHaveLength(1);
    expect(t('kartkort-foto')!.textContent).toContain('Stolpe 3');
    expect(t('kartkort-foto-lagg-till')!.textContent).toBe('Byt foto');
  });

  it('den som inte får skriva ser fotona men ingen knapp; inget foto och ingen rätt att lägga till: ingen fotoruta', () => {
    visa({ kanSkriva: false, foton: [{ id: 'f1', node: <img alt="Foto" src="x.jpg" /> }] });
    expect(t('kartkort-foto')).not.toBeNull();
    expect(t('kartkort-foto-lagg-till')).toBeNull();
    document.body.innerHTML = '';
    visa({ kanSkriva: false, foton: [] });
    expect(t('kartkort-foton')).toBeNull();
  });

  it('bildtexten går att ändra och fotot att ta bort när anroparen tillåter det', () => {
    const sparaText = vi.fn(); const taBort = vi.fn();
    visa({ foton: [{ id: 'f1', node: <img alt="Foto" src="x.jpg" />, text: null, onSparaText: sparaText, onTaBort: taBort }] });
    const falt = t('kartkort-foto-text') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { set.call(falt, 'Stolpe 3'); falt.dispatchEvent(new Event('input', { bubbles: true })); falt.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(sparaText).toHaveBeenCalledWith('Stolpe 3');
    klick(t('kartkort-foto-ta-bort'));
    expect(taBort).toHaveBeenCalledTimes(1);
  });
});

describe('KartKort — stänga', () => {
  it('Stäng och tryck utanför stänger; tryck i kortet gör det inte', () => {
    const stang = vi.fn();
    visa({ onStang: stang });
    klick(t('kartkort-stang'));
    expect(stang).toHaveBeenCalledTimes(1);
    klick(t('kartkort-namn'));
    expect(stang).toHaveBeenCalledTimes(1);
    klick(t('kartkort'));
    expect(stang).toHaveBeenCalledTimes(2);
  });
});
