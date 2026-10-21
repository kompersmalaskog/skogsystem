import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AVSIKT_STANDARD, NOTERING_ETIKETT_MAX, NOTERING_FORSKJUTNING_MAX, NOTERING_MAX_PUNKTER, arAvsikt, arRitningFull, arTomEtikett, kanAvslutaRitning,
  kartaKoordinaterGiltiga, klamEtikett, minPunkter, rensaEtikett, ritaRadText, ritningTillKoordinater, verktygTillForm,
} from './egenkontrollNotering';

describe('verktyg och form', () => {
  it('pil är en linje med riktning, punkt och linje har ingen riktning', () => {
    expect(verktygTillForm('punkt')).toEqual({ typ: 'punkt', pil: false });
    expect(verktygTillForm('linje')).toEqual({ typ: 'linje', pil: false });
    expect(verktygTillForm('pil')).toEqual({ typ: 'linje', pil: true });
  });
  it('avsikten är bara "blev" eller "skulle", och "blev" är förvald', () => {
    expect(arAvsikt('blev')).toBe(true);
    expect(arAvsikt('skulle')).toBe(true);
    expect(arAvsikt('kanske')).toBe(false);
    expect(arAvsikt(null)).toBe(false);
    expect(AVSIKT_STANDARD).toBe('blev');
  });
});

describe('etiketten', () => {
  it('trimmas och blanksteg dras ihop; radbrytningar blir mellanslag', () => {
    expect(rensaEtikett('  Basvägen \n skulle   gått här.  ')).toBe('Basvägen skulle gått här.');
    expect(rensaEtikett(undefined)).toBe('');
  });
  it('bara blanksteg är en tom etikett — den ska bli en DELETE, aldrig en UPDATE', () => {
    for (const t of ['', '   ', '\n\t', null, undefined]) expect(arTomEtikett(t)).toBe(true);
    expect(arTomEtikett(' x ')).toBe(false);
  });
});

describe('ritningen: ett tryck = exakt en punkt', () => {
  const a: [number, number] = [14.5, 56.1];
  const b: [number, number] = [14.51, 56.11];
  const c: [number, number] = [14.52, 56.1];
  it('punkt avslutas av sitt enda tryck, linje och pil behöver två', () => {
    expect(minPunkter('punkt')).toBe(1);
    expect(minPunkter('linje')).toBe(2);
    expect(minPunkter('pil')).toBe(2);
    expect(kanAvslutaRitning('punkt', 1)).toBe(true);
    expect(kanAvslutaRitning('linje', 1)).toBe(false);
    expect(kanAvslutaRitning('pil', 2)).toBe(true);
    expect(arRitningFull('punkt', 1)).toBe(true);
    expect(arRitningFull('linje', 3)).toBe(false);
    expect(arRitningFull('linje', NOTERING_MAX_PUNKTER)).toBe(true);
  });
  it('tre tryck sparas som tre punkter, exakt där man tryckte — ingen utjämning, inget sluter linjen', () => {
    expect(ritningTillKoordinater('linje', [a, b, c])).toEqual([a, b, c]);
  });
  it('en dubblett på samma plats (dubbelhändelse) blir inte en andra punkt', () => {
    expect(ritningTillKoordinater('linje', [a, a, b])).toEqual([a, b]);
    expect(ritningTillKoordinater('linje', [a, a])).toBeNull();
  });
  it('för få punkter ger inget att spara; en punkt tar bara det första trycket', () => {
    expect(ritningTillKoordinater('linje', [a])).toBeNull();
    expect(ritningTillKoordinater('pil', [])).toBeNull();
    expect(ritningTillKoordinater('punkt', [a, b])).toEqual([a]);
  });
  it('en position utan mening (0,0 eller utanför jorden) sparas aldrig', () => {
    expect(ritningTillKoordinater('punkt', [[0, 0]])).toBeNull();
    expect(ritningTillKoordinater('linje', [a, [14.5, 95]])).toBeNull();
  });
  it('texten i raden säger vad nästa tryck gör', () => {
    expect(ritaRadText('punkt', 0)).toBe('Tryck där punkten ska stå');
    expect(ritaRadText('linje', 0)).toBe('Linje: tryck där den ska börja');
    expect(ritaRadText('pil', 1)).toBe('Pil: tryck där den ska sluta');
    expect(ritaRadText('linje', 4)).toBe('Linje · 4 punkter');
  });
});

describe('kartkoordinater — samma regel som databasen', () => {
  it('punkt = exakt en, linje = 2–500, allt som lng/lat', () => {
    expect(kartaKoordinaterGiltiga('punkt', [[14.5, 56.1]])).toBe(true);
    expect(kartaKoordinaterGiltiga('punkt', [[14.5, 56.1], [14.6, 56.2]])).toBe(false);
    expect(kartaKoordinaterGiltiga('linje', [[14.5, 56.1]])).toBe(false);
    expect(kartaKoordinaterGiltiga('linje', [[14.5, 56.1], [14.6, 56.2]])).toBe(true);
    expect(kartaKoordinaterGiltiga('linje', Array.from({ length: 501 }, () => [14.5, 56.1]))).toBe(false);
    expect(kartaKoordinaterGiltiga('punkt', [[14.5, 91]])).toBe(false);
    expect(kartaKoordinaterGiltiga('punkt', [['a', 'b']])).toBe(false);
    expect(kartaKoordinaterGiltiga('punkt', { a: 1 })).toBe(false);
  });
  it('gränserna i koden är samma som i migrationen som kördes i prod', () => {
    const sql = readFileSync('supabase/migrations/20261021074334_egenkontroll_notering_1_tabell.sql', 'utf8');
    expect(sql).toContain(`char_length(etikett) <= ${NOTERING_ETIKETT_MAX}`);
    expect(sql).toContain(`n > ${NOTERING_MAX_PUNKTER}`);
    expect(sql).toContain(`etikett_dx between -${NOTERING_FORSKJUTNING_MAX} and ${NOTERING_FORSKJUTNING_MAX}`);
    expect(sql).toContain('btrim(etikett) <> \'\'');
  });
});

describe('klamEtikett — det sparade är det som visas', () => {
  const ruta = { bredd: 0.4, hojd: 0.08 };
  const bildHojd = 4 / 3; // stående foto

  it('en etikett som redan ligger i bilden rörs inte', () => {
    expect(klamEtikett({ u: 0.5, v: 0.5, bildHojd, dx: 0.1, dy: -0.05, ruta })).toEqual({ dx: 0.1, dy: -0.05 });
  });
  it('en etikett som dragits ut över höger kant läggs mot kanten: mitten = 1 − halva bredden', () => {
    const r = klamEtikett({ u: 0.9, v: 0.5, bildHojd, dx: 1.5, dy: 0, ruta });
    expect(0.9 + r.dx).toBeCloseTo(0.8, 4);
  });
  it('vänster, överkant och nederkant (höjden räknas i bildbredder: stående bild är högre än bred)', () => {
    expect(0.1 + klamEtikett({ u: 0.1, v: 0.5, bildHojd, dx: -1, dy: 0, ruta }).dx).toBeCloseTo(0.2, 4);
    expect(0.5 * bildHojd + klamEtikett({ u: 0.5, v: 0.5, bildHojd, dx: 0, dy: -5, ruta }).dy).toBeCloseTo(0.04, 3);
    expect(0.5 * bildHojd + klamEtikett({ u: 0.5, v: 0.5, bildHojd, dx: 0, dy: 5, ruta }).dy).toBeCloseTo(bildHojd - 0.04, 3);
  });
  it('en etikett bredare än bilden läggs mitt i bilden', () => {
    const r = klamEtikett({ u: 0.2, v: 0.5, bildHojd, dx: 0.3, dy: 0, ruta: { bredd: 1.2, hojd: 0.08 } });
    expect(0.2 + r.dx).toBeCloseTo(0.5, 4);
  });
  it('resultatet ryms alltid i tabellens gräns på ±2 bildbredder', () => {
    const r = klamEtikett({ u: 0.5, v: 0.5, bildHojd: 6, dx: 0, dy: 99, ruta: { bredd: 0.1, hojd: 0.02 } });
    expect(Math.abs(r.dy)).toBeLessThanOrEqual(NOTERING_FORSKJUTNING_MAX);
  });
  it('klämningen är idempotent: renderar man det sparade värdet får man samma värde tillbaka (slumpad prövning)', () => {
    let s = 12345;
    const slump = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    for (let n = 0; n < 5000; n++) {
      const i = {
        u: slump(), v: slump(), bildHojd: 0.5 + slump() * 1.5, dx: (slump() - 0.5) * 6, dy: (slump() - 0.5) * 6,
        ruta: { bredd: 0.05 + slump() * 0.6, hojd: 0.02 + slump() * 0.2 },
      };
      const en = klamEtikett(i);
      const tva = klamEtikett({ ...i, dx: en.dx, dy: en.dy });
      expect(tva).toEqual(en);
      // och innanför bilden (utom när etiketten är större än bilden)
      const mx = i.u + en.dx, my = i.v * i.bildHojd + en.dy;
      if (i.ruta.bredd < 1) {
        expect(mx - i.ruta.bredd / 2).toBeGreaterThanOrEqual(-1e-9);
        expect(mx + i.ruta.bredd / 2).toBeLessThanOrEqual(1 + 1e-9);
      }
      if (i.ruta.hojd < i.bildHojd) {
        expect(my - i.ruta.hojd / 2).toBeGreaterThanOrEqual(-1e-9);
        expect(my + i.ruta.hojd / 2).toBeLessThanOrEqual(i.bildHojd + 1e-9);
      }
    }
  });
});
