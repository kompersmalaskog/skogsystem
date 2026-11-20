'use client';
// Bottenmeny: fyra (eller fler) flikar längst ner, som i Arbetsrapport men på tokens. EN komponent för vyer som har lika tunga delar — inte för
// "samma data, olika vinkel" (det är Flikkontroll). Aktiv flik är blå (blått betyder "navigerar") med fylld ikon; övriga dämpade.
//
// Raden ligger fast nederst, suddar bakgrunden bakom sig och har hemindikatorns zon i sin nedre padding (medSafeBotten). Innehållet i vyn ska ha
// `bottenmenyPadding()` som nedre padding, annars hamnar sista raden bakom menyn. Menyns innehåll bor i kolumnen (`KOLUMN.smal`), inte kant till kant.
import Ikon from './Ikon';
import { AVSTAND, FARG, IKON, KOLUMN, TRAFFYTA, TYP, VIKT, medSafeBotten } from '@/lib/design/tokens';

export type BottenmenyPost<T extends string> = { id: T; etikett: string; ikon: string };

/** Menyns höjd utan hemindikatorn: knappens träffyta + luften över den. */
export const BOTTENMENY_HOJD_PX = TRAFFYTA.primar + AVSTAND.m;

/** Nedre padding för innehållet ovanför menyn: menyns höjd + hemindikatorn + luft. */
export function bottenmenyPadding(luftPx: number = AVSTAND.xl): string {
  return `calc(${BOTTENMENY_HOJD_PX + luftPx}px + env(safe-area-inset-bottom))`;
}

export default function Bottenmeny<T extends string>({ poster, aktiv, onVal, etikett = 'Flikar' }: {
  poster: readonly BottenmenyPost<T>[]; aktiv: T; onVal: (id: T) => void; etikett?: string;
}) {
  return (
    <nav aria-label={etikett}
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        padding: `${AVSTAND.s}px ${AVSTAND.sidmarginal}px ${medSafeBotten(AVSTAND.s)}`, boxSizing: 'border-box',
        background: `color-mix(in srgb, ${FARG.kort} 80%, transparent)`, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${FARG.linje}`,
      }}>
      <div role="tablist" style={{ display: 'flex', maxWidth: KOLUMN.smal, margin: '0 auto' }}>
        {poster.map(p => {
          const vald = p.id === aktiv;
          return (
            <button key={p.id} type="button" role="tab" aria-selected={vald} aria-current={vald ? 'page' : undefined} onClick={() => onVal(p.id)}
              style={{
                flex: 1, minWidth: 0, minHeight: TRAFFYTA.primar, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.xs,
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                color: vald ? FARG.bla : FARG.text2, ...TYP.meta, fontWeight: vald ? VIKT.halvfet : VIKT.normal,
              }}>
              <Ikon namn={p.ikon} storlek={IKON.rad} farg="inherit" fylld={vald} />
              <span style={{ whiteSpace: 'nowrap' }}>{p.etikett}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
