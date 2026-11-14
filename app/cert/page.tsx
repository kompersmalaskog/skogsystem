'use client';

// /cert — "Är vi redo för revisionen?" SE:s kravlista (cert_krav): svaret överst, en rad per SE-sektion, kraven
// ett tryck bort. Bara admin. Intygen per person bor i Utbildning — Cert visar dem aldrig, bara läget.
// Vald sektion står i adressen (?sektion=2) så bakåtknappen går tillbaka till översikten.

import { useCallback, useEffect, useState } from 'react';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import VyKolumn from '@/components/design/VyKolumn';
import Revision from '@/components/cert/Revision';
import { hamtaRevision, type RevisionData } from '@/lib/cert/data';
import { AVSTAND, FARG, KNAPP, TYP, VY_ROT, designCss } from '@/lib/design/tokens';

export default function CertSida() {
  const { medarbetare, loading } = useCurrentMedarbetare();
  const admin = medarbetare?.roll === 'admin';
  const [data, setData] = useState<RevisionData | null>(null);
  const [fel, setFel] = useState(false);

  const las = useCallback(() => {
    setFel(false);
    hamtaRevision().then(setData).catch(() => setFel(true));
  }, []);
  useEffect(() => { if (admin) las(); }, [admin, las]);

  const [sektion, setSektion] = useState<number | null>(null);
  useEffect(() => {
    const las = () => { const n = Number(new URLSearchParams(window.location.search).get('sektion')); setSektion(n >= 1 ? n : null); };
    las();
    window.addEventListener('popstate', las);
    return () => window.removeEventListener('popstate', las);
  }, []);
  const valjSektion = (nr: number | null) => {
    const url = new URL(window.location.href);
    if (nr) url.searchParams.set('sektion', String(nr)); else url.searchParams.delete('sektion');
    window.history.pushState(null, '', url.toString());
    setSektion(nr);
    window.scrollTo(0, 0);
  };

  return (
    <div style={{ ...VY_ROT, paddingTop: AVSTAND.l, paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}</style>
      <VyKolumn>
        {loading ? null : !admin ? (
          <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Bara för admin.</p>
        ) : fel ? (
          <div>
            <p style={{ ...TYP.text, color: FARG.text, margin: `0 0 ${AVSTAND.s}px` }}>Kunde inte läsa kravlistan just nu.</p>
            <button type="button" style={KNAPP.lank} onClick={las}>Försök igen</button>
          </div>
        ) : !data ? (
          <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Läser kravlistan…</p>
        ) : (
          <Revision data={data} sektion={sektion} onSektion={valjSektion} onSparat={las} />
        )}
      </VyKolumn>
    </div>
  );
}
