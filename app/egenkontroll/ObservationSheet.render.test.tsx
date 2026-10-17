// @vitest-environment jsdom
// "Notera har" renderat for riktigt (jsdom, riktig komponent, fejkat datalager).
//
// Det som far ga sonder tyst:
//  - Spara ar aktiv utan ton, typ, position - eller for en avvikelse utan foto,
//  - sparordningen: bilden FORST, raden sedan, fotoraden SIST,
//  - ett misslyckat steg stanger formularet eller tappar det man fyllt i,
//  - "Forsok igen" laddar upp bilden eller skriver raden en gang till,
//  - traffytorna krymper under 52 (handske, skakande maskin),
//  - borttagningen sker utan bekraftelse, eller bekraftelsen blir en dialog ovanpa arket,
//  - confirm()/alert() anropas.
// Placeringen (safe-area, ark mot tangentbord) kan jsdom inte raikna - den provas i falt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const anrop: string[] = [];

vi.mock('@/lib/egenkontroll', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontroll')>();
  return {
    ...verklig,
    skapaObservation: vi.fn(async (i: any) => { anrop.push('skapaObservation'); return { id: i.id, kalla: 'observation' }; }),
    andraObservation: vi.fn(async () => { anrop.push('andraObservation'); return {}; }),
    taBortObservation: vi.fn(async () => { anrop.push('taBortObservation'); }),
    laggTillFoto: vi.fn(async () => { anrop.push('laggTillFoto'); return {}; }),
  };
});
vi.mock('@/lib/egenkontrollfoto', async (orig) => {
  const verklig = await orig<typeof import('@/lib/egenkontrollfoto')>();
  return {
    ...verklig,
    komprimeraBild: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })),
    laddaUppFoto: vi.fn(async (sokvag: string) => { anrop.push('laddaUppFoto'); return sokvag; }),
  };
});

import * as db from '@/lib/egenkontroll';
import * as foto from '@/lib/egenkontrollfoto';
import ObservationSheet from './ObservationSheet';
import type { LevandePosition } from './useMinPosition';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const POS = { lat: 56.1234, lng: 14.5678, noggrannhet: 8 };
const pos = (over: Partial<LevandePosition> = {}): LevandePosition => ({
  status: 'ok', position: POS, skal: null, senasteNoggrannhet: null, forsokIgen: vi.fn(), ...over,
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function montera(props: Record<string, any> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const p = {
    lage: 'ny', egenkontrollId: 'runda-1', startPosition: POS, pos: pos(),
    onStang: vi.fn(), onSparad: vi.fn(), ...props,
  };
  await act(async () => { root!.render(createElement(ObservationSheet as any, p)); });
  return p as { onStang: ReturnType<typeof vi.fn>; onSparad: ReturnType<typeof vi.fn> } & Record<string, any>;
}

async function ommontera(props: Record<string, any>) {
  await act(async () => { root!.render(createElement(ObservationSheet as any, props)); });
}

const knappar = () => Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
const knapp = (text: string | RegExp) => {
  const k = knappar().find((b) => (typeof text === 'string' ? b.textContent?.includes(text) : text.test(b.textContent ?? '')));
  if (!k) throw new Error(`Ingen knapp med "${text}". Knappar: ${knappar().map((b) => b.textContent).join(' | ')}`);
  return k;
};
const klick = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const sparaKnapp = () => knappar().find((b) => /^(Spara|Sparar|Försök igen)/.test(b.textContent ?? ''))!;
const arInaktiv = (b: HTMLButtonElement) => b.disabled || b.style.pointerEvents === 'none';
const text = () => document.body.textContent ?? '';

async function valj(ton: string, typ: string) {
  await klick(knapp(ton));
  await klick(knapp(typ));
}

async function taFoto() {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}

beforeEach(() => {
  anrop.length = 0;
  vi.clearAllMocks();
  (URL as any).createObjectURL = vi.fn(() => 'blob:test');
  (URL as any).revokeObjectURL = vi.fn();
  (window as any).confirm = vi.fn(() => true);
  (window as any).alert = vi.fn();
});

afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

describe('Notera har - formularet', () => {
  it('oppnas som ett ark med rubriken "Notera här" och positionen som KVITTO (aldrig inmatning)', async () => {
    await montera();
    expect(document.querySelector('[role=dialog]')?.getAttribute('aria-label')).toBe('Notera här');
    expect(text()).toContain('Position tagen · 56.1234, 14.5678 · ±8 m');
    // Inget faltt for position: kvittot ar text, ingen input.
    const inputs = Array.from(document.querySelectorAll('input')).map((i) => i.getAttribute('type') ?? 'text');
    expect(inputs.sort()).toEqual(['file', 'text']); // fotot och kommentaren - inget mer
  });

  it('namnet ar neutralt: ingen knapp eller rubrik heter "avvikelse" utom tonvalet', async () => {
    await montera();
    expect(document.querySelector('[role=dialog]')?.getAttribute('aria-label')).not.toMatch(/avvikelse/i);
    const medAvvikelse = knappar().filter((b) => /avvikelse/i.test(b.textContent ?? '')).map((b) => b.textContent);
    expect(medAvvikelse).toEqual(['✕Avvikelse']); // bara tonen
  });

  it('TON FORST: tre val i ordning Bra, Kan bli bättre, Avvikelse - sedan fyra typer', async () => {
    await montera();
    const tonGrupp = document.querySelector('[role=group][aria-label="Hur ser det ut?"]')!;
    expect(Array.from(tonGrupp.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['✓Bra', '!Kan bli bättre', '✕Avvikelse']);
    const typGrupp = document.querySelector('[role=group][aria-label="Vad gäller det?"]')!;
    expect(Array.from(typGrupp.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Körspår', 'Stubbhöjd', 'Hänsyn', 'Annat']);
    // Tonen ligger ovanfor typen i dokumentet.
    expect(tonGrupp.compareDocumentPosition(typGrupp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('TRAFFYTOR: tonknapparna minst 52, typknapparna minst 52, fotoknappen minst 52, Spara minst 48', async () => {
    await montera();
    const hojd = (b: HTMLButtonElement) => Number.parseInt(b.style.minHeight, 10);
    for (const b of Array.from(document.querySelectorAll('[role=group] button')) as HTMLButtonElement[]) {
      expect(hojd(b), b.textContent ?? '').toBeGreaterThanOrEqual(52);
    }
    expect(hojd(knapp('Ta foto'))).toBeGreaterThanOrEqual(52);
    expect(hojd(sparaKnapp())).toBeGreaterThanOrEqual(48);
    const kommentar = document.querySelector('input[aria-label=Kommentar]') as HTMLInputElement;
    expect(Number.parseInt(kommentar.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });

  it('valet markeras med aria-pressed - inte bara med farg', async () => {
    await montera();
    await klick(knapp('Bra'));
    expect(knapp('Bra').getAttribute('aria-pressed')).toBe('true');
    expect(knapp('Kan bli bättre').getAttribute('aria-pressed')).toBe('false');
    await klick(knapp('Kan bli bättre'));
    expect(knapp('Bra').getAttribute('aria-pressed')).toBe('false');
    expect(knapp('Kan bli bättre').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Spara - vad som kravs', () => {
  it('inaktiv tills ton OCH typ ar valda, och sager vad som saknas', async () => {
    await montera();
    expect(arInaktiv(sparaKnapp())).toBe(true);
    expect(text()).toContain('Välj om det är bra, kan bli bättre eller en avvikelse.');
    await klick(knapp('Bra'));
    expect(arInaktiv(sparaKnapp())).toBe(true);
    expect(text()).toContain('Välj vad det gäller.');
    await klick(knapp('Körspår'));
    expect(arInaktiv(sparaKnapp())).toBe(false);
    expect(text()).not.toContain('Välj vad det gäller.');
  });

  it('AVVIKELSE KRAVER FOTO: inaktiv utan, aktiv med - och rubriken sager det', async () => {
    await montera();
    expect(text()).toContain('Foto (valfritt)');
    await valj('Avvikelse', 'Stubbhöjd');
    expect(text()).toContain('Foto (krävs vid avvikelse)');
    expect(arInaktiv(sparaKnapp())).toBe(true);
    expect(text()).toContain('En avvikelse behöver ett foto.');
    await taFoto();
    expect(arInaktiv(sparaKnapp())).toBe(false);
  });

  it('bra och kan bli bättre sparas utan foto', async () => {
    await montera();
    await valj('Kan bli bättre', 'Hänsyn');
    expect(arInaktiv(sparaKnapp())).toBe(false);
  });

  it('POSITION KRAVS: utan den ar Spara inaktiv trots val, och en knapp ger ett nytt forsok', async () => {
    const p = pos({ status: 'saknas', position: null, skal: 'tidsgrans' });
    await montera({ startPosition: null, pos: p });
    await valj('Bra', 'Körspår');
    expect(arInaktiv(sparaKnapp())).toBe(true);
    expect(text()).toContain('Positionen saknas — hämta den innan du sparar.');
    expect(text()).toContain('Observationen går inte att spara utan position.');
    expect(text()).not.toContain('Position tagen');
    await klick(knapp('Försök hämta positionen igen'));
    expect(p.forsokIgen).toHaveBeenCalledTimes(1);
  });

  it('kommer en duglig position EFTER att arket oppnats tas den, och sedan flyttar den sig inte', async () => {
    const p = pos({ status: 'soker', position: null });
    const props = await montera({ startPosition: null, pos: p });
    expect(text()).toContain('Söker din position…');
    await ommontera({ ...props, pos: pos({ position: { lat: 56.5, lng: 14.7, noggrannhet: 12 } }) });
    expect(text()).toContain('Position tagen · 56.5000, 14.7000 · ±12 m');
    await ommontera({ ...props, pos: pos({ position: { lat: 57.0, lng: 15.0, noggrannhet: 5 } }) });
    expect(text()).toContain('56.5000, 14.7000');
    expect(text()).not.toContain('57.0000');
  });
});

describe('Spara - ordningen och felen', () => {
  it('BILDEN FORST, raden sedan, fotoraden SIST', async () => {
    const props = await montera();
    await valj('Avvikelse', 'Körspår');
    await taFoto();
    await klick(sparaKnapp());
    expect(anrop).toEqual(['laddaUppFoto', 'skapaObservation', 'laggTillFoto']);
    expect(props.onSparad).toHaveBeenCalledTimes(1);
  });

  it('bildens sokvag ar byggSokvag(runda, punktens id) - och raden far SAMMA id', async () => {
    await montera();
    await valj('Avvikelse', 'Körspår');
    await taFoto();
    await klick(sparaKnapp());
    const sokvag = (foto.laddaUppFoto as any).mock.calls[0][0] as string;
    const rad = (db.skapaObservation as any).mock.calls[0][0];
    expect(sokvag).toMatch(new RegExp(`^runda-1/${rad.id}-\\d+\\.jpg$`));
    expect((db.laggTillFoto as any).mock.calls[0][0]).toMatchObject({ egenkontrollId: 'runda-1', punktId: rad.id, sokvag });
  });

  it('raden far ton, typ, kommentar och positionen fran trycket', async () => {
    await montera();
    await valj('Bra', 'Hänsyn');
    const kommentar = document.querySelector('input[aria-label=Kommentar]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(kommentar, 'Rishög som ligger perfekt');
      kommentar.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await klick(sparaKnapp());
    expect((db.skapaObservation as any).mock.calls[0][0]).toMatchObject({
      egenkontrollId: 'runda-1', ton: 'bra', typ: 'hansyn', kommentar: 'Rishög som ligger perfekt',
      lat: 56.1234, lng: 14.5678, harFoto: false,
    });
    expect(anrop).toEqual(['skapaObservation']); // inget foto, ingen uppladdning
  });

  it('UPPLADDNINGEN MISSLYCKAS: ingen rad skrivs, formularet star kvar med allt, "Forsok igen" laddar upp en gang till', async () => {
    const faller = async () => { anrop.push('laddaUppFoto'); throw new Error('Bilden kunde inte laddas upp: nat nere'); };
    (foto.laddaUppFoto as any).mockImplementationOnce(faller).mockImplementationOnce(faller);
    const props = await montera();
    await valj('Avvikelse', 'Körspår');
    await taFoto();
    await klick(sparaKnapp());

    expect(anrop).toEqual(['laddaUppFoto']);
    expect(props.onSparad).not.toHaveBeenCalled();
    expect(text()).toContain('Bilden kunde inte laddas upp: nat nere');
    expect(text()).toContain('Inget är förlorat — det du fyllt i ligger kvar.');
    expect(knapp('Avvikelse').getAttribute('aria-pressed')).toBe('true');
    expect(knapp('Körspår').getAttribute('aria-pressed')).toBe('true');
    expect(sparaKnapp().textContent).toBe('Försök igen');
    // ... och en avvikelse kan ALDRIG sparas utan foto, hur mycket det an strular: efter ett andra misslyckande
    // erbjuds inget "Spara utan foto" (det gor det for bra/kan bli battre, se testet nedan).
    await klick(sparaKnapp());
    expect(anrop).toEqual(['laddaUppFoto', 'laddaUppFoto']);
    expect(db.skapaObservation).not.toHaveBeenCalled();
    expect(text()).not.toContain('Spara utan foto');

    anrop.length = 0;
    await klick(sparaKnapp());
    expect(anrop).toEqual(['laddaUppFoto', 'skapaObservation', 'laggTillFoto']);
    expect(props.onSparad).toHaveBeenCalledTimes(1);
  });

  it('FOTORADEN MISSLYCKAS EFTER RADEN: sags rakt ut, och "Forsok igen" skriver bara fotoraden - raden skapas inte en gang till', async () => {
    (db.laggTillFoto as any).mockImplementationOnce(async () => { anrop.push('laggTillFoto'); throw new Error('nat nere'); });
    const props = await montera();
    await valj('Avvikelse', 'Körspår');
    await taFoto();
    await klick(sparaKnapp());

    expect(text()).toContain('Observationen är sparad, men bilden kunde inte läggas till: nat nere');
    expect(props.onSparad).not.toHaveBeenCalled();

    anrop.length = 0;
    await klick(sparaKnapp());
    expect(anrop).toEqual(['laggTillFoto']); // varken uppladdning eller skapaObservation igen
    expect(props.onSparad).toHaveBeenCalledTimes(1);
  });

  it('STANGER man efter att raden skrivits men fotoraden fallerat laser sidan om - observationen syns i listan', async () => {
    (db.laggTillFoto as any).mockImplementationOnce(async () => { throw new Error('nat nere'); });
    const props = await montera();
    await valj('Avvikelse', 'Körspår');
    await taFoto();
    await klick(sparaKnapp());
    await klick(knapp('Avbryt'));
    expect(props.onSparad).toHaveBeenCalledTimes(1);
    expect(props.onStang).not.toHaveBeenCalled();
  });

  it('Avbryt innan nagot sparats stanger bara - utan att las om', async () => {
    const props = await montera();
    await klick(knapp('Avbryt'));
    expect(props.onStang).toHaveBeenCalledTimes(1);
    expect(props.onSparad).not.toHaveBeenCalled();
  });

  it('"Spara utan foto" visas forst efter tva misslyckade forsok, och bara for bra/kan bli bättre', async () => {
    (foto.laddaUppFoto as any).mockImplementation(async () => { throw new Error('nat nere'); });
    await montera();
    await valj('Bra', 'Körspår');
    await taFoto();
    await klick(sparaKnapp());
    expect(text()).not.toContain('Spara utan foto');
    await klick(sparaKnapp());
    expect(text()).toContain('Spara utan foto');
    anrop.length = 0;
    await klick(knapp('Spara utan foto'));
    expect(anrop).toEqual(['skapaObservation']);
    expect((db.skapaObservation as any).mock.calls.at(-1)[0].harFoto).toBe(false);
    (foto.laddaUppFoto as any).mockReset();
  });
});

describe('Andra och ta bort en befintlig observation', () => {
  const obs = {
    id: 'o-1', egenkontroll_id: 'runda-1', ordning: 0, del: 'observation', kalla: 'observation', grupp: null,
    markering_id: null, markering_marker_id: null, punkt_typ: null, rubrik: 'Observation', antal_planerat: null,
    geometri_snapshot: null, plan_kommentar: null, status: 'battre', avvikelse_typ: 'stubbhojd', varde_foreslaget: null,
    varde_bekraftat: null, kommentar: 'Lite hög', lat: 56.2, lng: 14.6, besvarad: '2026-10-17T09:00:00Z',
  };

  it('oppnas med sina val ifyllda, sin position som "Noterad här" och sina bilder', async () => {
    await montera({ lage: 'andra', observation: obs, fotoUrler: ['https://x/a.jpg'], startPosition: null });
    expect(document.querySelector('[role=dialog]')?.getAttribute('aria-label')).toBe('Observation');
    expect(knapp('Kan bli bättre').getAttribute('aria-pressed')).toBe('true');
    expect(knapp('Stubbhöjd').getAttribute('aria-pressed')).toBe('true');
    expect((document.querySelector('input[aria-label=Kommentar]') as HTMLInputElement).value).toBe('Lite hög');
    expect(text()).toContain('Noterad här · 56.2000, 14.6000');
    expect(document.querySelectorAll('img[src="https://x/a.jpg"]')).toHaveLength(1);
  });

  it('Spara ar inaktiv tills nagot andrats (dirty-state sitter pa knappen), och sparar med UPDATE', async () => {
    const props = await montera({ lage: 'andra', observation: obs, fotoUrler: [], startPosition: null });
    expect(arInaktiv(sparaKnapp())).toBe(true);
    await klick(knapp('Bra'));
    expect(arInaktiv(sparaKnapp())).toBe(false);
    await klick(sparaKnapp());
    expect(anrop).toEqual(['andraObservation']);
    expect((db.andraObservation as any).mock.calls[0]).toEqual([
      'o-1', { ton: 'bra', typ: 'stubbhojd', kommentar: 'Lite hög', antalFoton: 0 },
    ]);
    expect(props.onSparad).toHaveBeenCalledTimes(1);
  });

  it('en andring till Avvikelse utan nagot foto ar blockerad; med ett befintligt foto gar den', async () => {
    await montera({ lage: 'andra', observation: obs, fotoUrler: [], startPosition: null });
    await klick(knapp('Avvikelse'));
    expect(arInaktiv(sparaKnapp())).toBe(true);
    expect(text()).toContain('En avvikelse behöver ett foto.');
    await act(async () => { root!.unmount(); });
    host!.remove();
    await montera({ lage: 'andra', observation: obs, fotoUrler: ['https://x/a.jpg'], startPosition: null });
    await klick(knapp('Avvikelse'));
    expect(arInaktiv(sparaKnapp())).toBe(false);
  });

  it('TA BORT kraver en bekraftelse INUTI arket - aldrig confirm(), aldrig en andra dialog', async () => {
    const props = await montera({ lage: 'andra', observation: obs, fotoUrler: [], startPosition: null });
    await klick(knapp('Ta bort observationen'));

    expect(db.taBortObservation).not.toHaveBeenCalled(); // forsta trycket tar inte bort
    expect(text()).toContain('Ta bort observationen? Fotot försvinner också.');
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1); // ingen modal ovanpa arket
    expect((window as any).confirm).not.toHaveBeenCalled();

    // "Behall" gar tillbaka utan att ta bort.
    await klick(knapp('Behåll'));
    expect(text()).not.toContain('Ta bort observationen? Fotot försvinner också.');
    expect(db.taBortObservation).not.toHaveBeenCalled();

    await klick(knapp('Ta bort observationen'));
    await klick(knapp(/^Ta bort$/));
    expect(db.taBortObservation).toHaveBeenCalledWith('o-1');
    expect(props.onSparad).toHaveBeenCalledTimes(1);
    expect((window as any).confirm).not.toHaveBeenCalled();
    expect((window as any).alert).not.toHaveBeenCalled();
  });

  it('en borttagning som faller sags rakt ut och arket star kvar', async () => {
    (db.taBortObservation as any).mockImplementationOnce(async () => { throw new Error('Rundan är avslutad och går inte att ändra.'); });
    const props = await montera({ lage: 'andra', observation: obs, fotoUrler: [], startPosition: null });
    await klick(knapp('Ta bort observationen'));
    await klick(knapp(/^Ta bort$/));
    expect(text()).toContain('Rundan är avslutad och går inte att ändra.');
    expect(props.onSparad).not.toHaveBeenCalled();
  });

  it('ett NYTT formular har ingen "Ta bort"', async () => {
    await montera();
    expect(knappar().some((b) => /Ta bort/.test(b.textContent ?? ''))).toBe(false);
  });
});

describe('aldrig confirm() eller alert()', () => {
  it('inget av flodena anropar dem', async () => {
    await montera();
    await valj('Bra', 'Körspår');
    await klick(sparaKnapp());
    expect((window as any).confirm).not.toHaveBeenCalled();
    expect((window as any).alert).not.toHaveBeenCalled();
  });
});
