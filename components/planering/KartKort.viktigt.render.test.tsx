// @vitest-environment jsdom
// VIKTIGT på kartkortet (Martin 2026-11-23): Viktigt-raden står överst, gul, fet och med ⚠; Övrigt (det som alltid funnits) står under i vanlig text. Skrivformuläret har
// två fält. Före migrationen (kanViktigt false) är kortet exakt som förut.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KartKort, type KartKortKommentar, type KartKortProps } from './KartKort';
import { FARG } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function visa(p: Partial<KartKortProps> = {}) {
  const cont = document.createElement('div'); document.body.appendChild(cont);
  const root = createRoot(cont);
  const props: KartKortProps = {
    ikon: <span>ikon</span>, namn: 'Hänsyn 1', grupp: 'natur', larmRegel: 'Larmar alltid', mening: 'Hänsynsyta – lämnas orörd.',
    kommentarer: [], kanKommentera: true, kanViktigt: true, onLaggKommentar: () => {}, onAndraKommentar: () => {}, onRaderaKommentar: () => {}, foton: [], onLaggTillFoto: () => {}, onStang: () => {}, ...p,
  };
  act(() => { root.render(<KartKort {...props} />); });
  return { cont, root };
}
const t = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const alla = (id: string) => Array.from(document.querySelectorAll(`[data-testid="${id}"]`)) as HTMLElement[];
const klick = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
function skriv(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  act(() => { set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const k = (id: string, over: Partial<KartKortKommentar> = {}): KartKortKommentar => ({ id, text: 'text ' + id, viktigt: null, forfattare: 'Daniel · i går 16:20', vantar: false, kanAndra: false, kanRadera: false, ...over });
beforeEach(() => { document.body.innerHTML = ''; });

describe('KartKort — Viktigt-raden', () => {
  it('Viktigt står överst på kortet: före Vidas text och före kommentarerna utan Viktigt, även när den skrevs senast', () => {
    visa({
      vidaKommentar: 'Lämna kantzon mot sjön.',
      kommentarer: [k('1', { text: 'Gammal kommentar' }), k('2', { text: '', viktigt: 'Bro saknas – kör inte här' })],
    });
    // Rutorna i kommentarsblocket, i den ordning de står: Viktigt-rutan, Vida, den gamla kommentaren.
    const barn = Array.from(document.querySelectorAll('[data-testid="kartkort-kommentar"] > *')) as HTMLElement[];
    expect(barn.map((e) => e.getAttribute('data-testid'))).toEqual(['kartkort-kommentar-rad', 'kartkort-kommentar-vida', 'kartkort-kommentar-rad']);
    expect(barn[0].querySelector('[data-testid="viktigt-rad"]')).not.toBeNull();
    expect(barn[1].querySelector('[data-testid="viktigt-rad"]')).toBeNull();
    expect(barn[2].querySelector('[data-testid="viktigt-rad"]')).toBeNull();
    expect(alla('viktigt-rad')).toHaveLength(1);
  });

  it('raden är gul, fet och har ⚠; Övrigt står under i vanlig text', () => {
    visa({ kommentarer: [k('1', { text: 'Sumpigt i södra hörnet', viktigt: 'Kör inte över muren' })] });
    const rad = t('viktigt-rad')!;
    expect(rad.getAttribute('role')).toBe('note');
    expect(rad.style.color).toBe('rgb(255, 214, 10)');   // FARG.gul
    expect(FARG.gul.toLowerCase()).toBe('#ffd60a');
    expect(rad.querySelector('.material-symbols-outlined')!.textContent).toBe('warning');
    const text = t('viktigt-text')!;
    expect(text.textContent).toBe('Kör inte över muren');
    expect(Number(text.style.fontWeight)).toBeGreaterThanOrEqual(700);
    // Övrigt under Viktigt, i samma ruta, och inte gul:
    const ruta = rad.closest('[data-testid="kartkort-kommentar-rad"]')!;
    const ovrigt = ruta.querySelector('[data-testid="kartkort-kommentar-text"]') as HTMLElement;
    expect(ovrigt.textContent).toBe('Sumpigt i södra hörnet');
    expect(rad.compareDocumentPosition(ovrigt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ovrigt.style.color).not.toBe('rgb(255, 214, 10)');
  });

  it('en kommentar utan Viktigt ritas exakt som förut: ingen Viktigt-rad, texten som Övrigt (ingen data försvinner)', () => {
    visa({ kommentarer: [k('1', { text: 'Gammal kommentar' })] });
    expect(t('viktigt-rad')).toBeNull();
    expect(t('kartkort-kommentar-text')!.textContent).toBe('Gammal kommentar');
  });

  it('en kommentar med bara Viktigt visar ingen tom Övrigt-ruta', () => {
    visa({ kommentarer: [k('1', { text: '', viktigt: 'Brant norrut' })] });
    expect(t('viktigt-text')!.textContent).toBe('Brant norrut');
    expect(t('kartkort-kommentar-text')).toBeNull();
  });
});

describe('KartKort — skrivformuläret har två fält', () => {
  it('Viktigt (en rad, högst 60 tecken, med räknare) och Övrigt; sparas som (Övrigt, Viktigt)', () => {
    const lagg = vi.fn();
    visa({ onLaggKommentar: lagg });
    klick(t('kartkort-kommentar-ny'));
    const v = t('kartkort-kommentar-viktigt') as HTMLInputElement;
    expect(v.maxLength).toBe(60);
    expect(t('kartkort-kommentar-viktigt-rakna')!.textContent).toBe('0/60');
    skriv(v, 'Stopp vid bäcken');
    expect(t('kartkort-kommentar-viktigt-rakna')!.textContent).toBe('16/60');
    skriv(t('kartkort-kommentar-falt') as HTMLTextAreaElement, 'Bron håller inte.\nKör runt.');
    klick(t('kartkort-kommentar-spara'));
    expect(lagg).toHaveBeenCalledWith('Bron håller inte.\nKör runt.', 'Stopp vid bäcken');
  });

  it('bara Viktigt räcker för att spara (Övrigt får vara tom); inget alls går inte', () => {
    const lagg = vi.fn();
    visa({ onLaggKommentar: lagg });
    klick(t('kartkort-kommentar-ny'));
    expect((t('kartkort-kommentar-spara') as HTMLButtonElement).disabled).toBe(true);
    skriv(t('kartkort-kommentar-viktigt') as HTMLInputElement, 'Elstängsel');
    expect((t('kartkort-kommentar-spara') as HTMLButtonElement).disabled).toBe(false);
    klick(t('kartkort-kommentar-spara'));
    expect(lagg).toHaveBeenCalledWith('', 'Elstängsel');
  });

  it('en vanlig kommentar utan Viktigt skickas med null som Viktigt', () => {
    const lagg = vi.fn();
    visa({ onLaggKommentar: lagg });
    klick(t('kartkort-kommentar-ny'));
    skriv(t('kartkort-kommentar-falt') as HTMLTextAreaElement, 'Bara text');
    klick(t('kartkort-kommentar-spara'));
    expect(lagg).toHaveBeenCalledWith('Bara text', null);
  });

  it('ändra egen kommentar: båda fälten är ifyllda och båda sparas', () => {
    const andra = vi.fn();
    visa({ kommentarer: [k('1', { text: 'Övrigt', viktigt: 'Rad', kanAndra: true })], onAndraKommentar: andra });
    klick(t('kartkort-kommentar-mer')); klick(t('kartkort-kommentar-andra'));
    expect((t('kartkort-kommentar-andra-viktigt') as HTMLInputElement).value).toBe('Rad');
    expect((t('kartkort-kommentar-andra-falt') as HTMLTextAreaElement).value).toBe('Övrigt');
    skriv(t('kartkort-kommentar-andra-viktigt') as HTMLInputElement, '');
    klick(t('kartkort-kommentar-andra-spara'));
    expect(andra).toHaveBeenCalledWith('1', 'Övrigt', null);   // Viktigt borttagen
  });

  it('FÖRE migrationen (kanViktigt false): inget Viktigt-fält, och kommentaren sparas som förut med EN parameter', () => {
    const lagg = vi.fn();
    visa({ kanViktigt: false, onLaggKommentar: lagg });
    klick(t('kartkort-kommentar-ny'));
    expect(t('kartkort-kommentar-viktigt')).toBeNull();
    skriv(t('kartkort-kommentar-falt') as HTMLTextAreaElement, 'Bara text');
    klick(t('kartkort-kommentar-spara'));
    expect(lagg).toHaveBeenCalledTimes(1);
    expect(lagg.mock.calls[0]).toEqual(['Bara text']);
  });

  it('Viktigt visas överst också medan fältet inte får användas (en rad som redan finns går att läsa)', () => {
    visa({ kanViktigt: false, kommentarer: [k('1', { text: '', viktigt: 'Redan skriven' })] });
    expect(t('viktigt-text')!.textContent).toBe('Redan skriven');
  });
});
