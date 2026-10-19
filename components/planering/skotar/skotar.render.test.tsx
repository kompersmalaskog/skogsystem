// @vitest-environment jsdom
// Skotarens lassvyer renderade på riktigt: kortet efter lossning, Ändra lasset, kvar, färdigskotad, morgonkort, avläggets "skotat hit" och pillen med kvar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { LossningsKort, NyttAvlaggKort } from './LossningsKort';
import { AndraLassArk } from './AndraLassArk';
import { KvarArk } from './KvarArk';
import { FardigskotadKort } from './FardigskotadKort';
import { MorgonKortVy, VaderLista } from './VaderMorgon';
import { AvlaggSkotatSektion } from './AvlaggSkotatSektion';
import { KorvyObjektPill } from '../KorvyObjektPill';
import { beraknaKvar, farduskotatKontroll, kvarSammanfattning } from '@/lib/skotarLass/kvar';
import { skotatTillAvlagg } from '@/lib/skotarLass/avlaggStat';
import type { Avlagg, Lass } from '@/lib/skotarLass/typer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root; let div: HTMLDivElement;
beforeEach(() => { div = document.createElement('div'); document.body.appendChild(div); root = createRoot(div); });
afterEach(async () => { await act(async () => { root.unmount(); }); div.remove(); });
const visa = async (el: React.ReactElement) => { await act(async () => { root.render(el); }); };
const q = (id: string) => div.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const tryck = async (id: string) => { const e = q(id); if (!e) throw new Error(`saknas: ${id}`); await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

const A2: Avlagg = { id: 'vida:2', nummer: '2', kalla: 'vida', lat: 56.6, lng: 15.8 };
const A3: Avlagg = { id: 'vida:3', nummer: '3', kalla: 'vida', lat: 56.6001, lng: 15.8 };
const lass = (over: Partial<Lass> = {}): Lass => ({
  id: 'l7', objektId: 'o', voNummer: '555', maskinId: 'M', medarbetareId: null, lassNummer: 7, datum: '2026-10-19', status: 'foreslaget', bekraftadAv: null, bekraftadTid: null,
  sparPunkter: [], vagar: [], skapad: '2026-10-19T08:00:00.000Z', andrad: '2026-10-19T08:00:00.000Z',
  delar: [{ delNr: 1, avlaggId: 'vida:2', avlaggNummer: '2', lossadTid: '2026-10-19T12:12:00.000Z', lat: 56.6, lng: 15.8,
    rader: [{ nyckel: 'tallkubb', namn: 'Kubb: Tall_V3', m3: 5 }, { nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 10 }, { nyckel: 'bjorkmassa', namn: 'Massa: Bjork_V3', m3: 3 }] }],
  ...over,
});

describe('LossningsKort', () => {
  it('auto: rubrik, sortiment störst först, summa, Ändra och en linje som fylls på 10 s', async () => {
    const onAndra = vi.fn();
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 1, fas: 'auto', start: 1 }} lass={lass()} avlagg={[A2]} onAndra={onAndra} onFyllI={vi.fn()} onValjAvlagg={vi.fn()} onTaBort={vi.fn()} />);
    expect(q('lossningskort')?.textContent).toContain('Lass 7 lossat → Avlägg 2');
    expect(q('lossningskort')?.textContent).toContain('18 m³');
    expect(q('lossningskort')?.textContent).toMatch(/Timmer.*10.*Kubb.*5.*Massa.*3/);
    expect((q('lossning-linje') as HTMLElement).style.transition).toContain('10000ms');
    await tryck('lossning-andra');
    expect(onAndra).toHaveBeenCalledTimes(1);
  });
  it('forare: ingen linje, stor knapp "Fyll i"', async () => {
    const onFyllI = vi.fn();
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 1, fas: 'forare', start: 1 }} lass={lass({ status: 'vantar_forare' })} avlagg={[A2]} onAndra={vi.fn()} onFyllI={onFyllI} onValjAvlagg={vi.fn()} onTaBort={vi.fn()} />);
    expect(q('lossning-linje')).toBeNull();
    await tryck('lossning-fyll-i');
    expect(onFyllI).toHaveBeenCalled();
  });
  it('del 2 heter "Lass 7 · del 2"', async () => {
    const l = lass(); l.delar.push({ delNr: 2, avlaggId: 'vida:3', avlaggNummer: '3', lossadTid: '2026-10-19T12:20:00.000Z', lat: 56.6001, lng: 15.8, rader: [] });
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 2, fas: 'forare', start: 1 }} lass={l} avlagg={[A2, A3]} onAndra={vi.fn()} onFyllI={vi.fn()} onValjAvlagg={vi.fn()} onTaBort={vi.fn()} />);
    expect(q('lossningskort')?.textContent).toContain('Lass 7 · del 2 lossat → Avlägg 3');
  });
  it('avlagg_val: stora knappar med möjliga avlägg', async () => {
    const onValj = vi.fn();
    const l = lass(); l.delar[0].avlaggId = null; l.delar[0].avlaggNummer = null;
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 1, fas: 'avlagg_val', start: 1 }} lass={l} avlagg={[A2, A3]} onAndra={vi.fn()} onFyllI={vi.fn()} onValjAvlagg={onValj} onTaBort={vi.fn()} />);
    await tryck('avlagg-val-3');
    expect(onValj).toHaveBeenCalledWith(A3);
  });
  it('alla tryckytor är minst 56 px höga', async () => {
    await visa(<LossningsKort kort={{ lassId: 'l7', delNr: 1, fas: 'forare', start: 1 }} lass={lass({ status: 'vantar_forare' })} avlagg={[A2]} onAndra={vi.fn()} onFyllI={vi.fn()} onValjAvlagg={vi.fn()} onTaBort={vi.fn()} />);
    for (const b of Array.from(div.querySelectorAll('button'))) expect(parseInt((b as HTMLElement).style.minHeight || '0', 10) >= 56 || parseInt((b as HTMLElement).style.minWidth || '0', 10) >= 56).toBe(true);
  });
});

describe('NyttAvlaggKort', () => {
  it('Ja / Nej', async () => {
    const svar = vi.fn();
    await visa(<NyttAvlaggKort fraga={{ lat: 1, lng: 2, ts: 3 }} nummer="4" onSvar={svar} />);
    expect(q('nytt-avlagg-kort')?.textContent).toContain('Nytt avlägg här?');
    expect(q('nytt-avlagg-kort')?.textContent).toContain('Avlägg 4');
    await tryck('nytt-avlagg-ja'); await tryck('nytt-avlagg-nej');
    expect(svar.mock.calls).toEqual([[true], [false]]);
  });
});

describe('AndraLassArk', () => {
  const valbara = [{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 0 }, { nyckel: 'granmassa', namn: 'Massa: Gran_V3', m3: 0 }, { nyckel: 'ved_markagare', namn: 'Ved markägare', m3: 0 }];
  const rendera = (l: Lass, fn: Partial<Parameters<typeof AndraLassArk>[0]> = {}) => visa(
    <AndraLassArk lass={l} delNr={1} avlagg={[A2, A3]} valbara={valbara} onRad={vi.fn()} onAvlagg={vi.fn()} onKlar={vi.fn()} onAvbryt={vi.fn()} onTaBort={vi.fn()} {...fn} />);
  it('summan överst, en rad per sortiment med − och +, tillägg för det som saknas inkl. Ved markägare', async () => {
    await rendera(lass());
    expect(q('andra-summa')?.textContent).toContain('18');
    expect(q('andra-rad-talltimmer')).not.toBeNull();
    expect(q('tillagg-granmassa')).not.toBeNull();
    expect(q('tillagg-ved_markagare')?.textContent).toContain('Ved markägare');
    expect(q('tillagg-talltimmer')).toBeNull();   // finns redan på lasset
  });
  it('+ och − ger ett m³ i taget', async () => {
    const onRad = vi.fn();
    await rendera(lass(), { onRad });
    await tryck('plus-talltimmer'); await tryck('minus-talltimmer'); await tryck('tillagg-granmassa');
    expect(onRad.mock.calls.map((c) => c[1])).toEqual([1, -1, 1]);
  });
  it('Klar är grå utan sortiment/avlägg och aktiv när lasset går att bekräfta', async () => {
    const tomt = lass({ status: 'vantar_forare' }); tomt.delar[0].rader = [];
    await rendera(tomt);
    expect((q('andra-klar') as HTMLButtonElement).disabled).toBe(true);
    await rendera(lass());
    expect((q('andra-klar') as HTMLButtonElement).disabled).toBe(false);
  });
  it('avlägget går att byta; ta bort kräver bekräftelse', async () => {
    const onAvlagg = vi.fn(); const onTaBort = vi.fn();
    await rendera(lass(), { onAvlagg, onTaBort });
    await tryck('andra-avlagg'); await tryck('andra-avlagg-3');
    expect(onAvlagg).toHaveBeenCalledWith(A3);
    await tryck('andra-ta-bort');
    expect(onTaBort).not.toHaveBeenCalled();
    await tryck('andra-ta-bort-ja');
    expect(onTaBort).toHaveBeenCalled();
  });
  it('Avbryt och Klar', async () => {
    const onAvbryt = vi.fn(); const onKlar = vi.fn();
    await rendera(lass(), { onAvbryt, onKlar });
    await tryck('andra-avbryt'); await tryck('andra-klar');
    expect(onAvbryt).toHaveBeenCalled(); expect(onKlar).toHaveBeenCalled();
  });
});

describe('Kvar, färdigskotad, väder, avlägg', () => {
  const skordat = [{ nyckel: 'talltimmer', namn: 'Timmer: Tall_V3', m3: 100 }, { nyckel: 'granmassa', namn: 'Massa: Gran_V3', m3: 40 }];
  const bekr = [lass({ status: 'bekraftat' })];
  it('KvarArk: kvar per sortiment, klar-dag-text, Idag och lista som öppnar ett lass', async () => {
    const kvar = beraknaKvar(skordat, bekr);
    const sam = kvarSammanfattning(kvar, bekr, '2026-10-19');
    const onLass = vi.fn();
    await visa(<KvarArk kvar={kvar} sammanfattning={sam} dagens={bekr} idagText="Idag: 1 lass · 18 m³" vantande={2} onLass={onLass} onStang={vi.fn()} />);
    expect(q('kvar-ark')?.textContent).toContain('Klar-dag visas när trakten har skotats två dagar.');
    expect(q('kvar-ark')?.textContent).toContain('Idag: 1 lass · 18 m³');
    expect(q('kvar-ark')?.textContent).toContain('2 väntar på att skickas');
    await tryck('kvar-idag'); await tryck('kvar-lass-7');
    expect(onLass).toHaveBeenCalledWith(bekr[0]);
  });
  it('FardigskotadKort: fråga vid stor skillnad, annars bekräftelse', async () => {
    const stor = farduskotatKontroll(beraknaKvar(skordat, [lass({ status: 'bekraftat' })]));
    expect(stor.ok).toBe(false);
    const onB = vi.fn(); const onK = vi.fn();
    await visa(<FardigskotadKort kontroll={stor} klar={false} onKarta={onK} onBekrafta={onB} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad')?.getAttribute('data-fraga')).toBe('ja');
    expect(q('fardigskotad-text')?.textContent).toMatch(/Enligt skördaren ~130 m³ kvar – Timmer · Tall ~90, Massa · Gran ~40/);
    await tryck('fardigskotad-karta'); await tryck('fardigskotad-anda');
    expect(onK).toHaveBeenCalled(); expect(onB).toHaveBeenCalled();
    const litet = farduskotatKontroll(beraknaKvar([{ nyckel: 'talltimmer', namn: 'T', m3: 100 }], [lass({ status: 'bekraftat', delar: [{ ...lass().delar[0], rader: [{ nyckel: 'talltimmer', namn: 'T', m3: 99 }] }] })]));
    await visa(<FardigskotadKort kontroll={litet} klar={false} onKarta={vi.fn()} onBekrafta={onB} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad')?.getAttribute('data-fraga')).toBe('nej');
    expect(q('fardigskotad-ja')).not.toBeNull();
  });
  it('FardigskotadKort utan läst skördare lovar ingenting', async () => {
    await visa(<FardigskotadKort kontroll={null} klar={false} onKarta={vi.fn()} onBekrafta={vi.fn()} onAvbryt={vi.fn()} />);
    expect(q('fardigskotad-ja')).toBeNull();
    expect(q('fardigskotad')?.textContent).toContain('inte läst');
  });
  it('Morgonkort och väderlista', async () => {
    const ok = vi.fn();
    await visa(<><MorgonKortVy kort={{ rubrik: 'Idag', rader: ['Brandrisk 3 idag'] }} onOk={ok} /><VaderLista dagar={[{ datum: '2026-10-20', regnMm: 12, tempMax: 9, tempMin: 3 }]} laddar={false} /></>);
    expect(q('morgonkort')?.textContent).toContain('Brandrisk 3 idag');
    expect(q('vader-lista')?.textContent).toContain('12 mm');
    await tryck('morgonkort-ok');
    expect(ok).toHaveBeenCalled();
  });
  it('VaderLista utan data säger det', async () => {
    await visa(<VaderLista dagar={[]} laddar={false} />);
    expect(q('vader-lista')?.textContent).toContain('Väder saknas just nu.');
  });
  it('AvlaggSkotatSektion: m³, per sortiment, antal lass, senast, "Från Vida"', async () => {
    const stat = skotatTillAvlagg([lass({ status: 'bekraftat' })], 'vida:2');
    await visa(<AvlaggSkotatSektion nummer="2" objektNamn="Trakten" stat={stat} kalla="vida" />);
    const t = q('avlagg-skotat')?.textContent ?? '';
    expect(t).toContain('Avlägg 2 · skotat hit 18 m³');
    expect(t).toContain('1 lass · senast 14:12');
    expect(t).toContain('Från Vida');
    await visa(<AvlaggSkotatSektion nummer="9" objektNamn="Trakten" stat={skotatTillAvlagg([], 'vida:9')} kalla="egen" />);
    expect(q('avlagg-skotat')?.textContent).toContain('Inget skotat hit än.');
    expect(q('avlagg-skotat')?.textContent).not.toContain('Från Vida');
  });
});

describe('KorvyObjektPill med kvar', () => {
  const pillProps = { namn: 'Trakten', hogstubbar: { antal: 0, krav: null, status: 'ingen' as const }, evighetstrad: { antal: 0, krav: null, status: 'ingen' as const }, ikonHogstubbe: null, ikonEvighetstrad: null, onNamn: vi.fn(), onHogstubbe: vi.fn(), onEvighetstrad: vi.fn() };
  it('visar "Kvar ~121 m³ · Klar ~onsdag" bredvid namnet; tryck på kvar-delen, inte namnet, öppnar kvar', async () => {
    const onKvar = vi.fn(); const onNamn = vi.fn();
    await visa(<KorvyObjektPill {...pillProps} onNamn={onNamn} smal={false} kvar={{ text: 'Kvar ~121 m³', klar: 'Klar ~onsdag', onTryck: onKvar }} />);
    expect(q('korvy-pill-kvar')?.textContent).toBe('Kvar ~121 m³· Klar ~onsdag');
    await tryck('korvy-pill-kvar');
    expect(onKvar).toHaveBeenCalled(); expect(onNamn).not.toHaveBeenCalled();
    await tryck('korvy-pill-namn');
    expect(onNamn).toHaveBeenCalled();
  });
  it('utan kvar är pillen oförändrad', async () => {
    await visa(<KorvyObjektPill {...pillProps} smal={false} />);
    expect(q('korvy-pill-kvar')).toBeNull();
  });
  it('telefon: kvar-delen ligger under namnraden', async () => {
    await visa(<KorvyObjektPill {...pillProps} smal kvar={{ text: 'Kvar ~121 m³', klar: null, onTryck: vi.fn() }} />);
    expect((q('korvy-objektpill') as HTMLElement).style.flexDirection).toBe('column');
  });
});
