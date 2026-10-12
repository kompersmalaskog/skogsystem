import { describe, expect, it } from 'vitest';
import type { EgenkontrollPunkt } from './egenkontroll';
import {
  TUMSKYDD_MS, aktivtKort, antalBesvarade, arSerieLage, avslutaStatus, byggSerie,
  forstaObesvarade, rutor, svarsTecken,
} from './egenkontrollSerie';

function p(id: string, ordning: number, del: string, status: string | null = null): EgenkontrollPunkt {
  return {
    id, egenkontroll_id: 'e1', ordning, del, grupp: null, kalla: del === 'plan' ? 'markering' : 'fast',
    markering_id: null, markering_marker_id: null, punkt_typ: id, rubrik: id, antal_planerat: null,
    geometri_snapshot: null, status, avvikelse_typ: null, varde_foreslaget: null, varde_bekraftat: null,
    kommentar: null, lat: null, lng: null, besvarad: null, plan_kommentar: null,
  } as unknown as EgenkontrollPunkt;
}

/** En ny slutavverkning: 8 plan + 11 utforande + 1 matning. */
function nyRunda(besvarade = 0): EgenkontrollPunkt[] {
  const rader: EgenkontrollPunkt[] = [];
  let o = 1;
  for (let i = 0; i < 8; i++) rader.push(p(`plan${i}`, o++, 'plan', 'ok'));
  for (let i = 0; i < 11; i++) rader.push(p(`utf${i}`, o++, 'utforande', i < besvarade ? 'bra' : null));
  rader.push(p('stubbe', o++, 'matning', null));
  return rader;
}

// Returtypen anges: utan den slås status fast som icke-null, och testen som gör en punkt obesvarad igen (status: null) typar inte.
const allaBesvarade = (rader: EgenkontrollPunkt[]): EgenkontrollPunkt[] => rader.map((x) => ({ ...x, status: x.status ?? 'ok' }));

describe('byggSerie - ordningen ar inte slumpad och inte vald', () => {
  it('utforande forst, matningar sist, var och en i rundans ordning - planpunkterna ingar inte', () => {
    const serie = byggSerie(nyRunda());
    expect(serie.map((x) => x.id)).toEqual([
      'utf0', 'utf1', 'utf2', 'utf3', 'utf4', 'utf5', 'utf6', 'utf7', 'utf8', 'utf9', 'utf10', 'stubbe',
    ]);
    expect(serie.some((x) => x.del === 'plan')).toBe(false);
  });

  it('en NY slutavverkning ger 12 kort (11 + stubbehandling), en gallring 11 (10 + stubbehandling)', () => {
    expect(byggSerie(nyRunda())).toHaveLength(12);
    const gallring = [...Array(10)].map((_, i) => p(`u${i}`, i + 1, 'utforande')).concat(p('s', 11, 'matning'));
    expect(byggSerie(gallring)).toHaveLength(11);
  });

  it('en GAMMAL runda med nio utforande visas som nio kort - precis som en ny med tolv', () => {
    const gammal = [...Array(9)].map((_, i) => p(`u${i}`, i + 1, 'utforande'));
    expect(byggSerie(gammal)).toHaveLength(9);
  });

  it('ordningen kommer ur ordning-kolumnen, inte ur radordningen', () => {
    const blandad = [p('b', 2, 'utforande'), p('s', 9, 'matning'), p('a', 1, 'utforande'), p('c', 3, 'utforande')];
    expect(byggSerie(blandad).map((x) => x.id)).toEqual(['a', 'b', 'c', 's']);
  });

  it('en okand del hamnar sist i stallet for att forsvinna', () => {
    const s = byggSerie([p('x', 1, 'framtida'), p('u', 2, 'utforande'), p('m', 3, 'matning')]);
    expect(s.map((x) => x.id)).toEqual(['u', 'm', 'x']);
  });

  it('en runda utan utforandepunkter (fore PR 3) har ingen serie', () => {
    expect(byggSerie([p('plan', 1, 'plan', 'ok')])).toEqual([]);
  });
});

describe('forsta obesvarade och raknaren', () => {
  it('raknaren ar antalet besvarade av serien: "4 av 12"', () => {
    const serie = byggSerie(nyRunda(4));
    expect(antalBesvarade(serie)).toBe(4);
    expect(serie).toHaveLength(12);
  });
  it('forsta obesvarade ar forsta i seriens ordning, aven om ett senare ar besvarat', () => {
    const serie = byggSerie(nyRunda(0));
    serie[5] = { ...serie[5], status: 'bra' };
    expect(forstaObesvarade(serie)!.id).toBe('utf0');
    serie[0] = { ...serie[0], status: 'bra' };
    expect(forstaObesvarade(serie)!.id).toBe('utf1');
  });
  it('allt besvarat: ingen forsta obesvarad', () => {
    expect(forstaObesvarade(allaBesvarade(byggSerie(nyRunda(11))))).toBeNull();
  });
});

describe('aktivtKort - harlett, aldrig lagrat', () => {
  const serie = byggSerie(nyRunda(4));

  it('utan val: det forsta obesvarade (kort 5)', () => {
    const k = aktivtKort(serie, null);
    expect(k.punkt!.id).toBe('utf4');
    expect(k.nummer).toBe(5);
    expect(k.arValt).toBe(false);
  });
  it('med val: det man gatt tillbaka till', () => {
    const k = aktivtKort(serie, 'utf1');
    expect(k.punkt!.id).toBe('utf1');
    expect(k.nummer).toBe(2);
    expect(k.arValt).toBe(true);
  });
  it('ett val som inte finns i serien ignoreras - inget tomt kort', () => {
    expect(aktivtKort(serie, 'finns-inte').punkt!.id).toBe('utf4');
  });
  it('allt besvarat och inget val: slutkortet', () => {
    const k = aktivtKort(allaBesvarade(byggSerie(nyRunda(11))), null);
    expect(k.punkt).toBeNull();
    expect(k.nummer).toBeNull();
  });
  it('allt besvarat men man valt ett kort: det kortet, inte slutkortet', () => {
    expect(aktivtKort(allaBesvarade(byggSerie(nyRunda(11))), 'utf2').punkt!.id).toBe('utf2');
  });
  it('en punkt som blivit obesvarad igen blir kortet - serien ar harledd, inte inlast', () => {
    const klar = allaBesvarade(byggSerie(nyRunda(11)));
    klar[3] = { ...klar[3], status: null };
    expect(aktivtKort(klar, null).punkt!.id).toBe('utf3');
  });
});

describe('rutor - raden med det man redan svarat', () => {
  it('BARA de besvarade - en obesvarad punkt gar inte att trycka pa', () => {
    const r = rutor(byggSerie(nyRunda(4)));
    expect(r).toHaveLength(4);
    expect(r.map((x) => x.punkt.id)).toEqual(['utf0', 'utf1', 'utf2', 'utf3']);
    expect(r.some((x) => x.punkt.status === null)).toBe(false);
  });

  it('numret ar platsen i SERIEN, inte i raden: ruta 7 ar kort 7 aven om kort 5 inte ar besvarat', () => {
    const serie = byggSerie(nyRunda(0));
    serie[6] = { ...serie[6], status: 'godkant' };
    const r = rutor(serie);
    expect(r).toHaveLength(1);
    expect(r[0].nummer).toBe(7);
    expect(r[0].punkt.id).toBe('utf6');
  });

  it('en ruta per kort och inget mer: nummer, tecken och ord - ingen rubrik, ingen undertext', () => {
    const r = rutor(allaBesvarade(byggSerie(nyRunda(11))));
    expect(r).toHaveLength(12);
    for (const x of r) expect(Object.keys(x).sort()).toEqual(['nummer', 'ord', 'punkt', 'tecken']);
  });

  it('tecknen skiljer Bra, Godkant och Kan bli battre (form, inte bara farg)', () => {
    const t = ['bra', 'godkant', 'battre'].map((s) => svarsTecken(s)!.tecken);
    expect(new Set(t).size).toBe(3);
    expect(svarsTecken('ok')!.tecken).toBe(svarsTecken('bra')!.tecken);
    expect(svarsTecken(null)).toBeNull();
    expect(svarsTecken('nagot_nytt')!.tecken).toBe('•');
  });
});

describe('arSerieLage - nar avsluta-laget visas som serie', () => {
  const bas = { harRunda: true, klar: false, terrangKvar: 0, serieLangd: 12 };
  it('pagaende runda, terrangen klar, kort finns: ja', () => {
    expect(arSerieLage(bas)).toBe(true);
  });
  it('terrang kvar (tillstand 2): nej - dess kolumn ar orord', () => {
    expect(arSerieLage({ ...bas, terrangKvar: 3 })).toBe(false);
  });
  it('en avslutad runda ar ett dokument: nej', () => {
    expect(arSerieLage({ ...bas, klar: true })).toBe(false);
  });
  it('ingen runda, eller inga kort: nej', () => {
    expect(arSerieLage({ ...bas, harRunda: false })).toBe(false);
    expect(arSerieLage({ ...bas, serieLangd: 0 })).toBe(false);
  });
  it('en runda helt utan planpunkter (terrangKvar 0) far serien direkt', () => {
    expect(arSerieLage({ ...bas, terrangKvar: 0, serieLangd: 10 })).toBe(true);
  });
});

describe('avslutaStatus - RAKNAR BADA SLAGEN, som avslutaRunda', () => {
  const punkterKlara = [{ status: 'ok' }, { status: 'bra' }];
  const matt = { matt: '2026-10-04T15:43:28Z', overhoppad: false };
  const omatt = { matt: null, overhoppad: false };
  const overhoppad = { matt: '2026-10-04T15:43:28Z', overhoppad: true };

  it('allt klart: kan avslutas', () => {
    const s = avslutaStatus(punkterKlara, [matt, overhoppad]);
    expect(s).toMatchObject({ kan: true, kvarPunkter: 0, kvarProvytor: 0, orsak: null, etikett: 'Avsluta rundan' });
  });

  it('PROVYTOR KVAR med alla punkter besvarade: kan INTE avslutas - sa var knappen aktiv forr', () => {
    const s = avslutaStatus(punkterKlara, [matt, omatt, omatt, omatt]);
    expect(s.kan).toBe(false);
    expect(s.kvarProvytor).toBe(3);
    expect(s.orsak).toBe('3 provytor återstår');
    expect(s.etikett).toBe('Avsluta rundan — 3 provytor kvar');
  });

  it('en provyta kvar: singular', () => {
    expect(avslutaStatus(punkterKlara, [omatt]).etikett).toBe('Avsluta rundan — 1 provyta kvar');
  });

  it('bade punkter och provytor kvar: bada sagt var for sig', () => {
    const s = avslutaStatus([{ status: null }, { status: null }, { status: 'ok' }], [omatt]);
    expect(s.etikett).toBe('Avsluta rundan — 2 punkter och 1 provyta kvar');
    expect(s.orsak).toBe('2 punkter och 1 provyta återstår');
  });

  it('en punkt kvar: singular', () => {
    expect(avslutaStatus([{ status: null }, { status: 'ok' }], []).etikett).toBe('Avsluta rundan — 1 punkt kvar');
  });

  it('overhoppade och matta ytor ar klara - bara OMATTA hindrar', () => {
    expect(avslutaStatus(punkterKlara, [overhoppad, overhoppad]).kan).toBe(true);
  });

  it('en runda utan punkter kan inte avslutas (som kanAvsluta gjorde)', () => {
    expect(avslutaStatus([], []).kan).toBe(false);
  });

  it('ger samma svar som avslutaRunda: kan=true exakt nar varken punkter eller omatta ytor ar kvar', () => {
    for (const kvarP of [0, 1, 4]) {
      for (const kvarY of [0, 1, 7]) {
        const punkter = [{ status: 'ok' }, ...Array(kvarP).fill({ status: null })];
        const ytor = [matt, ...Array(kvarY).fill(omatt)];
        expect(avslutaStatus(punkter, ytor).kan).toBe(kvarP === 0 && kvarY === 0);
      }
    }
  });
});

describe('tumskyddet', () => {
  it('ar kort nog att inte kannas som en fordrojning, och langt nog for ett sent dubbeltryck', () => {
    expect(TUMSKYDD_MS).toBeGreaterThanOrEqual(250);
    expect(TUMSKYDD_MS).toBeLessThanOrEqual(500);
  });
});
