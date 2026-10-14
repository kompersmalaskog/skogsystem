import { describe, it, expect } from 'vitest';
import { anvandObjektLista, arSkotningKvar, avslutadMeta, avslutadTyp, avslutadeAvTyp, avslutadeTyper, avslutsDatum, valdAvslutadTyp, effektivGrupp, fagelKm, grupperaObjekt, kmText, radMeta, sokTraff, statusGrupp, volymText, type ListObjekt } from './objektVal';

const o = (id: string, status: string | null, extra: Partial<ListObjekt> = {}): ListObjekt => ({ id, namn: id, status, ...extra });

describe('statusGrupp — grupperna utgår från objekt.status', () => {
  it('pagaende → Pågår; planerad → Planerade; avslutat → Avslutade; saknad/okänd → Oplanerade', () => {
    expect(statusGrupp('pagaende')).toBe('pagar');
    expect(statusGrupp('planerad')).toBe('planerade');
    expect(statusGrupp('avslutat')).toBe('avslutade');
    expect(statusGrupp(null)).toBe('oplanerade');
    expect(statusGrupp(undefined)).toBe('oplanerade');
    expect(statusGrupp('oplanerad')).toBe('oplanerade');
    expect(statusGrupp('något-nytt')).toBe('oplanerade');
  });
  it('skotning/skordning (arbete pågår) → Pågår; den gamla statusen "klar" är avslutad — aldrig Planerade', () => {
    expect(statusGrupp('skotning')).toBe('pagar');
    expect(statusGrupp('skordning')).toBe('pagar');
    expect(statusGrupp('klar')).toBe('avslutade');
  });
  it('versaler och blanksteg spelar ingen roll', () => {
    expect(statusGrupp(' Avslutat ')).toBe('avslutade');
  });
});

describe('grupperaObjekt', () => {
  const lista = [
    o('Vällust RP M-R -25', 'avslutat', { avslutad_timestamp: '2026-09-01T10:00:00Z', ar: 2026, manad: 9 } as any),
    o('Ekeby', 'planerad', { typ: 'slutavverkning' }),
    o('GROT Hjorthult', 'planerad', { typ: 'grot' }),
    o('Energi Norra', 'pagaende', { typ: 'energiklippning' }),
    o('Gallring Sjö', 'pagaende', { typ: 'gallring' }),
    o('Privat jobb', null),
    o('Gammal', 'klar'),
    o('Senast klar', 'avslutat', { avslutad_timestamp: '2026-10-05T10:00:00Z' }),
  ];
  it('avslutade hamnar ALDRIG under Planerade (eller Pågår/Oplanerade), oavsett planerad månad — undantaget skotning kvar, se nedan', () => {
    const g = grupperaObjekt(lista);
    expect(g.planerade.map((x) => x.id).sort()).toEqual(['Ekeby', 'GROT Hjorthult']);
    expect(g.pagar.map((x) => x.id).sort()).toEqual(['Energi Norra', 'Gallring Sjö']);
    expect(g.oplanerade.map((x) => x.id)).toEqual(['Privat jobb']);
    expect(g.avslutade.map((x) => x.id)).toEqual(['Senast klar', 'Vällust RP M-R -25', 'Gammal']);   // senast avslutat först, utan datum sist
    for (const gr of [g.pagar, g.planerade, g.oplanerade]) expect(gr.some((x) => ['avslutat', 'klar'].includes(String(x.status)))).toBe(false);
  });
  it('alla typer syns — GROT och energiklippning också (ingen typfiltrering)', () => {
    const g = grupperaObjekt(lista);
    const alla = [...g.pagar, ...g.planerade, ...g.oplanerade].map((x) => x.id);
    expect(alla).toContain('GROT Hjorthult');
    expect(alla).toContain('Energi Norra');
  });
  it('närmast först inom gruppen; objekt utan avstånd sist, sedan namn', () => {
    const rader = [o('C', 'planerad'), o('A', 'planerad'), o('B', 'planerad'), o('D', 'planerad')];
    const km: Record<string, number | null> = { A: 30, B: 5, C: 12, D: null };
    expect(grupperaObjekt(rader, { avstandKm: (x) => km[x.id] }).planerade.map((x) => x.id)).toEqual(['B', 'C', 'A', 'D']);
  });
  it('avslutade: senast avslutat först', () => {
    const g = grupperaObjekt([o('Gammal', 'avslutat', { avslutad_timestamp: '2026-01-01' }), o('Ny', 'avslutat', { avslutad_timestamp: '2026-10-01' })]);
    expect(g.avslutade.map((x) => x.id)).toEqual(['Ny', 'Gammal']);
  });
  it('sökning filtrerar alla grupper (namn, källa, VO, typ)', () => {
    const rader = [o('Ekeby', 'planerad', { bolag: 'Södra', vo_nummer: '12345' }), o('Björkhult', 'pagaende', { typ: 'gallring' }), o('Ekeby gammal', 'avslutat')];
    expect(grupperaObjekt(rader, { sok: 'eke' }).planerade).toHaveLength(1);
    expect(grupperaObjekt(rader, { sok: 'eke' }).avslutade).toHaveLength(1);
    expect(grupperaObjekt(rader, { sok: 'södra' }).planerade).toHaveLength(1);
    expect(grupperaObjekt(rader, { sok: '12345' }).planerade).toHaveLength(1);
    expect(grupperaObjekt(rader, { sok: 'gallring' }).pagar).toHaveLength(1);
    expect(grupperaObjekt(rader, { sok: 'finns inte' }).pagar).toHaveLength(0);
    expect(sokTraff(rader[0], '  ')).toBe(true);
  });
});

describe('raden: typ · källa · m³ och avståndet', () => {
  it('radMeta: det som finns, i ordningen typ · källa · m³', () => {
    expect(radMeta({ id: 'a', typ: 'slutavverkning', bolag: 'Södra', volym: 1200 })).toBe('Slutavverkning · Södra · 1 200 m³');
    expect(radMeta({ id: 'a', typ: 'grot', volym: 80 })).toBe('GROT · 80 m³');
    expect(radMeta({ id: 'a', bolag: 'Vida' })).toBe('Vida');   // okänd typ och ingen volym → inget gissat
    expect(radMeta({ id: 'a' })).toBe('');
  });
  it('volymText: 0, saknad och skräp ger tom sträng', () => {
    expect(volymText(0)).toBe('');
    expect(volymText(null)).toBe('');
    expect(volymText('abc')).toBe('');
    expect(volymText('450,6')).toBe('451 m³');
  });
  it('kmText: decimalkomma, meter under 1 km, ~ för fågelväg', () => {
    expect(kmText(19.8)).toBe('19,8 km');
    expect(kmText(20)).toBe('20,0 km');
    expect(kmText(0.85)).toBe('850 m');
    expect(kmText(19.84, true)).toBe('~19,8 km');
    expect(kmText(null)).toBe('');
  });
  it('fagelKm: Karlskrona–Växjö ≈ 80 km fågelväg', () => {
    const km = fagelKm(56.16, 15.59, 56.88, 14.81);
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(110);
  });
});

describe('anvandObjektLista — bara planeringsvyn, aldrig maskinläge, /maskin eller körvy', () => {
  it('sanningstabellen', () => {
    expect(anvandObjektLista({ maskinlage: false, maskinSom: false, korvyActive: false })).toBe(true);
    expect(anvandObjektLista({ maskinlage: true, maskinSom: false, korvyActive: false })).toBe(false);   // maskindator / visa som maskin
    expect(anvandObjektLista({ maskinlage: false, maskinSom: true, korvyActive: false })).toBe(false);    // /maskin?som=
    expect(anvandObjektLista({ maskinlage: false, maskinSom: false, korvyActive: true })).toBe(false);    // körvyn
    expect(anvandObjektLista({ maskinlage: true, maskinSom: true, korvyActive: true })).toBe(false);
  });
});

describe('skotning kvar och Här i grupperaObjekt', () => {
  const vallust = o('Vällust RP M-R -25', 'avslutat', { vo_nummer: 'VO-V', ar: 2026, manad: 9, avslutad_timestamp: '2026-09-01T10:00:00Z' } as any);
  const klar = o('Klart', 'avslutat', { vo_nummer: 'VO-K' });
  const gammal = o('Gammal', 'klar', { vo_nummer: 'VO-G' });
  const ekeby = o('Ekeby', 'planerad', { vo_nummer: 'VO-E' });
  const sjo = o('Sjö', 'pagaende', { vo_nummer: 'VO-S' });
  const lista = [vallust, klar, gammal, ekeby, sjo];

  it('avslutat + skotning kvar (Vällust-formen) → Pågår; skotningen klar → Avslutade', () => {
    const med = grupperaObjekt(lista, { skotningKvar: new Set(['VO-V']) });
    expect(med.pagar.map((x) => x.id).sort()).toEqual(['Sjö', 'Vällust RP M-R -25']);
    expect(med.planerade.map((x) => x.id)).toEqual(['Ekeby']);
    expect(med.avslutade.map((x) => x.id).sort()).toEqual(['Gammal', 'Klart']);
    const utan = grupperaObjekt(lista, { skotningKvar: new Set() });
    expect(utan.pagar.map((x) => x.id)).toEqual(['Sjö']);
    expect(utan.avslutade.map((x) => x.id)).toContain('Vällust RP M-R -25');
    expect(grupperaObjekt(lista).avslutade.map((x) => x.id)).toContain('Vällust RP M-R -25');   // okänt = ingen markering
  });

  it('bara status "avslutat" kan ha skotning kvar — den gamla "klar", planerade och pågående påverkas inte', () => {
    const alla = new Set(['VO-V', 'VO-K', 'VO-G', 'VO-E', 'VO-S']);
    expect(arSkotningKvar(gammal, alla)).toBe(false);
    expect(arSkotningKvar(ekeby, alla)).toBe(false);
    expect(arSkotningKvar(sjo, alla)).toBe(false);
    expect(arSkotningKvar(vallust, alla)).toBe(true);
    expect(arSkotningKvar({ status: 'avslutat', vo_nummer: null }, alla)).toBe(false);             // utan VO ingen nyckel
    expect(effektivGrupp(vallust, alla)).toBe('pagar');
    expect(effektivGrupp(gammal, alla)).toBe('avslutade');
  });

  it('Här: ett objekt i exakt en grupp, överst, oavsett status — men aldrig avslutat utan virke kvar', () => {
    const g = grupperaObjekt(lista, { arHar: () => true, skotningKvar: new Set(['VO-V']) });
    expect(g.har.map((x) => x.id).sort()).toEqual(['Ekeby', 'Sjö', 'Vällust RP M-R -25']);
    expect(g.pagar).toEqual([]);
    expect(g.planerade).toEqual([]);
    expect(g.avslutade.map((x) => x.id).sort()).toEqual(['Gammal', 'Klart']);                              // arHar sa ja för alla, men avslutade släpps inte in
    const total = g.har.length + g.pagar.length + g.planerade.length + g.oplanerade.length + g.avslutade.length;
    expect(total).toBe(lista.length);
  });

  it('Här anropas aldrig för avslutade utan virke kvar', () => {
    const fragade: string[] = [];
    grupperaObjekt(lista, { arHar: (x) => { fragade.push(x.id); return false; } });
    expect(fragade.sort()).toEqual(['Ekeby', 'Sjö']);
  });

  it('utan träff är Här tom, och sorteringen i Här är närmast först', () => {
    expect(grupperaObjekt(lista, { arHar: () => false }).har).toEqual([]);
    const avst: Record<string, number> = { Ekeby: 9, Sjö: 2 };
    const g = grupperaObjekt(lista, { arHar: () => true, avstandKm: (x) => avst[x.id] });
    expect(g.har.map((x) => x.id)).toEqual(['Sjö', 'Ekeby']);
  });

  it('sökning gäller även Här och skotning kvar', () => {
    const g = grupperaObjekt(lista, { sok: 'vällust', arHar: (x) => x.id === 'Vällust RP M-R -25', skotningKvar: new Set(['VO-V']) });
    expect(g.har.map((x) => x.id)).toEqual(['Vällust RP M-R -25']);
    expect(g.pagar.length + g.planerade.length + g.avslutade.length).toBe(0);
  });
});

describe('Avslutade — typer, vald typ, sortering och datum', () => {
  const a = (id: string, typ: string | null, ts: string | null, extra: Partial<ListObjekt> = {}) => o(id, 'avslutat', { typ, avslutad_timestamp: ts, ...extra });
  const lista = [
    a('s1', 'slutavverkning', '2026-08-01T10:00:00Z'), a('s2', 'slutavverkning', '2026-10-05T08:30:00Z'), a('s3', 'slutavverkning', null),
    a('g1', 'gallring', '2026-10-01T10:00:00Z'), a('t1', 'grot', '2026-09-20T10:00:00Z'),
  ];

  it('avslutadTyp: huvudtypen som raden visar; GROT via avverkningsform; okänd typ gissas aldrig', () => {
    expect(avslutadTyp(a('x', 'gallring', null))).toBe('gallring');
    expect(avslutadTyp(a('x', 'slutavverkning', null, { avverkningsform: 'Biobränsle' }))).toBe('grot');
    expect(avslutadTyp(a('x', 'energiklippning', null))).toBe('energiklippning');
    expect(avslutadTyp(a('x', null, null))).toBe('okand');
  });
  it('avslutadeTyper: bara typer som finns, flest först, lika antal i fast ordning', () => {
    expect(avslutadeTyper(lista).map((t) => `${t.etikett} ${t.antal}`)).toEqual(['Slutavverkning 3', 'Gallring 1', 'GROT 1']);
    expect(avslutadeTyper([a('x', 'grot', null), a('y', 'gallring', null)]).map((t) => t.typ)).toEqual(['gallring', 'grot']);
    expect(avslutadeTyper([])).toEqual([]);
  });
  it('valdAvslutadTyp: vald om den finns, annars den med flest; inga objekt → null', () => {
    expect(valdAvslutadTyp(lista, null)).toBe('slutavverkning');
    expect(valdAvslutadTyp(lista, 'grot')).toBe('grot');
    expect(valdAvslutadTyp(lista, 'energiklippning')).toBe('slutavverkning');   // vald typ finns inte längre (t.ex. efter sökning)
    expect(valdAvslutadTyp([], 'grot')).toBeNull();
  });
  it('sorteringen: senast avslutat först, utan datum sist — och avslutadeAvTyp behåller den', () => {
    const g = grupperaObjekt(lista);
    expect(g.avslutade.map((x) => x.id)).toEqual(['s2', 'g1', 't1', 's1', 's3']);
    expect(avslutadeAvTyp(g.avslutade, 'slutavverkning').map((x) => x.id)).toEqual(['s2', 's1', 's3']);
    expect(avslutadeAvTyp(g.avslutade, null)).toEqual([]);
  });
  it('avslutsDatum: de tio första tecknen (som dagens "Avslutat 2026-10-05"); saknat eller trasigt → null', () => {
    expect(avslutsDatum({ avslutad_timestamp: '2026-10-05T08:30:00Z' })).toBe('2026-10-05');
    expect(avslutsDatum({ avslutad_timestamp: null })).toBeNull();
    expect(avslutsDatum({ avslutad_timestamp: 'igår' })).toBeNull();
  });
  it('avslutadMeta: "Avslutat <datum> · källa · m³"; med medTyp står typen före källan; utan datum ett streck', () => {
    const x = a('x', 'gallring', '2026-10-05T08:30:00Z', { bolag: 'Södra', volym: 1200 });
    expect(avslutadMeta(x, false).replace(/\s/g, ' ')).toBe('Avslutat 2026-10-05 · Södra · 1 200 m³');
    expect(avslutadMeta(x, true).replace(/\s/g, ' ')).toBe('Avslutat 2026-10-05 · Gallring · Södra · 1 200 m³');
    expect(avslutadMeta(a('y', 'gallring', null), false)).toBe('Avslutat —');
  });
});
