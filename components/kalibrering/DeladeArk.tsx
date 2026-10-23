'use client';
// Det som öppnas ovanpå en flik. Två slag:
//   BLADET (kontroll, stam, plan, stock, dag) — kontrollens innehåll; ritas av KontrollPanel som blad nerifrån (telefon) eller som panel bredvid listan
//     (iPad/dator, bara i Kontroller). Allt i bladet är push-navigering i samma blad.
//   ARK (trädslag, åtgärd, lägg till åtgärd, vad betyder talen?) — vanliga `Ark` ur components/design.
import Ark from '@/components/design/Ark';
import { AVSTAND } from '@/lib/design/tokens';
import { tolFranProfil } from '@/lib/kalibrering/bedomning';
import { atgardRader } from '@/lib/kalibrering/laget';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { useState } from 'react';
import type { Detent } from '@/lib/plusArk';
import ArtArk from './ArtArk';
import AtgardArk from './AtgardArk';
import DagArk from './DagArk';
import HjalpArk from './HjalpArk';
import KontrollInnehall from './KontrollInnehall';
import KontrollPanel, { type BladLage } from './KontrollPanel';
import NyAtgardArk from './NyAtgardArk';
import PlanArk from './PlanArk';
import StamArk from './StamArk';
import { StockArk } from './StockArk';
import SvajStang from './SvajStang';
import { arBladPost, arkRubrik } from './arkTyper';
import { Meta, Status } from './delar';

/**
 * `bladLage`: hur bladet ritas just nu — 'panel' bara i Kontroller på iPad/dator (då ritas det av sidan bredvid listan, via `BladPlats`), annars 'blad'.
 * `visaBlad` = false betyder att sidan själv placerar bladet (panelen) och att DeladeArk inte ritar det.
 */
export default function DeladeArk({ ark, d, bladLage, visaBlad }: { ark: KalibreringArk; d: KalibreringData; bladLage: BladLage; visaBlad: boolean }) {
  const top = ark.oversta;
  const post = top?.post;
  return (
    <>
      {top && post && arBladPost(post) && visaBlad && <Blad ark={ark} d={d} lage={bladLage} />}

      {top && post && !arBladPost(post) && (
        post.typ === 'ny_atgard' ? <NyAtgardArk d={d} onStang={ark.stang} /> : (
          <SvajStang onStang={ark.stang}>
            <Ark key={`${post.typ}:${arkRubrik(post)}`} rubrik={arkRubrik(post)} onStang={ark.stang} stang={post.typ === 'hjalp' || post.typ === 'art' || post.typ === 'atgard' ? 'Klar' : 'Avbryt'}>
              {post.typ === 'art' && d.speciesData[post.art] && (
                <ArtArk art={post.art} data={d.speciesData[post.art]} kontroller={d.filteredKalib} onKontroll={fil => ark.oppnaKontroll(fil)}
                  tr={d.trRader.find(t => t.tradslag.toLowerCase() === post.art) ?? null} trData={d.trData} />
              )}
              {post.typ === 'atgard' && (() => {
                const rad = atgardRader(d.bedomning).find(r => r.id === post.id);
                return rad ? <AtgardArk rad={rad} /> : <Meta>Åtgärden finns inte längre.</Meta>;
              })()}
              {post.typ === 'hjalp' && <HjalpArk bedomning={d.bedomning} />}
            </Ark>
          </SvajStang>
        )
      )}
    </>
  );
}

/** Bladet/panelen med kontrollens innehåll — även utanför DeladeArk (panelen bredvid listan i Kontroller på iPad/dator). */
export function Blad({ ark, d, lage }: { ark: KalibreringArk; d: KalibreringData; lage: BladLage }) {
  const top = ark.oversta;
  const post = top?.post;
  // Halvt är utgångsläget för varje ny kontroll; användarens val gäller kontrollen tills en annan öppnas.
  const [detent, setDetent] = useState<Detent>('halv');
  const rotFil = ark.rot?.post.typ === 'kontroll' ? ark.rot.post.data.kontroll.filnamn : null;
  const [forraFil, setForraFil] = useState<string | null>(rotFil);
  if (rotFil !== forraFil) { setForraFil(rotFil); setDetent('halv'); }
  if (!top || !post || !arBladPost(post)) return null;

  const lagen = post.typ === 'kontroll';
  const nyckel = post.typ === 'kontroll' ? `kontroll:${post.data.kontroll.filnamn}` : `${post.typ}:${arkRubrik(post)}`;
  return (
    <KontrollPanel lage={lage} rubrik={arkRubrik(post)} tillbakaEtikett={top.foregaende ? arkRubrik(top.foregaende) : null} onTillbaka={ark.tillbaka} onStang={ark.stang}
      lagen={lagen} detent={detent} onDetent={setDetent} nyckel={nyckel}>
      {post.typ === 'kontroll' && (
        <KontrollInnehall data={post.data} bedomning={d.bedomning} halv={lage === 'blad' && detent === 'halv'} onVisaStockar={() => setDetent('hel')}
          onStam={n => ark.oppnaStam(post.data, n)} onStock={id => ark.oppnaStock(post.data, id)} />
      )}
      {post.typ === 'stam' && (
        <StamArk data={post.data} stamNummer={post.stamNummer} tolDia={tolFranProfil(d.bedomning?.trosklar, 'diameter', 4)}
          onByt={n => ark.byt({ typ: 'stam', data: post.data, stamNummer: n })} onStock={id => ark.oppnaStock(post.data, id)}
          onPlan={() => ark.oppnaPlan(post.data, post.stamNummer)} />
      )}
      {post.typ === 'plan' && <PlanArk data={post.data} stamNummer={post.stamNummer} />}
      {post.typ === 'stock' && (() => {
        const stock = post.data.stockar.find(s => s.id === post.stockId);
        return stock ? <StockArk stock={stock} tolLen={tolFranProfil(d.bedomning?.trosklar, 'langd', 2)} /> : null;
      })()}
      {post.typ === 'dag' && <DagArk dag={post.dag} maskinId={d.effektiv} allKalib={d.allKalib} onKontroll={fil => ark.oppnaKontroll(fil)} />}
      {post.typ === 'fel' && (
        <>
          <Meta>{post.filnamn}</Meta>
          <div style={{ marginTop: AVSTAND.l }}><Status ton="hot" ord="Kontrolldata kunde inte hämtas. Försök igen." ljus /></div>
        </>
      )}
    </KontrollPanel>
  );
}
