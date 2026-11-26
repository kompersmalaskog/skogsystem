'use client';

// En rad per väg i objektinfon (ⓘ): "Väg 538 · låg risk ✓" / "Väg 538 · ej riskbedömd" / "Väg 538 · hög risk". Tryck öppnar riskbedömningen för vägen.
// Det är HÄR låg risk bor — på kartan syns bara ⚠ för det som är ej bedömt eller hög risk (lib/vagRisk). Färgen förstärker bara ordet: orange = ej bedömd, grön = låg, röd = hög.
// Ingen rad alls när trakten inte har någon väg nära traktgränsen.

import React from 'react';
import { AVSTAND } from '@/lib/design/tokens';
import type { VagRad } from '@/lib/vagRisk';
import { Gruppkort, RadKnapp } from './infoDelar';

export interface VagRiskProps {
  rader: VagRad[];
  /** Öppnar riskbedömningen för vägens ägare (panelen på kartan). */
  onOppna: (agare: string) => void;
}

export default function VagRiskRader({ vagar, luftUnder = AVSTAND.m }: { vagar: VagRiskProps | null | undefined; luftUnder?: number }) {
  if (!vagar || vagar.rader.length === 0) return null;
  return (
    <div data-testid="vag-risk-rader" style={{ marginBottom: luftUnder }}>
      <Gruppkort>
        {vagar.rader.map((r, i) => (
          <RadKnapp key={r.nyckel} forstaRad={i === 0} testid="vag-risk-rad" ikon="route" onTryck={() => vagar.onOppna(r.agare)}
            etikett={<span data-risk={r.risk}>{r.rubrik} · <span data-testid="vag-risk-status" style={{ color: r.farg }}>{r.status}</span></span>} />
        ))}
      </Gruppkort>
    </div>
  );
}
