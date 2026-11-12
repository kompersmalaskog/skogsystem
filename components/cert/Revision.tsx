'use client';
// Cert: "Är vi redo för revisionen?" — svaret överst, en rad per SE-sektion, och sektionens krav ett tryck bort.
// All text och alla tal kommer ur lib/cert/krav (byggVy); den här filen ritar bara.
import { useState } from 'react';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Rad from '@/components/design/Rad';
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import { STATUS_TEXT, byggVy, gallerInteText, kvarText, type Krav, type SektionVy } from '@/lib/cert/krav';
import type { RevisionData } from '@/lib/cert/data';
import KravArk from './KravArk';

type Props = { data: RevisionData; sektion: number | null; onSektion: (nr: number | null) => void; onSparat: () => void };

export default function Revision({ data, sektion, onSektion, onSparat }: Props) {
  const vy = byggVy(data.krav, data.utb);
  const [valt, setValt] = useState<Krav | null>(null);
  const oppen = sektion == null ? null : vy.sektioner.find(s => s.nr === sektion) ?? null;

  if (oppen) {
    return (
      <>
        <button type="button" onClick={() => onSektion(null)} style={{ ...KNAPP.lank, marginBottom: AVSTAND.s }}>‹ Cert</button>
        <Svarsrad rubrik={oppen.namn} rad={oppen.kvar === 0 ? 'Klart' : `${oppen.kvar} kvar till revisionen`} stor />
        <KravLista s={oppen} onKrav={setValt} />
        {valt && (
          <KravArk krav={valt} utb={data.utb[valt.kravNr]} onStang={() => setValt(null)} onSparat={() => { setValt(null); onSparat(); }} />
        )}
      </>
    );
  }

  return (
    <>
      <Svarsrad rubrik={vy.rubrik} stor />
      <Sektion rubrik="SE:s krav">
        {vy.sektioner.map((s, i) => (
          <Rad key={s.nr} titel={s.namn} hoger={kvarText(s.kvar)} dampad={s.kvar === 0} sista={i === vy.sektioner.length - 1}
            onTryck={() => onSektion(s.nr)} attr={{ 'data-cert-sektion': String(s.nr) }} />
        ))}
      </Sektion>
    </>
  );
}

function KravLista({ s, onKrav }: { s: SektionVy; onKrav: (k: Krav) => void }) {
  const [visaInte, setVisaInte] = useState(false);
  const harInte = s.gallerInte.length > 0;
  return (
    <>
      <Sektion rubrik="Krav" foljdAvLankar={harInte}>
        {s.rader.map(({ krav, status }, i) => (
          <Rad key={krav.kravNr} titel={krav.namn} dampad={status === 'klart'} sista={i === s.rader.length - 1}
            under={<>{krav.kravNr} · <span style={{ color: status === 'klart' ? FARG.text2 : FARG.orange }}>{STATUS_TEXT[status]}</span></>}
            onTryck={() => onKrav(krav)} attr={{ 'data-cert-krav': krav.kravNr, 'data-cert-status': status }} />
        ))}
      </Sektion>
      {harInte && (
        <div style={{ marginBottom: AVSTAND.xl }}>
          <button type="button" aria-expanded={visaInte} onClick={() => setVisaInte(v => !v)} data-cert-galler-inte
            style={{ ...KNAPP.lank, color: FARG.text2 }}>
            {gallerInteText(s.gallerInte.length)} {visaInte ? '▴' : '▾'}
          </button>
          {visaInte && s.gallerInte.map(k => (
            <div key={k.kravNr} style={{ padding: `${AVSTAND.s}px 0` }}>
              <div style={{ ...TYP.text, color: FARG.text2 }}>{k.namn}</div>
              <div style={{ ...TYP.meta, color: FARG.text2 }}>{k.kravNr} · {k.varFinns}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
