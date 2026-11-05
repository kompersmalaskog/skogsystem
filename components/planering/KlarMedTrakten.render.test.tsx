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
import { HAR_DU_FRAGOR, sattHarDu, VED_TOM, type HarDuId, type HarDuSvarVarde, type VedDetaljer } from '@/lib/klarTrakt';
import { kvarSteg } from '@/lib/klarSteg';
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
/** Färg som webbläsaren skriver den (hex → rgb), för jämförelse med style.color. */
const farg = (hex: string) => { const e = document.createElement('div'); e.style.color = hex; return e.style.color; };
const utanMellanrum = (t: string) => t.replace(/\s/g, ' ');

const spion = { granska: [] as any[], bekrafta: 0, klarForMaskin: 0, fortsatter: 0, placeraAvlagg: 0, ritaBasvag: 0, sattVed: 0, stammer: 0, stang: 0, patchar: [] as KlarPatch[] };

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
        ...(a.skordareTimmar !== undefined ? { skordareTimmar: Number(a.skordareTimmar.replace(',', '.')) || null, godkand: false } : {}),
        ...(a.skotareTimmar !== undefined ? { skotareTimmar: Number(a.skotareTimmar.replace(',', '.')) || null, godkand: false } : {}),
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
    onBekraftaVidaAvlagg: () => { spion.bekrafta += 1; setF((cur) => ({ ...cur, vidaBekraftat: true })); },
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

beforeEach(() => { Object.assign(spion, { granska: [], bekrafta: 0, klarForMaskin: 0, fortsatter: 0, placeraAvlagg: 0, ritaBasvag: 0, sattVed: 0, stammer: 0, stang: 0, patchar: [] }); sattBredd(390); });
afterEach(() => { act(() => { rot?.unmount(); }); behallare?.remove(); rot = null; behallare = null; });

const ALLA_SVAR = (): KlarFixtur['harDu'] => { let s = {}; for (const { id } of HAR_DU_FRAGOR) s = sattHarDu(s, id, 'ja', 'm1', 'T'); return s; };

/** Allt ifyllt, prognosen godkänd, alla sex frågor besvarade: "Allt klart". */
const KLAR: KlarFixtur = {
  avlaggAntal: 1, basvagTexter: ['Röd · 640 m'], barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel',
  skordare: EGEN('R64101'), skotare: EGEN('A110148'), skordareTimmar: 41, skotareTimmar: 36, godkand: true, harDu: ALLA_SVAR(),
};
/** Monterar om med nytt underlag (för test som jämför två lägen). */
const montera_om = (start: KlarFixtur) => { act(() => { rot!.unmount(); }); behallare!.remove(); montera(start); };



// ── hjälpare för de två lägena ────────────────────────────────────────────────────────────────────────────────────────
const orange = () => farg(FARG.orange);
const rubrik = () => text('klar-steg-rubrik');
const hoppa = () => klicka(q('klar-steg-hoppa'));
/** Hoppa över på Har du … går en FRÅGA framåt; steget är klart efter den sjätte */
const hoppaHarDu = () => { for (let k = 0; k < HAR_DU_FRAGOR.length; k += 1) hoppa(); };
/** radens id i Behöver dig, i ordning */
const kvarRader = () => Array.from(q('klar-behover')!.querySelectorAll('[data-kvar="1"]')).map((e) => e.getAttribute('data-testid')!.replace('klar-post-', ''));
const skriva = (id: string, v: string) => { klicka(q(`klar-cell-${id}`)); skriv(q(`klar-${id}`) as HTMLInputElement, v); blur(q(`klar-${id}`)); };
/** SE → sektionen Markägare & övrigt */
const tillOvrigt = () => klicka(q('klar-se-ovrigt-rad'));
/** pt-värde ur en stil som "60px" */
const px = (v: string | undefined) => parseInt(v ?? '0', 10);
const EGNA: KlarFixtur = { skordare: EGEN('R64101'), skotare: EGEN('A110148'), skordareTimmar: 41, skotareTimmar: 36 };
/** Allt ifyllt utom att prognosen inte är godkänd: prognosen är det enda som är kvar. */
const BARA_PROGNOS: KlarFixtur = { ...KLAR, godkand: false };

describe('GÖRA: EN sida — "N klara ✓", sedan det som är kvar (Martin 2026-11-05: inga steg att gå igenom)', () => {
  it('rubriken är traktens namn; under den "N kvar" i orange — en rad per sak, varje obesvarad fråga en egen rad', () => {
    montera({});
    const st = klarProps({}).status;
    expect(text('klar-status')).toBe(`${st.antalKvar} kvar`);
    expect(st.antalKvar).toBe(4 + HAR_DU_FRAGOR.length);
    expect(q('klar-status')!.style.color).toBe(orange());
    expect(behallare!.textContent).toContain('Skälviken');
    expect(finns('klar-fakta')).toBe(false);
    expect(finns('klar-ga-igenom')).toBe(false);
  });
  it('Kvar-listan: Avlägg · Förutsättningar · Maskiner · Prognos, sedan varje obesvarad fråga med Ja/Nej på raden', () => {
    montera({});
    expect(kvarRader()).toEqual(['avlagg', 'forutsattningar', 'maskiner', 'prognos', ...HAR_DU_FRAGOR.map((f) => `fraga-${f.id}`)]);
    expect(text('klar-rad-avlagg-varde')).toBe('Placera');
    expect(text('klar-rad-forutsattningar-varde')).toBe('3 att välja');
    expect(text('klar-rad-maskiner-varde')).toBe('Välj');
    expect(text('klar-rad-prognos-varde')).toMatch(/^Saknar /);
    expect(q('klar-behover')!.querySelectorAll('input,textarea').length).toBe(0);
  });
  it('en fråga svaras direkt på raden och raden försvinner; antalet sjunker med ett', () => {
    montera({});
    const fore = klarProps({}).status.antalKvar;
    klicka(q('klar-fraga-markagare-ja'));
    expect(finns('klar-post-fraga-markagare')).toBe(false);
    expect(text('klar-status')).toBe(`${fore - 1} kvar`);
    klicka(q('klar-fraga-gransar-nej'));
    expect(finns('klar-post-fraga-gransar')).toBe(false);
    expect(text('klar-status')).toBe(`${fore - 2} kvar`);
  });
  it('Avlägg och Basväg gör saken direkt — ingen mellanskärm', () => {
    montera({ basvagForvantad: true });
    klicka(q('klar-rad-avlagg'));
    expect(spion.placeraAvlagg).toBe(1);
    klicka(q('klar-rad-basvag'));
    expect(spion.ritaBasvag).toBe(1);
    expect(finns('klar-steg')).toBe(false);
  });
  it('Förutsättningar öppnar sitt steg (knappen heter Klar); klart → tillbaka och raden är borta', () => {
    montera({});
    klicka(q('klar-rad-forutsattningar'));
    expect(rubrik()).toBe('Förutsättningar');
    expect(finns('klar-steg-framsteg')).toBe(false);
    expect(finns('klar-steg-hoppa')).toBe(false);
    expect(text('klar-steg-nasta')).toBe('Klar');
    klicka(q('klar-barighet-bra')); klicka(q('klar-terrang-kuperat')); klicka(q('klar-skotningsavstand-kort'));
    klicka(q('klar-steg-nasta'));
    expect(kvarRader()).not.toContain('forutsattningar');
  });
  it('Maskiner lämnar listan först när båda rollerna är valda', () => {
    montera({ avlaggAntal: 1, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel', skordare: EGEN('R64101') });
    expect(kvarRader()).toContain('maskiner');
    montera_om({ avlaggAntal: 1, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel', skordare: EGEN('R64101'), skotare: EGEN('A110148') });
    expect(kvarRader()).not.toContain('maskiner');
  });
  it('Medelstam saknas: egen rad "Skriv" som öppnar ett steg med ett skrivfält', () => {
    montera({ medelstam: null });
    expect(text('klar-rad-medelstam-varde')).toBe('Skriv');
    klicka(q('klar-rad-medelstam'));
    skriv(q('klar-medelstam-falt') as HTMLInputElement, '0,64');
    expect(spion.patchar.at(-1)).toEqual({ medelstam: '0,64' });
  });
  it('"N klara ✓ ›" öppnar sammanställningen; "Om trakten ›" ber sidan öppna ⓘ', () => {
    let info = 0;
    montera({ avlaggAntal: 1 }, { onInfo: () => { info += 1; } });
    expect(text('klar-se-oppna')).toMatch(/^\d+ klara✓$/);
    klicka(q('klar-info'));
    expect(info).toBe(1);
    klicka(q('klar-se-oppna'));
    expect(finns('klar-se')).toBe(true);
    expect(finns('klar-behover')).toBe(false);
    klicka(q('klar-se-tillbaka'));
    expect(finns('klar-behover')).toBe(true);
  });
  it('utan onInfo finns ingen "Om trakten"-rad', () => {
    montera({});
    expect(finns('klar-info')).toBe(false);
  });
  it('orange står bara på antalet i rubriken, värdet i raderna och frågornas varningar', () => {
    montera({});
    const orangea = Array.from(behallare!.querySelectorAll<HTMLElement>('*')).filter((e) => e.style.color === orange());
    expect(orangea.length).toBeGreaterThan(0);
    for (const e of orangea) {
      const id = e.getAttribute('data-testid') ?? '';
      const ok = id === 'klar-status' || id.startsWith('klar-varning-') || e.closest('[data-testid^="klar-rad-"][data-testid$="-varde"]') != null;
      expect(ok, e.outerHTML.slice(0, 120)).toBe(true);
    }
  });
  it('Klar för maskin spärrar aldrig: grå med saker kvar, grön när allt är klart; Fortsätter en annan dag stänger', () => {
    montera({});
    expect(q('klar-for-maskin')!.getAttribute('data-klar')).toBe('0');
    klicka(q('klar-for-maskin'));
    expect(spion.klarForMaskin).toBe(1);
    klicka(q('klar-fortsatter'));
    expect(spion.fortsatter).toBe(1);
    montera_om(KLAR);
    expect(q('klar-for-maskin')!.getAttribute('data-klar')).toBe('1');
  });
  it('inget innehåll ligger under Klar för maskin, och listan har luft i botten', () => {
    montera({});
    expect(q('klar-innehall')!.contains(q('klar-for-maskin'))).toBe(false);
    expect(px(q('klar-innehall')!.style.paddingBottom)).toBeGreaterThanOrEqual(32);
  });
});

describe('stegen som öppnas från sammanställningen: den knapp som gör stegets sak är primär', () => {
  const vit = (id: string) => q(id)!.style.background === farg(FARG.text);
  it('Avlägg placerat: "Placera ett till" grå, Klar vit', () => {
    montera({ avlaggAntal: 1 });
    klicka(q('klar-se-oppna'));
    klicka(q('klar-se-avlagg'));
    expect(text('klar-avlagg-status')).toBe('Avlägg placerat ✓');
    expect(vit('klar-avlagg-placera')).toBe(false);
    expect(vit('klar-steg-nasta')).toBe(true);
  });
  it('Basväg ritad: Rita basväg grå, Klar vit', () => {
    montera({ basvagForvantad: true, basvagTexter: ['Röd · 640 m'] });
    klicka(q('klar-se-oppna'));
    klicka(q('klar-se-basvag'));
    expect(vit('klar-basvag-rita')).toBe(false);
    expect(vit('klar-steg-nasta')).toBe(true);
  });
  it('Prognos: Stämmer är grå tills allt som behövs finns; trycket sparar godkännandet', () => {
    montera({ ...KLAR, godkand: false, skordareTimmar: null });
    klicka(q('klar-rad-prognos'));
    expect(rubrik()).toBe('Prognos');
    expect(q('klar-stammer')!.hasAttribute('disabled')).toBe(true);
    skriva('skordartimmar', '41');
    klicka(q('klar-stammer'));
    expect(spion.stammer).toBe(1);
  });
});

describe('Vidas avlägg räknas som avlägg', () => {
  const VIDA = { vidaAvlagg: ['01-1', '01-2'] };
  const vit = (id: string) => q(id)!.style.background === farg(FARG.text);
  it('Behöver dig säger "Bekräfta"; steget (reservvägen utan sida) frågar "Vida har lagt 2 avlägg. Ligger de rätt?" utan nummer, med "Ja, de ligger rätt" (vit) och "Lägg till eget" (grå)', () => {
    montera({ ...VIDA });
    expect(text('klar-rad-avlagg-varde')).toBe('Bekräfta');
    klicka(q('klar-rad-avlagg'));
    expect(text('klar-avlagg-fraga')).toBe('Vida har lagt 2 avlägg. Ligger de rätt?');
    expect(text('klar-avlagg-stammer')).toBe('Ja, de ligger rätt');
    expect(vit('klar-avlagg-stammer')).toBe(true);
    expect(text('klar-avlagg-placera')).toBe('Lägg till eget');
    expect(vit('klar-avlagg-placera')).toBe(false);
    expect(vit('klar-steg-nasta')).toBe(false);
    expect(behallare!.textContent).not.toMatch(/01-1|01-2/);                // numren står bara som etiketter på kartan
    expect(behallare!.textContent).not.toContain('Flytta');
    expect(behallare!.textContent).not.toContain('Placera på kartan');
  });
  it('ett avlägg: "Vida har lagt 1 avlägg. Ligger det rätt?" och "Ja, det ligger rätt"', () => {
    montera({ vidaAvlagg: ['01-1'] });
    klicka(q('klar-rad-avlagg'));
    expect(text('klar-avlagg-fraga')).toBe('Vida har lagt 1 avlägg. Ligger det rätt?');
    expect(text('klar-avlagg-stammer')).toBe('Ja, det ligger rätt');
  });
  it('Ja = bekräftat = klart: "Avlägg ✓ · 2 från Vida" (inte "bekräftade"), Nästa blir vit, området lämnar Behöver dig', () => {
    montera({ ...VIDA });
    klicka(q('klar-rad-avlagg'));
    klicka(q('klar-avlagg-stammer'));
    expect(spion.bekrafta).toBe(1);
    expect(text('klar-avlagg-status')).toBe('Avlägg ✓ · 2 från Vida');
    expect(behallare!.textContent).not.toContain('bekräftade');
    expect(finns('klar-avlagg-stammer')).toBe(false);
    expect(vit('klar-steg-nasta')).toBe(true);
    klicka(q('klar-steg-nasta'));
    expect(kvarRader()).not.toContain('avlagg');
    expect(text('klar-status')).toBe(`${3 + HAR_DU_FRAGOR.length} kvar`);
  });
  it('Lägg till eget ber sidan placera ett (samma list nertill som för vanliga avlägg); frågan står kvar', () => {
    montera({ ...VIDA });
    klicka(q('klar-rad-avlagg'));
    klicka(q('klar-avlagg-placera'));
    expect(spion.placeraAvlagg).toBe(1);
    expect(finns('klar-avlagg-stammer')).toBe(true);
  });
  it('en rad i Behöver dig: efter frågan öppnas kortet i listan igen; ur sammanställningen: tillbaka dit (kortet visar sammanställningen när inget är kvar)', () => {
    montera({ ...VIDA }, { onGranskaAvlagg: (e) => spion.granska.push(e) });
    klicka(q('klar-rad-avlagg'));
    expect(spion.granska).toEqual([{ v: 'kort' }]);
    act(() => { rot!.unmount(); }); behallare!.remove(); spion.granska = [];
    montera({ ...KLAR, ...VIDA, vidaBekraftat: true, avlaggAntal: 0 }, { onGranskaAvlagg: (e) => spion.granska.push(e) });
    klicka(q('klar-se-avlagg'));                                            // tryck på raden = visa dem på kartan
    expect(spion.granska).toEqual([{ v: 'kort' }]);                       // kortet visar sammanställningen när inget är kvar — samma sida
  });
  it('utan Vida-avlägg visas aldrig kartläget — raden ber sidan placera ett direkt', () => {
    montera({}, { onGranskaAvlagg: (e) => spion.granska.push(e) });
    klicka(q('klar-rad-avlagg'));
    expect(spion.granska.length).toBe(0);
    expect(spion.placeraAvlagg).toBe(1);
  });
  it('SE-raden heter alltid "Avlägg · …": "2 från Vida", "eget", "2 från Vida + 1 eget"; kvar: "2 från Vida – bekräfta" / "saknas"', () => {
    montera({ ...KLAR, ...VIDA, vidaBekraftat: true, avlaggAntal: 0 });
    expect(text('klar-se-avlagg')).toBe('Avlägg · 2 från Vida');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...KLAR, ...VIDA, vidaBekraftat: true, avlaggAntal: 1 });
    expect(text('klar-se-avlagg')).toBe('Avlägg · 2 från Vida + 1 eget');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...KLAR });                                                   // bara ett eget
    expect(text('klar-se-avlagg')).toBe('Avlägg · eget');
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...KLAR, ...VIDA, avlaggAntal: 0 });
    klicka(q('klar-se-oppna'));
    expect(text('klar-se-avlagg')).toBe('Avlägg · 2 från Vida – bekräfta');
    expect(Array.from(q('klar-se-avlagg')!.querySelectorAll('span')).some((e) => e.style.color === farg(FARG.orange))).toBe(true);
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...KLAR, avlaggAntal: 0 });
    klicka(q('klar-se-oppna'));
    expect(text('klar-se-avlagg')).toBe('Avlägg · saknas');
  });
  it('inga Vida-avlägg: raden säger "Placera"', () => {
    montera({});
    expect(text('klar-rad-avlagg-varde')).toBe('Placera');
  });
});

describe('maskinerna står bara under Prognos', () => {
  it('SE har ingen maskinrad under Förutsättningar (ingen "Giant · Elefant 26")', () => {
    montera(KLAR);
    expect(finns('klar-se-maskiner')).toBe(false);
    expect(q('klar-se-forutsattningar')!.textContent).not.toContain('Rottne H8E · Ponsse Elephant King AF');
    expect(text('klar-se-prognos-skordare')).toContain('Rottne H8E');         // maskinen står under Prognos
  });
  it('byte av maskin går via Prognos-steget ("Byt maskin") när det öppnats ur sammanställningen', () => {
    montera({ ...BARA_PROGNOS });
    klicka(q('klar-se-oppna'));
    klicka(q('klar-se-prognos-skordare'));
    expect(finns('klar-byt-maskin')).toBe(true);
    klicka(q('klar-byt-maskin'));
    expect(rubrik()).toBe('Maskiner');
    klicka(q('klar-skordare-maskin-PONS20SDJAA270231'));
    expect(spion.patchar.at(-1)).toEqual({ skordare: EGEN('PONS20SDJAA270231') });
    klicka(q('klar-steg-nasta'));
    expect(finns('klar-se')).toBe(true);                                    // tillbaka i sammanställningen
  });
});

describe('SE: en sida som ett ifyllt A4', () => {
  it('"N klara" → sektionerna Prognos · Förutsättningar · Har du … · Markägare & övrigt; "‹ Till det som är kvar" tillbaka', () => {
    montera({});
    klicka(q('klar-se-oppna'));
    for (const id of ['prognos', 'forutsattningar', 'hardu', 'ovrigt']) expect(finns(`klar-se-${id}`), id).toBe(true);
    expect(finns('klar-ga-igenom')).toBe(false);                            // inga steg att gå igenom
    klicka(q('klar-se-tillbaka'));
    expect(finns('klar-behover')).toBe(true);
  });
  it('allt klart: rubriken "Redo att skicka", åtgärd · areal · volym under, ingen "Gå igenom", Klar för maskin är grön', () => {
    montera(KLAR);
    expect(text('klar-status')).toBe('Redo att skicka');
    expect(text('klar-fakta')).toBe(`Slutavverkning · Rp · 3,6 ha · ${(1800).toLocaleString('sv-SE')} m³fub`);
    expect(finns('klar-ga-igenom')).toBe(false);
    expect(finns('klar-behover')).toBe(false);
    expect(q('klar-for-maskin')!.getAttribute('data-klar')).toBe('1');
  });
  it('Prognos: "Stämmer ✓ Martin 17/10" och en rad per maskin med namn, G15-tim och m³fub/G15', () => {
    montera(KLAR);
    expect(text('klar-se-prognos-hoger')).toBe('Stämmer ✓ Martin 17/10');
    expect(text('klar-se-prognos-skordare')).toContain('Rottne H8E');
    expect(utanMellanrum(text('klar-se-prognos-skordare'))).toContain('Skördare · 41 G15-tim · 44 m³fub/G15');
    expect(utanMellanrum(text('klar-se-prognos-skotare'))).toContain('Skotare · 36 G15-tim · 50 m³fub/G15');
  });
  it('Förutsättningar: bärighet, terräng och avstånd i tre kolumner, avlägg och basväg (maskinerna står under Prognos)', () => {
    montera({ ...KLAR, basvagSammanfattning: '5 st · 599 m' });
    const rad = text('klar-se-forutsattningar-rad');
    expect(rad).toContain('Bra');
    expect(rad).toContain('Flack');
    expect(rad).toContain('Medel');
    expect(text('klar-se-avlagg')).toBe('Avlägg · eget');
    expect(text('klar-se-basvag')).toContain('5 st · 599 m');
  });
  it('Har du …: sju svar i två kolumner med ✓; obesvarad står som "Obesvarad" i orange', () => {
    montera(KLAR);
    for (const f of HAR_DU_FRAGOR) {
      expect(q(`klar-se-fraga-${f.id}`)!.getAttribute('data-besvarad'), f.id).toBe('1');
      expect(text(`klar-se-fraga-${f.id}`), f.id).toContain('✓');
    }
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...KLAR, harDu: sattHarDu({}, 'gransar', 'ja', 'm1', 'T') });
    klicka(q('klar-se-oppna'));
    expect(text('klar-se-fraga-naturvarden')).toContain('Obesvarad');
    expect(text('klar-se-hardu-hoger')).toMatch(new RegExp(`^1 av ${HAR_DU_FRAGOR.length}`));
  });
  it('ett tryck på en sektion öppnar samma steg för att ändra — och efteråt är man tillbaka i sammanställningen', () => {
    montera(KLAR);
    klicka(q('klar-se-forutsattningar-rad'));
    expect(rubrik()).toBe('Förutsättningar');
    expect(text('klar-steg-nasta')).toBe('Klar');
    klicka(q('klar-barighet-medel'));
    expect(spion.patchar.at(-1)).toEqual({ barighet: 'medel' });
    klicka(q('klar-steg-nasta'));
    expect(finns('klar-se')).toBe(true);
    expect(text('klar-se-forutsattningar-rad')).toContain('Medel');
  });
  it('‹ traktnamn i ett steg som öppnats ur sammanställningen leder tillbaka dit, inte till uppgiftslistan', () => {
    montera({});
    klicka(q('klar-se-oppna'));
    klicka(q('klar-se-forutsattningar-rad'));
    klicka(q('klar-steg-tillbaka'));
    expect(finns('klar-se')).toBe(true);
  });
  it('en besvarad fråga öppnar BARA den frågan (ingen bläddring genom de andra), och svaret leder tillbaka', () => {
    montera(KLAR);
    klicka(q('klar-se-fraga-ledningar'));
    expect(rubrik()).toBe(HAR_DU_FRAGOR.find((f) => f.id === 'ledningar')!.fraga);
    expect(finns('klar-steg-framsteg')).toBe(false);
    expect(finns('klar-steg-hoppa')).toBe(false);
    klicka(q('klar-fraga-ledningar-nej'));
    expect(finns('klar-se')).toBe(true);
    expect(q('klar-se-fraga-ledningar')!.textContent).toContain(HAR_DU_FRAGOR.find((f) => f.id === 'ledningar')!.nej);
  });
  it('Markägare & övrigt: "Inga avvikelser" tills något avviker; sektionen öppnar steget med växlarna', () => {
    montera(KLAR);
    expect(text('klar-se-ovrigt-hoger')).toBe('Inga avvikelser');
    tillOvrigt();
    expect(rubrik()).toBe('Markägare & övrigt');
    klicka(q('klar-ovrigt-breddat-vaxla'));
    expect(spion.patchar.at(-1)).toEqual({ breddat: true });
  });
  it('Klar för maskin kan tryckas ur sammanställningen även när något är kvar (spärrar aldrig)', () => {
    montera({});
    klicka(q('klar-se-oppna'));
    klicka(q('klar-for-maskin'));
    expect(spion.klarForMaskin).toBe(1);
  });
});

describe('planerad trakt', () => {
  it('klar för maskin och inget kvar: "Klar för maskin ✓" i grönt, sammanställningen, ingen knapp', () => {
    montera({ ...KLAR, objektStatus: 'planerad' });
    expect(text('klar-status')).toBe('Klar för maskin ✓');
    expect(q('klar-status')!.style.color).toBe(farg(FARG.gron));
    expect(finns('klar-se')).toBe(true);
    expect(finns('klar-for-maskin')).toBe(false);
    expect(finns('klar-ga-igenom')).toBe(false);
  });
  it('något nytt kvar efter att trakten skickats: Kvar-listan med den raden + "· 1 kvar" i rubriken', () => {
    montera({ ...KLAR, objektStatus: 'planerad', harDu: sattHarDu(ALLA_SVAR() ?? {}, 'gransar', 'ja', 'm1', 'T') });   // samma svar igen tar tillbaka det → en fråga obesvarad
    expect(text('klar-status')).toContain('Klar för maskin ✓');
    expect(q('klar-status')!.parentElement!.textContent).toContain('· 1 kvar');
    expect(kvarRader()).toEqual(['fraga-gransar']);
    klicka(q('klar-fraga-gransar-ja'));
    expect(finns('klar-se')).toBe(true);                                    // inget kvar → sammanställningen
  });
});

describe('prognosen utanför liknande trakter: prestationen orange + en rad, Stämmer går alltid', () => {
  const tillPrognos = (f: KlarFixtur) => { montera({ ...BARA_PROGNOS, ...f }); klicka(q('klar-rad-prognos')); };
  it('inom intervallet (förslaget, och gränserna 38 och 45) ger ingen varning', () => {
    tillPrognos({});
    expect(finns('klar-skordare-varning')).toBe(false);
    expect(q('klar-skordare-prestation')!.style.color).not.toBe(orange());
    skriva('skordartimmar', '38'); expect(finns('klar-skordare-varning')).toBe(false);
    skriva('skordartimmar', '45'); expect(finns('klar-skordare-varning')).toBe(false);
  });
  it('fler timmar än intervallet: prestationen orange och "Lågt – liknande trakter 40–47 m³fub/G15" under raden; Stämmer är aktiv', () => {
    tillPrognos({});
    skriva('skordartimmar', '60');
    expect(q('klar-skordare-prestation')!.style.color).toBe(orange());
    expect(text('klar-skordare-varning')).toBe('Lågt – liknande trakter 40–47 m³fub/G15');
    expect(q('klar-skordare-varning')!.style.color).toBe(orange());
    expect(q('klar-stammer')!.hasAttribute('disabled')).toBe(false);
    expect(finns('klar-skotare-varning')).toBe(false);                      // bara den rad som ligger utanför
    expect(q('klar-skotare-prestation')!.style.color).not.toBe(orange());
  });
  it('färre timmar än intervallet: "Högt – liknande trakter …"', () => {
    tillPrognos({});
    skriva('skordartimmar', '30');
    expect(text('klar-skordare-varning')).toBe('Högt – liknande trakter 40–47 m³fub/G15');
  });
  it('varningen står under sin egen maskin (skotare: 30–44 tim → 41–60 m³fub/G15)', () => {
    tillPrognos({});
    skriva('skotartimmar', '60');
    expect(text('klar-skotare-varning')).toBe('Lågt – liknande trakter 41–60 m³fub/G15');
    expect(q('klar-skotare-tid')!.contains(q('klar-skotare-varning'))).toBe(true);
    expect(finns('klar-skordare-varning')).toBe(false);
  });
  it('syns tills siffran är inom intervallet igen', () => {
    tillPrognos({});
    skriva('skordartimmar', '60');
    expect(finns('klar-skordare-varning')).toBe(true);
    skriva('skordartimmar', '44');
    expect(finns('klar-skordare-varning')).toBe(false);
    expect(q('klar-skordare-prestation')!.style.color).not.toBe(orange());
  });
  it('tills någon tryckt Stämmer efter varningen — och kommer tillbaka om siffran ändras igen', () => {
    tillPrognos({});
    skriva('skordartimmar', '60');
    expect(finns('klar-skordare-varning')).toBe(true);
    klicka(q('klar-stammer'));
    expect(spion.stammer).toBe(1);
    klicka(q('klar-se-prognos-skordare'));                                  // tillbaka in i prognosen ur sammanställningen
    expect(finns('klar-skordare-varning')).toBe(false);
    expect(q('klar-skordare-prestation')!.style.color).not.toBe(orange());
    skriva('skordartimmar', '70');                                          // underlaget ändrat → godkännandet gäller inte längre
    expect(text('klar-skordare-varning')).toContain('Lågt – liknande trakter');
  });
  it('ingen varning när förslag saknas (inget intervall att jämföra mot), hur extremt talet än är', () => {
    tillPrognos({ utanForslag: true, skordareTimmar: 200, skotareTimmar: 5 });
    expect(finns('klar-skordare-varning')).toBe(false);
    expect(finns('klar-skotare-varning')).toBe(false);
    expect(q('klar-skordare-prestation')!.style.color).not.toBe(orange());
  });
  it('ingen varning för extern utförare (inga timmar att bedöma)', () => {
    tillPrognos({ skordare: EXTERN('Max Skog') });
    expect(finns('klar-skordare-varning')).toBe(false);
  });
  it('varningen räknas inte som "kvar" och ändrar inte rubriken', () => {
    montera(BARA_PROGNOS);
    const fore = text('klar-status');
    klicka(q('klar-rad-prognos'));
    skriva('skordartimmar', '70');
    klicka(q('klar-steg-tillbaka'));
    expect(text('klar-status')).toBe(fore);
  });
});

describe('prognosen: medelstam saknas ≠ kan inte godkännas', () => {
  it('Stämmer är aktiv med snitt över alla trakter, och under tabellen står vad förslaget bygger på', () => {
    montera({ ...BARA_PROGNOS, medelstam: null });
    expect(kvarRader()).toEqual(['medelstam', 'prognos']);
    klicka(q('klar-rad-prognos'));
    expect(q('klar-stammer')!.hasAttribute('disabled')).toBe(false);
    expect(text('klar-prognos-snitt')).toBe('Snitt över alla slutavverkningar – blir säkrare med medelstam');
  });
  it('extern på båda: "Extern utförare på båda — inget att prognostisera", aldrig kvar', () => {
    montera({ ...KLAR, skordare: EXTERN('A'), skotare: EXTERN('B'), godkand: false });
    expect(finns('klar-behover')).toBe(false);                              // inget kvar → sammanställningen
    expect(text('klar-se-prognos-hoger')).toBe('Extern utförare');
    expect(text('klar-se-prognos')).toContain('Extern utförare på båda — inget att prognostisera');
  });
});

describe('svenskt talformat: decimalkomma överallt i kortet', () => {
  it('areal "2.75" (text med punkt, som sidan håller den) visas som "2,75 ha" i prognosen och som "2,75" i fältet', () => {
    montera({ ...BARA_PROGNOS, areal: 2.75 });
    klicka(q('klar-rad-prognos'));
    expect(text('klar-cell-areal')).toBe('2,75 ha');
    klicka(q('klar-cell-areal'));
    expect((q('klar-areal') as HTMLInputElement).value).toBe('2,75');
  });
  it('G15-timmar med decimal visas med komma; volym med tusentalsmellanrum', () => {
    montera({ ...BARA_PROGNOS, skordareTimmar: 41.5, volym: 1734.5 });
    klicka(q('klar-rad-prognos'));
    expect(text('klar-cell-skordartimmar')).toBe('41,5');
    expect(utanMellanrum(text('klar-cell-volym'))).toContain('1 734,5');
    klicka(q('klar-cell-skordartimmar'));
    expect((q('klar-skordartimmar') as HTMLInputElement).value).toBe('41,5');
  });
  it('inga punkter som decimaltecken i något synligt tal: uppgiftslistan, prognosen eller sammanställningen', () => {
    const f: KlarFixtur = { ...BARA_PROGNOS, areal: 2.75, medelstam: 0.72, skordareTimmar: 41.5, skotareTimmar: 36.25, volym: 1734.5 };
    montera(f);
    expect(behallare!.textContent).not.toMatch(/\d\.\d/);
    klicka(q('klar-rad-prognos'));
    expect(behallare!.textContent).not.toMatch(/\d\.\d/);
    klicka(q('klar-steg-tillbaka'));
    klicka(q('klar-se-oppna'));
    expect(behallare!.textContent).not.toMatch(/\d\.\d/);
  });
});

describe('Markägare & övrigt (steget nås från sammanställningen)', () => {
  it('raderna växlar med ETT tryck; etiketten är alltid vit, bara knappen visar läget', () => {
    montera(KLAR);
    tillOvrigt();
    const rad = q('klar-ovrigt-breddat')!;
    expect(rad.getAttribute('data-avviker')).toBe('0');
    klicka(q('klar-ovrigt-breddat-vaxla'));
    expect(spion.patchar.at(-1)).toEqual({ breddat: true });
  });
  it('konfiguration (bred/smal) visas bara för Elephant King', () => {
    montera({ ...KLAR, visaKonfiguration: false });
    tillOvrigt();
    expect(finns('klar-ovrigt-konfiguration')).toBe(false);
    act(() => { rot!.unmount(); }); behallare!.remove();
    montera({ ...KLAR, visaKonfiguration: true });
    tillOvrigt();
    expect(finns('klar-ovrigt-konfiguration')).toBe(true);
  });
  it('gamla anteckningar står som en grå rad — inget raderat', () => {
    montera({ ...KLAR, gamlaAnteckningar: 'Ring Stefan.' });
    tillOvrigt();
    expect(text('klar-gamla-anteckningar')).toContain('Ring Stefan.');
  });
});

describe('alla tryckytor', () => {
  it('sidan: ≥ 44 pt (rader och Ja/Nej på raden); stegen: 60 pt på de stora knapparna', () => {
    montera({});
    const knappar = Array.from(behallare!.querySelectorAll<HTMLElement>('button'));
    for (const b of knappar) expect(px(b.style.minHeight) || 44, b.textContent ?? '').toBeGreaterThanOrEqual(44);
    expect(px(q('klar-fraga-gransar-ja')!.style.minHeight)).toBeGreaterThanOrEqual(44);
    klicka(q('klar-rad-forutsattningar'));
    expect(px(q('klar-steg-nasta')!.style.minHeight)).toBeGreaterThanOrEqual(60);
    expect(px(q('klar-steg-tillbaka')!.style.minHeight)).toBeGreaterThanOrEqual(44);
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



describe('ved', () => {
  it('raden öppnar vedvyn; val ger en sammanfattning; ‹ tillbaka visar den i kortet', () => {
    montera(KLAR);
    tillOvrigt();
    klicka(q('klar-ved-rad'));
    expect(finns('ved-innehall')).toBe(true);
    expect(text('ved-sammanfattning')).toBe('Ved: vid avlägget');   // förvalt: vid avlägget
    klicka(q('ved-langd-3m')); klicka(q('ved-sortiment-bjork')); klicka(q('ved-sortiment-lov'));
    skriv(q('ved-ovrigt') as HTMLTextAreaElement, 'vid ladan');
    expect(text('ved-sammanfattning')).toBe('Ved: 3 m · Björk, Allt löv · vid avlägget · vid ladan');
    klicka(q('ved-klar'));
    expect(finns('ved-innehall')).toBe(false);
    expect(finns('klar-del3')).toBe(true);                           // tillbaka i steget Markägare & övrigt
    expect(text('klar-ved-text')).toBe('Ved: 3 m · Björk, Allt löv · vid avlägget · vid ladan');
    expect(text('klar-ovrigt-ved')).toContain('Ja');
    klicka(q('klar-steg-nasta'));                                    // Klar → tillbaka till sammanställningen, där avvikelsen står
    expect(text('klar-se-ovrigt-rad')).toContain('3 m · Björk, Allt löv');
  });
  it('"Sätt på kartan" ber sidan att gå in i placeringsläget; utan symbol sägs det', () => {
    montera(KLAR);
    tillOvrigt();
    klicka(q('klar-ved-rad'));
    klicka(q('ved-plats-karta'));
    expect(spion.sattVed).toBe(1);
    expect(text('ved-karta-status')).toContain('Ingen symbol satt än');
  });
  it('med symbol på kartan sägs det att föraren ser den', () => {
    montera({ ...KLAR, ved: { ...VED_TOM, plats: 'karta', lat: 56.4, lng: 14.7, markeringId: 'abc' }, markagareVed: true });
    tillOvrigt();
    klicka(q('klar-ved-rad'));
    expect(text('ved-karta-status')).toContain('föraren ser den');
  });
  it('"Annan" längd öppnar ett fritt fält; "Ingen ved" slår av och går tillbaka', () => {
    montera({ ...KLAR, markagareVed: true });
    tillOvrigt();
    klicka(q('klar-ved-rad'));
    klicka(q('ved-langd-annan'));
    skriv(q('ved-langd-annan-falt') as HTMLInputElement, '2,5 m');
    expect(text('ved-sammanfattning')).toContain('2,5 m');
    klicka(q('ved-ingen'));
    expect(finns('ved-innehall')).toBe(false);
    expect(text('klar-ovrigt-ved')).toContain('Nej');
  });
});

