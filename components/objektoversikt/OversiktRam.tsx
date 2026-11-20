'use client';
// Ramen kring objektöversikten: listan och objektet (samma mönster som markägarrapporten, MarkagarRam).
//  - under 1100 px: EN sak per skärm — listan på /admin/objektoversikt, rapporten på /…/<objekt>;
//  - från 1100 px (iPad liggande, dator): listan som sidokolumn till vänster och rapporten till höger, som Mail.
// Vad som syns avgörs av CSS (ingen mätning i JS, inget hopp vid första renderingen).
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AVSTAND, FARG, FONT, KOLUMN, KOLUMN_CSS, LAYOUT, ROT_MIN_HOJD, designCss } from '@/lib/design/tokens';
import type { ListPost } from '@/lib/objektoversikt/vy';
import Lista from './Lista';

/** Från denna bredd står listan bredvid rapporten. */
export const SIDOKOLUMN_FRAN_PX = 1100;
const SIDOKOLUMN_BREDD_PX = 360;
const BAS = '/admin/objektoversikt';

const css = `
.oo-ram { display: flex; min-height: ${ROT_MIN_HOJD}; background: ${FARG.bg}; color: ${FARG.text}; }
.oo-sida { width: 100%; box-sizing: border-box; padding: ${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px; }
.oo-sida-inre { max-width: ${KOLUMN.smal}px; margin: 0 auto; }
.oo-innehall { flex: 1; min-width: 0; }
@media (max-width: ${SIDOKOLUMN_FRAN_PX - 1}px) {
  .oo-lista-vy .oo-innehall { display: none; }
  .oo-rapport-vy .oo-sida { display: none; }
}
@media (min-width: ${SIDOKOLUMN_FRAN_PX}px) {
  .oo-sida {
    width: ${SIDOKOLUMN_BREDD_PX}px; flex-shrink: 0; border-right: 1px solid ${FARG.linje};
    position: sticky; top: ${LAYOUT.topbar}; height: ${ROT_MIN_HOJD}; overflow-y: auto;
  }
  .oo-sida-inre { max-width: none; }
  .oo-bara-smal { display: none !important; }
}
@media (max-width: ${SIDOKOLUMN_FRAN_PX - 1}px) {
  .oo-bara-bred { display: none !important; }
}
`;

export default function OversiktRam({ poster, fel, children }: { poster: ListPost[]; fel: string | null; children: ReactNode }) {
  const sokvag = usePathname() ?? BAS;
  const arLista = sokvag.replace(/\/$/, '') === BAS;
  const valt = arLista ? null : decodeURIComponent(sokvag.slice(BAS.length + 1).split('/')[0] ?? '');
  return (
    // Typsnittet sätts inline: FONT har citattecken, och React escapar dem i en <style> vid serverrendering (då gäller inte regeln).
    <div className={`oo-ram ${arLista ? 'oo-lista-vy' : 'oo-rapport-vy'}`} style={{ fontFamily: FONT }} data-oversikt-ram="">
      <style>{designCss + KOLUMN_CSS + css}</style>
      <aside className="oo-sida" aria-label="Alla objekt">
        <div className="oo-sida-inre">
          <Lista poster={poster} fel={fel} valt={valt} />
        </div>
      </aside>
      <main className="oo-innehall">{children}</main>
    </div>
  );
}
