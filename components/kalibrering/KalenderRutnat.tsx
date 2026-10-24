'use client';
// Kalenderrutnätet: en månad, varje produktionsdag med sin status (lämnad / saknas / varning). Ett tryck på en dag öppnar dagen. Flyttat ur gamla
// Kalender-fliken, oförändrat i innehåll; månaden hämtas av useKalibreringData när Kontroller öppnas.
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, KORT, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { idagStr, manadNamn } from '@/lib/kalibrering/datum';
import { aggregeraDagFiltrerat, dagstatusText, legendRader, tommaCeller } from '@/lib/kalibrering/kalender';
import type { CalDag, CalDagstatus } from '@/lib/kalibrering/typer';
import { Lugn, Status, TalGrid } from './delar';

const VECKODAGAR = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];
const tona = (farg: string) => `color-mix(in srgb, ${farg} 16%, transparent)`;
/** Cellens yta: grön = lämnad, röd = saknas, röd med ram = varning. Legenden under rutnätet säger det i ord. */
const YTA: Record<CalDagstatus, string> = { komplett: tona(FARG.gron), saknas: tona(FARG.rod), varning: tona(FARG.rod), inaktiv: 'transparent' };
const LEGEND_FARG: Record<string, string> = { komplett: FARG.gron, saknas: FARG.rod, varning: FARG.rod };

export default function KalenderRutnat({ d, onDag, valdDag }: { d: KalibreringData; onDag: (dag: CalDag) => void; valdDag?: string | null }) {
  const { calData, filteredSammanfattning: sf, effektiv } = d;
  if (!calData || !sf || !effektiv) return null;
  const idag = idagStr();
  const { leadingEmpty, trailingEmpty } = tommaCeller(calData);
  const legend = legendRader(calData, effektiv);
  return (
    <>
      <div style={{ marginBottom: AVSTAND.l }}>
        {sf.produktionsdagar === 0 ? (
          <Svarsrad rubrik="Inga kontroller den här månaden" rad="Bläddra ‹ › till en månad med produktion." fri />
        ) : (
          <>
            <Svarsrad rubrik={`${sf.kompletta} av ${sf.produktionsdagar} dagar kompletta`} rad={`i ${manadNamn(d.calManad).toLowerCase()}`} avvikelse={sf.saknas > 0 || sf.varningar > 0} />
            {sf.saknas === 0 && sf.varningar === 0 ? (
              // Allt grönt: två nollor är brus — en dämpad rad räcker. Talen kommer tillbaka först när ett är > 0.
              <Lugn ikon="check" marginTop={0}>Inga luckor</Lugn>
            ) : (
              <TalGrid celler={[
                { etikett: 'Saknas', varde: sf.saknas, ton: sf.saknas > 0 ? 'hot' : 'ok' },
                { etikett: 'Varningar', varde: sf.varningar, ton: sf.varningar > 0 ? 'hot' : 'ok' },
              ]} />
            )}
          </>
        )}
      </div>

      <div style={{ ...KORT }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: AVSTAND.xs, textAlign: 'center', marginBottom: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
          {VECKODAGAR.map((v, i) => <span key={i}>{v}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: AVSTAND.xs }}>
          {Array.from({ length: leadingEmpty }).map((_, i) => <div key={`l${i}`} />)}
          {calData.dagar.map(dag => {
            const status = aggregeraDagFiltrerat(dag, effektiv);
            const klickbar = status !== 'inaktiv';
            const dagNr = parseInt(dag.datum.slice(-2), 10);
            const vald = valdDag === dag.datum;
            return (
              <button key={dag.datum} type="button" disabled={!klickbar} onClick={() => onDag(dag)} aria-label={`${dagNr}, ${dagstatusText(status)}`} aria-pressed={vald}
                style={{
                  aspectRatio: '1', minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit',
                  background: YTA[status], borderRadius: RADIE.knapp, cursor: klickbar ? 'pointer' : 'default',
                  border: status === 'varning' ? `2px solid ${FARG.rod}` : 'none',
                  boxShadow: vald ? `inset 0 0 0 2px ${FARG.bla}` : dag.datum === idag ? `inset 0 0 0 2px ${FARG.text}` : 'none',
                  color: status === 'inaktiv' ? FARG.text2 : FARG.text, ...TYP.text, ...TNUM,
                }}>
                {dagNr}
              </button>
            );
          })}
          {Array.from({ length: trailingEmpty }).map((_, i) => <div key={`t${i}`} />)}
        </div>
        {legend.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.l, marginTop: AVSTAND.l }}>
            {legend.map(r => <Status key={r.st} farg={LEGEND_FARG[r.st]} ord={r.text} />)}
          </div>
        )}
      </div>
    </>
  );
}

export function KalenderSkelett() {
  return (
    <>
      <div style={{ ...KORT, marginBottom: AVSTAND.xl, minHeight: TRAFFYTA.primar * 2 }} />
      <div style={{ ...KORT }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: AVSTAND.xs }}>
          {Array.from({ length: 35 }).map((_, i) => <div key={i} style={{ aspectRatio: '1', minHeight: TRAFFYTA.min, background: FARG.tonad, borderRadius: RADIE.knapp }} />)}
        </div>
      </div>
    </>
  );
}
