'use client';
// Ramen kring gallringsvyn: listan och trakten — samma mönster som markägarrapporten (MarkagarRam).
//  - under 1100 px: EN sak per skärm — listan på /gallring, trakten på /gallring/<vo> med "‹ Gallringar";
//  - från 1100 px (iPad liggande, dator): listan som sidokolumn till vänster och trakten till höger, som Mail.
// Vad som syns avgörs av CSS (ingen mätning i JS, inget hopp vid första renderingen).
// Kvittot (/gallring/<vo>/kvitto) är ett dokument till markägaren och ritas utan ram.
//
// Listan läses HÄR, en gång, så att den står kvar när man byter trakt på en bred skärm.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AVSTAND, FARG, FONT, KOLUMN, KOLUMN_CSS, LAYOUT, ROT_MIN_HOJD, designCss } from '@/lib/design/tokens';
import { aktuelltAr, hamtaGallringar, traktarForAr } from '@/lib/gallring';
import GallringLista, { type ListLage } from './GallringLista';

/** Från denna bredd står listan bredvid trakten. */
export const SIDOKOLUMN_FRAN_PX = 1100;
const SIDOKOLUMN_BREDD_PX = 360;
const BAS = '/gallring';

// Inga citattecken i CSS-strängen: React escapar dem i <style> vid serverrendering (se CLAUDE.md, markägarrapporten).
const css = `
.gr-ram { display: flex; min-height: ${ROT_MIN_HOJD}; background: ${FARG.bg}; color: ${FARG.text}; }
.gr-sida { width: 100%; box-sizing: border-box; padding: ${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px; }
.gr-sida-inre { max-width: ${KOLUMN.smal}px; margin: 0 auto; }
.gr-innehall { flex: 1; min-width: 0; }
@media (max-width: ${SIDOKOLUMN_FRAN_PX - 1}px) {
  .gr-lista-vy .gr-innehall { display: none; }
  .gr-trakt-vy .gr-sida { display: none; }
  .gr-bara-bred { display: none !important; }
}
@media (min-width: ${SIDOKOLUMN_FRAN_PX}px) {
  .gr-sida {
    width: ${SIDOKOLUMN_BREDD_PX}px; flex-shrink: 0; border-right: 1px solid ${FARG.linje};
    position: sticky; top: ${LAYOUT.topbar}; height: ${ROT_MIN_HOJD}; overflow-y: auto;
  }
  .gr-sida-inre { max-width: none; }
  .gr-bara-smal { display: none !important; }
}
`;

export default function GallringRam({ children }: { children: ReactNode }) {
  const sokvag = (usePathname() ?? BAS).replace(/\/$/, '');
  const arLista = sokvag === BAS;
  const arKvitto = sokvag.endsWith('/kvitto');
  const valt = arLista ? null : decodeURIComponent(sokvag.slice(BAS.length + 1).split('/')[0] ?? '');

  const ar = aktuelltAr();
  const [lage, setLage] = useState<ListLage>({ typ: 'laddar' });

  const ladda = useCallback(async () => {
    setLage({ typ: 'laddar' });
    try {
      const alla = await hamtaGallringar();
      const rader = traktarForAr(alla, ar);
      setLage({ typ: 'klar', rader, tidigareAr: alla.length - rader.length });
    } catch (e) {
      // Läsfel får aldrig se ut som "inga gallringar" — då tror man att uppföljningen är gjord.
      setLage({ typ: 'fel', text: e instanceof Error ? e.message : 'Kunde inte hämta gallringarna.' });
    }
  }, [ar]);

  useEffect(() => {
    if (!arKvitto) ladda();
  }, [ladda, arKvitto]);

  if (arKvitto) return <>{children}</>;

  return (
    // Typsnittet inline: FONT har citattecken och fungerar inte i en serverrenderad <style>.
    <div className={`gr-ram ${arLista ? 'gr-lista-vy' : 'gr-trakt-vy'}`} style={{ fontFamily: FONT }} data-gallring-ram="">
      <style>{designCss + KOLUMN_CSS + css}</style>
      <aside className="gr-sida" aria-label="Gallringar">
        <div className="gr-sida-inre">
          <GallringLista lage={lage} ar={ar} valt={valt} onIgen={ladda} />
        </div>
      </aside>
      <main className="gr-innehall">{children}</main>
    </div>
  );
}
