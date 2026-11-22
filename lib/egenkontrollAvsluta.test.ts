import { describe, expect, it } from 'vitest';
import { GAMMAL_RUNDA_DAGAR, arGammalRunda, avslutaStatus, sistaSvaret, visaAvslutaRad } from './egenkontrollAvsluta';

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

describe('visaAvslutaRad - raden som sager att rundan ar klar', () => {
  const bas = { kan: true, klar: false, angraVisas: false, ritar: false };

  it('allt klart och inget i vagen: raden visas', () => {
    expect(visaAvslutaRad(bas)).toBe(true);
  });

  it('nagot kvar: ingen rad - rundan ar inte klar', () => {
    expect(visaAvslutaRad({ ...bas, kan: false })).toBe(false);
  });

  it('redan avslutad runda: ingen rad', () => {
    expect(visaAvslutaRad({ ...bas, klar: true })).toBe(false);
  });

  it('ANGRA-KVITTOT TAR SAMMA PLATS: forst far man ta tillbaka svaret, sedan kommer avslutet', () => {
    expect(visaAvslutaRad({ ...bas, angraVisas: true })).toBe(false);
  });

  it('medan man ritar: ingen rad - ett lage i taget', () => {
    expect(visaAvslutaRad({ ...bas, ritar: true })).toBe(false);
  });
});

describe('sistaSvaret', () => {
  it('senaste besvarad vinner, oavsett ordning i listan', () => {
    expect(sistaSvaret([
      { besvarad: '2026-10-17T08:00:00Z' },
      { besvarad: '2026-10-26T18:22:44Z' },
      { besvarad: '2026-10-19T12:00:00Z' },
    ])).toBe('2026-10-26T18:22:44Z');
  });

  it('obesvarade punkter raknas inte', () => {
    expect(sistaSvaret([{ besvarad: null }, { besvarad: '2026-10-17T08:00:00Z' }, { besvarad: null }])).toBe('2026-10-17T08:00:00Z');
  });

  it('ingen besvarad: null', () => {
    expect(sistaSvaret([{ besvarad: null }])).toBe(null);
    expect(sistaSvaret([])).toBe(null);
  });

  it('en OBSERVATION raknas inte - den ar alltid besvarad och sager inget om nar rundan gicks', () => {
    expect(sistaSvaret([
      { besvarad: '2026-10-17T08:00:00Z' },
      { besvarad: '2026-11-13T09:00:00Z', kalla: 'observation' },
    ])).toBe('2026-10-17T08:00:00Z');
  });
});

describe('arGammalRunda - gicks rundan en annan dag an den avslutas?', () => {
  const nu = new Date(2026, 10, 13, 12, 0); // 13 nov 2026, lokal tid

  it('ULFSNAS: sista svaret i augusti - gammal', () => {
    expect(arGammalRunda(new Date(2026, 7, 28, 14, 0).toISOString(), nu)).toBe(true);
  });

  it('svarat i dag: inte gammal - i dag AR besoksdagen', () => {
    expect(arGammalRunda(new Date(2026, 10, 13, 8, 30).toISOString(), nu)).toBe(false);
  });

  it('svarat i gar: inte gammal - en runda over tva dagar ar normalt', () => {
    expect(arGammalRunda(new Date(2026, 10, 12, 16, 0).toISOString(), nu)).toBe(false);
  });

  it('GRANSEN gar vid GAMMAL_RUNDA_DAGAR: tva dagar bak ar gammal', () => {
    expect(GAMMAL_RUNDA_DAGAR).toBe(2);
    expect(arGammalRunda(new Date(2026, 10, 11, 23, 0).toISOString(), nu)).toBe(true);
  });

  it('KALENDERDAGAR, inte timmar: en kvall i gar ar en dag bak aven om det ar 20 timmar', () => {
    expect(arGammalRunda(new Date(2026, 10, 12, 16, 0).toISOString(), new Date(2026, 10, 13, 12, 0))).toBe(false);
  });

  it('inget svar eller skrap i datumet: ingen not - ingenting gissas', () => {
    expect(arGammalRunda(null, nu)).toBe(false);
    expect(arGammalRunda('inte ett datum', nu)).toBe(false);
  });
});
