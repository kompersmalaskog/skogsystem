// @vitest-environment jsdom
// Raden "Passage genom Hänsyn 6" (lib/larm/passage): ingen knapp, rätt namn, och sidan visar den bara när inget annat har platsen överst.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PassageRad } from './PassageRad';
import { GRUPPER } from '@/lib/larm/grupper';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('PassageRad', () => {
  it('visar "Passage genom" + ytans bricka, är en statusrad utan knapp', () => {
    const c = document.createElement('div'); document.body.appendChild(c);
    act(() => { createRoot(c).render(<PassageRad passage={{ id: 'v', namn: 'Hänsyn 6', grupp: 'natur', farg: GRUPPER.natur.farg }} top="0px" />); });
    const rad = c.querySelector('[data-testid="larm-passage"]')!;
    expect(rad.getAttribute('role')).toBe('status');
    expect(rad.getAttribute('aria-label')).toBe('Passage genom Hänsyn 6');
    expect(rad.textContent).toBe('Passage genomHänsyn 6');
    expect(c.querySelector('[data-testid="larm-passage-bricka"]')!.textContent).toBe('Hänsyn 6');
    expect(c.querySelector('button')).toBeNull();
  });
});

describe('sidan (källvakt)', () => {
  const sida = readFileSync(join(__dirname, '..', '..', 'app', 'planering', 'page.tsx'), 'utf8');
  it('raden visas bara utan larmkort, instruktion, påminnelse, besök och lossning — på instruktionens plats', () => {
    expect(sida).toContain('{korvyActive && larm.passage && !larm.kort && !inst.kort && !inst.paminnelse && !besokKortSynligt && !lossningVisas && (');
    expect(sida).toContain('<PassageRad passage={larm.passage} top={instruktionTop} />');
  });
});
