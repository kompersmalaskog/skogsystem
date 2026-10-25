import { describe, expect, it } from 'vitest';
import { synkSvar } from './synkSvar';

const nu = new Date('2026-10-25T12:00:00Z');
const ok = { last_success_at: '2026-10-25T05:00:00Z', invoice_last_sync_at: '2026-10-24T05:00:00Z', last_status: 'ok' };

describe('synkSvar', () => {
  it('färskt: Ja, och det äldsta står', () => {
    expect(synkSvar(ok, nu)).toEqual({ svar: 'Ja', under: 'Senast hämtat i går', vantar: null });
  });
  it('äldre än 3 dygn: Nej med antal dygn, den äldsta delen avgör', () => {
    const r = synkSvar({ ...ok, invoice_last_sync_at: '2026-10-20T05:00:00Z' }, nu);
    expect(r.svar).toBe('Nej');
    expect(r.under).toBe('Fakturor hämtades senast 20 okt — 5 dygn sedan');
  });
  it('exakt 3 dygn är fortfarande Ja', () => {
    expect(synkSvar({ ...ok, invoice_last_sync_at: '2026-10-22T11:00:00Z' }, nu).svar).toBe('Ja');
  });
  it('misslyckad körning: Nej även när datumet är färskt', () => {
    expect(synkSvar({ ...ok, last_status: 'fel' }, nu).svar).toBe('Nej');
    expect(synkSvar({ ...ok, last_status: 'pågår' }, nu).svar).toBe('Ja');
  });
  it('aldrig hämtat, okänt, och läser', () => {
    expect(synkSvar({ ...ok, last_success_at: null }, nu).under).toBe('Verifikat har aldrig hämtats');
    expect(synkSvar('fel', nu).svar).toBe('Vet inte');
    expect(synkSvar(null, nu).svar).toBe('…');
  });
});
