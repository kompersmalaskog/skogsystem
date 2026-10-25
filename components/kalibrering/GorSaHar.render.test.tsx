// @vitest-environment jsdom
// "Gör så här": ETT steg i taget, rätt knapp för rätt steg, svaret sparas som en markör i den form reglerna läser tillbaka, och ett fel syns i stället för att tystna.
// Layouten (storlekar, avstånd) mäts i riktig Chromium (CLAUDE.md) — det här är logiken: vad som visas, vad som går att trycka på och vad som sparas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fx from '@/lib/kalibrering/__fixtures__/scorpion_forslag_2026-10-24.json';
import { punktBesked, type ForslagStam, type PunktBesked } from '@/lib/kalibrering/forslag';
import { byggKort, greppSteg, type GreppSteg } from '@/lib/kalibrering/forslagKort';
import { BYTE_TEXT, KONTROLL_TEXT, TRYCK_TEXT, andringarUr, kurvaText, tolkaMarkor } from '@/lib/kalibrering/forslagMarkorer';
import type { GreppRad } from '@/lib/kalibrering/greppTid';
import type { ForslagResp } from '@/lib/kalibrering/typer';
import GorSaHar, { svarTexter } from './GorSaHar';
import ForslagArk, { beskedOrd, punktRad } from './ForslagArk';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const IDAG = '2026-10-24';
const stammar: ForslagStam[] = (fx.stammar as [string, ForslagStam['klass'], string, string, number, number][]).map(([tradslag, klass, stam, dag, n, summa]) => ({ tradslag, klass, stam, dag, n, summa }));
const greppRader: GreppRad[] = (fx.grepp as [string, string, string, number, number, number, number][]).map(([manad, tradslag, klass, st, steg, still, summaAndel]) => ({ manad, tradslag, klass, stammar: st, steg, still, summaAndel }));
const hist = (fx.historik as [string, string, number, boolean][]).map(([datum, tradslag, d, o]) => ({ datum, tradslag, typ: 'diameter', dia_justering_mm: d, omkalibrering: o }));

const p = (over: Partial<PunktBesked>): PunktBesked => ({
  tradslag: 'Tall', klass: '200-249', punkt: '200', stammar: 12, snittMm: 2.6, sdMm: 2, lo: 1.5, hi: 3.7, besked: 'justera', spak: 'kurva', andringMm: -2, saknas: 0, fonsterFran: '2026-10-01', ...over,
});
const resp = (over: Partial<ForslagResp> & { punkter?: PunktBesked[]; grepp?: GreppSteg[]; kollat?: string[] } = {}): ForslagResp => {
  const punkter = over.punkter ?? [];
  const grepp = over.grepp ?? [];
  return {
    ok: true, maskin_id: 'M', idag: IDAG, punkter, grepp, greppLast: true, senasteAndring: null, stammar: 100,
    kort: over.kort ?? byggKort({ punkter, grepp, andringar: [], kollat: over.kollat ?? [], idag: IDAG }),
    ...over,
  } as ForslagResp;
};

const sparaForslagMarkor = vi.fn<(t: string[]) => Promise<boolean>>();
const forsokIgen = vi.fn();
const oppnaForslag = vi.fn();
const d = (over: Record<string, unknown> = {}) => ({ forslag: resp(), forslagFel: null, forslagSparar: false, sparaForslagMarkor, forsokIgen, ...over }) as any;
const ark = { oppnaForslag } as any;

let rot: Root | null = null, host: HTMLDivElement | null = null;
const montera = (el: ReturnType<typeof createElement>) => { host = document.createElement('div'); document.body.appendChild(host); rot = createRoot(host); act(() => rot!.render(el)); return host; };
const txt = (h: HTMLElement) => (h.textContent ?? '').replace(/\u00a0/g, ' ');
const namn = (b: HTMLButtonElement) => (b.textContent ?? '').replace('chevron_right', ''); // ikonens ligatur är text i jsdom
const knappar = (h: HTMLElement) => Array.from(h.querySelectorAll('button')).map(namn);
const knapp = (h: HTMLElement, text: string) => Array.from(h.querySelectorAll('button')).find(b => namn(b) === text)!;
beforeEach(() => { sparaForslagMarkor.mockReset().mockResolvedValue(true); forsokIgen.mockClear(); oppnaForslag.mockClear(); });
afterEach(() => { act(() => rot?.unmount()); host?.remove(); rot = null; host = null; });
const flush = () => act(async () => { await Promise.resolve(); });

const grepp1: GreppSteg = { tradslag: 'Tall', manad: '2026-10', forra: '2026-09', fran: 29, till: 36, pp: 7 };

describe('Gör så här — Kolla', () => {
  it('ETT steg: stor mening, varför, "Steg 1 av 3" med tre streck; de andra stegen syns inte', () => {
    const f = resp({ punkter: [p({}), p({ tradslag: 'Gran', punkt: '100', klass: '<150', andringMm: -2 })], grepp: [grepp1] });
    // Kolla först; kurvorna för tall och gran väntar bakom den: tre steg.
    const h = montera(createElement(GorSaHar, { d: d({ forslag: f }), ark }));
    expect(txt(h)).toContain('Kolla knivar och valsar');
    expect(txt(h)).toContain('Greppet har släppt oftare på tall i oktober.');
    expect(h.querySelector('[data-testid=steg-av]')!.textContent).toBe('Steg 1 av 3');
    expect(h.querySelectorAll('[data-streck]')).toHaveLength(3);
    expect(h.querySelectorAll('[data-streck=fylld]')).toHaveLength(1);
    expect(txt(h)).not.toContain('Sänk');      // aldrig en lista
    expect(txt(h)).not.toContain('Jag har ändrat');
  });
  it('"Klart, allt såg bra ut" sparar ett svar utan åtgärd; "Bytte något" sparar bytet', async () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: resp({ grepp: [grepp1] }) }), ark }));
    expect(knappar(h)).toEqual(['Klart, allt såg bra ut', 'Bytte något', 'Justeringsförslag per punkt']);
    act(() => knapp(h, 'Klart, allt såg bra ut').click());
    await flush();
    expect(sparaForslagMarkor).toHaveBeenLastCalledWith([KONTROLL_TEXT]);
    act(() => knapp(h, 'Bytte något').click());
    await flush();
    expect(sparaForslagMarkor).toHaveBeenLastCalledWith([BYTE_TEXT]);
  });
  it('samma ökning på en annan skördare: raden "Samma på … – troligen kyla och bark, inte din maskin." står i kortet', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: resp({ grepp: [{ ...grepp1, samma: ['H8E -26'] }] }) }), ark }));
    expect(txt(h).replace(/\u00a0/g, ' ')).toContain('Samma på H8E -26 – troligen kyla och bark, inte din maskin.');
    const utan = montera(createElement(GorSaHar, { d: d({ forslag: resp({ grepp: [grepp1] }) }), ark }));
    expect(txt(utan)).not.toContain('Samma på');
  });
  it('bara EN primär knapp (vit, full bredd) på skärmen', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: resp({ grepp: [grepp1] }) }), ark }));
    const primara = Array.from(h.querySelectorAll('button')).filter(b => b.style.background === 'rgb(255, 255, 255)' || b.style.background === '#ffffff');
    expect(primara).toHaveLength(1);
    expect(primara[0].textContent).toBe('Klart, allt såg bra ut');
  });
});

describe('Gör så här — Ändra', () => {
  const kurva = resp({ punkter: [p({ punkt: '150', klass: '150-199', andringMm: -3 }), p({ punkt: '200', andringMm: -3 })] });
  it('"Sänk tall 3 mm" med bara punkterna som ska ändras', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: kurva }), ark }));
    expect(txt(h)).toContain('Sänk tall 3 mm');
    expect(txt(h)).toContain('150 mm');
    expect(txt(h)).toContain('−3');
    expect(txt(h)).not.toContain('250 mm');
    expect(h.querySelector('[data-testid=steg-av]')!.textContent).toBe('Steg 1 av 1');
  });
  it('"Jag har ändrat" skapar en åtgärdsmarkör per punkt, i formen reglerna läser tillbaka', async () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: kurva }), ark }));
    act(() => knapp(h, 'Jag har ändrat').click());
    await flush();
    const texter = sparaForslagMarkor.mock.calls[0][0];
    expect(texter).toEqual(['Kurvan ändrad: Tall 150 mm −3 mm', 'Kurvan ändrad: Tall 200 mm −3 mm']);
    expect(texter.map(t => tolkaMarkor(t))).toEqual([
      { slag: 'kurva', tradslag: 'Tall', klass: '150-199', mm: -3 }, { slag: 'kurva', tradslag: 'Tall', klass: '200-249', mm: -3 },
    ]);
  });
  it('Höj trycket: "Jag har ändrat" sparar tryckmarkören', async () => {
    const f = resp({ punkter: [p({ tradslag: 'Gran', klass: '300+', punkt: '300+', spak: 'bada', andringMm: null, sdMm: 5.5, stammar: 27 })], kollat: ['2026-10-24'] });
    const h = montera(createElement(GorSaHar, { d: d({ forslag: f }), ark }));
    expect(txt(h)).toContain('Höj trycket på knivar och hjul');
    act(() => knapp(h, 'Jag har ändrat').click());
    await flush();
    expect(sparaForslagMarkor).toHaveBeenLastCalledWith([TRYCK_TEXT]);
  });
  it('ett fel vid sparandet syns, och kortet ligger kvar så att man kan försöka igen', async () => {
    sparaForslagMarkor.mockResolvedValue(false);
    const h = montera(createElement(GorSaHar, { d: d({ forslag: kurva }), ark }));
    act(() => knapp(h, 'Jag har ändrat').click());
    await flush();
    expect(txt(h)).toContain('Det gick inte att spara. Försök igen.');
    expect(knapp(h, 'Jag har ändrat')).toBeTruthy();
  });
  it('medan det sparas är knappen avstängd och säger "Sparar…"', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: kurva, forslagSparar: true }), ark }));
    const k = knapp(h, 'Sparar…') as HTMLButtonElement;
    expect(k.disabled).toBe(true);
  });
});

describe('Gör så här — Klava', () => {
  const klava = resp({ punkter: [p({ tradslag: 'Tall', klass: '250-299', punkt: '250', stammar: 7, saknas: 3, besked: 'klava', spak: null, andringMm: null })] });
  it('"Klava 3 tallar 250 mm" och prickar som fylls: 7 av 10 klara', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: klava }), ark }));
    expect(txt(h)).toContain('Klava 3 tallar 250 mm');
    expect(h.querySelectorAll('[data-prick]')).toHaveLength(10);
    expect(h.querySelectorAll('[data-prick=fylld]')).toHaveLength(7);
    expect(txt(h)).toContain('7 av 10 klara');
  });
  it('en tall fattas: "Klava en tall 250 mm"; ingen knapp att trycka (stammarna klavas i maskinen)', () => {
    const f = resp({ punkter: [p({ tradslag: 'Tall', klass: '250-299', punkt: '250', stammar: 9, saknas: 1, besked: 'klava', spak: null, andringMm: null })] });
    const h = montera(createElement(GorSaHar, { d: d({ forslag: f }), ark }));
    expect(txt(h)).toContain('Klava en tall 250 mm');
    expect(knappar(h)).toEqual(['Justeringsförslag per punkt']);
  });
});

describe('Gör så här — Inget att göra och Vänta', () => {
  it('"Inget att göra. Fortsätt klava som vanligt." — grön bock, inga steg, inga knappar utom detaljen', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: resp() }), ark }));
    expect(txt(h)).toContain('Inget att göra');
    expect(txt(h)).toContain('Fortsätt klava som vanligt.');
    expect(h.querySelector('[data-testid=steg-av]')).toBeNull();
    expect(h.querySelectorAll('[data-streck]')).toHaveLength(0);
    expect(knappar(h)).toEqual(['Justeringsförslag per punkt']);
  });
  it('kan greppet inte läsas sägs det — kortet påstår inte att knivar och valsar är i ordning', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: resp({ greppLast: false }) }), ark }));
    expect(txt(h)).toContain('Greppet kunde inte läsas — knivar och valsar är inte kontrollerade.');
  });
  it('veckans väntan efter en tryckändring: "Vänta till 27 okt"', () => {
    const f = resp({ kort: { lage: 'vanta', steg: [], vantaTill: '2026-10-27' } });
    const h = montera(createElement(GorSaHar, { d: d({ forslag: f }), ark }));
    expect(txt(h)).toContain('Vänta till 27 okt');
    expect(txt(h)).toContain('Ändra inte kurvan förrän en vecka gått.');
    expect(h.querySelector('[data-testid=steg-av]')).toBeNull();
  });
});

describe('Gör så här — läser, fel och detaljen', () => {
  it('medan förslagen läses: en lugn rad, ingen tom ruta', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: null }), ark }));
    expect(txt(h)).toContain('Läser vad som ska göras…');
  });
  it('läsfel: sägs, med Försök igen — aldrig "Inget att göra"', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: null, forslagFel: 'x' }), ark }));
    expect(txt(h)).toContain('Det som ska göras kunde inte läsas');
    expect(txt(h)).not.toContain('Inget att göra');
    act(() => knapp(h, 'Försök igen').click());
    expect(forsokIgen).toHaveBeenCalledTimes(1);
  });
  it('detaljen är ett tryck bort: "Justeringsförslag per punkt" öppnar Justeringsförslag', () => {
    const h = montera(createElement(GorSaHar, { d: d(), ark }));
    act(() => knapp(h, 'Justeringsförslag per punkt').click());
    expect(oppnaForslag).toHaveBeenCalledTimes(1);
  });
});

describe('svarTexter', () => {
  it('Klava har inget svar att spara (stammarna klavas i maskinen)', () => {
    expect(svarTexter({ slag: 'klava', id: 'k', tradslag: 'Tall', punkt: p({}) }, 'ja')).toEqual([]);
  });
  it('en markör per punkt för Ändra, i samma form som kurvaText', () => {
    expect(svarTexter({ slag: 'kurva', id: 'k', tradslag: 'Tall', punkter: [p({ punkt: '150', andringMm: -3 }) as never] }, 'ja')).toEqual([kurvaText('Tall', '150', -3)]);
  });
});

describe('Scorpionen genom hela kedjan — kortet och detaljen', () => {
  const andringar = andringarUr({ atgarder: fx.atgarder, historik: hist });
  const punkter = punktBesked({ stammar, andringar, idag: IDAG });
  const grepp = greppSteg(greppRader, IDAG);
  const f = resp({ punkter, grepp, kort: byggKort({ punkter, grepp, andringar, kollat: [], idag: IDAG }), senasteAndring: { datum: '2026-10-07', slag: 'kalibrering' } });

  it('kortet: Kolla knivar och valsar, med tallens grepp som orsak', () => {
    const h = montera(createElement(GorSaHar, { d: d({ forslag: f }), ark }));
    expect(txt(h)).toContain('Kolla knivar och valsar');
    expect(txt(h)).toContain('Greppet har släppt oftare på tall i oktober.');
    expect(knappar(h)).toEqual(['Klart, allt såg bra ut', 'Bytte något', 'Justeringsförslag per punkt']);
  });

  it('detaljen: besked per trädslag och punkt, med osäkerheten som ett streck per punkt', () => {
    const h = montera(createElement(ForslagArk, { f }));
    expect(h.querySelectorAll('[data-testid=osakerhet]')).toHaveLength(punkter.length);
    expect(txt(h)).toContain('Gran');
    expect(txt(h)).toContain('Trycket först');          // gran 300+
    expect(txt(h)).toContain('sänk 2 mm');             // gran 100
    expect(txt(h)).toMatch(/Räknat på stammar klavade sedan 18 jul/);   // gran
    expect(txt(h)).toMatch(/Räknat på stammar klavade sedan 8 okt/);    // tall: kalibrerades 7 okt
    expect(txt(h)).toContain('Greppet');
    expect(txt(h)).toContain('29 → 36 %');
  });
  it('beskedOrd: spridning går före — Höj trycket / Trycket först; annars beskedet', () => {
    expect(beskedOrd(p({ spak: 'tryck', besked: 'latavara' })).ord).toBe('Höj trycket');
    expect(beskedOrd(p({ spak: 'bada' })).ord).toBe('Trycket först');
    expect(beskedOrd(p({ besked: 'klava', spak: null })).ord).toBe('Klava mer');
    expect(beskedOrd(p({ besked: 'vanta', spak: null })).ord).toBe('Vänta');
    expect(beskedOrd(p({ besked: 'latavara', spak: null })).ord).toBe('Låt vara');
  });
  it('punktRad säger antal stammar, medelfel (+ = maskinen mäter grövre) och vad som ska göras', () => {
    const sp = (t: string) => t.replace(/\u00a0/g, ' ');
    expect(sp(punktRad(p({ stammar: 54, snittMm: 2.63, andringMm: -2 })))).toBe('54 stammar · +2,6 mm · sänk 2 mm');
    expect(sp(punktRad(p({ besked: 'klava', spak: null, andringMm: null, stammar: 7, snittMm: 4, saknas: 3 })))).toBe('7 stammar · +4,0 mm · 3 till behövs');
    expect(sp(punktRad(p({ besked: 'latavara', spak: null, andringMm: null, stammar: 1, snittMm: -1.1 })))).toBe('1 stam · −1,1 mm · rätt än så länge');
    expect(sp(punktRad(p({ besked: 'latavara', spak: null, andringMm: null, stammar: 54, snittMm: 0.8 })))).toBe('54 stammar · +0,8 mm · rätt');
    expect(sp(punktRad(p({ spak: 'bada', andringMm: null, snittMm: 3.3, sdMm: 5.46, stammar: 27 })))).toBe('27 stammar · +3,3 mm · spridning 5,5 mm. Kurvan efter trycket.');
  });
});
