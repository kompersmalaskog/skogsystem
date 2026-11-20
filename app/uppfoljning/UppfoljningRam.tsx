'use client';
// Ramen kring uppföljningen — samma master-detail som markägarrapporten (MarkagarRam):
//  - under 1100 px: EN sak per skärm — menyn på /uppfoljning, objektet på /uppfoljning/<id>;
//  - från 1100 px (iPad liggande, dator): menyn som sidokolumn till vänster och objektet
//    (eller "välj ett objekt" innan man valt) till höger, som Mail.
// Menyn renderas EN gång (i aside), så den fyller skärmen i stället för att sväva
// som en smal kolumn i ett hav av svart. Vad som syns styrs av CSS (ingen mätning
// i JS, inget hopp vid första rendering).
// Underrutter som har sin EGEN layout (fordelning, hpr-import) får ingen aside —
// de står i full bredd som förut.
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AVSTAND, FARG, FONT, KOLUMN, KOLUMN_CSS, LAYOUT, ROT_MIN_HOJD, designCss } from '@/lib/design/tokens';
import UppfoljningMeny from './UppfoljningMeny';

const FRAN_PX = 1100;
const BREDD_PX = 360;
const BAS = '/uppfoljning';
// Egna helsides-vyer — aldrig master-detail.
const EGEN_VY = new Set(['fordelning', 'hpr-import']);

const css = `
.uf-ram { display: flex; min-height: ${ROT_MIN_HOJD}; background: ${FARG.bg}; color: ${FARG.text}; }
.uf-sida { width: 100%; box-sizing: border-box; padding: ${AVSTAND.l}px 0 ${AVSTAND.xxl}px; }
.uf-sida-inre { max-width: ${KOLUMN.smal}px; margin: 0 auto; }
.uf-innehall { flex: 1; min-width: 0; }
@media (max-width: ${FRAN_PX - 1}px) {
  .uf-index-vy .uf-innehall { display: none; }
  .uf-objekt-vy .uf-sida { display: none; }
}
@media (min-width: ${FRAN_PX}px) {
  .uf-sida {
    width: ${BREDD_PX}px; flex-shrink: 0; border-right: 1px solid ${FARG.linje};
    position: sticky; top: ${LAYOUT.topbar}; height: ${ROT_MIN_HOJD}; overflow-y: auto;
  }
  .uf-sida-inre { max-width: none; }
}
`;

export default function UppfoljningRam({ children }: { children: ReactNode }) {
  const sokvag = (usePathname() ?? BAS).replace(/\/$/, '');
  const forstaSeg = sokvag.startsWith(BAS) ? decodeURIComponent(sokvag.slice(BAS.length + 1).split('/')[0] ?? '') : '';

  // Egen helsides-vy (fordelning/hpr-import): ingen aside, full bredd.
  if (EGEN_VY.has(forstaSeg)) {
    return (
      <div style={{ fontFamily: FONT, background: FARG.bg, color: FARG.text, minHeight: ROT_MIN_HOJD }} data-uppfoljning-ram="">
        <style>{designCss + KOLUMN_CSS}</style>
        {children}
      </div>
    );
  }

  const arObjekt = forstaSeg !== '';
  const valt = arObjekt ? forstaSeg : null;

  return (
    // Typsnittet inline: FONT har citattecken, React escapar dem i en <style> vid SSR.
    <div className={`uf-ram ${arObjekt ? 'uf-objekt-vy' : 'uf-index-vy'}`} style={{ fontFamily: FONT }} data-uppfoljning-ram="">
      <style>{designCss + KOLUMN_CSS + css}</style>
      <aside className="uf-sida" aria-label="Alla objekt">
        <div className="uf-sida-inre">
          <UppfoljningMeny valt={valt} />
        </div>
      </aside>
      <main className="uf-innehall">{children}</main>
    </div>
  );
}
