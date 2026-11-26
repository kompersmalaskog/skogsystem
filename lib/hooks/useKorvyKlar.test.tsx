// @vitest-environment jsdom
// Hooken som sidan använder för körvyns dämpade symboler: Klar → omstart minns → Visa igen → full; annat objekt och annan maskin ärver aldrig valet,
// och bytet av objekt är rätt i SAMMA rendering (så en symbol aldrig hinner ritas full på ett objekt där föraren dämpat den).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useKorvyKlar } from './useKorvyKlar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
type Ut = ReturnType<typeof useKorvyKlar>;
let roots: Root[] = [];

function montera(maskin: string | null, objekt: string | null) {
  const el = document.createElement('div');
  const root = createRoot(el); roots.push(root);
  const h = { ut: null as unknown as Ut, renderingar: [] as Set<string>[], props: { maskin, objekt } };
  function Harness({ maskin, objekt }: { maskin: string | null; objekt: string | null }) {
    const u = useKorvyKlar(maskin, objekt);
    h.ut = u; h.renderingar.push(new Set(u.klara));
    return null;
  }
  const rita = () => act(() => { root.render(<Harness maskin={h.props.maskin} objekt={h.props.objekt} />); });
  rita();
  return { h, byt: (objekt: string | null) => { h.props = { ...h.props, objekt }; rita(); } };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { for (const r of roots) act(() => r.unmount()); roots = []; });

describe('useKorvyKlar', () => {
  it('Klar → omstart (ny hook mot samma lagring) är fortfarande dämpad → Visa igen → full', () => {
    const { h } = montera('R64428', 'brokamala');
    expect(h.ut.klara.has('77')).toBe(false);
    act(() => h.ut.vaxla('77'));
    expect(h.ut.klara.has('77')).toBe(true);
    // omstart av körvyn / nästa dag = ny instans mot samma localStorage
    const efter = montera('R64428', 'brokamala');
    expect(efter.h.ut.klara.has('77')).toBe(true);
    act(() => efter.h.ut.vaxla('77'));
    expect(efter.h.ut.klara.has('77')).toBe(false);
    expect(montera('R64428', 'brokamala').h.ut.klara.size).toBe(0);
  });
  it('en annan maskin (skotaren) och ett annat objekt ärver aldrig valet', () => {
    const { h } = montera('R64428', 'brokamala');
    act(() => h.ut.vaxla('77'));
    expect(montera('A110148', 'brokamala').h.ut.klara.size).toBe(0);
    expect(montera('R64428', 'annat').h.ut.klara.size).toBe(0);
  });
  it('byte av objekt är rätt i SAMMA rendering — aldrig ett objekt med förra objektets dämpade symboler', () => {
    const { h, byt } = montera('R64428', 'a');
    act(() => h.ut.vaxla('1'));
    h.renderingar.length = 0;
    byt('b');
    expect(h.renderingar.every((r) => r.size === 0), 'objekt b: inget dämpat i någon rendering').toBe(true);
    const n = h.renderingar.length;
    byt('a');
    expect(h.renderingar[n].has('1'), 'tillbaka på a: dämpad redan i första renderingen').toBe(true);
  });
});
