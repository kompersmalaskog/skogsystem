import { describe, expect, it } from 'vitest';
import { PUNKTER, arshjulRad, byggArshjul, riskGjord, rondGjord, svenskArManad, type Gjord } from './arshjul';
import { MASKINTYPER, TOM, lista, underlag, type Bedomning, type MaskinTyp } from './maskinRisk';
import { byggPunkter, type Rond } from './skyddsrond';
import { byggRader, svar, type Indata } from './oversikt';

const NU = new Date('2026-11-03T10:00:00Z');
const tomma = () => Object.fromEntries(MASKINTYPER.map(t => [t, { ...TOM, bort: [], egna: [] }])) as unknown as Record<MaskinTyp, Bedomning>;
const godkandaAr = (tid: string) => {
  const b = tomma();
  for (const t of MASKINTYPER) b[t] = { ...b[t], godkandUnderlag: underlag(lista(t, b[t])), godkandTid: tid, godkandAv: 'm' };
  return b;
};
const punkter = byggPunkter([{ id: 'P', namn: 'Giant' }]);
const rond = (klar: string | null): Rond => ({ id: 'r', punkter, deltagare: 'M', startad: '2026-10-01T08:00:00Z', klar, svar: [] });

describe('årshjulet', () => {
  it('punkterna står i månadsordning och har en text som säger vad man gör', () => {
    expect(PUNKTER.map(p => p.manad)).toEqual([...PUNKTER.map(p => p.manad)].sort((a, b) => a - b));
    for (const p of PUNKTER) expect(p.vad.length).toBeGreaterThan(20);
  });

  it('svensk månad: nyårsnatten i UTC är redan januari i Sverige', () => {
    expect(svenskArManad(new Date('2026-12-31T23:30:00Z'))).toEqual({ ar: 2027, manad: 1 });
  });

  it('läget i ord: gjort, försenat, dags nu, senare', () => {
    const gjorda: Gjord[] = [{ punkt: 'apt_var', gjordTid: '2026-03-12T10:00:00Z', anteckning: 'Pratade om brandrisk' }];
    const r = byggArshjul({ nu: NU, gjorda, risk: tomma(), ronder: [] });
    const per = Object.fromEntries(r.map(x => [x.punkt.id, x]));
    expect(per.apt_var).toMatchObject({ under: 'Gjord 12 mars', ton: 'gron', attGora: false, anteckning: 'Pratade om brandrisk' });
    expect(per.osa).toMatchObject({ under: 'Inte gjord · skulle gjorts i mars', ton: 'orange', attGora: true });
    expect(per.uppfoljning).toMatchObject({ under: 'Dags nu', attGora: true });
    const sep = byggArshjul({ nu: new Date('2026-08-10T10:00:00Z'), gjorda: [], risk: tomma(), ronder: [] });
    expect(sep.find(x => x.punkt.id === 'apt_host')).toMatchObject({ under: 'I september', attGora: false });
  });

  it('riskbedömningen räknas ur riskbedömningen: alla fyra godkända i år', () => {
    expect(riskGjord(godkandaAr('2026-02-01T10:00:00Z'), 2026, NU)).toBe('2026-02-01T10:00:00Z');
    expect(riskGjord(godkandaAr('2025-12-01T10:00:00Z'), 2026, NU)).toBeNull();
    const b = godkandaAr('2026-02-01T10:00:00Z'); b.skordare = { ...b.skordare, godkandTid: null };
    expect(riskGjord(b, 2026, NU)).toBeNull();
  });

  it('skyddsronden räknas ur skyddsronden: en klar rond i år, och en pågående säger hur långt den kommit', () => {
    expect(rondGjord([rond('2026-10-20T10:00:00Z')], 2026)).toBe('2026-10-20T10:00:00Z');
    expect(rondGjord([rond('2025-10-20T10:00:00Z')], 2026)).toBeNull();
    const r = byggArshjul({ nu: NU, gjorda: [], risk: tomma(), ronder: [rond(null)] });
    expect(r.find(x => x.punkt.id === 'skyddsrond')!.under).toMatch(/^Pågår · 0 av \d+$/);
  });

  it('raden på Arbetsmiljö-sidan räknar bara det som inte har en egen rad', () => {
    const r = byggArshjul({ nu: NU, gjorda: [], risk: tomma(), ronder: [] });
    expect(arshjulRad(r, 2026)).toEqual({ titel: 'Året 2026', under: '5 att göra · först Arbetsplatsträff, våren', ton: 'orange', attGora: true });
    const allt: Gjord[] = (['apt_var', 'osa', 'kemikalier', 'apt_host', 'uppfoljning'] as const).map(p => ({ punkt: p, gjordTid: '2026-03-01T10:00:00Z', anteckning: null }));
    const klar = byggArshjul({ nu: NU, gjorda: allt, risk: godkandaAr('2026-02-01T10:00:00Z'), ronder: [rond('2026-10-20T10:00:00Z')] });
    expect(arshjulRad(klar, 2026)).toEqual({ titel: 'Året 2026', under: 'Allt är gjort i år', attGora: false });
    const tidigt = byggArshjul({ nu: new Date('2026-02-10T10:00:00Z'), gjorda: [], risk: godkandaAr('2026-01-20T10:00:00Z'), ronder: [] });
    expect(arshjulRad(tidigt, 2026)).toEqual({ titel: 'Året 2026', under: '1 av 7 gjort · nästa i mars', attGora: false });
  });

  it('i översikten: bara för arbetsledningen, efter skyddsronden; läsfel säger det', () => {
    const bas: Indata = {
      arAdmin: true, serArbetsledning: true, medarbetareId: 'm', maskinkoll: 0, atgarder: { antal: 0, stopp: 0 },
      skyddsrond: { typ: 'ok', senast: rond('2026-10-20T10:00:00Z'), nasta: '' }, risk: { bedomningar: godkandaAr('2026-02-01T10:00:00Z'), kvitton: null, minTyp: null },
    };
    const r = byggArshjul({ nu: NU, gjorda: [], risk: tomma(), ronder: [] });
    const rader = byggRader({ ...bas, arshjul: r }, NU);
    expect(rader.map(x => x.id).slice(0, 3)).toEqual(['atgarder', 'skyddsrond', 'arshjul']);
    expect(svar(rader).text).toBe('1 sak behöver dig');
    expect(byggRader({ ...bas, arshjul: null }, NU).find(x => x.id === 'arshjul')).toMatchObject({ under: 'Kunde inte läsas just nu', fel: true });
    expect(byggRader(bas, NU).some(x => x.id === 'arshjul')).toBe(false);
  });
});
