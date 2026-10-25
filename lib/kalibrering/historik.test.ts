import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OMKALIBRERING_ORSAK, arOmkalibrering, justering, justeringsText } from './historik';

describe('omkalibrering efter reparation', () => {
  it('R64428:s 56 är en omkalibrering, inte +56 mm', () => {
    const rad = { orsak: 'Repair of measurement system', typ: 'diameter', dia_justering_mm: 56, position_cm: 50 };
    expect(arOmkalibrering(rad)).toBe(true);
    expect(justering(rad)).toEqual({ slag: 'omkalibrering' });
    expect(justeringsText(rad)).toBe('Omkalibrering efter reparation');
    expect(justeringsText(rad)).not.toMatch(/56/);
  });

  it('även längdrader efter reparation (−3/−4 mm på R64428, 18 mm på R64101) är omkalibreringar', () => {
    for (const mm of [-4, -3, 18]) {
      expect(justeringsText({ orsak: OMKALIBRERING_ORSAK, typ: 'langd', langd_justering_mm: mm })).not.toMatch(/mm$/);
    }
  });

  it('databasens märke går före orsaken', () => {
    expect(arOmkalibrering({ orsak: 'Routine check', omkalibrering: true })).toBe(true);
    expect(arOmkalibrering({ orsak: OMKALIBRERING_ORSAK, omkalibrering: false })).toBe(false);
  });

  it('utan märke (migrationen ej körd) avgör orsaken, exakt', () => {
    expect(arOmkalibrering({ orsak: OMKALIBRERING_ORSAK })).toBe(true);
    expect(arOmkalibrering({ orsak: 'Change in weather conditions' })).toBe(false);
    expect(arOmkalibrering({ orsak: 'Other reason' })).toBe(false);
    expect(arOmkalibrering({ orsak: null })).toBe(false);
  });
});

describe('vanliga justeringar', () => {
  it('visar tecken och enhet, och en saknad justering är aldrig 0', () => {
    expect(justeringsText({ orsak: 'Change in weather conditions', typ: 'diameter', dia_justering_mm: 1 })).toBe('+1 mm');
    expect(justeringsText({ orsak: 'Change in weather conditions', typ: 'diameter', dia_justering_mm: -1 })).toBe('−1 mm');
    expect(justeringsText({ orsak: 'Change in weather conditions', typ: 'diameter', dia_justering_mm: 0 })).toBe('0 mm');
    expect(justeringsText({ orsak: 'Other reason', typ: 'langd', langd_justering_mm: null })).toBe('saknas i datan');
  });

  it('rotstockens längdjustering står bredvid längdjusteringen, bara på längdrader', () => {
    expect(justeringsText({ orsak: 'Other reason', typ: 'langd', langd_justering_mm: 12, langd_justering_rot_mm: -3 }))
      .toBe('+12 mm · rot −3 mm');
    expect(justeringsText({ orsak: 'Other reason', typ: 'langd', langd_justering_mm: 12, langd_justering_rot_mm: null }))
      .toBe('+12 mm');
    expect(justeringsText({ orsak: 'Other reason', typ: 'diameter', dia_justering_mm: 2, langd_justering_rot_mm: 9 }))
      .toBe('+2 mm');
  });
});

describe('migrationen och koden är överens', () => {
  const sql = readFileSync(
    join(__dirname, '../../supabase/migrations/20261024093123_kalibrering_historik_rot_och_omkalibrering.sql'),
    'utf8',
  );
  it('samma orsaks-literal i generated column och i TypeScript', () => {
    expect(sql).toContain(`coalesce(orsak, '') = '${OMKALIBRERING_ORSAK}'`);
  });
  it('rotkolumnen och märket läggs till additivt', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS langd_justering_rot_mm integer/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS omkalibrering boolean\s+GENERATED ALWAYS AS/);
  });
});
