'use client';

// EN rad nertill när man ritar (samma mönster som planeringens bottenlist: ett läge i taget, EN rad, en uppsättning knappar).
//   Välj verktyg:  Punkt · Linje · Pil  ·  ×
//   Punkt:         "Tryck där punkten ska stå"  ·  ×
//   Linje/Pil:     "Linje · 3 punkter"  ·  ↩ ✓ ×      (✓ stor och vit: den enda handlingen som slutför)
// Raden ligger på samma ställe som Notera här / Lager och ersätter dem medan man ritar — kartan ovanför är fri att trycka på.

import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';
import {
  NOTERING_VERKTYG, VERKTYG_ETIKETT, kanAvslutaRitning, ritaRadText, type NoteringVerktyg,
} from '@/lib/egenkontrollNotering';

export default function RitaRad({
  verktyg,
  antalTryck,
  onVal,
  onAngra,
  onKlar,
  onAvbryt,
}: {
  /** null = man har inte valt verktyg an. */
  verktyg: NoteringVerktyg | null;
  antalTryck: number;
  onVal: (v: NoteringVerktyg) => void;
  onAngra: () => void;
  onKlar: () => void;
  onAvbryt: () => void;
}) {
  const ruta = { minHeight: TRAFFYTA.primar, minWidth: TRAFFYTA.primar, borderRadius: TRAFFYTA.primar / 2, border: 'none', cursor: 'pointer', fontFamily: 'inherit' } as const;
  const klarKlick = verktyg !== null && kanAvslutaRitning(verktyg, antalTryck);

  return (
    <div
      role="group"
      aria-label="Rita"
      data-testid="rita-rad"
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: AVSTAND.s, borderRadius: TRAFFYTA.primar, background: FARG.kort, pointerEvents: 'auto', flex: 1, minWidth: 0 }}
    >
      {verktyg === null ? (
        <>
          {NOTERING_VERKTYG.map((v) => (
            <button key={v} type="button" onClick={() => onVal(v)} style={{ ...KNAPP.sekundar, ...ruta, flex: 1, padding: `0 ${AVSTAND.s}px`, width: 'auto', ...TYP.listtitel }}>
              {VERKTYG_ETIKETT[v]}
            </button>
          ))}
        </>
      ) : (
        <>
          <span role="status" style={{ flex: 1, minWidth: 0, padding: `0 ${AVSTAND.s}px`, color: FARG.text, ...TYP.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ritaRadText(verktyg, antalTryck)}
          </span>
          {verktyg !== 'punkt' && (
            <>
              <button type="button" onClick={onAngra} disabled={antalTryck === 0} aria-label="Ångra senaste punkten" style={{ ...ruta, background: FARG.fyllning, color: FARG.text, opacity: antalTryck === 0 ? 0.4 : 1 }}>
                <Ikon namn="undo" farg="inherit" />
              </button>
              <button type="button" onClick={onKlar} disabled={!klarKlick} aria-label="Klar med linjen" style={{ ...ruta, background: FARG.text, color: FARG.bg, opacity: klarKlick ? 1 : 0.4 }}>
                <Ikon namn="check" farg="inherit" />
              </button>
            </>
          )}
        </>
      )}
      <button type="button" onClick={onAvbryt} aria-label="Avbryt ritandet" style={{ ...ruta, background: FARG.fyllning, color: FARG.text, borderRadius: RADIE.knapp }}>
        <Ikon namn="close" farg="inherit" />
      </button>
    </div>
  );
}
