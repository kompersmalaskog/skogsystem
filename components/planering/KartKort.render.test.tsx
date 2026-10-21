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

  it('samma uppbyggnad för symbol, linje, yta och Vidas objekt: samma delar i samma ordning (Info utan larmregel)', () => {
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
      // Larmregeln är den enda delen som får saknas (Info larmar aldrig) — resten ska vara identiskt.
      ordning.push(Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid')!).filter((x) => x.startsWith('kartkort') && x !== 'kartkort-larmregel'));
      if (grupp === 'info') expect(t('kartkort-larmregel'), namn).toBeNull();
      else expect(t('kartkort-larmregel')!.textContent, namn).toBe(regel);
    }
    for (const o of ordning.slice(1)) expect(o).toEqual(ordning[0]);
    expect(ordning[0]).toEqual(expect.arrayContaining(['kartkort-namn', 'kartkort-mening', 'kartkort-stang', 'kartkort-atgarder']));
  });

  it('ordningen: ✕ i huvudet, kommentaren direkt under huvudet, målbildsraden, typens delar, fotona, åtgärdsraden och sist åtgärderna (Nederst)', () => {
    const cont = document.createElement('div'); document.body.appendChild(cont);
    const root = createRoot(cont);
    act(() => {
      root.render(
        <KartKort ikon={null} namn="X" grupp="info" larmRegel="Larmar inte" mening="en mening" kommentarer={[k('1')]} kanKommentera onLaggKommentar={() => {}} foton={[{ id: 'f', node: <img alt="Foto" src="x.jpg" /> }]} onLaggTillFoto={() => {}}
          rost={{ onToggle: () => {}, spelar: false, sekunder: 0 }} onStang={() => {}} malbild={<div data-testid="malbildsrad">rad</div>}>
          <div data-testid="del">särskilt</div>
          <KartKortNederst><div data-testid="nederst">åtgärder</div></KartKortNederst>
        </KartKort>,
      );
    });
    const ids = Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'));
    const i = (x: string) => ids.indexOf(x);
    expect(i('kartkort-namn')).toBeGreaterThan(-1);
    expect(i('kartkort-stang')).toBeGreaterThan(i('kartkort-namn'));         // ✕ sitter i huvudet…
    expect(i('kartkort-stang')).toBeLessThan(i('kartkort-mening'));           // …före meningen
    expect(i('kartkort-mening')).toBeLessThan(i('kartkort-kommentar'));
    expect(i('kartkort-kommentar')).toBeLessThan(i('malbildsrad'));
    expect(i('malbildsrad')).toBeLessThan(i('del'));
    expect(i('del')).toBeLessThan(i('kartkort-foton'));
    expect(i('kartkort-foton')).toBeLessThan(i('kartkort-atgarder'));
    expect(i('kartkort-atgarder')).toBeLessThan(i('nederst'));
  });
});

describe('KartKort — tomma sektioner finns inte', () => {
  it('utan kommentarer: ingen rubrik "Kommentarer" och ingen "Ingen kommentar"', () => {
    visa({ kommentarer: [] });
    expect(t('kartkort-kommentar')).toBeNull();
    expect(t('kartkort')!.textContent).not.toMatch(/Kommentarer|Ingen kommentar/);
  });
  it('utan foton: ingen rubrik "Foto" och ingen "Inget foto" — men Foto-knappen finns i åtgärdsraden', () => {
    visa({ foton: [] });
    expect(t('kartkort-foton')).toBeNull();
    expect(t('kartkort')!.textContent).not.toContain('Inget foto');
    expect(t('kartkort-foto-lagg-till')).not.toBeNull();
  });
  it('med kommentarer och foton visas rubrikerna', () => {
    visa({ kommentarer: [k('1'), k('2')], foton: [{ id: 'f1', node: <img alt="Foto" src="x.jpg" /> }] });
    expect(t('kartkort-kommentar')!.textContent).toContain('Kommentarer (2)');
    expect(t('kartkort-foton')!.textContent).toContain('Foto');
  });
  it('den som inte får något: ingen åtgärdsrad alls (inte en tom ruta)', () => {
    visa({ kanKommentera: false, onLaggTillFoto: undefined, rost: undefined });
    expect(t('kartkort-atgarder')).toBeNull();
  });
});

describe('KartKort — ✕ i huvudet i stället för en stor Stäng-knapp', () => {
  it('✕ har 44 px träffyta, ligger i huvudet och det finns ingen "Stäng"-knapp längre', () => {
    visa();
    const x = t('kartkort-stang') as HTMLButtonElement;
    expect(x.getAttribute('aria-label')).toBe('Stäng');
    expect(x.style.width).toBe('44px');
    expect(x.style.height).toBe('44px');
    expect(t('kartkort-namn')!.parentElement!.parentElement!.contains(x)).toBe(true);
    const knappar = Array.from(document.querySelectorAll('button')).map((b) => b.textContent);
    expect(knappar.some((tx) => /^Stäng$/.test(tx ?? ''))).toBe(false);
  });
});

describe('KartKort — larmregeln visas inte för Info', () => {
  it('Info larmar aldrig: ingen rad. Natur, Kultur, Blött, Fara och Att göra behåller den', () => {
    for (const grupp of ['info'] as const) { document.body.innerHTML = ''; visa({ grupp, larmRegel: 'Larmar inte' }); expect(t('kartkort-larmregel')).toBeNull(); }
    for (const grupp of ['natur', 'kultur', 'blott', 'fara', 'att_gora'] as const) {
      document.body.innerHTML = ''; visa({ grupp, larmRegel: 'Larmar xyz' });
      expect(t('kartkort-larmregel')!.textContent, grupp).toBe('Larmar xyz');
    }
  });
});

describe('KartKort — åtgärdsraden: Kommentar · Foto · Röst', () => {
  it('tre lika knappar (samma höjd ≥ 44 px, lika breda), med ikon + kort text, i den ordningen', () => {
    visa({ rost: { onToggle: () => {}, spelar: false, sekunder: 0 } });
    const rad = t('kartkort-atgarder')!;
    const knappar = Array.from(rad.querySelectorAll('button')) as HTMLButtonElement[];
    expect(knappar.map((b) => b.dataset.testid)).toEqual(['kartkort-kommentar-ny', 'kartkort-foto-lagg-till', 'kartkort-rost']);
    expect(knappar.map((b) => b.textContent)).toEqual(['add_commentKommentar', 'photo_cameraFoto', 'micRöst']);
    for (const b of knappar) {
      expect(b.querySelector('.material-symbols-outlined'), b.textContent!).not.toBeNull();
      expect(b.style.height).toBe('44px');
      expect([b.style.flexGrow, b.style.flexBasis]).toEqual(['1', '0px']);       // lika breda
    }
    expect(new Set(knappar.map((b) => b.getAttribute('style')!.replace(/color:[^;]*;?/, ''))).size).toBe(1);   // samma stil
  });
  it('en knapp som inte får användas finns inte; de andra delar på raden', () => {
    visa({ kanKommentera: false, rost: undefined });
    expect(Array.from(t('kartkort-atgarder')!.querySelectorAll('button')).map((b) => b.dataset.testid)).toEqual(['kartkort-foto-lagg-till']);
  });
  it('Röst startar/stoppar anroparens inspelning; medan den spelar in står sekunderna och knappen är röd', () => {
    const rost = vi.fn();
    visa({ rost: { onToggle: rost, spelar: false, sekunder: 0 } });
    klick(t('kartkort-rost'));
    expect(rost).toHaveBeenCalledTimes(1);
    document.body.innerHTML = '';
    visa({ rost: { onToggle: rost, spelar: true, sekunder: 7 } });
    expect(t('kartkort-rost')!.textContent).toBe('stop7 s');
    expect((t('kartkort-rost') as HTMLElement).style.color).not.toBe('');
    document.body.innerHTML = '';
    visa({ rost: { onToggle: rost, spelar: false, sekunder: 0, disabled: true } });
    expect((t('kartkort-rost') as HTMLButtonElement).disabled).toBe(true);
  });
  it('Kommentar öppnar skrivfältet PÅ SAMMA PLATS som åtgärdsraden: raden försvinner medan man skriver och kommer tillbaka efter Spara/Avbryt', () => {
    visa();
    klick(t('kartkort-kommentar-ny'));
    expect(t('kartkort-kommentar-falt')).not.toBeNull();
    expect(t('kartkort-atgarder')).toBeNull();
    klick(t('kartkort-kommentar-avbryt'));
    expect(t('kartkort-atgarder')).not.toBeNull();
  });
  it('"Laddar upp…" och fotofel visas under raden, men inte som en egen sektion', () => {
    visa({ fotoSparar: true, fotoFel: 'Kunde inte spara fotot' });
    expect(t('kartkort')!.textContent).toContain('Laddar upp…');
    expect(t('kartkort-foto-fel')!.textContent).toBe('Kunde inte spara fotot');
    expect((t('kartkort-foto-lagg-till') as HTMLButtonElement).disabled).toBe(true);
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
    expect(t('kartkort-kommentar-tom')).toBeNull();
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
  it('Foto-knappen anropar anroparens flöde; finns ett foto kan knappen heta "Byt foto"', () => {
    const lagg = vi.fn();
    visa({ onLaggTillFoto: lagg });
    klick(t('kartkort-foto-lagg-till'));
    expect(lagg).toHaveBeenCalledTimes(1);
    expect(t('kartkort-foto-lagg-till')!.textContent).toBe('photo_cameraFoto');
    document.body.innerHTML = '';
    visa({ foton: [{ id: 'f1', node: <img alt="Foto" src="x.jpg" />, text: 'Stolpe 3', av: 'Daniel · i går 16:20' }], fotoKnapp: 'Byt foto' });
    expect(document.querySelectorAll('[data-testid="kartkort-foto"]')).toHaveLength(1);
    expect(t('kartkort-foto')!.textContent).toContain('Stolpe 3');
    expect(t('kartkort-foto-av')!.textContent).toBe('Daniel · i går 16:20');     // fotot visar vem som tog det
    expect(t('kartkort-foto-lagg-till')!.textContent).toBe('photo_cameraByt foto');
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
  it('✕ och tryck utanför stänger; tryck i kortet gör det inte', () => {
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
