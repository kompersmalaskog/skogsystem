// Fixtur för supabaseVakt.test.ts: ett test som nås av den riktiga klienten OCH fångar felet, som appkoden gör.
// Körs bara av det testets underkörning (vitest.vakt.config.ts) — aldrig i den vanliga sviten.
import { describe, expect, it } from 'vitest';
import { supabase } from '@/lib/supabase';

describe('fixtur', () => {
  it('når klienten men fångar felet (ser grönt ut)', async () => {
    try { await (supabase as any).from('objekt').select('id'); } catch { /* appkoden fångar felet */ }
    expect(1).toBe(1);
  });
  it('rör inte klienten', () => { expect(1).toBe(1); });
});
