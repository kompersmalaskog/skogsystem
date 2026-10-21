'use client';
// Kontrollen i ett ark: vad som mättes, vädret vid skörd, längd och diameter över stockarna (svärmen) och stocklistan.
// Strukturen är den gamla "Kontroll"-modalens, utan ändring i innehåll eller siffror; räknandet bor i lib/kalibrering/kontroll.
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { avvikelseTon, tolFranProfil } from '@/lib/kalibrering/bedomning';
import { dec, fmtAvvikelse, fmtKrav } from '@/lib/kalibrering/format';
import { kontrollSumma, stamValOchMatare, stockFordelning, stockRadVarde, swarmX, swarmY, vaderText } from '@/lib/kalibrering/kontroll';
import { MATT } from '@/lib/kalibrering/ordlista';
import { cap, kortDatum, stockText } from '@/lib/kalibrering/text';
import type { BedomningResp } from '@/lib/kalibrering/typer';
import { Meta, Prick, Status, TonVarde } from './delar';
import { Svarm, SvarmSkala, type SvarmPrick } from './diagram';

export default function KontrollArk({ data, bedomning, onStam }: { data: KontrollResponse; bedomning: BedomningResp | null; onStam: (stamNummer: number) => void }) {
  const k = data.kontroll;
  // Toleransband HÄMTAS ur maskinens kravprofil (inte hårdkodat 2/4) — annars driver band, skala och "utanför"-räkning isär.
  const tolDia = tolFranProfil(bedomning?.trosklar, 'diameter', 4);
  const tolLen = tolFranProfil(bedomning?.trosklar, 'langd', 2);
  const diaSnitt = k.dia_avvikelse_snitt_mm ?? 0;
  const dist = stockFordelning(data.stockar);
  const s = kontrollSumma(dist, tolDia, tolLen);
  const { selText, measurer } = stamValOchMatare(data.stockar);
  const w = k.weather_at_harvest;

  const lenPrickar: SvarmPrick[] = dist.filter(e => e.lenKl).map(e => ({
    id: e.id, x: swarmX(e.sLen, 2 * tolLen), y: swarmY(e), ton: avvikelseTon(e.sLen, 'len'), titel: `Stam ${e.stam_nummer}·${e.stock_nummer}: ${fmtAvvikelse(e.sLen, 'cm')} cm`,
  }));
  const diaPrickar: SvarmPrick[] = dist.filter(e => e.diaKl).map(e => ({
    id: e.id, x: swarmX(e.sDia, 2 * tolDia), y: swarmY(e), ton: avvikelseTon(e.sDia, 'dia'), titel: `Stam ${e.stam_nummer}·${e.stock_nummer}: ${fmtAvvikelse(e.sDia, 'mm')} mm`,
  }));
  const diaTon = s.diaKlavade.length === 0 ? 'ok' : avvikelseTon(diaSnitt, 'dia');

  return (
    <>
      <Meta>{`${kortDatum(k.datum)} · ${cap(k.tradslag ?? '')} · ${stockText(k.antal_kontrollstockar ?? data.stockar.length)}`}</Meta>
      {(selText || measurer) && <Meta style={{ marginTop: AVSTAND.s }}>{[selText, measurer].filter(Boolean).join(' · ')}</Meta>}

      {w && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: AVSTAND.l, margin: `${AVSTAND.l}px 0`, padding: `${AVSTAND.m}px ${AVSTAND.m}px`, background: FARG.tonad, borderRadius: RADIE.knapp, ...TYP.text, ...TNUM }}>
          {w.temperature_c != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Ikon namn="thermostat" storlek={IKON.text} />{Math.round(w.temperature_c)}°</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>
            <Ikon namn={(w.snowfall_cm ?? 0) > 0 ? 'weather_snowy' : 'water_drop'} storlek={IKON.text} />{vaderText(w)}
          </span>
          {w.wind_speed_ms != null && <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Ikon namn="air" storlek={IKON.text} />{dec(w.wind_speed_ms, 1)} m/s</span>}
        </div>
      )}

      <div style={{ marginTop: AVSTAND.l }}>
        <Sektion rubrik={`Längd · ${MATT.traffprocent.term}`} kort={false}>
          <div style={{ ...TYP.tal, color: FARG.text }}>{s.lenKlavade.length === 0 ? 'Ej klavad' : s.lenTraff != null ? `${s.lenTraff}%` : '–'}</div>
          <Svarm etikett="Stockfördelning längd" prickar={lenPrickar} />
          <SvarmSkala tol={tolLen} enhet="cm" fmt={fmtKrav} />
          <Status ton={s.lenStatusTone === 'bad' ? 'hot' : 'ok'} ord={s.lenLabel} ljus />
        </Sektion>

        <Sektion rubrik="Diameter" kort={false}>
          <div style={{ ...TYP.tal }}><TonVarde ton={diaTon}>{s.diaKlavade.length === 0 ? 'Ej klavad' : `${fmtAvvikelse(diaSnitt, 'mm')} mm`}</TonVarde></div>
          <Svarm etikett="Stockfördelning diameter" prickar={diaPrickar} snittX={s.diaKlavade.length > 0 ? swarmX(diaSnitt, 2 * tolDia) : null} snittTitel={`Snitt: ${fmtAvvikelse(diaSnitt, 'mm')} mm`} />
          <SvarmSkala tol={tolDia} enhet="mm" fmt={fmtKrav} />
          <Status ton={s.diaStatusTone === 'bad' ? 'hot' : 'ok'} ord={s.diaLabel} ljus />
        </Sektion>

        <Sektion rubrik={`Stockar · ${data.stockar.length} kontrollerade`} kort={false}>
          {data.stockar.map((st, i) => {
            const v = stockRadVarde(st);
            return (
              <Rad key={st.id} sista={i === data.stockar.length - 1} onTryck={() => onStam(st.stam_nummer)}
                titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>
                  {v.worstTon !== 'ok' && <Prick ton={v.worstTon} />}
                  <span style={{ color: FARG.text2, whiteSpace: 'nowrap', ...TNUM }}>{st.stam_nummer}·{st.stock_nummer}</span>
                  <span>{st.sortiment_namn ?? '–'}</span>
                </span>}
                under={`${st.maskin_langd_cm != null ? `${st.maskin_langd_cm} cm` : '–'} · ${st.maskin_toppdia_mm != null ? `⌀ ${st.maskin_toppdia_mm} mm` : '–'}`}
                hoger={v.lenKl ? `${fmtAvvikelse(v.sLen, 'cm')} cm` : 'ej klavad'}
                hogerUnder={v.diaKl ? `${fmtAvvikelse(v.sDia, 'mm')} mm` : 'ej klavad'} />
            );
          })}
        </Sektion>
      </div>
    </>
  );
}
