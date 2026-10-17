import { describe, expect, it } from 'vitest';
import { arKolumnSaknasFel, klarFaltTillKolumner, KLAR_KOLUMNER, KLAR_TOM, radTillKlarFalt } from './klarFalt';
import { VED_TOM } from './klarTrakt';

describe('rad ↔ fält', () => {
  it('en rad utan något ifyllt ger tomma fält — obesvarat, aldrig 0 eller {}', () => {
    expect(radTillKlarFalt({})).toEqual(KLAR_TOM);
    expect(radTillKlarFalt(null)).toEqual(KLAR_TOM);
    expect(radTillKlarFalt({ medelstam: null, har_du_svar: null, ved_detaljer: null, klar_kvar_antal: null }).klarKvarAntal).toBeNull();
  });
  it('medelstam visas med decimalkomma och sparas med punkt', () => {
    expect(radTillKlarFalt({ medelstam: 0.72 }).medelstam).toBe('0,72');
    expect(klarFaltTillKolumner({ medelstam: '0,72' })).toEqual({ medelstam: 0.72 });
    expect(klarFaltTillKolumner({ medelstam: '' })).toEqual({ medelstam: null });
    expect(klarFaltTillKolumner({ medelstam: 'abc' })).toEqual({ medelstam: null });
  });
  it('alla svar bort = NULL i kolumnen (obesvarat), inte ett tomt objekt', () => {
    expect(klarFaltTillKolumner({ harDu: {} })).toEqual({ har_du_svar: null });
    const s = { gransar: { svar: 'ja' as const, av: 'm1', at: '2026-10-15T10:00:00Z' } };
    expect(klarFaltTillKolumner({ harDu: s })).toEqual({ har_du_svar: s });
    expect(radTillKlarFalt({ har_du_svar: s }).harDu).toEqual(s);
  });
  it('godkänd prognos sparas med vem, när och underlag; bara de fälten som ändrats skickas', () => {
    expect(klarFaltTillKolumner({ prognosGodkand: { av: 'm1', at: 'T', underlag: 'u' } })).toEqual({ prognos_godkand_av: 'm1', prognos_godkand_at: 'T', prognos_godkand_underlag: 'u' });
    expect(Object.keys(klarFaltTillKolumner({ medelstam: '1' }))).toEqual(['medelstam']);
  });
  it('ved sparas i kolumnformen och läses tillbaka', () => {
    const ved = { ...VED_TOM, langd: '3m' as const, sortiment: ['bjork' as const] };
    const k = klarFaltTillKolumner({ ved });
    expect(radTillKlarFalt({ ved_detaljer: k.ved_detaljer }).ved).toEqual(ved);
  });
  it('kvarantalet bär en tidsstämpel; null nollar båda', () => {
    const k = klarFaltTillKolumner({ klarKvarAntal: 4 });
    expect(k.klar_kvar_antal).toBe(4);
    expect(typeof k.klar_kvar_beraknad_at).toBe('string');
    expect(klarFaltTillKolumner({ klarKvarAntal: null })).toEqual({ klar_kvar_antal: null, klar_kvar_beraknad_at: null });
  });
  it('kolumnlistan i läsningen är exakt de som radTillKlarFalt läser', () => {
    expect(KLAR_KOLUMNER.split(',').map((s) => s.trim()).sort()).toEqual(['har_du_svar', 'klar_kvar_antal', 'medelstam', 'prognos_godkand_at', 'prognos_godkand_av', 'prognos_godkand_underlag', 'ved_detaljer']);
  });
});

describe('migrationen saknas', () => {
  it('känner igen både PostgREST och Postgres', () => {
    expect(arKolumnSaknasFel({ code: '42703', message: 'column objekt.har_du_svar does not exist' })).toBe(true);
    expect(arKolumnSaknasFel({ code: 'PGRST204', message: "Could not find the 'ved_detaljer' column of 'objekt' in the schema cache" })).toBe(true);
    expect(arKolumnSaknasFel({ code: '08006', message: 'connection failure' })).toBe(false);
    expect(arKolumnSaknasFel(null)).toBe(false);
  });
});

describe('Stämmer på Vidas avlägg bor i har_du_svar utan att skriva bort svaren', () => {
  const bek = { nummer: ['01-1', '01-2'], av: 'm1', at: '2026-10-17T10:00:00.000Z' };
  const svar = { gransar: { svar: 'ja' as const, av: 'm1', at: 'T' } };
  it('läses ur har_du_svar.vida_avlagg, och de sex svaren läses som förut', () => {
    const f = radTillKlarFalt({ har_du_svar: { ...svar, vida_avlagg: bek } });
    expect(f.vidaAvlagg).toEqual(bek);
    expect(f.harDu).toEqual(svar);
    expect(radTillKlarFalt({ har_du_svar: svar }).vidaAvlagg).toBeNull();
  });
  it('en bekräftelse skriver båda; ett svar skriver bekräftelsen med; tomt blir NULL', () => {
    expect(klarFaltTillKolumner({ vidaAvlagg: bek }, { harDu: svar, vidaAvlagg: null })).toEqual({ har_du_svar: { ...svar, vida_avlagg: bek } });
    expect(klarFaltTillKolumner({ harDu: svar }, { harDu: {}, vidaAvlagg: bek })).toEqual({ har_du_svar: { ...svar, vida_avlagg: bek } });
    expect(klarFaltTillKolumner({ vidaAvlagg: bek }, { harDu: {}, vidaAvlagg: null })).toEqual({ har_du_svar: { vida_avlagg: bek } });
    expect(klarFaltTillKolumner({ harDu: {} }, { harDu: svar, vidaAvlagg: null })).toEqual({ har_du_svar: null });
  });
});
