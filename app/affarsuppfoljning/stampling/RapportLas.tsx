'use client';

// STÄMPLINGSRAPPORT SOM PDF — ladda upp, låt AI:n läsa, kontrollera med vanlig kod.
//
// Flödet (spec): PDF → Claude läser (trädslag, diameterklass, antal, volym m3sk, rapportens egna summor) → koden
// summerar raderna och jämför mot de tryckta summorna per trädslag, på antal OCH volym.
//   Stämmer allt  → modellen räknar direkt (anvand()).
//   Avviker något → ÅTGÄRD BEHÖVS med trädslag och differens. Användaren rättar enskilda rader här; kontrollen körs om
//                   vid varje tryck; "Räkna med rapporten" är spärrad tills det stämmer. Ingenting räknas vidare förut.
// Uppgifterna om posten (namn, förrättare, datum, total volym) står överst. Manuell inmatning finns kvar som reserv.
//
// Kontrollen bor i lib/stampling/pdf/kontroll.ts och körs på samma sätt här (live) som på servern (vid sparande).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DAMPAD, TEXT, LINJE, GUL, GRON, TAL, nf0,
         Tillbakarad, Damp, Mening, Rad, Rader, Laddar, Pil } from '@/components/Ytform';
import { kontrollera, stammerRader, slagTyp, SLAGTYP_NAMN, type Kontroll } from '@/lib/stampling/pdf/kontroll';
import { tal, type Lasning } from '@/lib/stampling/pdf/rapport';
import { laddaUppOchLas, listaRapporter, hamtaRapport, rattaRapport, type Rapport } from '@/lib/stampling/pdf/klient';

const ROD = 'rgba(255,120,110,0.95)';
const INPUT = { boxSizing: 'border-box' as const, background: 'rgba(255,255,255,0.04)', border: LINJE, borderRadius: 8, color: TEXT,
                fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 16, padding: '8px 8px', minHeight: 44, outline: 'none', width: '100%' };

type RadText = { d: string; a: string; v: string };
type TabellText = { namn: string; rader: RadText[]; tryktAntal: number | null; tryktVolym: number | null };
const STATUS_ORD: Record<string, string> = { stammer: 'stämmer', avviker: 'åtgärd behövs', fel: 'misslyckades', lasning: 'läses', uppladdad: 'ej läst' };
const fmt0 = nf0;

const tillText = (l: Lasning): TabellText[] => l.tradslag.map(t => ({
  namn: t.namn, tryktAntal: t.tryckt_antal, tryktVolym: t.tryckt_volym_m3sk,
  rader: t.klasser.map(k => ({ d: String(k.diameter_cm), a: String(k.antal), v: k.volym_m3sk == null ? '' : String(k.volym_m3sk) })),
}));

/** Texten i fälten → en Lasning kontrollen kan köra på. Rader med oläsligt tal räknas inte (och markeras i fältet). */
function tillLasning(grund: Lasning, tabeller: TabellText[]): Lasning {
  return {
    ...grund,
    tradslag: tabeller.map(t => ({
      namn: t.namn.trim() || 'Namnlöst', tryckt_antal: t.tryktAntal, tryckt_volym_m3sk: t.tryktVolym,
      klasser: t.rader.flatMap(r => {
        const d = tal(r.d), a = tal(r.a);
        return d == null || a == null || a < 0 ? [] : [{ diameter_cm: d, antal: Math.round(a), volym_m3sk: r.v.trim() === '' ? null : tal(r.v) }];
      }),
    })),
  };
}

function PostRuta({ r, l }: { r: Rapport | null; l: Lasning }) {
  const p = l.post;
  const meta = [p.forrattare, p.datum, p.total_volym_m3sk != null ? `${fmt0(p.total_volym_m3sk)} m³sk` : null].filter(Boolean).join(' · ');
  return (
    <div style={{ margin: '4px 16px 0', paddingBottom: 12, borderBottom: LINJE }}>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{p.namn ?? p.fastighet ?? r?.filnamn ?? 'Stämplingsrapport'}</div>
      {meta && <div style={{ fontSize: 12, color: DAMPAD, lineHeight: 1.6 }}>{meta}</div>}
    </div>
  );
}

function Atgardsruta({ k }: { k: Kontroll }) {
  if (k.klart || !k.atgard.length) return null;
  return (
    <div role="alert" style={{ margin: '14px 16px 0', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,120,110,0.35)', background: 'rgba(255,120,110,0.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: ROD }}>Åtgärd behövs</div>
      {k.atgard.map((a, i) => <div key={i} style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>{a.text}</div>)}
    </div>
  );
}

function Tabell({ i, t, k, uppdatera, tabort, oppen, vaxla }: {
  i: number; t: TabellText; k: Kontroll['tradslag'][number] | undefined;
  uppdatera: (f: (t: TabellText) => TabellText) => void; tabort: () => void; oppen: boolean; vaxla: () => void;
}) {
  const typ = slagTyp(t.namn);
  const ok = k?.ok !== false && typ !== 'okand';
  return (
    <div style={{ margin: '14px 16px 0', borderTop: LINJE, paddingTop: 10 }}>
      <button onClick={vaxla} aria-expanded={oppen} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44,
        border: 'none', background: 'none', color: 'inherit', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{t.namn || 'Namnlöst'}{k && !k.iModellen && typ !== 'okand' ? <span style={{ fontWeight: 400, color: DAMPAD }}> · räknas inte</span> : null}</span>
        <span style={{ fontSize: 12, color: ok ? GRON : ROD, display: 'inline-flex', alignItems: 'center' }}>{ok ? 'stämmer' : 'avviker'}{oppen ? <Pil storlek={13} vanster={6} /> : <span style={{ color: DAMPAD, marginLeft: 6 }}>›</span>}</span>
      </button>
      {oppen && (
        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'block', fontSize: 11, color: DAMPAD, marginBottom: 4 }}>Trädslag (som i rapporten)</label>
          <input value={t.namn} onChange={e => uppdatera(x => ({ ...x, namn: e.target.value }))} aria-label={`Trädslag ${i + 1}`} style={{ ...INPUT, fontFamily: 'inherit' }} />
          {typ === 'okand' && <button onClick={tabort} style={{ marginTop: 8, border: 'none', background: 'none', color: ROD, fontFamily: 'inherit', fontSize: 12, minHeight: 36, cursor: 'pointer', padding: 0 }}>Ta bort trädslaget</button>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 44px', gap: 6, marginTop: 12, fontSize: 11, color: DAMPAD }}>
            <span>Diameter, cm</span><span>Antal</span><span>Volym m³sk</span><span />
          </div>
          {t.rader.map((r, j) => {
            const d = tal(r.d), a = tal(r.a);
            const misstankt = k?.misstankta.includes(d ?? -1);
            const fel = d == null || a == null;
            return (
              <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 44px', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <input value={r.d} inputMode="decimal" aria-label={`${t.namn} diameter rad ${j + 1}`} style={{ ...INPUT, borderColor: fel ? ROD : undefined }}
                  onChange={e => uppdatera(x => ({ ...x, rader: x.rader.map((q, n) => (n === j ? { ...q, d: e.target.value } : q)) }))} />
                <input value={r.a} inputMode="numeric" aria-label={`${t.namn} antal rad ${j + 1}`} style={{ ...INPUT, borderColor: fel ? ROD : misstankt ? 'rgba(255,179,64,0.7)' : undefined }}
                  onChange={e => uppdatera(x => ({ ...x, rader: x.rader.map((q, n) => (n === j ? { ...q, a: e.target.value } : q)) }))} />
                <input value={r.v} inputMode="decimal" aria-label={`${t.namn} volym rad ${j + 1}`} style={{ ...INPUT, borderColor: misstankt ? 'rgba(255,179,64,0.7)' : undefined }}
                  onChange={e => uppdatera(x => ({ ...x, rader: x.rader.map((q, n) => (n === j ? { ...q, v: e.target.value } : q)) }))} />
                <button onClick={() => uppdatera(x => ({ ...x, rader: x.rader.filter((_, n) => n !== j) }))} aria-label={`Ta bort rad ${j + 1}`}
                  style={{ border: 'none', background: 'none', color: DAMPAD, fontSize: 20, minHeight: 44, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                {misstankt && <div style={{ gridColumn: '1 / -1', fontSize: 11, color: GUL, lineHeight: 1.4 }}>kontrollera mot rapporten</div>}
              </div>
            );
          })}
          <button onClick={() => uppdatera(x => ({ ...x, rader: [...x.rader, { d: '', a: '', v: '' }] }))}
            style={{ marginTop: 10, border: 'none', background: 'none', color: TEXT, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, minHeight: 44, cursor: 'pointer', padding: 0 }}>+ Lägg till rad</button>
        </div>
      )}
    </div>
  );
}

export default function RapportLas({ bas, id, oppna, anvand, manuellt, saRaknas }: {
  bas: string; id: string | null; oppna: (id: string | null) => void; anvand: (r: Rapport, l: Lasning) => void; manuellt: () => void; saRaknas: () => void;
}) {
  const [fas, setFas] = useState<'vilar' | 'laddar-upp' | 'laser' | 'hamtar'>('hamtar');
  const [fel, setFel] = useState<string | null>(null);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [lista, setLista] = useState<Rapport[]>([]);
  const [tabeller, setTabeller] = useState<TabellText[]>([]);
  const [oppnade, setOppnade] = useState<Set<number>>(new Set());
  const [sparar, setSparar] = useState(false);
  const valjFil = useRef<HTMLInputElement>(null);
  const grund = useRef<Lasning | null>(null);
  const senaste = useRef<string | null>(null);        // id på rapporten som redan visas — hindrar dubbel hämtning när adressen byts

  const visa = useCallback((r: Rapport, tillampa: boolean) => {
    senaste.current = r.id;
    setRapport(r); setFel(null);
    if (r.lasning) {
      grund.current = r.lasning;
      setTabeller(tillText(r.lasning));
      const forsta = (r.kontroll?.tradslag ?? []).find(t => !t.ok);
      setOppnade(new Set(forsta ? [forsta.index] : []));   // bara det första avvikande trädslaget öppet från start — ÅTGÄRD BEHÖVS säger vilka fler som avviker
      if (tillampa && r.kontroll?.klart) anvand(r, r.lasning);                                    // stämmer allt: räkna direkt
    }
    setFas('vilar');
  }, [anvand]);

  useEffect(() => { listaRapporter().then(setLista); }, [rapport]);
  useEffect(() => {
    if (!id) { senaste.current = null; setRapport(null); setFas('vilar'); return; }
    if (senaste.current === id) { setFas('vilar'); return; }
    let avbruten = false;
    setFas('hamtar');
    hamtaRapport(id).then(res => {
      if (avbruten) return;
      if (res.ok) visa(res.rapport, false); else { setFel(res.fel); setFas('vilar'); }
    });
    return () => { avbruten = true; };
  }, [id, visa]);

  const lasning = useMemo(() => (grund.current ? tillLasning(grund.current, tabeller) : null), [tabeller, rapport]);
  const kontroll = useMemo(() => (lasning ? kontrollera(lasning) : null), [lasning]);

  async function valdFil(f: File | null | undefined) {
    if (!f) return;
    setFel(null); setRapport(null);
    const res = await laddaUppOchLas(f, s => setFas(s));
    if (valjFil.current) valjFil.current.value = '';
    if (!res.ok) { setFel(res.fel); setFas('vilar'); return; }
    oppna(res.rapport.id);                         // adressen följer med (laddar om via id-effekten)
    visa(res.rapport, true);
  }

  async function raknaMed() {
    if (!rapport || !lasning || !kontroll?.klart) return;
    setSparar(true);
    const res = await rattaRapport(rapport.id, lasning);            // servern kontrollerar om med samma kod och sparar rättningen
    setSparar(false);
    if (!res.ok) { setFel(res.fel); return; }
    if (!res.rapport.kontroll?.klart) { setFel('Servern kontrollerade om rapporten och den stämmer inte — ladda om sidan och försök igen.'); return; }
    anvand(res.rapport, res.rapport.lasning as Lasning);
  }

  // ── Läser ────────────────────────────────────────────────────────────
  if (fas === 'laddar-upp' || fas === 'laser') {
    return (
      <>
        <Tillbakarad href={bas} text="Utbyte" />
        <div style={{ padding: '24px 16px', lineHeight: 1.6 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{fas === 'laddar-upp' ? 'Laddar upp rapporten…' : 'Läser rapporten…'}</div>
          <Damp>{fas === 'laser' ? 'Kan ta en minut — stäng inte sidan.' : 'Filen skickas till lagringen.'}</Damp>
        </div>
      </>
    );
  }
  if (fas === 'hamtar') return <><Tillbakarad href={bas} text="Utbyte" /><Laddar vad="rapporten" /></>;

  // ── Resultat: överst posten, sedan om det stämmer eller inte ─────────────
  if (rapport && rapport.lasning && lasning && kontroll) {
    const antalTrad = kontroll.tradslag.filter(t => t.iModellen).reduce((s, t) => s + t.summaAntal, 0);
    return (
      <>
        <Tillbakarad href={bas} text="Utbyte" />
        <PostRuta r={rapport} l={rapport.lasning} />
        <div style={{ padding: '14px 16px 0' }}>
          {kontroll.klart ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ ...TAL, fontSize: 48, lineHeight: 1.05, fontWeight: 500 }}>{fmt0(antalTrad)}</span>
                <span style={{ ...TAL, fontSize: 18, color: DAMPAD }}>träd</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: GRON }}>Alla summor stämmer mot rapporten</div>
              {stammerRader(kontroll).map((s, i) => <Damp key={i}>{s}</Damp>)}
            </>
          ) : (
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>{fmt0(antalTrad)} träd inlästa — <span style={{ color: ROD }}>summorna stämmer inte</span></div>
          )}
        </div>
        <Atgardsruta k={kontroll} />
        {kontroll.klart && kontroll.tradslag.some(t => t.misstankta.length) && (
          <Mening>Summorna stämmer, men {kontroll.tradslag.filter(t => t.misstankta.length).map(t => `${t.namn} ${t.misstankta.join(', ')} cm`).join(' och ')} ser konstiga ut (volym per träd lägre än i klassen under). Kontrollera dem mot rapporten.</Mening>
        )}
        {kontroll.ejIModellen.length > 0 && <div style={{ margin: '10px 16px 0', fontSize: 12, color: DAMPAD, lineHeight: 1.6 }}>{kontroll.ejIModellen.map((t, i) => <div key={i}>{t}</div>)}</div>}
        {kontroll.varningar.length > 0 && <div style={{ margin: '10px 16px 0', fontSize: 12, color: GUL, lineHeight: 1.6 }}>{kontroll.varningar.map((t, i) => <div key={i}>{t}</div>)}</div>}
        {fel && <div role="alert" style={{ margin: '10px 16px 0', fontSize: 13, color: ROD, lineHeight: 1.5 }}>{fel}</div>}

        <Rader>
          <Rad text={sparar ? 'Sparar…' : 'Räkna med rapporten'} onClick={kontroll.klart && !sparar ? raknaMed : undefined} dampad={!kontroll.klart} />
        </Rader>

        <div style={{ margin: '8px 0 0' }}>
          {tabeller.map((t, i) => (
            <Tabell key={i} i={i} t={t} k={kontroll.tradslag[i]} oppen={oppnade.has(i)}
              vaxla={() => setOppnade(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
              uppdatera={f => setTabeller(ts => ts.map((x, n) => (n === i ? f(x) : x)))}
              tabort={() => { setTabeller(ts => ts.filter((_, n) => n !== i)); setOppnade(new Set()); }} />
          ))}
        </div>
        <Rader>
          <Rad text="Ny rapport" onClick={() => { oppna(null); setRapport(null); }} dampad />
          <Rad text="Mata in" onClick={manuellt} dampad />
          <Rad text="Så räknas" onClick={saRaknas} />
        </Rader>
      </>
    );
  }

  // ── Vilar: välj PDF, tidigare rapporter, reservingång ─────────────────────
  return (
    <>
      <Tillbakarad href={bas} text="Utbyte" />
      <div style={{ margin: '0 16px', fontSize: 15, fontWeight: 600 }}>Stämplingsrapport</div>
      <input ref={valjFil} type="file" accept="application/pdf,.pdf" hidden onChange={e => valdFil(e.target.files?.[0])} />
      <Rader>
        <Rad text="Välj PDF" onClick={() => valjFil.current?.click()} />
      </Rader>
      {fel && (
        <div role="alert" style={{ margin: '14px 16px 0', padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,120,110,0.35)', background: 'rgba(255,120,110,0.06)' }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{fel}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: DAMPAD }}>Försök igen, eller mata in stämplingslängden för hand.</div>
        </div>
      )}
      {lista.length > 0 && (
        <>
          <div style={{ margin: '20px 16px 0', fontSize: 13, fontWeight: 600 }}>Tidigare rapporter</div>
          <Rader>
            {lista.map(r => (
              <Rad key={r.id} text={r.namn ?? r.filnamn} tal={STATUS_ORD[r.status]} farg={r.status === 'stammer' ? GRON : r.status === 'avviker' ? GUL : undefined}
                hoger={r.datum ?? new Date(r.skapad).toLocaleDateString('sv-SE')}
                sub={[r.forrattare, r.total_volym_m3sk != null ? `${fmt0(r.total_volym_m3sk)} m³sk` : null].filter(Boolean).join(' · ') || undefined}
                onClick={async () => { setFas('hamtar'); const res = await hamtaRapport(r.id); if (res.ok) { oppna(r.id); visa(res.rapport, true); } else { setFel(res.fel); setFas('vilar'); } }} />
            ))}
          </Rader>
        </>
      )}
      <Rader>
        <Rad text="Mata in" onClick={manuellt} dampad />
        <Rad text="Så räknas" onClick={saRaknas} />
      </Rader>
    </>
  );
}
