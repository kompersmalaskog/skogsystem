import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixtur from './__fixtures__/stickprov_dragningar.json';
import {
  beslutskort,
  dragenText,
  forklaringText,
  kategorisera,
  klusterRad,
  raknaOmDragning,
  stammerDragningen,
  vantatText,
  type ListRad,
  type Stickprov,
  type StickprovKandidat,
} from './egenkontrollStickprov';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

// 24 verkliga dragningar ur Postgres (lokal körning av del 5b mot prod-objekten: september → oktober, oktober → november), varav 4 med
// 'for_langt' och 6 där första ankaret saknade granne. Omräkningen i TypeScript ska ge EXAKT samma ankare, samma valda i samma ordning
// och samma antal prövade ankare — det är beviset för att urvalet går att räkna om utan databasen.
type Rad = (typeof fixtur)[number];
const tillStickprov = (r: Rad): Stickprov => ({
  manad: '2026-11-01', kalla_manad: '2026-10-01', dragen_vid: '2026-11-01T00:05:00Z', algoritm_version: 2, max_antal: 3,
  ...(r as unknown as Omit<Stickprov, 'manad' | 'kalla_manad' | 'dragen_vid' | 'algoritm_version' | 'max_antal'>),
});

describe('omräkning av dragningen ur fro + kandidaterna', () => {
  it('alla 24 verkliga dragningar räknas om till exakt det databasen sparade', () => {
    for (const r of fixtur) {
      const s = tillStickprov(r);
      const o = raknaOmDragning(s.fro, s.kandidater, md5, s.troskel_km, s.max_antal)!;
      expect(o.ankareId).toBe(r.ankare_objekt_id);
      expect(o.ankareIndex).toBe(r.ankare_index);
      expect(o.ankareForsok).toBe(r.ankare_forsok);
      expect(o.valda.map((v) => v.objekt_id)).toEqual([...r.valda].sort((a, b) => a.ordning - b.ordning).map((v) => v.objekt_id));
      expect(o.spridningKm).toBe(r.spridning_km);
      expect(o.forklaring).toBe(r.forklaring);
      expect(stammerDragningen(s, md5)).toBe(true);
    }
  });

  it('fixturen innehåller de fall som spelar roll (annars bevisar den för lite)', () => {
    expect(fixtur.some((r) => r.forklaring === 'for_langt')).toBe(true);
    expect(fixtur.some((r) => (r.ankare_forsok ?? 0) > 1)).toBe(true);
    expect(fixtur.some((r) => r.forklaring === 'full')).toBe(true);
  });

  it('en rad som ändrats i efterhand stämmer inte längre', () => {
    const r = fixtur.find((x) => (x.ankare_forsok ?? 0) > 1 && x.valda.length >= 2)!;
    const s = tillStickprov(r);
    expect(stammerDragningen(s, md5)).toBe(true);
    expect(stammerDragningen({ ...s, ankare_objekt_id: s.kandidater.find((k) => k.id !== s.ankare_objekt_id)!.id }, md5)).toBe(false);
    expect(stammerDragningen({ ...s, ankare_forsok: (s.ankare_forsok ?? 0) + 1 }, md5)).toBe(false);
    expect(stammerDragningen({ ...s, valda: [...s.valda].reverse().map((v, i) => ({ ...v, ordning: i + 1 })) }, md5)).toBe(false);
    expect(stammerDragningen({ ...s, valda: s.valda.slice(0, 1) }, md5)).toBe(false);
    expect(stammerDragningen({ ...s, fro: `${s.fro}x` }, md5)).toBe(false);
  });

  it('ett annat fro ger (nästan alltid) ett annat resultat — slumpen är fro, inget annat', () => {
    const r = fixtur[0];
    const s = tillStickprov(r);
    const ankare = new Set<string>();
    for (let i = 0; i < 40; i++) ankare.add(raknaOmDragning(`prov-${i}`, s.kandidater, md5)!.ankareId);
    expect(ankare.size).toBeGreaterThan(2);
  });
});

const k = (id: string, lat: number | null, lng: number | null, extra: Partial<StickprovKandidat> = {}): StickprovKandidat =>
  ({ id, namn: id, typ: 'gallring', lat, lng, avslutat: '2026-10-10T10:00:00Z', ...extra });

describe('kantfall', () => {
  it('inga kandidater → null', () => {
    expect(raknaOmDragning('x', [], md5)).toBeNull();
  });

  it('inget kluster: ett ensamt objekt, det första i fro-ordning, ankare_forsok = antalet kandidater, förklaring for_langt', () => {
    const kand = [k('a', 55.5, 13), k('b', 57.5, 15), k('c', 59.5, 17)];
    const o = raknaOmDragning('fro-1', kand, md5)!;
    const forst = [...kand].sort((x, y) => (md5(`fro-1:${x.id}`) < md5(`fro-1:${y.id}`) ? -1 : 1))[0].id;
    expect(o.valda).toHaveLength(1);
    expect(o.ankareId).toBe(forst);
    expect(o.ankareForsok).toBe(3);
    expect(o.forklaring).toBe('for_langt');
    expect(o.spridningKm).toBeNull();
  });

  it('ett kluster + en ensam: den ensamma dras aldrig så länge ett kluster finns', () => {
    const kand = [k('a', 56.4, 14.8), k('b', 56.41, 14.81), k('ensam', 58, 16)];
    for (let i = 0; i < 60; i++) {
      const o = raknaOmDragning(`f${i}`, kand, md5)!;
      expect(o.valda.map((v) => v.objekt_id).sort()).toEqual(['a', 'b']);
      expect(o.forklaring).toBe('for_langt');   // två av tre möjliga: den tredje låg för långt bort
    }
  });

  it('tunn månad: två nära varandra → två valda, förklaring tunn_manad', () => {
    const o = raknaOmDragning('x', [k('a', 56.4, 14.8), k('b', 56.45, 14.85)], md5)!;
    expect(o.valda).toHaveLength(2);
    expect(o.forklaring).toBe('tunn_manad');
  });

  it('närheten slår antalet: tre i klustret men en bara nåbar via ankaret på > 15 km → två, inte tre', () => {
    // a–b 8 km, b–c 8 km, a–c 16 km: ankaret b får båda, ankaret a eller c bara en
    const kand = [k('a', 56.4, 14.8), k('b', 56.4, 14.8 + 8 / (111.2 * Math.cos(56.4 * Math.PI / 180))), k('c', 56.4, 14.8 + 16 / (111.2 * Math.cos(56.4 * Math.PI / 180)))];
    const antal = new Set<number>();
    for (let i = 0; i < 80; i++) antal.add(raknaOmDragning(`g${i}`, kand, md5)!.valda.length);
    expect([...antal].sort()).toEqual([2, 3]);
  });

  it('kandidat utan koordinat är aldrig granne; ankare utan plats dras bara när inget kluster finns', () => {
    const kand = [k('a', 56.4, 14.8), k('b', 56.41, 14.81), k('utan', null, null)];
    for (let i = 0; i < 40; i++) {
      const o = raknaOmDragning(`h${i}`, kand, md5)!;
      expect(o.valda.map((v) => v.objekt_id)).not.toContain('utan');
    }
    const bara = raknaOmDragning('h', [k('utan', null, null)], md5)!;
    expect(bara.valda).toHaveLength(1);
    expect(bara.forklaring).toBe('ankare_utan_plats');
  });

  it('(0, 0) räknas som saknad plats', () => {
    const o = raknaOmDragning('h', [k('nollpunkt', 0, 0), k('a', 56.4, 14.8), k('b', 56.41, 14.81)], md5)!;
    expect(o.valda.map((v) => v.objekt_id)).not.toContain('nollpunkt');
  });
});

describe('texter', () => {
  const s3 = { valda: [1, 2, 3].map((i) => ({ objekt_id: String(i), namn: null, ordning: i, km_fran_ankare: 0 })), spridning_km: 14.8 };
  it('klusterraden är fågelväg och sägs rakt ut', () => {
    expect(klusterRad(s3)).toBe('3 objekt · 14,8 km mellan de som ligger längst isär');
    expect(klusterRad({ valda: s3.valda.slice(0, 1), spridning_km: null })).toBe('1 objekt');
    expect(klusterRad({ valda: [], spridning_km: null })).toBe('');
  });

  it('förklaringen finns bara när det inte blev tre', () => {
    const kand = [k('a', 1, 1), k('b', 1, 1), k('c', 1, 1)];
    expect(forklaringText({ forklaring: 'full', kandidater: kand, troskel_km: 15 })).toBeNull();
    expect(forklaringText({ forklaring: 'tunn_manad', kandidater: kand.slice(0, 2), troskel_km: 15 })).toBe('Förra månaden avslutades bara 2 objekt.');
    expect(forklaringText({ forklaring: 'for_langt', kandidater: kand, troskel_km: 15 })).toBe('Resten av förra månadens objekt ligger mer än 15 km från de dragna.');
    expect(forklaringText({ forklaring: 'ankare_utan_plats', kandidater: kand, troskel_km: 15 })).toContain('saknar plats');
    expect(forklaringText({ forklaring: 'inga_objekt', kandidater: [], troskel_km: 15 })).toBe('Inga objekt avslutades förra månaden.');
  });

  it('dragen-raden visar svensk dag (1 nov 00:05 svensk tid är 31 okt 23:05 UTC)', () => {
    expect(dragenText({ dragen_vid: '2026-10-31T23:05:00Z', kandidater: [k('a', 1, 1), k('b', 1, 1)] })).toBe('Dragen 1 nov · förra månaden hade 2 objekt');
  });

  it('väntetid i kalenderdagar', () => {
    const nu = new Date(2026, 9, 20, 12, 0);
    expect(vantatText(new Date(2026, 7, 10, 23, 30).toISOString(), nu)).toBe('väntat 71 dagar');
    expect(vantatText(new Date(2026, 9, 19, 8, 0).toISOString(), nu)).toBe('väntat 1 dag');
    expect(vantatText(new Date(2026, 9, 20, 6, 0).toISOString(), nu)).toBe('avslutat idag');
    expect(vantatText('skräp', nu)).toBe('okänt hur länge');
  });
});

describe('kategorier och kortet', () => {
  const rad = (id: string, rundstatus: ListRad['rundstatus'], avslutat: string, typ: string | null = 'slutavverkning'): ListRad =>
    ({ objekt_id: id, rundstatus, avslutat, lat: 56, lng: 14, typ });
  const rader = [
    rad('d1', 'ej_startad', '2026-10-05'), rad('d2', 'pagaende', '2026-10-06'), rad('d3', 'klar', '2026-10-07'),
    rad('p1', 'pagaende', '2026-08-01'), rad('p2', 'pagaende', '2026-09-01'),
    rad('k1', 'klar', '2026-05-01'), rad('k2', 'klar', '2026-06-01'),
    rad('e1', 'ej_startad', '2026-08-20'), rad('e2', 'ej_startad', '2026-07-01'), rad('grot', 'ej_startad', '2026-06-01', 'grot'), rad('okand', 'ej_startad', '2026-06-02', null),
  ];
  const valda = [{ objekt_id: 'd2', ordning: 2 }, { objekt_id: 'd1', ordning: 1 }, { objekt_id: 'finns-inte', ordning: 3 }, { objekt_id: 'd3', ordning: 4 }] as Stickprov['valda'];

  it('månaden = de dragna i dragningens ordning; varje objekt ligger på ETT ställe', () => {
    const kat = kategorisera(rader, { valda });
    expect(kat.manad.map((r) => r.objekt_id)).toEqual(['d1', 'd2', 'd3']);
    expect(kat.kvar).toBe(2);
    expect(kat.paborjade.map((r) => r.objekt_id)).toEqual(['p1', 'p2']);
    expect(kat.klara.map((r) => r.objekt_id)).toEqual(['k2', 'k1']);
    expect(kat.annat.map((r) => r.objekt_id)).toEqual(['e2', 'e1']);
    const alla = [...kat.manad, ...kat.paborjade, ...kat.klara, ...kat.annat].map((r) => r.objekt_id);
    expect(new Set(alla).size).toBe(alla.length);
  });

  it('GROT och okänd typ går inte att starta och listas inte under annat', () => {
    const kat = kategorisera(rader, null);
    expect(kat.annat.map((r) => r.objekt_id)).not.toContain('grot');
    expect(kat.annat.map((r) => r.objekt_id)).not.toContain('okand');
  });

  it('utan dragning: ingen månad, inget kvar', () => {
    const kat = kategorisera(rader, null);
    expect(kat.manad).toEqual([]);
    expect(kat.kvar).toBe(0);
    expect(kat.paborjade.map((r) => r.objekt_id)).toEqual(['p1', 'p2', 'd2']);   // d2 hör inte längre till en dragning
  });

  it('kortet: en påbörjad DRAGEN runda går före allt (färdigställ innan du börjar nytt)', () => {
    const kat = kategorisera(rader, { valda });
    expect(beslutskort(kat)?.objekt_id).toBe('d2');
  });

  it('kortet: annars en dragen ej startad — närmast när avståndet är känt, annars längst väntat', () => {
    const kat = kategorisera(rader.filter((r) => r.objekt_id !== 'd2'), { valda: [{ objekt_id: 'd1', ordning: 1 }, { objekt_id: 'e1', ordning: 2 }] as Stickprov['valda'] });
    expect(beslutskort(kat)?.objekt_id).toBe('e1');   // e1 avslutades före d1
    expect(beslutskort(kat, (id) => (id === 'd1' ? 3 : 30))?.objekt_id).toBe('d1');
    expect(beslutskort(kat, (id) => (id === 'd1' ? 3 : null))?.objekt_id).toBe('e1');   // delvis känt avstånd räknas inte — hellre väntetiden än en halv sanning
    // och tvärtom: det äldsta objektet har känt avstånd, det nyare saknar — det nyare får inte vinna på att "saknat" läses som 0
    expect(beslutskort(kat, (id) => (id === 'e1' ? 30 : null))?.objekt_id).toBe('e1');
  });

  it('kortet: utan dragning (eller allt dragit klart) → påbörjade först, sedan det som väntat längst', () => {
    const utan = kategorisera(rader, null);
    expect(beslutskort(utan)?.objekt_id).toBe('p1');
    const klart = kategorisera(rader.filter((r) => r.rundstatus !== 'pagaende'), { valda: [{ objekt_id: 'd3', ordning: 1 }] as Stickprov['valda'] });
    expect(beslutskort(klart)?.objekt_id).toBe('e2');
  });

  it('kortet: inget att göra → null', () => {
    expect(beslutskort(kategorisera([rad('k', 'klar', '2026-01-01')], null))).toBeNull();
  });
});
