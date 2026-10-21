'use client';
// Där mätningen fastnade: planområdena på en stam som rader — läge på stammen, vilken stock, längd och diameter. Tabellen som förut låg
// öppen i stamvyn ligger här, ett steg bakom; ordningen är rot → topp. Räknandet (findPlanomraden) bor i lib/kalibrering/kontroll.
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND } from '@/lib/design/tokens';
import { dec } from '@/lib/kalibrering/format';
import { findPlanomraden } from '@/lib/kalibrering/kontroll';
import { planStockText, stamGeometri } from '@/lib/kalibrering/stam';
import { Meta } from './delar';

export default function PlanArk({ data, stamNummer }: { data: KontrollResponse; stamNummer: number }) {
  const stamStockar = data.stockar.filter(st => st.stam_nummer === stamNummer);
  const g = stamGeometri(stamStockar);
  const planer = findPlanomraden(data.stammar.find(st => st.stam_nummer === stamNummer)?.stem_diameter_profile ?? []);
  return (
    <>
      <Meta style={{ marginBottom: AVSTAND.l }}>Här tappade mätorganen kontakt och diametern fastnade.</Meta>
      <Sektion rubrik={`${planer.length} ${planer.length === 1 ? 'ställe' : 'ställen'}, rot → topp`}>
        {planer.map((p, i) => (
          <Rad key={i} sista={i === planer.length - 1}
            titel={`${dec(p.startCm / 100, 1)} – ${dec(p.endCm / 100, 1)} m`}
            under={planStockText(p, g)}
            hoger={`${p.lengthCm} cm`} hogerUnder={`⌀ ${p.diameterMm} mm`} />
        ))}
      </Sektion>
    </>
  );
}
