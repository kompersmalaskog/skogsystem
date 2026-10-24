import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kravAvtalsform, saknarAvtalsformEllerAtgard } from './avtalsformKrav';

describe('Redigering varnar för avtalsform på slutavverkning och för åtgärd på gallring', () => {
  it('slutavverkning utan avtalsform -> "Saknar avtalsform" (inte åtgärd), även om åtgärd är satt', () => {
    expect(saknarAvtalsformEllerAtgard({ huvudtyp: 'Slutavverkning', atgard: 'Föryngring', avtalsform: null }))
      .toEqual({ key: 'avtalsform', text: 'Saknar avtalsform', target: 'avtalsform-section' });
  });
  it('privat slutavverkning utan avtalsform -> ingen varning (ett privat jobb har ingen avtalsform)', () => {
    expect(saknarAvtalsformEllerAtgard({ huvudtyp: 'Slutavverkning', atgard: null, avtalsform: null, bolag: 'Privat' })).toBeNull();
    expect(saknarAvtalsformEllerAtgard({ huvudtyp: 'Slutavverkning', atgard: null, avtalsform: null, bolag: 'ATA' }))
      .toEqual({ key: 'avtalsform', text: 'Saknar avtalsform', target: 'avtalsform-section' });
  });
  it('slutavverkning med avtalsform men utan åtgärd -> ingen varning (åtgärd är valfri där)', () => {
    expect(saknarAvtalsformEllerAtgard({ huvudtyp: 'Slutavverkning', atgard: null, avtalsform: 'Rp' })).toBeNull();
  });
  it('gallring utan åtgärd -> "Saknar åtgärd" som förut; avtalsform efterfrågas aldrig', () => {
    expect(saknarAvtalsformEllerAtgard({ huvudtyp: 'Gallring', atgard: null, avtalsform: null }))
      .toEqual({ key: 'atgard', text: 'Saknar åtgärd', target: 'atgard-section' });
    expect(saknarAvtalsformEllerAtgard({ huvudtyp: 'Gallring', atgard: 'Första gallring', avtalsform: null })).toBeNull();
  });
  it('före migrationen (ingen avtalsform-nyckel på raden) gäller åtgärd som förut — kravet går inte att uppfylla annars', () => {
    expect(kravAvtalsform({ huvudtyp: 'Slutavverkning', atgard: null })).toBe(false);
    expect(saknarAvtalsformEllerAtgard({ huvudtyp: 'Slutavverkning', atgard: null }))
      .toEqual({ key: 'atgard', text: 'Saknar åtgärd', target: 'atgard-section' });
  });
  it('utan huvudtyp varnar den här regeln inte (huvudtyp har sin egen varning)', () => {
    expect(saknarAvtalsformEllerAtgard({ huvudtyp: null, atgard: null, avtalsform: null })).toBeNull();
  });
});

describe('källvakt: Redigering och matchningsvyn använder samma regel', () => {
  const las = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
  it('getWarnings, kravlistan och matchningens "saknas" går via avtalsformKrav', () => {
    const red = las('app/redigering/RedigeringClient.tsx');
    expect(red).toContain('saknarAvtalsformEllerAtgard(obj)');
    expect(red).toContain("kravAvtalsform(obj)) return KRAV_FALT.map(f => f.key === 'atgard'");
    const match = las('app/redigering/hooks/useMatchning.ts');
    expect(match).toContain('kravAvtalsform(d)');
    expect(match).toContain('medAvtalsformSvar');
  });
});

describe('special-objekt', () => {
  it('saknar aldrig avtalsform', () => {
    expect(saknarAvtalsformEllerAtgard({ huvudtyp: 'Slutavverkning', atgard: null, avtalsform: null, special: true } as any)).toBeNull();
  });
});
