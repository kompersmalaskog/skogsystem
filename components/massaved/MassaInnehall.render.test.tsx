// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import MassaInnehall from './MassaInnehall';
import { KorvyObjektPill } from '@/components/planering/KorvyObjektPill';
import type { MassaRad } from '@/lib/massaLangd';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function rita(el: React.ReactElement) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  act(() => root.render(el));
  return { div, stang: () => { act(() => root.unmount()); div.remove(); } };
}

const r = (p: Partial<MassaRad>): MassaRad => ({
  maskin_id: 'R64428', operator_id: 'o1', operator_namn: 'Oskar Nilsson', medarbetare_id: 'm1', dag: '2026-11-09', tradslag: 'GRAN', langd_dm: 45, antal: 10, summa_cm: 4500, ...p,
});

describe('MassaInnehall', () => {
  it('visar förarens snitt, förra veckan, trädslag och alla förare med "du"', () => {
    const rader = [
      r({}), r({ tradslag: 'TALL', langd_dm: 40, antal: 10, summa_cm: 4000 }),
      r({ dag: '2026-11-04', antal: 4, summa_cm: 1760 }),
      r({ medarbetare_id: 'm2', operator_id: 'o2', operator_namn: 'Martin', antal: 5, summa_cm: 2500 }),
    ];
    const { div, stang } = rita(<MassaInnehall rader={rader} fel={null} idag="2026-11-09" jag={{ nyckel: 'm:m1', namn: 'Oskar' }} maskinNamn={{ R64428: 'H8E -26' }} onForsok={() => {}} />);
    expect(div.querySelector('[data-testid="massa-snitt"]')?.textContent).toBe('4,3 m');
    expect(div.querySelector('[data-testid="massa-forra-veckan"]')?.textContent).toBe('Förra veckan 4,4 m');
    expect(div.textContent).toContain('Gran');
    expect(div.textContent).toContain('Tall');
    const forare = [...div.querySelectorAll('[data-testid="massa-forare"]')];
    expect(forare.map(f => f.textContent?.split('H8E')[0].trim())).toEqual(['Martin', 'Oskar · du']);
    expect(forare[1].getAttribute('data-du')).toBe('1');
    const klasser = [...div.querySelectorAll('[data-testid="massa-klass"]')];
    expect(klasser.map(k => k.textContent)).toEqual(['4,0 m50 %', '4,5 m50 %']);
    stang();
  });

  it('läsfel utan data säger det, aldrig 0', () => {
    const { div, stang } = rita(<MassaInnehall rader={null} fel="Kunde inte läsa massaveden just nu" idag="2026-11-09" jag={null} maskinNamn={{}} onForsok={() => {}} />);
    expect(div.textContent).toContain('Kunde inte läsa massaveden just nu');
    expect(div.textContent).toContain('Försök igen');
    stang();
  });
});

describe('KorvyObjektPill massa', () => {
  const vy = { antal: 0, krav: null, status: 'ingen' as const };
  const bas = { namn: 'Trakt', hogstubbar: vy, evighetstrad: vy, smal: false, ikonHogstubbe: null, ikonEvighetstrad: null, onNamn: () => {}, onHogstubbe: () => {}, onEvighetstrad: () => {} };
  it('visar "Massa idag 4,5 m" och öppnar vid tryck', () => {
    let oppnad = 0;
    const { div, stang } = rita(<KorvyObjektPill {...bas} massa={{ etikett: 'Massa idag', varde: '4,5 m', onTryck: () => { oppnad++; } }} />);
    const k = div.querySelector('[data-testid="korvy-pill-massa"]') as HTMLButtonElement;
    expect(k.textContent).toBe('Massa idag4,5 m');
    act(() => k.click());
    expect(oppnad).toBe(1);
    stang();
  });
  it('utan massa finns ingen knapp', () => {
    const { div, stang } = rita(<KorvyObjektPill {...bas} />);
    expect(div.querySelector('[data-testid="korvy-pill-massa"]')).toBeNull();
    stang();
  });
});
