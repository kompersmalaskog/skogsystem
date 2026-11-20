import { describe, expect, it } from 'vitest';
import { arUtkast, lasUtkast, rensaUtkast, sparaUtkast } from './egenkontrollKommentarUtkast';

function minneslager() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe('utkast till rundans kommentar', () => {
  it('sparas per runda och rensas', () => {
    const l = minneslager();
    sparaUtkast('r1', 'Stenmuren ar paverkad', l);
    sparaUtkast('r2', 'En annan runda', l);
    expect(lasUtkast('r1', l)).toBe('Stenmuren ar paverkad');
    expect(lasUtkast('r2', l)).toBe('En annan runda');
    rensaUtkast('r1', l);
    expect(lasUtkast('r1', l)).toBeNull();
    expect(lasUtkast('r2', l)).toBe('En annan runda');
  });

  it('ett lager som kastar (privat lage, full disk) ar "inget utkast" - aldrig ett fel som stoppar rundan', () => {
    const trasigt = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(lasUtkast('r1', trasigt)).toBeNull();
    expect(() => sparaUtkast('r1', 't', trasigt)).not.toThrow();
    expect(() => rensaUtkast('r1', trasigt)).not.toThrow();
  });

  it('ett utkast som ar lika med det sparade (utom blanksteg i kanterna) ar inget utkast; ett tomt utkast mot en sparad text ar det', () => {
    expect(arUtkast(null, 'text')).toBe(false);
    expect(arUtkast(' text ', 'text')).toBe(false);
    expect(arUtkast('ny text', 'text')).toBe(true);
    expect(arUtkast('', 'text')).toBe(true);
    expect(arUtkast('', null)).toBe(false);
    expect(arUtkast('rader', null)).toBe(true);
  });
});
