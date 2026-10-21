// Lagerlogiken (PR 8a): standard, sparat val, tillganglighet och texterna pa raderna som inte gar.
//
// Det som far ga sonder tyst:
//  - standarden tander nagot nytt (ett underlag dyker upp pa kartan utan att nagon bett om det),
//  - ett trasigt eller okant sparat val kastar eller tander lager,
//  - en rad som inte gar ser trasig ut (ingen forklaring) eller gar att tryckas pa,
//  - menyn star pa "av" medan lagret ar pa (knappen och menyn skriver olika varden),
//  - ett objekt UTAN hyttspar/basvag/Vida-grans visas som ett tomt lager i stallet for en forklarad gra rad.
import { describe, expect, it } from 'vitest';
import {
  GRUPP_PLAN, GRUPP_RUNDAN, LAGER_LAGRING, LAGER_NYCKLAR, LAGER_STANDARD, LAGER_TEXT,
  arBasvagPunkt, effektivaLager, lagerRader, lagerTillgangliga, lagerValTillRaw, raknaPlanVagar, sparKnapp, sparLasningUr,
  tillampaSparKnapp, tolkaLagerVal, type LagerIndata, type SparLasning,
} from './egenkontrollLager';

const FARG = { skordare: '#skordare', skotare: '#skotare' };
const OK_GRANS = { typ: 'ok' as const, gran: [[14, 56], [14.1, 56.1]] as [[number, number], [number, number]], ringar: [[[14, 56], [14.1, 56], [14.1, 56.1], [14, 56]]] as [number, number][][] };

const linje = (lineType: string, id: string) => ({ marker_id: id, data: { lineType, path: [{ x: 0, y: 0 }, { x: 5, y: 5 }] } });
const indata = (over: Partial<LagerIndata> = {}): LagerIndata => ({
  origoOk: true,
  kontextStatus: 'ok',
  planVagar: { basvagar: 2, stickvagar: 3, ikontext: 5 },
  spar: { typ: 'ok', roller: { skordare: { dagar: 4 }, skotare: { dagar: 1 } } },
  vida: OK_GRANS,
  stammarText: 'Hämtas när lagret slås på',
  rollFarg: FARG,
  ...over,
});
const rad = (i: LagerIndata, id: string) => lagerRader(i).find((r) => r.id === id)!;

describe('standarden lagger inget nytt pa kartan', () => {
  it('bara kontrollpunkter, provytor och observationer ar tanda', () => {
    const pa = LAGER_NYCKLAR.filter((k) => LAGER_STANDARD[k]);
    expect(pa).toEqual(['ekPunkter', 'ekProvytor', 'ekObservationer', 'ekNoteringar']);
  });
});

describe('sparat val (tolkaLagerVal / lagerValTillRaw)', () => {
  it('tomt, null och trasig JSON ger standarden - kastar aldrig', () => {
    for (const raw of [null, undefined, '', '{', 'inte json', 'null', '[]', '"x"', '42']) {
      expect(tolkaLagerVal(raw as string), String(raw)).toEqual(LAGER_STANDARD);
    }
  });

  it('en giltig nyckel galler; en okand nyckel kastas; ett varde som inte ar true/false gar tillbaka till standarden FOR DEN NYCKELN', () => {
    const v = tolkaLagerVal(JSON.stringify({ ekSparSkotare: true, ekPunkter: false, ekPlanVagar: 'ja', ekStammar: 1, finnsInte: true }));
    expect(v.ekSparSkotare).toBe(true);
    expect(v.ekPunkter).toBe(false);
    expect(v.ekPlanVagar).toBe(LAGER_STANDARD.ekPlanVagar);   // 'ja' ar inget varde
    expect(v.ekStammar).toBe(LAGER_STANDARD.ekStammar);       // 1 ar inget varde
    expect('finnsInte' in v).toBe(false);
  });

  it('det som sparas laser tillbaka identiskt (rundtur), och bara kanda nycklar sparas', () => {
    const val = { ...LAGER_STANDARD, ekSparSkordare: true, ekVidaGrans: true, ekPunkter: false };
    expect(tolkaLagerVal(lagerValTillRaw(val))).toEqual(val);
    expect(Object.keys(JSON.parse(lagerValTillRaw({ ...val, annat: true } as never))).sort()).toEqual([...LAGER_NYCKLAR].sort());
  });

  it('nyckeln ar per enhet och versionerad', () => {
    expect(LAGER_LAGRING).toBe('egenkontroll_lager_v1');
  });
});

describe('raknaPlanVagar', () => {
  it('basvagar och stickvagar i kontexten, plus kontrollpunkternas basvagar; ikontext = bara det som ligger i den nedtonade kontexten', () => {
    const kontext = [linje('mainRoad', 'a'), linje('mainRoad', 'b'), linje('sideRoadRed', 'c'), linje('sideRoadBlue', 'd'), linje('boundary', 'e'), linje('ditch', 'f')];
    const punkter = [
      { markering_marker_id: 'a', punkt_typ: 'mainRoad' },     // basvag 'a' ar OCKSA kontrollpunkt -> ritas pa full styrka redan, ar inte kontext
      { markering_marker_id: null, punkt_typ: 'wet' },
    ];
    // a ar kontrollpunkt (raknas som basvag via punkten), b ar kontext. Stickvagar: 2. Traktgrans/dike ar inga vagar.
    expect(raknaPlanVagar(kontext, punkter)).toEqual({ basvagar: 2, stickvagar: 2, ikontext: 3 });
  });

  it('en markering utan giltig linje raknas inte (den ritas inte heller)', () => {
    const kontext = [{ marker_id: 'x', data: { lineType: 'mainRoad', path: [{ x: 1, y: 1 }] } }, { marker_id: 'y', data: null }, { marker_id: 'z', data: { lineType: 'mainRoad' } }];
    expect(raknaPlanVagar(kontext as never, [])).toEqual({ basvagar: 0, stickvagar: 0, ikontext: 0 });
  });
});

describe('sparLasningUr', () => {
  it('roller med linjer far dagar; roller utan linjer finns inte; saknat dagantal ger 1', () => {
    const l = sparLasningUr([{ roll: 'skotare', linjer: [[1]], dagar: 3 }, { roll: 'skordare', linjer: [] }]);
    expect(l).toEqual({ typ: 'ok', roller: { skotare: { dagar: 3 } } });
    expect(sparLasningUr([{ roll: 'skordare', linjer: [[1]] }])).toEqual({ typ: 'ok', roller: { skordare: { dagar: 1 } } });
    expect(sparLasningUr([])).toEqual({ typ: 'ok', roller: {} });
  });
});

describe('raderna i menyn', () => {
  it('ordning och grupper: det rundan handlar om forst, sedan Plan och korning', () => {
    const r = lagerRader(indata());
    expect(r.map((x) => x.id)).toEqual(['ekPunkter', 'ekProvytor', 'ekObservationer', 'ekNoteringar', 'ekPlanVagar', 'ekSparSkordare', 'ekSparSkotare', 'ekVidaGrans', 'ekStammar']);
    expect(r.slice(0, 4).every((x) => x.grupp === GRUPP_RUNDAN)).toBe(true);
    expect(r.slice(4).every((x) => x.grupp === GRUPP_PLAN)).toBe(true);
  });

  it('ett objekt med allt: inga rader ar avstangda, spar-raderna har rollfarg och dagar', () => {
    const r = lagerRader(indata());
    expect(r.filter((x) => x.avstangd)).toEqual([]);
    expect(rad(indata(), 'ekSparSkordare')).toMatchObject({ namn: 'Hyttspår · skördare', beskrivning: '4 dagar', farg: FARG.skordare });
    expect(rad(indata(), 'ekSparSkotare')).toMatchObject({ namn: 'Hyttspår · skotare', beskrivning: '1 dag', farg: FARG.skotare });
    expect(rad(indata(), 'ekPlanVagar').beskrivning).toBe('2 basvägar · 3 stickvägar – ritas utan nedtoning');
  });

  describe('PLANENS VAGAR', () => {
    it('origot ar inte betrott: EXAKT Martins mening - och den gar fore allt annat', () => {
      for (const kontextStatus of ['ok', 'laddar', 'fel'] as const) {
        const r = rad(indata({ origoOk: false, kontextStatus }), 'ekPlanVagar');
        expect(r.avstangd).toBe(true);
        expect(r.beskrivning).toBe('Basvägen går inte att placera säkert på kartan');
      }
    });

    it('laddar och fel sager det; inget att lyfta sager varfor (redan full styrka som kontrollpunkt, eller ingen basvag alls)', () => {
      expect(rad(indata({ kontextStatus: 'laddar' }), 'ekPlanVagar')).toMatchObject({ avstangd: true, beskrivning: LAGER_TEXT.planLaddar });
      expect(rad(indata({ kontextStatus: 'fel' }), 'ekPlanVagar')).toMatchObject({ avstangd: true, beskrivning: LAGER_TEXT.planFel });
      // Ulfsnas: basvagarna ar kontrollpunkter (full styrka redan), inget ligger i den nedtonade kontexten.
      expect(rad(indata({ planVagar: { basvagar: 4, stickvagar: 0, ikontext: 0 } }), 'ekPlanVagar')).toMatchObject({ avstangd: true, beskrivning: LAGER_TEXT.planRedanFull });
      expect(rad(indata({ planVagar: { basvagar: 0, stickvagar: 0, ikontext: 0 } }), 'ekPlanVagar')).toMatchObject({ avstangd: true, beskrivning: LAGER_TEXT.planIngen });
    });

    it('bara basvagar, eller bara stickvagar: texten nämner bara det som finns', () => {
      expect(rad(indata({ planVagar: { basvagar: 1, stickvagar: 0, ikontext: 1 } }), 'ekPlanVagar').beskrivning).toBe('1 basväg – ritas utan nedtoning');
      expect(rad(indata({ planVagar: { basvagar: 0, stickvagar: 12, ikontext: 12 } }), 'ekPlanVagar').beskrivning).toBe('12 stickvägar – ritas utan nedtoning');
    });
  });

  describe('HYTTSPAR', () => {
    it('Vallust-fallet: bara skotare har spar -> skotarraden gar, skordarraden ar gra och sager varfor', () => {
      const i = indata({ spar: { typ: 'ok', roller: { skotare: { dagar: 5 } } } });
      expect(rad(i, 'ekSparSkotare').avstangd).toBeFalsy();
      expect(rad(i, 'ekSparSkotare').beskrivning).toBe('5 dagar');
      expect(rad(i, 'ekSparSkordare')).toMatchObject({ avstangd: true, beskrivning: 'Inget hyttspår från skördaren på det här objektet' });
    });

    it('Ulfsnas-fallet: inget spar alls -> EN gra rad "Hyttspar" med Martins mening, aldrig tva identiska', () => {
      const r = lagerRader(indata({ spar: { typ: 'ok', roller: {} } })).filter((x) => x.namn.startsWith('Hyttspår'));
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ namn: 'Hyttspår', avstangd: true, beskrivning: 'Inget hyttspår för det här objektet' });
    });

    it('inte begart an och laddar ar "Laser ..." (gra), fel ar ett fel med vagen vidare - aldrig "inget spar"', () => {
      for (const spar of [null, { typ: 'laddar' } as SparLasning]) {
        const r = lagerRader(indata({ spar })).filter((x) => x.namn.startsWith('Hyttspår'));
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ avstangd: true, beskrivning: LAGER_TEXT.sparLaddar });
      }
      const fel = lagerRader(indata({ spar: { typ: 'fel' } })).filter((x) => x.namn.startsWith('Hyttspår'));
      expect(fel).toHaveLength(1);
      expect(fel[0].beskrivning).toBe(LAGER_TEXT.sparFel);
      expect(fel[0].beskrivning).not.toBe(LAGER_TEXT.sparIngen);
    });
  });

  describe('VIDAS TRAKTGRANS', () => {
    it('saknas, laddar, fel och "ok men inga ytor" ger varsin forklaring (ok utan ringar = inget att rita, och det sags)', () => {
      expect(rad(indata({ vida: { typ: 'saknas' } }), 'ekVidaGrans')).toMatchObject({ avstangd: true, beskrivning: 'Vida har ingen traktgräns för det här objektet' });
      expect(rad(indata({ vida: { typ: 'laddar' } }), 'ekVidaGrans')).toMatchObject({ avstangd: true, beskrivning: LAGER_TEXT.vidaLaddar });
      expect(rad(indata({ vida: { typ: 'fel' } }), 'ekVidaGrans')).toMatchObject({ avstangd: true, beskrivning: LAGER_TEXT.vidaFel });
      expect(rad(indata({ vida: { ...OK_GRANS, ringar: [] } }), 'ekVidaGrans')).toMatchObject({ avstangd: true, beskrivning: LAGER_TEXT.vidaIngen });
      expect(rad(indata({ vida: { typ: 'ok', gran: OK_GRANS.gran } }), 'ekVidaGrans')).toMatchObject({ avstangd: true, beskrivning: LAGER_TEXT.vidaIngen });
    });

    it('flera traktdelar raknas', () => {
      const tva = [OK_GRANS.ringar![0], OK_GRANS.ringar![0]];
      expect(rad(indata({ vida: { ...OK_GRANS, ringar: tva } }), 'ekVidaGrans').beskrivning).toBe('2 traktdelar ur Vidas leverans');
      expect(rad(indata(), 'ekVidaGrans').beskrivning).toBe('Traktgränsen ur Vidas leverans');
    });
  });

  it('stammolnets text kommer utifran (raden sager sitt eget tillstand)', () => {
    expect(rad(indata({ stammarText: '2 247 stammar ur maskindatan' }), 'ekStammar').beskrivning).toBe('2 247 stammar ur maskindatan');
  });
});

describe('tillganglighet och det som ritas', () => {
  it('allt finns -> allt gar att tanda', () => {
    expect(Object.values(lagerTillgangliga(indata())).every(Boolean)).toBe(true);
  });

  it('en avstangd rad gar inte att tanda - aven om det sparade valet sager ja (valet ligger kvar for ett annat objekt)', () => {
    const i = indata({ spar: { typ: 'ok', roller: { skotare: { dagar: 2 } } }, vida: { typ: 'saknas' } });
    const till = lagerTillgangliga(i);
    expect(till).toMatchObject({ ekSparSkordare: false, ekSparSkotare: true, ekVidaGrans: false });
    const val = { ...LAGER_STANDARD, ekSparSkordare: true, ekSparSkotare: true, ekVidaGrans: true };
    expect(effektivaLager(val, till)).toMatchObject({ ekSparSkordare: false, ekSparSkotare: true, ekVidaGrans: false });
    expect(val.ekSparSkordare).toBe(true);   // valet ror vi inte
  });

  it('gemensam spar-rad (laddar/fel/inget): BADA rollerna ar otillgangliga', () => {
    for (const spar of [null, { typ: 'laddar' } as SparLasning, { typ: 'fel' } as SparLasning, { typ: 'ok', roller: {} } as SparLasning]) {
      const till = lagerTillgangliga(indata({ spar }));
      expect(till.ekSparSkordare).toBe(false);
      expect(till.ekSparSkotare).toBe(false);
    }
  });

  it('kontrollpunkter, provytor, observationer och stammar ar alltid tillgangliga', () => {
    const till = lagerTillgangliga(indata({ origoOk: false, kontextStatus: 'fel', spar: { typ: 'fel' }, vida: { typ: 'fel' } }));
    expect(till).toMatchObject({ ekPunkter: true, ekProvytor: true, ekObservationer: true, ekStammar: true, ekPlanVagar: false, ekVidaGrans: false });
  });
});

describe('knappen "Visa hyttsparet"', () => {
  it('basvag-punkter: planens basvag och utforandets risning - inget annat', () => {
    expect(arBasvagPunkt('mainRoad')).toBe(true);
    expect(arBasvagPunkt('risning_basvag')).toBe(true);
    for (const t of ['sideRoadRed', 'wet', 'grotuttag', null, undefined, '']) expect(arBasvagPunkt(t as never), String(t)).toBe(false);
  });

  it('visa -> tander sparen som finns + planens vagar; dolj -> slacker dem; allt annat i valet ror den inte', () => {
    const i = indata({ spar: { typ: 'ok', roller: { skotare: { dagar: 5 } } } });
    const start = { ...LAGER_STANDARD, ekStammar: true, ekPunkter: false };
    expect(sparKnapp(i, start)).toEqual({ typ: 'visa', etikett: 'Visa hyttspåret' });
    const pa = tillampaSparKnapp(i, start);
    expect(pa).toMatchObject({ ekSparSkotare: true, ekPlanVagar: true, ekStammar: true, ekPunkter: false });
    expect(pa.ekSparSkordare).toBe(false);   // skordaren har inget spar: knappen rör inte den
    expect(sparKnapp(i, pa)).toEqual({ typ: 'dolj', etikett: 'Dölj hyttspåret' });
    const av = tillampaSparKnapp(i, pa);
    expect(av).toMatchObject({ ekSparSkotare: false, ekPlanVagar: false, ekStammar: true, ekPunkter: false });
    expect(sparKnapp(i, av).typ).toBe('visa');
  });

  it('MENYN LJUGER ALDRIG: det menyn visar som "pa" ar exakt det som ritas - for varje scenario och varje val, och en rad som inte finns ritar inget', () => {
    const scenarier: LagerIndata[] = [
      indata(),
      indata({ spar: { typ: 'ok', roller: { skordare: { dagar: 2 } } } }),
      indata({ planVagar: { basvagar: 4, stickvagar: 0, ikontext: 0 }, spar: { typ: 'ok', roller: { skotare: { dagar: 1 } } } }),
      indata({ origoOk: false, spar: { typ: 'ok', roller: { skordare: { dagar: 1 }, skotare: { dagar: 1 } } } }),
      indata({ spar: null }),
      indata({ spar: { typ: 'laddar' } }),
      indata({ spar: { typ: 'fel' }, vida: { typ: 'saknas' }, kontextStatus: 'fel' }),
    ];
    const allaPa = Object.fromEntries(LAGER_NYCKLAR.map((k) => [k, true])) as Record<string, boolean>;
    for (const i of scenarier) {
      const rader = lagerRader(i);
      const till = lagerTillgangliga(i);
      const val = [LAGER_STANDARD as Record<string, boolean>, allaPa, tillampaSparKnapp(i, { ...LAGER_STANDARD })];
      for (const v of val) {
        const ritas = effektivaLager(v, till);
        for (const k of LAGER_NYCKLAR) {
          const r = rader.find((x) => x.id === k);
          const menyVisarPa = !!r && !r.avstangd && v[k] === true;
          expect(ritas[k], `${k} (${JSON.stringify(i.spar)})`).toBe(menyVisarPa);
        }
      }
    }
  });

  it('inget spar -> en dampad text i stallet for en knapp, och trycket andrar ingenting; fel -> "kunde inte lasas"', () => {
    const inget = indata({ spar: { typ: 'ok', roller: {} } });
    expect(sparKnapp(inget, LAGER_STANDARD)).toEqual({ typ: 'ingen', etikett: 'Inget hyttspår' });
    expect(tillampaSparKnapp(inget, LAGER_STANDARD)).toBe(LAGER_STANDARD);
    expect(sparKnapp(indata({ spar: { typ: 'fel' } }), LAGER_STANDARD)).toEqual({ typ: 'ingen', etikett: 'Spåret kunde inte läsas' });
  });

  it('okant (laddar/inte begart) ar en vanlig knapp - trycket tander bada rollerna och kartan ritar de som finns nar sparet kommit', () => {
    for (const spar of [null, { typ: 'laddar' } as SparLasning]) {
      const i = indata({ spar });
      expect(sparKnapp(i, LAGER_STANDARD).typ).toBe('visa');
      expect(tillampaSparKnapp(i, LAGER_STANDARD)).toMatchObject({ ekSparSkordare: true, ekSparSkotare: true });
    }
  });

  it('spåren tända i menyn men planens vagar inte lyfta: knappen sager "Visa" (allt ar inte pa) och trycket lyfter planens vagar', () => {
    const i = indata();
    const delvis = { ...LAGER_STANDARD, ekSparSkordare: true, ekSparSkotare: true, ekPlanVagar: false };
    expect(sparKnapp(i, delvis).typ).toBe('visa');
    expect(tillampaSparKnapp(i, delvis).ekPlanVagar).toBe(true);
  });

  it('planens vagar kan inte lyftas (Ulfsnas: redan full styrka): knappen tander bara sparen och star pa "dolj" utan att planraden spelar in', () => {
    const i = indata({ planVagar: { basvagar: 4, stickvagar: 0, ikontext: 0 }, spar: { typ: 'ok', roller: { skordare: { dagar: 1 } } } });
    const pa = tillampaSparKnapp(i, LAGER_STANDARD);
    expect(pa.ekPlanVagar).toBe(false);
    expect(sparKnapp(i, pa).typ).toBe('dolj');
  });
});
