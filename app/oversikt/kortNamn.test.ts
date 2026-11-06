import { describe, it, expect } from 'vitest';
import { kortNamn, kortaNamn } from './kortNamn';

describe('korta namn', () => {
  it('prods trakter 2026-11-06', () => {
    expect(kortNamn('Lidhem rp 2025 Britteberg')).toBe('Lidhem Britteberg');
    expect(kortNamn('Lidhem RP 2025 Bondagård')).toBe('Lidhem Bondagård');
    expect(kortNamn('Bondeskog AU 2026')).toBe('Bondeskog');
    expect(kortNamn('Arvidstorp RP J-Hus -25')).toBe('Arvidstorp');
    expect(kortNamn('Hönshylte gallring 2026')).toBe('Hönshylte gallring');
    expect(kortNamn('Patrik Andersson Bjällerhult')).toBe('Patrik Andersson Bjällerhult');
    expect(kortNamn('Steglehylte kjell-Erik')).toBe('Steglehylte kjell-Erik');
  });
  it('ett namn som bara är bokföring behålls', () => expect(kortNamn('RP 2025')).toBe('RP 2025'));
  it('krockar två korta namn står hela namnet för båda', () => {
    expect(kortaNamn(['Edestad RP J-Hus -25', 'Edestad AU 2026', 'Bondeskog AU 2026'])).toEqual(['Edestad RP J-Hus -25', 'Edestad AU 2026', 'Bondeskog']);
  });
});
