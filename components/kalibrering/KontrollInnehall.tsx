'use client';
// KONTROLLEN — innehållet i bladet. Två lägen i samma vy, som Apple Kartor:
//   HALVT:  dag och klockslag överst, sedan raderna Förare, Stammen (slumpstam/förvald), Väder, Vind, Trädslag; svaret i klartext som rubrik ("Diametern mäter för grovt");
//           längd och diameter mätta på SAMMA sätt ("5 av 5 rätt", snittet dämpat bredvid); en rad om att en stam säger lite.
//   HELT:   (dra uppåt) stockarna rot → topp, en grupp per stam. Varje rad har sortiment och längd i klartext och BÅDA avvikelserna med etikett
//           ("längd −2 cm · dia +10 mm"); stammen och stocken öppnas i samma blad.
// Räknandet bor i lib/kalibrering/kontrollSvar (talen är de gamla: stockFordelning, kontrollSumma, stockRadVarde).
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import { avvikelseTon, tolFranProfil } from '@/lib/kalibrering/bedomning';
import { fmtAvvikelse, fmtKrav } from '@/lib/kalibrering/format';
import { kontrollSumma, stockFordelning, swarmX, swarmY } from '@/lib/kalibrering/kontroll';
import { kontrollHuvud, kontrollStammar, kontrollSvar, type MattRad } from '@/lib/kalibrering/kontrollSvar';
import type { BedomningResp } from '@/lib/kalibrering/typer';
import { Meta, Prick, TonVarde } from './delar';
import { Svarm, SvarmSkala, type SvarmPrick } from './diagram';

function Matt({ m, tol, enhet, sista }: { m: MattRad; tol: number; enhet: 'cm' | 'mm'; sista?: boolean }) {
  return (
    <Rad sista={sista} titel={m.rubrik} under={m.n > 0 ? `inom ±${fmtKrav(tol)} ${enhet}` : undefined} pil={false}
      hoger={<TonVarde ton={m.ton}>{m.ratt}</TonVarde>}
      hogerUnder={m.snitt ?? undefined} />
  );
}

export default function KontrollInnehall({ data, bedomning, halv, onVisaStockar, onStam, onStock }: {
  data: KontrollResponse; bedomning: BedomningResp | null;
  /** Bladet står i halvt läge: stockarna ligger under kanten, och en rad visar vägen dit. */
  halv: boolean; onVisaStockar: () => void;
  onStam: (stamNummer: number) => void; onStock: (stockId: number) => void;
}) {
  // Toleransband HÄMTAS ur maskinens kravprofil (inte hårdkodat 2/4) — annars driver band, skala och "utanför"-räkning isär.
  const tolDia = tolFranProfil(bedomning?.trosklar, 'diameter', 4);
  const tolLen = tolFranProfil(bedomning?.trosklar, 'langd', 2);
  const huvud = kontrollHuvud(data);
  const svar = kontrollSvar(data, tolDia, tolLen, bedomning?.fonster?.dagar ?? null);
  const grupper = kontrollStammar(data.stockar);
  const dist = stockFordelning(data.stockar);
  const s = kontrollSumma(dist, tolDia, tolLen);
  const diaSnitt = data.kontroll.dia_avvikelse_snitt_mm ?? 0;

  const lenPrickar: SvarmPrick[] = dist.filter(e => e.lenKl).map(e => ({
    id: e.id, x: swarmX(e.sLen, 2 * tolLen), y: swarmY(e), ton: avvikelseTon(e.sLen, 'len'), titel: `Stam ${e.stam_nummer}·${e.stock_nummer}: ${fmtAvvikelse(e.sLen, 'cm')} cm`,
  }));
  const diaPrickar: SvarmPrick[] = dist.filter(e => e.diaKl).map(e => ({
    id: e.id, x: swarmX(e.sDia, 2 * tolDia), y: swarmY(e), ton: avvikelseTon(e.sDia, 'dia'), titel: `Stam ${e.stam_nummer}·${e.stock_nummer}: ${fmtAvvikelse(e.sDia, 'mm')} mm`,
  }));

  return (
    <>
      {/* Överst: när — sedan vem, hur stammen valdes, vädret och vad, som rader etikett/värde (som Inställningar i iOS) */}
      <div data-kontroll-huvud="">
        <div style={{ ...TYP.listtitel, color: FARG.text, ...TNUM }}>{huvud.dagTid}</div>
        <div style={{ marginTop: AVSTAND.m }}>
          <Sektion rubrik="Om kontrollen">
            {huvud.fakta.map((f, i) => (
              <Rad key={f.etikett} sista={i === huvud.fakta.length - 1} pil={false} titel={f.etikett} attr={{ 'data-fakta': f.etikett }}
                hoger={<span style={{ color: f.saknas ? FARG.text3 : FARG.text, ...TNUM }}>{f.varde}</span>} />
            ))}
          </Sektion>
        </div>
      </div>

      {/* Svaret i klartext */}
      <div style={{ marginTop: AVSTAND.l }}>
        <Svarsrad rubrik={svar.rubrik} avvikelse={svar.avvikelse} />
      </div>

      {/* Längd och diameter mätta på samma sätt */}
      <Sektion rubrik="Stockarna mot klaven" not={svar.fotnot}>
        <Matt m={svar.langd} tol={tolLen} enhet="cm" />
        <Matt m={svar.diameter} tol={tolDia} enhet="mm" sista />
      </Sektion>

      {halv && (
        <Sektion rubrik="Stockarna" kort={false}>
          <Rad sista titel={`Visa stockarna · ${data.stockar.length}`} onTryck={onVisaStockar} />
        </Sektion>
      )}

      {/* Helt läge: stockarna rot → topp */}
      {!halv && grupper.map(g => (
        <Sektion key={g.stamNummer} rubrik={g.rubrik} onRubrikTryck={() => onStam(g.stamNummer)} hoger="Visa stammen">
          {g.rader.map((r, i) => (
            <Rad key={r.id} sista={i === g.rader.length - 1} onTryck={() => onStock(r.id)}
              titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>{r.ton !== 'ok' && <Prick ton={r.ton} />}<span>{r.titel}</span></span>}
              under={r.under} />
          ))}
        </Sektion>
      ))}

      {!halv && (
        <Sektion rubrik="Fördelning" kort={false}>
          <Meta>Längd</Meta>
          <Svarm etikett="Stockfördelning längd" prickar={lenPrickar} />
          <SvarmSkala tol={tolLen} enhet="cm" fmt={fmtKrav} />
          <Meta>Diameter</Meta>
          <Svarm etikett="Stockfördelning diameter" prickar={diaPrickar} snittX={s.diaKlavade.length > 0 ? swarmX(diaSnitt, 2 * tolDia) : null} snittTitel={`Snitt: ${fmtAvvikelse(diaSnitt, 'mm')} mm`} />
          <SvarmSkala tol={tolDia} enhet="mm" fmt={fmtKrav} />
        </Sektion>
      )}
    </>
  );
}
