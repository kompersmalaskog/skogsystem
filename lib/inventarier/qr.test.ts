import { describe, expect, it } from 'vitest';
import { qrAdress, skanningsLage } from './qr';

describe('QR-koden', () => {
  it('pekar alltid på produktionen, aldrig på sidan den skrevs ut från', () => {
    expect(qrAdress('7f1c')).toBe('https://skogsystem.vercel.app/i/7f1c');
  });
  it('reservlådan anmäls; allt annat öppnar radens ark', () => {
    const f = { typ: 'forbrukning' as const };
    expect(skanningsLage({ rad: { tva_lador: true } as any, artikel: f as any })).toBe('reserv');
    expect(skanningsLage({ rad: { tva_lador: false } as any, artikel: f as any })).toBe('oppna');
    expect(skanningsLage({ rad: { tva_lador: true } as any, artikel: { typ: 'utrustning' } as any })).toBe('oppna');
  });
});
