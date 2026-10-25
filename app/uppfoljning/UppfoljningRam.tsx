'use client';
// Ramen kring uppföljningen — samma mönster som markägarrapporten (MarkagarRam)
// och objektöversikten (OversiktRam), men listan kommer ur en klient-hook.
//  - under 1100 px: oförändrat — EN sak per skärm (indexlistan på /uppfoljning,
//    objektet på /uppfoljning/<id>). Ingen sidokolumn, telefon/iPad stående rörs inte.
//  - från 1100 px och BARA på ett objekt: en kompakt lista som sidokolumn till
//    vänster, objektet till höger, som Mail. Indexsidan och underrutterna
//    (fordelning, hpr-import) får ALDRIG sidokolumn — de står som förut.
// Vad som syns styrs av CSS (ingen JS-mätning, inget hopp vid första rendering).
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AVSTAND, FARG, FONT, KOLUMN_CSS, LAYOUT, ROT_MIN_HOJD, designCss } from '@/lib/design/tokens';
import UppfoljningSidolista from './UppfoljningSidolista';

const FRAN_PX = 1100;
const BREDD_PX = 360;
const BAS = '/uppfoljning';
// Underrutter som INTE är objektdetaljer — de ska aldrig få sidokolumnen.
const EJ_OBJEKT = new Set(['', 'fordelning', 'hpr-import']);

const css = `
.uf-ram { display: flex; min-height: ${ROT_MIN_HOJD}; background: ${FARG.bg}; color: ${FARG.text}; }
.uf-innehall { flex: 1; min-width: 0; }
.uf-sida { display: none; }
@media (min-width: ${FRAN_PX}px) {
  .uf-detalj-vy .uf-sida {
    display: block; width: ${BREDD_PX}px; flex-shrink: 0; border-right: 1px solid ${FARG.linje};
    position: sticky; top: ${LAYOUT.topbar}; height: ${ROT_MIN_HOJD}; overflow-y: auto;
  }
  /* Objektet ligger tätt intill listan (som Mail), inte centrerat och svävande
     i den breda ytan. Övergrep på kolumnRots inline-marginaler (därav !important). */
  .uf-detalj-vy .uf-detalj-kolumn { margin-left: ${AVSTAND.xl}px !important; margin-right: auto !important; }
}
`;

export default function UppfoljningRam({ children }: { children: ReactNode }) {
  const sokvag = (usePathname() ?? BAS).replace(/\/$/, '');
  const forstaSeg = sokvag.startsWith(BAS) ? decodeURIComponent(sokvag.slice(BAS.length + 1).split('/')[0] ?? '') : '';
  const arObjekt = !EJ_OBJEKT.has(forstaSeg);
  const valt = arObjekt ? forstaSeg : null;

  return (
    // Typsnittet inline: FONT har citattecken, React escapar dem i en <style> vid SSR.
    <div className={`uf-ram ${arObjekt ? 'uf-detalj-vy' : 'uf-lista-vy'}`} style={{ fontFamily: FONT }} data-uppfoljning-ram="">
      <style>{designCss + KOLUMN_CSS + css}</style>
      {arObjekt && (
        <aside className="uf-sida" aria-label="Alla objekt">
          <UppfoljningSidolista valt={valt} />
        </aside>
      )}
      <main className="uf-innehall">{children}</main>
    </div>
  );
}
