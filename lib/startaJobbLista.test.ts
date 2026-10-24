import { describe, it, expect } from 'vitest';
import { byggJobbVyer, grupperaJobb, sokJobb, type JobbIndataLista } from './startaJobbLista';

// Prod-format 2026-10-24: P-1023 har sin data under 880808 via dim_objekt_id (inget maskinobjekt bär P-1023),
// P-1025 via extra numret k53 på R64428, P-1017 inget alls, P-1024 avslutat, P-1012 bara som maskinobjekt.
const MASKINER = [
  { maskin_id: 'R64428', visningsnamn: 'H8E -26', maskin_typ: 'Harvester' },
  { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder' },
  { maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Giant', maskin_typ: 'Harvester' },
  { maskin_id: 'JD810E', visningsnamn: '810E', maskin_typ: 'Forwarder' },
];

const bas = (): JobbIndataLista => ({
  objekt: [
    { id: 'o25', namn: 'Görgen Gustafsson Trolleboda', vo_nummer: 'P-1025', typ: 'slutavverkning', status: 'pagaende', ursprung: 'privat', dim_objekt_id: null },
    { id: 'o23', namn: 'Kroksjömåla Grot', vo_nummer: 'P-1023', typ: 'grot', status: 'pagaende', ursprung: 'vanta_vida', dim_objekt_id: '880808' },
    { id: 'o17', namn: 'Kompersmåla väggata', vo_nummer: 'P-1017', typ: null, status: 'oplanerad', ursprung: null },
    { id: 'o24', namn: 'Ljuvadal', vo_nummer: 'P-1024', typ: 'gallring', status: 'avslutat', ursprung: 'privat', dim_objekt_id: 'PONS20SDJAA270231_132' },
  ],
  dimMedVo: [
    { objekt_id: 'PONS20SDJAA270231_132', vo_nummer: 'P-1024', maskin_id: 'PONS20SDJAA270231', start_date: '2026-10-05 13:29:28' },
    { objekt_id: 'R64101_9', vo_nummer: 'P-1012', object_name: 'Steglehylte', maskin_id: 'A030353', start_date: '2026-03-19 08:00:00', huvudtyp: 'Slutavverkning' },
  ],
  dimKopplade: [
    { objekt_id: '880808', maskin_id: 'A030353', start_date: '2026-10-06 15:08:41' },
    { objekt_id: 'R64428_53', maskin_id: 'R64428', start_date: '2026-10-23 07:10:00' },
  ],
  alt: [{ objekt_id: 'o25', nummer: 'k53', maskin_id: 'R64428' }],
  spar: [],
  maskiner: MASKINER,
  idagAr: 2026,
});

const per = (vo: string, i = bas()) => byggJobbVyer(i).find((j) => j.vo === vo)!;

describe('byggJobbVyer — läget på riktiga P-nummer', () => {
  it('P-1023 är TAGEN via dim_objekt_id (inte "ingen data")', () => {
    const j = per('P-1023');
    expect(j.lage).toBe('tagen');
    expect(j.lageText).toBe('Tagen · Wisent · sedan 6 okt');
    expect(j.forvantat).toBe('en_maskin');
  });
  it('P-1025 är tagen via extra numret k53', () => {
    expect(per('P-1025').lageText).toBe('Tagen · H8E -26 · sedan 23 okt');
  });
  it('P-1017 är ledig', () => {
    expect(per('P-1017').lage).toBe('ledig');
  });
  it('P-1024 är klar', () => {
    expect(per('P-1024').lage).toBe('klar');
  });
  it('ett maskinobjekt med P-VO utan planeringsrad syns som taget', () => {
    const j = per('P-1012');
    expect(j.jobbId).toBeNull();
    expect(j.lage).toBe('tagen');
    expect(j.typ).toBe('slutavverkning');
  });
  it('startat utan någon data är "ingen_data"', () => {
    const i = bas();
    i.dimKopplade = i.dimKopplade.filter((d) => d.objekt_id !== '880808');
    expect(per('P-1023', i).lage).toBe('ingen_data');
  });
  it('hyttspår räknas som data (810E skickar inga filer)', () => {
    const i = bas();
    i.spar = [{ objekt_id: 'o17', maskin_id: 'JD810E', roll: 'skotare', datum: '2026-10-20' }];
    expect(per('P-1017', i).lageText).toBe('Tagen · 810E · sedan 20 okt');
  });
  it('egen skotning från jobbet eller från maskinobjektet', () => {
    const i = bas();
    (i.objekt[0] as any).egen_skotning = true;
    expect(per('P-1025', i).forvantat).toBe('bara_skordare');
    const k = bas();
    k.dimKopplade = k.dimKopplade.map((d) => (d.objekt_id === 'R64428_53' ? { ...d, egen_skotning: true } : d));
    expect(per('P-1025', k).egenSkotning).toBe(true);
  });
  it('okänd maskin visas med sitt id, aldrig tom', () => {
    const i = bas();
    i.maskiner = [];
    expect(per('P-1025', i).lageText).toBe('Tagen · R64428 · sedan 23 okt');
  });
});

describe('grupperaJobb och sok', () => {
  it('pågående (taget + startat utan data), lediga, klara — nyast först', () => {
    const g = grupperaJobb(byggJobbVyer(bas()));
    expect(g.pagaende.map((j) => j.vo)).toEqual(['P-1025', 'P-1023', 'P-1012']);
    expect(g.lediga.map((j) => j.vo)).toEqual(['P-1017']);
    expect(g.klara.map((j) => j.vo)).toEqual(['P-1024']);
  });
  it('söker i namn, VO och maskin', () => {
    const l = byggJobbVyer(bas());
    expect(sokJobb(l, 'wisent').map((j) => j.vo).sort()).toEqual(['P-1012', 'P-1023']);
    expect(sokJobb(l, '1017').map((j) => j.vo)).toEqual(['P-1017']);
    expect(sokJobb(l, '  ').length).toBe(l.length);
  });
});
