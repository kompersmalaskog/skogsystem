import { describe, expect, it } from 'vitest';
import type { Egenkontroll, EgenkontrollFoto, EgenkontrollProvyta, EgenkontrollPunkt } from './egenkontroll';
import { besokText, byggRapport, type RapportIndata } from './egenkontrollRapport';

let raknare = 0;

function punkt(over: Partial<EgenkontrollPunkt> & { rubrik: string }): EgenkontrollPunkt {
  raknare += 1;
  return {
    id: `p${raknare}`, egenkontroll_id: 'e1', ordning: raknare, del: 'utforande', grupp: null, kalla: 'fast',
    markering_id: null, markering_marker_id: null, punkt_typ: null, antal_planerat: null,
    geometri_snapshot: null, plan_kommentar: null, status: 'bra', avvikelse_typ: null, kommentar: null,
    varde_foreslaget: null, varde_bekraftat: null, lat: null, lng: null, besvarad: '2026-10-12T08:00:00Z',
    ...over,
  } as EgenkontrollPunkt;
}

function foto(over: Partial<EgenkontrollFoto> & { id: string }): EgenkontrollFoto {
  return {
    egenkontroll_id: 'e1', punkt_id: null, provyta_id: null, sokvag: `e1/${over.id}.jpg`, tackningsgrad: null,
    lat: null, lng: null, tagen: null, skapad: `2026-10-12T09:00:0${over.id.length % 10}Z`,
    ...over,
  } as EgenkontrollFoto;
}

function observation(over: Partial<EgenkontrollPunkt>): EgenkontrollPunkt {
  return punkt({
    rubrik: 'Observation', del: 'observation', kalla: 'observation', ordning: 0, status: 'bra',
    avvikelse_typ: 'hansyn', lat: 56.1, lng: 15.1, ...over,
  });
}

const RUNDA: Egenkontroll = {
  id: 'e1', objekt_id: 'o1', objekt_typ: 'slutavverkning', status: 'klar', utford_av: 'Martin',
  startad: '2026-10-12T05:30:00Z', klar: '2026-10-12T11:30:00Z', kommentar: null, vader: null,
  maskiner: null, skapad: '2026-10-12T05:00:00Z',
} as unknown as Egenkontroll;

function indata(over: Partial<RapportIndata> = {}): RapportIndata {
  return {
    objektNamn: 'Aramo Marcus AU 2026', voNummer: '886788', runda: RUNDA, punkter: [], observationer: [],
    foton: [], provytor: [], platser: {}, traktgrans: [], ...over,
  };
}

describe('talen - ANTAL, inte betyg', () => {
  it('raknar bra/kan bli battre/avvikelse over punkterna; godkant och obesvarade for sig', () => {
    const m = byggRapport(indata({
      punkter: [
        punkt({ rubrik: 'A', status: 'ok', del: 'plan', kalla: 'markering' }),
        punkt({ rubrik: 'B', status: 'bra' }),
        punkt({ rubrik: 'C', status: 'godkant' }),
        punkt({ rubrik: 'D', status: 'battre' }),
        punkt({ rubrik: 'E', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad' }),
        punkt({ rubrik: 'F', status: null }),
      ],
    }));
    expect(m.tal).toEqual({ bra: 2, battre: 1, avvikelse: 1, godkant: 1, obesvarade: 1 });
  });

  it('OBSERVATIONER RAKNAS ALDRIG I TALEN - inte ens en observation med tonen avvikelse', () => {
    const m = byggRapport(indata({
      punkter: [punkt({ rubrik: 'A', status: 'bra' })],
      observationer: [observation({ status: 'avvikelse' }), observation({ status: 'bra' }), observation({ status: 'battre' })],
    }));
    expect(m.tal).toEqual({ bra: 1, battre: 0, avvikelse: 0, godkant: 0, obesvarade: 0 });
    expect(m.observationer).toHaveLength(3);
  });
});

describe('fynd, lopnummer och lasordning', () => {
  it('numreras i lasordning: avvikelser, kan bli battre, godkant, bra, observationer - EN serie', () => {
    const m = byggRapport(indata({
      punkter: [
        punkt({ rubrik: 'Bra med text', status: 'bra', kommentar: 'Fin kantzon' }),
        punkt({ rubrik: 'Battre', status: 'battre', kommentar: 'Kunde forstarkts' }),
        punkt({ rubrik: 'Avvikelse', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad' }),
        punkt({ rubrik: 'Godkant med text', status: 'godkant', kommentar: 'Okej' }),
      ],
      observationer: [observation({ kommentar: 'Rishog ratt placerad' })],
    }));
    expect(m.avvikelser.map((f) => [f.rubrik, f.nr])).toEqual([['Avvikelse', 1]]);
    expect(m.battre.map((f) => [f.rubrik, f.nr])).toEqual([['Battre', 2]]);
    expect(m.godkant.fynd.map((f) => [f.rubrik, f.nr])).toEqual([['Godkant med text', 3]]);
    expect(m.bra.fynd.map((f) => [f.rubrik, f.nr])).toEqual([['Bra med text', 4]]);
    expect(m.observationer.map((f) => [f.rubrik, f.nr])).toEqual([['Hänsyn', 5]]);
  });

  it('bra och godkant UTAN egen kommentar blir en rad ("Hogstubbar (3)"), aldrig ett kort och aldrig ett nummer', () => {
    const m = byggRapport(indata({
      punkter: [
        punkt({ rubrik: 'Högstubbar', status: 'ok', del: 'plan', kalla: 'markering' }),
        punkt({ rubrik: 'Högstubbar', status: 'ok', del: 'plan', kalla: 'markering' }),
        punkt({ rubrik: 'Högstubbar', status: 'ok', del: 'plan', kalla: 'markering' }),
        punkt({ rubrik: 'Stenmur', status: 'bra' }),
      ],
    }));
    expect(m.bra.fynd).toEqual([]);
    expect(m.bra.ovriga).toEqual(['Högstubbar (3)', 'Stenmur']);
    expect(m.bilaga.karta.pinnar).toEqual([]);
  });

  it('nummer + plats: punktens egen position gar fore planens; utan plats listas numret i stallet for att tappas', () => {
    const a = punkt({ rubrik: 'Overfart', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad', lat: 56.2, lng: 15.2, kommentar: 'Pa tva platser' });
    const b = punkt({ rubrik: 'Kantzon', status: 'battre', del: 'utforande' });
    const c = punkt({ rubrik: 'Dike', status: 'battre', del: 'plan', kalla: 'markering' });
    const m = byggRapport(indata({
      punkter: [a, b, c],
      platser: { [a.id]: { lat: 1, lng: 1 }, [c.id]: { lat: 56.3, lng: 15.3 } },
      traktgrans: [[{ lat: 56, lng: 15 }, { lat: 56.4, lng: 15 }, { lat: 56.4, lng: 15.4 }]],
    }));
    expect(m.bilaga.karta.pinnar).toEqual([
      { nr: 1, rubrik: 'Overfart', plats: { lat: 56.2, lng: 15.2 } },
      { nr: 3, rubrik: 'Dike', plats: { lat: 56.3, lng: 15.3 } },
    ]);
    expect(m.bilaga.karta.utanPlats).toEqual([2]);
    expect(m.bilaga.karta.granser).toHaveLength(1);
  });
});

describe('bildtexten - ett foto utan text ar samre an inget foto', () => {
  const avv = () => punkt({ rubrik: 'Stenmur', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad' });

  it('besiktarens kommentar ar bildtexten', () => {
    const p = avv(); p.kommentar = 'Basväg över stenmuren';
    const m = byggRapport(indata({ punkter: [p], foton: [foto({ id: 'f1', punkt_id: p.id })] }));
    expect(m.bilaga.bilder).toMatchObject([{ nr: 1, text: 'Basväg över stenmuren', textKalla: 'kommentar' }]);
  });

  it('SAKNAS kommentaren pa en avvikelse blir bildtexten rubrik och typ ur datan - aldrig en tom text', () => {
    const p = avv();
    const m = byggRapport(indata({ punkter: [p], foton: [foto({ id: 'f1', punkt_id: p.id })] }));
    expect(m.bilaga.bilder).toMatchObject([{ nr: 1, text: 'Stenmur · Hänsyn skadad', textKalla: 'rubrik' }]);
    expect(m.bilaga.bilder.every((b) => b.text.trim() !== '')).toBe(true);
  });

  it('observation utan kommentar: typen ar bildtexten', () => {
    const o = observation({ avvikelse_typ: 'korspar', status: 'avvikelse' });
    const m = byggRapport(indata({ observationer: [o], foton: [foto({ id: 'f1', punkt_id: o.id })] }));
    expect(m.bilaga.bilder).toMatchObject([{ text: 'Körspår', textKalla: 'rubrik' }]);
  });

  it('foto pa en bra punkt UTAN kommentar tas inte med - det raknas, sa rapporten kan saga det', () => {
    const p = punkt({ rubrik: 'Kantzon', status: 'bra' });
    const m = byggRapport(indata({ punkter: [p], foton: [foto({ id: 'f1', punkt_id: p.id })] }));
    expect(m.bilaga.bilder).toEqual([]);
    expect(m.bilaga.utanText).toBe(1);
  });

  it('foto pa en bra punkt MED kommentar tas med ("Grova toppar som naturhansyn")', () => {
    const p = punkt({ rubrik: 'Grova toppar', status: 'bra', kommentar: 'Grova toppar som naturhänsyn' });
    const m = byggRapport(indata({ punkter: [p], foton: [foto({ id: 'f1', punkt_id: p.id })] }));
    expect(m.bilaga.bilder).toMatchObject([{ nr: 1, text: 'Grova toppar som naturhänsyn' }]);
  });

  it('stubbematning: tackningsgraden ar texten, aven pa en bra punkt', () => {
    const p = punkt({ rubrik: 'Stubbehandling', status: 'ok', del: 'matning' });
    const m = byggRapport(indata({ punkter: [p], foton: [foto({ id: 'f1', punkt_id: p.id, tackningsgrad: 85 })] }));
    expect(m.bilaga.bilder).toMatchObject([{ nr: null, text: 'Stubbehandling · täckning 85 %', textKalla: 'matning' }]);
  });

  it('flera foton pa ett fynd: samma nummer, "1/2" och "2/2", i den ordning de togs', () => {
    const p = avv(); p.kommentar = 'Stenmuren ar paverkad';
    const m = byggRapport(indata({
      punkter: [p],
      foton: [
        foto({ id: 'sen', punkt_id: p.id, skapad: '2026-10-12T10:00:00Z' }),
        foto({ id: 'tidig', punkt_id: p.id, skapad: '2026-10-12T09:00:00Z' }),
      ],
    }));
    expect(m.bilaga.bilder.map((b) => [b.fotoId, b.nr, b.del])).toEqual([
      ['tidig', 1, { i: 1, av: 2 }],
      ['sen', 1, { i: 2, av: 2 }],
    ]);
  });

  it('bilagan gar i nummerordning; matningsfoton (utan nummer) och provytefoton kommer efter', () => {
    const stubbe = punkt({ rubrik: 'Stubbehandling', status: 'ok', del: 'matning' });
    const a = avv();
    const b = punkt({ rubrik: 'Kantzon', status: 'battre' });
    const m = byggRapport(indata({
      punkter: [stubbe, a, b],
      foton: [
        foto({ id: 'fs', punkt_id: stubbe.id, tackningsgrad: 90, skapad: '2026-10-12T08:00:00Z' }),
        foto({ id: 'fb', punkt_id: b.id, skapad: '2026-10-12T08:30:00Z' }),
        foto({ id: 'fa', punkt_id: a.id, skapad: '2026-10-12T09:00:00Z' }),
      ],
    }));
    expect(m.bilaga.bilder.map((x) => [x.fotoId, x.nr])).toEqual([['fa', 1], ['fb', 2], ['fs', null]]);
  });

  it('planerarens kommentar ar ALDRIG besiktarens text - den blir sammanhang, och bildtexten faller da tillbaka pa rubrik och typ', () => {
    const p = avv(); p.plan_kommentar = 'Planerad stenmur, 40 m';
    const m = byggRapport(indata({ punkter: [p], foton: [foto({ id: 'f1', punkt_id: p.id })] }));
    expect(m.avvikelser[0]).toMatchObject({ text: null, planText: 'Planerad stenmur, 40 m' });
    expect(m.bilaga.bilder[0]).toMatchObject({ text: 'Stenmur · Hänsyn skadad', textKalla: 'rubrik' });
  });

  it('provytefoto: "Provyta 3"', () => {
    const y = { id: 'y3', egenkontroll_id: 'e1', nummer: 3, lat: 56, lng: 15, overhoppad: false, matt: '2026-10-12T08:00:00Z', antal_frisk: 5, antal_skadad: 0 } as unknown as EgenkontrollProvyta;
    const m = byggRapport(indata({ runda: { ...RUNDA, objekt_typ: 'gallring' }, provytor: [y], foton: [foto({ id: 'f1', provyta_id: 'y3' })] }));
    expect(m.bilaga.bilder).toMatchObject([{ nr: null, text: 'Provyta 3', textKalla: 'provyta', plats: { lat: 56, lng: 15 } }]);
  });
});

describe('kommentaren - sist, i lopande text', () => {
  it('delas i stycken pa radbrytning; tomma rader och blanksteg tas bort', () => {
    const m = byggRapport(indata({ runda: { ...RUNDA, kommentar: ' Bra avverkning.\n\n  Basväg över stenmur.  \r\nInritade hänsynsytor.' } }));
    expect(m.kommentar).toEqual(['Bra avverkning.', 'Basväg över stenmur.', 'Inritade hänsynsytor.']);
  });

  it('ingen kommentar (null, tom eller bara blanksteg) ger null - rapporten ritar ingen tom ruta', () => {
    for (const k of [null, '', '  \n ']) {
      expect(byggRapport(indata({ runda: { ...RUNDA, kommentar: k } })).kommentar).toBeNull();
    }
  });
});

describe('provytorna - bara gallring, samma funktion som rundvyn', () => {
  const yta = (nummer: number, frisk: number, skadad: number, extra: Partial<EgenkontrollProvyta> = {}) =>
    ({ id: `y${nummer}`, egenkontroll_id: 'e1', nummer, overhoppad: false, matt: '2026-10-12T08:00:00Z', antal_frisk: frisk, antal_skadad: skadad, stickvagsbredd_m: null, stickvagsavstand_m: null, grundyta_m2_ha: null, ...extra }) as unknown as EgenkontrollProvyta;

  it('skadeandelen ar raknad ur SUMMORNA, inte medelvardet av ytornas procent', () => {
    // 9 trad med 1 skadad (11 %) och 50 trad med 25 skadade (50 %): medel av procent 31 %, ur summorna 26/59 = 44 %.
    const m = byggRapport(indata({ runda: { ...RUNDA, objekt_typ: 'gallring' }, provytor: [yta(1, 8, 1), yta(2, 25, 25)] }));
    expect(m.provytor).toContain('Skadeandel 44 % (26 av 59 träd, 2 ytor)');
  });

  it('visar bara det som har ett varde, och sager overhoppade och ej matta', () => {
    const m = byggRapport(indata({
      runda: { ...RUNDA, objekt_typ: 'gallring' },
      provytor: [
        yta(1, 10, 0, { stickvagsbredd_m: 4 }),
        yta(2, 0, 0, { matt: null }),
        yta(3, 0, 0, { overhoppad: true }),
      ],
    }));
    expect(m.provytor).toEqual([
      'Provytor: 1 av 3 ytor mätta, 1 överhoppade, 1 ej mätta',
      'Skadeandel 0 % (0 av 10 träd, 1 ytor)',
      'Stickvägsbredd 4 m (1 av 1 ytor)',
    ]);
  });

  it('slutavverkning eller inga ytor: ingen provyterad alls', () => {
    expect(byggRapport(indata({ provytor: [yta(1, 5, 0)] })).provytor).toBeNull();
    expect(byggRapport(indata({ runda: { ...RUNDA, objekt_typ: 'gallring' } })).provytor).toBeNull();
  });
});

describe('huvud, utkast och filnamn', () => {
  it('besokText: en dag, flera dagar, over manadsskifte - svensk dag, aldrig enhetens zon', () => {
    expect(besokText('2026-10-12T05:00:00Z', '2026-10-12T11:00:00Z')).toBe('12 okt 2026');
    expect(besokText('2026-10-12T05:00:00Z', '2026-10-13T11:00:00Z')).toBe('12–13 okt 2026');
    expect(besokText('2026-10-31T05:00:00Z', '2026-11-02T11:00:00Z')).toBe('31 okt–2 nov 2026');
    // 22:30 UTC den 12:e ar 00:30 svensk tid den 13:e (sommartid slutade 25 okt, +2 h).
    expect(besokText('2026-10-12T22:30:00Z', null)).toBe('13 okt 2026');
    expect(besokText('inte-ett-datum', null)).toBe('datum saknas');
  });

  it('huvudet: objekt, VO, typ, besok, utforare och maskingrupp - bara de maskiner som finns', () => {
    const m = byggRapport(indata({
      runda: { ...RUNDA, maskiner: { skordare_maskin: 'Giant', skotare_maskin: null } as unknown as Egenkontroll['maskiner'] },
    }));
    expect(m.huvud).toEqual({
      objektNamn: 'Aramo Marcus AU 2026', voNummer: '886788', typ: 'Slutavverkning', besok: '12 okt 2026',
      utfordAv: 'Martin', maskingrupp: 'Skördare Giant',
    });
    expect(byggRapport(indata()).huvud.maskingrupp).toBeNull();
  });

  it('en rapport pa en runda som inte ar klar ar ett UTKAST', () => {
    expect(byggRapport(indata()).utkast).toBe(false);
    expect(byggRapport(indata({ runda: { ...RUNDA, status: 'pagaende', klar: null } })).utkast).toBe(true);
  });

  it('filnamnet har inga å/ä/ö, mellanslag eller skiljetecken', () => {
    const m = byggRapport(indata({ objektNamn: 'Tjuvön AU 2026 / Åbogen' }));
    expect(m.filnamn).toBe('egenkontroll-tjuvon-au-2026-abogen-2026-10-12');
  });

  it('forutsattningarna saknar aldrig en rad: vader null sager att det sparades inte', () => {
    expect(byggRapport(indata()).forutsattningar).toEqual(['Väder: Vädret sparades inte']);
  });
});

describe('dagens data (prod 2026-10-19): ett enda fynd med text - det som hander nar kommentaren saknas', () => {
  it('fyra kan-bli-battre utan kommentar numreras och ar listade; fotona utan text pa bra/ok-punkter tas inte med', () => {
    const avvikelse = punkt({ rubrik: 'Stenmur', status: 'avvikelse', del: 'plan', kalla: 'markering', avvikelse_typ: 'hansyn_skadad', kommentar: 'Spar over muren' });
    const battre = [1, 2, 3].map((n) => punkt({ rubrik: `Punkt ${n}`, status: 'battre' }));
    const braMedFoto = punkt({ rubrik: 'Kantzon', status: 'bra' });
    const okMedFoto = punkt({ rubrik: 'Hogstubbar', status: 'ok', del: 'plan', kalla: 'markering' });
    const m = byggRapport(indata({
      punkter: [avvikelse, ...battre, braMedFoto, okMedFoto],
      foton: [
        foto({ id: 'a', punkt_id: avvikelse.id }),
        foto({ id: 'b', punkt_id: braMedFoto.id }),
        foto({ id: 'c', punkt_id: okMedFoto.id }),
      ],
    }));
    expect(m.tal).toMatchObject({ avvikelse: 1, battre: 3, bra: 2 });
    expect(m.battre.map((f) => f.text)).toEqual([null, null, null]);
    expect(m.bilaga.bilder.map((b) => b.fotoId)).toEqual(['a']);
    expect(m.bilaga.utanText).toBe(2);
  });
});
