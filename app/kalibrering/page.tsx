'use client';
// Kalibrering — skalet. Fyra flikar i en bottenmeny, som i Arbetsrapport: Läget (är vi godkända?), Över tid (blir det bättre?), Kontroller (vad mättes?),
// Objekt (slå upp en trakt). Sidan äger det flikarna delar: datan (useKalibreringData), vald flik, de val som ska överleva ett flikbyte och stapeln av
// blad/ark. Räknandet bor i lib/kalibrering; utseendet är designsystemets (lib/design/tokens + components/design).
//
// Maskinen är alltid EN (förarens egen som start; "Giant ▾" i rubriken byter) — det finns ingen sammanslagen bedömning av flera maskiner.
// Bredd: telefon = en kolumn och blad nerifrån; från 760 px (iPad stående) är Kontroller och Objekt lista till vänster och detalj till höger (som Mail).
import { useState } from 'react';
import Bottenmeny, { bottenmenyPadding, type BottenmenyPost } from '@/components/design/Bottenmeny';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import VyKolumn from '@/components/design/VyKolumn';
import DeladeArk, { Blad } from '@/components/kalibrering/DeladeArk';
import KontrollerFlik from '@/components/kalibrering/KontrollerFlik';
import LagetFlik from '@/components/kalibrering/LagetFlik';
import ObjektFlik, { ObjektDetalj } from '@/components/kalibrering/ObjektFlik';
import OverTidFlik from '@/components/kalibrering/OverTidFlik';
import { FelSkarm, LaddarSkarm, TomSkarm } from '@/components/kalibrering/Skarmar';
import { arBladPost } from '@/components/kalibrering/arkTyper';
import { kalibreringCss, MASTER_DETAIL_FRAN_PX } from '@/components/kalibrering/kalibreringCss';
import { designCss, FARG, KORT, ROT_MIN_HOJD, VY_ROT, AVSTAND, LAYOUT } from '@/lib/design/tokens';
import { useKalibreringArk } from '@/lib/hooks/useKalibreringArk';
import { useKalibreringData, type Flik } from '@/lib/hooks/useKalibreringData';
import { useKalibreringVy } from '@/lib/hooks/useKalibreringVy';
import { useMatchMedia } from '@/lib/hooks/useMatchMedia';

const FLIKAR: readonly BottenmenyPost<Flik>[] = [
  { id: 'laget', etikett: 'Läget', ikon: 'speed' },
  { id: 'tid', etikett: 'Över tid', ikon: 'show_chart' },
  { id: 'kontroller', etikett: 'Kontroller', ikon: 'checklist' },
  { id: 'objekt', etikett: 'Objekt', ikon: 'forest' },
];

export default function KalibreringPage() {
  const [flik, setFlik] = useState<Flik>('laget');
  const d = useKalibreringData(flik);
  const v = useKalibreringVy();
  const ark = useKalibreringArk(d.speciesData);
  const bred = useMatchMedia(`(min-width: ${MASTER_DETAIL_FRAN_PX}px)`);

  if (d.loading) return <LaddarSkarm />;
  if (d.fetchError && d.allKalib.length === 0) return <FelSkarm text={d.fetchError} onForsok={d.fetchData} />;
  if (d.allKalib.length === 0) return <TomSkarm />;

  // Kontroller och Objekt har lista + detalj bredvid varandra från 760 px; Läget är en smal kolumn, Över tid en bred.
  const delad = bred && (flik === 'kontroller' || flik === 'objekt');
  const kolumn = flik === 'laget' ? 'smal' : flik === 'tid' || delad ? 'bred' : 'smal';
  const valjFlik = (f: Flik) => {
    if (f === flik) return;
    ark.stang(); // ett blad eller ark hör till fliken det öppnades i
    setFlik(f);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };

  const post = ark.oversta?.post;
  const detaljPlats = (
    <div className="kal-md-detalj">
      {bred && flik === 'kontroller' && (
        post && arBladPost(post) ? <Blad ark={ark} d={d} lage="panel" /> : (
          <div style={{ ...KORT, position: 'sticky', top: `calc(${LAYOUT.topbar} + ${AVSTAND.l}px)` }}>
            <Svarsrad rubrik="Välj en kontroll" rad="Tryck på en rad i listan, eller på en dag i kalendern." fri />
          </div>
        )
      )}
      {bred && flik === 'objekt' && (
        <div style={{ ...KORT, position: 'sticky', top: `calc(${LAYOUT.topbar} + ${AVSTAND.l}px)` }}>
          {v.valtObjekt && d.objektData ? <ObjektDetalj d={d} valt={v.valtObjekt} /> : <Svarsrad rubrik="Välj en trakt" rad="Tryck på ett objekt i listan." fri />}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD, paddingBottom: bottenmenyPadding(), background: FARG.bg }}>
      <style>{designCss + kalibreringCss}</style>
      <VyKolumn bredd={kolumn}>
        <Tillstand nyckel={flik}>
          {flik === 'laget' && <LagetFlik d={d} ark={ark} />}
          {flik === 'tid' && <OverTidFlik d={d} v={v} />}
          {flik === 'kontroller' && (
            <div className="kal-md">
              <div className="kal-md-lista"><KontrollerFlik d={d} ark={ark} /></div>
              {detaljPlats}
            </div>
          )}
          {flik === 'objekt' && (
            <div className="kal-md">
              <div className="kal-md-lista"><ObjektFlik d={d} v={v} bred={delad} /></div>
              {detaljPlats}
            </div>
          )}
        </Tillstand>
      </VyKolumn>

      <DeladeArk ark={ark} d={d} bladLage="blad" visaBlad={!(bred && flik === 'kontroller')} />
      <Bottenmeny poster={FLIKAR} aktiv={flik} onVal={valjFlik} etikett="Kalibrering" />
    </div>
  );
}
