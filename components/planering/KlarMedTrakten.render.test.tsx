// @vitest-environment jsdom
// "Klar med trakten?" — kortet renderat på riktigt (jsdom) med de RIKTIGA räknefunktionerna. Planeringssidan monteras inte (den går inte att montera i vitest);
// en liten sida-ersättare (Harness) gör det sidan gör: tar emot trycken, uppdaterar underlaget och räknar om vad som är kvar.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));

import KlarMedTrakten, { type KlarMedTraktenProps, type KlarPatch } from './KlarMedTrakten';
import ObjektInfo from './ObjektInfo';
import { EGEN, EXTERN, INGEN, klarProps, type KlarFixtur } from './KlarMedTrakten.testhjalp';
import { sattHarDu, VED_TOM, type HarDuId, type HarDuSvarVarde, type VedDetaljer } from '@/lib/klarTrakt';
import { byggMerGrupper, kortKnappar, faktaBrickor, objektRad, type KartMarkering } from '@/lib/objektKort';
import { sattBredd } from './PlusRad.testhjalp';
import { FARG } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
const q = (id: string) => behallare!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const finns = (id: string) => q(id) != null;
const klicka = (el: Element | null) => { expect(el, 'elementet finns').not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };
const skriv = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => act(() => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const blur = (el: Element | null) => { expect(el, 'elementet finns').not.toBeNull(); act(() => { (el as HTMLElement).blur(); }); };
const text = (id: string) => q(id)?.textContent ?? '';
/** Gruppen "Det som redan stämmer" fälls ut (en i taget). */
const oppnaGrupp = (id: 'appen' | 'harDu' | 'ovrigt') => { if (q(`klar-grupp-${id}`)!.getAttribute('data-oppen') !== '1') klicka(q(`klar-grupp-${id}-rad`)); };
/** Färg som webbläsaren skriver den (hex → rgb), för jämförelse med style.color. */
const farg = (hex: string) => { const e = document.createElement('div'); e.style.color = hex; return e.style.color; };
const utanMellanrum = (t: string) => t.replace(/\s/g, ' ');

const spion = { klarForMaskin: 0, fortsatter: 0, placeraAvlagg: 0, ritaBasvag: 0, sattVed: 0, stammer: 0, stang: 0, patchar: [] as KlarPatch[] };

/** Sidans roll: fixturen är "databasen"; trycken uppdaterar den och kortet räknas om ur den. */
function Harness({ start, extra }: { start: KlarFixtur; extra?: Partial<KlarMedTraktenProps> }) {
  const [f, setF] = useState<KlarFixtur>(start);
  const [ved, setVed] = useState<VedDetaljer>(f.ved ?? { ...VED_TOM });
  const [ovr, setOvr] = useState<Partial<Record<string, any>>>({});
  const p = klarProps({ ...f, ved }, {
    onAndra: (a) => {
      spion.patchar.push(a);
      setF((cur) => ({
        ...cur,
        ...(a.barighet !== undefined ? { barighet: a.barighet } : {}),
        ...(a.terrang !== undefined ? { terrang: a.terrang } : {}),
        ...(a.skotningsavstand !== undefined ? { skotningsavstand: a.skotningsavstand } : {}),
        ...(a.skordare ? { skordare: a.skordare } : {}),
        ...(a.skotare ? { skotare: a.skotare } : {}),
        ...(a.skordareTimmar !== undefined ? { skordareTimmar: Number(a.skordareTimmar.replace(',', '.')) || null } : {}),
        ...(a.skotareTimmar !== undefined ? { skotareTimmar: Number(a.skotareTimmar.replace(',', '.')) || null } : {}),
        ...(a.bandSkotare !== undefined ? { bandSkotare: a.bandSkotare } : {}),
        ...(a.ved !== undefined ? { markagareVed: a.ved } : {}),
      }));
      if (a.ved !== undefined) setOvr((o) => ({ ...o, ved: a.ved }));
    },
    onHarDu: (id: HarDuId, v: HarDuSvarVarde) => setF((cur) => ({ ...cur, harDu: sattHarDu(cur.harDu ?? {}, id, v, 'm1', '2026-10-15T10:00:00.000Z') })),
    onStammer: () => { spion.stammer += 1; setF((cur) => ({ ...cur, godkand: true })); },
    onVed: setVed,
    onKlarForMaskin: () => { spion.klarForMaskin += 1; setF((cur) => ({ ...cur, objektStatus: 'planerad' })); },
    onFortsatter: () => { spion.fortsatter += 1; },
    onPlaceraAvlagg: () => { spion.placeraAvlagg += 1; },
    onRitaBasvag: () => { spion.ritaBasvag += 1; },
    onSattVedPaKartan: () => { spion.sattVed += 1; },
    onStang: () => { spion.stang += 1; },
    ...extra,
  });
  // sidan: ovrigt.ved följer markagare_ska_ha_ved
  const m: KlarMedTraktenProps = { ...p, ovrigt: { ...p.ovrigt, ved: ovr.ved ?? p.ovrigt.ved } };
  return <KlarMedTrakten {...m} />;
}

function montera(start: KlarFixtur, extra?: Partial<KlarMedTraktenProps>) {
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
  rot = createRoot(behallare);
  act(() => { rot!.render(<Harness start={start} extra={extra} />); });
}

beforeEach(() => { Object.assign(spion, { klarForMaskin: 0, fortsatter: 0, placeraAvlagg: 0, ritaBasvag: 0, sattVed: 0, stammer: 0, stang: 0, patchar: [] }); sattBredd(390); });
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; });

const ALLA_SVAR = (): KlarFixtur['harDu'] => { let s = {}; for (const id of ['gransar', 'naturvarden', 'kulturlamningar', 'ledningar', 'snitslat', 'avlagg_hugga'] as const) s = sattHarDu(s, id, 'ja', 'm1', 'T'); return s; };

/** Allt ifyllt, prognosen godkänd, alla sex frågor besvarade: "Allt klart". */
const KLAR: KlarFixtur = {
  avlaggAntal: 1, basvagTexter: ['Röd · 640 m'], barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel',
  skordare: EGEN('R64101'), skotare: EGEN('A110148'), skordareTimmar: 41, skotareTimmar: 36, godkand: true, harDu: ALLA_SVAR(),
};
/** Monterar om med nytt underlag (för test som jämför två lägen). */
const montera_om = (start: KlarFixtur) => { act(() => { rot!.unmount(); }); behallare!.remove(); montera(start); };


describe('rubrik: traktens namn och läget i ord', () => {
  it('ny trakt: namnet som rubrik (inte en fråga), "13 saker kvar" i orange, ingen areal i rubriken', () => {
    montera({});
    expect(text('info-titel') || behallare!.textContent).toContain('Skälviken');
    expect(behallare!.textContent).not.toContain('Klar med Skälviken?');
    expect(text('klar-status')).toBe('13 saker kvar');
    expect(q('klar-status')!.style.color).toBe(farg(FARG.orange));
    expect(finns('klar-areal-rubrik')).toBe(false);
    expect(text('klar-cell-areal')).toContain('3,6');
  });
  it('en sak kvar säger "1 sak kvar" (inte "1 saker")', () => {
    montera({ avlaggAntal: 1, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel', skordare: EGEN('R64101'), skotare: EGEN('A110148'), skordareTimmar: 41, skotareTimmar: 36, godkand: true, harDu: ALLA_SVAR(), basvagForvantad: true });
    expect(text('klar-status')).toBe('1 sak kvar');
  });
  it('allt klart: "Allt klart ✓" i grönt', () => {
    montera(KLAR);
    expect(text('klar-status')).toBe('Allt klart ✓');
    expect(q('klar-status')!.style.color).toBe(farg(FARG.gron));
  });
  it('efter Klar för maskin: "Klar för maskin ✓" i grönt, och en kvarvarande uppgift nämns i orange bredvid', () => {
    montera({ ...KLAR, objektStatus: 'planerad' });
    expect(text('klar-status')).toBe('Klar för maskin ✓');
    expect(q('klar-status')!.style.color).toBe(farg(FARG.gron));
    expect(text('klar-skickad')).toContain('Klar för maskin');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...KLAR, objektStatus: 'planerad', harDu: {} });
    expect(behallare!.textContent).toContain('Klar för maskin ✓ · 6 kvar');
  });
  it('arealen saknas → rubriken säger ändå inget om areal, och prognoskortet visar "areal saknas" (ingen gissad siffra)', () => {
    montera({ areal: null });
    expect(finns('klar-areal-rubrik')).toBe(false);
    expect(text('klar-cell-areal')).toContain('areal saknas');
  });
});

describe('fast ordning: Behöver dig · prognoskortet · det som redan stämmer', () => {
  it('uppifrån och ned i den ordningen', () => {
    montera({});
    const fore = (a: string, b: string) => !!(q(a)!.compareDocumentPosition(q(b)!) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(fore('klar-behover', 'klar-prognoskort')).toBe(true);
    expect(fore('klar-prognoskort', 'klar-del2')).toBe(true);
    expect(fore('klar-del2', 'klar-for-maskin')).toBe(true);
  });
  it('"Behöver dig" syns BARA när något är kvar — annars inte alls', () => {
    montera(KLAR);
    expect(finns('klar-behover')).toBe(false);
    expect(behallare!.textContent).not.toContain('Behöver dig');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...KLAR, avlaggAntal: 0 });
    expect(finns('klar-behover')).toBe(true);
  });
  it('"Behöver dig" innehåller BARA orange poster och obesvarade frågor — det som stämmer står inte där', () => {
    montera({ ...KLAR, avlaggAntal: 0, harDu: { ...ALLA_SVAR(), avlagg_hugga: undefined } as any });
    const poster = Array.from(q('klar-behover')!.querySelectorAll('[data-testid^="klar-post-"]')).map((e) => [e.getAttribute('data-testid'), e.getAttribute('data-kvar')]);
    expect(poster).toEqual([['klar-post-avlagg', '1']]);
    const fragor = Array.from(q('klar-behover')!.querySelectorAll('[data-testid^="klar-fraga-"][data-besvarad]')).map((e) => [e.getAttribute('data-testid'), e.getAttribute('data-besvarad')]);
    expect(fragor).toEqual([['klar-fraga-avlagg_hugga', '0']]);
    expect(text('klar-behover')).toContain('Behöver dig · 2');
  });
});

describe('Skälviken: en ny trakt — vad är kvar', () => {
  it('basväg "Ingen" räknas inte; alla sex frågor ställs i Behöver dig; resten av posterna är orange', () => {
    montera({});
    expect(q('klar-post-basvag')).toBeNull();             // inte kvar → bor i "Appen har fyllt i" (hopfälld)
    oppnaGrupp('appen');
    expect(q('klar-post-basvag')!.getAttribute('data-kvar')).toBe('0');
    expect(text('klar-rad-basvag')).toContain('Ingen');
    for (const id of ['avlagg', 'barighet', 'terrang', 'skotningsavstand', 'skordare', 'skotare', 'prognos']) expect(q(`klar-behover`)!.querySelector(`[data-testid="klar-post-${id}"]`)!.getAttribute('data-kvar'), id).toBe('1');
    for (const id of ['gransar', 'naturvarden', 'kulturlamningar', 'ledningar', 'snitslat', 'avlagg_hugga']) expect(q(`klar-fraga-${id}`)!.getAttribute('data-besvarad')).toBe('0');
    expect(text('klar-kvar-text')).toBe('Kvar: 7 saker · 6 frågor');   // sju poster räknas, listas inte
    expect(text('klar-innehall')).not.toContain('Ingen basväg');
  });

  it('orange rader säger också ett ord (färg är aldrig ensam bärare)', () => {
    montera({});
    expect(text('klar-rad-avlagg')).toContain('Placera på kartan');
    expect(text('klar-rad-barighet')).toContain('Välj');
    expect(text('klar-rad-prognos')).toMatch(/Saknar skördare/);
  });

  it('medelstam ur TD (0,72 för Skälviken) och volymen står i prognoskortet och går att trycka på', () => {
    montera({});
    expect(q('klar-post-medelstam')).toBeNull();                      // inte kvar → ingen rad i Behöver dig
    expect(text('klar-cell-medelstam')).toBe('0,72');
    expect(utanMellanrum(text('klar-cell-volym'))).toContain('1 800');
    klicka(q('klar-cell-medelstam'));
    expect((q('klar-medelstam') as HTMLInputElement).value).toBe('0,72');
    klicka(q('klar-cell-volym'));
    expect((q('klar-volym') as HTMLInputElement).value).toBe('1800');
  });
});

describe('Behöver dig: raderna, frågorna och vägen därifrån', () => {
  it('avlägg: ett tryck ber sidan placera ett (raden säger "Placera på kartan")', () => {
    montera({});
    klicka(q('klar-rad-avlagg'));
    expect(spion.placeraAvlagg).toBe(1);
  });
  it('Prognos-raden pekar på prognoskortet (rullar dit) — prognosen redigeras bara på ETT ställe', () => {
    const rulla = vi.fn();
    (Element.prototype as any).scrollIntoView = rulla;
    montera({});
    klicka(q('klar-rad-prognos'));
    expect(rulla).toHaveBeenCalledTimes(1);
    expect(finns('klar-stammer')).toBe(true);
    delete (Element.prototype as any).scrollIntoView;
  });
  it('en besvarad fråga försvinner ur listan och hamnar under Har du … (N av 6); samma svar igen tar tillbaka den', () => {
    montera({});
    klicka(q('klar-fraga-gransar-ja'));
    expect(q('klar-behover')!.querySelector('[data-testid="klar-fraga-gransar"]')).toBeNull();
    expect(text('klar-grupp-harDu-sammanfattning')).toBe('1 av 6');
    oppnaGrupp('harDu');
    expect(q('klar-fraga-gransar')!.getAttribute('data-besvarad')).toBe('1');
    expect(text('klar-fraga-gransar-vem')).toContain('Martin');
    klicka(q('klar-fraga-gransar-ja'));                      // tar tillbaka svaret
    expect(text('klar-grupp-harDu-sammanfattning')).toBe('0 av 6');
    expect(q('klar-behover')!.querySelector('[data-testid="klar-fraga-gransar"]')!.getAttribute('data-besvarad')).toBe('0');
  });
  it('svaren heter som frågan: "Ja" / "Behövs inte" · "Inga hittade" · "Inga finns" · "Nej"', () => {
    montera({});
    expect(text('klar-fraga-gransar-nej')).toBe('Behövs inte');
    expect(text('klar-fraga-naturvarden-nej')).toBe('Inga hittade');
    expect(text('klar-fraga-ledningar-nej')).toBe('Inga finns');
    expect(text('klar-fraga-avlagg_hugga-nej')).toBe('Nej');
    klicka(q('klar-fraga-naturvarden-nej'));
    oppnaGrupp('harDu');
    expect(q('klar-fraga-naturvarden-nej')!.getAttribute('aria-pressed')).toBe('true');
  });
  it('fornlämning i lagret → orange varning under kulturfrågan (både medan den är obesvarad och efter svar); frågan ställs även utan varning', () => {
    montera({ restriktioner: [{ type: 'fornlamning', name: 'Stensättning' }] });
    expect(text('klar-varning-kulturlamningar')).toContain('Registrerad fornlämning: Stensättning');
    expect(finns('klar-varning-ledningar')).toBe(false);
    expect(finns('klar-fraga-ledningar')).toBe(true);
    klicka(q('klar-fraga-kulturlamningar-ja'));
    oppnaGrupp('harDu');
    expect(text('klar-varning-kulturlamningar')).toContain('Registrerad fornlämning: Stensättning');
  });
  it('en el-ledning på kartan varnar under el-frågan', () => {
    montera({ markeringar: [{ slag: 'symbol', typ: 'powerline' }] });
    expect(text('klar-varning-ledningar')).toContain('1 el-ledning markerad på kartan');
  });
});

describe('prognoskortet: volym, tabell, källa, Stämmer — siffror redigeras på plats', () => {
  const fyllt: KlarFixtur = { skordare: EGEN('PONS20SDJAA270231'), skotare: EGEN('A110148'), skordareTimmar: 41, skotareTimmar: 36, volym: 1734, medelstam: 0.8, areal: 3.6 };
  it('volym stort + medelstam till höger; tabellen har kolumnerna G15-tim och m³fub/G15 och en rad per maskin', () => {
    montera(fyllt);
    expect(utanMellanrum(text('klar-cell-volym'))).toBe('1 734 m³fub');
    expect(text('klar-cell-medelstam')).toBe('0,80');
    const tabell = text('klar-prognos-tabell');
    expect(tabell).toContain('G15-tim'); expect(tabell).toContain('m³fub/G15');
    expect(text('klar-cell-skordartimmar')).toBe('41');
    expect(text('klar-cell-skotartimmar')).toBe('36');
    expect(text('klar-skordare-prestation')).toBe('42');       // 1734 / 41
    expect(text('klar-skotare-prestation')).toBe('48');        // 1734 / 36
  });
  it('prognosen visar ALDRIG sammanfattning och fält samtidigt: ingen fältlista i vila, ett tryck byter EN siffra mot ett fält, blur tar tillbaka siffran', () => {
    montera(fyllt);
    expect(q('klar-prognoskort')!.querySelectorAll('input').length).toBe(0);
    expect(finns('klar-prognos-rad-0')).toBe(false);          // den gamla "Skördare 41 G15-tim · …"-sammanfattningen är borta
    klicka(q('klar-cell-skordartimmar'));
    expect(q('klar-prognoskort')!.querySelectorAll('input').length).toBe(1);
    expect((q('klar-skordartimmar') as HTMLInputElement).value).toBe('41');
    expect(finns('klar-cell-skordartimmar')).toBe(false);     // fältet ERSÄTTER siffran
    klicka(q('klar-cell-skotartimmar'));                      // ett fält i taget
    expect(q('klar-prognoskort')!.querySelectorAll('input').length).toBe(1);
    expect(finns('klar-skordartimmar')).toBe(false);
    act(() => { (q('klar-skotartimmar') as HTMLInputElement).blur(); });
    expect(q('klar-prognoskort')!.querySelectorAll('input').length).toBe(0);
    expect(text('klar-cell-skotartimmar')).toBe('36');
  });
  it('Enter avslutar redigeringen', () => {
    montera(fyllt);
    klicka(q('klar-cell-volym'));
    act(() => { q('klar-volym')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(finns('klar-volym')).toBe(false);
    expect(finns('klar-cell-volym')).toBe(true);
  });
  it('volym, medelstam, areal och G15-tim skriver till rätt fält; m³fub/G15 är uträknad och inte ett fält', () => {
    montera(fyllt);
    klicka(q('klar-cell-volym')); skriv(q('klar-volym') as HTMLInputElement, '1800');
    expect(spion.patchar.at(-1)).toEqual({ volym: '1800' });
    klicka(q('klar-cell-medelstam')); skriv(q('klar-medelstam') as HTMLInputElement, '0,9');
    expect(spion.patchar.at(-1)).toEqual({ medelstam: '0,9' });
    klicka(q('klar-cell-areal')); skriv(q('klar-areal') as HTMLInputElement, '4');
    expect(spion.patchar.at(-1)).toEqual({ areal: '4' });
    klicka(q('klar-cell-skordartimmar')); skriv(q('klar-skordartimmar') as HTMLInputElement, '55');
    expect(spion.patchar.at(-1)).toEqual({ skordareTimmar: '55' });
    expect(finns('klar-cell-skordare-prestation')).toBe(false);
    expect(q('klar-skordare-prestation')!.tagName).not.toBe('BUTTON');
  });
  it('prestationen följer en ändrad siffra; saknas något står ett streck, aldrig ett gissat tal', () => {
    montera({ ...fyllt, volym: 1800 });
    expect(text('klar-skordare-prestation')).toBe('44');
    klicka(q('klar-cell-skordartimmar')); skriv(q('klar-skordartimmar') as HTMLInputElement, '60');
    expect(text('klar-skordare-prestation')).toBe('30');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...fyllt, volym: null });
    expect(text('klar-skordare-prestation')).toBe('–');
    expect(text('klar-cell-volym')).toBe('Skriv volym');
    expect(q('klar-cell-volym')!.style.color).toBe(farg(FARG.orange));
  });
  it('intervall + underlag syns FÖRST när man trycker på siffran (en rad, bara den maskinen); i vila står inget grått under tabellen', () => {
    montera(fyllt);
    expect(finns('klar-skordare-kalla')).toBe(false);
    expect(finns('klar-skotare-kalla')).toBe(false);
    klicka(q('klar-cell-skordartimmar'));
    expect(text('klar-skordare-kalla')).toBe('Skördare · troligen 38–45 · ur 7 trakter med medelstam 0,64–1,0');
    expect(finns('klar-skotare-kalla')).toBe(false);
    klicka(q('klar-cell-skotartimmar'));                        // ett fält åt gången: skördarens källa försvinner, skotarens kommer
    expect(text('klar-skotare-kalla')).toBe('Skotare · troligen 30–44 · ur 22 slutavverkningar (snitt)');
    expect(finns('klar-skordare-kalla')).toBe(false);
    skriv(q('klar-skotartimmar') as HTMLInputElement, '37'); blur(q('klar-skotartimmar') as HTMLInputElement);
    expect(finns('klar-skotare-kalla')).toBe(false);            // klar med redigeringen → tillbaka till ett lugnt kort
  });
  it('"förslag 41" står direkt under siffran, bara när den är ändrad — ingen "Ändrad av dig"-rad längre', () => {
    montera(fyllt);
    expect(finns('klar-skordare-andrad')).toBe(false);
    klicka(q('klar-cell-skordartimmar')); skriv(q('klar-skordartimmar') as HTMLInputElement, '55');
    blur(q('klar-skordartimmar') as HTMLInputElement);
    expect(text('klar-skordare-andrad')).toBe('förslag 41');
    expect(behallare!.textContent).not.toContain('Ändrad av dig');
    expect(q('klar-skordare-andrad')!.parentElement!.contains(q('klar-cell-skordartimmar'))).toBe(true);   // samma kolumn, under cellen
    expect(finns('klar-skotare-andrad')).toBe(false);           // skotaren orörd
    klicka(q('klar-cell-skordartimmar')); skriv(q('klar-skordartimmar') as HTMLInputElement, '41');
    blur(q('klar-skordartimmar') as HTMLInputElement);
    expect(finns('klar-skordare-andrad')).toBe(false);          // tillbaka på förslaget → ingen "förslag"
  });
  it('ingen "Använd förslaget"-knapp och ingen förslagsruta — fälten är redan ifyllda med förslaget', () => {
    montera(fyllt);
    expect(finns('klar-prognos-anvand')).toBe(false);
    expect(finns('klar-prognos-forslag')).toBe(false);
    expect(behallare!.textContent).not.toContain('Använd förslaget');
  });
  it('inget förslag (för få jämförbara): cellen står orange och tom ("Skriv"), orange förklaring, prognos-raden kvar — ingen gissning', () => {
    montera({ skordare: EGEN('PONS20SDJAA270231'), skotare: EGEN('A110148'), utanForslag: true });
    expect(q('klar-post-prognos')!.getAttribute('data-kvar')).toBe('1');
    expect(text('klar-rad-prognos')).toMatch(/Saknar skördartimmar/);
    expect(text('klar-cell-skordartimmar')).toBe('Skriv');
    expect(q('klar-cell-skordartimmar')!.style.color).toBe(farg(FARG.orange));
    expect(text('klar-skordare-forslag-saknas')).toMatch(/Färre än 3 jämförbara trakter/);
    expect(finns('klar-skordare-kalla')).toBe(false);
    klicka(q('klar-cell-skordartimmar'));
    expect((q('klar-skordartimmar') as HTMLInputElement).value).toBe('');
  });
  it('extern skördare: ingen G15-cell för den (bara egna maskiner har timmar), raden säger "Extern · namn"', () => {
    montera({ skordare: EXTERN('Skog AB'), skotare: EGEN('A110148'), skotareTimmar: 36 });
    expect(finns('klar-cell-skordartimmar')).toBe(false);
    expect(text('klar-skordare-tid')).toContain('Extern · Skog AB');
    expect(finns('klar-cell-skotartimmar')).toBe(true);
  });
  it('ingen maskin vald än: "Välj maskin ovan" (maskinen står orange i Behöver dig)', () => {
    montera({ skordare: INGEN, skotare: EGEN('A110148'), skotareTimmar: 36 });
    expect(text('klar-skordare-tid')).toContain('Välj maskin ovan');
    expect(q('klar-behover')!.querySelector('[data-testid="klar-post-skordare"]')!.getAttribute('data-kvar')).toBe('1');
  });
  it('Stämmer: grå tills allt finns; efter tryck "Stämmer ✓ · Martin 17/10"', () => {
    montera({ ...fyllt, godkand: false });
    klicka(q('klar-stammer'));
    expect(spion.stammer).toBe(1);
    expect(text('klar-stammer')).toBe('Stämmer ✓ · Martin 17/10');
    expect(q('klar-stammer')!.getAttribute('data-godkand')).toBe('1');
    expect(q('klar-stammer')!.style.color).toBe(farg(FARG.gron));
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ skordare: EGEN('R64101'), skotare: EGEN('A110148') });          // timmar saknas
    expect(text('klar-prognos-saknas')).toContain('skördartimmar');
    expect(q('klar-stammer')!.hasAttribute('disabled')).toBe(true);
    const fore = spion.stammer;
    klicka(q('klar-stammer')); expect(spion.stammer).toBe(fore);              // går inte att trycka
  });
  it('extern på båda: "Extern utförare på båda — inget att prognostisera", ingen tabell och ingen Stämmer; prognosen är aldrig kvar', () => {
    montera({ skordare: EXTERN('Skog AB'), skotare: EXTERN('Max Skotning') });
    expect(text('klar-prognos-extern')).toContain('inget att prognostisera');
    expect(finns('klar-prognos-tabell')).toBe(false);
    expect(finns('klar-stammer')).toBe(false);
    expect(q('klar-behover')!.querySelector('[data-testid="klar-post-prognos"]')).toBeNull();
    oppnaGrupp('appen');
    expect(text('klar-rad-skotare')).toContain('Extern · Max Skotning');
  });
  it('ingen "Utgår från …"-rad i prognoskortet — förutsättningarna står redan i "Appen har fyllt i"', () => {
    montera({ ...fyllt, bandSkotare: true });
    expect(finns('klar-prognos-forutsattningar')).toBe(false);
    expect(behallare!.textContent).not.toContain('Utgår från');
  });
  it('Stämmer-texten: ingen förklaring medan godkännandet gäller; "Underlaget har ändrats – tryck Stämmer igen" (orange) bara när det blivit ogiltigt', () => {
    montera({ ...fyllt, godkand: true });
    expect(text('klar-stammer')).toContain('Stämmer ✓');
    expect(finns('klar-stammer-ogiltigt')).toBe(false);
    expect(behallare!.textContent).not.toContain('Godkännandet gäller');
    act(() => { rot!.unmount(); }); behallare!.remove();
    // godkänd förut (vem/när finns kvar) men underlaget har ändrats → läget är ogodkänt och allt finns att godkänna igen
    montera({ ...fyllt, godkand: false }, { prognos: { ...klarProps({ ...fyllt, godkand: false }).prognos, godkandAv: 'm1', godkandAt: '2026-10-17T09:00:00.000Z' } });
    expect(text('klar-stammer')).toBe('Stämmer');
    expect(text('klar-stammer-ogiltigt')).toBe('Underlaget har ändrats – tryck Stämmer igen');
    expect(q('klar-stammer-ogiltigt')!.style.color).toBe(farg(FARG.orange));
    act(() => { rot!.unmount(); }); behallare!.remove();
    // aldrig godkänd → ingen sådan text
    montera({ ...fyllt, godkand: false });
    expect(finns('klar-stammer-ogiltigt')).toBe(false);
  });
});

describe('medelstam saknas', () => {
  it('raden i Behöver dig är orange ("Skriv") med förklaringen att förslaget då tar snitt över alla; kortet visar "saknas" i orange', () => {
    montera({ medelstam: null });
    expect(q('klar-post-medelstam')!.getAttribute('data-kvar')).toBe('1');
    expect(text('klar-rad-medelstam')).toContain('Skriv');
    expect(text('klar-post-medelstam')).toContain('snitt över alla trakter');
    expect(text('klar-cell-medelstam')).toBe('saknas');
    expect(q('klar-cell-medelstam')!.style.color).toBe(farg(FARG.orange));
    expect(text('klar-kvar-text')).toContain('8 saker');          // sju poster + medelstam, räknas inte listas
  });
  it('att skriva den i raden tar bort "kvar" men raden stannar tills planeraren stänger den (ett skrivfält stänger inte av sig självt)', () => {
    montera({ medelstam: null });
    klicka(q('klar-rad-medelstam'));
    skriv(q('klar-medelstam-falt') as HTMLInputElement, '0,8');
    expect(spion.patchar.at(-1)).toEqual({ medelstam: '0,8' });
    expect(q('klar-rad-medelstam')!.getAttribute('aria-expanded')).toBe('true');
  });
  it('går också att skriva direkt i prognoskortet', () => {
    montera({ medelstam: null });
    klicka(q('klar-cell-medelstam'));
    skriv(q('klar-medelstam') as HTMLInputElement, '0,8');
    expect(spion.patchar.at(-1)).toEqual({ medelstam: '0,8' });
  });
});

describe('Fyll i Behöver dig → Klar för maskin', () => {
  it('trycken rättar kortet: bärighet/terräng/avstånd, maskiner, tider, Stämmer, svar → grön knapp → planerad', () => {
    montera({});
    klicka(q('klar-rad-barighet')); klicka(q('klar-barighet-bra'));
    klicka(q('klar-rad-terrang')); klicka(q('klar-terrang-flackt'));
    klicka(q('klar-rad-skotningsavstand')); klicka(q('klar-skotningsavstand-medel'));
    oppnaGrupp('appen');
    expect(text('klar-rad-barighet')).toContain('Bra');
    klicka(q('klar-rad-skordare')); klicka(q('klar-skordare-egen')); klicka(q('klar-skordare-maskin-R64101'));
    klicka(q('klar-rad-skotare')); klicka(q('klar-skotare-egen')); klicka(q('klar-skotare-maskin-A110148'));
    expect(text('klar-rad-skordare')).toContain('Rottne H8E');
    klicka(q('klar-rad-avlagg'));
    expect(spion.placeraAvlagg).toBe(1);
    // prognos: timmar saknas → Stämmer går inte; skriv, sedan Stämmer
    expect(text('klar-prognos-saknas')).toContain('skördartimmar');
    klicka(q('klar-stammer')); expect(spion.stammer).toBe(0);
    klicka(q('klar-cell-skordartimmar')); skriv(q('klar-skordartimmar') as HTMLInputElement, '41');
    klicka(q('klar-cell-skotartimmar')); skriv(q('klar-skotartimmar') as HTMLInputElement, '36');
    expect(q('klar-stammer')!.hasAttribute('disabled')).toBe(false);
    klicka(q('klar-stammer')); expect(spion.stammer).toBe(1);
    expect(text('klar-stammer')).toContain('Stämmer ✓');
    // fortfarande kvar: avlägg (kartan) + 6 frågor → knappen är grå men TRYCKBAR
    expect(q('klar-for-maskin')!.getAttribute('data-klar')).toBe('0');
    expect(q('klar-for-maskin')!.hasAttribute('disabled')).toBe(false);
  });

  it('allt klart → grön knapp utan "Kvar"; trycket gör trakten planerad ("Klar för maskin ✓") och knappen försvinner', () => {
    montera(KLAR);
    expect(q('klar-for-maskin')!.getAttribute('data-klar')).toBe('1');
    expect(finns('klar-kvar-text')).toBe(false);
    expect(text('klar-for-maskin')).toBe('Klar för maskin');
    klicka(q('klar-for-maskin'));
    expect(spion.klarForMaskin).toBe(1);
    expect(finns('klar-for-maskin')).toBe(false);
    expect(text('klar-skickad')).toContain('Klar för maskin');
    expect(text('klar-status')).toBe('Klar för maskin ✓');
  });

  it('SPÄRRAR ALDRIG: med mycket kvar går trycket ändå igenom och kvar-raden visas bredvid', () => {
    montera({});
    klicka(q('klar-for-maskin'));
    expect(spion.klarForMaskin).toBe(1);
  });

  it('en redan planerad trakt med något kvar visar det ("N kvar sedan sist") — ingen ny knapp', () => {
    montera({ objektStatus: 'planerad', avlaggAntal: 1, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel', skordare: EGEN('R64101'), skotare: EGEN('A110148'), skordareTimmar: 41, skotareTimmar: 36, godkand: true, harDu: {} });
    expect(finns('klar-for-maskin')).toBe(false);
    expect(text('klar-skickad')).toContain('6 kvar sedan sist');
  });
});

describe('trakt utan basväg · en rad för basvägarna', () => {
  it('trakt UTAN basväg: "Ingen" och räknas som klar', () => {
    montera({ basvagTexter: [] });
    expect(q('klar-behover')!.querySelector('[data-testid="klar-post-basvag"]')).toBeNull();
    oppnaGrupp('appen');
    expect(q('klar-post-basvag')!.getAttribute('data-kvar')).toBe('0');
    expect(text('klar-rad-basvag')).toContain('Ingen');
  });
  it('flera basvägar = EN rad "5 st · 599 m" (inte en rad per väg); utan summa står texterna', () => {
    montera({ basvagTexter: ['Röd · 100 m', 'Röd · 100 m', 'Gul · 120 m', 'Blå · 140 m', 'Röd · 139 m'], basvagSammanfattning: '5 st · 599 m' });
    oppnaGrupp('appen');
    expect(behallare!.querySelectorAll('[data-testid="klar-post-basvag"]').length).toBe(1);
    expect(text('klar-rad-basvag')).toContain('5 st · 599 m');
    expect(text('klar-rad-basvag')).not.toContain('Gul · 120 m');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ basvagTexter: ['Röd · 640 m', 'Gul · 120 m'] });          // ingen sammanfattning (längd saknas) → texterna
    oppnaGrupp('appen');
    expect(text('klar-rad-basvag')).toContain('Röd · 640 m');
  });
  it('basvägsraden fäller ut "Rita en basväg till" och "Kräver basvägsanläggning"', () => {
    montera({ basvagTexter: ['Röd · 640 m'], basvagSammanfattning: '1 st · 640 m' });
    oppnaGrupp('appen');
    klicka(q('klar-rad-basvag'));
    expect(text('klar-basvag-rita')).toBe('Rita en basväg till');
    klicka(q('klar-basvag-rita'));
    expect(spion.ritaBasvag).toBe(1);
    klicka(q('klar-basvagskrav-ja'));
    expect(spion.patchar.at(-1)).toEqual({ basvagKravs: true });
  });
  it('extern kräver ett namn: "Extern" utan namn är fortfarande kvar', () => {
    montera({ skotare: { maskinId: null, utforare: 'extern', externNamn: '' } });
    expect(q('klar-post-skotare')!.getAttribute('data-kvar')).toBe('1');
  });
});

describe('Skälviken: Vida har en basväg → ritar man den sjunker siffran', () => {
  const nästanKlar: KlarFixtur = { avlaggAntal: 1, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel', skordare: EGEN('R64101'), skotare: EGEN('A110148'), skordareTimmar: 41, skotareTimmar: 36, godkand: true, harDu: ALLA_SVAR() };
  it('en väntad men ej ritad basväg är kvar (orange "Rita" + förklaring); ritad = klart', () => {
    montera({ ...nästanKlar, basvagForvantad: true });
    expect(q('klar-post-basvag')!.getAttribute('data-kvar')).toBe('1');
    expect(text('klar-rad-basvag')).toContain('Rita');
    expect(text('klar-rad-basvag')).toContain('Vida har en basväg i underlaget');
    expect(text('klar-kvar-text')).toBe('Kvar: basväg');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...nästanKlar, basvagForvantad: true, basvagTexter: ['Blå/gul · 480 m'] });
    expect(finns('klar-behover')).toBe(false);
    expect(finns('klar-kvar-text')).toBe(false);
    expect(q('klar-for-maskin')!.getAttribute('data-klar')).toBe('1');
  });
  it('ingen basväg väntad (trakt utan basväg) → "Ingen" och klart', () => {
    montera({ ...nästanKlar, basvagForvantad: false });
    oppnaGrupp('appen');
    expect(text('klar-rad-basvag')).toContain('Ingen');
    expect(finns('klar-kvar-text')).toBe(false);
  });
});

describe('det som redan stämmer — tre hopfällda rader', () => {
  it('raderna säger vad de rymmer: "N uppgifter", "N av 6", "Inga avvikelser"', () => {
    montera(KLAR);
    expect(text('klar-grupp-appen-sammanfattning')).toBe('7 uppgifter');
    expect(text('klar-grupp-harDu-sammanfattning')).toBe('6 av 6');
    expect(text('klar-grupp-ovrigt-sammanfattning')).toBe('Inga avvikelser');
    expect(text('klar-grupp-appen')).toContain('Appen har fyllt i');
    expect(text('klar-grupp-harDu')).toContain('Har du …');
    expect(text('klar-grupp-ovrigt')).toContain('Markägare & övrigt');
  });
  it('"Appen har fyllt i" räknar bara det som INTE är kvar (de sju uppgifterna — medelstam och prognos bor i prognoskortet)', () => {
    montera({});
    expect(text('klar-grupp-appen-sammanfattning')).toBe('1 uppgift');       // bara basvägen ("Ingen")
    montera_om({ ...KLAR, avlaggAntal: 0 });
    expect(text('klar-grupp-appen-sammanfattning')).toBe('6 uppgifter');
  });
  it('alla tre är stängda från början; ett tryck fäller ut på plats (ingen ny vy) och ett till fäller ihop; en i taget', () => {
    montera(KLAR);
    for (const g of ['appen', 'harDu', 'ovrigt']) expect(q(`klar-grupp-${g}`)!.getAttribute('data-oppen')).toBe('0');
    expect(finns('klar-grupp-appen-innehall')).toBe(false);
    klicka(q('klar-grupp-appen-rad'));
    expect(q('klar-grupp-appen-rad')!.getAttribute('aria-expanded')).toBe('true');
    expect(finns('klar-grupp-appen-innehall')).toBe(true);
    expect(finns('klar-prognoskort')).toBe(true);                // fortfarande samma vy
    klicka(q('klar-grupp-harDu-rad'));
    expect(q('klar-grupp-appen')!.getAttribute('data-oppen')).toBe('0');   // en i taget
    expect(q('klar-grupp-harDu')!.getAttribute('data-oppen')).toBe('1');
    klicka(q('klar-grupp-harDu-rad'));
    expect(q('klar-grupp-harDu')!.getAttribute('data-oppen')).toBe('0');
  });
  it('utfälld "Appen har fyllt i" visar uppgifterna med sina värden och går att rätta på plats', () => {
    montera(KLAR);
    oppnaGrupp('appen');
    for (const id of ['avlagg', 'basvag', 'barighet', 'terrang', 'skotningsavstand', 'skordare', 'skotare']) expect(finns(`klar-post-${id}`), id).toBe(true);
    expect(finns('klar-post-medelstam')).toBe(false);
    expect(finns('klar-post-prognos')).toBe(false);
    expect(text('klar-rad-barighet')).toContain('Bra');
    klicka(q('klar-rad-barighet'));
    klicka(q('klar-barighet-medel'));
    expect(spion.patchar.at(-1)).toEqual({ barighet: 'medel' });
  });
  it('en uppgift som tas tillbaka flyttar upp till Behöver dig', () => {
    montera(KLAR);
    oppnaGrupp('appen');
    klicka(q('klar-rad-barighet'));
    klicka(q('klar-barighet-bra'));                      // samma val igen = tar tillbaka svaret
    expect(q('klar-behover')!.querySelector('[data-testid="klar-post-barighet"]')!.getAttribute('data-kvar')).toBe('1');
    expect(text('klar-status')).toBe('1 sak kvar');
  });
  it('Har du … utfälld: de besvarade, med vem och när; med inga besvarade står det var frågorna finns', () => {
    montera({ ...KLAR, harDu: {} });
    oppnaGrupp('harDu');
    expect(text('klar-grupp-harDu-innehall')).toContain('Inga frågor är besvarade än');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera(KLAR);
    oppnaGrupp('harDu');
    expect(behallare!.querySelectorAll('[data-testid^="klar-fraga-"][data-besvarad="1"]').length).toBe(6);
    expect(text('klar-fraga-gransar-vem')).toContain('Martin');
  });
});

describe('Markägare & övrigt (räknas aldrig)', () => {
  it('"Inga avvikelser" från början; varje avvikelse räknas: "1 avvikelse", "2 avvikelser"', () => {
    montera(KLAR);
    expect(text('klar-grupp-ovrigt-sammanfattning')).toBe('Inga avvikelser');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...KLAR, markagareVed: true });                  // ved till markägaren = en avvikelse
    expect(text('klar-grupp-ovrigt-sammanfattning')).toBe('1 avvikelse');
    oppnaGrupp('ovrigt');
    klicka(q('klar-ovrigt-band-skotare-vaxla'));               // + band på skotaren
    expect(text('klar-grupp-ovrigt-sammanfattning')).toBe('2 avvikelser');
  });
  it('trailern är PÅ som standard — att stänga av den är en avvikelse', () => {
    montera({ ...KLAR });
    oppnaGrupp('ovrigt');
    klicka(q('klar-ovrigt-trailer-vaxla'));
    expect(spion.patchar.at(-1)).toEqual({ trailerIn: false });
  });
  it('ved på ger en avvikelse; standard "Nej", grått; att slå på band eller ved ändrar inte "kvar"', () => {
    montera({});
    const fore = text('klar-kvar-text');
    oppnaGrupp('ovrigt');
    klicka(q('klar-ovrigt-band-skotare-vaxla'));
    expect(spion.patchar.at(-1)).toEqual({ bandSkotare: true });
    expect(text('klar-kvar-text')).toBe(fore);
    expect(finns('klar-par-skotare-1')).toBe(true);
  });
  it('del 3 är grå: bara det som AVVIKER från standarden lyser; ett tryck växlar; trailer är på som standard', () => {
    montera({});
    oppnaGrupp('ovrigt');
    expect(q('klar-ovrigt-band-skotare')!.getAttribute('data-avviker')).toBe('0');
    expect(q('klar-ovrigt-trailer')!.getAttribute('data-avviker')).toBe('0');   // "Ja" är standard för trailern → inte lyst
    expect(text('klar-ovrigt-trailer-vaxla')).toBe('Ja');
    klicka(q('klar-ovrigt-band-skotare-vaxla'));
    expect(q('klar-ovrigt-band-skotare')!.getAttribute('data-avviker')).toBe('1');
    expect(text('klar-ovrigt-band-skotare-vaxla')).toBe('Ja');
    klicka(q('klar-ovrigt-trailer-vaxla'));
    expect(spion.patchar.at(-1)).toEqual({ trailerIn: false });
  });
  it('raden för en vald maskin säger VILKEN maskin det är', () => {
    montera({ skotare: EGEN('A110148'), skordare: EGEN('R64101') });
    oppnaGrupp('appen');
    expect(text('klar-rad-skotare')).toContain('Ponsse Elephant King AF');
    expect(text('klar-rad-skordare')).toContain('Rottne H8E');
  });
  it('konfiguration visas bara för Elephant King (och Smal räknas som avvikelse)', () => {
    montera({ visaKonfiguration: false });
    oppnaGrupp('ovrigt');
    expect(finns('klar-ovrigt-konfiguration')).toBe(false);
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ visaKonfiguration: true });
    oppnaGrupp('ovrigt');
    expect(finns('klar-ovrigt-konfiguration')).toBe(true);
    expect(text('klar-ovrigt-konfiguration-vaxla')).toBe('Bred');   // standard, grått
  });
  it('gamla anteckningar: en grå rad, inget raderat, ingen redigering (räknas inte som avvikelse)', () => {
    montera({ gamlaAnteckningar: 'Ring Stefan innan start.' });
    oppnaGrupp('ovrigt');
    expect(text('klar-gamla-anteckningar')).toContain('Gamla anteckningar');
    expect(text('klar-gamla-anteckningar')).toContain('Ring Stefan innan start.');
    expect(q('klar-gamla-anteckningar')!.querySelector('textarea,input')).toBeNull();
    expect(text('klar-grupp-ovrigt-sammanfattning')).toBe('Inga avvikelser');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({});
    oppnaGrupp('ovrigt');
    expect(finns('klar-gamla-anteckningar')).toBe(false);
  });
});

describe('ved', () => {
  it('raden öppnar vedvyn; val ger en sammanfattning; ‹ tillbaka visar den i kortet', () => {
    montera({});
    oppnaGrupp('ovrigt');
    klicka(q('klar-ved-rad'));
    expect(finns('ved-innehall')).toBe(true);
    expect(text('ved-sammanfattning')).toBe('Ved: vid avlägget');   // förvalt: vid avlägget
    klicka(q('ved-langd-3m')); klicka(q('ved-sortiment-bjork')); klicka(q('ved-sortiment-lov'));
    skriv(q('ved-ovrigt') as HTMLTextAreaElement, 'vid ladan');
    expect(text('ved-sammanfattning')).toBe('Ved: 3 m · Björk, Allt löv · vid avlägget · vid ladan');
    klicka(q('ved-klar'));
    expect(finns('ved-innehall')).toBe(false);
    expect(finns('klar-grupp-ovrigt-innehall')).toBe(true);          // tillbaka i kortet — gruppen är fortfarande utfälld
    expect(text('klar-ved-text')).toBe('Ved: 3 m · Björk, Allt löv · vid avlägget · vid ladan');
    expect(text('klar-ovrigt-ved')).toContain('Ja');
    expect(text('klar-grupp-ovrigt-sammanfattning')).toBe('1 avvikelse');
  });
  it('"Sätt på kartan" ber sidan att gå in i placeringsläget; utan symbol sägs det', () => {
    montera({});
    oppnaGrupp('ovrigt');
    klicka(q('klar-ved-rad'));
    klicka(q('ved-plats-karta'));
    expect(spion.sattVed).toBe(1);
    expect(text('ved-karta-status')).toContain('Ingen symbol satt än');
  });
  it('med symbol på kartan sägs det att föraren ser den', () => {
    montera({ ved: { ...VED_TOM, plats: 'karta', lat: 56.4, lng: 14.7, markeringId: 'abc' }, markagareVed: true });
    oppnaGrupp('ovrigt');
    klicka(q('klar-ved-rad'));
    expect(text('ved-karta-status')).toContain('föraren ser den');
  });
  it('"Annan" längd öppnar ett fritt fält; "Ingen ved" slår av och går tillbaka', () => {
    montera({ markagareVed: true });
    oppnaGrupp('ovrigt');
    klicka(q('klar-ved-rad'));
    klicka(q('ved-langd-annan'));
    skriv(q('ved-langd-annan-falt') as HTMLInputElement, '2,5 m');
    expect(text('ved-sammanfattning')).toContain('2,5 m');
    klicka(q('ved-ingen'));
    expect(finns('ved-innehall')).toBe(false);
    expect(text('klar-ovrigt-ved')).toContain('Nej');
  });
});

describe('databasen och felen', () => {
  it('migrationen körd inte → det SÄGS överst; läsfel likaså', () => {
    montera({ datalage: 'migrering-saknas' });
    expect(text('klar-datalage')).toContain('Svaren du ger här sparas inte');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ datalage: 'lasfel' });
    expect(text('klar-datalage')).toContain('gick inte att läsa');
  });
  it('ett sparfel visas i klartext', () => {
    montera({}, { sparFel: 'Kunde inte spara — försök igen.' });
    expect(text('klar-sparfel')).toContain('Kunde inte spara');
  });
  it('"Fortsätter en annan dag" finns och stänger (påminnelserna kommer i nästa PR)', () => {
    montera({});
    klicka(q('klar-fortsatter'));
    expect(spion.fortsatter).toBe(1);
  });
});

describe('ingången från ⓘ-kortet', () => {
  const M = (o: Partial<KartMarkering> & { id: string }): KartMarkering => ({ slag: 'symbol', typ: 'highstump', namn: 'Högstubbe', comment: '', lat: null, lng: null, skapad: null, ordning: 0, ...o });
  function infoProps(klar: ReturnType<typeof klarProps> | null, roll: 'planerare' | 'forare' = 'planerare') {
    const go: any = new Proxy({}, { get: () => () => {} });
    const mer = byggMerGrupper({ roll, arAdmin: roll === 'planerare', korvyAktiv: false, maskinlage: false, skotningFinnsSomKnapp: false, status: 'oplanerad', tillTrakt: true, vagdata: null, go });
    return {
      oppen: true, onStang: () => {}, objektNamn: 'Skälviken', objektId: 'o1', onKnapp: () => {},
      kort: {
        rad: objektRad({ typ: 'Slutavverkning' }), knappar: kortKnappar({ roll, harKoordinat: true, korvyAktiv: false, maskinSlag: null }), faror: [], tillForaren: [],
        brickor: faktaBrickor({ areal: 3.6, volym: 1800 }), extraBrickor: [], paTrakten: null, onBrand: () => {}, brand: null, dokument: null,
        larm: { satt: false, koordinat: '', kalla: '', bekraftad: false, beskrivning: '', onVisa: () => {}, onRedigera: () => {} },
        klarRad: klar ? { chip: { text: '13 kvar', ton: 'orange' as const } } : null,
      },
      om: { hela: [], planttext: null, restriktioner: [], markeringar: [M({ id: 'a' })], pos: null, miljo: [], ytor: [], ikon: () => null, onVisa: () => {}, onSlapp: () => {}, onFoto: () => {}, framhavdId: null },
      mer: { grupper: mer.grupper, avsluta: null, planerare: null },
      klar: klar ? (({ namn: _n, onStang: _s, ...rest }) => rest)(klar) : null,
    } as any;
  }
  function monteraInfo(p: any) {
    behallare = document.createElement('div'); document.body.appendChild(behallare);
    rot = createRoot(behallare); act(() => { rot!.render(<ObjektInfo {...p} />); });
  }
  it('"Redo att skicka" (vit) när allt är ifyllt men trakten inte skickats; grönt "Klar" först när den är skickad', () => {
    const p = infoProps(klarProps({}));
    p.kort.klarRad = { chip: { text: 'Redo att skicka', ton: 'neutral' } };
    monteraInfo(p);
    expect(q('kort-klar-chip')!.getAttribute('data-ton')).toBe('neutral');
    expect(text('kort-klar-chip')).toBe('Redo att skicka');
    expect((q('kort-klar-chip') as HTMLElement).style.color).not.toBe('');
    act(() => { rot!.unmount(); }); behallare!.remove();
    const q2 = infoProps(klarProps({}));
    q2.kort.klarRad = { chip: { text: 'Klar', ton: 'gron' } };
    monteraInfo(q2);
    expect(q('kort-klar-chip')!.getAttribute('data-ton')).toBe('gron');
  });
  it('planeraren ser raden "Klar med trakten? · 13 kvar" överst på kortet och den öppnar kortet i samma ark', () => {
    monteraInfo(infoProps(klarProps({})));
    expect(text('kort-klar-rad')).toContain('Klar med trakten?');
    expect(q('kort-klar-chip')!.getAttribute('data-ton')).toBe('orange');
    expect(text('kort-klar-chip')).toBe('13 kvar');
    klicka(q('kort-klar-rad'));
    expect(finns('klar-innehall')).toBe(true);
    expect(text('info-titel')).toBe('Skälviken');
  });
  it('föraren (eller en avslutad trakt) har ingen rad', () => {
    monteraInfo(infoProps(null, 'forare'));
    expect(finns('kort-klar-rad')).toBe(false);
  });
  it('förarens sammanfattning: bara läsning, ingen Klar-knapp, "Inte klarplanerad" när trakten är oplanerad', () => {
    const p = infoProps(null, 'forare');
    p.kort.planering = { oplanerad: true, gamla: 'Ring Stefan.', rader: [{ id: 'avlagg', etikett: 'Avlägg', text: '1 på kartan' }, { id: 'ved', etikett: 'Ved till markägaren', text: '3 m · Björk · vid avlägget' }] };
    monteraInfo(p);
    expect(text('kort-planering-oplanerad')).toContain('Inte klarplanerad än');
    expect(text('kort-planering-ved')).toContain('3 m · Björk');
    expect(text('kort-planering-gamla')).toContain('Ring Stefan.');
    expect(finns('klar-for-maskin')).toBe(false);
    expect(q('kort-planering')!.querySelector('button,input,textarea')).toBeNull();
  });
});


describe('raden stängs när ett val är gjort — nästa rad syns direkt', () => {
  const oppen = (id: string) => q(`klar-rad-${id}`)!.getAttribute('aria-expanded') === 'true';
  it('bärighet, terräng och skotningsavstånd: ett val stänger raden och posten flyttar ur Behöver dig; att ta tillbaka valet gör inte det', () => {
    montera({});
    for (const [rad, val] of [['barighet', 'bra'], ['terrang', 'flackt'], ['skotningsavstand', 'medel']] as const) {
      klicka(q(`klar-rad-${rad}`));
      expect(oppen(rad)).toBe(true);
      klicka(q(`klar-${rad}-${val}`));
      expect(finns(`klar-${rad}-${val}`), `${rad} stängd efter val`).toBe(false);
      expect(q('klar-behover')!.querySelector(`[data-testid="klar-post-${rad}"]`), `${rad} borta ur Behöver dig`).toBeNull();
    }
    oppnaGrupp('appen');
    expect(oppen('barighet')).toBe(false);
    klicka(q('klar-rad-barighet'));
    klicka(q('klar-barighet-bra'));          // samma val igen = tar tillbaka svaret
    expect(spion.patchar.at(-1)).toEqual({ barighet: null });
    expect(oppen('barighet')).toBe(true);    // inget val står kvar → raden förblir öppen (nu i Behöver dig)
  });
  it('skördare: Egen utan maskin stannar öppen, en vald maskin stänger; Extern stannar öppen tills planeraren själv stänger, och skrivandet stänger aldrig', () => {
    montera({});
    klicka(q('klar-rad-skordare'));
    klicka(q('klar-skordare-egen'));
    expect(oppen('skordare')).toBe(true);
    klicka(q('klar-skordare-maskin-R64101'));
    expect(q('klar-behover')!.querySelector('[data-testid="klar-post-skordare"]')).toBeNull();
    oppnaGrupp('appen');
    expect(oppen('skordare')).toBe(false);
    expect(text('klar-rad-skordare')).toContain('Rottne H8E');

    klicka(q('klar-rad-skotare'));
    klicka(q('klar-skotare-extern'));
    expect(oppen('skotare')).toBe(true);
    skriv(q('klar-skotare-extern-namn') as HTMLInputElement, 'Max Skotning');
    expect(oppen('skotare')).toBe(true);     // ett skrivfält stänger inte av sig självt — raden blir inte heller kvar-flyttad mitt i en bokstav
    klicka(q('klar-rad-skotare'));           // planeraren stänger själv
    expect(oppen('skotare')).toBe(false);
    expect(text('klar-rad-skotare')).toContain('Extern · Max Skotning');
  });
  it('Egen när en maskin redan är förvald (eller sparad) räknas som ett val och stänger', () => {
    montera({ skordare: EGEN('PONS20SDJAA270231') });
    oppnaGrupp('appen');
    klicka(q('klar-rad-skordare'));
    klicka(q('klar-skordare-egen'));
    expect(oppen('skordare')).toBe(false);
  });
  it('en rad i taget: att öppna terräng stänger bärighet', () => {
    montera({});
    klicka(q('klar-rad-barighet'));
    expect(oppen('barighet')).toBe(true);
    klicka(q('klar-rad-terrang'));
    expect(oppen('terrang')).toBe(true);
    expect(oppen('barighet')).toBe(false);
  });
});

describe('förval: egen maskin — raden är ifylld, Egen/Extern syns först när man öppnar den', () => {
  it('förvald skördare och skotare: inte kvar, maskinens namn på raden, inga Egen/Extern-knappar i viloläget', () => {
    montera({ skordare: EGEN('PONS20SDJAA270231'), skotare: EGEN('A110148') });
    expect(q('klar-behover')!.querySelector('[data-testid="klar-post-skordare"]')).toBeNull();
    oppnaGrupp('appen');
    expect(q('klar-post-skordare')!.getAttribute('data-kvar')).toBe('0');
    expect(q('klar-post-skotare')!.getAttribute('data-kvar')).toBe('0');
    expect(text('klar-rad-skordare')).toContain('Ponsse Scorpion Giant 8W');
    expect(text('klar-rad-skordare')).not.toContain('Välj');
    expect(finns('klar-skordare-egen')).toBe(false);
    expect(finns('klar-skordare-extern')).toBe(false);
    klicka(q('klar-rad-skordare'));
    expect(finns('klar-skordare-egen')).toBe(true);
    expect(finns('klar-skordare-extern')).toBe(true);
    expect(q('klar-skordare-egen')!.getAttribute('aria-pressed')).toBe('true');
  });
  it('ingen egen maskin går att hitta → raden är orange och kvar ("Välj")', () => {
    montera({ skordare: INGEN, skotare: EGEN('A110148') });
    expect(q('klar-post-skordare')!.getAttribute('data-kvar')).toBe('1');
    expect(text('klar-rad-skordare')).toContain('Välj');
    expect(q('klar-behover')!.querySelector('[data-testid="klar-post-skotare"]')).toBeNull();
  });
});

describe('Markägare & övrigt: etiketten är alltid vit — bara knappen till höger visar läget', () => {
  const FARG_TEXT = farg(FARG.text);
  const etikettFarg = (id: string) => (q(`klar-ovrigt-${id}`)!.querySelector('span') as HTMLElement).style.color;
  it('alla rader har vit etikett, både på standard och när de avviker', () => {
    montera({ visaKonfiguration: true });
    oppnaGrupp('ovrigt');
    const rader = ['band-skordare', 'band-skotare', 'breddat', 'konfiguration', 'ris', 'vagn', 'trailer', 'manuell'];
    for (const id of rader) expect(etikettFarg(id), `${id} (standard)`).toBe(FARG_TEXT);
    for (const id of ['band-skotare', 'breddat', 'manuell']) klicka(q(`klar-ovrigt-${id}-vaxla`));
    for (const id of rader) expect(etikettFarg(id), `${id} (avviker)`).toBe(FARG_TEXT);
    expect(q('klar-ovrigt-ris')!.getAttribute('data-avviker')).toBe('0');
    expect(q('klar-ovrigt-band-skotare')!.getAttribute('data-avviker')).toBe('1');
  });
  it('vedraden: etiketten vit i båda lägena; "Nej" grå fyllning, "Ja" vit fyllning; resten av raden är tryckbar', () => {
    montera({});
    oppnaGrupp('ovrigt');
    const knapp = () => q('klar-ved-rad')!;
    expect(knapp().style.color).toBe(FARG_TEXT);
    expect(q('klar-ved-lage')!.getAttribute('data-avviker')).toBe('0');
    const fyllning = (id: string) => q(id)!.style.background;
    expect(fyllning('klar-ved-lage')).toBe(fyllning('klar-ovrigt-ris-vaxla'));
    klicka(knapp());                         // slår på ved och öppnar vedarket
    act(() => { (q('ved-klar') as HTMLElement).click(); });
    expect(knapp().style.color).toBe(FARG_TEXT);
    expect(q('klar-ved-lage')!.getAttribute('data-avviker')).toBe('1');
    expect(text('klar-ved-lage')).toBe('Ja');
    expect(fyllning('klar-ved-lage')).not.toBe(fyllning('klar-ovrigt-band-skotare-vaxla'));
    klicka(q('klar-ovrigt-band-skotare-vaxla'));
    expect(fyllning('klar-ved-lage')).toBe(fyllning('klar-ovrigt-band-skotare-vaxla'));
  });
});

describe('iOS på svart: träffytor och språk', () => {
  it('varje knapp och rad i kortet är minst 44 pt hög (maskinen skakar och fingret träffar snett)', () => {
    for (const start of [{} as KlarFixtur, KLAR, { ...KLAR, avlaggAntal: 0, harDu: {} } as KlarFixtur]) {
      montera(start);
      for (const g of ['appen', 'harDu', 'ovrigt'] as const) { klicka(q(`klar-grupp-${g}-rad`)); for (const k of Array.from(behallare!.querySelectorAll('button'))) {
        const h = parseFloat((k as HTMLElement).style.minHeight || (k as HTMLElement).style.height || '0');
        expect(h, `${k.getAttribute('data-testid')} (${g})`).toBeGreaterThanOrEqual(44);
      } }
      act(() => { rot!.unmount(); }); behallare!.remove();
    }
  });
  it('färg är aldrig ensam informationsbärare: varje orange text har ett ord bredvid sig', () => {
    montera({});
    const orange = farg(FARG.orange);
    const orangeTexter = Array.from(behallare!.querySelectorAll<HTMLElement>('*')).filter((e) => e.style.color === orange && e.children.length === 0).map((e) => e.textContent!.trim());
    expect(orangeTexter.length).toBeGreaterThan(5);
    for (const t of orangeTexter) expect(t, 'orange text utan ord').toMatch(/[A-Za-zÅÄÖåäö]{3,}/);
  });
});
