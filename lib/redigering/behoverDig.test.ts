import { describe, it, expect } from 'vitest';
import { byggSaker, forslagKort, varforText, patchForSvar, type BehoverGrupp } from './behoverDig';
import type { HarledRad } from './harledning';

const rad = (objekt_id: string, object_name: string, vo_nummer: string, extra: Partial<HarledRad> = {}): HarledRad =>
  ({ objekt_id, object_name, vo_nummer, huvudtyp: null, avtalsform: null, bolag: null, cutting_method: null, ...extra });
const grupp = (r: HarledRad, varningar: string[]): BehoverGrupp =>
  ({ nyckel: r.vo_nummer!, rep: r, ids: [r.objekt_id], varningar: varningar.map(key => ({ key, text: `Saknar ${key}` })) });

const SKALVIKEN = rad('11271860', 'Skälviken RP J-Hus -25', '11271860', { huvudtyp: 'Slutavverkning', bolag: 'Vida', cutting_method: 'ClearCutting' });
const PRIVAT = rad('PONS_64', 'Peter Kruka', 'O41F97_64', { huvudtyp: 'Slutavverkning', bolag: 'Privat' });
const KOMPERSMALA = rad('547622', 'Kompersmåla VF 2026', '547622');

describe('byggSaker', () => {
  const saker = byggSaker({
    grupper: [grupp(KOMPERSMALA, ['huvudtyp', 'skogsagare']), grupp(SKALVIKEN, ['avtalsform']), grupp(PRIVAT, ['avtalsform'])],
    alla: [SKALVIKEN, PRIVAT, KOMPERSMALA],
    filJobb: [{ nyckel: 'PONS:11271883', namn: 'Mölleryd', vo: '11271883', stammar: 644, maskinNamn: 'Giant', kandidater: [] }],
    bolagVal: ['Vida', 'ATA'],
  });

  it('fält med förslag först, sedan utan förslag, maskinjobb, och sist det man måste öppna objektet för', () => {
    expect(saker.map(s => s.nyckel)).toEqual(['11271860:avtalsform', '547622:huvudtyp', 'fil:PONS:11271883', '547622:skogsagare']);
  });

  it('ett privat jobb frågas aldrig om avtalsform', () => {
    expect(saker.some(s => s.nyckel.startsWith('O41F97_64'))).toBe(false);
  });

  it('raden säger förslaget med frågetecken, och varför', () => {
    const s = saker[0];
    expect(forslagKort(s)).toBe('Rp?');
    expect(s.under).toBe('Saknar avtalsform · namnet säger rotpost');
    expect(s.typ === 'falt' && varforText(s.forslag)).toBe('Namnet säger det.');
  });

  it('utan förslag: "Välj", och arket säger att inget i datan säger det', () => {
    const s = saker[1];
    expect(forslagKort(s)).toBe('Välj');
    expect(s.typ === 'falt' && varforText(s.forslag)).toBe('Inget i datan säger det, så du får välja.');
  });

  it('valen för avtalsform är appens fyra', () => {
    expect(saker[0].typ === 'falt' && saker[0].val).toEqual(['Au', 'Rp', 'LRK', 'VF/Bark']);
  });
});

describe('patchForSvar', () => {
  it('Grot synkar risskotning-flaggan, åt båda hållen', () => {
    expect(patchForSvar('huvudtyp', 'Grot')).toEqual({ huvudtyp: 'Grot', risskotning: true });
    expect(patchForSvar('huvudtyp', 'Gallring')).toEqual({ huvudtyp: 'Gallring', risskotning: false });
    expect(patchForSvar('avtalsform', 'Rp')).toEqual({ avtalsform: 'Rp' });
  });
});

describe('varforText', () => {
  it('flera källor och en som säger emot', () => {
    expect(varforText({ falt: 'huvudtyp', varde: 'Gallring', kallor: ['trakten', 'namnet'], saker: false, emot: [{ varde: 'Slutavverkning', kallor: ['skördarens fil'] }] }))
      .toBe('Trakten och namnet säger samma sak. Men skördarens fil säger Slutavverkning.');
  });
});
