'use client';
// Kalibrering — skalet. Sidan äger bara det som flikarna delar: datan (useKalibreringData), vilken flik som visas, vilka ark som är öppna
// och de val som ska överleva ett flikbyte. Varje flik är en egen komponent i components/kalibrering; arken ligger samlade i DeladeArk.
// Räknandet bor i lib/kalibrering. Utseendet är designsystemets (lib/design/tokens + components/design) — ingen egen CSS.
import { useState } from 'react';
import Flikkontroll from '@/components/design/Flikkontroll';
import Tillstand from '@/components/design/Tillstand';
import VyKolumn from '@/components/design/VyKolumn';
import DeladeArk from '@/components/kalibrering/DeladeArk';
import KalenderFlik from '@/components/kalibrering/KalenderFlik';
import MaskinFilter from '@/components/kalibrering/MaskinFilter';
import ObjektFlik from '@/components/kalibrering/ObjektFlik';
import RapportFlik from '@/components/kalibrering/RapportFlik';
import SenasteFlik from '@/components/kalibrering/SenasteFlik';
import { FelSkarm, LaddarSkarm, TomSkarm } from '@/components/kalibrering/Skarmar';
import TrendFlik from '@/components/kalibrering/TrendFlik';
import { AVSTAND, designCss, FARG, LAYOUT, medSafeBotten, ROT_MIN_HOJD, VY_ROT } from '@/lib/design/tokens';
import { useKalibreringArk } from '@/lib/hooks/useKalibreringArk';
import { useKalibreringData, type Flik } from '@/lib/hooks/useKalibreringData';
import { useKalibreringVy } from '@/lib/hooks/useKalibreringVy';

const FLIKAR: readonly (readonly [Flik, string])[] = [['today', 'Senaste'], ['trend', 'Trend'], ['objekt', 'Objekt'], ['calendar', 'Kalender'], ['report', 'Rapport']];

export default function KalibreringPage() {
  const [aktivFlik, setAktivFlik] = useState<Flik>('today');
  const d = useKalibreringData(aktivFlik);
  const v = useKalibreringVy();
  const ark = useKalibreringArk(d.speciesData);
  const [hjalpOpen, setHjalpOpen] = useState(false); // "Vad betyder talen?" bakom frågan i Läget
  const [maskinOpen, setMaskinOpen] = useState(false);

  if (d.loading) return <LaddarSkarm />;
  if (d.fetchError && d.allKalib.length === 0) return <FelSkarm text={d.fetchError} onForsok={d.fetchData} />;
  if (d.allKalib.length === 0) return <TomSkarm />;

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD, paddingBottom: medSafeBotten(AVSTAND.xl) }}>
      <style>{designCss}</style>
      {/* Flikraden följer med när man scrollar, precis under toppfältet. */}
      <div style={{ position: 'sticky', top: LAYOUT.topbar, zIndex: 10, background: FARG.bg, padding: `${AVSTAND.m}px 0` }}>
        <VyKolumn>
          <Flikkontroll flikar={FLIKAR} aktiv={aktivFlik} onVal={setAktivFlik} />
        </VyKolumn>
      </div>

      <VyKolumn>
        {/* Maskinfiltret gäller alla flikar UTOM Objekt (som är maskinoberoende — filtret är objektet). */}
        {aktivFlik !== 'objekt' && (
          <div style={{ marginBottom: AVSTAND.l }}>
            <MaskinFilter etikett={d.filterLabel} onTryck={() => { ark.stang(); setMaskinOpen(true); }} />
          </div>
        )}

        <Tillstand nyckel={aktivFlik}>
          {aktivFlik === 'today' && <SenasteFlik d={d} v={v} ark={ark} />}
          {aktivFlik === 'trend' && <TrendFlik d={d} v={v} onHjalp={() => setHjalpOpen(true)} />}
          {aktivFlik === 'objekt' && <ObjektFlik d={d} v={v} />}
          {aktivFlik === 'calendar' && <KalenderFlik d={d} ark={ark} />}
          {aktivFlik === 'report' && <RapportFlik d={d} ark={ark} />}
        </Tillstand>
      </VyKolumn>

      <DeladeArk ark={ark} d={d} hjalpOpen={hjalpOpen} onStangHjalp={() => setHjalpOpen(false)} maskinOpen={maskinOpen} onStangMaskin={() => setMaskinOpen(false)} />
    </div>
  );
}
