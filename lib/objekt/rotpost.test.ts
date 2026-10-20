import { describe, it, expect } from 'vitest';
import namn from './__fixtures__/objektnamn_prod_2026-10-20.json';
import { RP_I_NAMN, arRotpost } from './rotpost';
import { volymFragor } from './filenGav';

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

  it('PDF eller inskrivet tal = den finns; en avslutad trakt frågas aldrig', () => {
    expect(fraga({ avtalsform: 'Rp', stamplingslangd_url: 'sl.pdf' })).toEqual([]);
    expect(fraga({ avtalsform: 'Rp', stamplingslangd_volym: 1884, stamplingslangd_enhet: 'm3sk' })).toEqual([]);
    expect(fraga({ avtalsform: 'Rp', status: 'avslutat' })).toEqual([]);
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
