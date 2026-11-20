import { describe, it, expect } from 'vitest';
import { beslutaMaskinSom, maskinSomUrl, maskinSomFelText, VANTA_MAX_MS } from './maskinSom';

const IDS = ['A130743', 'PONS20SDJAA270231', 'R64101'];
const bas = { som: 'A130743', rollLaddar: false, roll: 'admin' as string | null, maskinIds: IDS as string[] | null, vantatMs: 0 };

describe('maskinSomUrl — länken "Öppna som maskin" öppnar', () => {
  it('/maskin?som=<maskin_id>', () => {
    expect(maskinSomUrl('A130743')).toBe('/maskin?som=A130743');
  });
  it('kodar specialtecken', () => {
    expect(maskinSomUrl('A B&C')).toBe('/maskin?som=A%20B%26C');
  });
});

describe('beslutaMaskinSom — KODBEVIS: /maskin?som=A130743 visar loggan först, inte planeringsvyn', () => {
  it('medan roll/maskinregister laddas → vanta (= BARA loggan, aldrig planeringsvyn)', () => {
    expect(beslutaMaskinSom({ ...bas, rollLaddar: true, roll: null }).typ).toBe('vanta');
    expect(beslutaMaskinSom({ ...bas, maskinIds: null }).typ).toBe('vanta');
  });

  it('admin + känd maskin → tillåt (maskinläge som just den maskinen); rollen chef finns inte längre och avvisas', () => {
    expect(beslutaMaskinSom(bas)).toEqual({ typ: 'tillat', maskinId: 'A130743' });
    expect(beslutaMaskinSom({ ...bas, roll: 'chef' })).toEqual({ typ: 'avvisa', skal: 'ejAdmin' });
  });

  it('ingen ?som= → ingen (vanliga appen rörs inte)', () => {
    expect(beslutaMaskinSom({ ...bas, som: null }).typ).toBe('ingen');
    expect(beslutaMaskinSom({ ...bas, som: '   ' }).typ).toBe('ingen');
  });
});

describe('beslutaMaskinSom — bara admin', () => {
  it('förare → avvisas (ejAdmin), även om maskinen finns', () => {
    expect(beslutaMaskinSom({ ...bas, roll: 'forare' })).toEqual({ typ: 'avvisa', skal: 'ejAdmin' });
  });
  it('ingen medarbetarrad (roll null) → avvisas', () => {
    expect(beslutaMaskinSom({ ...bas, roll: null })).toEqual({ typ: 'avvisa', skal: 'ejAdmin' });
  });
  it('en förare avvisas direkt — väntar inte på maskinregistret', () => {
    expect(beslutaMaskinSom({ ...bas, roll: 'forare', maskinIds: null })).toEqual({ typ: 'avvisa', skal: 'ejAdmin' });
  });
});

describe('beslutaMaskinSom — ärliga fel i st.f. evig logga', () => {
  it('okänd maskin → okandMaskin', () => {
    expect(beslutaMaskinSom({ ...bas, som: 'FINNS-EJ' })).toEqual({ typ: 'avvisa', skal: 'okandMaskin' });
  });
  it('väntat för länge på roll eller maskinregister → laddningMisslyckades', () => {
    expect(beslutaMaskinSom({ ...bas, rollLaddar: true, roll: null, vantatMs: VANTA_MAX_MS })).toEqual({ typ: 'avvisa', skal: 'laddningMisslyckades' });
    expect(beslutaMaskinSom({ ...bas, maskinIds: null, vantatMs: VANTA_MAX_MS })).toEqual({ typ: 'avvisa', skal: 'laddningMisslyckades' });
  });
  it('strax under gränsen → fortfarande vanta', () => {
    expect(beslutaMaskinSom({ ...bas, maskinIds: null, vantatMs: VANTA_MAX_MS - 1 }).typ).toBe('vanta');
  });
  it('timeouten hindrar inte en lyckad laddning', () => {
    expect(beslutaMaskinSom({ ...bas, vantatMs: VANTA_MAX_MS })).toEqual({ typ: 'tillat', maskinId: 'A130743' });
  });
});

describe('maskinSomFelText', () => {
  it('en text per skäl, på svenska', () => {
    expect(maskinSomFelText('ejAdmin', 'X')).toContain('admin');
    expect(maskinSomFelText('okandMaskin', 'FINNS-EJ')).toContain('FINNS-EJ');
    expect(maskinSomFelText('laddningMisslyckades', null)).toContain('Ladda om');
  });
});
