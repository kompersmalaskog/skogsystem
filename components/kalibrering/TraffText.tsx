'use client';
// En träffprocent i ett trädslag: huvudtalet med prick vid avvikelse (bedömt mot profilen, grind 30 mått). Under 30 mått: "för tunt underlag".
import { PROFIL_TON, trCellBedom } from '@/lib/kalibrering/bedomning';
import type { VariabelStat } from '@/lib/kalibrering/statistik';
import type { KravRow } from '@/lib/kalibrering/typer';
import { FARG } from '@/lib/design/tokens';
import { TonVarde } from './delar';

export default function TraffText({ stat, variabel, trosklar }: { stat: VariabelStat; variabel: 'diameter' | 'langd'; trosklar: KravRow[] }) {
  const b = trCellBedom(stat, variabel, trosklar);
  if (b.tunt) return <span style={{ color: FARG.text2 }}>för tunt underlag</span>;
  return <TonVarde ton={PROFIL_TON[b.status]} dampadOk>{stat.traffPct != null ? `${Math.round(stat.traffPct)} %` : '–'}</TonVarde>;
}
