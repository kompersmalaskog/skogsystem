'use client';
// ÖVER TID — "Blir det bättre?" Tre flikar (Martin 2026-11-25; förut fem) med ett tidssteg (Månad · Kvartal · År) som gäller alla:
// Kurvor (träffen och spridningen över tid, åtgärderna som lodräta streck), Per grovlek (var sitter felen? — rutnät grovlek × månad mot klaven,
// och under det Frost: hur maskinen mäter när det fryser) och Greppet (släpper det oftare? — maskinens egna stamprofiler, alla stammar).
// "Träffprocent nu, per grovlek" är borttagen här: det som gäller NU står på Läget (Var sitter felet?). Talen är desamma som förut.
import { useEffect } from 'react';
import Flikkontroll from '@/components/design/Flikkontroll';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import { AVSTAND, FARG, KNAPP, TNUM, TYP } from '@/lib/design/tokens';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import type { KalibreringVy, TidMatt } from '@/lib/hooks/useKalibreringVy';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import {
  flaxSlutsats, fmtPeriod, perioderAv, periodKey, spridSerier, spridYMax, traffSerier, type LagetSteg,
} from '@/lib/kalibrering/diagnos';
import { fmtKrav } from '@/lib/kalibrering/format';
import { MATT } from '@/lib/kalibrering/ordlista';
import type { DiagnosResp } from '@/lib/kalibrering/typer';
import { Fyll, Lugn, Meta, Prick, Status } from './delar';
import AtgarderSektion from './AtgarderSektion';
import FrostVinkel from './FrostVinkel';
import GreppVinkel from './GreppVinkel';
import GrovlekVinkel from './GrovlekVinkel';
import Rubrik from './Rubrik';
import StabilitetTabell from './StabilitetTabell';
import TidsDiagram, { MARKOR_FARG } from './TidsDiagram';

const MATT_FLIKAR: readonly (readonly [TidMatt, string])[] = [['kurvor', 'Kurvor'], ['grovlek', 'Per grovlek'], ['grepp', 'Greppet']];
const STEG: readonly (readonly [LagetSteg, string])[] = [['manad', 'Månad'], ['kvartal', 'Kvartal'], ['ar', 'År']];

/** Vad de lodräta strecken i kurvorna betyder — bara de sorter som finns. Färgen bär aldrig ensam: ordet står bredvid. */
function MarkorForklaring({ diag }: { diag: DiagnosResp }) {
  const finns = (k: 'atgard' | 'reparation') => diag.markorer.some(m => m.kalla === k);
  if (!diag.markorer.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.l, marginTop: AVSTAND.s }}>
      {finns('atgard') && <Status farg={MARKOR_FARG.atgard} ord="Lodrätt streck = åtgärd" />}
      {finns('reparation') && <Status farg={MARKOR_FARG.reparation} ord="Lodrätt streck = reparation av mätsystemet" />}
    </div>
  );
}

function Traff({ d, v, diag }: { d: KalibreringData; v: KalibreringVy; diag: DiagnosResp }) {
  const kl = diag.klasser;
  if (!kl.some(k => k.traffMonthly.length)) return null;
  const traff = traffSerier(kl, v.lagetSteg);
  return (
    <div className="kal-rutnat">
      <Sektion rubrik="Träffprocent per grovlek" not={`Klena träffar bra; grova släpar — en enda kurva döljer det.${diag.golvDia != null ? ` Kravlinjen är ${diag.profil}s golv.` : ''}`}>
        <Fyll>
          <TidsDiagram manader={perioderAv(traff)} series={traff} yMax={100} markorer={diag.markorer}
            fmtX={m => fmtPeriod(m, v.lagetSteg)} markorKey={dat => periodKey(dat.slice(0, 7), v.lagetSteg)}
            kravLinje={diag.golvDia != null ? { v: diag.golvDia, label: `golv ${diag.golvDia}%` } : undefined} />
          <MarkorForklaring diag={diag} />
        </Fyll>
      </Sektion>

      {kl.some(k => k.systMonthly.length > 0) && (
        <Sektion rubrik={`${MATT.systematisk.fraga} Per grovlek och månad`} not="Hur många mm maskinen mäter fel åt ett håll. Byter talet mellan plus och minus ligger felet i greppet, ligger det still ligger det i kalibreringen.">
          <Fyll><StabilitetTabell klasser={kl} /></Fyll>
        </Sektion>
      )}
    </div>
  );
}

function Sprid({ d, v, diag }: { d: KalibreringData; v: KalibreringVy; diag: DiagnosResp }) {
  const { bedomning } = d;
  if (!diag.klasser.some(k => k.spridMonthly.length)) return null;
  const stdRow = bedomning?.trosklar.find(t => t.variabel === 'diameter' && t.metrik === 'standardavv');
  const systRow = bedomning?.trosklar.find(t => t.variabel === 'diameter' && t.metrik === 'systematisk');
  const stdGolv = stdRow ? Number(stdRow.golv) : null;
  const systMal = systRow ? Number(systRow.mal) : null;
  const sprid = spridSerier(diag.klasser, v.lagetSteg);
  const slutsats = flaxSlutsats(diag.klasser, stdGolv, systMal);
  const spark = (punkter: string, farg: string) => (
    <svg viewBox="0 0 90 26" aria-hidden="true" style={{ width: 64, height: 18, flexShrink: 0 }}>
      <polyline points={punkter} fill="none" stroke={farg} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
  return (
    <div className="kal-rutnat">
      <Sektion rubrik={MATT.standardavv.fraga} not={`Hur mycket mätningarna skiljer sig från varandra.${stdGolv != null ? ` ${diag.profil} vill att det håller sig under ${fmtKrav(stdGolv)} mm.` : ''}`}>
        <Fyll>
          <TidsDiagram manader={perioderAv(sprid)} series={sprid} yMax={spridYMax(stdGolv)} markorer={diag.markorer}
            kravBand={stdGolv != null ? { till: stdGolv, label: `krav under ${fmtKrav(stdGolv)} mm` } : undefined} riktning="↓ lägre = bättre"
            fmtX={m => fmtPeriod(m, v.lagetSteg)} markorKey={dat => periodKey(dat.slice(0, 7), v.lagetSteg)} />
          <MarkorForklaring diag={diag} />
        </Fyll>
      </Sektion>

      <Sektion rubrik="Vad säger kurvan?">
        <Fyll>
          {/* Lär dig läsa kurvan — syntetisk jämförelse, inte data */}
          <div style={{ display: 'flex', gap: AVSTAND.l, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
              {spark('2,13 12,12 22,14 32,13 42,12 52,14 62,13 72,12 82,13', FARG.text2)}<span>jämn — mäter lika varje gång</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
              {spark('2,4 12,22 22,6 32,20 42,3 52,23 62,7 72,21 82,5', FARG.rod)}<span>flaxar — hoppar fram och tillbaka</span>
            </div>
          </div>
          {/* Slutsats — uträknad ur datan, inte gissad */}
          <div style={{ marginTop: AVSTAND.l, paddingTop: AVSTAND.m, borderTop: `1px solid ${FARG.linje}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.listtitel, color: slutsats.status === 'flaxar' ? FARG.text : FARG.text2 }}>
              {slutsats.status === 'flaxar' && <Prick ton="hot" />}<span>{slutsats.rubrik}</span>
            </div>
            {slutsats.atgard && <div style={{ ...TYP.text, color: slutsats.status === 'flaxar' ? FARG.text : FARG.text2, marginTop: AVSTAND.xs }}>{slutsats.atgard}</div>}
            {slutsats.tillagg && <Meta style={{ marginTop: AVSTAND.s, ...TNUM }}>{slutsats.tillagg}</Meta>}
          </div>
        </Fyll>
      </Sektion>
    </div>
  );
}

export default function OverTidFlik({ d, v, ark }: { d: KalibreringData; v: KalibreringVy; ark: KalibreringArk }) {
  const diag = d.diagnosData;
  const { effektiv, laddaGrovlek, laddaGrepp } = d;
  // Per grovlek och Greppet hämtar sitt eget underlag när vinkeln öppnas (en gång per maskin) — de hänger inte på diagnosen.
  useEffect(() => { if (effektiv && v.tidMatt === 'grovlek') laddaGrovlek(effektiv); }, [effektiv, v.tidMatt, laddaGrovlek]);
  useEffect(() => { if (effektiv && v.tidMatt === 'grepp') void laddaGrepp(effektiv); }, [effektiv, v.tidMatt, laddaGrepp]);
  const kurva = v.tidMatt === 'kurvor';
  return (
    <>
      <Rubrik d={d} fraga="Blir det bättre?" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, marginBottom: AVSTAND.xl }}>
        <Flikkontroll flikar={MATT_FLIKAR} aktiv={v.tidMatt} onVal={v.setTidMatt} />
        <Flikkontroll flikar={STEG} aktiv={v.lagetSteg} onVal={v.setLagetSteg} />
      </div>
      {kurva && !diag ? (
        d.diagnosFel
          ? (
            <>
              <Svarsrad rubrik="Kurvorna kunde inte läsas" rad="Kontrollerna finns kvar. Försök igen om en stund." fri avvikelse />
              <button type="button" onClick={d.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
            </>
          )
          : <Lugn ikon="hourglass_empty" marginTop={0}>Läser kurvorna…</Lugn>
      ) : (
        <Tillstand nyckel={v.tidMatt}>
          {v.tidMatt === 'kurvor' && diag && (
            diag.klasser.some(k => k.traffMonthly.length || k.spridMonthly.length)
              ? <><Traff d={d} v={v} diag={diag} /><Sprid d={d} v={v} diag={diag} /></>
              : <Fyll><Lugn marginTop={0}>Inget underlag ännu.</Lugn></Fyll>
          )}
          {v.tidMatt === 'grovlek' && <><GrovlekVinkel d={d} v={v} ark={ark} /><FrostVinkel maskin={effektiv} /></>}
          {v.tidMatt === 'grepp' && <GreppVinkel d={d} v={v} />}
        </Tillstand>
      )}
      {/* Åtgärderna under kurvorna: där syns om de hjälpte. Kräver Läget-bedömningen (före → efter räknas där). */}
      {d.bedomning && <AtgarderSektion d={d} ark={ark} />}
    </>
  );
}
