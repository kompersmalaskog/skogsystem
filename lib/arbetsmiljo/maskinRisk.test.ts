import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KATALOG, MASKINTYPER, TOM, adminRad, forarRad, kvittera, lage, laggTill, lista, borttagna, taBort, taTillbaka, tolka, typForMaskin, underlag,
  type Bedomning, type MaskinTyp,
} from './maskinRisk';

const nu = new Date('2026-11-02T12:00:00Z');
const godkand = (typ: MaskinTyp, b: Bedomning, tid = '2026-11-01T08:00:00Z'): Bedomning => ({ ...b, godkandUnderlag: underlag(lista(typ, b)), godkandTid: tid, godkandAv: 'm' });

describe('riskbedömning per maskintyp', () => {
  it('fyra typer, varje risk har en åtgärd och nycklarna är unika per typ', () => {
    expect(MASKINTYPER).toEqual(['skordare', 'skotare', 'lastbil', 'motorsag', 'kemikalier']);
    for (const t of MASKINTYPER) {
      const n = KATALOG[t].map(r => r.nyckel);
      expect(new Set(n).size).toBe(n.length);
      for (const r of KATALOG[t]) { expect(r.risk.trim()).not.toBe(''); expect(r.atgard.trim()).not.toBe(''); }
    }
  });

  it('gäller inte, ta tillbaka och egna risker', () => {
    let b = taBort(TOM, 'brand');
    expect(lista('skotare', b).some(r => r.nyckel === 'brand')).toBe(false);
    expect(borttagna('skotare', b).map(r => r.nyckel)).toEqual(['brand']);
    b = taTillbaka(b, 'brand');
    expect(lista('skotare', b).some(r => r.nyckel === 'brand')).toBe(true);
    expect(laggTill(b, 'x', ' ', 'gör så')).toBeNull();
    b = laggTill(b, 'x', 'Kabel', 'Dra ut den')!;
    expect(lista('skotare', b).at(-1)).toMatchObject({ nyckel: 'egen:x', egen: true });
    expect(lista('skotare', taBort(b, 'egen:x')).some(r => r.egen)).toBe(false);
  });

  it('läget: aldrig, godkänd, ändrad efter godkännandet, se över efter ett år', () => {
    expect(lage('skotare', TOM, nu)).toBe('aldrig');
    const g = godkand('skotare', TOM);
    expect(lage('skotare', g, nu)).toBe('godkand');
    expect(lage('skotare', taBort(g, 'brand'), nu)).toBe('andrad');
    expect(lage('skotare', godkand('skotare', TOM, '2025-10-01T08:00:00Z'), nu)).toBe('se_over');
  });

  it('startsidan: admin räknar det som inte är godkänt, föraren läser sin maskin bara när den är godkänd', () => {
    const alla = { skordare: TOM, skotare: godkand('skotare', TOM), lastbil: TOM, motorsag: TOM, kemikalier: TOM };
    expect(adminRad(alla, nu)).toBe('4 riskbedömningar att godkänna');
    expect(forarRad('skordare', alla, [], 'stefan', nu)).toBeNull();
    expect(forarRad('skotare', alla, [], 'stefan', nu)).toBe('Läs riskerna för skotaren');
    const u = underlag(lista('skotare', alla.skotare));
    expect(forarRad('skotare', alla, [{ medarbetareId: 'stefan', maskintyp: 'skotare', underlag: u, tid: '2026-11-02T08:00:00Z' }], 'stefan', nu)).toBeNull();
    expect(forarRad('skotare', alla, [{ medarbetareId: 'stefan', maskintyp: 'skotare', underlag: 'gammal', tid: '2026-11-02T08:00:00Z' }], 'stefan', nu)).toBe('Läs riskerna för skotaren');
  });

  it('maskintyp ur registret, tolerant tolkning och kvittot', async () => {
    expect(typForMaskin('Harvester')).toBe('skordare');
    expect(typForMaskin('Forwarder')).toBe('skotare');
    expect(typForMaskin(null)).toBeNull();
    expect(tolka({ bort: ['a', 1], egna: [{ id: 'x', risk: 'r', atgard: 'a' }, { id: 2 }], godkand_underlag: null })).toMatchObject({ bort: ['a'], egna: [{ id: 'x' }] });
    const sb = (error: unknown) => ({ from: () => ({ insert: async () => ({ error }) }) }) as never;
    expect(await kvittera(sb({ code: '23505' }), 'm', 'skotare', 'u')).toBe(true);
    expect(await kvittera(sb({ code: '42501' }), 'm', 'skotare', 'u')).toBe(false);
  });

  it('oljor och kemikalier ska alla förare läsa, efter sin egen maskin', () => {
    const alla = { skordare: TOM, skotare: godkand('skotare', TOM), lastbil: TOM, motorsag: TOM, kemikalier: godkand('kemikalier', TOM) };
    expect(forarRad('skotare', alla, [], 'stefan', nu)).toBe('Läs riskerna för skotaren och oljor och kemikalier');
    expect(forarRad(null, alla, [], 'stefan', nu)).toBe('Läs riskerna för oljor och kemikalier');
    const u = underlag(lista('kemikalier', alla.kemikalier));
    expect(forarRad(null, alla, [{ medarbetareId: 'stefan', maskintyp: 'kemikalier', underlag: u, tid: '2026-11-02T08:00:00Z' }], 'stefan', nu)).toBeNull();
  });

  it('databasens maskintyper är exakt de som finns i appen', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261103141033_am_kemikalier_alla_lagger_till.sql'), 'utf8');
    const m = [...sql.matchAll(/maskintyp in \(([^)]+)\)/g)];
    expect(m).toHaveLength(2);
    for (const x of m) expect(x[1].split(',').map(s => s.trim().replace(/'/g, ''))).toEqual(MASKINTYPER);
  });
});
