import { describe, it, expect } from 'vitest';
import { antalAttFixa, brytarenKanSlasPa, byggRapport, svarsrubrik, testRader } from './notisRapport';

const REDO = { stods: true, installerad: true, behorighet: 'granted' as const, swAktiv: true };
const rad = (i: Parameters<typeof byggRapport>[0], id: string) => byggRapport(i).find((r) => r.id === id)!;

describe('notisrapport — vad appen ser', () => {
  it('allt klart: ingenting att fixa, rubriken säger redo', () => {
    const r = byggRapport(REDO);
    expect(antalAttFixa(r)).toBe(0);
    expect(svarsrubrik(r)).toEqual({ rubrik: 'Redo för testnotis', avvikelse: false });
  });

  it('inte installerad: raden säger HUR man installerar', () => {
    const r = rad({ ...REDO, installerad: false }, 'installerad');
    expect(r.status).toBe('fixa');
    expect(r.text).toContain('Installera sida som app');
  });

  it('tillståndet: blockerat, inte valt och saknas ger var sin instruktion', () => {
    expect(rad({ ...REDO, behorighet: 'denied' }, 'tillstand').text).toContain('Blockerade');
    expect(rad({ ...REDO, behorighet: 'default' }, 'tillstand').text).toContain('Tillåt notiser');
    expect(rad({ ...REDO, behorighet: 'saknas' }, 'tillstand').status).toBe('fixa');
    expect(rad(REDO, 'tillstand').status).toBe('ok');
  });

  it('bakgrundstjänsten som inte är igång är en sak att fixa', () => {
    expect(rad({ ...REDO, swAktiv: false }, 'sw').status).toBe('fixa');
  });

  it('antalet i rubriken räknar bara det appen KAN se — de två "kolla själv"-raderna räknas inte', () => {
    const r = byggRapport({ stods: true, installerad: false, behorighet: 'default', swAktiv: false });
    expect(antalAttFixa(r)).toBe(3);
    expect(svarsrubrik(r).rubrik).toBe('3 saker att fixa');
    expect(svarsrubrik(byggRapport({ ...REDO, installerad: false })).rubrik).toBe('1 sak att fixa');
  });

  it('Chromes bakgrundsinställning och Windows Stör ej står ALLTID med som "Kontrollera själv" — appen kan inte läsa dem', () => {
    for (const i of [REDO, { stods: false, installerad: false, behorighet: 'saknas' as const, swAktiv: false }]) {
      const r = byggRapport(i);
      const chrome = r.find((x) => x.id === 'chrome-bakgrund')!;
      const fokus = r.find((x) => x.id === 'fokus')!;
      expect(chrome.status).toBe('kolla');
      expect(chrome.text).toContain('Fortsätt köra bakgrundsappar när Google Chrome är stängt');
      expect(fokus.status).toBe('kolla');
      expect(fokus.text).toMatch(/Stör ej|Fokusassistent/);
    }
  });
});

describe('notisrapport — testresultatet', () => {
  it('inget skickat → inga rader', () => { expect(testRader({})).toEqual([]); });

  it('skickat men inte kvitterat: säger det', () => {
    const rader = testRader({ skickad: Date.parse('2026-10-24T10:00:00'), lage: 'borta' });
    expect(rader[0]).toContain('appen var inte framme');
    expect(rader[1]).toBe('Uppfattat ej tryckt än');
  });

  it('framme vid skickandet och tryckt Uppfattat + Öppna kartan', () => {
    const rader = testRader({ skickad: 1, lage: 'framme', uppfattat: 2000, oppnad: 3000 });
    expect(rader[0]).toContain('appen var framme');
    expect(rader[1]).toMatch(/^Uppfattat tryckt /);
    expect(rader[2]).toMatch(/^Öppna kartan tryckt /);
  });

  it('brytaren går bara att slå på när testnotisen skickats OCH Uppfattat tryckts', () => {
    expect(brytarenKanSlasPa({})).toBe(false);
    expect(brytarenKanSlasPa({ skickad: 1 })).toBe(false);
    expect(brytarenKanSlasPa({ skickad: 1, uppfattat: 2 })).toBe(true);
  });
});
