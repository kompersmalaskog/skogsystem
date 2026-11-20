// @vitest-environment jsdom
// Kortet del 2: kommentarerna först, var sin ljusare ruta med källan överst, en punkt per radbrytning, "···" för Ändra/Ta bort.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KartKort, KortAtgarder, KortKnapp, type KartKortKommentar, type KartKortProps } from './KartKort';
import { FARG } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function visa(p: Partial<KartKortProps> = {}) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  const props: KartKortProps = {
    ikon: <span>ikon</span>, namn: 'Hänsynsyta 3', grupp: 'natur', larmRegel: 'Larmar alltid', mening: 'Lämna ytan orörd.',
    kommentarer: [], kanKommentera: true, onLaggKommentar: () => {}, onAndraKommentar: () => {}, onRaderaKommentar: () => {}, foton: [], onStang: () => {}, ...p,
  };
  act(() => { root.render(<KartKort {...props} />); });
  return { cont, root };
}
const t = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const alla = (id: string) => Array.from(document.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const klick = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
const k = (id: string, over: Partial<KartKortKommentar> = {}): KartKortKommentar => ({ id, text: 'text ' + id, forfattare: 'Daniel · i går 16:20', vantar: false, kanAndra: false, kanRadera: false, ...over });
beforeEach(() => { document.body.innerHTML = ''; });

describe('Kortet del 2 — kommentarerna först, var sin ruta', () => {
  it('kommentarerna ligger DIREKT under huvudet, före meningen', () => {
    visa({ kommentarer: [k('1')] });
    const ids = Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid'));
    expect(ids.indexOf('kartkort-kommentar')).toBeGreaterThan(ids.indexOf('kartkort-stang'));
    expect(ids.indexOf('kartkort-kommentar')).toBeLessThan(ids.indexOf('kartkort-mening'));
  });

  it('Vidas text först med blå etikett "Vida · traktdirektiv", sedan egna med "Namn · tid" — var sin ruta, ljusare än kortet', () => {
    visa({ vidaKommentar: 'Torr stenig mark som lämnas orörd', kommentarer: [k('1'), k('2', { forfattare: 'Oskar · idag 12:02' })] });
    const rutor = Array.from(t('kartkort-kommentar')!.children) as HTMLElement[];
    expect(rutor).toHaveLength(3);
    const vida = rutor[0];
    expect(vida.getAttribute('data-testid')).toBe('kartkort-kommentar-vida');
    const etikett = vida.querySelector('[data-testid="kartkort-kommentar-kalla"]') as HTMLElement;
    expect(etikett.textContent).toBe('Vida · traktdirektiv');
    expect(etikett.style.color).toBe('rgb(10, 132, 255)');                 // FARG.bla
    expect(FARG.bla.toLowerCase()).toBe('#0a84ff');
    expect(rutor[1].querySelector('[data-testid="kartkort-kommentar-forfattare"]')!.textContent).toBe('Daniel · i går 16:20');
    expect(rutor[2].querySelector('[data-testid="kartkort-kommentar-forfattare"]')!.textContent).toBe('Oskar · idag 12:02');
    for (const r of rutor) expect(r.style.background).toBe('rgb(44, 44, 46)');   // FARG.upphojt — ljusare än kortet (#1c1c1e)
  });

  it('Vidas text går inte att ändra: ingen ··· i Vida-rutan', () => {
    visa({ vidaKommentar: 'Lämna kantzon', kommentarer: [] });
    expect(t('kartkort-kommentar-vida')!.querySelector('[data-testid="kartkort-kommentar-mer"]')).toBeNull();
  });

  it('inga kommentarer och ingen Vida-text: ingen sektion alls', () => {
    visa({ vidaKommentar: '  \n ', kommentarer: [] });
    expect(t('kartkort-kommentar')).toBeNull();
  });

  it('Vidas text visas även när objektet inte kan ha egna kommentarer (kommentarer = null)', () => {
    visa({ vidaKommentar: 'Lämna kantzon', kommentarer: null });
    expect(t('kartkort-kommentar-vida')).not.toBeNull();
  });

  it('texten är större (19 px) och vit', () => {
    visa({ kommentarer: [k('1', { text: 'Stolpe lutar' })] });
    const tx = t('kartkort-kommentar-text')!;
    expect(tx.style.fontSize).toBe('19px');
    expect(tx.style.color).toBe('rgb(255, 255, 255)');
  });
});

describe('Kortet del 2 — "···" för Ändra och Ta bort', () => {
  it('··· har ≥ 44 px träffyta, Ändra/Ta bort ligger inte framme förrän man tryckt, och ··· finns bara där man får göra något', () => {
    visa({ kommentarer: [k('egen', { kanAndra: true, kanRadera: true }), k('annans')] });
    const mer = alla('kartkort-kommentar-mer');
    expect(mer).toHaveLength(1);
    expect(mer[0].style.width).toBe('44px');
    expect(mer[0].style.height).toBe('44px');
    expect(mer[0].getAttribute('aria-label')).toBe('Fler val för kommentaren');
    expect(t('kartkort-kommentar-andra')).toBeNull();
    klick(mer[0]);
    expect(t('kartkort-kommentar-andra')).not.toBeNull();
    expect(t('kartkort-kommentar-ta-bort')).not.toBeNull();
    klick(mer[0]);                                                      // ett tryck till stänger
    expect(t('kartkort-kommentar-andra')).toBeNull();
  });

  it('Ändra och Ta bort: samma flöden som förut (ändra → Spara skickar id + text; ta bort frågar först)', () => {
    const andra = vi.fn(); const radera = vi.fn();
    visa({ kommentarer: [k('egen', { kanAndra: true, kanRadera: true, text: 'a' })], onAndraKommentar: andra, onRaderaKommentar: radera });
    klick(t('kartkort-kommentar-mer')); klick(t('kartkort-kommentar-ta-bort'));
    expect(radera).not.toHaveBeenCalled();
    klick(t('kartkort-kommentar-ta-bort-ja'));
    expect(radera).toHaveBeenCalledWith('egen');
  });
});

describe('Kortet del 2 — en punkt per radbrytning', () => {
  it('en rad: ren text, ingen siffra', () => {
    visa({ kommentarer: [k('1', { text: 'Stolpe lutar' })] });
    expect(alla('kartkort-kommentar-siffra')).toHaveLength(0);
    expect(t('kartkort-kommentar-text')!.textContent).toBe('Stolpe lutar');
  });

  it('flera rader: numrerade 1, 2, 3 med vit siffra i rund bricka; tomma rader räknas inte', () => {
    visa({ kommentarer: [k('1', { text: 'Kör inte i kanten\n\nLämna tallarna\r\nHusruin i nordöstra delen\n' })] });
    const siffror = alla('kartkort-kommentar-siffra');
    expect(siffror.map((s) => s.textContent)).toEqual(['1', '2', '3']);
    expect(siffror[0].style.borderRadius).toBe('50%');
    expect(siffror[0].style.color).toBe('rgb(255, 255, 255)');
    expect(alla('kartkort-kommentar-punkt').map((p) => p.textContent)).toEqual(['1Kör inte i kanten', '2Lämna tallarna', '3Husruin i nordöstra delen']);
  });

  it('samma för Vidas text: ATGARD med radbrytning blir två punkter, men en mening på en rad delas aldrig', () => {
    visa({ vidaKommentar: 'avverkning av frötallar.\r\nLämn kantzon mot sjön. Lämna enstaka utspridda tallar.', kommentarer: [] });
    expect(alla('kartkort-kommentar-siffra').map((s) => s.textContent)).toEqual(['1', '2']);
    expect(alla('kartkort-kommentar-punkt')[1].textContent).toBe('2Lämn kantzon mot sjön. Lämna enstaka utspridda tallar.');
  });

  it('skrivfälten säger "En instruktion per rad" (ny och ändra)', () => {
    visa({ kommentarer: [k('egen', { kanAndra: true })] });
    klick(t('kartkort-kommentar-ny'));
    expect((t('kartkort-kommentar-falt') as HTMLTextAreaElement).placeholder).toBe('En instruktion per rad');
    document.body.innerHTML = '';
    visa({ kommentarer: [k('egen', { kanAndra: true })] });
    klick(t('kartkort-kommentar-mer')); klick(t('kartkort-kommentar-andra'));
    expect((t('kartkort-kommentar-andra-falt') as HTMLTextAreaElement).placeholder).toBe('En instruktion per rad');
  });
});

describe('Kortet del 2 — knapparna längst ner är ord, samma stil, ≥ 44 px', () => {
  it('KortKnapp har text, 44 px minsta höjd; destruktiv är röd; en tom KortAtgarder ritar inget', () => {
    const cont = document.createElement('div'); document.body.appendChild(cont);
    const root = createRoot(cont);
    act(() => { root.render(<><KortAtgarder><KortKnapp testid="a" text="Förläng" onClick={() => {}} /><KortKnapp testid="b" text="Ta bort" destruktiv onClick={() => {}} /></KortAtgarder></>); });
    expect(t('a')!.textContent).toBe('Förläng');
    expect(t('a')!.style.minHeight).toBe('44px');
    expect(t('b')!.style.color).toBe('rgb(255, 69, 58)');
    act(() => { root.render(<KortAtgarder>{null}{false}</KortAtgarder>); });
    expect(t('kartkort-kortatgarder')).toBeNull();
  });
});
