// Samma namn på kartan och i listan (Martin 2026-10-22): brickan är kartans etikett, typen har inget " O"/" F", första punkten är det som står på en rad.
import { describe, expect, it } from 'vitest';
import { brickaFarg, forstaPunkt, rensaVidaNamn, vidaYtaNamn } from './ytaNamn';
import { GRUPPER } from './larm/grupper';
import { OVRIGT_YTA_STIL, VIDA_ETIKETT } from './ytaStil';

const yta = (TYP: string, LOPNR: number | string, FLBESKR: string | null) => ({ _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR', TYP, LOPNR, FLBESKR });

describe('rensaVidaNamn — Vidas suffix " O" / " F" visas aldrig', () => {
  it('tar bort ett avslutande ensamt O eller F', () => {
    expect(rensaVidaNamn('Kant mot vatten O')).toBe('Kant mot vatten');
    expect(rensaVidaNamn('Sumpskog O')).toBe('Sumpskog');
    expect(rensaVidaNamn('Blockmark / bergbrant O')).toBe('Blockmark / bergbrant');
    expect(rensaVidaNamn('Grova lövträd F')).toBe('Grova lövträd');
    expect(rensaVidaNamn('Kant mot odlad mark O')).toBe('Kant mot odlad mark');
  });
  it('rör inget annat: ord som slutar på o/f, ett O mitt i, ingen text', () => {
    expect(rensaVidaNamn('Övrigt')).toBe('Övrigt');
    expect(rensaVidaNamn('Kärr / mosse')).toBe('Kärr / mosse');
    expect(rensaVidaNamn('Skog O sydost')).toBe('Skog O sydost');
    expect(rensaVidaNamn('Hof')).toBe('Hof');
    expect(rensaVidaNamn('O')).toBe('O');
    expect(rensaVidaNamn(null)).toBe('');
    expect(rensaVidaNamn('  Sumpskog O  ')).toBe('Sumpskog');
  });
});

describe('vidaYtaNamn — brickan är kartans etikett', () => {
  it('Hålabäck au 2025: de fem ytorna', () => {
    expect(vidaYtaNamn(yta('24', 1, 'Kant mot vatten O'))).toMatchObject({ bricka: 'Hänsyn 1', typ: 'Kant mot vatten', rubrik: 'Hänsyn 1 · Kant mot vatten', grupp: 'natur', nr: '1' });
    expect(vidaYtaNamn(yta('8', 2, 'Sumpskog O'))).toMatchObject({ bricka: 'Hänsyn 2', typ: 'Sumpskog', rubrik: 'Hänsyn 2 · Sumpskog' });
    expect(vidaYtaNamn(yta('5', 3, 'Blockmark / bergbrant O'))).toMatchObject({ bricka: 'Hänsyn 3', typ: 'Blockmark / bergbrant' });
    expect(vidaYtaNamn(yta('71', 4, 'Övrigt'))).toMatchObject({ bricka: 'Övrigt 4', typ: '', rubrik: 'Övrigt 4', grupp: 'ovrigt' });
    expect(vidaYtaNamn(yta('71', 5, 'Övrigt'))).toMatchObject({ bricka: 'Övrigt 5', rubrik: 'Övrigt 5' });
  });
  it('brickan är EXAKT kartans etikett (VIDA_ETIKETT + LOPNR) i versaler — samma ord och nummer, alltid', () => {
    for (const [TYP, ord] of [['24', VIDA_ETIKETT.hansynsyta], ['8', VIDA_ETIKETT.hansynsyta], ['71', VIDA_ETIKETT.ovrigt]] as const) {
      expect(vidaYtaNamn(yta(TYP, 7, 'x O'))!.bricka.toLocaleUpperCase('sv-SE')).toBe(`${ord} 7`);
    }
  });
  it('en hänsynsyta utan beskrivning visar bara brickan; utan nummer bara ordet; "Övrigt" upprepas aldrig', () => {
    expect(vidaYtaNamn(yta('24', 3, null))).toMatchObject({ bricka: 'Hänsyn 3', typ: '', rubrik: 'Hänsyn 3' });
    expect(vidaYtaNamn(yta('24', '', 'Kant mot vatten O'))).toMatchObject({ bricka: 'Hänsyn', rubrik: 'Hänsyn · Kant mot vatten' });
    expect(vidaYtaNamn(yta('71', 4, 'Övrigt O'))!.typ).toBe('');
  });
  it('bara tilläggsytor har ett namn (ingen traktgräns, inga punkter)', () => {
    expect(vidaYtaNamn({ _lager: 'L_TRAKTDEL', LOPNR: 1 })).toBeNull();
    expect(vidaYtaNamn(null)).toBeNull();
  });
});

describe('brickans färg och första punkten', () => {
  it('Natur grön ur gruppen, Övrigt vit som ytans kant på kartan — aldrig en egen hex', () => {
    expect(brickaFarg('natur')).toBe(GRUPPER.natur.farg);
    expect(brickaFarg('kultur')).toBe(GRUPPER.kultur.farg);
    expect(brickaFarg('ovrigt')).toBe(OVRIGT_YTA_STIL.farg);
  });
  it('första punkten = första raden; en lång text förblir en rad (avkortas av vyn)', () => {
    expect(forstaPunkt('avverkning av frötallar.\r\nLämn kantzon mot sjön.')).toBe('avverkning av frötallar.');
    expect(forstaPunkt('Stanna vid stenen\nGå runt blötan')).toBe('Stanna vid stenen');
    expect(forstaPunkt('kantzon lämnas på ca 10-15 m där endast gran avverkas.  Ingen underröjning.')).toBe('kantzon lämnas på ca 10-15 m där endast gran avverkas.  Ingen underröjning.');
    expect(forstaPunkt('   \n  ')).toBeNull();
    expect(forstaPunkt(null)).toBeNull();
  });
});
