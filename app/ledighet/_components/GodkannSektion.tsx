'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { uppdateraVerifierat } from '@/lib/supabase-save';
import { AVSTAND, FARG, KORT, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import AnsokanRad from './AnsokanRad';
import { FelText, Ikon } from './delar';
import type { Ansokan } from './typer';

/**
 * Godkännar-raden: "X att godkänna" högst upp i Mig-vyn. Renderas BARA för
 * godkännare (admin) — förare ser den aldrig. Skrivningen är verifierad;
 * ett RLS-block visas som riktigt fel, aldrig som success.
 */
export default function GodkannSektion({
  vantande, onKlar,
}: {
  vantande: Ansokan[];
  onKlar: () => void;
}) {
  const [oppen, setOppen] = useState(false);
  const [hanterarId, setHanterarId] = useState<string | null>(null);
  // Felet står i sektionen, vid raderna man just tryckte på — inte högst upp på sidan.
  const [fel, setFel] = useState<string | null>(null);

  if (vantande.length === 0) return null;

  const hantera = async (a: Ansokan, status: 'godkänd' | 'nekad') => {
    setHanterarId(a.id);
    setFel(null);
    const res = await uppdateraVerifierat(supabase, 'ledighet_ansokningar', { status }, { id: a.id });
    setHanterarId(null);
    if (!res.ok) {
      setFel(res.fel);
      return;
    }
    onKlar();
  };

  return (
    <section style={{ marginBottom: AVSTAND.xl }}>
      <button onClick={() => setOppen(!oppen)} aria-expanded={oppen}
        style={{ ...KORT, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, width: '100%', minHeight: TRAFFYTA.primar, border: 'none', borderRadius: RADIE.kort, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', ...TYP.listtitel, color: FARG.text }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: FARG.orange }} />
          {vantande.length} att godkänna
        </span>
        <Ikon namn="chevron_right" storlek={22} farg={FARG.text3} vrid={oppen} />
      </button>

      {oppen && (
        <div className="tona-in" style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginTop: AVSTAND.s }}>
          {vantande.map((a, i) => (
            <AnsokanRad
              key={a.id}
              a={a}
              visaNamn
              sista={i === vantande.length - 1}
              onHantera={hantera}
              hanterar={hanterarId === a.id}
            />
          ))}
        </div>
      )}
      {oppen && fel && <div style={{ marginTop: AVSTAND.s }}><FelText text={fel} /></div>}
    </section>
  );
}
