'use client';
// Ramen kring faktureringsvyn: listan och trakten. Samma mönster som MarkagarRam och GallringRam.
//  - under 1100 px: EN sak per skärm — listan på /ekonomi/fakturaunderlag, trakten på /…/<vo>;
//  - från 1100 px (iPad liggande, dator): listan som sidokolumn till vänster och trakten till höger, som Mail.
// Vad som syns avgörs av CSS (ingen mätning i JS, inget hopp vid första renderingen).
//
// SKILLNADEN MOT MARKÄGARVYN: ekonomisektionen har en FAST bottenrad (EkonomiBottomNav).
// Sidokolumnens höjd drar av den (EKONOMI_BOTTENRAD) — annars hamnar listans sista rader
// under flikraden, och det är felet från PR #540 om igen.
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  AVSTAND, EKONOMI_BOTTENRAD, FARG, FONT, KOLUMN, KOLUMN_CSS, LAYOUT, RADIE, ROT_MIN_HOJD, designCss,
} from '@/lib/design/tokens';

/** Från denna bredd står listan bredvid trakten. */
export const SIDOKOLUMN_FRAN_PX = 1100;
const SIDOKOLUMN_BREDD_PX = 360;
const BAS = '/ekonomi/fakturaunderlag';

/** Exporterad så att mätningen kan köra EXAKT den CSS vyn använder. */
export const FAKTURA_CSS = `
.fa-ram { display: flex; min-height: ${ROT_MIN_HOJD}; background: ${FARG.bg}; color: ${FARG.text}; }
.fa-sida { width: 100%; box-sizing: border-box; padding: ${AVSTAND.l}px ${AVSTAND.sidmarginal}px calc(${EKONOMI_BOTTENRAD} + ${AVSTAND.xl}px); }
.fa-sida-inre { max-width: ${KOLUMN.smal}px; margin: 0 auto; }
/* Trakten är en CONTAINER: maskinkorten räknar på TRAKTENS egen bredd, inte
   fönstrets — annars blir de fel när sidokolumnen tar 360 px av skärmen. */
.fa-innehall { flex: 1; min-width: 0; container-type: inline-size; }
.fa-trakt { padding: ${AVSTAND.l}px ${AVSTAND.sidmarginal}px calc(${EKONOMI_BOTTENRAD} + ${AVSTAND.xl}px); max-width: ${KOLUMN.bred}px; margin: 0 auto; box-sizing: border-box; }
.fa-maskiner { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${AVSTAND.l}px; margin-bottom: ${AVSTAND.xl}px; }
@container (min-width: ${KOLUMN.smal}px) { .fa-maskiner { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: ${SIDOKOLUMN_FRAN_PX - 1}px) {
  .fa-lista-vy .fa-innehall { display: none; }
  .fa-trakt-vy .fa-sida { display: none; }
  .fa-bara-bred { display: none !important; }
}
.fa-sida [data-vald] { background: ${FARG.upphojt}; border-radius: ${RADIE.rad}px; }
@media (min-width: ${SIDOKOLUMN_FRAN_PX}px) {
  .fa-sida {
    width: ${SIDOKOLUMN_BREDD_PX}px; flex-shrink: 0; border-right: 1px solid ${FARG.linje};
    position: sticky; top: ${LAYOUT.topbar};
    height: calc(${ROT_MIN_HOJD} - ${EKONOMI_BOTTENRAD}); overflow-y: auto;
  }
  .fa-sida-inre { max-width: none; }
  .fa-bara-smal { display: none !important; }
}
`;

export default function FakturaRam({ lista, children }: { lista: ReactNode; children: ReactNode }) {
  const sokvag = usePathname() ?? BAS;
  const arLista = sokvag.replace(/\/$/, '') === BAS;
  return (
    // Typsnittet sätts inline: FONT har citattecken, och React escapar dem i en <style> vid serverrendering.
    <div className={`fa-ram ${arLista ? 'fa-lista-vy' : 'fa-trakt-vy'}`} style={{ fontFamily: FONT }} data-faktura-ram="">
      <style>{designCss + KOLUMN_CSS + FAKTURA_CSS}</style>
      <aside className="fa-sida" aria-label="Alla underlag">
        <div className="fa-sida-inre">{lista}</div>
      </aside>
      <main className="fa-innehall">{children}</main>
    </div>
  );
}
