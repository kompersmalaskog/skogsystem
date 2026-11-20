import { describe, expect, it } from 'vitest';
import { lasHamtaUrl, nyttUtkast, tolkaUtkast, UTKAST_MAX_ALDER_MS, type Utkast } from './flode';

const NU = Date.parse('2026-10-19T12:00:00Z');
const spar = (u: Partial<Utkast>, minutSedan = 5) => JSON.stringify({ utkast: { ...nyttUtkast('2026-10-19T11:00:00Z'), ...u }, sparad: new Date(NU - minutSedan * 60000).toISOString() });

describe('utkastet — var i flödet man är', () => {
  it('ett färskt utkast läses tillbaka med allt det bar', () => {
    const u = tolkaUtkast(spar({ steg: 'dest', maskinId: 'R64428', flyttId: 'f1', navKor: true }), NU)!;
    expect(u).toMatchObject({ steg: 'dest', maskinId: 'R64428', flyttId: 'f1', navKor: true });
  });

  it('äldre än 12 timmar gäller inte (en dag är slut)', () => {
    expect(tolkaUtkast(spar({ steg: 'kor', maskinId: 'R64428' }, UTKAST_MAX_ALDER_MS / 60000 + 1), NU)).toBeNull();
    expect(tolkaUtkast(spar({ steg: 'kor', maskinId: 'R64428' }, UTKAST_MAX_ALDER_MS / 60000 - 1), NU)).not.toBeNull();
  });

  it('skräp, saknat och tomt ger inget utkast — aldrig ett fel', () => {
    for (const raw of [null, '', '{', '"x"', JSON.stringify({ utkast: { steg: 'okänt', start: 'x' }, sparad: new Date(NU).toISOString() })]) {
      expect(tolkaUtkast(raw as any, NU)).toBeNull();
    }
  });

  it('ett steg efter "val" utan maskin går inte att återuppta', () => {
    expect(tolkaUtkast(spar({ steg: 'kor' }), NU)).toBeNull();
    expect(tolkaUtkast(spar({ steg: 'kor', extern: { namn: 'Anderssons', kund: 'Vida' } }), NU)).not.toBeNull();
  });

  it('adressen ?hamta=1 öppnar flödet', () => {
    expect(lasHamtaUrl('?hamta=1')).toBe(true);
    expect(lasHamtaUrl('?flik=nu&per=2026-10')).toBe(false);
    expect(lasHamtaUrl('')).toBe(false);
  });
});
