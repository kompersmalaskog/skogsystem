'use client';
// Stammen i ett ark: vad den mäter och hur (en mening), avvikelsen längs stammen rot → topp, stockarna och var mätningen fastnade.
// Räknandet bor i lib/kalibrering/stam; här sätts bara byggstenarna ihop. Samma uppbyggnad som kontrollarket: svaret först, sedan raderna.
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import Flikkontroll from '@/components/design/Flikkontroll';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import { dec } from '@/lib/kalibrering/format';
import { findGreppSlapp } from '@/lib/kalibrering/grepp';
import { greppSammanfattning, klavePunkter, stamGeometri, stamStockRader, stamSvar } from '@/lib/kalibrering/stam';
import { stockText } from '@/lib/kalibrering/text';
import { Fyll, Meta, TonVarde } from './delar';
import StamAvvikelse from './StamAvvikelse';

export default function StamArk({ data, stamNummer, tolDia, onByt, onStock, onPlan }: {
  data: KontrollResponse; stamNummer: number; tolDia: number;
  onByt: (n: number) => void; onStock: (stockId: number) => void; onPlan: () => void;
}) {
  const stamStockar = data.stockar.filter(st => st.stam_nummer === stamNummer).sort((a, b) => a.stock_nummer - b.stock_nummer);
  if (stamStockar.length === 0) return null;

  const g = stamGeometri(stamStockar);
  const svar = stamSvar(g, tolDia);
  const rader = stamStockRader(stamStockar);
  const alleStammar = Array.from(new Set(data.stockar.map(st => st.stam_nummer))).sort((a, b) => a - b);

  // Ställena där greppet släppte räknas mot klaven (lib/kalibrering/grepp) och finns bara för kontrollstammar med tät profil och klavmått.
  // Utan dem vet vi inget och säger ingenting.
  const profil = data.stammar.find(st => st.stam_nummer === stamNummer)?.stem_diameter_profile ?? [];
  const klave = klavePunkter(g);
  const kanBedomas = profil.length > 1 && klave.length > 1;
  const stallen = findGreppSlapp(profil, klave);
  const greppRadText = greppSammanfattning(stallen, kanBedomas, g.totalCm);

  return (
    <>
      <Meta>{`Stam ${stamNummer} · ${dec(g.totalCm / 100, 1)} m · ${stockText(stamStockar.length)}`}</Meta>

      <Svarsrad rubrik={svar.rubrik} avvikelse={svar.ut > 0}
        rad={(
          <>
            {svar.tal && <div>{svar.tal}</div>}
            {greppRadText && <div style={{ marginTop: svar.tal ? AVSTAND.xs : 0 }}>{greppRadText}</div>}
          </>
        )} />

      <Sektion rubrik="Avvikelse längs stammen">
        <Fyll><StamAvvikelse g={g} tol={tolDia} stallen={stallen} /></Fyll>
      </Sektion>

      <Sektion rubrik="Stockar">
        {rader.map((r, i) => (
          <Rad key={r.id} sista={i === rader.length - 1} onTryck={() => onStock(r.id)} titel={r.titel} under={r.under}
            hoger={r.avvikText != null
              ? <TonVarde ton={r.ton}>{`${r.avvikText} mm`}</TonVarde>
              : <span style={{ ...TYP.meta, color: FARG.text2 }}>ej klavad</span>} />
        ))}
      </Sektion>

      {stallen.length > 0 && (
        <Sektion rubrik="Greppet">
          <Rad sista onTryck={onPlan} titel={`Där greppet släppte · ${stallen.length} ${stallen.length === 1 ? 'ställe' : 'ställen'}`} />
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
