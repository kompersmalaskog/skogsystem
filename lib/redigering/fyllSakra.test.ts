import { describe, it, expect } from 'vitest';
import { planeraSakra, traktTyp, type FyllRad } from './fyllSakra';

const r = (objekt_id: string, object_name: string, vo_nummer: string, extra: Partial<FyllRad> = {}): FyllRad =>
  ({ objekt_id, object_name, vo_nummer, huvudtyp: null, avtalsform: null, bolag: null, cutting_method: null, ...extra });

// Prod 2026-10-23: Mölleryd finns två gånger, och Skälviken saknar typ och avtalsform.
const MOLLERYD_TOM = r('11166477', 'Mölleryd RP J-Hus -25', '11166477', { cutting_method: 'ClearCutting' });
const MOLLERYD_FULL = r('11271883', 'Mölleryd RP J-Hus -25', '11271883', { huvudtyp: 'Slutavverkning', avtalsform: 'Rp', bolag: 'Vida', cutting_method: 'ClearCutting' });
const SKALVIKEN = r('11271860', 'Skälviken RP J-Hus -25', '11271860', { bolag: 'Vida', cutting_method: 'ClearCutting' });
const VALLUST = r('A030353_185', 'Vällust Löv Ga', 'P-1024');
const ALLA = [MOLLERYD_TOM, MOLLERYD_FULL, SKALVIKEN, VALLUST];

describe('planeraSakra — bara säkert, bara tomt, bara det som gäller', () => {
  const plan = planeraSakra(ALLA);

  it('Mölleryd: typ och avtalsform fylls (två källor var), bolaget inte (en källa)', () => {
    const m = plan.filter(p => p.vo === '11166477').map(p => `${p.falt}=${p.varde}`);
    expect(m).toEqual(['huvudtyp=Slutavverkning', 'avtalsform=Rp']);
  });

  it('Skälviken: typen fylls; avtalsformen bara ur namnet → förslag, aldrig ifylld', () => {
    expect(plan.filter(p => p.vo === '11271860').map(p => p.falt)).toEqual(['huvudtyp']);
  });

  it('en källa räcker aldrig: Vällust Löv Ga fylls inte', () => {
    expect(plan.some(p => p.vo === 'P-1024')).toBe(false);
  });

  it('med trakten som andra källa blir Vällust säkert', () => {
    const p = planeraSakra(ALLA, new Map([['P-1024', { huvudtyp: 'Gallring' }]]));
    expect(p.find(x => x.vo === 'P-1024')).toMatchObject({ falt: 'huvudtyp', varde: 'Gallring', kallor: ['trakten', 'namnet'] });
  });

  it('ett fält som är ifyllt på någon rad i gruppen rörs inte', () => {
    const a = r('a', 'Mölleryd RP J-Hus -25', '11166477', { cutting_method: 'ClearCutting' });
    const b = r('b', 'Mölleryd RP J-Hus -25', '11166477', { huvudtyp: 'Gallring' });
    expect(planeraSakra([a, b, MOLLERYD_FULL]).some(p => p.falt === 'huvudtyp' && p.vo === '11166477')).toBe(false);
  });

  it('hela VO-gruppen skrivs', () => {
    const a = r('a', 'Mölleryd RP J-Hus -25', '11166477', { cutting_method: 'ClearCutting' });
    const b = r('b', 'Mölleryd RP J-Hus -25', '11166477');
    expect(planeraSakra([a, b, MOLLERYD_FULL]).find(p => p.falt === 'huvudtyp')!.ids).toEqual(['a', 'b']);
  });

  it('privat: avtalsform fylls aldrig', () => {
    const p = r('p', 'Peter Kruka RP', 'O41F97_64', { huvudtyp: 'Slutavverkning', bolag: 'Privat' });
    const tv = r('q', 'Peter Kruka RP', 'X', { avtalsform: 'Rp' });
    expect(planeraSakra([p, tv]).some(x => x.falt === 'avtalsform' && x.vo === 'O41F97_64')).toBe(false);
  });

  it('exkluderade objekt rörs inte', () => {
    expect(planeraSakra([{ ...MOLLERYD_TOM, exkludera: true }, MOLLERYD_FULL])).toEqual([]);
  });
});

describe('traktTyp', () => {
  it('objekt.typ till dim-form, okänt blir null', () => {
    expect(traktTyp('slutavverkning')).toBe('Slutavverkning');
    expect(traktTyp('GROT')).toBe('Grot');
    expect(traktTyp('energiklippning')).toBeNull();
  });
});
