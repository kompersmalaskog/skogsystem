import { describe, expect, it } from 'vitest';
import { BASKARTA_BILD, lagerBild, linjeYta, sparYta, tonadYta } from './lagerForhandsbild';

describe('lagerForhandsbild', () => {
  it('bakgrundskartorna har var sin bild', () => {
    expect(Object.keys(BASKARTA_BILD).sort()).toEqual(['lantmateriet', 'osm', 'satellite', 'terrain']);
    expect(new Set(Object.values(BASKARTA_BILD)).size).toBe(4);
    expect(lagerBild('satellite')).toBe(BASKARTA_BILD.satellite);
  });
  it('ett lager med färg får en tonad yta av just den färgen', () => {
    expect(lagerBild('nyckelbiotoper', '#a855f7')).toBe('linear-gradient(135deg, #a855f740, #a855f7)');
  });
  it('overlay-id utan färg ur LayerDef slås upp, okänt id får en neutral yta', () => {
    expect(lagerBild('wetlands')).toBe(tonadYta('#3b82f6'));
    expect(lagerBild('okant-lager')).toContain('linear-gradient');
  });
  it('en färg som inte är #rrggbb används rakt av (ingen trasig CSS)', () => {
    expect(tonadYta('rgba(1,2,3,0.5)')).toBe('rgba(1,2,3,0.5)');
    expect(tonadYta('red')).toBe('red');
  });
  it('linje- och spårytor', () => {
    expect(linjeYta('#ff453a')).toBe('#ff453a');
    expect(linjeYta('#ff453a', '#ffd60a')).toContain('repeating-linear-gradient');
    expect(sparYta('#30d158')).toContain('#30d158');
  });
});
