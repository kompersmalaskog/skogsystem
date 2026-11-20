import { describe, expect, it } from 'vitest';
import { avslutaStatus } from './egenkontrollAvsluta';

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
