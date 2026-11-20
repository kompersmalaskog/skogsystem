// data/se-kravlista.csv är källan; migrationen bär samma rader (en migration kan inte läsa en fil ur repot).
// Ändras den ena utan den andra larmar testet.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function csvRader(text: string): string[][] {
  return text.trim().split('\n').map(rad => {
    const ut: string[] = []; let cur = ''; let citat = false;
    for (const c of rad) {
      if (c === '"') citat = !citat;
      else if (c === ',' && !citat) { ut.push(cur); cur = ''; } else cur += c;
    }
    ut.push(cur);
    return ut;
  });
}

const rot = join(__dirname, '..', '..');
const csv = csvRader(readFileSync(join(rot, 'data', 'se-kravlista.csv'), 'utf8')).slice(1);
const fil = readdirSync(join(rot, 'supabase', 'migrations')).find(f => f.endsWith('_cert_krav.sql'))!;
const sql = readFileSync(join(rot, 'supabase', 'migrations', fil), 'utf8');
const UTB = ['3.1.1', '3.1.8', '3.1.9', '3.1.10', '3.1.11'];

describe('SE:s kravlista', () => {
  it('78 krav, sex sektioner, unika kravnummer', () => {
    expect(csv).toHaveLength(78);
    expect(new Set(csv.map(r => r[0])).size).toBe(78);
    expect(new Set(csv.map(r => r[2])).size).toBe(6);
    expect(csv.every(r => r.length === 10 && ['Ja', 'Nej', 'Om aktuellt'].includes(r[4]))).toBe(true);
  });
  it('migrationen har exakt filens rader, och kalla = utbildning på de fem', () => {
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    for (const r of csv) {
      const rad = `  (${[q(r[0]), q(r[1]), r[2], q(r[3]), ...r.slice(4).map(q), UTB.includes(r[0]) ? "'utbildning'" : 'null'].join(', ')})`;
      expect(sql, r[0]).toContain(rad);
    }
    expect(sql.match(/^  \('/gm)).toHaveLength(78);
    expect(sql.match(/, 'utbildning'\)/g)).toHaveLength(5);
  });
  it('bara admin läser och skriver', () => {
    expect(sql).toContain('enable row level security');
    expect(sql.match(/create policy/g)).toHaveLength(1);
    expect(sql).toContain('ar_admin()');
  });
});
