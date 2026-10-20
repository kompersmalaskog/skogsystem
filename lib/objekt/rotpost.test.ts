import { describe, it, expect } from 'vitest';
import namn from './__fixtures__/objektnamn_prod_2026-10-20.json';
import { RP_I_NAMN, arRotpost } from './rotpost';
import { oppnaFragor, stamplingslangdLage, volymFragor } from './filenGav';
import { saknas } from './tillstand';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GISSNING = [{ nyckel: 'okand_pdf:Skälviken.pdf', sort: 'fraga', text: '"Skälviken.pdf" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.', fil: 'Skälviken.pdf', ledtrad: 'info_namnde_stamplingslangd' }];
const REN = { typ: 'slutavverkning', volym: 1000, areal: 5, status: 'planerad', stamplingslangd_url: null, import_varningar: [] };

describe('rotpost eller avverkningsuppdrag', () => {
  it('RP i namnet (ordgräns): träffar exakt de nio rotposterna bland alla 69 objektnamn i prod 2026-10-20 — inget annat av misstag', () => {
    expect(namn).toHaveLength(69);
    const traffar = namn.filter(n => RP_I_NAMN.test(n));
    expect(traffar).toEqual([
      'Åbogen RP 2026', 'Arvidstorp RP J-Hus -25', 'Bågskyttebanan RP J-Hus- 25', 'Göljahult RP', 'Mölleryd RP J-Hus -25',
      'Skälviken RP J-Hus -25', 'Spåramåla RP 2025', 'Uggleboda H-A RP -24', 'Vällust RP M-R -25',
    ]);
    // Namn som innehåller bokstäverna rp/Rp utan att vara ordet RP:
    for (const n of ['Åkarp 1:33 Bjurbrant -25', 'Karstorp 1:8 O-A -25', 'Järnemåla Rapp Au', 'Aramo Marcus AU 2026']) expect(RP_I_NAMN.test(n), n).toBe(false);
  });

  it('ordgränsen är Unicode: å/ä/ö räknas som bokstäver (JavaScripts \\b hade träffat "ÅRP" och "RPÄ")', () => {
    for (const n of ['ÅRP 2026', 'RPÄ', 'Xrp RP' + 'x', 'RPM', 'rp 2026', 'Rp 2026']) expect(RP_I_NAMN.test(n), n).toBe(false);
    for (const n of ['RP', 'Vällust RP', 'RP J-Hus', 'Åbogen (RP) 2026', 'Gård-RP-25']) expect(RP_I_NAMN.test(n), n).toBe(true);
  });

  it('avtalsformen avgör när den finns: Rp = rotpost, Au/LRK/VF = inte', () => {
    expect(arRotpost({ avtalsform: 'Rp', namn: 'Utan det där ordet' })).toBe(true);
    expect(arRotpost({ avtalsform: 'rp', namn: '' })).toBe(true);
    expect(arRotpost({ avtalsform: 'Au', namn: 'Mölleryd RP J-Hus -25' })).toBe(false); // fältet går före namnet
    expect(arRotpost({ avtalsform: 'LRK', namn: 'Xxx RP' })).toBe(false);
    expect(arRotpost({ avtalsform: 'VF/Bark', namn: 'Xxx RP' })).toBe(false);
  });

  it('avtalsform saknas → RP i namnet; varken eller → inte rotpost', () => {
    expect(arRotpost({ avtalsform: null, namn: 'Bågskyttebanan RP J-Hus- 25' })).toBe(true);
    expect(arRotpost({ avtalsform: '  ', namn: 'Göljahult RP' })).toBe(true);
    expect(arRotpost({ avtalsform: null, namn: 'Betet gallring 2026' })).toBe(false);
    expect(arRotpost({})).toBe(false);
  });
});

describe('frågan "stämplingslängd saknas"', () => {
  const fraga = (o: Record<string, unknown>) => volymFragor({ ...REN, ...o } as any).filter(f => f.nyckel === 'stamplingslangd_saknas');

  it('Rp och ingen stämplingslängd → fråga, oavsett typ', () => {
    expect(fraga({ avtalsform: 'Rp', typ: 'slutavverkning' })).toHaveLength(1);
    expect(fraga({ avtalsform: 'Rp', typ: 'gallring' })).toHaveLength(1); // en gallring kan vara rotpost
  });

  it('Au → aldrig', () => {
    expect(fraga({ avtalsform: 'Au', typ: 'slutavverkning' })).toEqual([]);
    expect(fraga({ avtalsform: 'Au', typ: 'gallring', namn: 'N Rimshult gallring' })).toEqual([]);
  });

  it('avtalsform saknas: RP i namnet avgör; annars ingen fråga', () => {
    expect(fraga({ namn: 'Mölleryd RP J-Hus -25' })).toHaveLength(1);
    expect(fraga({ namn: 'Hössjömåla Gallring 25' })).toEqual([]);
    expect(fraga({ namn: 'Åkarp 1:33 Bjurbrant -25' })).toEqual([]);
  });

  it('ett INSKRIVET tal är det enda som bekräftar; en avslutad trakt frågas aldrig', () => {
    expect(fraga({ avtalsform: 'Rp', stamplingslangd_volym: 1884, stamplingslangd_enhet: 'm3sk' })).toEqual([]);
    expect(fraga({ avtalsform: 'Rp', status: 'avslutat' })).toEqual([]);
    expect(fraga({ avtalsform: 'Rp', status: 'avslutat', import_varningar: GISSNING, stamplingslangd_url: 'sl.pdf' })).toEqual([]);
  });

  it('en GISSAD PDF tystar inte frågan — Skälviken: URL finns, importen gissade, ingen har läst papperet', () => {
    const f = fraga({ avtalsform: 'Rp', stamplingslangd_url: 'sl.pdf', import_varningar: GISSNING });
    expect(f).toHaveLength(1);
    expect(f[0].text).toContain('gissade');
    expect(f[0].text).toContain('Skälviken.pdf');
    expect(f[0]).toMatchObject({ fil: 'Skälviken.pdf', path: 'sl.pdf' });
  });

  it('en PDF som importen KÄNDE IGEN på filnamnet (ingen OSÄKER-rad) är ingen gissning — ingen fråga (Åbogen)', () => {
    expect(fraga({ avtalsform: 'Rp', stamplingslangd_url: 'sl.pdf' })).toEqual([]);
    expect(fraga({ avtalsform: 'Rp', stamplingslangd_url: 'sl.pdf', import_varningar: [{ nyckel: 'okand_pdf:Annan.pdf', sort: 'fraga', text: 'x', fil: 'Annan.pdf' }] })).toEqual([]);
  });

  it('gissad PDF + inskrivet tal = bekräftad: ingen fråga, och gissningens PDF-fråga faller på en rotpost', () => {
    const o = { avtalsform: 'Rp', stamplingslangd_url: 'sl.pdf', stamplingslangd_volym: 1884, stamplingslangd_enhet: 'm3sk', import_varningar: GISSNING };
    expect(fraga(o)).toEqual([]);
    expect(oppnaFragor({ ...o, ovriga_dokument: null })).toEqual([]);
  });
  it('jämförelsen mot volymen görs bara på en rotpost', () => {
    const tal = { stamplingslangd_volym: 1884, stamplingslangd_enhet: 'm3sk', volym: 3495, areal: 5.68 };
    expect(volymFragor({ ...REN, ...tal, avtalsform: 'Rp' } as any).map(f => f.nyckel)).toContain('stamplingslangd_avviker');
    expect(volymFragor({ ...REN, ...tal, avtalsform: 'Au' } as any).map(f => f.nyckel)).not.toContain('stamplingslangd_avviker');
  });

  it('en oidentifierad PDF nämns i frågan', () => {
    const okand = [{ nyckel: 'okand_pdf:Mölleryd.pdf', sort: 'fraga', text: 'x', fil: 'Mölleryd.pdf' }];
    expect(fraga({ avtalsform: 'Rp', import_varningar: okand })[0].text).toContain('kan det vara stämplingslängden?');
    expect(fraga({ avtalsform: 'Rp' })[0].text).not.toContain('kan det vara');
  });
});


describe('stämplingslängdens läge', () => {
  it('bekräftad = tal inskrivet; gissad = PDF + OSÄKER-rad; pdf = PDF utan gissning; saknas = inget', () => {
    expect(stamplingslangdLage({ stamplingslangd_volym: 1884 })).toBe('bekraftad');
    expect(stamplingslangdLage({ stamplingslangd_volym: 1884, stamplingslangd_url: 'x.pdf', import_varningar: GISSNING })).toBe('bekraftad');
    expect(stamplingslangdLage({ stamplingslangd_url: 'x.pdf', import_varningar: GISSNING })).toBe('gissad');
    expect(stamplingslangdLage({ stamplingslangd_url: 'x.pdf', import_varningar: [] })).toBe('pdf');
    expect(stamplingslangdLage({})).toBe('saknas');
    expect(stamplingslangdLage({ stamplingslangd_volym: 0 })).toBe('saknas');
    // En gissning vars PDF aldrig laddades upp är ingen PDF att visa.
    expect(stamplingslangdLage({ import_varningar: GISSNING })).toBe('saknas');
  });

  it('listraden räknar gissningen EN gång (inte både som PDF-fråga och som volymfråga) och en avslutad rotpost inte alls', () => {
    const skalviken = { ...REN, namn: 'Skälviken RP J-Hus -25', avtalsform: 'Rp', stamplingslangd_url: 'x.pdf', import_varningar: GISSNING, kalla: 'envz', traktdirektiv_url: 'td.pdf', ovriga_dokument: null };
    expect(saknas(skalviken as any)).toEqual(['1 fråga']);
    expect(saknas({ ...skalviken, status: 'avslutat' } as any)).toEqual([]);
  });
});

describe('objekt.atgard används aldrig för att avgöra rotpost (prod 2026-10-20)', () => {
  // De nio rotposterna som atgard/avtalsform stod i prod. Bågskyttebanan: atgard 'Au' men avtalsform 'Rp' — fälten säger emot varandra.
  const NIO = [
    { namn: 'Åbogen RP 2026', atgard: 'Rp', avtalsform: null },
    { namn: 'Arvidstorp RP J-Hus -25', atgard: null, avtalsform: 'Rp' },
    { namn: 'Bågskyttebanan RP J-Hus- 25', atgard: 'Au', avtalsform: 'Rp' },
    { namn: 'Göljahult RP', atgard: null, avtalsform: null },
    { namn: 'Mölleryd RP J-Hus -25', atgard: 'Au', avtalsform: null },
    { namn: 'Skälviken RP J-Hus -25', atgard: 'Au', avtalsform: null },
    { namn: 'Spåramåla RP 2025', atgard: 'Au', avtalsform: null },
    { namn: 'Uggleboda H-A RP -24', atgard: null, avtalsform: null },
    { namn: 'Vällust RP M-R -25', atgard: 'Au', avtalsform: null },
  ];

  it('alla nio är rotposter oavsett vad atgard säger', () => {
    for (const o of NIO) expect(arRotpost(o as any), o.namn).toBe(true);
  });

  it('atgard avgör inget: Au i atgard slår inte Rp i avtalsform, och Rp i atgard räddar inget namnlöst objekt', () => {
    expect(NIO.filter(o => o.atgard === 'Au')).toHaveLength(5); // fem av nio ser ut som avverkningsuppdrag om man läser fel fält
    expect(arRotpost({ atgard: 'Au', avtalsform: 'Rp', namn: 'Bågskyttebanan RP J-Hus- 25' } as any)).toBe(true);
    expect(arRotpost({ atgard: 'Rp', avtalsform: null, namn: 'Betet gallring 2026' } as any)).toBe(false);
    expect(arRotpost({ atgard: 'Rp' } as any)).toBe(false);
  });

  it('två rotposter har varken atgard eller avtalsform och fångas bara av namnreserven', () => {
    for (const namn of ['Göljahult RP', 'Uggleboda H-A RP -24']) {
      expect(arRotpost({ avtalsform: null, namn })).toBe(true);
      expect(arRotpost({ avtalsform: null, namn: namn.replace(' RP', '') })).toBe(false);
    }
  });

  it('källan: ingen kod som avgör rotpost eller ställer frågan nämner atgard (kommentarer undantagna)', () => {
    const utanKommentarer = (fil: string) => readFileSync(join(process.cwd(), fil), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
    for (const fil of ['lib/objekt/rotpost.ts', 'lib/objekt/filenGav.ts', 'lib/objekt/tillstand.ts', 'app/objekt/_components/FilenGavVy.tsx']) {
      expect(utanKommentarer(fil), fil).not.toMatch(/atgard/i);
    }
  });
});
