import { describe, it, expect } from 'vitest';
import { senastFran } from './objektVy';

describe('senastFran — när maskinerna senast skickade, i svaret', () => {
  it('nyast först, en maskin per led', () => {
    expect(senastFran([
      { maskinId: 'G', modell: 'Giant', typ: 'skordare', antalFiler: 6, senasteData: `${new Date().getFullYear()}-10-14` },
      { maskinId: 'W', modell: 'Wisent', typ: 'skotare', antalFiler: 3, senasteData: `${new Date().getFullYear()}-10-21` },
    ])).toBe('Senast från Wisent 21 okt · Giant 14 okt');
  });
  it('inget datum = ingen rad; okänd modell = maskin-id', () => {
    expect(senastFran([])).toBeNull();
    expect(senastFran([{ maskinId: 'G', antalFiler: 1 }])).toBeNull();
    expect(senastFran([{ maskinId: 'A030353', antalFiler: 1, senasteData: '2025-03-02' }])).toBe('Senast från A030353 2 mar 2025');
  });
});
