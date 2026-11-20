'use client';
// Ramen kring markägarrapporten: listan och rapporten.
//  - under 1100 px: EN sak per skärm — listan på /admin/markagarrapport, rapporten på /…/<objekt>;
//  - från 1100 px (iPad liggande, dator): listan som sidokolumn till vänster och rapporten till höger, som Mail.
// Vad som syns avgörs av CSS (ingen mätning i JS, inget hopp vid första renderingen).
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AVSTAND, FARG, FONT, KOLUMN, KOLUMN_CSS, LAYOUT, ROT_MIN_HOJD, designCss } from '@/lib/design/tokens';
import type { ListRad } from '@/lib/markagarrapport/lista';
import ObjektLista from './ObjektLista';

/** Från denna bredd står listan bredvid rapporten. */
export const SIDOKOLUMN_FRAN_PX = 1100;
const SIDOKOLUMN_BREDD_PX = 360;
const BAS = '/admin/markagarrapport';

const css = `
.mr-ram { display: flex; min-height: ${ROT_MIN_HOJD}; background: ${FARG.bg}; color: ${FARG.text}; }
.mr-sida { width: 100%; box-sizing: border-box; padding: ${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px; }
.mr-sida-inre { max-width: ${KOLUMN.smal}px; margin: 0 auto; }
.mr-innehall { flex: 1; min-width: 0; }
@media (max-width: ${SIDOKOLUMN_FRAN_PX - 1}px) {
  .mr-lista-vy .mr-innehall { display: none; }
  .mr-rapport-vy .mr-sida { display: none; }
}
@media (min-width: ${SIDOKOLUMN_FRAN_PX}px) {
  .mr-sida {
    width: ${SIDOKOLUMN_BREDD_PX}px; flex-shrink: 0; border-right: 1px solid ${FARG.linje};
    position: sticky; top: ${LAYOUT.topbar}; height: ${ROT_MIN_HOJD}; overflow-y: auto;
  }
  .mr-sida-inre { max-width: none; }
  .mr-bara-smal { display: none !important; }
}
@media (max-width: ${SIDOKOLUMN_FRAN_PX - 1}px) {
  .mr-bara-bred { display: none !important; }
}
`;

export default function MarkagarRam({ rader, fel, children }: { rader: ListRad[]; fel: string | null; children: ReactNode }) {
  const sokvag = usePathname() ?? BAS;
  const arLista = sokvag.replace(/\/$/, '') === BAS;
  const valt = arLista ? null : decodeURIComponent(sokvag.slice(BAS.length + 1).split('/')[0] ?? '');
  return (
    // Typsnittet sätts inline: FONT har citattecken, och React escapar dem i en <style> vid serverrendering (då gäller inte regeln).
    <div className={`mr-ram ${arLista ? 'mr-lista-vy' : 'mr-rapport-vy'}`} style={{ fontFamily: FONT }} data-markagar-ram="">
      <style>{designCss + KOLUMN_CSS + css}</style>
      <aside className="mr-sida" aria-label="Alla avverkningar">
        <div className="mr-sida-inre">
          <ObjektLista rader={rader} fel={fel} valt={valt} />
        </div>
      </aside>
      <main className="mr-innehall">{children}</main>
    </div>
  );
}
