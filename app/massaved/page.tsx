'use client';

// /massaved — massavedens längd för gallringsskördarna, samma innehåll som arket i hytten (components/massaved/MassaInnehall).
// Bara admin; förarna ser det i maskinen. Den inloggades egna tal står överst bara om hen själv kört massaved.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import VyKolumn from '@/components/design/VyKolumn';
import MassaInnehall from '@/components/massaved/MassaInnehall';
import { useMassaLangd } from '@/lib/hooks/useMassaLangd';
import { arGallringsskordare, personNyckel, forNamn, svenskIdag } from '@/lib/massaLangd';
import { AVSTAND, FARG, TYP, VY_ROT, designCss } from '@/lib/design/tokens';

type M = { maskin_id: string; modell: string | null; visningsnamn: string | null; maskin_typ: string | null; aktiv_till: string | null };

export default function MassavedSida() {
  const { medarbetare, loading } = useCurrentMedarbetare();
  const admin = medarbetare?.roll === 'admin';
  const [maskiner, setMaskiner] = useState<M[] | null>(null);
  const [maskinFel, setMaskinFel] = useState(false);
  useEffect(() => {
    if (!admin) return;
    supabase.from('dim_maskin').select('maskin_id, modell, visningsnamn, maskin_typ, aktiv_till').then(({ data, error }) => {
      if (error) { setMaskinFel(true); return; }
      setMaskiner((data ?? []) as M[]);
    });
  }, [admin]);
  const idag = svenskIdag();
  const ids = useMemo(() => (maskiner ?? []).filter(m => arGallringsskordare(m, idag)).map(m => m.maskin_id), [maskiner, idag]);
  const namn = useMemo(() => Object.fromEntries((maskiner ?? []).map(m => [m.maskin_id, (m.visningsnamn ?? '').trim() || m.modell || m.maskin_id])), [maskiner]);
  const { rader, fel, idag: lasDag, forsokIgen } = useMassaLangd(ids, admin && ids.length > 0);
  const egen = rader?.find(r => r.medarbetare_id && r.medarbetare_id === medarbetare?.id);
  const jag = egen ? { nyckel: personNyckel(egen), namn: forNamn(egen.operator_namn) } : null;

  return (
    <div style={{ ...VY_ROT, paddingTop: AVSTAND.l, paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}</style>
      <VyKolumn>
        <p style={{ ...TYP.text, color: FARG.text2, margin: `0 0 ${AVSTAND.xl}px` }}>Hur långa stockarna blir i gallringen. Längre massaved ger fler kubik per lass för skotaren.</p>
        {loading ? null : !admin ? (
          <div style={{ ...TYP.text, color: FARG.text2 }}>Bara för admin. Förarna ser massaveden i maskinen.</div>
        ) : maskinFel ? (
          <div style={{ ...TYP.text, color: FARG.text }}>Kunde inte läsa maskinerna just nu.</div>
        ) : maskiner && ids.length === 0 ? (
          <div style={{ ...TYP.text, color: FARG.text2 }}>Ingen aktiv gallringsskördare.</div>
        ) : (
          <MassaInnehall rader={rader} fel={fel} idag={lasDag} jag={jag} maskinNamn={namn} onForsok={forsokIgen} />
        )}
      </VyKolumn>
    </div>
  );
}
