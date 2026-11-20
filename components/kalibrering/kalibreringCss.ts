// CSS som vyn behöver men som inte går att skriva inline: rutnät som byter kolumner efter BREDD (container-lösa media queries), och master-detail-ramen
// för Kontroller och Objekt. Selektorerna är utan citattecken (React escapar citattecken i <style> vid serverrendering).
import { AVSTAND } from '@/lib/design/tokens';

/** Från den här bredden står listan till vänster och detaljen till höger (iPad stående 820 och uppåt). Under: en sak per skärm, detaljen som blad. */
export const MASTER_DETAIL_FRAN_PX = 760;
/** Från den här bredden ligger Över tids diagram och tal sida vid sida. */
export const RUTNAT_FRAN_PX = 900;
const LISTA_BREDD_PX = 360;

export const kalibreringCss = `
.kal-rutnat { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: ${AVSTAND.xl}px; align-items: start; }
@media (min-width: ${RUTNAT_FRAN_PX}px) {
  .kal-rutnat { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); }
}
.kal-md { display: block; }
.kal-md-lista { min-width: 0; }
.kal-md-detalj { display: none; }
@media (min-width: ${MASTER_DETAIL_FRAN_PX}px) {
  .kal-md { display: grid; grid-template-columns: ${LISTA_BREDD_PX}px minmax(0, 1fr); column-gap: ${AVSTAND.xl}px; align-items: start; }
  .kal-md-detalj { display: block; min-width: 0; }
}
`;
