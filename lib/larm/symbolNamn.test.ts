// Samma namn överallt: menyn, namnet under symbolen på kartan och larmkortet. Förut: El-ledning/Kraftledning och Varning/Fara.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SYMBOL_GRUPP, SYMBOL_NAMN, symbolNamn } from './grupper';

const page = readFileSync('app/planering/page.tsx', 'utf8');

describe('symbolens namn', () => {
  it('varje symboltyp med grupp har ett namn (utom "default")', () => {
    for (const typ of Object.keys(SYMBOL_GRUPP)) {
      if (typ === 'default') continue;
      expect(SYMBOL_NAMN[typ], typ).toBeTruthy();
    }
  });
  it('El-ledning och Varning heter så överallt', () => {
    expect(SYMBOL_NAMN.powerline).toBe('El-ledning');
    expect(SYMBOL_NAMN.warning).toBe('Varning');
    expect(symbolNamn('okänd')).toBe('Markering');
    expect(symbolNamn(undefined)).toBe('Markering');
  });
  it('menyn (symbolCategories) hämtar namnen ur SYMBOL_NAMN — inga egna strängar', () => {
    const a = page.indexOf('const symbolCategories = [');
    const b = page.indexOf('const markerTypes = [');
    const block = page.slice(a, b);
    const ids = [...block.matchAll(/\{ id: '(\w+)', name: ([^}]+) \}/g)];
    expect(ids.length).toBeGreaterThanOrEqual(20);
    for (const m of ids) expect(m[2].trim(), m[1]).toBe(`SYMBOL_NAMN.${m[1]}`);
  });
  it('namnet under symbolen på kartan (markers-korvy-label) bygger på SYMBOL_NAMN, inte egna ord', () => {
    const i = page.indexOf("id: 'markers-korvy-label'");
    const lager = page.slice(i, i + 1600);
    expect(lager).toContain('SYMBOL_NAMN[t]');
    expect(lager).not.toMatch(/'Kraftledning'|'Fara'/);
  });
  it('ingen annan etikett i körvyn skriver "Fara" som symbolnamn', () => {
    expect(page).not.toMatch(/'warning',\s+'Fara'/);
  });
});
