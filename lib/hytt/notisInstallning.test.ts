// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { lasHyttNotiserPa, lasHyttNotiserVal, sparaHyttNotiserPa } from './notisInstallning';
import { sattEnhetMaskin } from '@/lib/enhetMaskin';

beforeEach(() => localStorage.clear());

describe('Notiser i hytten — på som standard på en maskin', () => {
  it('en enhet som är maskin har notiserna på utan att någon slagit på dem', () => {
    sattEnhetMaskin('A130743');
    expect(lasHyttNotiserVal()).toBeNull();
    expect(lasHyttNotiserPa()).toBe(true);
  });
  it('en enhet som inte är maskin (förarens telefon, en vanlig dator) har dem av', () => {
    expect(lasHyttNotiserPa()).toBe(false);
  });
  it('ett uttryckligt "av" gäller före standarden – den som stängt av har det avstängt, och det kommer inte tillbaka av sig självt', () => {
    sattEnhetMaskin('A130743');
    sparaHyttNotiserPa(false);
    expect(lasHyttNotiserPa()).toBe(false);
    sattEnhetMaskin('R64428');
    expect(lasHyttNotiserPa()).toBe(false);
    sparaHyttNotiserPa(true);
    expect(lasHyttNotiserPa()).toBe(true);
  });
  it('ett uttryckligt "på" på en enhet utan maskin gäller (valet är enhetens)', () => {
    sparaHyttNotiserPa(true);
    expect(lasHyttNotiserPa()).toBe(true);
  });
  it('enheten släpps som maskin → standarden följer (av), om ingen rört brytaren', () => {
    sattEnhetMaskin('A130743');
    expect(lasHyttNotiserPa()).toBe(true);
    sattEnhetMaskin(null);
    expect(lasHyttNotiserPa()).toBe(false);
  });
  it('trasig eller blockerad localStorage → maskinstandarden gäller inte (ingen maskin kan läsas) och inget kastar', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blockerad'); };
    try { expect(lasHyttNotiserPa()).toBe(false); } finally { Storage.prototype.getItem = orig; }
  });
});
