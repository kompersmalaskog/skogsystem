import { describe, expect, it } from 'vitest';
import fixtur from './__fixtures__/jatsbygd_2026.json';
import { objektIds, sammanstall, summeraProduktion, type Underlag, type ObjektRad } from './berakna';
import { appPrognosRad, byggObjektVy, grupperaPoster, listPost, prognosText, staplar, tidText, timmar } from './vy';

const objekt = fixtur.objekt as ObjektRad;
function underlag(over: Partial<Underlag> = {}): Underlag {
  return {
    objekt: [objekt, ...fixtur.franObjekt.map(f => ({ ...f, vo_nummer: null, dim_objekt_id: null, status: 'avslutat', typ: null, bolag: null, volym: null, areal: null, manuell_prognos: null, avslutad_timestamp: null }))],
    dim: fixtur.dim,
    alt: [],
    tid: fixtur.tid,
    manuell: fixtur.manuell,
    extra: [],
    flytt: fixtur.flytt,
    maskiner: fixtur.maskiner,
    platser: [],
    medarbetare: [],
    tradslag: fixtur.tradslag,
    ...over,
  };
}
const prod = fixtur.produktion;
const namn = (id: string) => fixtur.maskiner.find(m => m.maskin_id === id)?.visningsnamn ?? id;

describe('Jätsbygd au 2026 (prod)', () => {
  const u = underlag();
  const s = sammanstall(objekt, u);
  const p = summeraProduktion(objekt, u, prod);
  const vy = byggObjektVy(s, p, namn);

  it('hittar skotarens eget maskinobjekt via samma VO', () => {
    expect([...objektIds(objekt, u.dim, u.alt)].sort()).toEqual(['11217392', 'A130743_7']);
  });

  it('tiden per maskin och roll', () => {
    const per = Object.fromEntries(s.maskiner.map(m => [m.namn, Math.round(m.min / 6) / 10]));
    expect(per).toEqual({ Giant: 48.8, Wisent: 61.6, 'Elefant 26': 45.7 });
    expect(s.maskiner.find(m => m.namn === 'Giant')?.dagar).toBe(6);
    expect(timmar(s.rollMin.skordare)).toBe('48,8 tim');
    expect(timmar(s.rollMin.skotare)).toBe('107,3 tim');
  });

  it('flyttarna hit med varifrån, dag och km', () => {
    expect(s.flyttMin).toBe(89);
    expect(vy.flyttar?.map(r => [r.titel, r.under, r.hoger])).toEqual([
      ['Giant', 'Från Åbogen RP 2026 · 3 aug · 27 km', '46 min'],
      ['Wisent', 'Från Sandåsen gallring 2025 · 11 aug · 13 km', '43 min'],
      ['Elefant 26', 'Ingen flytt registrerad', '–'],
    ]);
  });

  it('svaret överst: total tid och volym', () => {
    expect(vy.fraga).toBe('Hur lång tid tog objektet?');
    expect(vy.svar).toBe('157 tim 33 min');
    expect(s.totalMin).toBe(s.rollMin.skordare + s.rollMin.skotare + s.flyttMin);
    expect(vy.underSvar).toBe('1 401 m³ skördat – 8,9 m³ per timme');
    expect(vy.meta).toBe('Slutavverkning · Vida · klart 21 aug');
  });

  it('prognosen skrivs ut i ord', () => {
    const r = Object.fromEntries(vy.tid.rader.map(x => [x.nyckel, x]));
    expect(r.skordare.under).toBe('Prognos 56 tim – blev 7 tim kortare');
    expect(r.skordare.varning).toBe(false);
    expect(r.skotare.under).toBe('Prognos 72 tim – blev 35 tim längre');
    expect(r.skotare.varning).toBe(true);
    expect(r.skotare.under2).toBe('Wisent 61,6 tim · Elefant 26 45,7 tim');
    expect(r.flytt.under).toBe('2 flyttar hit');
    expect(r.planering).toMatchObject({ hoger: '–', under: 'Ingen tid inskriven', dampad: true });
  });

  it('vad det blev', () => {
    expect(vy.blev?.map(r => [r.titel, r.hoger])).toEqual([
      ['Skördat', '1 401 m³'], ['Stammar', '4 659'], ['Medelstam', '0,30 m³'], ['Bränsle', '1,6 l/m³'],
    ]);
    expect(vy.blev?.[3].hogerUnder).toBe('2 262 liter');
  });

  it('uppdraget enligt planeringen', () => {
    const r = Object.fromEntries((vy.uppdraget ?? []).map(x => [x.nyckel, x]));
    expect(r.volym).toMatchObject({ hoger: '1 738 m³', under: 'på 7,3 ha' });
    expect(r.forutsattningar.under).toBe('Dålig bärighet · flack terräng');
    expect(r.maskiner.under).toBe('Giant och Wisent');
    expect(r.maskiner.under2).toBe('Band på skördare och skotare · extra vagn · trailer in');
    expect(r.cert.hoger).toBe('FSC, PEFC');
    expect(r.vida.under).toBe('Spara ca 50 tallar per ha.');
    expect(r.ved.hoger).toBe('Ja');
  });

  it('ingen kvar-sektion för ett avslutat objekt', () => {
    expect(vy.kvar).toBeNull();
    expect(s.grupp).toBe('avslutad');
  });

  it('staplarna: en per dag från första till sista, tomma dagar med', () => {
    expect(vy.tid.staplar.length).toBe(19);
    expect(vy.tid.staplar[0]).toMatchObject({ etikett: '3', lang: 'mån 3 aug' });
    const helg = vy.tid.staplar.find(x => x.nyckel === '2026-08-08');
    expect(helg?.min).toBe(0);
    const summa = vy.tid.staplar.reduce((t, x) => t + x.min, 0);
    expect(Math.abs(summa - s.totalMin)).toBeLessThanOrEqual(vy.tid.staplar.length);
  });
});

describe('regler', () => {
  it('mätt tid vinner över en manuell rad för samma maskin', () => {
    const u = underlag({ manuell: [{ objekt_id: '11217392', maskin_id: 'A030353', g15_timmar: 99 }] });
    expect(sammanstall(objekt, u).rollMin.skotare).toBe(sammanstall(objekt, underlag()).rollMin.skotare);
  });

  it('manuell rad räknas när maskinen saknar mätt tid', () => {
    const u = underlag({ manuell: [{ objekt_id: '11217392', maskin_id: 'JD810E', g15_timmar: 10 }], maskiner: [...fixtur.maskiner, { maskin_id: 'JD810E', visningsnamn: '810E', maskin_typ: 'Forwarder' }] });
    const s = sammanstall(objekt, u);
    expect(s.maskiner.find(m => m.maskin_id === 'JD810E')).toMatchObject({ min: 600, manuell: true });
  });

  it('avbruten flytt räknas inte', () => {
    const u = underlag({ flytt: fixtur.flytt.map((f, i) => (i === 0 ? { ...f, avbruten: true } : f)) });
    expect(sammanstall(objekt, u).flyttar.length).toBe(1);
  });

  it('planering, manuellt och flytthjälp ur extra tid, matchat på extra nummer också', () => {
    const u = underlag({
      alt: [{ objekt_id: objekt.id, nummer: '11166440', maskin_id: null }],
      medarbetare: [{ id: 'm1', namn: 'Martin' }],
      extra: [
        { datum: '2026-07-30', minuter: 120, aktivitet_typ: 'planering', objekt_id: '11166440', medarbetare_id: 'm1' },
        { datum: '2026-08-05', minuter: 60, aktivitet_typ: 'manuellt', objekt_id: '11217392', medarbetare_id: 'm1' },
        { datum: '2026-08-11', minuter: 30, aktivitet_typ: 'flytt', objekt_id: '11217392', medarbetare_id: 'm1' },
        { datum: '2026-08-11', minuter: 30, aktivitet_typ: 'manuellt', objekt_id: '999', medarbetare_id: 'm1' },
      ],
    });
    const s = sammanstall(objekt, u);
    expect(s.planering).toEqual([{ datum: '2026-07-30', min: 120, person: 'Martin' }]);
    expect(s.manuellt.length).toBe(1);
    expect(s.flytthjalpMin).toBe(30);
    expect(s.flyttMin).toBe(89 + 30);
    const vy = byggObjektVy(s, { volym: 0, stammar: 0, tradslag: [] }, namn);
    expect(vy.tid.rader.find(r => r.nyckel === 'planering')).toMatchObject({ hoger: '2 tim', under: 'Martin · 1 dag' });
    expect(vy.tid.rader.find(r => r.nyckel === 'flytt')?.under).toBe('2 flyttar hit · 30 min flytthjälp');
  });

  it('skördning klar men skotning inte → Pågår med skotning kvar', () => {
    const u = underlag({ dim: fixtur.dim.map(d => ({ ...d, skotning_avslutad: null })) });
    const s = sammanstall(objekt, u);
    expect(s.grupp).toBe('pagar');
    expect(s.skotningKvar).toBe(true);
    const vy = byggObjektVy(s, { volym: 1400, stammar: 4659, tradslag: [] }, namn);
    expect(vy.fraga).toBe('Hur lång tid har det tagit hittills?');
    expect(vy.kvar?.map(r => [r.titel, r.hoger])).toEqual([['Skördning', 'Klar'], ['Skotning', 'Kvar']]);
    expect(listPost(s).under).toBe('Slutavverkning · skotning kvar');
  });

  it('prognostexter', () => {
    expect(prognosText(48.8 * 60, 56, true).text).toBe('Prognos 56 tim – blev 7 tim kortare');
    expect(prognosText(56 * 60, 56, true).text).toBe('Prognos 56 tim – blev som prognosen');
    expect(prognosText(30 * 60, 56, false).text).toBe('Prognos 56 tim – 26 tim kvar enligt prognosen');
    expect(prognosText(70 * 60, 56, false)).toEqual({ text: 'Prognos 56 tim – redan 14 tim över', varning: true });
    expect(prognosText(60 * 60, 56, true).varning).toBe(false);   // 7 % över: inte orange
    expect(prognosText(60, undefined, true).text).toBe('Ingen prognos');
  });

  it('appens frysta prognos står som egen rad under planerarens — och säger vem som låg närmast', () => {
    // Jätsbygd har ingen fryst prognos (äldre än 2026-10-24): ingen facit-rad, inget påhittat.
    const u = underlag();
    const p = summeraProduktion(objekt, u, prod);
    expect(byggObjektVy(sammanstall(objekt, u), p, namn).tid.rader.find(r => r.nyckel === 'skordare')!.facit).toBeNull();
    const vy2 = byggObjektVy(sammanstall({ ...objekt, app_prognos: { skordare: 48, skotare: 90 } }, u), p, namn);
    const r = Object.fromEntries(vy2.tid.rader.map(x => [x.nyckel, x]));
    expect(r.skordare.facit).toBe('Appens prognos 48 tim – appen låg närmast');      // blev 48,8: appen 48, planeraren 56
    expect(r.skotare.facit).toBe('Appens prognos 90 tim – appen låg närmast');  // blev 107,3: appen 90 (17 ifrån), planeraren 72 (35 ifrån)
  });

  it('appPrognosRad', () => {
    expect(appPrognosRad(50 * 60, 56, 48, true)).toBe('Appens prognos 48 tim – appen låg närmast');
    expect(appPrognosRad(54 * 60, 56, 48, true)).toBe('Appens prognos 48 tim – planeraren låg närmast');
    expect(appPrognosRad(52 * 60, 56, 48, true)).toBe('Appens prognos 48 tim – lika nära som planerarens');
    expect(appPrognosRad(30 * 60, 56, 48, false)).toBe('Appens prognos 48 tim');
    expect(appPrognosRad(30 * 60, undefined, 48.5, true)).toBe('Appens prognos 48,5 tim');
    expect(appPrognosRad(30 * 60, 56, undefined, true)).toBeNull();
  });

  it('trädslagen: stapel och rader med appens trädslagsfärger', () => {
    const u = underlag();
    const p = summeraProduktion(objekt, u, prod);
    const vy = byggObjektVy(sammanstall(objekt, u), p, namn);
    expect(p.tradslag.map(t => t.namn)).toEqual(['Gran', 'Tall', 'Björk', 'Övrigt löv']);
    expect(vy.trad!.rader.map(r => [r.titel, r.hoger, r.hogerUnder])).toEqual([
      ['Gran', '785 m³', '56 %'], ['Tall', '456 m³', '33 %'], ['Björk', '153 m³', '11 %'], ['Övrigt löv', '7 m³', 'under 1 %'],
    ]);
    expect(vy.trad!.rader[0].farg).toBe('#30D158');
    expect(vy.trad!.rader[1].farg).toBe('#FF9F0A');
    expect(vy.trad!.stapel.reduce((t, d) => t + d.andel, 0)).toBeCloseTo(1, 5);
  });

  it('dagarna är delade per sort och summerar till dagens tid', () => {
    const u = underlag();
    const vy = byggObjektVy(sammanstall(objekt, u), summeraProduktion(objekt, u, prod), namn);
    const dag = vy.tid.staplar.find(x => x.etikett && x.min > 0)!;
    expect(dag.delar.reduce((t, d) => t + d.min, 0)).toBe(dag.min);
  });

  it('tidtexter', () => {
    expect(tidText(9457)).toBe('157 tim 37 min');
    expect(tidText(46)).toBe('46 min');
    expect(tidText(120)).toBe('2 tim');
    expect(timmar(89)).toBe('1,5 tim');
  });

  it('staplar per vecka när spannet är långt', () => {
    const m = new Map([['2026-06-01', { skordare: 60 }], ['2026-08-20', { skotare: 100, flytt: 20 }]]);
    const s = staplar(m);
    expect(s.rubrik).toBe('Timmar per vecka');
    expect(s.staplar[0].etikett).toBe('v23');
    expect(s.staplar.reduce((t, x) => t + x.min, 0)).toBe(180);
    expect(s.staplar.flatMap(x => x.delar.map(d => d.nyckel))).toEqual(expect.arrayContaining(['skordare', 'skotare', 'flytt']));
  });

  it('listan: Pågår, Planerade, sedan månader nyast först', () => {
    const g = grupperaPoster([
      { id: 'a', namn: 'A', under: '', hoger: '', grupp: 'avslutad', klart: '2026-08-21' },
      { id: 'b', namn: 'B', under: '', hoger: '', grupp: 'avslutad', klart: '2026-09-02' },
      { id: 'c', namn: 'C', under: '', hoger: '', grupp: 'pagar', klart: null },
      { id: 'd', namn: 'D', under: '', hoger: '', grupp: 'planerad', klart: null },
      { id: 'e', namn: 'E', under: '', hoger: '', grupp: 'avslutad', klart: '2025-11-02' },
    ], new Date('2026-10-22'));
    expect(g.map(x => x.rubrik)).toEqual(['Pågår', 'Planerade', 'September', 'Augusti', 'November 2025']);
  });
});
