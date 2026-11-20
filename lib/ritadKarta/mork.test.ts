import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MORK_PAINT, ritadPaint, sattDragt, morkGrundLager } from './mork';
import { grundLager, RITAD_LAGER } from './lager';
import { tonPaint } from '../traktTon';
import { MORK_BAKGRUND } from './stil';

describe('Mörk (Tesla-kartan) — samma ritade karta i mörk drägt', () => {
  it('ändrar bara den ritade kartans egna lager', () => {
    for (const id of Object.keys(MORK_PAINT)) expect(RITAD_LAGER, id).toContain(id);
  });
  it('varje ändrad egenskap har ett original i Ritads lagerspec (så ett byte tillbaka till Ritad återställer allt)', () => {
    const org = ritadPaint();
    for (const [id, p] of Object.entries(MORK_PAINT)) for (const k of Object.keys(p)) expect(org[id]?.[k], `${id} ${k}`).toBeDefined();
  });
  it('sattDragt växlar fram och tillbaka och lämnar Ritad exakt som lagerspecen', () => {
    const satt: Record<string, Record<string, unknown>> = {};
    const finns = new Set(grundLager().map((l: any) => l.id));
    const map = { getLayer: (id: string) => finns.has(id), setPaintProperty: (id: string, k: string, v: unknown) => { (satt[id] ??= {})[k] = v; } };
    sattDragt(map, true);
    expect(satt['ritad-bakgrund']['background-color']).toBe(MORK_BAKGRUND);
    sattDragt(map, false);
    for (const l of grundLager() as any[]) for (const k of Object.keys(satt[l.id] ?? {})) expect(satt[l.id][k], `${l.id} ${k}`).toEqual(l.paint[k]);
  });
  it('kartan utan objekt i Mörk har den mörka botten', () => {
    expect(morkGrundLager().find((l: any) => l.id === 'ritad-bakgrund').paint['background-color']).toBe(MORK_BAKGRUND);
  });
  it('utanför trakten tonas mot Mörks botten', () => {
    expect(tonPaint('mork')['fill-color']).toBe(MORK_BAKGRUND);
  });
  it('ingen annan fil färgar om den ritade kartans lager (drägten bor i mork.ts)', () => {
    const rot = process.cwd();
    const filer = ['app/planering/page.tsx', 'lib/hooks/useRitadKarta.ts'];
    for (const f of filer) expect(fs.readFileSync(path.join(rot, f), 'utf8'), f).not.toMatch(/setPaintProperty\(\s*['"]ritad-(bakgrund|vag|vatten|hus|nvdb|dike|relief)/);
  });
});
