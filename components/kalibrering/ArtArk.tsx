'use client';
// Ett trädslag: träffprocenten mot Vidas krav (diameter och längd, med stödtalen), snittavvikelsen (viktad per kontrollstock) och de senaste kontrollerna.
// De två första raderna är trädslagsraden ur gamla Rapport — stödtalen ("Går den rakt?", "Flaxar den?", n) bor här sedan Läget visar träffprocenten.
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND } from '@/lib/design/tokens';
import { avvikelseTon } from '@/lib/kalibrering/bedomning';
import { fmtAvvikelse } from '@/lib/kalibrering/format';
import { genitiv, tradslagStod } from '@/lib/kalibrering/laget';
import { AVVIKELSE } from '@/lib/kalibrering/ordlista';
import type { ArtSnitt } from '@/lib/kalibrering/rapport';
import { stockText } from '@/lib/kalibrering/text';
import type { FaktKalibrering, TradslagData, TradslagStat } from '@/lib/kalibrering/typer';
import { artNamn } from './arkTyper';
import { Info, Meta, TalGrid, TonVarde } from './delar';
import TraffText from './TraffText';

export default function ArtArk({ art, data, kontroller, tr, trData, onKontroll }: {
  art: string; data: ArtSnitt; kontroller: FaktKalibrering[]; tr: TradslagStat | null; trData: TradslagData | null; onKontroll: (filnamn: string) => void;
}) {
  const namn = artNamn(art);
  const senaste = kontroller.filter(k => k.tradslag.toLowerCase() === art).slice(0, 20);
  return (
    <>
      <Meta>{`${data.count} kontroller`}</Meta>

      {tr && trData && (
        <div style={{ marginTop: AVSTAND.l }}>
          <Sektion rubrik={`Mot ${genitiv(trData.profil)} krav`} kort={false}>
            <Rad titel="Diameter" under={tradslagStod(tr.diameter, 'diameter')} hoger={<TraffText stat={tr.diameter} variabel="diameter" trosklar={trData.trosklar} />} />
            <Rad sista titel="Längd" under={tradslagStod(tr.langd, 'langd')} hoger={<TraffText stat={tr.langd} variabel="langd" trosklar={trData.trosklar} />} />
          </Sektion>
        </div>
      )}

      <div style={{ marginTop: AVSTAND.l }}>
        <TalGrid rubrik={`Snitt för ${namn.toLowerCase()}`} celler={[
          { etikett: AVVIKELSE.langd, varde: fmtAvvikelse(data.lenDiff, 'cm'), enhet: 'cm', ton: avvikelseTon(data.lenDiff, 'len', data.count) },
          { etikett: AVVIKELSE.dia, varde: fmtAvvikelse(data.diaDiff, 'mm'), enhet: 'mm', ton: avvikelseTon(data.diaDiff, 'dia', data.count) },
        ]} />
      </div>

      <div style={{ marginTop: AVSTAND.l }}>
        <Sektion rubrik="Senaste kontroller" kort={false}>
          {senaste.map((k, i) => (
            <Rad key={k.id} sista={i === senaste.length - 1} onTryck={() => onKontroll(k.filnamn)}
              titel={new Date(k.datum).toLocaleDateString('sv-SE')}
              under={`${stockText(k.antal_kontrollstockar)} • ${k.status === 'VARNING' ? 'Varning' : 'Inom'}`}
              hoger={<TonVarde ton={avvikelseTon(k.dia_avvikelse_snitt_mm, 'dia')}>{`${fmtAvvikelse(k.dia_avvikelse_snitt_mm, 'mm')} mm`}</TonVarde>} />
          ))}
        </Sektion>
      </div>

      <Info ikon="bar_chart" titel="Tillräckligt underlag?">
        {data.count >= 5 ? `Ja, ${data.count} kontroller ger ett bra underlag.` : 'Fler kontroller behövs för att dra säkra slutsatser.'}
      </Info>
    </>
  );
}
