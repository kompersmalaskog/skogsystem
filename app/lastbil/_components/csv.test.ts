import { describe, it, expect } from 'vitest';
import { csvText } from './csv';

describe('csvText', () => {
  it('BOM, semikolon och CRLF', () => {
    expect(csvText([['a', 1], ['b', 2.5]])).toBe('﻿a;1\r\nb;2.5');
  });
  it('citerar fält med semikolon, citattecken och radbrytning', () => {
    expect(csvText([['x;y', 'sa "hej"', 'rad1\nrad2']])).toBe('﻿"x;y";"sa ""hej""";"rad1\nrad2"');
  });
  it('tomma fält blir tomma', () => {
    expect(csvText([['a', '', 'c']])).toBe('﻿a;;c');
  });
});
