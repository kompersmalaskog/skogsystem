import { describe, expect, it } from 'vitest';
import { loginSok, sakerNasta } from './loginNasta';

describe('inloggningen tar dig tillbaka dit du skulle', () => {
  it('en sökväg i appen godtas, med sin sökning', () => {
    expect(sakerNasta('/inventarier')).toBe('/inventarier');
    expect(sakerNasta('/i/7f1c')).toBe('/i/7f1c');
    expect(sakerNasta('/inventarier?rad=r1')).toBe('/inventarier?rad=r1');
  });
  it('en annan sajt avvisas — aldrig en öppen omdirigering', () => {
    for (const s of ['//evil.se', '/\\evil.se', 'https://evil.se', 'evil.se', 'javascript:alert(1)', '/a\nb', '']) {
      expect(sakerNasta(s)).toBeNull();
    }
    expect(sakerNasta(null)).toBeNull();
  });
  it('/login leder aldrig tillbaka till /login', () => {
    expect(sakerNasta('/login')).toBeNull();
    expect(sakerNasta('/login?retry=1')).toBeNull();
  });
  it('sökningen till /login', () => {
    expect(loginSok('/inventarier', '')).toBe('?nasta=%2Finventarier');
    expect(loginSok('/inventarier', '?rad=r1')).toBe('?nasta=%2Finventarier%3Frad%3Dr1');
    expect(loginSok('/', '')).toBe('');
    expect(loginSok('/login', '')).toBe('');
  });
});
