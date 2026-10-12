import { describe, expect, it } from 'vitest';
import { lasFelOrsak, lastLista } from './las-svar';

describe('lastLista — bara ett fritt-från-fel svar med en lista räknas som läst', () => {
  it('rader utan fel → raderna', () => {
    const rader = [{ id: 'a' }, { id: 'b' }];
    expect(lastLista({ data: rader, error: null })).toBe(rader);
  });
  it('lyckat svar med tom lista → [] (ett sant "inga rader", inte okänt)', () => {
    expect(lastLista({ data: [], error: null })).toEqual([]);
    expect(lastLista({ data: [] })).toEqual([]);
  });
  it('fel satt → null (okänt), även om data är en lista med rader', () => {
    expect(lastLista({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } })).toBeNull();
    expect(lastLista({ data: [{ id: 'a' }], error: { message: 'fel' } })).toBeNull();
  });
  it('data saknas eller är null → null', () => {
    expect(lastLista({ data: null, error: null })).toBeNull();
    expect(lastLista({ data: undefined })).toBeNull();
    expect(lastLista({})).toBeNull();
  });
  it('data är inte en lista (objekt, sträng, tal) → null', () => {
    expect(lastLista({ data: { rad: 1 }, error: null })).toBeNull();
    expect(lastLista({ data: 'text', error: null })).toBeNull();
    expect(lastLista({ data: 3, error: null })).toBeNull();
  });
  it('inget svar alls (null/undefined) → null', () => {
    expect(lastLista(null)).toBeNull();
    expect(lastLista(undefined)).toBeNull();
  });
});

describe('lasFelOrsak — tekniken till konsolen', () => {
  it('fel med kod + meddelande', () => {
    expect(lasFelOrsak({ data: null, error: { code: '57014', message: 'statement timeout' } })).toBe('57014 statement timeout');
  });
  it('fel utan kod', () => {
    expect(lasFelOrsak({ error: { message: 'nätverk' } })).toBe('nätverk');
  });
  it('fel som inte är ett objekt', () => {
    expect(lasFelOrsak({ error: 'bara en sträng' })).toBe('bara en sträng');
  });
  it('inget fel men inte en lista', () => {
    expect(lasFelOrsak({ data: null, error: null })).toBe('svaret var inte en lista');
  });
  it('inget svar', () => {
    expect(lasFelOrsak(null)).toBe('inget svar');
  });
});
