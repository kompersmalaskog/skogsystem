// @vitest-environment jsdom
// Instruktionskortet och listan i genomgången: vad föraren ser, en Sett-knapp, numrerade punkter, Vidas text först med blå etikett.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstruktionKortVy, InstruktionLista, INSTRUKTION_SETT_MIN_PX } from './InstruktionKort';
import ObjektKort from './ObjektKort';
import type { Instruktion, InstruktionKortData, InstruktionerPaTrakten } from '@/lib/instruktioner/instruktioner';
import { FARG } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let rot: Root | null = null;
let ruta: HTMLElement | null = null;
afterEach(() => { act(() => { rot?.unmount(); }); ruta?.remove(); rot = null; ruta = null; });
const montera = (el: React.ReactElement) => { ruta = document.createElement('div'); document.body.appendChild(ruta); rot = createRoot(ruta); act(() => { rot!.render(el); }); };
const q = (id: string) => ruta!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => [...ruta!.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];

const vida: Instruktion = { ref: 'vida:hansyn:7', text: 'Spara alla aspar', hash: 'a', kalla: 'vida', forfattare: null, vantar: false };
const egen: Instruktion = { ref: 'k1', text: 'Stanna vid stenen\nGå runt\nLämna ris', hash: 'b', kalla: 'egen', forfattare: 'Martin · i går 16:20', vantar: false };
const aldre: Instruktion = { ref: 'aldre:marker:5', text: 'Gammal text', hash: 'c', kalla: 'aldre', forfattare: null, vantar: false };
const kort = (o: Partial<InstruktionKortData> = {}): InstruktionKortData => ({ nyckel: 'hansyn:7', namn: 'Naturvårdsyta', instruktioner: [vida, egen], fler: 0, ...o });

describe('InstruktionKortVy', () => {
  it('rubrik "<Område> – instruktioner" och "Du kör in i området nu"', () => {
    montera(<InstruktionKortVy kort={kort()} top="10px" onSett={() => {}} />);
    expect(q('instruktion-rubrik')!.textContent).toBe('Naturvårdsyta – instruktioner');
    expect(q('instruktion-under')!.textContent).toBe('Du kör in i området nu');
  });
  it('Vidas text först med blå etikett "Vida · traktdirektiv", sedan egna med "Namn · tid"', () => {
    montera(<InstruktionKortVy kort={kort({ instruktioner: [vida, egen, aldre] })} top="10px" onSett={() => {}} />);
    const e = qa('instruktion-etikett');
    expect(e.map((x) => x.textContent)).toEqual(['Vida · traktdirektiv', 'Martin · i går 16:20', 'Äldre kommentar']);
    expect(e[0].style.color).toBe(FARG.bla.replace('#0a84ff', 'rgb(10, 132, 255)'));
    expect(qa('instruktion-ruta').map((x) => x.getAttribute('data-kalla'))).toEqual(['vida', 'egen', 'aldre']);
  });
  it('flera rader = numrerade punkter med siffra i rund bricka; en rad = vanlig text', () => {
    montera(<InstruktionKortVy kort={kort()} top="10px" onSett={() => {}} />);
    expect(qa('instruktion-text').map((x) => x.textContent)).toEqual(['Spara alla aspar']);
    expect(qa('instruktion-siffra').map((x) => x.textContent)).toEqual(['1', '2', '3']);
    expect(qa('instruktion-punkt').map((x) => x.textContent!.replace(/^\d/, ''))).toEqual(['Stanna vid stenen', 'Gå runt', 'Lämna ris']);
    expect(qa('instruktion-siffra')[0].style.borderRadius).not.toBe('');
  });
  it('EN Sett-knapp för allt på kortet, minst 56 px, som larmets (bock + "Sett"), och ett tryck kvitterar en gång', () => {
    const onSett = vi.fn();
    montera(<InstruktionKortVy kort={kort()} top="10px" onSett={onSett} />);
    expect(ruta!.querySelectorAll('button').length).toBe(1);
    const k = q('instruktion-sett')!;
    expect(k.textContent).toContain('check');
    expect(k.textContent).toContain('Sett');
    expect(INSTRUKTION_SETT_MIN_PX).toBeGreaterThanOrEqual(56);
    expect(parseInt(k.style.minHeight, 10)).toBeGreaterThanOrEqual(56);
    act(() => { k.click(); });
    expect(onSett).toHaveBeenCalledTimes(1);
  });
  it('samma plats som larmkortet (fast, överst, z 620) och ingen ljudsignal', () => {
    montera(<InstruktionKortVy kort={kort()} top="77px" onSett={() => {}} />);
    const yttre = q('instruktion-kort')!.parentElement!;
    expect(yttre.style.position).toBe('fixed');
    expect(yttre.style.top).toBe('77px');
    expect(yttre.style.zIndex).toBe('620');
    expect(ruta!.querySelector('audio')).toBeNull();
  });
  it('"+N områden till väntar" bara när fler väntar', () => {
    montera(<InstruktionKortVy kort={kort({ fler: 2 })} top="0" onSett={() => {}} />);
    expect(q('instruktion-fler')!.textContent).toBe('+2 områden till väntar');
    act(() => { rot!.render(<InstruktionKortVy kort={kort({ fler: 1 })} top="0" onSett={() => {}} />); });
    expect(q('instruktion-fler')!.textContent).toBe('+1 område till väntar');
    act(() => { rot!.render(<InstruktionKortVy kort={kort({ fler: 0 })} top="0" onSett={() => {}} />); });
    expect(q('instruktion-fler')).toBeNull();
  });
});

const lista = (o: Partial<InstruktionerPaTrakten> = {}): InstruktionerPaTrakten => ({
  antal: 3, nya: 2,
  omraden: [
    { nyckel: 'hansyn:7', namn: 'Naturvårdsyta', nya: 2, instruktioner: [{ ...vida, sedd: false }, { ...egen, sedd: false }] },
    { nyckel: 'punkt:01-1', namn: 'Avlägg', nya: 0, instruktioner: [{ ...aldre, sedd: true }] },
  ],
  ...o,
});

describe('InstruktionLista (genomgången)', () => {
  it('alla områden med sina kommentarer, antalet och hur många som är nya', () => {
    montera(<InstruktionLista data={lista()} objektNamn="Trakten" onSett={() => {}} onTillbaka={() => {}} onStang={() => {}} />);
    expect(q('info-titel')!.textContent).toBe('Instruktioner på trakten');
    expect(q('info-undertitel')!.textContent).toBe('3 · 2 nya');
    expect(qa('instruktion-omrade').map((x) => x.getAttribute('data-nyckel'))).toEqual(['hansyn:7', 'punkt:01-1']);
  });
  it('Sett per område bara där något är osett; en sedd kommentar är dämpad utan knapp', () => {
    const onSett = vi.fn();
    montera(<InstruktionLista data={lista()} objektNamn="Trakten" onSett={onSett} onTillbaka={() => {}} onStang={() => {}} />);
    expect(qa('instruktion-sett-omrade')).toHaveLength(1);
    expect(qa('instruktion-ruta').map((x) => x.getAttribute('data-sedd'))).toEqual(['nej', 'nej', 'ja']);
    act(() => { q('instruktion-sett-omrade')!.click(); });
    expect(onSett).toHaveBeenCalledWith(['hansyn:7']);
  });
  it('"Sett alla" finns bara när mer än ett område har nya', () => {
    montera(<InstruktionLista data={lista()} objektNamn="T" onSett={() => {}} onTillbaka={() => {}} onStang={() => {}} />);
    expect(q('instruktion-sett-alla')).toBeNull();
    const tva = lista({ nya: 3, omraden: [lista().omraden[0], { nyckel: 'punkt:01-1', namn: 'Avlägg', nya: 1, instruktioner: [{ ...aldre, sedd: false }] }] });
    const onSett = vi.fn();
    act(() => { rot!.render(<InstruktionLista data={tva} objektNamn="T" onSett={onSett} onTillbaka={() => {}} onStang={() => {}} />); });
    act(() => { q('instruktion-sett-alla')!.click(); });
    expect(onSett).toHaveBeenCalledWith(['hansyn:7', 'punkt:01-1']);
  });
  it('allt sett: "alla sedda", ingen Sett-knapp', () => {
    const d = lista({ nya: 0, omraden: [{ ...lista().omraden[1] }] });
    montera(<InstruktionLista data={d} objektNamn="T" onSett={() => {}} onTillbaka={() => {}} onStang={() => {}} />);
    expect(q('info-undertitel')!.textContent).toBe('3 · alla sedda');
    expect(ruta!.querySelectorAll('[data-testid^="instruktion-sett"]')).toHaveLength(0);
  });
});

describe('raden "Instruktioner på trakten (N) ›" på kortet', () => {
  const props: any = {
    namn: 'Trakten', rad: 'x', knappar: [], onKnapp: () => {}, onStang: () => {}, faror: [], tillForaren: [], onLasAllt: () => {}, brickor: [], extraBrickor: [], paTrakten: '3 markeringar',
    onPaTrakten: () => {}, brand: null, onBrand: () => {}, dokument: null, larm: { satt: true, bekraftad: true, koordinat: '1,1', beskrivning: '', onVisa: () => {} },
  };
  it('visas med antalet och "N nya" och öppnar listan', () => {
    const onOppna = vi.fn();
    montera(<ObjektKort {...props} instruktioner={{ antal: 3, nya: 2, onOppna }} />);
    expect(q('kort-instruktioner')!.textContent).toContain('Instruktioner på trakten (3)');
    expect(q('kort-instruktioner-nya')!.textContent).toBe('2 nya');
    act(() => { q('kort-instruktioner')!.click(); });
    expect(onOppna).toHaveBeenCalled();
  });
  it('utan instruktioner (planeringsvyn, trakt utan kommentarer) finns ingen rad', () => {
    montera(<ObjektKort {...props} />);
    expect(q('kort-instruktioner')).toBeNull();
    act(() => { rot!.render(<ObjektKort {...props} instruktioner={{ antal: 0, nya: 0, onOppna: () => {} }} />); });
    expect(q('kort-instruktioner')).toBeNull();
  });
  it('allt sett: raden finns kvar utan "nya"', () => {
    montera(<ObjektKort {...props} instruktioner={{ antal: 3, nya: 0, onOppna: () => {} }} />);
    expect(q('kort-instruktioner')).not.toBeNull();
    expect(q('kort-instruktioner-nya')).toBeNull();
  });
});
