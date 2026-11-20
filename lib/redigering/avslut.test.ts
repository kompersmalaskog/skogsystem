import { describe, it, expect } from 'vitest';
import { avslutLage, avslutPatch, avslutUnder, harNyaFalt, utanNyaFalt } from './avslut';

describe('avslut — människan går före automatiken', () => {
  const skal = 'Giant körde vidare till Skälviken 22 okt';

  it('automatikens datum läses över objektets alla rader', () => {
    const l = avslutLage([{ objekt_id: 'a' }, { objekt_id: 'b', skordning_avslutad: '2026-10-21', skordning_auto_skal: skal }], 'harvester');
    expect(l).toEqual({ lage: 'auto', datum: '2026-10-21', skal });
    expect(avslutUnder(l)).toBe(`Automatiskt · ${skal}`);
  });

  it('ett datum utan skäl är människans och går före automatikens', () => {
    const l = avslutLage([
      { skordning_avslutad: '2026-10-21', skordning_auto_skal: skal },
      { skordning_avslutad: '2026-10-19' },
    ], 'harvester');
    expect(l).toEqual({ lage: 'hand', datum: '2026-10-19' });
    expect(avslutUnder(l)).toBeNull();
  });

  it('"Inte klar än" på någon rad gäller hela objektet', () => {
    const l = avslutLage([{ skotning_avslutad: '2026-10-21', skotning_auto_skal: 'x' }, { skotning_ej_klar: true }], 'forwarder');
    expect(l).toEqual({ lage: 'ej_klar' });
    expect(avslutUnder(l)).toBe('Du sa inte klar · appen väntar på dig');
  });

  it('inget bestämt = öppen; skördning och skotning blandas aldrig', () => {
    expect(avslutLage([{ skordning_avslutad: '2026-10-21', skordning_auto_skal: skal }], 'forwarder')).toEqual({ lage: 'oppen' });
  });

  it('varje val nollar automatikens skäl', () => {
    expect(avslutPatch('forwarder', { klar: '2026-10-23' })).toEqual({ skotning_avslutad: '2026-10-23', skotning_avslutad_auto: false, skotning_ej_klar: false, skotning_auto_skal: null });
    expect(avslutPatch('forwarder', 'inte')).toEqual({ skotning_avslutad: null, skotning_avslutad_auto: false, skotning_ej_klar: true, skotning_auto_skal: null });
    expect(avslutPatch('forwarder', 'appen')).toEqual({ skotning_avslutad: null, skotning_avslutad_auto: false, skotning_ej_klar: false, skotning_auto_skal: null });
    expect(avslutPatch('harvester', { godkann: '2026-10-21' })).toEqual({ skordning_avslutad: '2026-10-21', skordning_avslutad_auto: true, skordning_ej_klar: false, skordning_auto_skal: null });
  });

  it('utan migrationen sparas bara de gamla fälten', () => {
    const p = avslutPatch('harvester', 'inte');
    expect(harNyaFalt(p)).toBe(true);
    expect(utanNyaFalt(p)).toEqual({ skordning_avslutad: null, skordning_avslutad_auto: false });
    expect(harNyaFalt(utanNyaFalt(p))).toBe(false);
  });
});
