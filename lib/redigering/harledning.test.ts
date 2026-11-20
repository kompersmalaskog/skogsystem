import { describe, it, expect } from 'vitest';
import { harled, namnAvtalsform, namnTyp, namnBolag, kallorText, type HarledRad } from './harledning';

// Riktiga rader ur dim_objekt (prod 2026-10-23): namn, VO, typ, avtalsform, bolag, cutting_method.
const r = (objekt_id: string, object_name: string, vo_nummer: string, huvudtyp: string | null, avtalsform: string | null, bolag: string | null, cutting_method: string | null = null): HarledRad =>
  ({ objekt_id, object_name, vo_nummer, huvudtyp, avtalsform, bolag, cutting_method });

const MOLLERYD_TOM = r('11166477', 'Mölleryd RP J-Hus -25', '11166477', null, null, null, 'ClearCutting');
const MOLLERYD_FULL = r('11271883', 'Mölleryd RP J-Hus -25', '11271883', 'Slutavverkning', 'Rp', 'Vida', 'ClearCutting');
const SKALVIKEN = r('11271860', 'Skälviken RP J-Hus -25', '11271860', null, null, 'Vida', 'ClearCutting');
const VALLUST_LOV = r('A030353_185', 'Vällust Löv Ga', 'P-1024', null, null, null, null);
const KOMPERSMALA_VF = r('547622', 'Kompersmåla VF 2026', '547622', null, null, '', '');
const ALLA = [MOLLERYD_TOM, MOLLERYD_FULL, SKALVIKEN, VALLUST_LOV, KOMPERSMALA_VF];

describe('harled — säkert bara när två oberoende källor säger samma sak', () => {
  it('Mölleryd (tom rad): typ ur namnet + skördarens fil + samma namn → säker Slutavverkning', () => {
    const h = harled('huvudtyp', MOLLERYD_TOM, ALLA)!;
    expect(h.varde).toBe('Slutavverkning');
    expect(h.saker).toBe(true);
    expect(h.kallor).toEqual(['namnet', 'skördarens fil', 'objektet med samma namn (VO 11271883)']);
  });

  it('Mölleryd: avtalsform ur namnet + samma namn → säker Rp', () => {
    const h = harled('avtalsform', MOLLERYD_TOM, ALLA)!;
    expect(h).toMatchObject({ varde: 'Rp', saker: true });
  });

  it('Mölleryd: bolag bara ur samma namn → förslag, inte säkert', () => {
    const h = harled('bolag', MOLLERYD_TOM, ALLA)!;
    expect(h).toMatchObject({ varde: 'Vida', saker: false, kallor: ['objektet med samma namn (VO 11271883)'] });
  });

  it('Skälviken: typ ur namnet + fil → säker; avtalsform bara ur namnet → förslag Rp', () => {
    expect(harled('huvudtyp', SKALVIKEN, ALLA)).toMatchObject({ varde: 'Slutavverkning', saker: true });
    expect(harled('avtalsform', SKALVIKEN, ALLA)).toMatchObject({ varde: 'Rp', saker: false, kallor: ['namnet'] });
  });

  it('Vällust Löv Ga: bara namnet säger Gallring → förslag', () => {
    expect(harled('huvudtyp', VALLUST_LOV, ALLA)).toMatchObject({ varde: 'Gallring', saker: false });
  });

  it('källor som säger olika ger aldrig säkert (Giants "Gallring Vällust" var ClearCutting i filen)', () => {
    const giant = r('PONS20SDJAA270231_132', 'Gallring Vällust', 'P-1024b', null, null, null, 'ClearCutting');
    const h = harled('huvudtyp', giant, [giant])!;
    expect(h.saker).toBe(false);
    expect(h.varde).toBeNull(); // en mot en: ingen gissning
    expect(h.emot.map(e => e.varde).sort()).toEqual(['Gallring', 'Slutavverkning']);
  });

  it('två mot en är inte säkert: en enda källa som säger emot räcker för att Martin ska fråga', () => {
    const giant = r('PONS20SDJAA270231_132', 'Gallring Vällust', 'P-1024b', null, null, null, 'ClearCutting');
    const h = harled('huvudtyp', giant, [giant], { huvudtyp: 'Gallring' })!;
    expect(h).toMatchObject({ varde: 'Gallring', saker: false, kallor: ['trakten', 'namnet'] });
    expect(h.emot).toEqual([{ varde: 'Slutavverkning', kallor: ['skördarens fil'] }]);
  });

  it('trakten räknas som källa: trakt + namn → säkert', () => {
    expect(harled('huvudtyp', VALLUST_LOV, ALLA, { huvudtyp: 'Gallring' })).toMatchObject({ varde: 'Gallring', saker: true, kallor: ['trakten', 'namnet'] });
  });

  it('ett ifyllt fält härleds aldrig (det som står rörs inte härifrån)', () => {
    expect(harled('huvudtyp', MOLLERYD_FULL, ALLA)).toBeNull();
    expect(harled('bolag', SKALVIKEN, ALLA)).toBeNull();
  });

  it('ingen källa → null, inte en gissning', () => {
    expect(harled('huvudtyp', KOMPERSMALA_VF, ALLA)).toBeNull();
    expect(harled('avtalsform', KOMPERSMALA_VF, ALLA)).toMatchObject({ varde: 'VF/Bark', saker: false });
  });

  it('samma VO är samma objekt, inte en tvilling', () => {
    const a = r('x1', 'Rössmåla Ga 2026', '11240372', null, null, null);
    const b = r('x2', 'Rössmåla Ga 2026', '11240372', 'Gallring', null, 'Vida');
    expect(harled('bolag', a, [a, b])).toBeNull();
  });

  it('tvillingar som säger olika är ingen källa', () => {
    const a = r('a', 'Dubbel', '1', null, null, null);
    const b = r('b', 'Dubbel', '2', null, null, 'Vida');
    const c = r('c', 'Dubbel', '3', null, null, 'ATA');
    expect(harled('bolag', a, [a, b, c])).toBeNull();
  });
});

describe('namnet som källa — mätt mot prod 2026-10-23', () => {
  // [namn, ifylld avtalsform] för slutavverkningar med ett avtalsformsord i namnet.
  const SLUTAVVERKNINGAR: [string, string][] = [
    ['Åbogen RP 2026', 'Rp'], ['Ålshult AU 2025', 'Au'], ['Amundshylte 1:8 G-G RP -25', 'Rp'], ['Anders Ingemarsson RP ATA', 'Rp'],
    ['Anders Moliis VF', 'VF/Bark'], ['Aramo Marcus AU 2026', 'Au'], ['Äskebäck AU 2026', 'Au'], ['Bågskyttebanan RP J-Hus- 25', 'Rp'],
    ['Bjällerhult au + ga', 'Au'], ['Björsamåla AU 2025', 'Au'], ['Bommerstorp M-R LRK -24', 'LRK'], ['Bromåla AU 2026', 'Au'],
    ['Dockemåla AU 2026', 'Au'], ['Gäddegölshult Rp', 'Rp'], ['Göljahult RP 2025', 'Rp'], ['Hålabäck au 2025', 'Au'],
    ['Hallaslätt AU 2026', 'Au'], ['Husjönäs 1:18 JE-G LRK -25', 'LRK'], ['Järnemåla Rapp Au', 'Au'], ['Jätsbygd au 2026', 'Au'],
    ['Jeppshoka 1:14 H-A RP -25', 'Rp'], ['Kämpamåla AU 2026', 'Au'], ['Karatorp RP 2025', 'Rp'], ['Karsemåla AU 2025', 'Au'],
    ['Kättorp 2:2 RP -25', 'Rp'], ['Korpalycke AU 2026', 'Au'], ['Krampamåla AU 2025', 'Au'], ['Krokshult AU 2026', 'Au'],
    ['Lindön AU 2026', 'Au'], ['Lönsbygd AU 2025', 'Au'], ['Mölleryd RP J-Hus -25', 'Rp'], ['Ramsberg AU 2025', 'Au'],
    ['Räveboda AU 2026', 'Au'], ['Rävemåla AU 2026', 'Au'], ['Rödby 2:6 S-P RP -25', 'Rp'], ['Sandåsen Au', 'Au'],
    ['Spåramåla RP 2025', 'Rp'], ['Steglehylte AU 2025', 'Au'], ['Strånganäs AU 2026', 'Au'], ['Tjuvön AU 2026', 'Au'],
    ['Törneryd R-I RP -25', 'Rp'], ['Uggleboda H-A RP -24', 'Rp'], ['Ulfsnäs AU 2026', 'Au'], ['Ulfsryd AU 3:8 2025', 'Au'],
    ['Vällust RP M-R -25', 'Au'],
  ];

  it('avtalsformen i namnet stämmer på alla utom en — därför är namnet aldrig ensam säker', () => {
    const fel = SLUTAVVERKNINGAR.filter(([namn, af]) => namnAvtalsform(namn) !== af).map(([n]) => n);
    expect(fel).toEqual(['Vällust RP M-R -25']);
  });

  it('typen i namnet', () => {
    expect(namnTyp('Rössmåla Ga 2026')).toBe('Gallring');
    expect(namnTyp('Hålabäck 16 ga 2026')).toBe('Gallring');
    expect(namnTyp('Kroksjömåla 123 A-A -25')).toBeNull();
    expect(namnTyp('Ålshult AU 2025 grot')).toBe('Grot');           // AU i ett GROT-namn är virkesobjektets avtalsform
    expect(namnTyp('Törneryd R I RP Ris')).toBe('Grot');
    expect(namnTyp('Bastaremåla gallring Ris')).toBeNull();         // står som gallring i prod: säger inget säkert
    expect(namnTyp('Bjällerhult au + ga')).toBeNull();              // både och
    expect(namnTyp('Stensjömåla VF')).toBeNull();                   // VF säger inget om typen (en gallring i prod)
    for (const [namn] of SLUTAVVERKNINGAR.filter(([n]) => !/\bga\b/i.test(n) && !/VF/.test(n))) expect(namnTyp(namn)).toBe('Slutavverkning');
  });

  it('bolag ur namnet bara när bolaget står som ett eget ord', () => {
    expect(namnBolag('Anders Ingemarsson RP ATA')).toBe('ATA');
    expect(namnBolag('Thomas Nicklasson ATA')).toBe('ATA');
    expect(namnBolag('Kattorp')).toBeNull();
  });
});

describe('kallorText', () => {
  it('skriver källorna som en mening', () => {
    expect(kallorText(['namnet'])).toBe('namnet');
    expect(kallorText(['namnet', 'skördarens fil'])).toBe('namnet och skördarens fil');
    expect(kallorText(['trakten', 'namnet', 'skördarens fil'])).toBe('trakten, namnet och skördarens fil');
  });
});
