'use client';
// Låg gallringen rätt? — svaret först (inom/hårdare/svagare än Vidas mall), sedan talen bakom: kvar mot mallen,
// om beståndet gallrades i tid, stammar kvar mot Martins tumregel, höjden. En skala: före, kvar och mallens fält.
// Talen och reglerna bor i lib/gallringsmall.ts och lib/laserKvar.ts; här ritas de bara.
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import { fmtAntal, fmtDecimal } from '@/lib/gallring';
import {
  TUMREGEL_STAMMAR, bedomMall, mallNamn, mallTradslag,
  type MallSvar, type Utfall,
} from '@/lib/gallringsmall';
import { HOJD_TILLVAXT, type KvarSvar } from '@/lib/laserKvar';

const RUBRIK = 'Låg gallringen rätt?';

const SVAR: Record<Utfall, string> = {
  'inom': 'Ja, inom Vidas mall',
  'troligen-inom': 'Troligen inom Vidas mall',
  'hardare': 'Hårdare än Vidas mall',
  'troligen-hardare': 'Troligen hårdare än Vidas mall',
  'svagare': 'Svagare än Vidas mall',
  'troligen-svagare': 'Troligen svagare än Vidas mall',
};
const TID = { 'i-tid': 'I tid', tidigt: 'Tidigt', sent: 'Sent' } as const;
const TRADSLAG_ORD = { gran: 'gran', tall: 'tall' } as const;

function Text({ children, attr }: { children: React.ReactNode; attr?: Record<string, string> }) {
  return <p style={{ margin: 0, padding: `${AVSTAND.l}px 0`, ...TYP.text, color: FARG.text2 }} {...attr}>{children}</p>;
}

const tal = (v: number) => fmtDecimal(Math.round(v * 10) / 10, 1);
const heltal = (lag: number, hog: number) => (Math.round(lag) === Math.round(hog) ? `${Math.round(lag)}` : `${Math.round(lag)}–${Math.round(hog)}`);

export default function MallJamforelse({ s, tradslag, gallring, stammarKvar }: {
  /** Svaret ur "Hur mycket står kvar?" — samma yta, samma uttag. */
  s: Extract<KvarSvar, { lage: 'ok' }>;
  /** Uttagets trädslag (volym). */
  tradslag: { namn: string; volym: number }[];
  /** Känd gallring (trakten delad i första/andra), annars null. */
  gallring: 1 | 2 | null;
  /** Stammar kvar per hektar (som raden i "Hur mycket står kvar?"), null = okänt. */
  stammarKvar: number | null;
}) {
  const tr = mallTradslag(tradslag);
  if (!s.hojd) {
    return (
      <Sektion rubrik={RUBRIK} inset>
        <Text attr={{ 'data-mall': 'ingen-hojd' }}>Höjden gick inte att läsa ur laserdatan, så trakten kan inte jämföras med gallringsmallen.</Text>
      </Sektion>
    );
  }
  if (!tr) {
    return (
      <Sektion rubrik={RUBRIK} inset>
        <Text attr={{ 'data-mall': 'blandat' }}>Uttaget är blandat. Vidas mallar gäller bestånd med mest gran eller mest tall.</Text>
      </Sektion>
    );
  }
  const svar = bedomMall({
    tradslag: tr.tradslag,
    hojd: s.hojd,
    fore: { mitt: s.fore, lag: s.foreLag, hog: s.foreHog },
    kvar: { mitt: s.kvar, lag: s.kvarLag, hog: s.kvarHog },
    gallring,
  });
  if (svar.lage === 'utanfor') {
    return (
      <Sektion rubrik={RUBRIK} inset>
        <Text attr={{ 'data-mall': 'utanfor' }}>
          Höjden ca {Math.round(svar.hojd)} m ligger utanför Vidas mallar för {TRADSLAG_ORD[svar.tradslag]} ({Math.round(svar.minH)}–{Math.round(svar.maxH)} m).
        </Text>
      </Sektion>
    );
  }

  const avvikelse = !svar.utfall.endsWith('inom');
  const tumregel = TUMREGEL_STAMMAR[svar.gallring];
  const ordning = svar.gallring === 1 ? 'första' : 'andra';
  const not = [
    `Bonitet går inte att hämta, så trakten jämförs med Vidas mallar som gallrar vid samma höjd (${mallNamn(svar.mallar)}). Rätt = mellan hård och svag gallring.`,
    `Höjden är laserns övre höjd, uppräknad ${fmtDecimal(HOJD_TILLVAXT.mitt, 1)} m per år till dagen skördaren började.`,
    'Mallarna är avlästa ur Vidas häfte.',
  ].join(' ');

  return (
    <Sektion rubrik={RUBRIK} not={not} inset>
      <div data-mall={svar.utfall}>
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: `${AVSTAND.l}px 0 ${AVSTAND.s}px` }}>
          {avvikelse && <Ikon namn="warning" farg={FARG.orange} />}
          <span style={{ ...TYP.rubrik, color: FARG.text }} data-mall-svar="">{SVAR[svar.utfall]}</span>
        </div>
        <MallSkala svar={svar} />
        <Rad titel="Kvar efter" hoger={`ca ${tal(svar.kvar.mitt)} m²/ha`} hogerUnder={`troligen ${tal(svar.kvar.lag)}–${tal(svar.kvar.hog)}`}
          under={`Vidas mall ${heltal(svar.efter.lag, svar.efter.hog)} (grönt) efter ${ordning} gallringen`}
          attr={{ 'data-mall-kvar': '' }} />
        <Rad titel="Gallrades i tid?" hoger={TID[svar.tid]}
          under={`Före ca ${tal(svar.fore.mitt)} m²/ha · mallen gallrar vid ${heltal(svar.gallraVid.lag, svar.gallraVid.hog)}`}
          attr={{ 'data-mall-tid': svar.tid }} />
        {stammarKvar !== null && (
          <Rad titel="Stammar kvar" hoger={`ca ${fmtAntal(stammarKvar)} st/ha`}
            under={`Tumregel ${fmtAntal(tumregel[0])}–${fmtAntal(tumregel[1])} efter ${svar.gallring === 1 ? 'första' : 'sista'} gallringen`}
            attr={{ 'data-mall-stammar': '' }} />
        )}
        <Rad titel="Höjd" hoger={`ca ${Math.round(svar.hojd)} m`} hogerUnder={Math.round(s.hojd.lag) !== Math.round(s.hojd.hog) ? `troligen ${heltal(s.hojd.lag, s.hojd.hog)}` : undefined}
          under={`Övre höjd · ${TRADSLAG_ORD[svar.tradslag]} ${Math.round(tr.andel * 100)} % av uttaget`} sista />
      </div>
    </Sektion>
  );
}

// ---------------------------------------------------------------------------
// Skalan: grundytan på en linje. Det gröna fältet är Vidas mall efter gallringen (hård–svag), ringen är före,
// pricken kvar. En fråga, ett tal att jämföra — inget diagram att läsa av.
// ---------------------------------------------------------------------------

const B = 320, H = 64, KANT = 12, Y = 32;

function MallSkala({ svar }: { svar: Extract<MallSvar, { lage: 'ok' }> }) {
  const lag = Math.floor(Math.min(svar.efter.lag, svar.kvar.mitt) - 3);
  const hog = Math.ceil(Math.max(svar.efter.hog, svar.fore.mitt) + 3);
  const x = (g: number) => KANT + ((g - lag) / (hog - lag)) * (B - 2 * KANT);
  const inom = svar.utfall.endsWith('inom');
  return (
    <svg viewBox={`0 0 ${B} ${H}`} width="100%" role="img" style={{ display: 'block', margin: `${AVSTAND.s}px 0` }}
      aria-label={`Före ${tal(svar.fore.mitt)}, kvar ${tal(svar.kvar.mitt)} m²/ha. Vidas mall ${heltal(svar.efter.lag, svar.efter.hog)}.`}>
      <line x1={KANT} x2={B - KANT} y1={Y} y2={Y} stroke={FARG.upphojt} strokeWidth={8} strokeLinecap="round" />
      <line x1={x(svar.efter.lag)} x2={x(svar.efter.hog)} y1={Y} y2={Y} stroke={FARG.gron} strokeOpacity={0.55} strokeWidth={8} />
      <text x={x(svar.fore.mitt)} y={Y - 14} textAnchor="middle" fontSize={13} fill={FARG.text2}>före</text>
      <circle cx={x(svar.fore.mitt)} cy={Y} r={6} fill={FARG.kort} stroke={FARG.text} strokeWidth={2} />
      <circle cx={x(svar.kvar.mitt)} cy={Y} r={6} fill={inom ? FARG.text : FARG.orange} stroke={FARG.kort} strokeWidth={2} />
      <text x={x(svar.kvar.mitt)} y={Y + 24} textAnchor="middle" fontSize={13} fill={FARG.text2}>kvar</text>
    </svg>
  );
}
