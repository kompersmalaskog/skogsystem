'use client';

// /cert — certifieringen samlad. Just nu EN del: Behörigheter ("Är alla förare behöriga?"). Dokument och påminnelser
// läggs som egna delar under den här. Bara admin; förarna får sina påminnelser i sin egen vy (senare).
// Cert läser Utbildning — se lib/cert/data.ts.

import { useCallback, useEffect, useState } from 'react';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import VyKolumn from '@/components/design/VyKolumn';
import Behorigheter from '@/components/cert/Behorigheter';
import { hamtaCert, type CertData } from '@/lib/cert/data';
import { svenskIdag } from '@/lib/cert/behorighet';
import { AVSTAND, FARG, KNAPP, TYP, VY_ROT, designCss } from '@/lib/design/tokens';

export default function CertSida() {
  const { medarbetare, loading } = useCurrentMedarbetare();
  const admin = medarbetare?.roll === 'admin';
  const [data, setData] = useState<CertData | null>(null);
  const [fel, setFel] = useState(false);

  const las = useCallback(() => {
    setFel(false);
    hamtaCert().then(setData).catch(() => setFel(true));
  }, []);
  useEffect(() => { if (admin) las(); }, [admin, las]);

  return (
    <div style={{ ...VY_ROT, paddingTop: AVSTAND.l, paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}</style>
      <VyKolumn>
        {loading ? null : !admin ? (
          <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Bara för admin.</p>
        ) : fel ? (
          <div>
            <p style={{ ...TYP.text, color: FARG.text, margin: `0 0 ${AVSTAND.s}px` }}>Kunde inte läsa behörigheterna just nu.</p>
            <button type="button" style={KNAPP.lank} onClick={las}>Försök igen</button>
          </div>
        ) : !data ? (
          <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Läser behörigheterna…</p>
        ) : (
          <Behorigheter data={data} idag={svenskIdag()} skapadAv={medarbetare?.id ?? null} onSparat={las} />
        )}
      </VyKolumn>
    </div>
  );
}
