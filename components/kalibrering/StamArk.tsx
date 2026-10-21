'use client';
// Stammen i ett ark: vad den mäter och hur (en mening), diameterprofilen rot → topp, stockarna och var mätningen fastnade.
// Räknandet bor i lib/kalibrering/stam; här sätts bara byggstenarna ihop. Samma uppbyggnad som kontrollarket: svaret först, sedan raderna.
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import Flikkontroll from '@/components/design/Flikkontroll';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import { dec } from '@/lib/kalibrering/format';
import { findPlanomraden } from '@/lib/kalibrering/kontroll';
import { planSammanfattning, stamGeometri, stamStockRader, stamSvar } from '@/lib/kalibrering/stam';
import { stockText } from '@/lib/kalibrering/text';
import { Fyll, Meta, TonVarde } from './delar';
import StamProfil from './StamProfil';

export default function StamArk({ data, stamNummer, tolDia, onByt, onStock, onPlan }: {
  data: KontrollResponse; stamNummer: number; tolDia: number;
  onByt: (n: number) => void; onStock: (stockId: number) => void; onPlan: () => void;
}) {
  const stamStockar = data.stockar.filter(st => st.stam_nummer === stamNummer).sort((a, b) => a.stock_nummer - b.stock_nummer);
  if (stamStockar.length === 0) return null;

  const g = stamGeometri(stamStockar);
  const svar = stamSvar(g, tolDia);
  const rader = stamStockRader(stamStockar, tolDia);
  const alleStammar = Array.from(new Set(data.stockar.map(st => st.stam_nummer))).sort((a, b) => a - b);

  // Planområden finns bara för kontrollstammar med tät profil. Utan profil vet vi inget om dem och säger ingenting.
  const profil = data.stammar.find(st => st.stam_nummer === stamNummer)?.stem_diameter_profile ?? [];
  const harProfil = profil.length > 1;
  const planer = findPlanomraden(profil);
  const planRad = planSammanfattning(planer, harProfil, g.totalCm);

  return (
    <>
      <Meta>{`Stam ${stamNummer} · ${dec(g.totalCm / 100, 1)} m · ${stockText(stamStockar.length)}`}</Meta>

      <Svarsrad rubrik={svar.rubrik} avvikelse={svar.ut > 0}
        rad={(
          <>
            {svar.tal && <div>{svar.tal}</div>}
            {planRad && <div style={{ marginTop: svar.tal ? AVSTAND.xs : 0 }}>{planRad}</div>}
          </>
        )} />

      <Sektion rubrik="Diameter från rot till topp">
        <Fyll><StamProfil g={g} tol={tolDia} /></Fyll>
      </Sektion>

      <Sektion rubrik="Stockar">
        {rader.map((r, i) => (
          <Rad key={r.id} sista={i === rader.length - 1} onTryck={() => onStock(r.id)} titel={r.titel} under={r.under}
            hoger={r.avvikText != null
              ? <TonVarde ton={r.ton}>{`${r.avvikText} mm`}</TonVarde>
              : <span style={{ ...TYP.meta, color: FARG.text2 }}>ej klavad</span>} />
        ))}
      </Sektion>

      {planer.length > 0 && (
        <Sektion rubrik="Planområden">
          <Rad sista onTryck={onPlan} titel={`Där mätningen fastnade · ${planer.length} ${planer.length === 1 ? 'ställe' : 'ställen'}`} />
        </Sektion>
      )}

      {alleStammar.length > 1 && (
        <Sektion rubrik="Andra stammar" kort={false}>
          <div style={{ overflowX: 'auto' }}>
            <Flikkontroll flikar={alleStammar.map(n => [String(n), `Stam ${n}`] as const)} aktiv={String(stamNummer)} onVal={v => { if (Number(v) !== stamNummer) onByt(Number(v)); }} />
          </div>
        </Sektion>
      )}
    </>
  );
}
