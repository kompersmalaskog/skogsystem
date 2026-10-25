'use client';

// "VAD GER DET?" — överst på Räkna. En rad per medelstam (slutavverkning, Vidas trakter): vad varje sortiment blir.
// Med traktens volym ifylld står kubik, annars procent. Ett tryck på en rad öppnar medelstamssidan på just den medelstammen
// (spann, trakterna, rötan). Räkningen är lib/medelstam/tabell.ts — samma utfall() som medelstamssidan.
//
// Ärligt underlag: under 3 trakter i fönstret står inget tal ("för få trakter"), 3–5 trakter står talen dämpade och "osäkert".

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, KORT, RADIE, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import { Etikett, nf, nf0, Fel } from '@/components/Ytform';
import { sortimentFarg } from '@/components/Sortimentstapel';
import { SORTIMENT, type Sortiment } from '@/lib/medelstam/berakna';
import { lasMedelstamUnderlag, type MedelstamUnderlag, type LasFel } from '@/lib/medelstam/las';
import { medelstamTabell } from '@/lib/medelstam/tabell';

const KORT_NAMN: Record<Sortiment, string> = { timmer: 'Timmer', kubb: 'Kubb', massa: 'Massa', ovrigt: 'Övrigt' };
const VOLYM_NYCKEL = 'rakna_volym_v1';
const KOLUMN_MS = 76;   // medelstamskolumnen; sortimenten delar resten lika

function lasVolym(): string { try { return localStorage.getItem(VOLYM_NYCKEL) ?? ''; } catch { return ''; } }
function sparaVolym(v: string) { try { localStorage.setItem(VOLYM_NYCKEL, v); } catch { /* privat läge */ } }
/** "800", "1 200", "1200,5" → tal; tomt eller ogiltigt → null. */
export function tolkaVolym(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}

const rutnat = { display: 'grid', gridTemplateColumns: `${KOLUMN_MS}px repeat(4, 1fr)`, alignItems: 'center', columnGap: AVSTAND.xs } as const;

export default function VadGerDet({ underlag }: { underlag?: MedelstamUnderlag }) {
  const router = useRouter();
  const [d, setD] = useState<MedelstamUnderlag | null>(underlag ?? null);
  const [fel, setFel] = useState<LasFel | null>(null);
  const [volymText, setVolymText] = useState('');

  async function hamta() {
    setFel(null);
    const res = await lasMedelstamUnderlag();
    if (res.ok) setD(res.d); else setFel(res.fel);
  }
  useEffect(() => { setVolymText(lasVolym()); if (!underlag) hamta(); }, [underlag]);

  const volym = tolkaVolym(volymText);
  const rader = useMemo(() => (d ? medelstamTabell(d.alla, d.meta, d.rotLasbar, volym) : []), [d, volym]);

  return (
    <>
      <Etikett>Vad ger det? · slutavverkning</Etikett>
      <div style={{ ...KORT, margin: `0 ${AVSTAND.l}px` }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
          <span style={{ ...TYP.text }}>Traktens volym</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
            <input value={volymText} inputMode="decimal" placeholder="valfri" aria-label="Traktens volym i kubikmeter"
              onFocus={e => e.target.select()}
              onChange={e => { setVolymText(e.target.value); sparaVolym(e.target.value); }}
              style={{ width: 96, boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.knapp,
                       border: 'none', outline: 'none', background: FARG.upphojt, color: FARG.text, fontFamily: 'inherit',
                       ...TYP.listtitel, ...TNUM, textAlign: 'right' }} />
            <span style={{ ...TYP.meta, color: FARG.text2 }}>m³fub</span>
          </span>
        </label>

        {!d && !fel && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.m }}>Hämtar utfallet…</div>}

        {d && (
          <div style={{ marginTop: AVSTAND.m }}>
            <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s }}>
              {volym != null ? `Kubik av ${nf0(volym)} m³fub` : 'Procent av volymen — skriv en volym för kubik'}
            </div>
            {/* Rubrikraden: färgen bär aldrig ensam — prick + ord. */}
            <div style={{ ...rutnat, ...TYP.meta, color: FARG.text2, paddingBottom: AVSTAND.s }}>
              <span>Medelstam</span>
              {SORTIMENT.map(s => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: AVSTAND.xs }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: sortimentFarg(s), flexShrink: 0,
                                             boxShadow: `0 0 0 1px ${FARG.linje}` }} />
                  {KORT_NAMN[s]}
                </span>
              ))}
            </div>
            {rader.map(r => (
              <button key={r.m} disabled={r.forFa}
                onClick={() => router.push(`/affarsuppfoljning/medelstam?ms=${nf(r.m, 2)}`)}
                aria-label={r.forFa ? `Medelstam ${nf(r.m, 2)}: för få trakter` : `Medelstam ${nf(r.m, 2)}: ${SORTIMENT.map(s => `${KORT_NAMN[s]} ${r.m3 ? nf0(r.m3[s]) + ' kubik' : (r.procent?.[s] ?? 0) + ' procent'}`).join(', ')}, ${r.n} trakter`}
                style={{ ...rutnat, width: '100%', minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px 0`, background: 'none', border: 'none',
                         borderTop: `1px solid ${FARG.linje}`, fontFamily: 'inherit', color: FARG.text, textAlign: 'left',
                         cursor: r.forFa ? 'default' : 'pointer' }}>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ ...TYP.listtitel, ...TNUM, color: r.forFa ? FARG.text3 : FARG.text }}>{nf(r.m, 2)}</span>
                  <span style={{ ...TYP.meta, color: r.osaker ? FARG.orange : FARG.text3, whiteSpace: 'nowrap' }}>
                    {r.n} {r.n === 1 ? 'trakt' : 'trakter'}
                  </span>
                  {r.osaker && <span style={{ ...TYP.meta, color: FARG.orange }}>osäkert</span>}
                </span>
                {r.forFa ? (
                  <span style={{ gridColumn: '2 / span 4', textAlign: 'right', ...TYP.meta, color: FARG.text3 }}>för få trakter</span>
                ) : SORTIMENT.map(s => (
                  <span key={s} style={{ textAlign: 'right', ...TYP.text, ...TNUM, fontWeight: s === 'timmer' ? VIKT.halvfet : VIKT.normal,
                                         color: r.osaker || s === 'ovrigt' ? FARG.text2 : FARG.text }}>
                    {r.m3 ? nf0(r.m3[s]) : r.procent ? `${r.procent[s]} %` : '–'}
                  </span>
                ))}
              </button>
            ))}
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>
              Vidas slutavverkningar inom ±15 % av medelstammen. Fingervisning, inte facit — tryck på en rad för spannet och trakterna.
            </div>
          </div>
        )}
      </div>
      {fel && <Fel rubrik="Utfallet kunde inte hämtas" fel={fel} igen={hamta} />}
    </>
  );
}
