'use client';

import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { raderaVerifierat } from '@/lib/supabase-save';
import { C, ff } from './tema';
import { MANADSNAMN, arHelg, arRodDag, fmtPeriod, toISO } from './datum';
import { useSchemaData, type SchemaStopp } from './useSchemaData';
import StoppFormular from './StoppFormular';
import Toast from './Toast';

const NAMN_W = 110;   // fast namnkolumn — scrollar inte horisontellt
const COL_W = 34;     // dagkolumn
const FONSTER = 21;   // ~2 veckor framåt + lite bakåt
const PERSON_H = 36;
const MASKIN_H = 32;

const VECKOBOKSTAV = ['S', 'M', 'T', 'O', 'T', 'F', 'L']; // getDay()-index

const GRON = 'rgba(34,197,94,0.85)';
const ROD = 'rgba(220,38,38,0.85)';

function addDagar(d: Date, n: number): Date {
  const ny = new Date(d);
  ny.setDate(ny.getDate() + n);
  return ny;
}

/** Slår ihop sammanhängande täckta dagar till block: [{start, len}] */
function block(dagar: string[], tacker: (iso: string) => boolean): { start: number; len: number }[] {
  const ut: { start: number; len: number }[] = [];
  let i = 0;
  while (i < dagar.length) {
    if (!tacker(dagar[i])) { i++; continue; }
    const start = i;
    while (i < dagar.length && tacker(dagar[i])) i++;
    ut.push({ start, len: i - start });
  }
  return ut;
}

/**
 * "Schema" — delad lagöversikt med Excel-känsla. En rad per person (förnamn),
 * en rad per aktiv maskin. Grönt block = godkänd ledighet, rött = maskinstopp,
 * tomt = på jobbet. Dag-upplösning, horisontell scroll med fast namnkolumn.
 */
export default function SchemaVy({
  arGodkannare = false, egenMedarbetareId,
}: {
  arGodkannare?: boolean;
  egenMedarbetareId?: string;
}) {
  const { personer, ledigheter, maskiner, stopp, laddar, lasfel, hamtaOm } = useSchemaData();
  const [offset, setOffset] = useState(0); // dagar, i 7-dagars-steg
  const [stoppFormOppen, setStoppFormOppen] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const taBortStopp = async (s: SchemaStopp) => {
    const antal = s.maskin_ids.length;
    if (!window.confirm(`Ta bort stoppet ${fmtPeriod(s.fran_datum, s.till_datum)}? Det gäller ${antal} maskin${antal === 1 ? '' : 'er'}.`)) return;
    const res = await raderaVerifierat(supabase, 'stopp', { id: s.id });
    if (!res.ok) {
      setFel(res.fel);
      return;
    }
    hamtaOm(); // stopp_maskin kaskadar bort i databasen
  };

  const idagIso = toISO(new Date());
  const dagar = useMemo(() => {
    const start = addDagar(new Date(), -2 + offset);
    return Array.from({ length: FONSTER }, (_, i) => toISO(addDagar(start, i)));
  }, [offset]);

  const periodText = useMemo(() => {
    const f = dagar[0].split('-'), t = dagar[dagar.length - 1].split('-');
    const fm = MANADSNAMN[parseInt(f[1], 10) - 1].substring(0, 3);
    const tm = MANADSNAMN[parseInt(t[1], 10) - 1].substring(0, 3);
    return `${parseInt(f[2], 10)} ${fm} – ${parseInt(t[2], 10)} ${tm}`;
  }, [dagar]);

  const navKnapp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
    borderRadius: 10, minWidth: 34, height: 34, color: C.t2, padding: '0 10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: 15, fontFamily: ff,
  };

  const stickyCell = (h: number): React.CSSProperties => ({
    position: 'sticky', left: 0, zIndex: 2, width: NAMN_W, flexShrink: 0,
    height: h, display: 'flex', alignItems: 'center', padding: '0 10px',
    background: C.bg, borderRight: `1px solid ${C.borderStrong}`,
    boxSizing: 'border-box',
  });

  const dagBakgrund = (iso: string): string => {
    if (iso === idagIso) return 'rgba(59,130,246,0.10)';
    if (arHelg(iso) || arRodDag(iso)) return 'rgba(255,255,255,0.045)';
    return 'transparent';
  };

  const bakgrundOchBlock = (h: number, segs: { start: number; len: number }[], farg: string) => (
    <div style={{ position: 'relative', width: FONSTER * COL_W, height: h, flexShrink: 0 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        {dagar.map(iso => (
          <div key={iso} style={{
            width: COL_W, boxSizing: 'border-box',
            borderRight: '1px solid rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: dagBakgrund(iso),
          }} />
        ))}
      </div>
      {segs.map(s => (
        <div key={s.start} style={{
          position: 'absolute', top: 6, bottom: 6,
          left: s.start * COL_W + 2, width: s.len * COL_W - 4,
          background: farg, borderRadius: 5,
        }} />
      ))}
    </div>
  );

  if (lasfel) {
    return (
      <div style={{
        color: C.red, padding: 24, textAlign: 'center', fontSize: 13, fontFamily: ff,
        background: C.redDim, borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)',
      }}>
        {lasfel}
      </div>
    );
  }
  if (laddar) {
    return <div style={{ color: C.t3, padding: 40, textAlign: 'center', fontSize: 13, fontFamily: ff }}>Laddar...</div>;
  }

  return (
    <div style={{ fontFamily: ff }}>
      <Toast text={fel} onDold={() => setFel(null)} />

      {/* Navigering */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{periodText}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => setOffset(o => o - 7)} style={navKnapp}>‹</button>
          {offset !== 0 && (
            <button type="button" onClick={() => setOffset(0)} style={{ ...navKnapp, fontSize: 12, fontWeight: 600 }}>Idag</button>
          )}
          <button type="button" onClick={() => setOffset(o => o + 7)} style={navKnapp}>›</button>
        </div>
      </div>

      {/* Lägg till stopp — bara godkännare (RLS spärrar ändå skrivningen) */}
      {arGodkannare && (
        <button type="button" onClick={() => setStoppFormOppen(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          borderRadius: 10, border: 'none', marginBottom: 12,
          background: C.redDim, color: '#fca5a5', fontSize: 13, fontWeight: 600,
          fontFamily: ff, cursor: 'pointer',
        }}>
          + Lägg till stopp
        </button>
      )}

      {/* Tidslinjen — horisontell scroll, fast namnkolumn */}
      <div style={{
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface,
      }}>
        <div style={{ width: NAMN_W + FONSTER * COL_W }}>

          {/* Rubrikrad: veckodag + dagnummer (månadsbyte visar månad) */}
          <div style={{ display: 'flex' }}>
            <div style={{ ...stickyCell(40), background: C.surface }} />
            <div style={{ display: 'flex', width: FONSTER * COL_W, flexShrink: 0 }}>
              {dagar.map(iso => {
                const d = new Date(iso + 'T00:00:00');
                const helgdag = arHelg(iso) || arRodDag(iso);
                const arIdag = iso === idagIso;
                const forstaIManad = d.getDate() === 1;
                return (
                  <div key={iso} style={{
                    width: COL_W, height: 40, boxSizing: 'border-box',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    borderRight: '1px solid rgba(255,255,255,0.04)',
                    borderBottom: `1px solid ${C.border}`,
                    background: dagBakgrund(iso),
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: helgdag ? 'rgba(239,68,68,0.7)' : C.t4, textTransform: 'uppercase' }}>
                      {forstaIManad ? MANADSNAMN[d.getMonth()].substring(0, 3) : VECKOBOKSTAV[d.getDay()]}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: arIdag ? 700 : 500,
                      color: arIdag ? C.blue : helgdag ? 'rgba(239,68,68,0.7)' : C.t2,
                    }}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Personrader */}
          {personer.map(p => {
            const mina = ledigheter.filter(l => l.medarbetare_id === p.id);
            const segs = block(dagar, iso => mina.some(l => iso >= l.startdatum && iso <= l.slutdatum));
            return (
              <div key={p.id} style={{ display: 'flex' }}>
                <div style={stickyCell(PERSON_H)}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.fornamn}
                  </span>
                </div>
                {bakgrundOchBlock(PERSON_H, segs, GRON)}
              </div>
            );
          })}

          {/* Avdelare + maskinrader */}
          <div style={{ display: 'flex' }}>
            <div style={{ ...stickyCell(26), background: C.surface }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.t3 }}>
                Maskiner
              </span>
            </div>
            <div style={{ width: FONSTER * COL_W, height: 26, flexShrink: 0, background: C.surface, boxSizing: 'border-box', borderBottom: `1px solid ${C.border}` }} />
          </div>

          {maskiner.map(m => {
            const minaStopp = stopp.filter(s => s.maskin_ids.includes(m.maskin_id));
            return (
              <div key={m.maskin_id} style={{ display: 'flex' }}>
                <div style={stickyCell(MASKIN_H)}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.namn}
                  </span>
                </div>
                {/* Ett block per stopp (inte ihopslagen täckning) — så att
                    godkännare kan trycka på ett block och ta bort just det stoppet */}
                <div style={{ position: 'relative', width: FONSTER * COL_W, height: MASKIN_H, flexShrink: 0 }}>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
                    {dagar.map(iso => (
                      <div key={iso} style={{
                        width: COL_W, boxSizing: 'border-box',
                        borderRight: '1px solid rgba(255,255,255,0.04)',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: dagBakgrund(iso),
                      }} />
                    ))}
                  </div>
                  {minaStopp.map(s => {
                    const sIdx = dagar.findIndex(d => d >= s.fran_datum);
                    const eIdx = dagar.filter(d => d <= s.till_datum).length - 1;
                    if (sIdx === -1 || eIdx < sIdx) return null;
                    const stil: React.CSSProperties = {
                      position: 'absolute', top: 6, bottom: 6,
                      left: sIdx * COL_W + 2, width: (eIdx - sIdx + 1) * COL_W - 4,
                      background: ROD, borderRadius: 5,
                    };
                    return arGodkannare ? (
                      <button key={s.id} type="button"
                        title={`Ta bort: ${s.orsak}${s.kommentar ? ` — ${s.kommentar}` : ''}`}
                        onClick={() => taBortStopp(s)}
                        style={{ ...stil, border: 'none', cursor: 'pointer', padding: 0 }} />
                    ) : (
                      <div key={s.id} style={stil} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Teckenförklaring */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, padding: '0 4px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 8, borderRadius: 3, background: GRON, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: C.t3 }}>Ledig</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 8, borderRadius: 3, background: ROD, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: C.t3 }}>Maskinstopp</span>
        </span>
        <span style={{ fontSize: 11, color: C.t3 }}>Tomt = på jobbet</span>
        {arGodkannare && (
          <span style={{ fontSize: 11, color: C.t4 }}>Tryck på ett rött block för att ta bort stoppet</span>
        )}
      </div>

      {stoppFormOppen && egenMedarbetareId && (
        <StoppFormular
          maskiner={maskiner}
          egenMedarbetareId={egenMedarbetareId}
          onStang={() => setStoppFormOppen(false)}
          onSparad={() => { setStoppFormOppen(false); hamtaOm(); }}
        />
      )}
    </div>
  );
}
