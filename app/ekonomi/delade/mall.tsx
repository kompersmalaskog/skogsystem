'use client';

// Ekonomisektionens delade designmall — EN plats för sidram, periodväxlare,
// hero, metarad, listor och statuslägen. Vyerna får inte definiera egna
// varianter av det som finns här: två varianter driftar alltid isär.
//
// Stilarna kommer ur lib/design/tokens (skillen skogsystem-design) — inga
// literaler; design-lint räknar nya i varje PR. Bärande regler härifrån:
// - Radens TAL är radens huvudsak (TYP.rubrik + TNUM) med enhet PÅ raden —
//   läsbart på en sekund från hytt. Hero är vyns enda större tal (TYP.tal).
// - Färg är aldrig ensam bärare: signerade tal får alltid +/− i texten,
//   färgen förstärker bara. Orange = preliminärt/kalkyl, inget annat.
// - Mobilproportion även på desktop: maxbredd 400, centrerad.

import EkonomiBottomNav from '../EkonomiBottomNav';
import { type PeriodType, getPeriodLabel } from '@/lib/ekonomi/period';
import {
  FONT, TYP, TNUM, VIKT, AVSTAND, RADIE, FARG, KNAPP, TRAFFYTA, designCss,
} from '@/lib/design/tokens';

// Övergångsexporter: äldre flikar bygger rgba(`${GRON}`,x)-strängar av de
// här tripplarna. De pekar nu på tokens-nyanserna (FARG.gron/rod/orange)
// så hela sektionen byter till samma palett — nya anrop ska använda FARG
// direkt, och tripplarna försvinner när sista fliken är tokenstädad.
export const BARNSTEN = '255,159,10';  // FARG.orange
export const GRON = '48,209,88';       // FARG.gron
export const ROD = '255,69,58';        // FARG.rod
export const MAXBREDD = 400;

const HAIRLINE = `1px solid ${FARG.linje}`;

// ── Sidram ──────────────────────────────────────────────────────────────

export function EkonomiSida({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: FARG.bg, minHeight: '100vh', color: FARG.text, fontFamily: FONT,
      paddingTop: AVSTAND.xl, paddingBottom: AVSTAND.xxl * 4,
    }}>
      <style>{designCss}</style>
      <div style={{ maxWidth: MAXBREDD, margin: '0 auto' }}>
        {children}
      </div>
      <EkonomiBottomNav />
    </div>
  );
}

// ── Periodväxlare ───────────────────────────────────────────────────────
// Avskalad: bara text, aktiv period understruken. Ingen ruta, ingen bakgrund.

const PERIOD_NAMN: Record<PeriodType, string> = { D: 'Dag', V: 'Vecka', M: 'Månad', K: 'Kvartal', A: 'År' };

export function Periodvaxlare({ perioder, period, offset, onPeriod, onOffset, onInfo }: {
  perioder: PeriodType[];
  period: PeriodType;
  offset: number;
  onPeriod: (p: PeriodType) => void;
  onOffset: (nyOffset: number) => void;
  onInfo?: () => void;
}) {
  const textKnapp: React.CSSProperties = {
    border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
    minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.xs}px`,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: `0 ${AVSTAND.sidmarginal}px`, gap: AVSTAND.m }}>
      {perioder.map(p => {
        const aktiv = p === period;
        return (
          <button key={p} onClick={() => onPeriod(p)} style={{
            ...textKnapp, ...TYP.meta, fontWeight: VIKT.halvfet,
            color: aktiv ? FARG.text : FARG.text2,
            boxShadow: aktiv ? `inset 0 -2px 0 ${FARG.text}` : 'none',
          }}>{PERIOD_NAMN[p]}</button>
        );
      })}
      <div style={{ flex: 1 }} />
      <button aria-label="Föregående period" onClick={() => onOffset(offset - 1)}
        style={{ ...textKnapp, ...TYP.text, color: FARG.text2 }}>&#8249;</button>
      <span style={{ ...TYP.meta, fontWeight: VIKT.halvfet, color: FARG.text, minWidth: AVSTAND.xxl * 3, textAlign: 'center' }}>
        {getPeriodLabel(period, offset)}
      </span>
      <button aria-label="Nästa period" onClick={() => onOffset(offset + 1)}
        style={{ ...textKnapp, ...TYP.text, color: FARG.text2 }}>&#8250;</button>
      {onInfo && (
        <button aria-label="Om beräkningen" onClick={onInfo} style={{
          width: TRAFFYTA.min, height: TRAFFYTA.min, borderRadius: RADIE.cirkel, flexShrink: 0,
          background: FARG.fyllning, border: 'none', color: FARG.text2,
          ...TYP.meta, fontWeight: VIKT.halvfet, cursor: 'pointer', fontFamily: 'inherit',
          fontStyle: 'italic', lineHeight: 1,
        }}>i</button>
      )}
    </div>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────
// Vyns huvudsiffra (TYP.tal — en per vy). Vitt för magnituder, grönt/rött
// BARA för signerade tal, och då bär texten alltid +/− själv.

export function Hero({ etikett, varde, vardeFarg = FARG.text, storlek, under }: {
  etikett: string;
  varde: string;
  vardeFarg?: string;
  /** Avvikande talstorlek — undvik; TYP.tal är linjen. */
  storlek?: number;
  under?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: 'center', padding: `${AVSTAND.xxl + AVSTAND.xl}px ${AVSTAND.sidmarginal}px ${AVSTAND.s}px` }}>
      <div style={{ ...TYP.micro, color: FARG.text2 }}>{etikett}</div>
      <div style={{ ...TYP.tal, ...(storlek ? { fontSize: storlek } : null), color: vardeFarg, marginTop: AVSTAND.m }}>
        {varde}
      </div>
      {under}
    </div>
  );
}

// ── Metarad ─────────────────────────────────────────────────────────────
// Stöd, inte huvudsak — rejält dämpad (tertiär) så den aldrig drar blick
// från svaret. Segment separeras med "·"; orange = preliminärt/kalkyl.

export type MetaDel = { text: string; barnsten?: boolean };

export function MetaRad({ delar }: { delar: (MetaDel | null | false | undefined)[] }) {
  const synliga = delar.filter(Boolean) as MetaDel[];
  if (synliga.length === 0) return null;
  return (
    <div style={{ textAlign: 'center', ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.m, padding: `0 ${AVSTAND.sidmarginal}px`, lineHeight: 1.6 }}>
      {synliga.map((d, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          <span style={d.barnsten ? { color: FARG.orange } : undefined}>{d.text}</span>
        </span>
      ))}
    </div>
  );
}

// ── Lista & rader ───────────────────────────────────────────────────────

export function SektionsTitel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.m, marginTop: AVSTAND.sektion, padding: `0 ${AVSTAND.xs}px` }}>
      {children}
    </div>
  );
}

export function Lista({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `0 ${AVSTAND.sidmarginal}px`, ...style }}>
      {children}
    </div>
  );
}

// EN historia per rad: namn + dämpad detaljrad till vänster, radens TAL
// till höger — talet är radens huvudsak (TYP.rubrik + TNUM, läsbart från
// hytt) med enheten PÅ raden (`enhet`), aldrig bara i en fot. Stapel
// (andel 0–1) ritas på RADENS fulla bredd — jämförbar mellan rader.
// `children` är uppfällt innehåll (renderas när `oppen`).
export function ListRad({ rubrik, rubrikFarg = FARG.text, detalj, tal, talFarg = FARG.text, enhet, undertal, stapelAndel, chevron, oppen, onClick, sista, children }: {
  rubrik: React.ReactNode;
  rubrikFarg?: string;
  detalj?: React.ReactNode;
  tal?: React.ReactNode;
  talFarg?: string;
  /** Enheten intill talet ("kr/m³") — raden ska vara självförklarande. */
  enhet?: string;
  undertal?: React.ReactNode;
  stapelAndel?: number | null;
  chevron?: boolean;
  oppen?: boolean;
  onClick?: () => void;
  sista?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ padding: `${AVSTAND.l}px 0`, borderBottom: sista ? 'none' : HAIRLINE }}>
      <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYP.listtitel, color: rubrikFarg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rubrik}
            </div>
            {detalj != null && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{detalj}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, flexShrink: 0 }}>
            {tal != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...TYP.rubrik, ...TNUM, color: talFarg }}>
                  {tal}
                  {enhet && <span style={{ ...TYP.meta, color: FARG.text2, marginLeft: AVSTAND.xs }}>{enhet}</span>}
                </div>
                {undertal != null && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{undertal}</div>}
              </div>
            )}
            {chevron && (
              <span style={{ ...TYP.meta, color: FARG.text2, transform: oppen ? 'rotate(90deg)' : 'none' }}>›</span>
            )}
          </div>
        </div>
        {stapelAndel != null && (
          <div style={{ marginTop: AVSTAND.s, height: AVSTAND.xs, borderRadius: RADIE.stapel, width: `${Math.max(0, Math.min(1, stapelAndel)) * 100}%`, background: FARG.fyllning }} />
        )}
      </div>
      {oppen && children != null && (
        <div style={{ marginTop: AVSTAND.m, paddingTop: AVSTAND.m, borderTop: HAIRLINE, display: 'grid', gap: AVSTAND.s }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Fot under en lista — stödtext. Enheten på själva talen bär raden;
// foten är bara för förklaringar som gäller hela listan.
export function EnhetsFot({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...TYP.meta, color: FARG.text3, textAlign: 'center', marginTop: AVSTAND.m, padding: `0 ${AVSTAND.sidmarginal}px` }}>
      {children}
    </div>
  );
}

// ── Statuslägen — laddar / fel / ärligt tomt ────────────────────────────

export function Laddar() {
  return <div style={{ textAlign: 'center', padding: AVSTAND.xxl, ...TYP.meta, color: FARG.text2 }}>Laddar ekonomidata…</div>;
}

export function FelRuta({ titel, fel, onRetry }: { titel: string; fel: string; onRetry: () => void }) {
  return (
    <div style={{ margin: AVSTAND.sidmarginal, padding: AVSTAND.l, background: FARG.kort, borderRadius: RADIE.kort }}>
      <div style={{ ...TYP.listtitel, color: FARG.rod, marginBottom: AVSTAND.xs }}>{titel}</div>
      <div style={{ ...TYP.meta, color: FARG.text2 }}>{fel}</div>
      <button onClick={onRetry} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>
        Försök igen
      </button>
    </div>
  );
}

export function Tomt({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: `${AVSTAND.xxl + AVSTAND.xl}px ${AVSTAND.sidmarginal}px ${AVSTAND.s}px` }}>
      <div style={{ ...TYP.meta, color: FARG.text2 }}>{children}</div>
    </div>
  );
}
