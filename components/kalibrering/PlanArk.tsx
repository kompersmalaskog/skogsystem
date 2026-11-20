'use client';
// Där greppet släppte: en rad per ställe på stammen, rot → topp — var på stammen och hur mycket fel det gav ("2,5–2,8 m · stock 1 · +5 mm").
// Längden på sträckan står bara när den är längre än den minsta som räknas. Räknandet (findGreppSlapp) bor i lib/kalibrering/grepp.
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import { findGreppSlapp } from '@/lib/kalibrering/grepp';
import { greppRad, klavePunkter, stamGeometri } from '@/lib/kalibrering/stam';
import { Meta, TonVarde } from './delar';

export default function PlanArk({ data, stamNummer }: { data: KontrollResponse; stamNummer: number }) {
  const g = stamGeometri(data.stockar.filter(st => st.stam_nummer === stamNummer));
  const stallen = findGreppSlapp(data.stammar.find(st => st.stam_nummer === stamNummer)?.stem_diameter_profile ?? [], klavePunkter(g));
  return (
    <>
      <Meta style={{ marginBottom: AVSTAND.l }}>Här stod maskinens mått still. Felet är maskinens mått minus klavens vid slutet av stället.</Meta>
      <Sektion rubrik={`${stallen.length} ${stallen.length === 1 ? 'ställe' : 'ställen'}, rot → topp`}>
        {stallen.map((p, i) => {
          const r = greppRad(p, g);
          return (
            <Rad key={i} sista={i === stallen.length - 1} titel={r.titel} under={r.langd ?? undefined}
              hoger={r.fel != null
                ? <TonVarde ton={r.ton}>{r.fel}</TonVarde>
                : <span style={{ ...TYP.meta, color: FARG.text2 }}>ej klavad</span>} />
          );
        })}
      </Sektion>
    </>
  );
}
