import { describe, it, expect } from 'vitest';
import { beskrivRattning, skillnader } from './rattningText';
import type { PlatsData } from './usePlatsData';
import type { Rattning } from './useFlyttDetalj';

const DATA: PlatsData = {
  maskiner: [{ maskin_id: 'G', namn: 'Giant' }, { maskin_id: 'E', namn: 'Elefant 26' }],
  platser: [{ slag: 'objekt', id: 'o1', namn: 'Vällust', lat: null, lng: null, sub: 'x' }, { slag: 'objekt', id: 'o2', namn: 'Tjuvön', lat: null, lng: null, sub: 'x' }],
};
const F = { maskin_id: 'G', extern_maskin: null, fran_objekt_id: 'o1', fran_plats_id: null, till_objekt_id: 'o2', till_plats_id: null, flytt_typ: 'produktion', kund: null };

describe('rattningText', () => {
  it('skillnader nämner bara det som ändrats, med namn (aldrig id)', () => {
    expect(skillnader(F, { ...F, maskin_id: 'E' }, DATA)).toEqual(['maskin Giant → Elefant 26']);
    expect(skillnader(F, { ...F, till_objekt_id: 'o1', flytt_typ: 'service' }, DATA)).toEqual(['till Tjuvön → Vällust', 'typ Produktion → Service']);
    expect(skillnader(F, { ...F }, DATA)).toEqual([]);
  });
  it('en okänd plats blir "okänd plats", inte ett id', () => {
    expect(skillnader(F, { ...F, till_objekt_id: 'x9' }, DATA)).toEqual(['till Tjuvön → okänd plats']);
  });
  it('rättning och strykning får var sin form, med vem och varför', () => {
    const r = { id: '1', flytt_id: 'f', tid: '2026-10-15T09:00:00Z', av: 'Martin', anledning: 'fel maskin vald', slag: 'rattning', fore: F, efter: { ...F, maskin_id: 'E' } } as unknown as Rattning;
    expect(beskrivRattning(r, DATA)).toMatch(/^Rättad av Martin .* — maskin Giant → Elefant 26: fel maskin vald$/);
    expect(beskrivRattning({ ...r, slag: 'stryk' } as Rattning, DATA)).toMatch(/^Struken av Martin .*: fel maskin vald$/);
  });
});
