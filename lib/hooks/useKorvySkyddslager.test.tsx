// @vitest-environment jsdom
// Hooken som sidan använder för körvyns skyddslager: byte av objekt ger rätt val DIREKT (samma rendering), knappen sparar, omstart minns.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useKorvySkyddslager } from './useKorvySkyddslager';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SJU = ['nyckelbiotoper', 'biotopskydd', 'vattenskydd', 'naturreservat', 'natura2000', 'sumpskog', 'kraftledningar'];

type Ut = ReturnType<typeof useKorvySkyddslager>;
let roots: Root[] = [];

/** Monterar hooken; `renderingar` är värdet i VARJE rendering (för att se att bytet är rätt direkt). */
function montera(maskin: string | null, objekt: string | null) {
  const el = document.createElement('div');
  const root = createRoot(el); roots.push(root);
  const h = { ut: null as unknown as Ut, renderingar: [] as Ut['slackta'][], props: { maskin, objekt } };
  function Harness({ maskin, objekt }: { maskin: string | null; objekt: string | null }) {
    const u = useKorvySkyddslager(maskin, objekt);
    h.ut = u; h.renderingar.push(new Set(u.slackta));
    return null;
  }
  const rita = () => act(() => { root.render(<Harness maskin={h.props.maskin} objekt={h.props.objekt} />); });
  rita();
  return { h, byt: (objekt: string | null) => { h.props = { ...h.props, objekt }; rita(); } };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { for (const r of roots) act(() => r.unmount()); roots = []; });

describe.each(SJU)('lager %s', (lager) => {
  it('nytt objekt tänt · släck · omstart släckt · annat objekt tänt · tillbaka släckt — och bytet är rätt i SAMMA rendering', () => {
    const { h, byt } = montera('R64428', 'a');
    expect(h.ut.slackta.has(lager)).toBe(false);
    act(() => h.ut.vaxla(lager));
    expect(h.ut.slackta.has(lager)).toBe(true);
    // omstart = ny hook-instans mot samma localStorage
    expect(montera('R64428', 'a').h.ut.slackta.has(lager)).toBe(true);
    // byte av objekt: INGEN rendering efter bytet får visa förra objektets val
    h.renderingar.length = 0;
    byt('b');
    expect(h.renderingar.length).toBeGreaterThan(0);
    for (const r of h.renderingar) expect(r.has(lager)).toBe(false);
    h.renderingar.length = 0;
    byt('a');
    for (const r of h.renderingar) expect(r.has(lager)).toBe(true);
    // tänder han det igen är det tänt efter omstart också
    act(() => h.ut.vaxla(lager));
    expect(h.ut.slackta.has(lager)).toBe(false);
    expect(montera('R64428', 'a').h.ut.slackta.has(lager)).toBe(false);
  });
});

describe('hooken', () => {
  it('ref följer senaste valet (defer-effekten läser den efter 500 ms)', () => {
    const { h } = montera('R64428', 'a');
    act(() => h.ut.vaxla('vattenskydd'));
    expect(h.ut.slacktaRef.current.has('vattenskydd')).toBe(true);
  });

  it('inget objekt: inget sparas, allt tänt', () => {
    const { h } = montera('R64428', null);
    act(() => h.ut.vaxla('vattenskydd'));
    expect(localStorage.length).toBe(0);
  });

  it('ett lager som inte är ett skyddslager släcks aldrig (fornlämningar rörs inte)', () => {
    const { h } = montera('R64428', 'a');
    act(() => h.ut.vaxla('fornlamningar'));
    expect(h.ut.slackta.size).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('en annan maskin på samma objekt ser lagret tänt', () => {
    const { h } = montera('R64428', 'a');
    act(() => h.ut.vaxla('vattenskydd'));
    expect(montera('PONS20SDJAA270231', 'a').h.ut.slackta.has('vattenskydd')).toBe(false);
  });
});
