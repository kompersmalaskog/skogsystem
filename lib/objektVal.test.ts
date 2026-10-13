import { describe, it, expect } from 'vitest';
import { anvandObjektLista, fagelKm, grupperaObjekt, kmText, radMeta, sokTraff, statusGrupp, volymText, type ListObjekt } from './objektVal';

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
  it('avslutade hamnar ALDRIG under Planerade (eller Pågår/Oplanerade), oavsett planerad månad eller kvarvarande skotning', () => {
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
    expect(radMeta({ id: 'a', typ: 'grot', volym: 80 })).toBe('Grot · 80 m³');
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
