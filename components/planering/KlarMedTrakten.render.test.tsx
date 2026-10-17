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
const text = (id: string) => q(id)?.textContent ?? '';

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

describe('Skälviken: en ny trakt — vad är kvar', () => {
  it('rubriken säger hur mycket som är kvar; basväg "Ingen" är grå och räknas inte; alla sex frågor ställs', () => {
    montera({});
    expect(text('klar-innehall')).toContain('Appen har fyllt i');
    expect(q('klar-post-basvag')!.getAttribute('data-kvar')).toBe('0');
    expect(text('klar-rad-basvag')).toContain('Ingen');
    expect(['avlagg', 'barighet', 'terrang', 'skotningsavstand', 'skordare', 'skotare', 'prognos'].every((id) => q(`klar-post-${id}`)!.getAttribute('data-kvar') === '1')).toBe(true);
    for (const id of ['gransar', 'naturvarden', 'kulturlamningar', 'ledningar', 'snitslat', 'avlagg_hugga']) expect(q(`klar-fraga-${id}`)!.getAttribute('data-besvarad')).toBe('0');
    // 7 poster + 6 frågor
    expect(text('klar-kvar-text')).toBe('Kvar: 7 saker · 6 frågor');   // sju poster räknas, listas inte
    expect(text('klar-innehall')).not.toContain('Ingen basväg');
  });

  it('orange rader säger också ett ord (färg är aldrig ensam bärare)', () => {
    montera({});
    expect(text('klar-rad-avlagg')).toContain('Placera');
    expect(text('klar-rad-barighet')).toContain('Välj');
    expect(text('klar-rad-prognos')).toMatch(/Saknar skördare/);
  });

  it('medelstam ur TD står på sin egen rad (0,72 för Skälviken) och volymen i prognosen', () => {
    montera({});
    expect(text('klar-rad-medelstam')).toContain('0,72');
    expect(q('klar-post-medelstam')!.getAttribute('data-kvar')).toBe('0');
    klicka(q('klar-rad-medelstam'));
    expect((q('klar-medelstam') as HTMLInputElement).value).toBe('0,72');
    klicka(q('klar-rad-prognos'));
    expect((q('klar-volym') as HTMLInputElement).value).toBe('1800');
  });
});

describe('Fyll i del 1 och 2 → Klar för maskin', () => {
  it('trycken rättar kortet: bärighet/terräng/avstånd, maskiner, prognos "Stämmer", sex svar → grön knapp → planerad', () => {
    montera({});
    klicka(q('klar-rad-barighet')); klicka(q('klar-barighet-bra'));
    klicka(q('klar-rad-terrang')); klicka(q('klar-terrang-flackt'));
    klicka(q('klar-rad-skotningsavstand')); klicka(q('klar-skotningsavstand-medel'));
    expect(text('klar-rad-barighet')).toContain('Bra');
    klicka(q('klar-rad-skordare')); klicka(q('klar-skordare-egen')); klicka(q('klar-skordare-maskin-R64101'));
    klicka(q('klar-rad-skotare')); klicka(q('klar-skotare-egen')); klicka(q('klar-skotare-maskin-A110148'));
    expect(text('klar-rad-skordare')).toContain('Rottne H8E');
    // avlägg: kartan (anroparen) lägger markeringen; här ger vi trycket
    klicka(q('klar-rad-avlagg'));
    expect(spion.placeraAvlagg).toBe(1);
    // prognos: timmar saknas → "Stämmer" går inte; förslag fyller i, sedan Stämmer
    klicka(q('klar-rad-prognos'));
    expect(text('klar-prognos-saknas')).toContain('skördartimmar');
    klicka(q('klar-stammer')); expect(spion.stammer).toBe(0);
    skriv(q('klar-skordartimmar') as HTMLInputElement, '41'); skriv(q('klar-skotartimmar') as HTMLInputElement, '36');
    expect(q('klar-stammer')!.hasAttribute('disabled')).toBe(false);
    klicka(q('klar-stammer')); expect(spion.stammer).toBe(1);
    expect(text('klar-rad-prognos')).toContain('Stämmer');
    // fortfarande kvar: avlägg (kartan) + 6 frågor → knappen är grå men TRYCKBAR
    expect(q('klar-for-maskin')!.getAttribute('data-klar')).toBe('0');
    expect(q('klar-for-maskin')!.hasAttribute('disabled')).toBe(false);
  });

  it('allt klart → grön knapp utan "Kvar"; trycket gör trakten planerad ("Klar för maskin ✓") och knappen försvinner', () => {
    montera({
      avlaggAntal: 1, basvagTexter: ['Röd · 640 m'], barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel',
      skordare: EGEN('R64101'), skotare: EGEN('A110148'), skordareTimmar: 41, skotareTimmar: 36, godkand: true, harDu: ALLA_SVAR(),
    });
    expect(q('klar-for-maskin')!.getAttribute('data-klar')).toBe('1');
    expect(finns('klar-kvar-text')).toBe(false);
    expect(text('klar-for-maskin')).toBe('Klar för maskin');
    klicka(q('klar-for-maskin'));
    expect(spion.klarForMaskin).toBe(1);
    expect(finns('klar-for-maskin')).toBe(false);
    expect(text('klar-skickad')).toContain('Klar för maskin');
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

describe('extern utförare och trakt utan basväg', () => {
  it('extern skotare + extern skördare → "Extern – ingen prognos", aldrig kvar', () => {
    montera({ skordare: EXTERN('Skog AB'), skotare: EXTERN('Max Skotning') });
    expect(q('klar-post-prognos')!.getAttribute('data-kvar')).toBe('0');
    expect(text('klar-rad-prognos')).toContain('Extern – ingen prognos');
    expect(text('klar-rad-skotare')).toContain('Extern · Max Skotning');
    klicka(q('klar-rad-prognos'));
    expect(finns('klar-stammer')).toBe(false);
  });
  it('egen skördare + extern skotare: prognosen gäller den egna maskinen (bara skördartimmar efterfrågas)', () => {
    montera({ skordare: EGEN('R64101'), skotare: EXTERN('Max') });
    klicka(q('klar-rad-prognos'));
    expect(finns('klar-skordartimmar')).toBe(true);
    expect(finns('klar-skotartimmar')).toBe(false);
  });
  it('extern kräver ett namn: "Extern" utan namn är fortfarande kvar', () => {
    montera({ skotare: { maskinId: null, utforare: 'extern', externNamn: '' } });
    expect(q('klar-post-skotare')!.getAttribute('data-kvar')).toBe('1');
  });
  it('trakt UTAN basväg: "Ingen" och räknas som klar; med basväg listas färg och längd', () => {
    montera({ basvagTexter: [] });
    expect(q('klar-post-basvag')!.getAttribute('data-kvar')).toBe('0');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ basvagTexter: ['Röd · 640 m', 'Gul · 120 m'] });
    expect(text('klar-rad-basvag')).toContain('Röd · 640 m');
    klicka(q('klar-rad-basvag'));
    expect(text('klar-basvag-rita')).toBe('Rita en basväg till');
    klicka(q('klar-basvag-rita'));
    expect(spion.ritaBasvag).toBe(1);
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
    expect(q('klar-post-basvag')!.getAttribute('data-kvar')).toBe('0');
    expect(finns('klar-kvar-text')).toBe(false);
    expect(q('klar-for-maskin')!.getAttribute('data-klar')).toBe('1');
  });
  it('ingen basväg väntad (trakt utan basväg) → "Ingen" och klart', () => {
    montera({ ...nästanKlar, basvagForvantad: false });
    expect(text('klar-rad-basvag')).toContain('Ingen');
    expect(finns('klar-kvar-text')).toBe(false);
  });
});

describe('Har du … — svar och varningar', () => {
  it('ett svar sparas med vem och när; samma svar igen tar tillbaka det', () => {
    montera({});
    klicka(q('klar-fraga-gransar-ja'));
    expect(q('klar-fraga-gransar')!.getAttribute('data-besvarad')).toBe('1');
    expect(text('klar-fraga-gransar-vem')).toContain('Martin');
    klicka(q('klar-fraga-gransar-ja'));
    expect(q('klar-fraga-gransar')!.getAttribute('data-besvarad')).toBe('0');
    klicka(q('klar-fraga-naturvarden-nej'));
    expect(q('klar-fraga-naturvarden-nej')!.getAttribute('aria-pressed')).toBe('true');
    expect(text('klar-fraga-naturvarden-nej')).toBe('Inga hittade');
  });
  it('fornlämning i lagret → orange varning under kulturfrågan, frågan ställs även utan varning', () => {
    montera({ restriktioner: [{ type: 'fornlamning', name: 'Stensättning' }] });
    expect(text('klar-varning-kulturlamningar')).toContain('Registrerad fornlämning: Stensättning');
    expect(finns('klar-varning-ledningar')).toBe(false);
    expect(finns('klar-fraga-ledningar')).toBe(true);
  });
  it('en el-ledning på kartan varnar under el-frågan', () => {
    montera({ markeringar: [{ slag: 'symbol', typ: 'powerline' }] });
    expect(text('klar-varning-ledningar')).toContain('1 el-ledning markerad på kartan');
  });
});

describe('del 3 — markägare & övrigt (räknas aldrig)', () => {
  it('standard "Nej", grått; att slå på band eller ved ändrar inte "kvar"', () => {
    montera({});
    const fore = text('klar-kvar-text');
    klicka(q('klar-ovrigt-band-skotare-vaxla'));
    expect(spion.patchar.at(-1)).toEqual({ bandSkotare: true });
    expect(text('klar-kvar-text')).toBe(fore);
    expect(finns('klar-par-skotare-1')).toBe(true);
  });
  it('del 3 är grå: bara det som AVVIKER från standarden lyser; ett tryck växlar; trailer är på som standard', () => {
    montera({});
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
    expect(text('klar-rad-skotare')).toContain('Ponsse Elephant King AF');
    expect(text('klar-rad-skordare')).toContain('Rottne H8E');
  });
  it('konfiguration visas bara för Elephant King', () => {
    montera({ visaKonfiguration: false });
    expect(finns('klar-ovrigt-konfiguration')).toBe(false);
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ visaKonfiguration: true });
    expect(finns('klar-ovrigt-konfiguration')).toBe(true);
    expect(text('klar-ovrigt-konfiguration-vaxla')).toBe('Bred');   // standard, grått
  });
  it('gamla anteckningar: en grå rad, inget raderat, ingen redigering', () => {
    montera({ gamlaAnteckningar: 'Ring Stefan innan start.' });
    expect(text('klar-gamla-anteckningar')).toContain('Gamla anteckningar');
    expect(text('klar-gamla-anteckningar')).toContain('Ring Stefan innan start.');
    expect(q('klar-gamla-anteckningar')!.querySelector('textarea,input')).toBeNull();
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({});
    expect(finns('klar-gamla-anteckningar')).toBe(false);
  });
});

describe('ved', () => {
  it('raden öppnar vedvyn; val ger en sammanfattning; ‹ tillbaka visar den i kortet', () => {
    montera({});
    klicka(q('klar-ved-rad'));
    expect(finns('ved-innehall')).toBe(true);
    expect(text('ved-sammanfattning')).toBe('Ved: vid avlägget');   // förvalt: vid avlägget
    klicka(q('ved-langd-3m')); klicka(q('ved-sortiment-bjork')); klicka(q('ved-sortiment-lov'));
    skriv(q('ved-ovrigt') as HTMLTextAreaElement, 'vid ladan');
    expect(text('ved-sammanfattning')).toBe('Ved: 3 m · Björk, Allt löv · vid avlägget · vid ladan');
    klicka(q('ved-klar'));
    expect(finns('ved-innehall')).toBe(false);
    expect(text('klar-ved-text')).toBe('Ved: 3 m · Björk, Allt löv · vid avlägget · vid ladan');
    expect(text('klar-ovrigt-ved')).toContain('Ja');
  });
  it('"Sätt på kartan" ber sidan att gå in i placeringsläget; utan symbol sägs det', () => {
    montera({});
    klicka(q('klar-ved-rad'));
    klicka(q('ved-plats-karta'));
    expect(spion.sattVed).toBe(1);
    expect(text('ved-karta-status')).toContain('Ingen symbol satt än');
  });
  it('med symbol på kartan sägs det att föraren ser den', () => {
    montera({ ved: { ...VED_TOM, plats: 'karta', lat: 56.4, lng: 14.7, markeringId: 'abc' }, markagareVed: true });
    klicka(q('klar-ved-rad'));
    expect(text('ved-karta-status')).toContain('föraren ser den');
  });
  it('"Annan" längd öppnar ett fritt fält; "Ingen ved" slår av och går tillbaka', () => {
    montera({ markagareVed: true });
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
    expect(text('info-titel')).toBe('Klar med Skälviken?');
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
  it('bärighet, terräng och skotningsavstånd: ett val stänger raden; att ta tillbaka valet gör det inte', () => {
    montera({});
    for (const [rad, val] of [['barighet', 'bra'], ['terrang', 'flackt'], ['skotningsavstand', 'medel']] as const) {
      klicka(q(`klar-rad-${rad}`));
      expect(oppen(rad)).toBe(true);
      klicka(q(`klar-${rad}-${val}`));
      expect(oppen(rad), `${rad} stängd efter val`).toBe(false);
      expect(finns(`klar-${rad}-${val}`)).toBe(false);
    }
    klicka(q('klar-rad-barighet'));
    klicka(q('klar-barighet-bra'));          // samma val igen = tar tillbaka svaret
    expect(spion.patchar.at(-1)).toEqual({ barighet: null });
    expect(oppen('barighet')).toBe(true);    // inget val står kvar → raden förblir öppen
  });
  it('skördare: Egen utan maskin stannar öppen, en vald maskin stänger; Extern stannar öppen tills namnet är ifyllt och stängs aldrig av skrivandet', () => {
    montera({});
    klicka(q('klar-rad-skordare'));
    klicka(q('klar-skordare-egen'));
    expect(oppen('skordare')).toBe(true);
    klicka(q('klar-skordare-maskin-R64101'));
    expect(oppen('skordare')).toBe(false);
    expect(text('klar-rad-skordare')).toContain('Rottne H8E');

    klicka(q('klar-rad-skotare'));
    klicka(q('klar-skotare-extern'));
    expect(oppen('skotare')).toBe(true);
    skriv(q('klar-skotare-extern-namn') as HTMLInputElement, 'Max Skotning');
    expect(oppen('skotare')).toBe(true);     // ett skrivfält stänger inte av sig självt
    klicka(q('klar-rad-skotare'));           // planeraren stänger själv
    expect(oppen('skotare')).toBe(false);
    expect(text('klar-rad-skotare')).toContain('Extern · Max Skotning');
  });
  it('Egen när en maskin redan är förvald (eller sparad) räknas som ett val och stänger', () => {
    montera({ skordare: EGEN('PONS20SDJAA270231') });
    klicka(q('klar-rad-skordare'));
    klicka(q('klar-skordare-egen'));
    expect(oppen('skordare')).toBe(false);
  });
  it('bara den rad som valet hör till stängs — en annan öppen rad störs inte', () => {
    montera({});
    klicka(q('klar-rad-prognos'));
    expect(oppen('prognos')).toBe(true);
    klicka(q('klar-rad-barighet'));          // öppnar bärighet, prognos stängs (en rad i taget)
    klicka(q('klar-barighet-bra'));
    expect(oppen('barighet')).toBe(false);
    expect(oppen('prognos')).toBe(false);
  });
});

describe('förval: egen maskin — raden är ifylld, Egen/Extern syns först när man öppnar den', () => {
  it('förvald skördare och skotare: inte kvar, maskinens namn på raden, inga Egen/Extern-knappar i viloläget', () => {
    montera({ skordare: EGEN('PONS20SDJAA270231'), skotare: EGEN('A110148') });
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
    expect(q('klar-post-skotare')!.getAttribute('data-kvar')).toBe('0');
  });
});

describe('del 3: etiketten är alltid vit — bara knappen till höger visar läget', () => {
  const FARG_TEXT = (() => { const e = document.createElement('div'); e.style.color = '#ffffff'; return e.style.color; })();
  const etikettFarg = (id: string) => (q(`klar-ovrigt-${id}`)!.querySelector('span') as HTMLElement).style.color;
  it('alla rader i del 3 har vit etikett, både på standard och när de avviker', () => {
    montera({ visaKonfiguration: true });
    const rader = ['band-skordare', 'band-skotare', 'breddat', 'konfiguration', 'ris', 'vagn', 'trailer', 'manuell'];
    for (const id of rader) expect(etikettFarg(id), `${id} (standard)`).toBe(FARG_TEXT);
    for (const id of ['band-skotare', 'breddat', 'manuell']) klicka(q(`klar-ovrigt-${id}-vaxla`));
    for (const id of rader) expect(etikettFarg(id), `${id} (avviker)`).toBe(FARG_TEXT);
    // läget bor i knappen: grå fyllning = standard, vit = avviker
    expect(q('klar-ovrigt-ris')!.getAttribute('data-avviker')).toBe('0');
    expect(q('klar-ovrigt-band-skotare')!.getAttribute('data-avviker')).toBe('1');
  });
  it('vedraden: etiketten vit i båda lägena; "Nej" grå fyllning, "Ja" vit fyllning; resten av raden är tryckbar', () => {
    montera({});
    const knapp = () => q('klar-ved-rad')!;
    expect(knapp().style.color).toBe(FARG_TEXT);
    expect(q('klar-ved-lage')!.getAttribute('data-avviker')).toBe('0');
    // samma fyllning som övriga raders läge-knapp i samma läge: Nej = grå (som en ej påslagen knapp), Ja = vit
    const fyllning = (id: string) => q(id)!.style.background;
    expect(fyllning('klar-ved-lage')).toBe(fyllning('klar-ovrigt-ris-vaxla'));
    klicka(knapp());                         // slår på ved och öppnar vedarket
    act(() => { (q('ved-klar') as HTMLElement).click(); });
    expect(knapp().style.color).toBe(FARG_TEXT);
    expect(q('klar-ved-lage')!.getAttribute('data-avviker')).toBe('1');
    expect(text('klar-ved-lage')).toBe('Ja');
    expect(fyllning('klar-ved-lage')).not.toBe(fyllning('klar-ovrigt-band-skotare-vaxla'));   // Ja = vit, en ej påslagen knapp = grå
    klicka(q('klar-ovrigt-band-skotare-vaxla'));   // en annan rad som avviker (Ja) har samma vita fyllning
    expect(fyllning('klar-ved-lage')).toBe(fyllning('klar-ovrigt-band-skotare-vaxla'));
  });
});

describe('G15-förslaget: förifyllt, med källa, prestation och orange tomläge', () => {
  const fyllt: KlarFixtur = { skordare: EGEN('PONS20SDJAA270231'), skotare: EGEN('A110148'), skordareTimmar: 41, skotareTimmar: 36 };
  it('ingen "Använd förslaget"-knapp och ingen förslagsruta — fälten är redan ifyllda med förslaget', () => {
    montera(fyllt);
    klicka(q('klar-rad-prognos'));
    expect(finns('klar-prognos-anvand')).toBe(false);
    expect(finns('klar-prognos-forslag')).toBe(false);
    expect(behallare!.textContent).not.toContain('Använd förslaget');
    expect((q('klar-skordartimmar') as HTMLInputElement).value).toBe('41');
    expect((q('klar-skotartimmar') as HTMLInputElement).value).toBe('36');
  });
  it('metarad om källan under fältet: antal trakter, medelstam och uppmätt spann (troligen …)', () => {
    montera(fyllt);
    klicka(q('klar-rad-prognos'));
    expect(text('klar-skordare-kalla')).toBe('Ur 7 trakter med medelstam 0,64–1,0 · troligen 38–45');
    expect(text('klar-skotare-kalla')).toBe('Ur 22 slutavverkningar (snitt) · troligen 30–44');
    expect(finns('klar-skordare-andrad')).toBe(false);
  });
  it('ändrar man siffran visas "Ändrad av dig · förslag 41", och källan står kvar', () => {
    montera(fyllt);
    klicka(q('klar-rad-prognos'));
    skriv(q('klar-skordartimmar') as HTMLInputElement, '55');
    expect(text('klar-skordare-andrad')).toBe('Ändrad av dig · förslag 41');
    expect(finns('klar-skordare-kalla')).toBe(true);
    expect(finns('klar-skotare-andrad')).toBe(false);          // skotaren orörd
    skriv(q('klar-skordartimmar') as HTMLInputElement, '41');
    expect(finns('klar-skordare-andrad')).toBe(false);          // tillbaka på förslaget → ingen "ändrad"
  });
  it('prestation per maskin (volym ÷ G15-tim), både hopfällt och öppet, och den följer en ändrad siffra', () => {
    montera({ ...fyllt, volym: 1800 });
    expect(text('klar-prognos-rad-0')).toBe('Skördare 41 G15-tim · 44 m³fub/G15');
    expect(text('klar-prognos-rad-1')).toBe('Skotare 36 G15-tim · 50 m³fub/G15');
    klicka(q('klar-rad-prognos'));
    expect(text('klar-skordare-prestation')).toBe('44 m³fub/G15');
    skriv(q('klar-skordartimmar') as HTMLInputElement, '60');
    expect(text('klar-skordare-prestation')).toBe('30 m³fub/G15');
  });
  it('prestationen skrivs inte när något saknas (ingen volym → bara timmarna)', () => {
    montera({ ...fyllt, volym: null });
    expect(text('klar-prognos-rad-0')).toBe('Skördare 41 G15-tim');
    klicka(q('klar-rad-prognos'));
    expect(finns('klar-skordare-prestation')).toBe(false);
  });
  it('inget förslag (för få jämförbara): fältet tomt, orange förklaring, raden orange och kvar — ingen gissning', () => {
    montera({ skordare: EGEN('PONS20SDJAA270231'), skotare: EGEN('A110148'), utanForslag: true });
    expect(q('klar-post-prognos')!.getAttribute('data-kvar')).toBe('1');
    expect(text('klar-rad-prognos')).toMatch(/Saknar skördartimmar/);
    klicka(q('klar-rad-prognos'));
    expect((q('klar-skordartimmar') as HTMLInputElement).value).toBe('');
    expect(text('klar-skordare-forslag-saknas')).toMatch(/Färre än 3 jämförbara trakter/);
    expect(finns('klar-skordare-kalla')).toBe(false);
    expect(finns('klar-prognos-rad-0')).toBe(false);
  });
  it('extern skördare: inga G15-fält för den (bara egna maskiner har timmar)', () => {
    montera({ skordare: EXTERN('Skog AB'), skotare: EGEN('A110148'), skotareTimmar: 36 });
    klicka(q('klar-rad-prognos'));
    expect(finns('klar-skordartimmar')).toBe(false);
    expect(finns('klar-skotartimmar')).toBe(true);
  });
});

describe('medelstam som egen rad i del 1', () => {
  it('saknas den (ingen TD-träff, inget skrivet) är raden orange och kvar, med förklaringen att förslaget då tar snitt över alla', () => {
    montera({ medelstam: null });
    expect(q('klar-post-medelstam')!.getAttribute('data-kvar')).toBe('1');
    expect(text('klar-rad-medelstam')).toContain('Skriv');
    expect(text('klar-post-medelstam')).toContain('snitt över alla trakter');
    expect(text('klar-kvar-text')).toContain('8 saker');          // sju poster + medelstam, räknas inte listas
  });
  it('att skriva den tar bort "kvar" och raden stängs inte av sig själv (skrivfält)', () => {
    montera({ medelstam: null });
    klicka(q('klar-rad-medelstam'));
    skriv(q('klar-medelstam') as HTMLInputElement, '0,8');
    expect(spion.patchar.at(-1)).toEqual({ medelstam: '0,8' });
    expect(q('klar-rad-medelstam')!.getAttribute('aria-expanded')).toBe('true');
  });
});
