import { describe, it, expect } from 'vitest';
import { andraRad, atgardRader, avgorandeMatt, fonsterText, kalibreringsDom, kravRader, langdRad, profilNamn, startMaskin, stortTal, tradslagStod, atgardDetalj } from './laget';
import { LANGD_MATT, MATT } from './ordlista';
import type { AlleMaskin, AtgardPost, BedomningResp, KravRow, VariabelStat } from './typer';

const VIDA: KravRow[] = [
  { variabel: 'diameter', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 4, mal: 85, golv: 75, enhet: '%', larm_min_matt: 150 },
  { variabel: 'diameter', metrik: 'systematisk', riktning: 'lag_bra', tolerans: null, mal: 1.0, golv: 1.5, enhet: 'mm', larm_min_matt: null },
  { variabel: 'diameter', metrik: 'standardavv', riktning: 'lag_bra', tolerans: null, mal: 3.5, golv: 4.5, enhet: 'mm', larm_min_matt: null },
  { variabel: 'langd', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 2, mal: 100, golv: 95, enhet: '%', larm_min_matt: 40 },
];
const stat = (o: Partial<VariabelStat> = {}): VariabelStat => ({ n: 500, traffPct: 90, systematisk: 0.2, standardavv: 3, grovPct: null, tolerans: 4, grovTolerans: null, ...o });
const bed = (o: Partial<BedomningResp> = {}): BedomningResp => ({
  ok: true, maskin_id: 'M', profil: 'VIDA', fonster: { fran: '2026-07-23', till: '2026-10-21', dagar: 90 },
  diameter: stat(), langd: stat({ n: 120, traffPct: 100, tolerans: 2, systematisk: null, standardavv: null }), trosklar: VIDA, ...o,
});

describe('domen — ETT ord för "är vi godkända?"', () => {
  it('alla mått över målet → Godkänd, i profilens namn', () => {
    expect(kalibreringsDom(bed())).toMatchObject({ status: 'godkand', titel: 'Godkänd', rad: 'Mäter inom Vidas krav.', avvikelse: false });
  });
  it('orange (över golvet, under målet) är godkänt — men raden säger att målet inte nåtts', () => {
    // Giants verkliga VIDA-tal: 77 % / +0,81 / 4,07
    const d = kalibreringsDom(bed({ diameter: stat({ n: 1113, traffPct: 77, systematisk: 0.81, standardavv: 4.07 }) }));
    expect(d).toMatchObject({ status: 'godkand', titel: 'Godkänd', avvikelse: false });
    expect(d.rad).toBe('Över kravet, men under Vidas mål.');
  });
  it('diametern under golvet → Under kravet, med varningsikon', () => {
    const d = kalibreringsDom(bed({ diameter: stat({ traffPct: 60 }) }));
    expect(d).toMatchObject({ status: 'under', titel: 'Under kravet', avvikelse: true, rad: 'Diametern ligger under Vidas krav.' });
  });
  it('längden under golvet räknas med, och båda nämns', () => {
    expect(kalibreringsDom(bed({ langd: stat({ n: 120, traffPct: 80, tolerans: 2 }) })).rad).toBe('Längden ligger under Vidas krav.');
    expect(kalibreringsDom(bed({ diameter: stat({ traffPct: 60 }), langd: stat({ n: 120, traffPct: 80, tolerans: 2 }) })).rad).toBe('Diametern och längden ligger under Vidas krav.');
  });
  it('längd med för få mått dömer inte (larmTyst), diametern avgör', () => {
    expect(kalibreringsDom(bed({ langd: stat({ n: 10, traffPct: 10, tolerans: 2 }) })).status).toBe('godkand');
  });
  it('för få diametermått → För få mätningar, aldrig en dom på tunt underlag', () => {
    const d = kalibreringsDom(bed({ diameter: stat({ n: 90, traffPct: 10 }) }));
    expect(d).toMatchObject({ status: 'for_fa', titel: 'För få mätningar', avvikelse: false });
    expect(d.rad).toBe('90 mått i perioden — minst 150 behövs för en dom.');
  });
  it('inga kontroller alls → För få mätningar', () => {
    expect(kalibreringsDom(bed({ fonster: null, diameter: null, langd: null }))).toMatchObject({ status: 'for_fa', rad: 'Inga kontroller ännu.' });
  });
  it('maskin utan kravprofil → Ingen kravprofil (ingen dom går att ställa)', () => {
    expect(kalibreringsDom(bed({ profil: null, trosklar: [] }))).toMatchObject({ status: 'ingen_profil', titel: 'Ingen kravprofil' });
    expect(kalibreringsDom(bed({ trosklar: [] })).status).toBe('ingen_profil');
  });
  it('Biometria: samma dom, andra namnet', () => {
    const BIO: KravRow[] = [{ variabel: 'diameter', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 4, mal: 55, golv: 55, enhet: '%', larm_min_matt: 150 }];
    expect(kalibreringsDom(bed({ profil: 'BIOMETRIA', trosklar: BIO, diameter: stat({ traffPct: 40 }) })).rad).toBe('Diametern ligger under Biometrias krav.');
  });
  it('profilnamn: VIDA → Vida', () => { expect(profilNamn('VIDA')).toBe('Vida'); expect(profilNamn(null)).toBe('profilens'); });
});

describe('fönster, stort tal och längd', () => {
  it('fönstertexten: profil · dagar · från – till', () => {
    expect(fonsterText(bed())).toBe('Vida · 90 dagar · 23 juli – 21 okt');
    expect(fonsterText(bed({ fonster: null }))).toBe('Vida');
    expect(fonsterText(bed({ profil: null }))).toBe('Ingen kravprofil · 90 dagar · 23 juli – 21 okt');
  });
  it('det stora talet är diameterns träffprocent, avrundad, och dämpat när underlaget är för tunt', () => {
    expect(stortTal(bed({ diameter: stat({ traffPct: 85.6 }) }))).toMatchObject({ varde: '86 %', tyst: false, ton: 'ok' });
    expect(stortTal(bed({ diameter: stat({ traffPct: 77 }) })).ton).toBe('hi');
    expect(stortTal(bed({ diameter: stat({ traffPct: 60 }) })).ton).toBe('hot');
    expect(stortTal(bed({ diameter: stat({ n: 50, traffPct: 60 }) }))).toMatchObject({ varde: '60 %', tyst: true, ton: 'ok' });
    expect(stortTal(bed({ diameter: null })).varde).toBe('–');
    expect(stortTal(bed()).etikett).toBe('av diametermätningarna träffar inom ±4 mm');
  });
  it('längden i en rad; saknas den finns ingen rad', () => {
    expect(langdRad(bed())).toEqual({ varde: '100 %', ton: 'ok', text: 'Längd 100 % inom ±2 cm · 120 mått' });
    expect(langdRad(bed({ langd: stat({ n: 120, traffPct: 80, tolerans: 2 }) }))?.ton).toBe('hot');
    expect(langdRad(bed({ langd: null }))).toBeNull();
  });
});

describe('Vidas krav — tre diameterrader + längden, ordlistan styr orden, samma format som "Så ligger du till"', () => {
  it('frågorna är ordlistans, inte egna varianter', () => {
    const r = kravRader(bed());
    expect(r.map(x => x.fraga)).toEqual([MATT.traffprocent.fraga, MATT.systematisk.fraga, MATT.standardavv.fraga, LANGD_MATT.fraga]);
    expect(r.map(x => x.term)).toEqual([MATT.traffprocent.term, MATT.systematisk.term, MATT.standardavv.term, LANGD_MATT.term]);
    expect(LANGD_MATT.fraga).toBe('Rätt längd?');
  });
  it('Giants tal: värde, ton, ord och krav per rad', () => {
    const r = kravRader(bed({ diameter: stat({ n: 1113, traffPct: 77, systematisk: 0.81, standardavv: 4.07 }) }));
    expect(r[0]).toMatchObject({ varde: '77 %', krav: 'krav ≥ 75 %', ton: 'hi', ord: 'under målet' });
    expect(r[1]).toMatchObject({ varde: '+0,8 mm', krav: 'krav ≤ 1,5 mm', ton: 'ok', ord: null });
    expect(r[2]).toMatchObject({ varde: '4,1 mm', krav: 'krav ≤ 4,5 mm', ton: 'hi', ord: 'under målet' });
  });
  it('under golvet: röd prick med ordet "under kravet"', () => {
    const r = kravRader(bed({ diameter: stat({ traffPct: 60 }) }));
    expect(r[0]).toMatchObject({ ton: 'hot', ord: 'under kravet' });
  });
  it('för få mått: diameterraderna tysta (ok) men värdena står kvar', () => {
    const r = kravRader(bed({ diameter: stat({ n: 50, traffPct: 60 }) }));
    expect(r.map(x => x.ton)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(r[0].varde).toBe('60 %');
  });
  it('utan data: streck, inte noll', () => {
    expect(kravRader(bed({ diameter: null })).map(x => x.varde)).toEqual(['–', '–', '–', '100 %']);
    expect(kravRader(bed({ langd: null }))[3].varde).toBe('–');
  });
});

// Scorpionens (Giants) verkliga 90-dagarstal ur prod (2026-10-21, samma som skärmbildsfixturen): diameter 77 % (n 1113), längd 93,68 % (n 285, ±2 cm).
const SCORPION = (o: Partial<BedomningResp> = {}) => bed({
  diameter: stat({ n: 1113, traffPct: 77, systematisk: 0.81, standardavv: 4.07 }),
  langd: stat({ n: 285, traffPct: 93.68, tolerans: 2, systematisk: 0.09, standardavv: 1.36 }), ...o,
});

describe('det stora talet är det mått som AVGÖR domen', () => {
  it('Scorpion: längden fäller (93,68 < 95) → längdens träff står stort, diametern under', () => {
    const b = SCORPION();
    expect(kalibreringsDom(b)).toMatchObject({ status: 'under', titel: 'Under kravet', rad: 'Längden ligger under Vidas krav.' });
    expect(avgorandeMatt(b)).toBe('langd');
    expect(stortTal(b)).toEqual({ mat: 'langd', varde: '94 %', ton: 'hot', etikett: 'av längderna inom ±2 cm', tyst: false });
    expect(andraRad(b)).toEqual({ varde: '77 %', ton: 'hi', text: 'Diameter 77 % inom ±4 mm · 1113 mått' });
  });
  it('Scorpion: fjärde kravraden "Rätt längd?" är den röda — diameterraden är bara under målet', () => {
    const r = kravRader(SCORPION());
    expect(r).toHaveLength(4);
    expect(r[3]).toMatchObject({ key: 'langd', fraga: 'Rätt längd?', varde: '94 %', krav: 'krav ≥ 95 %', ton: 'hot', ord: 'under kravet' });
    expect(r[0]).toMatchObject({ varde: '77 %', ton: 'hi', ord: 'under målet' });
    expect(r.filter(x => x.ton === 'hot').map(x => x.key)).toEqual(['langd']);
  });
  it('fäller diametern (och inte längden) → diametern stor, längden under — som förut', () => {
    const b = bed({ diameter: stat({ traffPct: 60 }) });
    expect(avgorandeMatt(b)).toBe('diameter');
    expect(stortTal(b)).toMatchObject({ mat: 'diameter', varde: '60 %', ton: 'hot' });
    expect(andraRad(b)?.text).toBe('Längd 100 % inom ±2 cm · 120 mått');
  });
  it('fäller båda → diametern (Vidas huvudmått) stor', () => {
    const b = bed({ diameter: stat({ traffPct: 60 }), langd: stat({ n: 120, traffPct: 80, tolerans: 2 }) });
    expect(avgorandeMatt(b)).toBe('diameter');
    expect(stortTal(b)).toMatchObject({ mat: 'diameter', ton: 'hot' });
  });
  it('fäller ingen → diametern stor, som i dag (även när längden är orange)', () => {
    expect(avgorandeMatt(bed())).toBe('diameter');
    expect(avgorandeMatt(SCORPION({ langd: stat({ n: 285, traffPct: 97, tolerans: 2 }) }))).toBe('diameter');
    expect(stortTal(bed()).etikett).toBe('av diametermätningarna träffar inom ±4 mm');
  });
  it('längd med för få mått fäller aldrig, och för få diametermått ger "För få mätningar" — diametern förblir stor', () => {
    expect(avgorandeMatt(bed({ langd: stat({ n: 10, traffPct: 10, tolerans: 2 }) }))).toBe('diameter');
    const tunn = SCORPION({ diameter: stat({ n: 90, traffPct: 77 }) });
    expect(kalibreringsDom(tunn).status).toBe('for_fa');
    expect(avgorandeMatt(tunn)).toBe('diameter');
  });
  it('utan längdtal finns ingen att välja: diametern, och ingen rad under', () => {
    const b = bed({ langd: null });
    expect(avgorandeMatt(b)).toBe('diameter');
    expect(andraRad(b)).toBeNull();
  });
  it('saknad tolerans: etiketten påstår inget tal', () => {
    expect(stortTal(SCORPION({ langd: stat({ n: 285, traffPct: 93.68, tolerans: null }) })).etikett).toBe('av längderna träffar rätt');
  });
  it('INVARIANT: är domen "Under kravet" är det stora talet alltid rött — skärmen ska aldrig visa ett tal som klarar kravet under en underkänd dom', () => {
    let underkanda = 0;
    for (const dia of [60, 74, 77, 90, 100]) for (const len of [50, 80, 93.7, 94.9, 95, 97, 100]) {
      const b = bed({ diameter: stat({ n: 1113, traffPct: dia }), langd: stat({ n: 300, traffPct: len, tolerans: 2 }) });
      if (kalibreringsDom(b).status !== 'under') continue;
      underkanda++;
      expect(stortTal(b).ton, `diameter ${dia} / längd ${len}`).toBe('hot');
    }
    expect(underkanda).toBeGreaterThan(10);
  });
  it('profil utan längdkrav: tre rader, ingen påhittad fjärde', () => {
    const utanLangd = VIDA.filter(t => t.variabel === 'diameter');
    expect(kravRader(bed({ trosklar: utanLangd }))).toHaveLength(3);
    expect(avgorandeMatt(SCORPION({ trosklar: utanLangd }))).toBe('diameter');
  });
});

describe('åtgärder — träff före → efter', () => {
  const fore = stat({ n: 400, traffPct: 71.2 }), efter = stat({ n: 300, traffPct: 84.4 });
  const post = (o: Partial<AtgardPost> = {}): AtgardPost => ({
    datum: '2026-07-18', text: 'Höjt trycket på knivar och hjul', kalla: 'atgard', fore, efter, forTidigt: false, nFore: 400, nEfter: 300, kalibreringarEfter: [], ...o,
  });
  it('en rad med datum, text, träff före → efter och riktning', () => {
    const [r] = atgardRader(bed({ atgarder: [post()] }));
    expect(r).toMatchObject({ datumText: '18 juli', titel: 'Höjt trycket på knivar och hjul', hoger: '71 % → 84 %', hogerUnder: '↑ 13 · bättre', riktning: 'battre' });
    expect(r.dom).not.toBeNull();
  });
  it('sämre och oförändrad', () => {
    expect(atgardRader(bed({ atgarder: [post({ efter: stat({ traffPct: 60 }) })] }))[0]).toMatchObject({ hoger: '71 % → 60 %', hogerUnder: '↓ 11 · sämre' });
    expect(atgardRader(bed({ atgarder: [post({ efter: stat({ traffPct: 71.6 }) })] }))[0]).toMatchObject({ hogerUnder: '→ oförändrad' });
  });
  it('för tidigt (under 30 mått på en sida): inga tal, bara orsaken', () => {
    const [r] = atgardRader(bed({ atgarder: [post({ fore: null, efter: null, forTidigt: true, nFore: 12, nEfter: 3 })] }));
    expect(r).toMatchObject({ hoger: 'För tidigt', hogerUnder: 'för få mått', dom: null, riktning: null });
  });
  it('nyast först, och en reparation som loggats två gånger (längd och diameter) blir en rad', () => {
    const rep = post({ datum: '2026-03-07', text: 'Reparation av mätsystem', kalla: 'reparation' });
    const r = atgardRader(bed({ atgarder: [rep, rep, post()] }));
    expect(r.map(x => x.datumText)).toEqual(['18 juli', '7 mars']);
  });
  it('saknas listan (äldre server) finns inga rader — aldrig ett fel', () => {
    expect(atgardRader(bed())).toEqual([]);
    expect(atgardRader(null)).toEqual([]);
  });
});

describe('vilken maskin vyn startar på — alltid EN, aldrig "alla"', () => {
  const m = (id: string): AlleMaskin => ({ maskin_id: id, tillverkare: null, modell: null, visningsnamn: id, aktiv_till: null });
  const maskiner = [m('GIANT'), m('H8E26'), m('H8E23')];
  const arAktiv = (id: string) => id !== 'H8E23';
  const kalib = [{ maskin_id: 'H8E26' }, { maskin_id: 'GIANT' }];
  const bas = { enhet: null, egen: null, maskiner, arAktiv, allKalib: kalib };
  it('datorns maskin går före förarens egen', () => { expect(startMaskin({ ...bas, enhet: 'GIANT', egen: 'H8E26' })).toBe('GIANT'); });
  it('annars förarens egen', () => { expect(startMaskin({ ...bas, egen: 'GIANT' })).toBe('GIANT'); });
  it('en egen maskin som inte är en kalibreringsmaskin (skotare) hoppas över', () => { expect(startMaskin({ ...bas, egen: 'SKOTARE' })).toBe('H8E26'); });
  it('en såld maskin hoppas över', () => { expect(startMaskin({ ...bas, egen: 'H8E23' })).toBe('H8E26'); });
  it('annars maskinen med den senaste kontrollen', () => { expect(startMaskin(bas)).toBe('H8E26'); });
  it('inga kontroller: första aktiva maskinen', () => { expect(startMaskin({ ...bas, allKalib: [] })).toBe('GIANT'); });
  it('maskinlistan inte läst än: bara maskiner med kontroller duger, en datorbunden skotare gör det inte', () => {
    expect(startMaskin({ ...bas, maskiner: [], enhet: 'SKOTARE' })).toBe('H8E26');
    expect(startMaskin({ ...bas, maskiner: [], enhet: 'GIANT' })).toBe('GIANT');
  });
  it('ingenting alls → null', () => { expect(startMaskin({ ...bas, maskiner: [], allKalib: [] })).toBeNull(); });
});

describe('trädslagets stödtal', () => {
  it('diameter: Drar den åt ett håll? och Flaxar den? med tecken och en decimal; längd: toleransen', () => {
    expect(tradslagStod(stat({ n: 412, systematisk: 0.26, standardavv: 3.44 }), 'diameter')).toBe('Drar den åt ett håll? +0,3 mm · Flaxar den? 3,4 mm · n 412');
    expect(tradslagStod(stat({ n: 120, tolerans: 2 }), 'langd')).toBe('inom ±2 cm · n 120');
  });
});

describe('en åtgärd i detalj — "Hjälpte åtgärden?"', () => {
  const stat2 = (o: Partial<VariabelStat>) => stat({ n: 400, ...o });
  const post = (fore: VariabelStat, efter: VariabelStat): AtgardPost => ({ datum: '2026-07-18', text: 'x', kalla: 'atgard', fore, efter, forTidigt: false, nFore: 400, nEfter: 300, kalibreringarEfter: [] });
  it('träff, rakhet och spridning före → efter med samma ord som gamla Trend', () => {
    const [r] = atgardRader(bed({ atgarder: [post(stat2({ traffPct: 71.2, systematisk: 1.4, standardavv: 4.6 }), stat2({ traffPct: 84.4, systematisk: 0.3, standardavv: 3.7 }))] }));
    const rader = atgardDetalj(r.dom!);
    expect(rader.map(x => [x.fraga, x.fore, x.efter, x.text])).toEqual([
      ['Träffar den rätt?', '71 %', '84 %', '↑ 13 · bättre'],
      ['Drar den åt ett håll?', '+1,4 mm', '+0,3 mm', '↓ 1,1 mm · rakare'],
      ['Flaxar den?', '4,6 mm', '3,7 mm', '↓ 0,9 mm · lugnare'],
    ]);
  });
  it('sämre: drar grövre / flaxar mer; oförändrat har ingen siffra', () => {
    const [r] = atgardRader(bed({ atgarder: [post(stat2({ traffPct: 80, systematisk: 0.2, standardavv: 3 }), stat2({ traffPct: 80, systematisk: 1.6, standardavv: 4.2 }))] }));
    const rader = atgardDetalj(r.dom!);
    expect(rader[0].text).toBe('→ oförändrad');
    expect(rader[1].text).toBe('↑ 1,4 mm · drar grövre');
    expect(rader[2].text).toBe('↑ 1,2 mm · flaxar mer');
  });
});
