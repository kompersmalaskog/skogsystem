import { describe, expect, it } from 'vitest';
import {
  arUnderPlanering, berakna, forarSammanfattning, harDuVarningar, HAR_DU_FRAGOR, kvarChip, kvittoMedKvar, lasHarDu, lasVed,
  medStandardMaskin, oplaneradRadText, standardMaskin, avlaggText, vidaAvlaggBekraftat, vidaAvlaggUr, lasVidaAvlagg, vidaBasvagFinns, prognosLage, prognosUnderlag, sattHarDu, utforareLage, vedSammanfattning, vedTillKolumn, VED_TOM,
  type HarDuSvar, type KlarIndata, type PrognosIndata, type UtforareVal,
} from './klarTrakt';

const NU = '2026-10-15T10:00:00.000Z';
const EGEN = (id: string): UtforareVal => ({ maskinId: id, utforare: null, externNamn: '' });
const EXTERN = (namn: string): UtforareVal => ({ maskinId: null, utforare: 'extern', externNamn: namn });
const INGEN: UtforareVal = { maskinId: null, utforare: null, externNamn: '' };

const prognos = (o: Partial<PrognosIndata> = {}): PrognosIndata => ({
  skordareTimmar: 40, skotareTimmar: 35, volym: 1800, medelstam: 0.72, areal: 3.6,
  bandSkordare: null, bandSkotare: null, breddat: false, skotningsavstand: 'medel', barighet: 'bra', terrang: 'flackt',
  basvagKravs: false, basvagTimmar: null, skordare: EGEN('R64101'), skotare: EGEN('A110148'), ...o,
});
const alla = (): HarDuSvar => { let s: HarDuSvar = {}; for (const f of HAR_DU_FRAGOR) s = sattHarDu(s, f.id, 'ja', 'm1', NU); return s; };
const indata = (o: Partial<KlarIndata> = {}): KlarIndata => ({
  avlaggAntal: 1, basvagTexter: ['Röd · 640 m'], basvagForvantad: false, basvagKravs: false, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel',
  skordare: EGEN('R64101'), skotare: EGEN('A110148'), prognos: prognos(), prognosGodkandUnderlag: prognosUnderlag(prognos()), harDu: alla(), ...o,
});

describe('berakna — vad är kvar', () => {
  it('allt ifyllt och godkänt = klar, 0 kvar', () => {
    const s = berakna(indata());
    expect(s.antalKvar).toBe(0);
    expect(s.klar).toBe(true);
    expect(s.forutsattningarKvar).toBe(0);
  });

  it('en ny trakt: antalet räknas per OMRÅDE — Förutsättningar är ett, Har du … är ett', () => {
    const s = berakna(indata({
      avlaggAntal: 0, basvagTexter: [], basvagForvantad: false, barighet: null, terrang: null, skotningsavstand: null, skordare: INGEN, skotare: INGEN, harDu: {},
      prognos: prognos({ skordare: INGEN, skotare: INGEN }), prognosGodkandUnderlag: null,
    }));
    // avlägg, Förutsättningar (3 fält), Maskiner (skördare + skotare), prognos, Har du … (6 frågor) = 5 områden — samma som stegen i "Gå igenom"
    expect(s.antalKvar).toBe(5);
    expect(s.maskinerKvar).toBe(2);
    expect(s.forutsattningarKvar).toBe(3);
    expect(s.poster.find((p) => p.id === 'basvag')?.kvar).toBe(false);   // ingen basväg väntad → "Ingen"
    expect(s.frågorKvar).toHaveLength(6);
  });

  it('Förutsättningar räknas ned ("3 att välja" → "1 kvar") men är ETT område tills alla tre är valda', () => {
    const tre = berakna(indata({ barighet: null, terrang: null, skotningsavstand: null }));
    expect([tre.forutsattningarKvar, tre.antalKvar]).toEqual([3, 1]);
    const ett = berakna(indata({ barighet: 'bra', terrang: 'flackt', skotningsavstand: null }));
    expect([ett.forutsattningarKvar, ett.antalKvar]).toEqual([1, 1]);
    const noll = berakna(indata());
    expect([noll.forutsattningarKvar, noll.antalKvar]).toEqual([0, 0]);
  });
  it('alla sex frågorna är ETT område: en obesvarad eller sex ger samma bidrag till antalet', () => {
    const harDu1 = alla(); delete harDu1.gransar;
    expect(berakna(indata({ harDu: harDu1 })).antalKvar).toBe(1);
    expect(berakna(indata({ harDu: {} })).antalKvar).toBe(1);
  });
  it('exemplet från Mölleryd: avlägg + Förutsättningar + Har du … = 3 områden (medelstam kom ur TD, prognosen godkänd)', () => {
    const s = berakna(indata({ avlaggAntal: 0, barighet: null, terrang: null, skotningsavstand: null, harDu: {} }));
    expect(s.antalKvar).toBe(3);
  });
  it('ett område som är kvar för flera fält räknas en gång: skotare + prognos + 3 frågor = 3 områden', () => {
    let harDu = alla();
    harDu = { ...harDu }; delete harDu.snitslat; delete harDu.ledningar; delete harDu.gransar;
    const p = prognos({ skotare: INGEN });
    const s = berakna(indata({ skotare: INGEN, prognos: p, prognosGodkandUnderlag: null, harDu }));
    expect(s.antalKvar).toBe(3);   // skotare, prognos, Har du …
  });

  it('TRAKT UTAN BASVÄG: "Ingen" räknas som klart — appen gissar aldrig att en basväg saknas', () => {
    const s = berakna(indata({ basvagTexter: [], basvagForvantad: false }));
    const b = s.poster.find((p) => p.id === 'basvag')!;
    expect(b.varde).toBe('Ingen');
    expect(b.kvar).toBe(false);
    expect(s.klar).toBe(true);
  });
  it('Vida har en basväg som inte är ritad → kvar; ritar man den sjunker siffran med ett', () => {
    const fore = berakna(indata({ basvagTexter: [], basvagForvantad: true }));
    expect(fore.poster.find((p) => p.id === 'basvag')).toMatchObject({ kvar: true, varde: null });
    expect(fore.antalKvar).toBe(1);
    const efter = berakna(indata({ basvagTexter: ['Blå/gul · 480 m'], basvagForvantad: true }));
    expect(efter.antalKvar).toBe(0);
    expect(efter.antalKvar).toBe(fore.antalKvar - 1);
  });
  it('vidaBasvagFinns läser traktgeometrin: bara en linje vars beskrivning nämner basväg', () => {
    expect(vidaBasvagFinns([{ properties: { _typ: 'linje', FLBESKR: 'Basväg' } }])).toBe(true);
    expect(vidaBasvagFinns([{ properties: { _typ: 'linje', FLBESKR: 'Kraftledning' } }, { properties: { _typ: 'traktgräns', FLBESKR: 'basväg' } }])).toBe(false);
    expect(vidaBasvagFinns(null)).toBe(false);
  });

  it('basvägarna listas med färg och längd, i ritad ordning', () => {
    const s = berakna(indata({ basvagTexter: ['Röd · 640 m', 'Gul · 120 m'] }));
    expect(s.poster.find((p) => p.id === 'basvag')?.varde).toBe('Röd · 640 m · Gul · 120 m');
  });

  it('avlägg saknas på kartan = kvar ("Placera ›" i kortet)', () => {
    const s = berakna(indata({ avlaggAntal: 0 }));
    expect(s.poster.find((p) => p.id === 'avlagg')).toMatchObject({ kvar: true, varde: null });
  });

  it('EXTERN SKOTARE + EXTERN SKÖRDARE → "Extern – ingen prognos", prognosen är aldrig kvar', () => {
    const s = berakna(indata({ skordare: EXTERN('Skog AB'), skotare: EXTERN('Max'), prognos: prognos({ skordare: EXTERN('Skog AB'), skotare: EXTERN('Max'), skordareTimmar: null, skotareTimmar: null }), prognosGodkandUnderlag: null }));
    expect(s.poster.find((p) => p.id === 'prognos')).toMatchObject({ varde: 'Extern – ingen prognos', kvar: false });
    expect(s.poster.find((p) => p.id === 'skotare')?.varde).toBe('Extern · Max');
    expect(s.klar).toBe(true);
  });

  it('extern utan namn är inget svar', () => {
    expect(utforareLage({ maskinId: null, utforare: 'extern', externNamn: '  ' })).toBe('saknas');
    expect(utforareLage({ maskinId: null, utforare: 'egen', externNamn: '' })).toBe('saknas');
  });

  it('ett obesvarat svar och ett besvarat: bara det obesvarade räknas', () => {
    const s = berakna(indata({ harDu: sattHarDu({}, 'gransar', 'behovs_inte', null, NU) }));
    expect(s.frågorKvar).toHaveLength(5);
    expect(s.frågorKvar).not.toContain('gransar');
  });
});

describe('prognos — "Stämmer" gäller bara för det underlag som godkändes', () => {
  const p = prognos();
  const nyckel = prognosUnderlag(p);

  it('godkänd när fingeravtrycket stämmer', () => {
    expect(prognosLage(p, nyckel)).toEqual({ lage: 'godkand' });
  });

  it.each([
    ['volym', { volym: 1900 }],
    ['medelstam', { medelstam: 0.8 }],
    ['bärighet', { barighet: 'dalig' }],
    ['terräng', { terrang: 'brant' }],
    ['skotningsavstånd', { skotningsavstand: 'langt' }],
    ['band skotare', { bandSkotare: true }],
    ['breddat lastrede', { breddat: true }],
    ['basvägsanläggning', { basvagKravs: true, basvagTimmar: 6 }],
    ['skotartimmar', { skotareTimmar: 50 }],
    ['maskinval', { skotare: EGEN('A030353') }],
  ] as Array<[string, Partial<PrognosIndata>]>)('ändrat %s → godkännandet gäller inte längre', (_namn, ändring) => {
    const lage = prognosLage(prognos(ändring), nyckel);
    expect(lage.lage).toBe('ogodkand');
  });

  it('aldrig godkänd = ogodkänd; saknad medelstam hindrar INTE (förslaget räknar snitt över alla trakter) — saknad volym eller timmar gör det', () => {
    expect(prognosLage(p, null)).toEqual({ lage: 'ogodkand', saknas: [] });
    expect(prognosLage(prognos({ medelstam: null }), null)).toEqual({ lage: 'ogodkand', saknas: [] });
    expect(prognosLage(prognos({ medelstam: null, volym: null }), null)).toEqual({ lage: 'ogodkand', saknas: ['volym'] });
    expect(prognosLage(prognos({ medelstam: null, skordareTimmar: null }), null)).toEqual({ lage: 'ogodkand', saknas: ['skördartimmar'] });
  });
  it('utan medelstam går prognosen att godkänna, och godkännandet gäller (fingeravtrycket tål null)', () => {
    const utan = prognos({ medelstam: null });
    expect(prognosLage(utan, prognosUnderlag(utan))).toEqual({ lage: 'godkand' });
    // skriver man medelstam efteråt stämmer det inte längre
    expect(prognosLage(prognos({ medelstam: 0.7 }), prognosUnderlag(utan)).lage).toBe('ogodkand');
  });

  it('tider i extern utförare spelar ingen roll för underlaget bortom namnet', () => {
    expect(prognosUnderlag(prognos({ skotare: EXTERN('Max') }))).not.toBe(nyckel);
    expect(prognosUnderlag(prognos({ skotare: { maskinId: null, utforare: 'extern', externNamn: ' Max ' } })))
      .toBe(prognosUnderlag(prognos({ skotare: EXTERN('Max') })));
  });
});

describe('Har du… — svar med vem och när', () => {
  it('sex frågor i tavlans ordning med tavlans ord', () => {
    expect(HAR_DU_FRAGOR.map((f) => f.fraga)).toEqual([
      'Markerat gränserna?', 'Märkt naturvärden?', 'Kontrollerat kulturlämningar?', 'Markerat el-ledningar?', 'Snitslat basvägen?', 'Ska avlägget huggas?',
    ]);
    expect(HAR_DU_FRAGOR.map((f) => f.nej)).toEqual(['Behövs inte', 'Inga hittade', 'Inga hittade', 'Inga finns', 'Behövs inte', 'Nej']);
  });
  it('svaret bär vem och när; samma svar igen tar tillbaka det', () => {
    const a = sattHarDu({}, 'gransar', 'ja', 'm7', NU);
    expect(a.gransar).toEqual({ svar: 'ja', av: 'm7', at: NU });
    expect(sattHarDu(a, 'gransar', 'ja', 'm7', NU).gransar).toBeUndefined();
    expect(sattHarDu(a, 'gransar', 'behovs_inte', 'm7', NU).gransar?.svar).toBe('behovs_inte');
  });
  it('lasHarDu är tolerant: skräp = obesvarat', () => {
    expect(lasHarDu(null)).toEqual({});
    expect(lasHarDu('x')).toEqual({});
    expect(lasHarDu([1])).toEqual({});
    expect(lasHarDu({ gransar: { svar: 'kanske' }, okand: { svar: 'ja' }, snitslat: { svar: 'ja', av: 5, at: NU } })).toEqual({ snitslat: { svar: 'ja', av: null, at: NU } });
  });
});

describe('varningar under frågorna', () => {
  it('fornlämning i lagret → varning under kulturfrågan; frågan ställs ändå', () => {
    const v = harDuVarningar({ markeringar: [], restriktioner: [{ type: 'fornlamning', name: 'Stensättning' }], hansynsytor: 0 });
    expect(v).toEqual([{ fraga: 'kulturlamningar', text: 'Registrerad fornlämning: Stensättning' }]);
    expect(harDuVarningar({ markeringar: [], restriktioner: [], hansynsytor: 0 })).toEqual([]);
  });
  it('nyckelbiotop och hänsynsytor → naturfrågan; el-ledning på kartan → ledningsfrågan', () => {
    const v = harDuVarningar({
      markeringar: [{ slag: 'symbol', typ: 'powerline' }, { slag: 'symbol', typ: 'powerline' }, { slag: 'symbol', typ: 'culturemonument' }],
      restriktioner: [{ type: 'nyckelbiotop', name: 'Bäcken' }], hansynsytor: 2,
    });
    expect(v.filter((x) => x.fraga === 'naturvarden').map((x) => x.text)).toEqual(['Nyckelbiotop/skyddat område registrerat: Bäcken', '2 hänsynsytor i Vidas underlag']);
    expect(v.find((x) => x.fraga === 'ledningar')?.text).toBe('2 el-ledningar markerade på kartan');
    expect(v.find((x) => x.fraga === 'kulturlamningar')?.text).toBe('1 kulturmarkering på kartan');
  });
});

describe('ved', () => {
  it('sammanfattningen i kortet och för föraren', () => {
    expect(vedSammanfattning({ ...VED_TOM, langd: '3m', sortiment: ['bjork'], ovrigt: 'vid ladan' })).toBe('Ved: 3 m · Björk · vid avlägget · vid ladan');
    expect(vedSammanfattning({ ...VED_TOM, plats: 'karta', markeringId: 'abc', langd: 'annan', langdAnnan: '2,5 m', sortiment: ['lov', 'bjork'] })).toBe('Ved: 2,5 m · Björk, Allt löv · markerad på kartan');
    expect(vedSammanfattning({ ...VED_TOM, langd: 'fallande' })).toBe('Ved: fallande · vid avlägget');
  });
  it('tomt ved säger bara att markägaren ska ha ved — inget tomt streck', () => {
    expect(vedSammanfattning({ ...VED_TOM, plats: 'karta' })).toBe('Ved: ska ha ved');
  });
  it('kolumnformen går att läsa tillbaka', () => {
    const v = { ...VED_TOM, plats: 'karta' as const, lat: 56.4, lng: 14.7, langd: '3m' as const, sortiment: ['bjork' as const], ovrigt: 'x', markeringId: 'm1' };
    expect(lasVed(vedTillKolumn(v))).toEqual(v);
    expect(lasVed(null)).toEqual(VED_TOM);
  });
});

describe('chip, listrad och kvitto', () => {
  it('"N kvar" orange, "Klar" grön, okänt = inget', () => {
    expect(kvarChip(3)).toEqual({ text: '3 kvar', ton: 'orange' });
    expect(kvarChip(3, true)).toEqual({ text: '3 kvar', ton: 'orange' });
    expect(kvarChip(0)).toEqual({ text: 'Redo att skicka', ton: 'neutral' });          // allt ifyllt men inte skickat: inte grönt
    expect(kvarChip(0, false)).toEqual({ text: 'Redo att skicka', ton: 'neutral' });
    expect(kvarChip(0, true)).toEqual({ text: 'Klar', ton: 'gron' });                  // grönt "Klar" först när klar_skickad_timestamp finns
    expect(kvarChip(null)).toBeNull();
    expect(kvarChip(undefined)).toBeNull();
  });
  it('listraden för en oplanerad trakt: tal bara när kortet beräknat det, annars ärligt', () => {
    expect(oplaneradRadText(4)).toBe('4 kvar');
    expect(oplaneradRadText(null)).toBe('Inte klarplanerad');
    expect(oplaneradRadText(0)).toBe('Redo att skicka');                                // 0 kvar: redo, inte "inte klarplanerad"
    expect(oplaneradRadText(undefined)).toBe('Inte klarplanerad');
  });
  it('kvittot får " · N kvar" bara under planeringen och när något är kvar', () => {
    expect(kvittoMedKvar('Avlägg satt', 4, true)).toBe('Avlägg satt · 4 kvar');
    expect(kvittoMedKvar('Avlägg satt', 0, true)).toBe('Avlägg satt');
    expect(kvittoMedKvar('Avlägg satt', 4, false)).toBe('Avlägg satt');
    expect(kvittoMedKvar('Avlägg satt', null, true)).toBe('Avlägg satt');
  });
  it('under planering = oplanerad eller planerad, inte pågående/avslutat', () => {
    expect(arUnderPlanering('oplanerad')).toBe(true);
    expect(arUnderPlanering('planerad')).toBe(true);
    expect(arUnderPlanering('pagaende')).toBe(false);
    expect(arUnderPlanering('avslutat')).toBe(false);
    expect(arUnderPlanering(null)).toBe(false);
  });
});

describe('förarens sammanfattning', () => {
  const bas = {
    avlaggAntal: 1, basvagTexter: ['Röd · 640 m'], basvagKravs: false, barighet: 'bra', terrang: 'kuperat', skotningsavstand: 'medel',
    bandSkordare: null, bandSkotare: true, bandParSkordare: null, bandParSkotare: '2', breddat: false, konfiguration: 'bred', risDirekt: false, extraVagn: false,
    trailerIn: true, trailerKommentar: '', manuellFallning: false, manuellFallningText: '', ved: true, vedDetaljer: VED_TOM, vedText: 'Ved: 3 m · Björk · vid avlägget', harDu: {},
  };
  it('bara det som har ett värde; aldrig "Nej" på varje rad', () => {
    const r = forarSammanfattning(bas);
    expect(r.map((x) => x.id)).toEqual(['avlagg', 'basvag', 'barighet', 'terrang', 'skotningsavstand', 'band-skotare', 'konfiguration', 'ved']);
    expect(r.find((x) => x.id === 'band-skotare')?.text).toBe('Ja · 2 par');
    expect(r.find((x) => x.id === 'ved')?.text).toBe('3 m · Björk · vid avlägget');
  });
  it('null i band = ingen rad (inte "Nej")', () => {
    expect(forarSammanfattning({ ...bas, bandSkotare: null }).some((x) => x.id.startsWith('band'))).toBe(false);
  });
  it('trailer som inte kan köra in och manuell fällning syns med sin text', () => {
    const r = forarSammanfattning({ ...bas, trailerIn: false, trailerKommentar: 'Låg bro', manuellFallning: true, manuellFallningText: 'Vid ledningen' });
    expect(r.find((x) => x.id === 'trailer')?.text).toBe('Kan inte köra in · Låg bro');
    expect(r.find((x) => x.id === 'manuell')?.text).toBe('Vid ledningen');
  });
});

describe('förval: egen maskin ur planeringen', () => {
  const GIANT = 'PONS20SDJAA270231', R64428 = 'R64428';
  it('trakten ligger i EN maskins kö → den maskinen (skördare Giant, skotare Elefant 26 för Skälviken)', () => {
    expect(standardMaskin(['A130743', GIANT], [GIANT, R64428])).toBe(GIANT);
    expect(standardMaskin(['A130743', GIANT], ['A030353', 'A130743', 'JD810E'])).toBe('A130743');
  });
  it('köer för andra roller räknas inte; ingen kö-träff + flera valbara → inget förval (appen gissar inte)', () => {
    expect(standardMaskin(['A130743'], [GIANT, R64428])).toBeNull();
    expect(standardMaskin([], [GIANT, R64428])).toBeNull();
  });
  it('ligger trakten i två köer för samma roll säger planeringen inte vilken → inget förval', () => {
    expect(standardMaskin([GIANT, R64428], [GIANT, R64428])).toBeNull();
  });
  it('bara EN valbar maskin → den, med eller utan läsbar kö (kön behövs inte för att välja mellan en)', () => {
    expect(standardMaskin([], [R64428])).toBe(R64428);
    expect(standardMaskin(null, [R64428])).toBe(R64428);
  });
  it('kön ej läst + flera valbara → inget förval; inga valbara alls → inget förval', () => {
    expect(standardMaskin(null, [GIANT, R64428])).toBeNull();
    expect(standardMaskin([GIANT], [])).toBeNull();
  });
  it('sparat svar går före förvalet; Extern (även utan namn) skrivs aldrig över; tomt får förvalet', () => {
    expect(medStandardMaskin(EGEN('R64428'), GIANT)).toEqual(EGEN('R64428'));
    expect(medStandardMaskin(EXTERN('Skog AB'), GIANT)).toEqual(EXTERN('Skog AB'));
    expect(medStandardMaskin({ maskinId: null, utforare: 'extern', externNamn: '' }, GIANT).maskinId).toBeNull();
    expect(medStandardMaskin(INGEN, GIANT)).toEqual(EGEN(GIANT));
    expect(medStandardMaskin({ maskinId: null, utforare: 'egen', externNamn: '' }, GIANT)).toEqual(EGEN(GIANT));
    expect(medStandardMaskin(INGEN, null)).toEqual(INGEN);
  });
  it('med förval är skördare och skotare inte kvar; utan förval är de det', () => {
    const med = berakna(indata({ skordare: medStandardMaskin(INGEN, GIANT), skotare: medStandardMaskin(INGEN, 'A130743') }));
    expect(med.poster.find((x) => x.id === 'skordare')!.kvar).toBe(false);
    expect(med.poster.find((x) => x.id === 'skotare')!.kvar).toBe(false);
    const utan = berakna(indata({ skordare: medStandardMaskin(INGEN, null), skotare: medStandardMaskin(INGEN, null) }));
    expect(utan.poster.find((x) => x.id === 'skordare')!.kvar).toBe(true);
    expect(utan.poster.find((x) => x.id === 'skotare')!.kvar).toBe(true);
  });
});

describe('medelstam som egen post', () => {
  it('saknas den (null/0) är posten kvar; finns den är den klar med värdet i decimalkomma', () => {
    const utan = berakna(indata({ prognos: prognos({ medelstam: null }) }));
    expect(utan.poster.find((x) => x.id === 'medelstam')).toMatchObject({ kvar: true, varde: null });
    expect(berakna(indata({ prognos: prognos({ medelstam: 0 }) })).poster.find((x) => x.id === 'medelstam')!.kvar).toBe(true);
    const med = berakna(indata({ prognos: prognos({ medelstam: 0.72 }) }));
    expect(med.poster.find((x) => x.id === 'medelstam')).toMatchObject({ kvar: false, varde: '0,72 m³fub' });
  });
  it('en trakt som är klar i övrigt men saknar medelstam har en sak kvar (och Klar för maskin spärras ändå aldrig)', () => {
    const s = berakna(indata({ prognos: prognos({ medelstam: null }), prognosGodkandUnderlag: null }));
    expect(s.poster.filter((x) => x.kvar).map((x) => x.id)).toEqual(expect.arrayContaining(['medelstam']));
    expect(s.klar).toBe(false);
  });
});

describe('Vidas avlägg (objekt_geometri, L_TILLAGGSPUNKTER)', () => {
  const punkt = (nr: string, o: Record<string, unknown> = {}) => ({ properties: { _typ: 'punkt', _lager: 'L_TILLAGGSPUNKTER', EXTRA_LABE: nr, FLBESKR: 'Avlägg', ...o }, geometry: { type: 'Point', coordinates: [14.7, 56.4] } });
  const larm = { properties: { _typ: 'punkt', _lager: 'L_TILLAGGSPUNKTER', FLBESKR: 'Larmkoordinat' }, geometry: { type: 'Point', coordinates: [14.7, 56.4] } };

  it('vidaAvlaggUr: punkterna utom larmet, i nummerordning (01-2 före 01-10), med koordinater', () => {
    const ut = vidaAvlaggUr([punkt('01-10'), larm, punkt('01-2'), punkt('01-1')]);
    expect(ut.map((a) => a.nummer)).toEqual(['01-1', '01-2', '01-10']);
    expect(ut[0]).toMatchObject({ lat: 56.4, lng: 14.7 });
  });
  it('numret saknas i EXTRA_LABE → LOPNR; saknas båda → "Avlägg N"; andra geometrier än punkter räknas inte', () => {
    expect(vidaAvlaggUr([{ properties: { _typ: 'punkt', LOPNR: '7', FLBESKR: 'Avlägg' }, geometry: null }]).map((a) => a.nummer)).toEqual(['7']);
    expect(vidaAvlaggUr([punkt('')]).map((a) => a.nummer)).toEqual(['Avlägg 1']);
    expect(vidaAvlaggUr([{ properties: { _typ: 'linje', FLBESKR: 'Basväg' } }, { properties: { _typ: 'hänsynsyta' } }, null, undefined])).toEqual([]);
    expect(vidaAvlaggUr(null)).toEqual([]);
  });
  it('lasVidaAvlagg läser bara en hel bekräftelse; resten är obekräftat (aldrig ett kast)', () => {
    expect(lasVidaAvlagg({ vida_avlagg: { nummer: ['01-1'], av: 'm1', at: NU } })).toEqual({ nummer: ['01-1'], av: 'm1', at: NU });
    for (const rent of [null, undefined, 'x', [], {}, { vida_avlagg: 'ja' }, { vida_avlagg: { nummer: 'x', at: NU } }, { vida_avlagg: { nummer: ['a'] } }]) expect(lasVidaAvlagg(rent), JSON.stringify(rent)).toBeNull();
  });
  it('bekräftelsen gäller bara exakt de avlägg som visades — nya eller färre kräver ny bekräftelse', () => {
    const bek = { nummer: ['01-2', '01-1'], av: 'm1', at: NU };
    expect(vidaAvlaggBekraftat(['01-1', '01-2'], bek)).toBe(true);
    expect(vidaAvlaggBekraftat(['01-1', '01-2', '01-3'], bek)).toBe(false);
    expect(vidaAvlaggBekraftat(['01-1'], bek)).toBe(false);
    expect(vidaAvlaggBekraftat([], bek)).toBe(false);
    expect(vidaAvlaggBekraftat(['01-1'], null)).toBe(false);
  });
  it('berakna: Vida-avlägg är kvar tills de bekräftats (eller planeraren själv placerat ett); inga Vida-avlägg = som förut', () => {
    const avl = (o: Partial<KlarIndata>) => berakna(indata({ avlaggAntal: 0, ...o })).poster.find((p) => p.id === 'avlagg')!;
    expect(avl({}).kvar).toBe(true);
    expect(avl({ vidaAvlagg: ['01-1', '01-2'] })).toMatchObject({ kvar: true, varde: null });
    expect(avl({ vidaAvlagg: ['01-1', '01-2'], vidaAvlaggBekraftat: true })).toMatchObject({ kvar: false, varde: '2 från Vida' });
    expect(avl({ vidaAvlagg: ['01-1'], avlaggAntal: 2 })).toMatchObject({ kvar: false, varde: '1 från Vida + 2 egna' });
    expect(berakna(indata({ avlaggAntal: 0, vidaAvlagg: ['01-1'] })).antalKvar).toBe(1);
    expect(berakna(indata({ avlaggAntal: 0, vidaAvlagg: ['01-1'], vidaAvlaggBekraftat: true })).antalKvar).toBe(0);
  });
  it('avlaggText: antal i ord, aldrig nummer', () => {
    expect(avlaggText(2, 0)).toBe('2 från Vida');
    expect(avlaggText(2, 1)).toBe('2 från Vida + 1 eget');
    expect(avlaggText(1, 3)).toBe('1 från Vida + 3 egna');
    expect(avlaggText(0, 1)).toBe('eget');
    expect(avlaggText(0, 2)).toBe('2 egna');
    expect(avlaggText(0, 0)).toBe('');
  });
  it('förarens sammanfattning nämner Vidas avlägg', () => {
    const rad = (o: Record<string, unknown>) => forarSammanfattning({ avlaggAntal: 0, basvagTexter: [], basvagKravs: null, barighet: null, terrang: null, skotningsavstand: null, bandSkordare: null, bandSkotare: null, bandParSkordare: null, bandParSkotare: null, breddat: false, konfiguration: null, risDirekt: false, extraVagn: false, trailerIn: true, trailerKommentar: '', manuellFallning: false, manuellFallningText: '', ved: false, vedDetaljer: VED_TOM, vedText: '', harDu: {}, ...o } as any).find((r) => r.id === 'avlagg')?.text;
    expect(rad({ vidaAvlagg: ['01-1', '01-2'] })).toBe('2 från Vida');
    expect(rad({ vidaAvlagg: ['01-1'], avlaggAntal: 1 })).toBe('1 från Vida + 1 eget');
    expect(rad({ avlaggAntal: 2 })).toBe('2 på kartan');
  });
});
