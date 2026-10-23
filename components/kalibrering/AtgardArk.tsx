'use client';
// En åtgärd: träffen, rakheten och spridningen 90 dagar före och efter ("Hjälpte åtgärden?"). Räknat i lib/kalibrering (atgardDom, atgardDetalj) — samma
// tal och samma ord som gamla Trend. Under 30 mått på någon sida står det att det är för tidigt, och inga tal visas.
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, TYP, TNUM } from '@/lib/design/tokens';
import { fmtDagMan } from '@/lib/kalibrering/datum';
import { atgardDetalj, type AtgardRad } from '@/lib/kalibrering/laget';
import { Fyll, Meta, Status } from './delar';

const FARG_RIKTNING = { battre: FARG.gron, samre: FARG.rod, oforandrad: FARG.text3 } as const;

export default function AtgardArk({ rad }: { rad: AtgardRad }) {
  const { post, dom } = rad;
  return (
    <>
      <Meta>{`${post.kalla === 'reparation' ? 'Reparation' : 'Åtgärd'} · ${fmtDagMan(post.datum)}`}</Meta>
      <div style={{ ...TYP.listtitel, color: FARG.text, margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px` }}>{rad.titel}</div>

      {!dom ? (
        <Fyll>
          <div style={{ ...TYP.text, color: FARG.text2 }}>För tidigt att säga — kom tillbaka när fler kontroller gjorts efter {fmtDagMan(post.datum)}.</div>
          <Meta style={{ marginTop: AVSTAND.xs }}>{post.nFore} mått före · {post.nEfter} efter · behöver 30 på varje sida.</Meta>
        </Fyll>
      ) : (
        <>
          <Sektion rubrik="90 dagar före → efter" not={post.kalla === 'atgard' ? 'Efter räknas till nästa åtgärd eller reparation.' : undefined}>
            {atgardDetalj(dom).map((f, i, alla) => (
              <Rad key={f.key} titel={f.fraga} sista={i === alla.length - 1} pil={false}
                hoger={<span style={TNUM}>{f.fore} → <b style={{ fontWeight: TYP.rubrik.fontWeight }}>{f.efter}</b></span>}
                hogerUnder={<Status farg={FARG_RIKTNING[f.riktning]} ord={f.text} />} />
            ))}
          </Sektion>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{dom.rubrik}</div>
          {dom.tillagg.map((t, i) => <Meta key={i} style={{ marginTop: AVSTAND.s }}>{t}</Meta>)}
        </>
      )}
    </>
  );
}
