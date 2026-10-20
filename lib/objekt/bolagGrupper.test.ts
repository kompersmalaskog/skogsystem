import { describe, expect, it } from 'vitest';
import { attKomplettera, grupperaPerBolag, saknasForRakning } from './bolagGrupper';

const O = (id: string, typ: string | null, bolag: string | null, volym: number | null, o: Record<string, unknown> = {}) =>
  ({ id, typ, bolag, volym, ar: 2026, manad: 10, status: 'planerad', ...o });
const P = (typ: 'gallring' | 'slutavverkning', bolag: string, volym: number) => ({ typ, bolag, volym });

describe('grupperaPerBolag', () => {
  it('ett objekt räknas mot sitt eget bolags beställning och aldrig mot någon annans', () => {
    const g = grupperaPerBolag(
      [O('a', 'gallring', 'Vida', 300), O('b', 'gallring', 'ATA Timber', 120)],
      [P('gallring', 'Vida', 1000), P('gallring', 'ATA Timber', 300)],
    );
    const per = Object.fromEntries(g.map(x => [x.bolag, x.typer[0]]));
    expect(per['Vida']).toMatchObject({ inlagt: 300, bestallt: 1000 });
    expect(per['ATA Timber']).toMatchObject({ inlagt: 120, bestallt: 300 });
    expect(per['ATA Timber'].lage!.text).toContain('kvar till beställningen');
  });

  it('bolag utan beställning: objekten visas, ingen täckningsrad (lage och bestallt är null)', () => {
    const [g] = grupperaPerBolag([O('a', 'gallring', 'Privat', 80)], []);
    expect(g.typer[0]).toMatchObject({ bestallt: null, lage: null, inlagt: 80 });
    expect(g.typer[0].objekt).toHaveLength(1);
    expect(g.harBestallning).toBe(false);
  });

  it('bolag med beställning men utan objekt: hela beställningen är kvar', () => {
    const [g] = grupperaPerBolag([], [P('slutavverkning', 'ATA Timber', 500)]);
    expect(g.typer[0]).toMatchObject({ typ: 'slutavverkning', bestallt: 500, inlagt: 0, objekt: [] });
    expect(g.typer[0].lage).toEqual({ text: '500 m³fub kvar till beställningen', fylld: false });
  });

  it('typer utan vare sig post eller objekt ritas inte; GROT hör till sitt bolag och har ingen beställning', () => {
    const [g] = grupperaPerBolag([O('g', 'grot', 'Vida Energi', null)], []);
    expect(g.typer).toEqual([]);
    expect(g.grot).toHaveLength(1);
  });

  it('objekt utan bolag hamnar inte i någon grupp', () => {
    expect(grupperaPerBolag([O('a', 'gallring', null, 100), O('b', 'gallring', '  ', 100)], [])).toEqual([]);
  });

  it('versaler och mellanslag spelar ingen roll; namnet från beställningen är det som visas', () => {
    const g = grupperaPerBolag([O('a', 'gallring', ' vida ', 10)], [P('gallring', 'Vida', 100)]);
    expect(g).toHaveLength(1);
    expect(g[0].bolag).toBe('Vida');
    expect(g[0].typer[0].inlagt).toBe(10);
  });

  it('ordning: bolag med beställning först (alfabetiskt), sedan de utan', () => {
    const g = grupperaPerBolag([O('a', 'gallring', 'Zeta', 1), O('b', 'gallring', 'Åke', 1), O('c', 'gallring', 'Vida', 1)], [P('gallring', 'Vida', 5), P('gallring', 'ATA', 5)]);
    expect(g.map(x => x.bolag)).toEqual(['ATA', 'Vida', 'Zeta', 'Åke']);
  });
});

describe('Behöver kompletteras', () => {
  it('vad som fattas, i ordningen månad · bolag · volym; volym krävs bara där det finns en beställning', () => {
    expect(saknasForRakning(O('a', 'slutavverkning', null, null, { ar: null, manad: null }))).toEqual(['månad', 'bolag', 'volym']);
    expect(saknasForRakning(O('b', 'grot', 'Vida Energi', null, { ar: null, manad: null }))).toEqual(['månad']); // GROT: ingen volym krävs
    expect(saknasForRakning(O('c', 'gallring', 'Vida', 0))).toEqual(['volym']);
    expect(saknasForRakning(O('d', 'gallring', 'Vida', 50))).toEqual([]);
  });

  it('listan: levande utan månad eller bolag, plus månadens objekt utan bolag; avslutade utan månad tjatar inte; ingen dubblett', () => {
    const levande = [
      O('vaggata', 'slutavverkning', null, null, { ar: null, manad: null, status: 'oplanerad' }),
      O('ljuvadal', 'gallring', null, null, { ar: null, manad: null, status: 'pagaende' }),
      O('kroksjo', 'grot', 'Vida Energi', null, { ar: null, manad: null, status: 'pagaende' }),
      O('bara-volym', 'gallring', 'Vida', null), // månad + bolag finns: står kvar i sin grupp med "saknas" på raden
    ];
    const manad = [O('bolaglos', 'gallring', null, 700), O('vaggata', 'slutavverkning', null, null, { ar: null, manad: null }), O('klar-bolaglos', 'gallring', null, 200, { status: 'avslutat' })];
    const lista = attKomplettera([...levande, O('privat-avslutad', 'gallring', 'Privat', null, { ar: null, manad: null, status: 'avslutat' })], manad);
    expect(lista.map(x => x.objekt.id)).toEqual(['vaggata', 'ljuvadal', 'kroksjo', 'bolaglos', 'klar-bolaglos']);
    expect(lista.find(x => x.objekt.id === 'vaggata')!.saknas).toEqual(['månad', 'bolag', 'volym']);
    expect(lista.find(x => x.objekt.id === 'kroksjo')!.saknas).toEqual(['månad']);
    expect(lista.some(x => x.objekt.id === 'bara-volym')).toBe(false);
    expect(lista.some(x => x.objekt.id === 'privat-avslutad')).toBe(false); // de nio avslutade Privat-objekten ligger inte i listan
  });
});
