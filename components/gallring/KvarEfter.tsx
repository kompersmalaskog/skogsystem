'use client';
// Hur mycket står kvar? — grundyta före (Skogsstyrelsens laserdata, uppräknad till dagen skördaren började), uttaget
// (skördaren) och kvar = före − uttag. Talen och reglerna bor i lib/laserKvar.ts; här ritas de bara.
//
// Raderna står i kvittots ordning — före, uttaget, kvar — så kvar går att kontrollräkna med det som står ovanför:
// kvar visas som (avrundat före) − (avrundat uttag), aldrig som en egen avrundning av det oavrundade talet.
// "ca" och spannet står alltid vid före och kvar: de är uppräknade, inte mätta. Uttaget är en mätning och står utan.
// Laserdatan läses efter per hektar och fäller aldrig trakten: ett fel här är ett fel med Försök igen.
import { useCallback, useEffect, useState } from 'react';
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import { fmtDecimal } from '@/lib/gallring';
import { beraknaKvar, provpunkter, TILLVAXT, type KvarSvar } from '@/lib/laserKvar';
import { hamtaLaserRutor } from '@/lib/laserGrundyta';
import type { GallradYta } from '@/lib/gallradYta';

const RUBRIK = 'Hur mycket står kvar?';
const avr1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number) => `${Math.round(v * 100)} %`;

type Lage = { typ: 'laddar' } | { typ: 'fel'; text: string } | { typ: 'klar'; s: KvarSvar };

function Text({ children, attr }: { children: React.ReactNode; attr?: Record<string, string> }) {
  return <p style={{ margin: 0, padding: `${AVSTAND.l}px 0`, ...TYP.text, color: FARG.text2 }} {...attr}>{children}</p>;
}

export default function KvarEfter({ yta, uttagPerHa, skordStart }: {
  yta: GallradYta;
  uttagPerHa: number;
  /** Första dagen skördaren körde, "YYYY-MM-DD". */
  skordStart: string;
}) {
  const [lage, setLage] = useState<Lage>({ typ: 'laddar' });
  const ladda = useCallback(async () => {
    setLage({ typ: 'laddar' });
    try {
      const rutor = await hamtaLaserRutor(provpunkter(yta.karta.lnglat, yta.innehaller));
      setLage({ typ: 'klar', s: beraknaKvar({ rutor, uttagPerHa, skordStart }) });
    } catch (e) {
      setLage({ typ: 'fel', text: e instanceof Error ? e.message : 'Laserdatan gick inte att hämta.' });
    }
  }, [yta, uttagPerHa, skordStart]);
  useEffect(() => { ladda(); }, [ladda]);

  if (lage.typ === 'laddar') {
    return <Sektion rubrik={RUBRIK} inset><Text>Hämtar Skogsstyrelsens laserdata…</Text></Sektion>;
  }
  if (lage.typ === 'fel') {
    return (
      <Sektion rubrik={RUBRIK} inset>
        <div style={{ padding: `${AVSTAND.l}px 0` }} data-kvar-fel="">
          <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.text2 }}>Kunde inte hämta laserdatan just nu.</p>
          <button type="button" onClick={ladda} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      </Sektion>
    );
  }
  const s = lage.s;
  if (s.lage === 'saknas') {
    return (
      <Sektion rubrik={RUBRIK} inset>
        <Text attr={{ 'data-kvar': 'saknas' }}>Skogsstyrelsen har ingen laserdata för hela trakten, så det går inte att räkna.</Text>
      </Sektion>
    );
  }
  if (s.lage === 'skannad-efter') {
    return (
      <Sektion rubrik={RUBRIK} inset>
        <Text attr={{ 'data-kvar': 'skannad-efter' }}>
          Trakten laserskannades {s.skanningAr}, efter att skördaren började. Skanningen visar inte skogen före gallringen.
        </Text>
      </Sektion>
    );
  }
  if (s.lage === 'stammer-inte') {
    return (
      <Sektion rubrik={RUBRIK} inset>
        <Text attr={{ 'data-kvar': 'stammer-inte' }}>
          Skördaren tog ut mer än laserdatan säger att det stod där. Skogen har troligen ändrats sedan skanningen,
          så det går inte att räkna.
        </Text>
      </Sektion>
    );
  }

  const fore = avr1(s.fore);
  const uttag = avr1(s.uttag);
  const kvar = avr1(fore - uttag);
  const lag = Math.floor(s.kvarLag);
  const hog = Math.ceil(s.kvarHog);
  const skanning = s.skanningFran === s.skanningTill ? `${s.skanningFran}` : `${s.skanningFran}–${s.skanningTill}`;
  const ar = Math.round(s.ar);
  // Skanningsåret och spannet står i raderna — noten säger bara varifrån de kommer, en gång.
  const not = [
    `Före är Skogsstyrelsens laserskanning, uppräknad ${ar} år med ca ${Math.round(TILLVAXT.mitt * 100)} % tillväxt per år`
      + ` (${Math.round(TILLVAXT.lag * 100)}–${Math.round(TILLVAXT.hog * 100)} % ger spannet under Kvar).`,
    'Uttaget mätte skördaren.',
    s.efterRaknasInte > 0 ? `${s.efterRaknasInte} rutor skannades efter gallringen och räknas inte.` : null,
  ].filter(Boolean).join(' ');

  return (
    <Sektion rubrik={RUBRIK} not={not} inset>
      <div data-kvar="ok">
        <Rad titel="Före" hoger={`ca ${fmtDecimal(fore, 1)} m²/ha`} under={`Laserskanning ${skanning}`} />
        <Rad titel="Uttaget" hoger={`${fmtDecimal(uttag, 1)} m²/ha`} under={`${pct(s.uttagAndel)} av grundytan`} />
        <Rad titel="Kvar" hoger={`ca ${fmtDecimal(kvar, 1)} m²/ha`} hogerUnder={`troligen ${lag}–${hog}`} sista
          attr={{ 'data-kvar-tal': fmtDecimal(kvar, 1) }} />
      </div>
    </Sektion>
  );
}
