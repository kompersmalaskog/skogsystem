// @vitest-environment jsdom
// KartKort: EN kortkomponent för allt på kartan. Prövar uppbyggnaden (namn · grupp, larmregel, mening), kommentaren (skriva, ändra, fel) och fotot (lägga till).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KartKort, KartKortNederst, type KartKortKommentar, type KartKortProps } from './KartKort';
import { larmRegelText } from '@/lib/larm/grupper';
import { traktKortBetydelse, vidaLinjeKort, linjeKort, symbolDef, ytaForklaring } from '@/lib/symboler';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function visa(p: Partial<KartKortProps> = {}) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  const props: KartKortProps = {
    ikon: <span>ikon</span>, namn: 'Kraftledning', grupp: 'fara', larmRegel: 'Larmar alltid', mening: 'Kraftledning – håll avstånd och fäll inte åt det hållet.',
    kalla: 'Linje · Vida', kommentarer: [], kanKommentera: true, onLaggKommentar: () => {}, onAndraKommentar: () => {}, onRaderaKommentar: () => {}, foton: [], onLaggTillFoto: () => {}, onStang: () => {}, ...p,
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

  it('ordningen: kommentaren direkt under huvudet, sedan målbildsraden, typens delar, fotona och åtgärderna (Nederst) sist', () => {
    const cont = document.createElement('div'); document.body.appendChild(cont);
    const root = createRoot(cont);
    act(() => {
      root.render(
        <KartKort ikon={null} namn="X" grupp="info" larmRegel="Larmar inte" mening="en mening" kommentarer={[]} kanKommentera foton={[]} onLaggTillFoto={() => {}} onStang={() => {}} malbild={<div data-testid="malbildsrad">rad</div>}>
          <div data-testid="del">särskilt</div>
          <KartKortNederst><div data-testid="nederst">åtgärder</div></KartKortNederst>
        </KartKort>,
      );
    });
    const ids = Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'));
    expect(ids.indexOf('kartkort-mening')).toBeLessThan(ids.indexOf('kartkort-kommentar'));
    expect(ids.indexOf('kartkort-kommentar')).toBeLessThan(ids.indexOf('malbildsrad'));
    expect(ids.indexOf('malbildsrad')).toBeLessThan(ids.indexOf('del'));
    expect(ids.indexOf('del')).toBeLessThan(ids.indexOf('kartkort-foton'));
    expect(ids.indexOf('kartkort-foton')).toBeLessThan(ids.indexOf('nederst'));
  });
});

const k = (id: string, over: Partial<KartKortKommentar> = {}): KartKortKommentar => ({ id, text: 'text ' + id, forfattare: 'Daniel · i går 16:20', vantar: false, kanAndra: false, kanRadera: false, ...over });
const alla = (id: string) => Array.from(document.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];

describe('KartKort — kommentarerna: en rad per kommentar med namn och tid', () => {
  it('varje kommentar är en egen rad med författare och tid; äldre kommentar utan författare heter "Äldre kommentar"', () => {
    visa({ kommentarer: [k('1', { forfattare: null, text: 'gammal' }), k('2'), k('3', { forfattare: 'Oskar · idag 12:02', text: 'svar' })] });
    expect(alla('kartkort-kommentar-rad')).toHaveLength(3);
    expect(alla('kartkort-kommentar-forfattare').map((e) => e.textContent)).toEqual(['Äldre kommentar', 'Daniel · i går 16:20', 'Oskar · idag 12:02']);
    expect(alla('kartkort-kommentar-text').map((e) => e.textContent)).toEqual(['gammal', 'text 2', 'svar']);
  });

  it('en kommentar som väntar på nät märks "väntar"', () => {
    visa({ kommentarer: [k('1', { vantar: true })] });
    expect(t('kartkort-kommentar-vantar')!.textContent).toContain('väntar');
  });

  it('ny kommentar: skriv och spara; tom text går inte att spara; Avbryt kastar utkastet', () => {
    const lagg = vi.fn();
    visa({ onLaggKommentar: lagg });
    expect(t('kartkort-kommentar-tom')).not.toBeNull();
    klick(t('kartkort-kommentar-ny'));
    expect((t('kartkort-kommentar-spara') as HTMLButtonElement).disabled).toBe(true);
    skriv(t('kartkort-kommentar-falt') as HTMLTextAreaElement, '  Hänger lågt vid vägen ');
    klick(t('kartkort-kommentar-spara'));
    expect(lagg).toHaveBeenCalledWith('Hänger lågt vid vägen');
    expect(t('kartkort-kommentar-falt')).toBeNull();
    klick(t('kartkort-kommentar-ny'));
    skriv(t('kartkort-kommentar-falt') as HTMLTextAreaElement, 'utkast');
    klick(t('kartkort-kommentar-avbryt'));
    klick(t('kartkort-kommentar-ny'));
    expect((t('kartkort-kommentar-falt') as HTMLTextAreaElement).value).toBe('');
  });

  it('man ändrar och tar bort bara sina egna: knapparna syns bara på rader där behörigheten är räknad', () => {
    visa({ kommentarer: [k('egen', { kanAndra: true, kanRadera: true }), k('annans'), k('adminRadera', { kanRadera: true })] });
    const rad = (id: string) => document.querySelector(`[data-kommentar-id="${id}"]`)!;
    expect(rad('egen').querySelector('[data-testid="kartkort-kommentar-andra"]')).not.toBeNull();
    expect(rad('egen').querySelector('[data-testid="kartkort-kommentar-ta-bort"]')).not.toBeNull();
    expect(rad('annans').querySelector('[data-testid="kartkort-kommentar-andra"]')).toBeNull();
    expect(rad('annans').querySelector('[data-testid="kartkort-kommentar-ta-bort"]')).toBeNull();
    expect(rad('adminRadera').querySelector('[data-testid="kartkort-kommentar-andra"]')).toBeNull();
    expect(rad('adminRadera').querySelector('[data-testid="kartkort-kommentar-ta-bort"]')).not.toBeNull();
  });

  it('ändra: fältet öppnas med texten, Spara skickar id + ny text', () => {
    const andra = vi.fn();
    visa({ kommentarer: [k('egen', { kanAndra: true, text: 'Stolpe lutar' })], onAndraKommentar: andra });
    klick(t('kartkort-kommentar-andra'));
    const falt = t('kartkort-kommentar-andra-falt') as HTMLTextAreaElement;
    expect(falt.value).toBe('Stolpe lutar');
    skriv(falt, 'Stolpe 3 lutar');
    klick(t('kartkort-kommentar-andra-spara'));
    expect(andra).toHaveBeenCalledWith('egen', 'Stolpe 3 lutar');
  });

  it('ta bort frågar först (inget tyst tapp) och skickar id när man bekräftar', () => {
    const radera = vi.fn();
    visa({ kommentarer: [k('egen', { kanRadera: true })], onRaderaKommentar: radera });
    klick(t('kartkort-kommentar-ta-bort'));
    expect(radera).not.toHaveBeenCalled();
    klick(t('kartkort-kommentar-ta-bort-ja'));
    expect(radera).toHaveBeenCalledWith('egen');
  });

  it('den som inte får kommentera ser kommentarerna men ingen knapp för en ny; objekt utan stabil nyckel har ingen kommentarsplats', () => {
    visa({ kanKommentera: false, kommentarer: [k('1')] });
    expect(t('kartkort-kommentar-ny')).toBeNull();
    expect(alla('kartkort-kommentar-rad')).toHaveLength(1);
    document.body.innerHTML = '';
    visa({ kommentarer: null });
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
    visa({ foton: [{ id: 'f1', node: <img alt="Foto" src="x.jpg" />, text: 'Stolpe 3', av: 'Daniel · i går 16:20' }], fotoKnapp: 'Byt foto' });
    expect(document.querySelectorAll('[data-testid="kartkort-foto"]')).toHaveLength(1);
    expect(t('kartkort-foto')!.textContent).toContain('Stolpe 3');
    expect(t('kartkort-foto-av')!.textContent).toBe('Daniel · i går 16:20');     // fotot visar vem som tog det
    expect(t('kartkort-foto-lagg-till')!.textContent).toBe('Byt foto');
  });

  it('den som inte får lägga till ser fotona men ingen knapp; inget foto och ingen rätt att lägga till: ingen fotoruta', () => {
    visa({ onLaggTillFoto: undefined, foton: [{ id: 'f1', node: <img alt="Foto" src="x.jpg" /> }] });
    expect(t('kartkort-foto')).not.toBeNull();
    expect(t('kartkort-foto-lagg-till')).toBeNull();
    document.body.innerHTML = '';
    visa({ onLaggTillFoto: undefined, foton: [] });
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
