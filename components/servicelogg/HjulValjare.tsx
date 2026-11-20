'use client';

// Välj hjul på en bild av maskinen sedd ovanifrån, fronten uppåt (Martin 2026-10-21: "mer som en skotare").
// Band: en knapp per boggi (fram, bak) som täcker båda hjulen, båda sidorna samtidigt.
// Hjulen är knapparna — V1–V4 till vänster, H1–H4 till höger, sett från förarstolen, 1 längst fram.
// Kroppen är bara en ritning: främre ram med hytt, midjeled, bakre ram. En skotare får lastutrymmet
// (grind och bankar) bak, en skördare motorhuven. Ingen text i ritningen — orden står runt den.

import { FARG, RADIE, TNUM, TYP, VIKT, AVSTAND } from '@/lib/design/tokens';

const HJUL_B = 48;
const HJUL_H = 56;
const LUFT = 6; // mellan hjul och ram, och mellan hjulen i en boggi
const KROPP_B = 112;
const B = HJUL_B * 2 + LUFT * 2 + KROPP_B;

const Y1 = 36;
const Y2 = Y1 + HJUL_H + LUFT;
const FRAM_SLUT = Y2 + HJUL_H + 8;
const BAK_START = FRAM_SLUT + 18;
const Y3 = BAK_START + 8;
const Y4 = Y3 + HJUL_H + LUFT;
const H = Y4 + HJUL_H + 24;

const HJUL: readonly (readonly [string, number, 'v' | 'h'])[] = [
  ['V1', Y1, 'v'], ['H1', Y1, 'h'], ['V2', Y2, 'v'], ['H2', Y2, 'h'],
  ['V3', Y3, 'v'], ['H3', Y3, 'h'], ['V4', Y4, 'v'], ['H4', Y4, 'h'],
];
const SIDA = { v: 'vänster', h: 'höger' } as const;
const PLATS = ['fram, främst', 'fram, bakre', 'bak, främre', 'bak, bakerst'];

type Props =
  | { lage: 'hjul'; skotare: boolean; valt: string | null; onVal: (h: string | null) => void }
  /** Band sitter runt en hel boggi: ett tryck på fram eller bak väljer båda sidorna på den änden. */
  | { lage: 'band'; skotare: boolean; fram: boolean; bak: boolean; onBand: (ande: 'fram' | 'bak') => void };

const dack = (pa: boolean) => ({
  borderRadius: RADIE.knapp, border: 'none', cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
  ...TYP.listtitel, ...TNUM, fontWeight: pa ? VIKT.fet : VIKT.halvfet,
  background: pa ? FARG.text : FARG.bg,
  backgroundImage: pa ? 'none' : `repeating-linear-gradient(0deg, ${FARG.fyllning} 0 3px, transparent 3px 9px)`,
  color: pa ? FARG.bg : FARG.text,
  boxShadow: pa ? 'none' : `inset 0 0 0 1px ${FARG.fyllning}`,
} as const);

export function HjulValjare(props: Props) {
  const { skotare } = props;
  const kx = HJUL_B + LUFT; // kroppens vänsterkant
  return (
    <div>
      <div style={{ ...TYP.micro, color: FARG.text2, textAlign: 'center', marginBottom: AVSTAND.xs }}>Fram</div>
      <div style={{ position: 'relative', width: B, height: H, margin: '0 auto' }}>
        <svg width={B} height={H} viewBox={`0 0 ${B} ${H}`} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          {/* främre ram */}
          <rect x={kx + 6} y={8} width={KROPP_B - 12} height={FRAM_SLUT - 8} rx={14} fill={FARG.upphojt} />
          {/* hytt med vindruta fram */}
          <rect x={kx + 20} y={Y1 + 14} width={KROPP_B - 40} height={HJUL_H * 2 - 8} rx={10} fill={FARG.kort} />
          <rect x={kx + 26} y={Y1 + 20} width={KROPP_B - 52} height={12} rx={4} fill={FARG.text3} />
          {/* midjeled */}
          <rect x={kx + KROPP_B / 2 - 12} y={FRAM_SLUT - 6} width={24} height={BAK_START - FRAM_SLUT + 12} rx={4} fill={FARG.text3} />
          <circle cx={kx + KROPP_B / 2} cy={(FRAM_SLUT + BAK_START) / 2} r={5} fill={FARG.kort} />
          {/* bakre ram */}
          <rect x={kx + 6} y={BAK_START} width={KROPP_B - 12} height={H - 8 - BAK_START} rx={14} fill={FARG.upphojt} />
          {skotare ? (
            <>
              {/* lastgrind */}
              <rect x={kx} y={BAK_START + 4} width={KROPP_B} height={10} rx={3} fill={FARG.text3} />
              {/* bankar med stakar i ändarna */}
              {[Y3 + 30, Y4 + 6, Y4 + HJUL_H + 6].map(y => (
                <g key={y}>
                  <rect x={kx + 2} y={y} width={KROPP_B - 4} height={6} rx={3} fill={FARG.text3} />
                  <rect x={kx} y={y - 2} width={8} height={10} rx={2} fill={FARG.text2} />
                  <rect x={kx + KROPP_B - 8} y={y - 2} width={8} height={10} rx={2} fill={FARG.text2} />
                </g>
              ))}
            </>
          ) : (
            <>
              {/* motorhuv med galler bak */}
              <rect x={kx + 18} y={Y3 + 4} width={KROPP_B - 36} height={HJUL_H * 2 + 10} rx={10} fill={FARG.kort} />
              {[0, 1, 2, 3].map(i => (
                <rect key={i} x={kx + 28} y={Y4 + HJUL_H - 6 + i * 6} width={KROPP_B - 56} height={3} rx={1.5} fill={FARG.text3} />
              ))}
            </>
          )}
        </svg>

        {props.lage === 'hjul' ? HJUL.map(([h, y, sida], i) => {
          const pa = props.valt === h;
          return (
            <button key={h} type="button" aria-pressed={pa} title={`${SIDA[sida]} ${PLATS[Math.floor(i / 2)]}`}
              onClick={() => props.onVal(pa ? null : h)}
              style={{ position: 'absolute', top: y, left: sida === 'v' ? 0 : B - HJUL_B, width: HJUL_B, height: HJUL_H, ...dack(pa) }}>
              {h}
            </button>
          );
        }) : (['fram', 'bak'] as const).flatMap(ande => (['v', 'h'] as const).map(sida => {
          const pa = props[ande];
          // Bara vänstra sidan finns för skärmläsaren — båda sidorna gör samma sak.
          const tyst = sida === 'h';
          return (
            <button key={ande + sida} type="button" aria-pressed={pa} aria-hidden={tyst || undefined} tabIndex={tyst ? -1 : undefined}
              onClick={() => props.onBand(ande)}
              style={{ position: 'absolute', top: ande === 'fram' ? Y1 : Y3, left: sida === 'v' ? 0 : B - HJUL_B,
                width: HJUL_B, height: HJUL_H * 2 + LUFT, ...dack(pa), ...TYP.meta, fontWeight: VIKT.fet }}>
              {ande === 'fram' ? 'Fram' : 'Bak'}
            </button>
          );
        }))}
      </div>
      {props.lage === 'hjul' && <div style={{ display: 'flex', justifyContent: 'space-between', width: B, margin: '0 auto', marginTop: AVSTAND.xs, ...TYP.micro, color: FARG.text2 }}>
        <span style={{ width: HJUL_B, display: 'flex', justifyContent: 'center', whiteSpace: 'nowrap' }}>Vänster</span>
        <span style={{ width: HJUL_B, display: 'flex', justifyContent: 'center', whiteSpace: 'nowrap' }}>Höger</span>
      </div>}
    </div>
  );
}
