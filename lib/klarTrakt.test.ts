import { describe, expect, it } from 'vitest';
import {
  arUnderPlanering, berakna, forarSammanfattning, harDuVarningar, HAR_DU_FRAGOR, kvarChip, kvittoMedKvar, lasHarDu, lasVed,
  medStandardMaskin, oplaneradRadText, standardMaskin, vidaBasvagFinns, prognosLage, prognosUnderlag, sattHarDu, utforareLage, vedSammanfattning, vedTillKolumn, VED_TOM,
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
  it('allt ifyllt och godkänt = klar, 0 kvar, ingen kvartext', () => {
    const s = berakna(indata());
    expect(s.antalKvar).toBe(0);
    expect(s.klar).toBe(true);
    expect(s.kvarText).toBe('');
  });

  it('en ny trakt: allt orange utom basväg; sex obesvarade frågor', () => {
    const s = berakna(indata({
      avlaggAntal: 0, basvagTexter: [], basvagForvantad: false, barighet: null, terrang: null, skotningsavstand: null, skordare: INGEN, skotare: INGEN, harDu: {},
      prognos: prognos({ skordare: INGEN, skotare: INGEN }), prognosGodkandUnderlag: null,
    }));
    // avlägg, bärighet, terräng, skotningsavstånd, skördare, skotare, prognos = 7, + 6 frågor
    expect(s.antalKvar).toBe(13);
    expect(s.poster.find((p) => p.id === 'basvag')?.kvar).toBe(false);   // ingen basväg väntad → "Ingen"
    expect(s.frågorKvar).toHaveLength(6);
  });

  it('tre poster listas vid namn, fler än tre räknas bara ("4 saker · 6 frågor")', () => {
    const tre = berakna(indata({ avlaggAntal: 0, barighet: null, terrang: null, harDu: {} }));
    expect(tre.kvarText).toBe('avlägg · bärighet · terräng · 6 frågor');
    const fyra = berakna(indata({ avlaggAntal: 0, barighet: null, terrang: null, skotningsavstand: null, harDu: {} }));
    expect(fyra.kvarText).toBe('4 saker · 6 frågor');
    expect(fyra.antalKvar).toBe(10);
  });
  it('exemplet ur tavlan: "skotare · prognos · 3 frågor"', () => {
    let harDu = alla();
    harDu = { ...harDu }; delete harDu.snitslat; delete harDu.ledningar; delete harDu.gransar;
    const p = prognos({ skotare: INGEN });
    const s = berakna(indata({ skotare: INGEN, prognos: p, prognosGodkandUnderlag: null, harDu }));
    expect(s.kvarText).toBe('skotare · prognos · 3 frågor');
    expect(s.antalKvar).toBe(5);
  });

  it('en fråga kvar säger "1 fråga"', () => {
    const harDu = alla(); delete harDu.gransar;
    expect(berakna(indata({ harDu })).kvarText).toBe('1 fråga');
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
    expect(fore.kvarText).toBe('basväg');
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

  it('aldrig godkänd = ogodkänd; saknad medelstam hindrar och sägs', () => {
    expect(prognosLage(p, null)).toEqual({ lage: 'ogodkand', saknas: [] });
    expect(prognosLage(prognos({ medelstam: null }), null)).toEqual({ lage: 'ogodkand', saknas: ['medelstam'] });
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
    expect(kvarChip(0)).toEqual({ text: 'Klar', ton: 'gron' });
    expect(kvarChip(null)).toBeNull();
    expect(kvarChip(undefined)).toBeNull();
  });
  it('listraden för en oplanerad trakt: tal bara när kortet beräknat det, annars ärligt', () => {
    expect(oplaneradRadText(4)).toBe('4 kvar');
    expect(oplaneradRadText(null)).toBe('Inte klarplanerad');
    expect(oplaneradRadText(0)).toBe('Inte klarplanerad');
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
