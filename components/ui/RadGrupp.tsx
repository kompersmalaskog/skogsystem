'use client';
import { Children, Fragment, cloneElement, createContext, isValidElement, useContext, type ReactElement, type ReactNode } from 'react';
import Link from 'next/link';
import { AVSTAND, FARG, IKON, KORT, RAD, TYP } from '@/lib/design/tokens';

/**
 * Radgrupp i iOS-mönstret: länkrader (tryck = gå vidare) i ETT kort — `FARG.kort`, `RADIE.kort`, ingen ram och ingen sidopadding
 * i kortet; varje rad bär `AVSTAND.l` själv, så hela raden är tryckytan. Rader är `RAD` med `FARG.linje` mellan, sista utan linje,
 * `chevron_right` i `FARG.text3` till höger, texten `TYP.text` i `FARG.text`.
 * Utan kort läses en rad på svart som en rubrik, inte som något man trycker på.
 *
 * Ligger gruppen på en yta som redan är `FARG.kort` (ett sheet, en panel) ges `bakgrund={FARG.upphojt}`, annars syns inte kortet.
 * Barnen är `RadLank`; fragment och falska barn (`cond && <RadLank/>`) klaras.
 */
const GruppContext = createContext(false);

function platta(barn: ReactNode): ReactElement[] {
  return Children.toArray(barn)
    .flatMap((b) => (isValidElement(b) && b.type === Fragment ? platta((b.props as { children?: ReactNode }).children) : [b]))
    .filter(isValidElement) as ReactElement[];
}

export function RadGrupp({ children, bakgrund = FARG.kort, marginBottom = AVSTAND.xl }: { children: ReactNode; bakgrund?: string; marginBottom?: number }) {
  const rader = platta(children);
  return (
    <GruppContext.Provider value>
      <div style={{ ...KORT, padding: 0, background: bakgrund, overflow: 'hidden', marginBottom }}>
        {rader.map((r, i) => cloneElement(r as ReactElement<{ sista?: boolean }>, { key: i, sista: i === rader.length - 1 }))}
      </div>
    </GruppContext.Provider>
  );
}

/**
 * En länkrad. Hela raden är en knapp (`onClick`) eller länk (`href`), minst 44 px. Smakprovet står efter en punkt i `FARG.text2`.
 * `orange` = något avviker (texten säger vad). Utanför en `RadGrupp` (t.ex. i ett kort som redan har sidopadding) bär raden ingen egen sidopadding.
 */
export function RadLank({ text, smakprov, href, onClick, orange, sista }: { text: string; smakprov?: string; href?: string; onClick?: () => void; orange?: boolean; sista?: boolean }) {
  const igrupp = useContext(GruppContext);
  // `border: 'none'` FÖRE `...RAD`: React sätter stilnycklarna i ordning, och ett `border` efter `borderBottom` nollar linjen.
  const stil: React.CSSProperties = {
    border: 'none',
    ...RAD,
    justifyContent: 'space-between',
    width: '100%',
    boxSizing: 'border-box',
    padding: `${AVSTAND.m}px ${igrupp ? AVSTAND.l : 0}px`,
    background: 'transparent',
    borderBottom: sista ? 'none' : RAD.borderBottom,
    textAlign: 'left',
    ...TYP.text,
    color: orange ? FARG.orange : FARG.text,
    fontFamily: 'inherit',
    cursor: 'pointer',
    textDecoration: 'none',
  };
  const inre = (
    <>
      <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {text}{smakprov && <span style={{ color: FARG.text2 }}> · {smakprov}</span>}
      </span>
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.text3, lineHeight: 1, flexShrink: 0 }}>chevron_right</span>
    </>
  );
  if (href) return <Link href={href} style={stil}>{inre}</Link>;
  return <button type="button" onClick={onClick} style={stil}>{inre}</button>;
}
