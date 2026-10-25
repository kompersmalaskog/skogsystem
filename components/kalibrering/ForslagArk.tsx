'use client';
// JUSTERINGSFÖRSLAG — detaljen bakom kortet "Gör så här": besked per punkt på diameterkurvan (100, 150, 200, 250, 300+), ett trädslag i taget.
// Varje punkt visar antalet stammar, medelfelet maskin − klave och osäkerheten som ETT streck (95 %-intervall för medelfelet, stammar som enhet), och
// beskedet i ord: Justera · Klava mer · Vänta · Låt vara — eller, när spridningen mellan stammar är stor, "Höj trycket" / "Trycket först".
// Förslaget är en ÄNDRING från maskinens nuvarande läge (HQC-filerna innehåller inte kurvan). Reglerna bor i lib/kalibrering/forslag.
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, RADIE } from '@/lib/design/tokens';
import { fmtDagMan } from '@/lib/kalibrering/datum';
import { FORSLAG, klassIOrd, type PunktBesked } from '@/lib/kalibrering/forslag';
import { mmMedTecken } from '@/lib/kalibrering/forslagMarkorer';
import type { ForslagResp } from '@/lib/kalibrering/typer';
import { Fyll, Meta, Status } from './delar';

/** Skalan på osäkerhetsstrecket, mm åt vardera hållet. Allt bortom klipps och får en pil. */
const SKALA_MM = 8;
const BREDD = 112;
const HOJD = 20;

const x = (mm: number): number => ((Math.max(-SKALA_MM, Math.min(SKALA_MM, mm)) + SKALA_MM) / (2 * SKALA_MM)) * BREDD;

/**
 * Osäkerheten som ETT streck per punkt: noll i mitten, bandet ±1,5 mm (inom det är det rätt), 95 %-intervallet som ett streck och medelfelet som en ring.
 * Obegränsat intervall (under två stammar) ritas ut till kanten på båda sidor. Det som sägs står i texten bredvid — strecket förstärker bara.
 */
export function Osakerhetsstreck({ p }: { p: PunktBesked }) {
  const lo = p.lo ?? -SKALA_MM, hi = p.hi ?? SKALA_MM;
  return (
    <svg width={BREDD} height={HOJD} viewBox={`0 0 ${BREDD} ${HOJD}`} role="img" data-testid="osakerhet"
      aria-label={`Medelfel ${mmMedTecken(Math.round(p.snittMm))} mm, osäkerhet ${p.lo == null ? 'obegränsad' : `${mmMedTecken(Math.round(lo))} till ${mmMedTecken(Math.round(hi))} mm`}`}>
      <rect x={x(-FORSLAG.TOLERANS_MM)} y={0} width={x(FORSLAG.TOLERANS_MM) - x(-FORSLAG.TOLERANS_MM)} height={HOJD} rx={RADIE.stapel} fill={FARG.fyllning} />
      <line x1={x(0)} y1={0} x2={x(0)} y2={HOJD} stroke={FARG.text3} strokeWidth={1} />
      <line x1={x(lo)} y1={HOJD / 2} x2={x(hi)} y2={HOJD / 2} stroke={FARG.text2} strokeWidth={2} strokeLinecap="round" />
      <circle cx={x(p.snittMm)} cy={HOJD / 2} r={4} fill={FARG.text} />
    </svg>
  );
}

const ORD: Record<PunktBesked['besked'], { ord: string; farg: string }> = {
  justera: { ord: 'Justera', farg: FARG.orange },
  klava: { ord: 'Klava mer', farg: FARG.text2 },
  vanta: { ord: 'Vänta', farg: FARG.text3 },
  latavara: { ord: 'Låt vara', farg: FARG.gron },
};

/** Ordet och pricken för en punkt. Spridning mellan stammar går före: då är det trycket, inte kurvan, som är fel. */
export function beskedOrd(p: PunktBesked): { ord: string; farg: string } {
  if (p.spak === 'bada') return { ord: 'Trycket först', farg: FARG.orange };
  if (p.spak === 'tryck') return { ord: 'Höj trycket', farg: FARG.orange };
  return ORD[p.besked];
}

const tal1 = (v: number): string => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',').replace('−', '-');
const medTecken1 = (v: number): string => (v > 0 ? '+' : v < 0 ? '−' : '') + tal1(Math.abs(v));

/** Raden under punkten: antalet stammar, medelfelet (+ = maskinen mäter grövre än klaven) och vad som ska göras — eller varför inte. */
export function punktRad(p: PunktBesked): string {
  const stammar = `${p.stammar} ${p.stammar === 1 ? 'stam' : 'stammar'}`;
  const fel = `${medTecken1(p.snittMm)}\u00a0mm`;
  if (p.spak === 'bada') return `${stammar} · ${fel} · spridning ${tal1(p.sdMm ?? 0)}\u00a0mm. Kurvan efter trycket.`;
  if (p.spak === 'tryck') return `${stammar} · ${fel} · spridning ${tal1(p.sdMm ?? 0)}\u00a0mm mellan stammar`;
  if (p.besked === 'justera' && p.andringMm != null) return `${stammar} · ${fel} · ${p.andringMm < 0 ? 'sänk' : 'höj'} ${Math.abs(p.andringMm)}\u00a0mm`;
  if (p.besked === 'klava') return `${stammar} · ${fel} · ${p.saknas} till behövs`;
  if (p.besked === 'vanta') return `${stammar} · ${fel} · för osäkert för att veta åt vilket håll`;
  return `${stammar} · ${fel} · ${p.stammar < FORSLAG.MIN_STAMMAR ? 'rätt än så länge' : 'rätt'}`;
}

/** "Räknat på stammar klavade sedan 18 jul" — varje trädslag har sitt eget fönster (en kalibrering av tall rör inte gran). */
export function sedanText(lista: PunktBesked[]): string {
  const dagar = Array.from(new Set(lista.map(p => p.fonsterFran))).sort();
  const fmt = (d: string) => fmtDagMan(d);
  return dagar.length === 1 ? `Räknat på stammar klavade sedan ${fmt(dagar[0])}.` : `Räknat på stammar klavade sedan ${fmt(dagar[0])}–${fmt(dagar[dagar.length - 1])}, olika per grovlek.`;
}

export default function ForslagArk({ f }: { f: ForslagResp }) {
  const arter = Array.from(new Set(f.punkter.map(p => p.tradslag)));
  return (
    <>
      <Meta>Bara stammar klavade efter senaste ändringen i maskinen räknas. Ändringen anges från maskinens nuvarande läge.</Meta>

      {arter.length === 0 && <Fyll><Meta>Inga klavade stammar att räkna på.</Meta></Fyll>}

      <div style={{ marginTop: AVSTAND.l }}>
        {arter.map(art => {
          const lista = f.punkter.filter(p => p.tradslag === art);
          return (
            <Sektion key={art} rubrik={art} kort={false} not={sedanText(lista)}>
              {lista.map((p, i) => {
                const b = beskedOrd(p);
                return (
                  <Rad key={p.klass} sista={i === lista.length - 1} pil={false}
                    titel={`${p.punkt} mm`} under={punktRad(p)}
                    hoger={<Status ljus farg={b.farg} ord={b.ord} />}
                    hogerUnder={<Osakerhetsstreck p={p} />} />
                );
              })}
            </Sektion>
          );
        })}
      </div>

      {f.grepp.length > 0 && (
        <Sektion rubrik="Greppet" kort={false}>
          {f.grepp.map((g, i) => (
            <Rad key={g.tradslag} sista={i === f.grepp.length - 1} pil={false} titel={g.tradslag}
              under={g.samma?.length ? `Greppet släpper oftare än förra månaden. Samma på ${g.samma.join(' och ')} – troligen kylan.` : 'Greppet släpper oftare än förra månaden — kolla knivar och valsar'} hoger={`${Math.round(g.fran)} → ${Math.round(g.till)} %`} />
          ))}
        </Sektion>
      )}

      <Meta style={{ marginTop: AVSTAND.l }}>
        Strecket är osäkerheten, pricken medelfelet och det mörka fältet ±{tal1(FORSLAG.TOLERANS_MM)}&nbsp;mm (rätt). + betyder att maskinen mäter grövre än klaven. Ligger hela strecket på ena sidan
        om mittlinjen är felet säkert.
      </Meta>
      <Meta style={{ marginTop: AVSTAND.s }}>
        Låt vara: felet är inom ±{tal1(FORSLAG.TOLERANS_MM)}&nbsp;mm. Vänta: osäkerheten korsar noll. Klava mer: samma håll men färre än {FORSLAG.MIN_STAMMAR} stammar. Justera: minst {FORSLAG.MIN_STAMMAR} stammar,
        hela osäkerheten på ena sidan och felet över {tal1(FORSLAG.TOLERANS_MM)}&nbsp;mm. Spridning över {tal1(FORSLAG.SPRIDNING_MM)}&nbsp;mm mellan stammar är trycket, inte kurvan.
        Grovlekarna: {klassIOrd('<150')}, 150–199, 200–249, 250–299 och 300&nbsp;mm och grövre.
      </Meta>
    </>
  );
}
