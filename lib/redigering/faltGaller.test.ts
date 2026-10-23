import { describe, it, expect } from 'vitest';
import { faltGaller, arPrivat } from './faltGaller';

describe('faltGaller — ett fält som inte gäller visas inte och räknas aldrig som saknat', () => {
  it('åtgärd gäller bara gallring', () => {
    expect(faltGaller('atgard', { huvudtyp: 'Gallring' })).toBe(true);
    expect(faltGaller('atgard', { huvudtyp: 'Slutavverkning' })).toBe(false);
    expect(faltGaller('atgard', { huvudtyp: 'Grot' })).toBe(false);
    expect(faltGaller('atgard', { huvudtyp: 'Gallring', risskotning: true })).toBe(false);
  });

  it('avtalsform gäller slutavverkning hos en virkesköpare, inte privat', () => {
    expect(faltGaller('avtalsform', { huvudtyp: 'Slutavverkning', bolag: 'Vida' })).toBe(true);
    expect(faltGaller('avtalsform', { huvudtyp: 'Slutavverkning', bolag: 'ATA' })).toBe(true);
    expect(faltGaller('avtalsform', { huvudtyp: 'Slutavverkning', bolag: 'Privat' })).toBe(false);
    expect(faltGaller('avtalsform', { huvudtyp: 'Gallring', bolag: 'Vida' })).toBe(false);
  });

  it('inköpare gäller inte privata jobb', () => {
    expect(faltGaller('inkopare', { bolag: 'Vida' })).toBe(true);
    expect(faltGaller('inkopare', { bolag: ' privat ' })).toBe(false);
    // okänt bolag: frågan kan gälla
    expect(faltGaller('inkopare', { bolag: null })).toBe(true);
  });

  it('okänt objekt: inget gäller', () => {
    expect(faltGaller('avtalsform', null)).toBe(false);
  });

  it('arPrivat bryr sig inte om skiftläge eller mellanslag', () => {
    expect(arPrivat('Privat')).toBe(true);
    expect(arPrivat(' PRIVAT')).toBe(true);
    expect(arPrivat('Vida')).toBe(false);
    expect(arPrivat(null)).toBe(false);
  });
});
