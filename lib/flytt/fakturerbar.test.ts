import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import tabell from './__fixtures__/fakturerbar_tabell.json';
import { automatisktSkal, beraknaFakturerbar, fakturerbarEffektiv } from './fakturerbar';

const migrationer = join(__dirname, '..', '..', 'supabase', 'migrations');
const gammal = readFileSync(join(migrationer, '20261015170000_ratta_flytt.sql'), 'utf8');
const manuell = readFileSync(join(migrationer, '20261017100000_fakturerbar_manuell.sql'), 'utf8');
const platt = (s: string) => s.replace(/\s+/g, ' ');
const tal = (km: number | null) => (km === null ? 'null::numeric' : `${km}::numeric`);
const tv = (m: boolean | null) => (m === null ? 'null::boolean' : String(m));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('fakturerbar-regeln: EN testtabell för TS och SQL', () => {
  it.each(tabell.map(r => [r.typ, r.km, r.manuell, r.forvantat] as const))('%s, %s km, manuellt %s → %s', (typ, km, man, forvantat) => {
    expect(fakturerbarEffektiv(typ, km, man)).toBe(forvantat);
  });

  it('utan manuellt val är effektiv = regeln (beraknaFakturerbar)', () => {
    for (const r of tabell.filter(x => x.manuell === null)) expect(fakturerbarEffektiv(r.typ, r.km, null), JSON.stringify(r)).toBe(beraknaFakturerbar(r.typ, r.km));
  });

  it('det manuella valet går före regeln åt båda hållen', () => {
    expect(fakturerbarEffektiv('produktion', 15, true)).toBe(true);
    expect(fakturerbarEffektiv('produktion', 53, false)).toBe(false);
    expect(fakturerbarEffektiv('service', 100, true)).toBe(true);
    expect(fakturerbarEffektiv('kunduppdrag', 20, false)).toBe(false);
  });

  it('gamla migrationens kvitto kör tabellens rader utan manuellt val mot fakturerbar_for()', () => {
    const sql = platt(gammal);
    for (const r of tabell.filter(x => x.manuell === null)) {
      expect(sql, JSON.stringify(r)).toMatch(new RegExp(`\\('${r.typ}', ${esc(tal(r.km))}, ${r.forvantat}\\)`));
    }
    // ...och SQL-funktionen innehåller samma tre regler och samma gräns som TS.
    expect(sql).toMatch(/when 'produktion' then coalesce\(p_km, 0\) >= 30/);
    expect(sql).toMatch(/when 'kunduppdrag' then true/);
  });

  it('nya migrationens kvitto kör EXAKT hela tabellen mot fakturerbar_effektiv() (annars kan de två glida isär)', () => {
    const sql = platt(manuell);
    for (const r of tabell) {
      expect(sql, JSON.stringify(r)).toMatch(new RegExp(`\\('${r.typ}', +${esc(tal(r.km))}, +${esc(tv(r.manuell))}, +${r.forvantat}\\)`));
    }
    expect(sql).toMatch(/select coalesce\(p_manuell, fakturerbar_for\(p_typ, p_km\)\)/);
    // Antalet rader i kvittot = antalet i tabellen (ingen extra, ingen saknad).
    const rader = sql.match(/\('[a-z]+', +[0-9.]+::numeric|\('[a-z]+', +null::numeric/g) ?? [];
    expect(rader.length).toBe(tabell.length);
  });

  it('ratta_flytt räknar med fakturerbar_effektiv och tar emot fakturerbar_manuell', () => {
    const sql = platt(manuell);
    expect(sql).toMatch(/ny_fakt := fakturerbar_effektiv\(n_typ, f\.flytt_km, n_manuell\)/);
    expect(sql).toMatch(/fakturerbar_manuell = n_manuell/);
    expect(sql).toMatch(/'kund','fakturerbar_manuell'\]/);
    expect(sql).not.toMatch(/ny_fakt := fakturerbar_for/);
  });
});

describe('automatisktSkal', () => {
  it.each([
    ['produktion', 15, 'under 30 km'], ['produktion', 53, '30 km eller mer'], ['produktion', null, 'sträckan saknas'],
    ['service', 100, 'service faktureras inte'], ['annat', 100, 'annat faktureras inte'], ['kunduppdrag', 5, 'kunduppdrag'],
  ] as const)('%s %s km → %s', (typ, km, skal) => expect(automatisktSkal(typ, km)).toBe(skal));
});

describe('vakt: alla som AVGÖR fakturerbar använder fakturerbarEffektiv', () => {
  // beraknaFakturerbar är bara regeln. Den som sätter eller räknar om en flaggas värde måste gå via fakturerbarEffektiv,
  // annars glider ett manuellt val bort vid nästa flytt/rättning. Undantag: FlyttSheet visar regelns EGET svar
  // ("Automatiskt: ja/nej") bredvid valet.
  const ROT = join(__dirname, '..', '..');
  const TILLATNA = new Set(['lib/flytt/fakturerbar.ts', 'app/lastbil/_components/FlyttSheet.tsx']);
  const filer = (d: string, ut: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n === '.next') continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) filer(p, ut);
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) ut.push(p);
    }
    return ut;
  };
  it('beraknaFakturerbar( anropas bara av regelns egen fil och sheetens "Automatiskt"-rad', () => {
    const traffar = ['app', 'lib', 'components']
      .flatMap(d => filer(join(ROT, d)))
      .filter(f => /beraknaFakturerbar\(/.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(ROT.length + 1).replace(/\\/g, '/'))
      .filter(f => !TILLATNA.has(f));
    expect(traffar).toEqual([]);
  });
  it('förarflödet (Lämnat) och rättningen räknar med fakturerbarEffektiv', () => {
    expect(readFileSync(join(ROT, 'app/maskinflytt/MaskinflyttClient.tsx'), 'utf8')).toMatch(/fakturerbarEffektiv\(flyttTyp, flyttKm, null\)/);
    expect(readFileSync(join(ROT, 'app/lastbil/_components/ratta.ts'), 'utf8')).toMatch(/fakturerbarEffektiv\(typ, km, manuell\)/);
  });
});
