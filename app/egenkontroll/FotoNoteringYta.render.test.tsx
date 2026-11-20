// @vitest-environment jsdom
// Fotoytan (PR 9b) renderad for riktigt: ord pa ett foto. Databasen ar en stubb (skapaNotering/andraNotering); geometrin ar riktig.
//
// Bilden ar 1200 x 1600 (stalande 3:4, som alla riktiga foton) i en yta pa 390 x 560 px: contain ger en uppritad bild pa 390 x 520 px, 20 px
// fran ovankanten. Ett tryck pa mitten (195, 20 + 260) ska alltsa bli [0.5, 0.5].
//
// Det som far ga sonder tyst:
//  - ett tryck blir tva punkter (touch + emulerad mus), eller en linje far mellanpunkter,
//  - noteringen sparas pa kartan i stallet for pa fotot, eller med koordinater som inte ar andelar av bilden,
//  - etiketten sparas utan att vara klamd mot bilden, eller i en annan storlek an den visas i,
//  - en avslutad runda gar att rita pa, dra i eller andra,
//  - en notering som inte gick att lasa ser ut som att bilden saknar noteringar,
//  - "skulle" ser ut som "blev" (farg ar aldrig ensam),
//  - hookordningen (React #310).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Notering } from '@/lib/egenkontrollNotering';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const skapaNotering = vi.fn(async (i: any) => ({ id: i.id }) as any);
const andraNotering = vi.fn(async (_id: string, _n: any) => null as any);
vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return { ...verklig, skapaNotering: (i: any) => skapaNotering(i), andraNotering: (id: string, n: any) => andraNotering(id, n) };
});

import FotoNoteringYta, { type FotoNoteringYtaProps } from './FotoNoteringYta';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const onStang = vi.fn();
const onAndrad = vi.fn(async () => {});

const KROPP = { w: 390, h: 560 };
const BILD = { x: 0, y: 20, b: 390, h: 520 };
const rektFor = (el: Element) => {
  const t = el.getAttribute('data-testid');
  const r = t === 'foto-kropp' ? { left: 0, top: 0, width: KROPP.w, height: KROPP.h }
    : t === 'foto-rita-yta' ? { left: BILD.x, top: BILD.y, width: BILD.b, height: BILD.h }
      : { left: 0, top: 0, width: 0, height: 0 };
  return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) } as DOMRect;
};
const origRekt = Element.prototype.getBoundingClientRect;

const notering = (id: string, over: Partial<Notering> = {}): Notering => ({
  id, egenkontroll_id: 'e1', underlag: 'foto', foto_id: 'f1', typ: 'punkt', pil: false, etikett: 'Stenmur', avsikt: 'blev',
  koordinater: [[0.5, 0.5]], etikett_dx: null, etikett_dy: null, skapad: '2026-10-21T08:00:00Z', andrad: '2026-10-21T08:00:00Z', ...over,
});

async function montera(o: Partial<FotoNoteringYtaProps> = {}, nat = { w: 1200, h: 1600 }) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const props: FotoNoteringYtaProps = {
    egenkontrollId: 'e1', foton: [{ id: 'f1', url: 'https://signerad/f1.jpg' }], start: 0, rubrik: 'Kulturlämning', noteringar: [], last: false,
    onStang, onAndrad, ...o,
  };
  await act(async () => { root!.render(createElement(FotoNoteringYta, props)); });
  await laddaBild(nat);
  return props;
}
async function laddaBild(nat: { w: number; h: number }) {
  const img = document.querySelector('img') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: nat.w });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: nat.h });
  await act(async () => { img.dispatchEvent(new Event('load')); });
}

const knappar = () => Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
const hittaKnapp = (t: string | RegExp) => knappar().find((b) => (typeof t === 'string' ? (b.textContent ?? '').includes(t) : t.test(b.textContent ?? '')));
const knapp = (t: string | RegExp) => {
  const k = hittaKnapp(t);
  if (!k) throw new Error(`Ingen knapp "${t}". Knappar: ${knappar().map((b) => b.textContent || b.getAttribute('aria-label')).join(' | ')}`);
  return k;
};
const klick = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const id = (t: string) => document.querySelector(`[data-testid="${t}"]`) as HTMLElement;
const pekare = async (el: Element, typ: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) => {
  await act(async () => { el.dispatchEvent(new PointerEvent(typ, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 })); });
};
// Ett tryck på bilden tas på `click` (inte pointerdown): ett ark som öppnas av pointerdown får sin egen avslutande click på bakgrunden och stängs direkt
// (provat i riktig Chromium med touch). `pekare` + `klickPa` = ett riktigt tryck: pointerdown, pointerup, click.
const klickPa = async (el: Element, x: number, y: number) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })); }); };
const tryckBild = async (x: number, y: number) => {
  const yta = id('foto-rita-yta');
  await pekare(yta, 'pointerdown', x, y);
  await pekare(yta, 'pointerup', x, y);
  await klickPa(yta, x, y);
};
const tryckEtikett = async (e: Element, x: number, y: number) => { await pekare(e, 'pointerdown', x, y); await pekare(e, 'pointerup', x, y); await klickPa(e, x, y); };
const textfalt = () => document.querySelector('textarea') as HTMLTextAreaElement;
const skriv = async (el: HTMLTextAreaElement, text: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => { Element.prototype.getBoundingClientRect = function () { return rektFor(this as Element); }; });
afterEach(async () => {
  Element.prototype.getBoundingClientRect = origRekt;
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null; host = null;
  vi.clearAllMocks();
});

describe('bilden', () => {
  it('monterar utan att kasta (hookordning), visar bilden contain-fit och en Skriv på bilden-knapp som är aktiv först när bilden är läst', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root!.render(createElement(FotoNoteringYta, { egenkontrollId: 'e1', foton: [{ id: 'f1', url: 'u' }], start: 0, rubrik: 'Stenmur', noteringar: [], last: false, onStang, onAndrad })); });
    expect((knapp('Skriv på bilden') as HTMLButtonElement).disabled).toBe(true);       // bilden är inte läst än
    await laddaBild({ w: 1200, h: 1600 });
    expect((knapp('Skriv på bilden') as HTMLButtonElement).disabled).toBe(false);
    const img = document.querySelector('img') as HTMLImageElement;
    expect([img.style.left, img.style.top, img.style.width, img.style.height]).toEqual(['0px', '20px', '390px', '520px']);
    expect(id('foto-yta').getAttribute('aria-label')).toBe('Foto: Stenmur');
  });

  it('Stäng stänger, och Esc också', async () => {
    await montera();
    await klick(knapp('Stäng'));
    expect(onStang).toHaveBeenCalledTimes(1);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onStang).toHaveBeenCalledTimes(2);
  });

  it('har punkten flera foton bläddrar man mellan dem, och varje foto visar sina egna noteringar', async () => {
    await montera({
      foton: [{ id: 'f1', url: 'u1' }, { id: 'f2', url: 'u2' }], rubrik: 'Stenmur',
      noteringar: [notering('a', { foto_id: 'f1', etikett: 'Första' }), notering('b', { foto_id: 'f2', etikett: 'Andra' })],
    });
    expect(document.body.textContent).toContain('Stenmur · 1 av 2');
    expect(document.body.textContent).toContain('Första');
    expect(document.body.textContent).not.toContain('Andra');
    await klick(document.querySelector('[aria-label="Nästa foto"]')!);
    expect(document.body.textContent).toContain('Stenmur · 2 av 2');
    await laddaBild({ w: 1200, h: 1600 });
    expect(document.body.textContent).toContain('Andra');
    expect(document.body.textContent).not.toContain('Första');
  });

  it('en notering på KARTAN (eller på ett annat foto) syns inte på bilden', async () => {
    await montera({ noteringar: [notering('k', { underlag: 'karta', foto_id: null, koordinater: [[14.05, 56.05]], etikett: 'Karta' }), notering('o', { foto_id: 'annat', etikett: 'Annat foto' })] });
    expect(document.querySelectorAll('[data-testid=foto-etikett]')).toHaveLength(0);
  });
});

describe('Punkt', () => {
  it('Skriv på bilden → Punkt → ett tryck → formuläret med punktens namn förifyllt; Klar sparar PÅ FOTOT med [u, v] som andelar', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Punkt'));
    await tryckBild(195, BILD.y + 260);
    expect(textfalt().value).toBe('Kulturlämning');
    expect(textfalt().getAttribute('aria-label')).toBe('Text på bilden');
    await klick(knapp('Klar'));
    expect(skapaNotering).toHaveBeenCalledTimes(1);
    const i = skapaNotering.mock.calls[0][0];
    expect(i.verktyg).toBe('punkt');
    expect(i.koordinater).toEqual([[0.5, 0.5]]);
    expect(i.etikett).toBe('Kulturlämning');
    expect(i.avsikt).toBe('blev');
    expect(i.foto.fotoId).toBe('f1');
    expect(i.foto.bildHojd).toBeCloseTo(4 / 3, 9);
    // etiketten fick en plats innanför bilden: förskjutning och ruta följer med
    expect(Math.abs(i.foto.dx)).toBeLessThanOrEqual(2);
    expect(Math.abs(i.foto.dy)).toBeLessThanOrEqual(2);
    expect(i.foto.ruta.bredd).toBeGreaterThan(0);
    expect(onAndrad).toHaveBeenCalled();
  });

  it('texten går att ändra före Klar, och en tom text går inte att spara', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Punkt'));
    await tryckBild(100, BILD.y + 100);
    await skriv(textfalt(), 'Basvägen över muren');
    await klick(knapp('Klar'));
    expect(skapaNotering.mock.calls[0][0].etikett).toBe('Basvägen över muren');
  });

  it('tom text: Klar är grå och inget sparas', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Punkt'));
    await tryckBild(100, BILD.y + 100);
    await skriv(textfalt(), '   ');
    expect((knapp('Klar') as HTMLButtonElement).disabled).toBe(true);
    await klick(knapp('Klar'));
    expect(skapaNotering).not.toHaveBeenCalled();
  });

  it('formuläret öppnas på CLICK, inte på pointerdown: annars stänger tryckets egen click formuläret på arkets bakgrund direkt (iOS/Chromium med touch)', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Punkt'));
    const yta = id('foto-rita-yta');
    await pekare(yta, 'pointerdown', 195, BILD.y + 260);
    await pekare(yta, 'pointerup', 195, BILD.y + 260);
    expect(document.querySelector('textarea')).toBeNull();      // ännu inte: trycket är inte slut förrän click
    await klickPa(yta, 195, BILD.y + 260);
    expect(document.querySelector('textarea')).not.toBeNull();
  });

  it('ett tryck UTANFÖR bilden är inget tryck', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Punkt'));
    await tryckBild(195, BILD.y + BILD.h + 30);
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('Linje och Pil: ett tryck = exakt en punkt', () => {
  it('tre tryck och ✓ sparar EXAKT de tre tryckta punkterna — inga mellanpunkter, ingen utjämning', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Linje'));
    await tryckBild(39, BILD.y + 52);
    await tryckBild(195, BILD.y + 260);
    await tryckBild(351, BILD.y + 104);
    await klick(document.querySelector('[aria-label="Klar med linjen"]')!);
    await klick(knapp('Klar'));
    const i = skapaNotering.mock.calls[0][0];
    expect(i.verktyg).toBe('linje');
    expect(i.koordinater).toEqual([[0.1, 0.1], [0.5, 0.5], [0.9, 0.2]]);
    expect(i.foto.fotoId).toBe('f1');
  });

  it('en dubbelhändelse (samma tryck igen inom 800 ms och 4 px) blir EN punkt, inte två hörn', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Pil'));
    await tryckBild(100, BILD.y + 100);
    await tryckBild(101, BILD.y + 100);   // samma tryck igen
    expect(id('foto-ritning').querySelectorAll('circle')).toHaveLength(1);
    expect((document.querySelector('[aria-label="Klar med linjen"]') as HTMLButtonElement).disabled).toBe(true);   // en punkt räcker inte för en linje
    await tryckBild(300, BILD.y + 300);
    expect((document.querySelector('[aria-label="Klar med linjen"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('en pil sparas som en linje med riktning', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Pil'));
    await tryckBild(100, BILD.y + 100);
    await tryckBild(300, BILD.y + 300);
    await klick(document.querySelector('[aria-label="Klar med linjen"]')!);
    await klick(knapp('Klar'));
    expect(skapaNotering.mock.calls[0][0].verktyg).toBe('pil');
  });

  it('↩ tar bort den SENASTE punkten', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Linje'));
    await tryckBild(100, BILD.y + 100);
    await tryckBild(200, BILD.y + 200);
    await tryckBild(300, BILD.y + 300);
    await klick(document.querySelector('[aria-label="Ångra senaste punkten"]')!);
    expect(id('foto-ritning').querySelectorAll('circle')).toHaveLength(2);
  });

  it('× avbryter ritandet utan att spara något', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Linje'));
    await tryckBild(100, BILD.y + 100);
    await klick(document.querySelector('[aria-label="Avbryt ritandet"]')!);
    expect(hittaKnapp('Skriv på bilden')).toBeDefined();
    expect(skapaNotering).not.toHaveBeenCalled();
  });

  it('Avbryt i formuläret kastar inte en dragen linje', async () => {
    await montera();
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Linje'));
    await tryckBild(100, BILD.y + 100);
    await tryckBild(300, BILD.y + 300);
    await klick(document.querySelector('[aria-label="Klar med linjen"]')!);
    await klick(knapp('Avbryt'));
    expect(document.querySelector('textarea')).toBeNull();
    expect(id('foto-ritning').querySelectorAll('circle')).toHaveLength(2);
  });
});

describe('etiketten', () => {
  it('ritas i max(13 px, 3,2 % av visad bredd): 13 px på en telefon på 390 px', async () => {
    await montera({ noteringar: [notering('a')] });
    const e = id('foto-etikett');
    const inre = e.firstElementChild as HTMLElement;
    expect(inre.style.fontSize).toBe('13px');
    expect(inre.style.fontFamily).toContain('Helvetica');
    expect(inre.textContent).toBe('Stenmur');
  });

  it('etikettens ruta är modellens ruta för SKÄRMENS textandel × bildens bredd (13/390 på en telefon)', async () => {
    const { fotoEtikettMatt, skarmEtikettAndel } = await import('@/lib/egenkontrollFotoEtikett');
    await montera({ noteringar: [notering('a')] });
    const m = fotoEtikettMatt('Stenmur', skarmEtikettAndel(390))!;
    const e = id('foto-etikett').firstElementChild as HTMLElement;
    expect(parseFloat(e.style.width)).toBeCloseTo(m.ruta.bredd * 390, 1);
    expect(parseFloat(e.style.height)).toBeCloseTo(m.ruta.hojd * 390, 1);
  });

  it('en sparad förskjutning flyttar etiketten dit (klämd mot bilden); utan förskjutning föreslås en plats', async () => {
    await montera({ noteringar: [notering('a', { etikett_dx: 0.2, etikett_dy: -0.1 })] });
    const e = id('foto-etikett');
    const mittX = parseFloat(e.style.left) + parseFloat(e.style.width) / 2;
    const mittY = parseFloat(e.style.top) + parseFloat(e.style.height) / 2;
    expect(mittX).toBeCloseTo(0.5 * 390 + 0.2 * 390, 0);
    expect(mittY).toBeCloseTo(0.5 * 520 - 0.1 * 390, 0);
  });

  it('"skulle" skiljs från "blev" på annat än färg: streckad kant på etiketten och ofylld ring i stället för fylld punkt', async () => {
    await montera({ noteringar: [notering('a', { avsikt: 'skulle', etikett: 'Borde gått här' }), notering('b', { etikett: 'Så blev det', koordinater: [[0.2, 0.2]] })] });
    const skulle = document.querySelector('[data-testid=foto-etikett][data-avsikt=skulle]')!.firstElementChild as HTMLElement;
    const blev = document.querySelector('[data-testid=foto-etikett][data-avsikt=blev]')!.firstElementChild as HTMLElement;
    expect(skulle.style.border).toContain('dashed');
    expect(blev.style.border).toContain('solid');
    const gSkulle = document.querySelector('g[data-avsikt=skulle]')!;
    expect(gSkulle.querySelectorAll('circle')[1].getAttribute('fill')).toBe('none');
  });

  it('en lång text bryts i högst tre rader och kortas med …', async () => {
    await montera({ noteringar: [notering('a', { etikett: 'Så här blev det: skotaren körde ut över fuktstråket vid avlägget, spåret är djupt och måste läggas med ris innan nästa vecka' })] });
    const rader = id('foto-etikett').firstElementChild!.children;
    expect(rader.length).toBeLessThanOrEqual(3);
    expect(rader[rader.length - 1].textContent).toContain('…');
  });
});

describe('dra och ändra en etikett', () => {
  it('ett DRAG flyttar etiketten och sparar förskjutningen klämd mot bilden; sedan läses noteringarna om', async () => {
    await montera({ noteringar: [notering('a', { koordinater: [[0.9, 0.9]], etikett_dx: -0.1, etikett_dy: -0.05 })] });
    const e = id('foto-etikett');
    await pekare(e, 'pointerdown', 300, 400);
    await pekare(e, 'pointermove', 700, 900);       // långt utanför bilden
    await pekare(e, 'pointerup', 700, 900);
    await klickPa(e, 700, 900);                      // en webbläsare skickar ofta en click efter ett drag: den får inte öppna noteringen
    expect(andraNotering).toHaveBeenCalledTimes(1);
    const [nid, n] = andraNotering.mock.calls[0];
    expect(nid).toBe('a');
    expect(n.etikett).toBe('Stenmur');
    const f = n.forskjutning;
    expect(f.bildHojd).toBeCloseTo(4 / 3, 9);
    // etikettens mitt ligger INNANFÖR bilden även om fingret släpptes långt utanför
    expect(0.9 + f.dx).toBeLessThanOrEqual(1);
    expect(0.9 * f.bildHojd + f.dy).toBeLessThanOrEqual(f.bildHojd);
    expect(onAndrad).toHaveBeenCalled();
    expect(document.querySelector('textarea')).toBeNull();     // ett drag öppnar inte formuläret
  });

  it('ett TRYCK utan drag öppnar noteringen (texten + Ta bort när den töms); en ändrad text sparas med ny plats', async () => {
    await montera({ noteringar: [notering('a')] });
    await tryckEtikett(id('foto-etikett'), 200, 300);
    expect(textfalt().value).toBe('Stenmur');
    expect(andraNotering).not.toHaveBeenCalled();
    await skriv(textfalt(), 'Stenmur, skadad');
    await klick(knapp('Klar'));
    expect(andraNotering).toHaveBeenCalledTimes(1);
    const n = andraNotering.mock.calls[0][1];
    expect(n.etikett).toBe('Stenmur, skadad');
    expect(n.forskjutning.ruta.bredd).toBeGreaterThan(0);
  });

  it('misslyckas sparningen av ett drag syns felet, och etiketten är tillbaka där den låg', async () => {
    andraNotering.mockRejectedValueOnce(new Error('Rundan är avslutad och går inte att ändra.'));
    await montera({ noteringar: [notering('a', { etikett_dx: 0.1, etikett_dy: 0.1 })] });
    const e = id('foto-etikett');
    const fore = e.style.left;
    await pekare(e, 'pointerdown', 300, 400);
    await pekare(e, 'pointermove', 200, 300);
    await pekare(e, 'pointerup', 200, 300);
    expect(document.querySelector('[role=alert]')!.textContent).toContain('avslutad');
    expect(id('foto-etikett').style.left).toBe(fore);
  });
});

describe('AVSLUTAD RUNDA: bara titta', () => {
  it('ingen Skriv på bilden, ingen etikett går att trycka på eller dra, och ytan säger varför', async () => {
    await montera({ last: true, noteringar: [notering('a')] });
    expect(hittaKnapp('Skriv på bilden')).toBeUndefined();
    const e = id('foto-etikett');
    expect(e.getAttribute('role')).toBeNull();
    await pekare(e, 'pointerdown', 200, 300);
    await pekare(e, 'pointermove', 300, 400);
    await pekare(e, 'pointerup', 300, 400);
    await klickPa(e, 300, 400);
    expect(andraNotering).not.toHaveBeenCalled();
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.body.textContent).toContain('Rundan är avslutad');
    expect(document.body.textContent).toContain('Stenmur');     // men noteringen SYNS
  });
});

describe('noteringarna gick inte att läsa', () => {
  it('ytan säger det och går inte att skriva på — aldrig en bild som ser ut att sakna noteringar', async () => {
    await montera({ noteringarFel: true });
    expect(document.querySelector('[role=alert]')!.textContent).toContain('Noteringarna kunde inte läsas');
    expect((knapp('Skriv på bilden') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ett annat bildformat', () => {
  it('en liggande bild (1600 x 1200) passas in och u, v blir andelar av DEN bilden', async () => {
    // Ytan 390 x 560: bilden blir 390 x 292,5, centrerad (top = 133,75).
    const liggande = { top: (560 - 292.5) / 2, h: 292.5 };
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const t = (this as Element).getAttribute('data-testid');
      if (t === 'foto-rita-yta') return { left: 0, top: liggande.top, width: 390, height: liggande.h, right: 390, bottom: liggande.top + liggande.h, x: 0, y: liggande.top, toJSON: () => ({}) } as DOMRect;
      return orig.call(this);
    };
    await montera({}, { w: 1600, h: 1200 });
    await klick(knapp('Skriv på bilden'));
    await klick(knapp('Punkt'));
    await tryckBild(97.5, liggande.top + 73.125);
    await klick(knapp('Klar'));
    const i = skapaNotering.mock.calls[0][0];
    expect(i.koordinater).toEqual([[0.25, 0.25]]);
    expect(i.foto.bildHojd).toBeCloseTo(0.75, 9);
  });
});
