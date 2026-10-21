'use client';
// De delade arken i kalibreringsvyn: stapeln (kontroll → stam → stock, trädslag, dag), hjälptexten bakom "?" och maskinfiltret.
// Sidan äger vilka som är öppna; här ritas de. Alla är `Ark` ur components/design — ett grepp, en rubrik, Avbryt uppe till höger.
import Ark from '@/components/design/Ark';
import { AVSTAND } from '@/lib/design/tokens';
import { tolFranProfil } from '@/lib/kalibrering/bedomning';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import ArtArk from './ArtArk';
import DagArk from './DagArk';
import HjalpArk from './HjalpArk';
import KontrollArk from './KontrollArk';
import MaskinArk from './MaskinArk';
import StamArk from './StamArk';
import { SenasteStockArk, StockArk } from './StockArk';
import SvajStang from './SvajStang';
import { arkRubrik } from './arkTyper';
import { Meta, Status, Tillbaka } from './delar';

export default function DeladeArk({ ark, d, hjalpOpen, onStangHjalp, maskinOpen, onStangMaskin }: {
  ark: KalibreringArk; d: KalibreringData; hjalpOpen: boolean; onStangHjalp: () => void; maskinOpen: boolean; onStangMaskin: () => void;
}) {
  const top = ark.oversta;
  const post = top?.post;
  return (
    <>
      {top && post && (
        <SvajStang onStang={ark.stang}>
          <Ark key={`${post.typ}:${arkRubrik(post)}`} rubrik={arkRubrik(post)} onStang={ark.stang}>
            {top.foregaende && <Tillbaka etikett={arkRubrik(top.foregaende)} onTryck={ark.tillbaka} />}
            {post.typ === 'kontroll' && <KontrollArk data={post.data} bedomning={d.bedomning} onStam={n => ark.oppnaStam(post.data, n)} />}
            {post.typ === 'stam' && (
              <StamArk data={post.data} stamNummer={post.stamNummer}
                onByt={n => ark.byt({ typ: 'stam', data: post.data, stamNummer: n })} onStock={id => ark.oppnaStock(post.data, id)} />
            )}
            {post.typ === 'stock' && (() => {
              const stock = post.data.stockar.find(s => s.id === post.stockId);
              return stock ? <StockArk stock={stock} tolLen={tolFranProfil(d.bedomning?.trosklar, 'langd', 2)} /> : null;
            })()}
            {post.typ === 'seStock' && <SenasteStockArk stock={post.stock} />}
            {post.typ === 'art' && d.speciesData[post.art] && (
              <ArtArk art={post.art} data={d.speciesData[post.art]} kontroller={d.filteredKalib} onKontroll={ark.oppnaKontroll} />
            )}
            {post.typ === 'dag' && <DagArk dag={post.dag} allKalib={d.allKalib} onKontroll={ark.oppnaKontroll} />}
            {post.typ === 'fel' && (
              <>
                <Meta>{post.filnamn}</Meta>
                <div style={{ marginTop: AVSTAND.l }}><Status ton="hot" ord="Kontrolldata kunde inte hämtas. Försök igen." ljus /></div>
              </>
            )}
          </Ark>
        </SvajStang>
      )}

      {hjalpOpen && (
        <Ark rubrik="Vad betyder talen?" onStang={onStangHjalp}>
          <HjalpArk bedomning={d.bedomning} />
        </Ark>
      )}

      {maskinOpen && (
        <SvajStang onStang={onStangMaskin}>
          <Ark rubrik="Maskin" onStang={onStangMaskin}>
            <MaskinArk maskiner={d.alleMaskiner} arAktiv={d.arAktiv} valdId={d.selectedMaskinId} effektivId={d.effektiv}
              onVal={id => { d.setSelectedMaskinId(id); onStangMaskin(); }} />
          </Ark>
        </SvajStang>
      )}
    </>
  );
}
