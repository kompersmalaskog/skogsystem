'use client';
// RUTNÄT ÖVER TID — rader (grovlek eller trädslag) × perioder (månad, kvartal eller år). Per grovlek och Greppet ritas med samma rutnät, så de läses likadant.
//
// En ruta är ett stort tal och ett litet under. Färgen förstärker bara talet: grön/orange/röd (bedömning mot kravet eller förändring), grå = för få stammar
// ("–"). Förklaringen med ord och gränser står alltid under rutnätet (Teckenforklaring) — färg bär aldrig ensam. Första kolumnen (radens namn) ligger kvar när
// man rullar i sidled, och rullningen börjar vid den senaste perioden: det är den man vill se först.
import { useEffect, useRef, type ReactNode } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { RutaTon } from '@/lib/kalibrering/rutnat';
import { Status } from './delar';

export type RutCell = {
  /** Det stora talet: "71 %". "–" för en ruta med för få stammar. */
  huvud: string;
  /** Det lilla under: "+3,1 mm", "+5 pp". */
  liten?: string | null;
  ton: RutaTon;
  /** Vad rutan säger i ord (för skärmläsare och titel). */
  beskrivning: string;
  onTryck?: () => void;
};
export type RutRad = { id: string; etikett: string; sub?: string | null; celler: (RutCell | null)[]; /** en rad som skiljs från de ovan (300+ i Greppet) */ skild?: boolean };

const RAD_BREDD = TRAFFYTA.min + AVSTAND.xl; // radens namn (76 px): "250–299" och "Övrigt löv" ryms på en rad
const RUTA_BREDD = TRAFFYTA.min + AVSTAND.xl; // minsta bredd per period (76 px) — tre perioder ryms på en telefon
const RUTA_HOJD = TRAFFYTA.min + AVSTAND.m;   // 56 px: två rader text, och över träffytan

const tonYta = (ton: RutaTon): string =>
  ton === 'gron' ? `color-mix(in srgb, ${FARG.gron} 24%, transparent)`
    : ton === 'orange' ? `color-mix(in srgb, ${FARG.orange} 26%, transparent)`
    : ton === 'rod' ? `color-mix(in srgb, ${FARG.rod} 30%, transparent)`
    : ton === 'tunn' ? FARG.upphojt
    : FARG.tonad;

export default function Rutnat({ perioder, rader, etiketter, horn }: { perioder: string[]; rader: RutRad[]; /** periodernas rubriker, i samma ordning som `perioder` */ etiketter: string[]; /** liten text i hörnet över radnamnen (enheten, t.ex. "mm") */ horn?: string }) {
  const rull = useRef<HTMLDivElement>(null);
  // Rullningen börjar längst till höger (senaste perioden), och går dit igen när perioderna byts (steg, trädslag, maskin).
  const nyckel = perioder.join('|');
  useEffect(() => { const e = rull.current; if (e) e.scrollLeft = e.scrollWidth; }, [nyckel]);

  return (
    <div ref={rull} data-rutnat style={{ overflowX: 'auto' }}>
      <div role="table" style={{ display: 'grid', gridTemplateColumns: `${RAD_BREDD}px repeat(${perioder.length}, minmax(${RUTA_BREDD}px, 1fr))`, columnGap: AVSTAND.xs, rowGap: AVSTAND.xs, minWidth: 'min-content' }}>
        <div role="row" style={{ display: 'contents' }}>
          <div style={{ position: 'sticky', left: 0, zIndex: 1, background: FARG.kort, ...TYP.meta, color: FARG.text3, paddingBottom: AVSTAND.xs }}>{horn}</div>
          {etiketter.map((e, i) => (
            <div key={perioder[i]} role="columnheader" style={{ ...TYP.meta, ...TNUM, color: FARG.text2, textAlign: 'center', paddingBottom: AVSTAND.xs }}>{e}</div>
          ))}
        </div>
        {rader.map(rad => (
          <div key={rad.id} role="row" style={{ display: 'contents' }}>
            <div role="rowheader" style={{ position: 'sticky', left: 0, zIndex: 1, background: FARG.kort, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: RUTA_HOJD, marginTop: rad.skild ? AVSTAND.m : 0, paddingRight: AVSTAND.xs }}>
              <span style={{ ...TYP.meta, ...TNUM, color: FARG.text }}>{rad.etikett}</span>
              {rad.sub && <span style={{ ...TYP.micro, textTransform: 'none', color: FARG.text3 }}>{rad.sub}</span>}
            </div>
            {rad.celler.map((c, i) => <Ruta key={perioder[i]} c={c} skild={rad.skild} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Ruta({ c, skild }: { c: RutCell | null; skild?: boolean }) {
  const stil = { minHeight: RUTA_HOJD, borderRadius: RADIE.rad, marginTop: skild ? AVSTAND.m : 0 } as const;
  if (!c) return <div role="cell" aria-label="Inget underlag" style={{ ...stil, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FARG.text3, ...TYP.meta }}>·</div>;
  const inre = (
    <>
      <span style={{ ...TYP.listtitel, ...TNUM, color: c.ton === 'tunn' ? FARG.text3 : FARG.text }}>{c.huvud}</span>
      {c.liten && <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{c.liten}</span>}
    </>
  );
  const grund = { ...stil, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: tonYta(c.ton), border: 'none', padding: `${AVSTAND.xs}px ${AVSTAND.xs}px`, font: 'inherit' } as const;
  return c.onTryck ? (
    <button type="button" role="cell" data-ton={c.ton} aria-label={c.beskrivning} title={c.beskrivning} onClick={c.onTryck} style={{ ...grund, color: FARG.text, cursor: 'pointer' }}>{inre}</button>
  ) : (
    <div role="cell" data-ton={c.ton} aria-label={c.beskrivning} title={c.beskrivning} style={grund}>{inre}</div>
  );
}

/** Förklaringen under ett rutnät: varje färg med sitt ord och sin gräns. */
export function Teckenforklaring({ poster }: { poster: { farg: string; ord: ReactNode }[] }) {
  return (
    <div data-teckenforklaring style={{ display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.xs}px ${AVSTAND.l}px`, marginTop: AVSTAND.m }}>
      {poster.map((p, i) => <Status key={i} farg={p.farg} ord={p.ord} />)}
    </div>
  );
}
