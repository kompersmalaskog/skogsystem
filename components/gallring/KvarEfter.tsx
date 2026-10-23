'use client';
// Hur mycket står kvar? — svaret är det som står KVAR efter gallringen (Martin 2026-10-22: "man vill ju veta hur mycket
// som står kvar"), först i stammar per hektar, sedan i grundyta. Under varje kvar-tal står före och uttaget, så kvar
// går att kontrollräkna: kvar = (avrundat före) − (avrundat uttag), aldrig en egen avrundning av det oavrundade talet.
// Före = Skogsstyrelsens laserdata (grundytan uppräknad till dagen skördaren började; stammarna vid skanningen),
// uttaget = skördaren. Talen och reglerna bor i lib/laserKvar.ts; här ritas de bara.
// "ca" och spannet står alltid vid före och kvar: de är uppräknade, inte mätta. Uttaget är en mätning och står utan.
// Laserdatan läses efter per hektar och fäller aldrig trakten: ett fel här är ett fel med Försök igen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import { fmtAntal, fmtDecimal } from '@/lib/gallring';
import { beraknaKvar, provpunkter, TILLVAXT, type KvarSvar, type LaserRuta } from '@/lib/laserKvar';
import { hamtaLaserRutor } from '@/lib/laserGrundyta';
import type { GallradYta } from '@/lib/gallradYta';
import MallJamforelse from './MallJamforelse';

const RUBRIK_BAS = 'Hur mycket står kvar?';
const avr1 = (v: number) => Math.round(v * 10) / 10;

type Lage = { typ: 'laddar' } | { typ: 'fel'; text: string } | { typ: 'klar'; s: KvarSvar };

function Text({ children, attr }: { children: React.ReactNode; attr?: Record<string, string> }) {
  return <p style={{ margin: 0, padding: `${AVSTAND.l}px 0`, ...TYP.text, color: FARG.text2 }} {...attr}>{children}</p>;
}

export default function KvarEfter({ yta, uttagPerHa, uttagStammarPerHa, skordStart, innehaller, delNamn, tradslag, gallring }: {
  yta: GallradYta;
  /** Uttagets trädslag (volym) — avgör om gran- eller tallmallen gäller ("Låg gallringen rätt?"). */
  tradslag?: { namn: string; volym: number }[];
  /** Känd gallring (trakten delad), annars null. */
  gallring?: 1 | 2 | null;
  /** En del av den gallrade ytan (första eller andra gallring) — laserdatan läses bara där. Annars hela ytan. */
  innehaller?: (lng: number, lat: number) => boolean;
  /** "Första gallring" — står i rubriken när talen gäller en del. */
  delNamn?: string;
  uttagPerHa: number;
  /** Skördarens uttagna stammar per hektar på samma yta. */
  uttagStammarPerHa: number;
  /** Första dagen skördaren körde, "YYYY-MM-DD". */
  skordStart: string;
}) {
  const [lage, setLage] = useState<Lage>({ typ: 'laddar' });
  // Laserrutorna per yta, så ett byte mellan första och andra gallring och tillbaka inte hämtar igen.
  const cache = useRef(new Map<unknown, LaserRuta[]>());
  const omrade = innehaller ?? yta.innehaller;
  const ladda = useCallback(async () => {
    const sparad = cache.current.get(omrade);
    if (!sparad) setLage({ typ: 'laddar' });
    try {
      const rutor = sparad ?? await hamtaLaserRutor(provpunkter(yta.karta.lnglat, omrade));
      cache.current.set(omrade, rutor);
      setLage({ typ: 'klar', s: beraknaKvar({ rutor, uttagPerHa, uttagStammarPerHa, skordStart }) });
    } catch (e) {
      setLage({ typ: 'fel', text: e instanceof Error ? e.message : 'Laserdatan gick inte att hämta.' });
    }
  }, [yta, omrade, uttagPerHa, uttagStammarPerHa, skordStart]);
  useEffect(() => { ladda(); }, [ladda]);
  const RUBRIK = delNamn ? `${RUBRIK_BAS} · ${delNamn}` : RUBRIK_BAS;

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
  // Stammar: före avrundas till tiotal (det är en uppskattning), uttaget till hela stammar som i "Hur hårt gallrades det?".
  const st = s.stammar;
  const stFore = st ? Math.round(st.fore / 10) * 10 : 0;
  const stUttag = st ? Math.round(st.uttag) : 0;
  const stKvar = stFore - stUttag;
  // Skanningsåret och spannet står i raderna — noten säger bara varifrån talen kommer, en gång.
  const not = [
    st ? 'Stammarna före är räknade ur laserns grundyta och medeldiameter vid skanningen och blir hellre för få än för'
      + ' många – lasern ser inte de minsta träden.' : 'Stammarna före går inte att räkna ur laserdatan för den här trakten.',
    `Grundytan före är uppräknad ${ar} år med ca ${Math.round(TILLVAXT.mitt * 100)} % tillväxt per år`
      + ` (${Math.round(TILLVAXT.lag * 100)}–${Math.round(TILLVAXT.hog * 100)} % ger spannet).`,
    'Uttaget mätte skördaren.',
    s.efterRaknasInte > 0 ? `${s.efterRaknasInte} rutor skannades efter gallringen och räknas inte.` : null,
  ].filter(Boolean).join(' ');

  return (
    <>
    <Sektion rubrik={RUBRIK} not={not} inset>
      <div data-kvar="ok">
        {st && (
          <Rad titel="Stammar kvar" hoger={`ca ${fmtAntal(stKvar)} st/ha`}
            under={`före ca ${fmtAntal(stFore)} · uttaget ${fmtAntal(stUttag)}`}
            attr={{ 'data-kvar-stammar': String(stKvar) }} />
        )}
        <Rad titel="Grundyta kvar" hoger={`ca ${fmtDecimal(kvar, 1)} m²/ha`} hogerUnder={`troligen ${lag}–${hog}`}
          under={`före ca ${fmtDecimal(fore, 1)} · uttaget ${fmtDecimal(uttag, 1)} · skannad ${skanning}`}
          sista attr={{ 'data-kvar-tal': fmtDecimal(kvar, 1) }} />
      </div>
    </Sektion>
    {tradslag && <MallJamforelse s={s} tradslag={tradslag} gallring={gallring ?? null} stammarKvar={st ? stKvar : null} />}
    </>
  );
}
