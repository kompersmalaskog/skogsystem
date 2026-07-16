'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { uppdateraVerifierat } from '@/lib/supabase-save';
import { C, ff } from './tema';
import AnsokanKort from './AnsokanKort';
import type { Ansokan } from './typer';

/**
 * Godkännar-raden: "X att godkänna" högst upp i Mig-vyn. Renderas BARA för
 * godkännare (chef/admin) — förare ser den aldrig. Skrivningen är verifierad;
 * ett RLS-block visas som riktigt fel, aldrig som success.
 */
export default function GodkannSektion({
  vantande, onKlar, visaFel,
}: {
  vantande: Ansokan[];
  onKlar: () => void;
  visaFel: (fel: string) => void;
}) {
  const [oppen, setOppen] = useState(false);
  const [hanterarId, setHanterarId] = useState<string | null>(null);

  if (vantande.length === 0) return null;

  const hantera = async (a: Ansokan, status: 'godkänd' | 'nekad') => {
    setHanterarId(a.id);
    const res = await uppdateraVerifierat(supabase, 'ledighet_ansokningar', { status }, { id: a.id });
    setHanterarId(null);
    if (!res.ok) {
      visaFel(res.fel);
      return;
    }
    onKlar();
  };

  return (
    <div style={{ marginBottom: 20, fontFamily: ff }}>
      <button onClick={() => setOppen(!oppen)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: C.yellowDim, border: '1px solid rgba(234,179,8,0.3)',
        borderRadius: 12, padding: '13px 16px', cursor: 'pointer', fontFamily: ff,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.yellow }}>
          {vantande.length} att godkänna
        </span>
        <span style={{ fontSize: 13, color: C.yellow, transform: oppen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
      </button>

      {oppen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {vantande.map(a => (
            <AnsokanKort
              key={a.id}
              a={a}
              visaNamn
              onHantera={hantera}
              hanterar={hanterarId === a.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
