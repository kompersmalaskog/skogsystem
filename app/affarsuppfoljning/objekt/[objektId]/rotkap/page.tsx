'use client';

// LÄNGRE ROTKAP — en undersida av objektskärmen (/affarsuppfoljning/objekt/<id>/rotkap). Ett jobb: hämta objektets rader i
// sim_rotkap och hålla valet (kaplängd lokalt med 3,4 förvald). Objektet ges av adressen, så det finns ingen objektväljare.
//
// Skärmen läser BARA resultatet. Simuleringen körs efter import av
// berakna_rotkap.py; kurvorna den bygger på är stängda för inloggade och
// får aldrig nås härifrån.

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { medAbortRetry, arAbortFel } from '@/lib/supabaseRetry';
import { SIDA, MUTED, Tillbakarad, Laddar, Fel } from '@/components/Ytform';
import RotkapVy, { type SimRad } from './RotkapVy';

/** numeric kommer som text från PostgREST i vissa lägen — talen ska vara tal. */
function normalisera(r: Record<string, unknown>): SimRad {
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    objekt_id: String(r.objekt_id), kaplangd_cm: n('kaplangd_cm'),
    objekt_namn: (r.objekt_namn as string | null) ?? null,
    maskiner: (r.maskiner as string[] | null) ?? [],
    stammar_objekt: n('stammar_objekt'), stammar: n('stammar'),
    grupp1_stammar: n('grupp1_stammar'), grupp2_stammar: n('grupp2_stammar'),
    utan_sagstock: n('utan_sagstock'), utan_kurva: n('utan_kurva'),
    timmer_m3: n('timmer_m3'), kubb_m3: n('kubb_m3'), massa_m3: n('massa_m3'), rest_m3: n('rest_m3'),
    grupp1_timmer_m3: n('grupp1_timmer_m3'), grupp2_timmer_m3: n('grupp2_timmer_m3'),
    grupp2_kedja_fast: n('grupp2_kedja_fast'),
    validering: (r.validering as SimRad['validering']) ?? null,
    anmarkning: (r.anmarkning as string | null) ?? null,
    stockar_antal: n('stockar_antal'), serier_antal: n('serier_antal'),
    beraknad: String(r.beraknad ?? ''),
  };
}

function Innehall() {
  const params = useParams();
  const sp = useSearchParams();
  const router = useRouter();
  const objektId = decodeURIComponent(String(params.objektId));
  const vy = sp.get('vy') === 'sa-raknas' ? 'sa-raknas' : undefined;
  const [rader, setRader] = useState<SimRad[] | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<{ kod: string; text: string } | null>(null);
  const [kaplangd, setKaplangd] = useState(340);

  const bas = `/affarsuppfoljning/objekt/${encodeURIComponent(objektId)}`;
  const rotkapHref = `${bas}/rotkap`;

  const hamta = useCallback(async () => {
    setLaddar(true); setFel(null);
    const { data, error } = await medAbortRetry(() =>
      supabase.from('sim_rotkap').select('*').eq('objekt_id', objektId).order('kaplangd_cm'));
    if (error) {
      setFel({ kod: (error as { code?: string }).code ?? (arAbortFel(error) ? 'ABORT' : 'OKÄND'),
               text: error.message ?? String(error) });
      setRader(null);
    } else setRader(((data ?? []) as Record<string, unknown>[]).map(normalisera));
    setLaddar(false);
  }, [objektId]);

  useEffect(() => { hamta(); }, [hamta]);

  if (laddar) return <div style={SIDA}><Laddar vad="simuleringen" /></div>;

  if (fel) return <div style={SIDA}><Fel rubrik="Simuleringen kunde inte hämtas" fel={fel} igen={hamta} /></div>;

  // Tomt utan fel är två olika saker: objektet har ingen simulering (inga stockar eller kurvor), eller förberäkningen har inte körts /
  // läsrättigheten saknas (RLS ger tomt, aldrig fel). Båda sägs.
  if (!rader || rader.length === 0) return (
    <div style={SIDA}>
      <Tillbakarad href={bas} text="Objektet" />
      <div style={{ ...MUTED, padding: '24px 16px', lineHeight: 1.7 }}>
        Ingen simulering finns för objektet.<br />
        Förberäkningen körs efter import (berakna_rotkap.py) — objekt utan stockar eller kurvor får ingen.
        Är den körd och det här ändå står kvar saknas läsrättigheten.
      </div>
    </div>
  );

  return <RotkapVy rader={rader} valt={objektId} kaplangd={kaplangd} onKaplangd={setKaplangd} vy={vy}
    onSaRaknas={() => router.push(`${rotkapHref}?vy=sa-raknas`)} objektHref={bas} rotkapHref={rotkapHref} />;
}

export default function RotkapSida() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Innehall />
    </Suspense>
  );
}
