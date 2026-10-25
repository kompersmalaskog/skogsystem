// @vitest-environment jsdom
// Över tid › Per grovlek och Greppet: det som kan gå sönder tyst — en grå ruta som ser ut som 0 %, en ruta som inte öppnar sina kontroller, ett Grepp-läsfel som ser ut som
// "inget underlag", en maskin utan migration som ser ut som tom data, och kontrollerna bakom en ruta som inte summerar till rutan. Layouten mäts i riktig Chromium (CLAUDE.md).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import grepp from '@/lib/kalibrering/__fixtures__/scorpion_grepp_2026.json';
import grovlek from '@/lib/kalibrering/__fixtures__/scorpion_grovlek_2026.json';
import { GROVLEK_KLASSER, type GrovlekRad, type RutaVal } from '@/lib/kalibrering/grovlek';
import type { GreppRad } from '@/lib/kalibrering/greppTid';
import type { GreppResp, GrovlekResp, KravRow, FaktKalibrering } from '@/lib/kalibrering/typer';
import GreppVinkel from './GreppVinkel';
import GrovlekVinkel from './GrovlekVinkel';
import RutaArk from './RutaArk';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TR: Record<string, string> = { G: 'Gran', T: 'Tall' };
const raderG: GrovlekRad[] = (grovlek.rader as (string | number)[][]).map(r => ({ manad: r[0] as string, tradslag: TR[r[1] as string], klass: GROVLEK_KLASSER[r[2] as number], filnamn: `fil${r[3]}`, n: r[4] as number, traff: r[5] as number, summa: r[6] as number }));
const raderP: GreppRad[] = (grepp.rader as (string | number)[][]).map(r => ({ manad: r[0] as string, tradslag: r[1] as string, klass: r[2] as string, stammar: r[3] as number, steg: r[4] as number, still: r[5] as number, summaAndel: r[6] as number }));
const trosklar: KravRow[] = [{ variabel: 'diameter', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 4, mal: 85, golv: 75, enhet: '%', larm_min_matt: 150 }];

const grovlekData = (over: Partial<GrovlekResp> = {}): GrovlekResp => ({ ok: true, maskin_id: 'M', tolerans: 4, rader: raderG, ...over });
const greppData = (over: Partial<GreppResp> = {}): GreppResp => ({ ok: true, maskin_id: 'M', tillganglig: true, rader: raderP, kvar: 0, stammarTotalt: 100, stammarRaknade: 100, ...over });
const oppnaRuta = vi.fn<(r: RutaVal) => void>();
const forsokIgen = vi.fn();
const d = (over: Record<string, unknown> = {}) => ({ grovlekData: grovlekData(), grovlekFel: null, greppData: greppData(), greppFel: null, bedomning: { profil: 'VIDA', trosklar }, forsokIgen, ...over }) as any;
const vy = (over: Record<string, unknown> = {}) => ({ lagetSteg: 'manad', grovlekTradslag: null, setGrovlekTradslag: vi.fn(), ...over }) as any;
const ark = { oppnaRuta } as any;

let rot: Root | null = null, host: HTMLDivElement | null = null;
const montera = (el: ReturnType<typeof createElement>) => { host = document.createElement('div'); document.body.appendChild(host); rot = createRoot(host); act(() => rot!.render(el)); return host; };
beforeEach(() => { oppnaRuta.mockClear(); forsokIgen.mockClear(); });
afterEach(() => { act(() => rot?.unmount()); host?.remove(); rot = null; host = null; });
const celler = (h: HTMLElement) => Array.from(h.querySelectorAll<HTMLElement>('[role=cell]'));

describe('Per grovlek', () => {
  it('ritar ett rutnät: fem grovlekar × perioderna, med träff stort och snitt litet', () => {
    const h = montera(createElement(GrovlekVinkel, { d: d(), v: vy(), ark }));
    expect(h.querySelectorAll('[role=row]').length).toBe(6); // rubrikrad + fem klasser
    expect(h.textContent).toContain('300+');
    const oktober300 = celler(h).filter(c => c.getAttribute('aria-label')?.includes('300+ mm, Oktober 2026'));
    expect(oktober300).toHaveLength(1);
    expect(oktober300[0].textContent).toContain('63 %');
    expect(oktober300[0].textContent).toContain('+2,6 mm');
    expect(oktober300[0].getAttribute('data-ton')).toBe('rod'); // 63 < golv 75
  });

  it('färg efter kravet: grön ≥ 85, orange 75–84, röd under 75 — på det heltal som visas', () => {
    const h = montera(createElement(GrovlekVinkel, { d: d(), v: vy(), ark }));
    const ton = (etikett: string) => celler(h).find(c => c.getAttribute('aria-label')?.includes(etikett))!.getAttribute('data-ton');
    expect(ton('<150 mm, September 2026')).toBe('gron');  // 88 %
    expect(ton('<150 mm, Augusti 2026')).toBe('orange');  // 79 %
    expect(ton('<150 mm, Juli 2026')).toBe('rod');        // 60 %
  });

  it('en ruta med för få stammar är grå med "–", aldrig 0 %, och går ändå att öppna', () => {
    const h = montera(createElement(GrovlekVinkel, { d: d(), v: vy({ grovlekTradslag: 'Tall' }), ark }));
    const tunna = celler(h).filter(c => c.getAttribute('data-ton') === 'tunn');
    expect(tunna.length).toBeGreaterThan(0);
    for (const c of tunna) { expect(c.textContent).toBe('–'); expect(c.getAttribute('aria-label')).toContain('för få stammar'); }
    act(() => tunna[0].click());
    expect(oppnaRuta).toHaveBeenCalledTimes(1);
    expect(oppnaRuta.mock.calls[0][0].tunn).toBe(true);
  });

  it('ett tryck på en ruta öppnar kontrollerna bakom den, och de summerar till rutans stammar', () => {
    const h = montera(createElement(GrovlekVinkel, { d: d(), v: vy({ grovlekTradslag: 'Gran' }), ark }));
    const ruta = celler(h).find(c => c.getAttribute('aria-label')?.includes('300+ mm, September 2026'))!;
    act(() => ruta.click());
    const val = oppnaRuta.mock.calls[0][0];
    expect(val.rubrik).toBe('Gran · 300+ mm');
    expect(val.periodNamn).toBe('September 2026');
    expect(val.stammar).toBe(8);
    expect(val.kontroller.reduce((a, k) => a + k.stammar, 0)).toBe(8);
    expect(Math.round(val.traffPct)).toBe(56);
  });

  it('trädslagsväxeln: Alla + de trädslag som finns, och ett val ändrar vyn', () => {
    const setT = vi.fn();
    const h = montera(createElement(GrovlekVinkel, { d: d(), v: vy({ setGrovlekTradslag: setT }), ark }));
    const flikar = Array.from(h.querySelectorAll('[role=tab]')).map(t => t.textContent);
    expect(flikar).toEqual(['Alla', 'Gran', 'Tall']);
    act(() => (Array.from(h.querySelectorAll('[role=tab]')).find(t => t.textContent === 'Tall') as HTMLElement).click());
    expect(setT).toHaveBeenCalledWith('Tall');
  });

  it('förklaringen säger vad varje färg betyder, med gränserna ur kravprofilen', () => {
    const h = montera(createElement(GrovlekVinkel, { d: d(), v: vy(), ark }));
    const t = h.querySelector('[data-teckenforklaring]')!.textContent!;
    expect(t).toContain('85 % eller mer');
    expect(t).toContain('75–85 %');
    expect(t).toContain('under 75 %');
    expect(t).toContain('färre än 8 stammar');
  });

  it('läsfel är ett fel med Försök igen — inte "inget underlag"; utan svar står en laddrad', () => {
    let h = montera(createElement(GrovlekVinkel, { d: d({ grovlekData: null, grovlekFel: 'x' }), v: vy(), ark }));
    expect(h.textContent).toContain('Grovlekarna kunde inte läsas');
    act(() => (Array.from(h.querySelectorAll('button')).find(b => b.textContent === 'Försök igen') as HTMLElement).click());
    expect(forsokIgen).toHaveBeenCalled();
    act(() => rot!.unmount()); host!.remove();
    h = montera(createElement(GrovlekVinkel, { d: d({ grovlekData: null }), v: vy(), ark }));
    expect(h.textContent).toContain('Läser grovlekarna');
    expect(h.textContent).not.toContain('Inget underlag');
  });
});

describe('Greppet', () => {
  it('rader per trädslag och en extra rad för 300+, färg efter förändring med "start" på första rutan', () => {
    const h = montera(createElement(GreppVinkel, { d: d(), v: vy() }));
    const rubriker = Array.from(h.querySelectorAll('[role=rowheader]')).map(r => r.textContent);
    expect(rubriker).toEqual(['Gran', 'Tall', 'Björk', 'Övrigt löv', '300+ mmalla trädslag']);
    const tallOkt = celler(h).find(c => c.getAttribute('aria-label')?.startsWith('Tall, 10/26'))!;
    expect(tallOkt.textContent).toContain('36 %');
    expect(tallOkt.textContent).toContain('+8 pp');
    expect(tallOkt.getAttribute('data-ton')).toBe('rod');
    expect(celler(h).some(c => c.textContent?.includes('start'))).toBe(true);
  });

  it('under rutnätet står raden om att jämföra i sidled, och förklaringen med ord', () => {
    const h = montera(createElement(GreppVinkel, { d: d(), v: vy() }));
    expect(h.textContent).toContain('Jämför i sidled. Grova och krokiga stammar står still oftare även när allt är rätt.');
    const t = h.querySelector('[data-teckenforklaring]')!.textContent!;
    expect(t).toContain('Mer greppfel');
    expect(t).toContain('Mindre greppfel');
    expect(t).toContain('färre än 20 stammar');
  });

  it('grå ruta med "–" för få stammar; aldrig 0 %', () => {
    const h = montera(createElement(GreppVinkel, { d: d(), v: vy() }));
    const tunn = celler(h).filter(c => c.getAttribute('data-ton') === 'tunn');
    expect(tunn.length).toBeGreaterThan(0);
    for (const c of tunn) expect(c.textContent).toBe('–');
  });

  it('en omräkning som pågår säger det, och det som redan är räknat visas', () => {
    const h = montera(createElement(GreppVinkel, { d: d({ greppData: greppData({ kvar: 4, rader: raderP.filter(r => r.manad >= '2026-09') }) }), v: vy() }));
    expect(h.textContent).toContain('Räknas om');
    expect(h.textContent).toContain('4 objekt ligger efter');
    expect(h.textContent).toContain('09/26');
    expect(h.textContent).not.toContain('08/26');
  });

  it('stammar utan trädslag eller tid sägs, siffrorna förblir synliga', () => {
    const h = montera(createElement(GreppVinkel, { d: d({ greppData: greppData({ stammarTotalt: 700, stammarRaknade: 600 }) }), v: vy() }));
    expect(h.textContent).toMatch(/600 av 700 stammar ingår/);
  });

  it('migrationen är inte körd: det står, och det ser inte ut som tom data', () => {
    const h = montera(createElement(GreppVinkel, { d: d({ greppData: greppData({ tillganglig: false, orsak: 'migration', rader: [] }) }), v: vy() }));
    expect(h.textContent).toContain('Greppet är inte aktiverat än');
    expect(h.textContent).not.toContain('Inget underlag');
  });

  it('läsfel är ett fel med Försök igen', () => {
    const h = montera(createElement(GreppVinkel, { d: d({ greppData: null, greppFel: 'x' }), v: vy() }));
    expect(h.textContent).toContain('Greppet kunde inte läsas');
    act(() => (Array.from(h.querySelectorAll('button')).find(b => b.textContent === 'Försök igen') as HTMLElement).click());
    expect(forsokIgen).toHaveBeenCalled();
  });

  it('Greppet har ingen träffyta på rutorna (det finns inga kontroller bakom ett grepp): inga knappar bland cellerna', () => {
    const h = montera(createElement(GreppVinkel, { d: d(), v: vy() }));
    expect(celler(h).every(c => c.tagName !== 'BUTTON')).toBe(true);
  });
});

describe('RutaArk', () => {
  const kalib = (filnamn: string) => ({ id: 1, datum: '2026-10-05', maskin_id: 'M', operator_id: null, tradslag: 'GRAN', antal_kontrollstammar: 1, antal_kontrollstockar: 5, filnamn, weather_at_harvest: null }) as unknown as FaktKalibrering;
  const val: RutaVal = {
    rubrik: 'Gran · 300+ mm', periodNamn: 'September 2026', klass: '300+', stammar: 3, traffPct: 56.3, snittMm: 5.2, ton: 'rod', tunn: false, tolerans: 4,
    kontroller: [{ filnamn: 'a', stammar: 2, traffPct: 50, snittMm: 6 }, { filnamn: 'b', stammar: 1, traffPct: 100, snittMm: 3 }],
  };

  it('visar rutans tal och en rad per kontroll med dess egen träff; ett tryck öppnar kontrollen', () => {
    const onKontroll = vi.fn();
    const h = montera(createElement(RutaArk, { ruta: val, kalib: [kalib('a'), kalib('b')], tider: null, onKontroll }));
    expect(h.textContent).toContain('September 2026 · 3 stammar i 2 kontroller');
    expect(h.textContent).toContain('56');
    expect(h.textContent).toContain('+5,2');
    expect(h.textContent).toContain('50 %');
    expect(h.textContent).toContain('2 stammar · +6,0 mm');
    act(() => (Array.from(h.querySelectorAll('button')).find(b => b.textContent?.includes('50 %')) as HTMLElement).click());
    expect(onKontroll).toHaveBeenCalledWith('a');
  });

  it('en ruta med för få stammar säger det, och visar talen ändå', () => {
    const h = montera(createElement(RutaArk, { ruta: { ...val, tunn: true, ton: 'tunn' }, kalib: [kalib('a')], tider: null, onKontroll: vi.fn() }));
    expect(h.textContent).toContain('För få stammar för en bedömning');
    expect(h.textContent).toContain('56');
  });

  it('en kontroll som inte finns i listan visas ändå (utan tryckyta), aldrig tyst borta', () => {
    const h = montera(createElement(RutaArk, { ruta: val, kalib: [kalib('a')], tider: null, onKontroll: vi.fn() }));
    expect(h.textContent).toContain('Kontrollen finns inte i listan');
  });
});
